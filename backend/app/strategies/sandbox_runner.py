"""
Child-process side of the Python strategy sandbox.

Run as ``python -I sandbox_runner.py``. Reads one JSON request from stdin, executes the
user's ``strategy(df)`` on every frame, and writes one JSON response to stdout. Nothing
here may import from ``app`` except the indicator helpers, and the parent never unpickles
anything this process writes.
"""

from __future__ import annotations

import ast
import base64
import builtins
import json
import math
import sys
from pathlib import Path
from typing import Any

ALLOWED_MODULES = {"numpy", "pandas", "math"}

# None of these exist in SAFE_BUILTINS; naming them gives a clear error instead of a NameError.
BANNED_NAMES = {
    "open", "exec", "eval", "compile", "breakpoint", "globals", "locals", "vars",
    "getattr", "setattr", "delattr", "hasattr", "super", "memoryview", "classmethod",
    "staticmethod",
}

# Attributes that reach the filesystem, the network, other modules, or object internals.
BANNED_ATTRS = {
    "format", "format_map", "load", "loads", "save", "savez", "savez_compressed", "savetxt",
    "loadtxt", "genfromtxt", "fromfile", "tofile", "fromregex", "memmap", "open_memmap",
    "DataSource", "eval", "query", "io", "lib", "core", "util", "api", "compat", "testing",
    "ctypeslib", "ctypes", "f2py", "distutils", "os", "sys", "plotting", "options",
    "set_option", "show_versions", "test", "dump", "dumps", "pickle", "gi_frame",
    "f_globals", "f_locals", "f_back", "tb_frame", "co_code",
}
ALLOWED_PREFIXED = {"to_numpy", "to_list", "to_frame", "to_series", "to_period", "to_timestamp"}

SAFE_BUILTINS = {
    name: getattr(builtins, name)
    for name in (
        "abs", "all", "any", "bool", "dict", "enumerate", "filter", "float", "int", "isinstance",
        "len", "list", "map", "max", "min", "pow", "range", "reversed", "round", "set",
        "slice", "sorted", "str", "sum", "tuple", "zip", "divmod", "frozenset", "callable",
        "ValueError", "TypeError", "KeyError", "IndexError", "ZeroDivisionError", "Exception",
        "ArithmeticError", "True", "False", "None",
    )
    if hasattr(builtins, name)
}

MAX_CODE_CHARS = 20_000


def check_code(code: str) -> list[str]:
    """Static checks shared by the parent (fast feedback) and this child (enforcement)."""
    if len(code) > MAX_CODE_CHARS:
        return [f"Code is longer than {MAX_CODE_CHARS} characters."]
    try:
        tree = ast.parse(code, mode="exec")
    except SyntaxError as exc:
        return [f"Syntax error on line {exc.lineno}: {exc.msg}"]

    errors: list[str] = []

    def bad(node: ast.AST, msg: str) -> None:
        errors.append(f"Line {getattr(node, 'lineno', '?')}: {msg}")

    for node in ast.walk(tree):
        if isinstance(node, (ast.Import, ast.ImportFrom)):
            names = [a.name for a in node.names] if isinstance(node, ast.Import) else [node.module or ""]
            for name in names:
                if name.split(".")[0] not in ALLOWED_MODULES or "." in name:
                    bad(node, f"import of '{name}' is not allowed (only numpy, pandas, math).")
            if isinstance(node, ast.ImportFrom) and any(a.name == "*" for a in node.names):
                bad(node, "'import *' is not allowed.")
        elif isinstance(node, (ast.ClassDef, ast.Global, ast.Nonlocal, ast.AsyncFunctionDef, ast.Await)):
            bad(node, f"{type(node).__name__} is not allowed.")
        elif isinstance(node, (ast.Yield, ast.YieldFrom)):
            bad(node, "generators are not allowed.")
        elif isinstance(node, ast.Name):
            if node.id.startswith("_") or node.id in BANNED_NAMES:
                bad(node, f"name '{node.id}' is not allowed.")
        elif isinstance(node, ast.Attribute):
            attr = node.attr
            if attr.startswith("_") or attr in BANNED_ATTRS:
                bad(node, f"attribute '.{attr}' is not allowed.")
            elif (attr.startswith(("read_", "to_")) and attr not in ALLOWED_PREFIXED):
                bad(node, f"attribute '.{attr}' is not allowed (no file or format I/O).")
        elif isinstance(node, ast.alias) and node.asname and node.asname.startswith("_"):
            bad(node, f"alias '{node.asname}' is not allowed.")
        elif isinstance(node, ast.Constant) and isinstance(node.value, str):
            text = node.value.strip()
            if "__" in text:
                bad(node, "strings containing '__' are not allowed.")
            elif text.startswith(("to_", "read_")) or text in BANNED_ATTRS - {"format"}:
                bad(node, f"string '{text}' is not allowed (pandas would call it as a method).")

    if not errors and not any(
        isinstance(n, ast.FunctionDef) and n.name == "strategy" for n in tree.body
    ):
        errors.append("Define a top-level function: def strategy(df): ... return entry, exit")
    return errors


def _limit_resources() -> None:
    try:
        import resource
    except ImportError:  # Windows: the parent's timeout is the only limit
        return
    gb = 1024**3
    for name, value in (
        ("RLIMIT_AS", 2 * gb),
        ("RLIMIT_CPU", 30),
        ("RLIMIT_FSIZE", 0),
        ("RLIMIT_NPROC", 0),
    ):
        limit = getattr(resource, name, None)
        if limit is None:
            continue
        try:
            resource.setrlimit(limit, (value, value))
        except (ValueError, OSError):
            pass


