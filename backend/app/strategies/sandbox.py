"""
Run user-written Python strategies in an isolated child process.

The user's code defines ``strategy(df)`` and returns ``(entry, exit)`` or
``(entry, exit, size)``. It runs in a separate interpreter with a stripped
environment, restricted builtins, an import allowlist, AST checks, a timeout and
(on POSIX) memory/CPU/file-size/process limits. Only plain JSON and raw float
bytes come back, so nothing the child produces is ever executed by the parent.
"""

from __future__ import annotations

import base64
import hashlib
import json
import os
import subprocess
import sys
import tempfile
from collections import OrderedDict
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import pandas as pd

from app.config import get_settings
from app.strategies.sandbox_runner import check_code

RUNNER = Path(__file__).with_name("sandbox_runner.py")
TIMEOUT_SECONDS = 20.0
CACHE_SIZE = 256
COLUMNS = ("open", "high", "low", "close", "volume")

TEMPLATE = '''# EMA 20/50 trend with ATR volatility targeting
import numpy as np
import pandas as pd

# df: pandas DataFrame with columns date, open, high, low, close, volume.
# Return boolean Series: entry, exit and optionally size (0..1 of equity per entry).
# Helpers: ta.sma, ta.ema, ta.rsi, ta.atr, ta.macd, ta.bollinger, ta.vwap, ta.obv,
#          ta.stochastic, ta.adx, ta.donchian
# Signals at bar t may use only bars <= t; orders fill at the next open.

def strategy(df):
    close = df["close"]
    fast = ta.ema(close, 20)
    slow = ta.ema(close, 50)
    trend_up = fast > slow

    entry = trend_up & ~trend_up.shift(1, fill_value=False)
    exit = ~trend_up

    # Volatility targeting: risk less when ATR is high.
    atr_pct = ta.atr(df, 14) / close
    size = (0.02 / atr_pct).clip(0.1, 1.0)
    return entry, exit, size
'''


class SandboxError(ValueError):
    """User code failed validation, raised, timed out, or returned bad output."""


@dataclass(frozen=True)
class CustomSignals:
    entry: np.ndarray
    exit: np.ndarray
    size: np.ndarray | None


_cache: OrderedDict[str, CustomSignals] = OrderedDict()


def validate_code(code: str) -> list[str]:
    return check_code(code or "")


def _encode_frame(df: pd.DataFrame) -> dict[str, object]:
    cols = {
        col: base64.b64encode(np.ascontiguousarray(df[col].to_numpy(dtype=np.float64)).tobytes()).decode()
        for col in COLUMNS
    }
    dates = pd.to_datetime(df["date"]).to_numpy(dtype="datetime64[ns]").astype(np.int64)
    return {"cols": cols, "date": base64.b64encode(dates.tobytes()).decode()}


def _key(code: str, frame: dict[str, object], check_lookahead: bool) -> str:
    digest = hashlib.sha256(code.encode())
    digest.update(json.dumps(frame, sort_keys=True).encode())
    digest.update(b"L" if check_lookahead else b"-")
    return digest.hexdigest()


def _child_env() -> dict[str, str]:
    keep = ("SYSTEMROOT", "WINDIR", "PATH", "TEMP", "TMP", "LANG", "LC_ALL")
    env = {k: os.environ[k] for k in keep if k in os.environ}
    env.update(
        {
            "PYTHONIOENCODING": "utf-8",
            "PYTHONDONTWRITEBYTECODE": "1",
            "OPENBLAS_NUM_THREADS": "1",
            "OMP_NUM_THREADS": "1",
            "MKL_NUM_THREADS": "1",
        }
    )
    return env


def _spawn(request: dict[str, object], timeout: float) -> dict[str, object]:
    with tempfile.TemporaryDirectory(prefix="quantify-sandbox-") as workdir:
        try:
            proc = subprocess.run(
                [sys.executable, "-I", "-B", str(RUNNER)],
                input=json.dumps(request),
                capture_output=True,
                text=True,
                encoding="utf-8",
                timeout=timeout,
                cwd=workdir,
                env=_child_env(),
                check=False,
            )
        except subprocess.TimeoutExpired as exc:
            raise SandboxError(f"Strategy code took longer than {timeout:.0f}s and was stopped.") from exc
    if not proc.stdout.strip():
        tail = (proc.stderr or "").strip().splitlines()[-1:] or ["no output"]
        raise SandboxError(f"Strategy process crashed: {tail[0]}")
    try:
        response = json.loads(proc.stdout)
    except json.JSONDecodeError as exc:
        raise SandboxError("Strategy process returned unreadable output.") from exc
    if not isinstance(response, dict) or not response.get("ok"):
        raise SandboxError(str(response.get("error") if isinstance(response, dict) else "Strategy failed."))
    return response


def _decode(item: dict[str, object], n: int) -> CustomSignals:
    entry_raw, exit_raw = str(item.get("entry", "")), str(item.get("exit", ""))
    if len(entry_raw) != n or len(exit_raw) != n:
        raise SandboxError("Strategy returned signals of the wrong length.")
    entry = np.frombuffer(entry_raw.encode(), dtype=np.uint8) == ord("1")
    exit_ = np.frombuffer(exit_raw.encode(), dtype=np.uint8) == ord("1")
    size = None
    if item.get("size"):
        size = np.frombuffer(base64.b64decode(str(item["size"])), dtype=np.float64).copy()
        if size.size != n:
            raise SandboxError("Strategy returned size of the wrong length.")
        size = np.clip(np.nan_to_num(size, nan=0.0), 0.0, 1.0)
    return CustomSignals(entry=entry, exit=exit_, size=size)


def run_custom_batch(
    code: str,
    frames: list[pd.DataFrame],
    *,
    check_lookahead: bool = False,
    timeout: float = TIMEOUT_SECONDS,
) -> list[CustomSignals]:
    """Signals for each frame; one child process for every frame not already cached."""
    if not get_settings().allow_custom_code:
        raise SandboxError("Python strategies are disabled on this server.")
    errors = validate_code(code)
    if errors:
        raise SandboxError("\n".join(errors))

    encoded = [_encode_frame(df) for df in frames]
    keys = [_key(code, enc, check_lookahead and i == 0) for i, enc in enumerate(encoded)]
    missing = [i for i, key in enumerate(keys) if key not in _cache]

    if missing:
        response = _spawn(
            {
                "code": code,
                "frames": [encoded[i] for i in missing],
                "check_lookahead": check_lookahead and missing[0] == 0,
            },
            timeout,
        )
        results = response.get("results")
        if not isinstance(results, list) or len(results) != len(missing):
            raise SandboxError("Strategy process returned the wrong number of results.")
        for i, item in zip(missing, results):
            _cache[keys[i]] = _decode(item, len(frames[i]))
            while len(_cache) > CACHE_SIZE:
                _cache.popitem(last=False)

    out = []
    for key in keys:
        _cache.move_to_end(key)
        out.append(_cache[key])
    return out


def run_custom(code: str, df: pd.DataFrame, *, check_lookahead: bool = False) -> CustomSignals:
    return run_custom_batch(code, [df], check_lookahead=check_lookahead)[0]