def _safe_import(name: str, globals_: Any = None, locals_: Any = None, fromlist: Any = (), level: int = 0) -> Any:
    if level != 0 or name not in ALLOWED_MODULES:
        raise ImportError(f"import of '{name}' is not allowed")
    return __import__(name, globals_, locals_, fromlist, level)


def _decode(raw: str, dtype: Any) -> Any:
    import numpy as np

    return np.frombuffer(base64.b64decode(raw), dtype=dtype).copy()


def _frame(spec: dict[str, Any]) -> Any:
    import numpy as np
    import pandas as pd

    data = {col: _decode(raw, np.float64) for col, raw in spec["cols"].items()}
    frame = pd.DataFrame(data)
    frame.insert(0, "date", pd.to_datetime(_decode(spec["date"], np.int64)))
    return frame


def _as_flags(value: Any, n: int, label: str) -> Any:
    import numpy as np

    arr = np.asarray(value, dtype=float).reshape(-1)
    if arr.size == 1:
        arr = np.full(n, arr[0])
    if arr.size != n:
        raise ValueError(f"'{label}' has {arr.size} values but the data has {n} bars.")
    return np.nan_to_num(arr, nan=0.0) != 0


def _as_size(value: Any, n: int) -> Any:
    import numpy as np

    arr = np.asarray(value, dtype=float).reshape(-1)
    if arr.size == 1:
        arr = np.full(n, arr[0])
    if arr.size != n:
        raise ValueError(f"'size' has {arr.size} values but the data has {n} bars.")
    return np.clip(np.nan_to_num(arr, nan=0.0, posinf=0.0, neginf=0.0), 0.0, 1.0)


def _call(fn: Any, frame: Any) -> tuple[Any, Any, Any]:
    out = fn(frame.copy())
    if not isinstance(out, tuple) or len(out) not in (2, 3):
        raise ValueError("strategy(df) must return (entry, exit) or (entry, exit, size).")
    n = len(frame)
    entry = _as_flags(out[0], n, "entry")
    exit_ = _as_flags(out[1], n, "exit")
    size = _as_size(out[2], n) if len(out) == 3 and out[2] is not None else None
    return entry, exit_, size


def _lookahead_bar(fn: Any, frame: Any, entry: Any, exit_: Any) -> int | None:
    """Rerun on truncated history; a signal that changes means it used future bars."""
    n = len(frame)
    for frac in (0.5, 0.8):
        cut = int(n * frac)
        if cut < 30:
            continue
        e, x, _ = _call(fn, frame.iloc[:cut].reset_index(drop=True))
        diff = (e != entry[:cut]) | (x != exit_[:cut])
        if diff.any():
            return int(diff.argmax())
    return None


def _encode_flags(arr: Any) -> str:
    return "".join("1" if v else "0" for v in arr)


def run(request: dict[str, Any]) -> dict[str, Any]:
    import numpy as np
    import pandas as pd

    code = request["code"]
    errors = check_code(code)
    if errors:
        return {"ok": False, "error": "\n".join(errors)}

    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
    from app.backtesting import indicators as ind

    frames = [_frame(spec) for spec in request["frames"]]

    ta = {
        "sma": ind.sma, "ema": ind.ema, "rsi": ind.rsi, "macd": ind.macd,
        "bollinger": ind.bollinger_bands, "atr": ind.atr, "vwap": ind.vwap, "obv": ind.obv,
    }
    namespace: dict[str, Any] = {
        "__builtins__": {**SAFE_BUILTINS, "__import__": _safe_import},
        "np": np, "pd": pd, "math": math, "ta": type("ta", (), {k: staticmethod(v) for k, v in ta.items()}),
    }
    _limit_resources()
    try:
        exec(compile(code, "<strategy>", "exec"), namespace)  # noqa: S102
        fn = namespace.get("strategy")
        if not callable(fn):
            return {"ok": False, "error": "strategy is not a function."}
        results = []
        for idx, frame in enumerate(frames):
            entry, exit_, size = _call(fn, frame)
            if idx == 0 and request.get("check_lookahead"):
                bar = _lookahead_bar(fn, frame, entry, exit_)
                if bar is not None:
                    when = frame["date"].iloc[bar]
                    return {
                        "ok": False,
                        "error": (
                            f"Look-ahead detected: the signal on bar {bar} ({when:%Y-%m-%d}) changes "
                            "when later bars are removed, so the strategy reads the future "
                            "(e.g. shift(-1), whole-series max/mean, centered windows)."
                        ),
                    }
            results.append(
                {
                    "entry": _encode_flags(entry),
                    "exit": _encode_flags(exit_),
                    "size": base64.b64encode(size.astype(np.float64).tobytes()).decode() if size is not None else None,
                }
            )
        return {"ok": True, "results": results}
    except Exception as exc:  # noqa: BLE001
        tb = exc.__traceback__
        line = None
        while tb is not None:
            if tb.tb_frame.f_code.co_filename == "<strategy>":
                line = tb.tb_lineno
            tb = tb.tb_next
        where = f" (line {line})" if line else ""
        return {"ok": False, "error": f"{type(exc).__name__}{where}: {exc}"}


def main() -> None:
    request = json.loads(sys.stdin.read())
    response = run(request)
    sys.stdout.write(json.dumps(response))
    sys.stdout.flush()


if __name__ == "__main__":
    main()
