"""Async farm job registry: progress, cancel, result polling."""

from __future__ import annotations

import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any, Callable

from app.llm.parser import parse_builtin
from app.llm.schemas import StrategySpec
from app.playbook import PLAYBOOK
from app.research.farm import WORKERS, _one_ticker, _symbols

_LOCK = threading.Lock()
_JOBS: dict[str, dict[str, Any]] = {}
_MAX_JOBS = 40


def _trim() -> None:
    if len(_JOBS) <= _MAX_JOBS:
        return
    # Drop oldest finished/cancelled first.
    finished = sorted(
        ((jid, j) for jid, j in _JOBS.items() if j["status"] in ("done", "error", "cancelled")),
        key=lambda x: x[1].get("started_at", 0),
    )
    for jid, _ in finished[: max(0, len(_JOBS) - _MAX_JOBS)]:
        _JOBS.pop(jid, None)


def get_job(job_id: str) -> dict[str, Any] | None:
    with _LOCK:
        job = _JOBS.get(job_id)
        return None if job is None else dict(job)


def list_jobs(limit: int = 12) -> list[dict[str, Any]]:
    with _LOCK:
        items = sorted(_JOBS.values(), key=lambda j: j.get("started_at", 0), reverse=True)
        return [dict(j) for j in items[:limit]]


def cancel_job(job_id: str) -> dict[str, Any] | None:
    with _LOCK:
        job = _JOBS.get(job_id)
        if not job:
            return None
        job["cancel"].set()
        if job["status"] == "running":
            job["status"] = "cancelling"
        return dict(job)


def _set(job_id: str, **fields: Any) -> None:
    with _LOCK:
        job = _JOBS.get(job_id)
        if not job:
            return
        job.update(fields)


def _bump(job_id: str, *, ok: bool = False, fail: bool = False, row: dict[str, Any] | None = None) -> None:
    with _LOCK:
        job = _JOBS.get(job_id)
        if not job:
            return
        job["done"] = int(job.get("done") or 0) + 1
        if ok:
            job["ok_count"] = int(job.get("ok_count") or 0) + 1
        if fail:
            job["fail_count"] = int(job.get("fail_count") or 0) + 1
        if row is not None:
            rows: list = job.setdefault("partial_rows", [])
            if "error" not in row:
                rows.append(row)
                rows.sort(key=lambda r: (r.get("sharpe_ratio") is None, -(r.get("sharpe_ratio") or -99)))
                job["partial_rows"] = rows[:40]


def start_strategy_farm(
    strategy: StrategySpec,
    *,
    universe: str | None = None,
    tickers: list[str] | None = None,
    history: str = "5y",
) -> dict[str, Any]:
    symbols = _symbols(universe, tickers or [])
    if not symbols:
        raise ValueError("Pick a universe or at least one ticker.")
    return _spawn(
        mode="strategy_x_tickers",
        total=len(symbols),
        meta={"universe": universe, "history": history, "tickers": symbols},
        runner=lambda job_id, cancel: _run_strategy(job_id, cancel, strategy, symbols, history),
    )


def start_playbook_farm(
    *,
    universe: str | None = "etfs",
    tickers: list[str] | None = None,
    history: str = "5y",
    max_rules: int = 20,
) -> dict[str, Any]:
    symbols = _symbols(universe, tickers or [])
    if not symbols:
        raise ValueError("Pick a universe or at least one ticker.")
    rules = [p for p in PLAYBOOK if "15-minute" not in p.get("text", "").lower() and "15m" not in p.get("text", "")][
        : max(1, min(max_rules, 40))
    ]
    total = len(rules) * len(symbols)
    return _spawn(
        mode="playbook_x_universe",
        total=total,
        meta={"universe": universe, "history": history, "tickers": symbols, "rules": len(rules)},
        runner=lambda job_id, cancel: _run_playbook(job_id, cancel, rules, symbols, history),
    )


def _spawn(*, mode: str, total: int, meta: dict[str, Any], runner: Callable[[str, threading.Event], None]) -> dict[str, Any]:
    job_id = uuid.uuid4().hex[:12]
    cancel = threading.Event()
    job = {
        "id": job_id,
        "mode": mode,
        "status": "running",
        "total": total,
        "done": 0,
        "ok_count": 0,
        "fail_count": 0,
        "started_at": time.time(),
        "finished_at": None,
        "cancel": cancel,
        "partial_rows": [],
        "result": None,
        "error": None,
        "meta": meta,
    }
    with _LOCK:
        _JOBS[job_id] = job
        _trim()

    def _wrap() -> None:
        try:
            runner(job_id, cancel)
        except Exception as exc:  # noqa: BLE001
            _set(job_id, status="error", error=str(exc)[:200], finished_at=time.time())

    threading.Thread(target=_wrap, name=f"farm-{job_id}", daemon=True).start()
    return {"id": job_id, "status": "running", "total": total, "mode": mode}


def _run_strategy(job_id: str, cancel: threading.Event, strategy: StrategySpec, symbols: list[str], history: str) -> None:
    rows: list[dict[str, Any]] = []
    with ThreadPoolExecutor(max_workers=min(WORKERS, len(symbols))) as pool:
        futs = {pool.submit(_one_ticker, strategy, s, history): s for s in symbols}
        for fut in as_completed(futs):
            if cancel.is_set():
                for f in futs:
                    f.cancel()
                break
            row = fut.result()
            rows.append(row)
            _bump(job_id, ok="error" not in row, fail="error" in row, row=row if "error" not in row else None)
    if cancel.is_set():
        _set(job_id, status="cancelled", finished_at=time.time())
        return
    ok = [r for r in rows if "error" not in r]
    failed = [r for r in rows if "error" in r]
    ok.sort(key=lambda r: (r.get("sharpe_ratio") is None, -(r.get("sharpe_ratio") or -99)))
    beat = sum(1 for r in ok if (r.get("alpha_vs_hold") or 0) > 0)
    result = {
        "mode": "strategy_x_tickers",
        "scanned": len(rows),
        "ok": len(ok),
        "failed": failed,
        "beat_hold": beat,
        "beat_hold_share": None if not ok else round(beat / len(ok), 4),
        "history": history,
        "rows": ok,
        "strategy": strategy.model_dump(mode="json"),
    }
    _set(job_id, status="done", result=result, finished_at=time.time(), done=len(rows), ok_count=len(ok), fail_count=len(failed))


def _run_playbook(
    job_id: str,
    cancel: threading.Event,
    rules: list[dict[str, Any]],
    symbols: list[str],
    history: str,
) -> None:
    grid: list[dict[str, Any]] = []

    def job(item: dict[str, Any], symbol: str) -> dict[str, Any]:
        if cancel.is_set():
            return {"id": item["id"], "ticker": symbol, "error": "cancelled"}
        parsed = parse_builtin(item["text"], initial_capital=10_000, commission=0.001, slippage=0.0005)
        if parsed.strategy.timeframe not in ("1d", "1D"):
            return {"id": item["id"], "ticker": symbol, "error": "non-daily"}
        row = _one_ticker(parsed.strategy, symbol, history)
        row.update({"id": item["id"], "title": item["title"], "tag": item.get("tag"), "text": item["text"]})
        return row

    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        futs = [pool.submit(job, item, sym) for item in rules for sym in symbols]
        for fut in as_completed(futs):
            if cancel.is_set():
                break
            row = fut.result()
            grid.append(row)
            _bump(job_id, ok="error" not in row, fail="error" in row, row=row if "error" not in row else None)
    if cancel.is_set():
        _set(job_id, status="cancelled", finished_at=time.time())
        return
    ok = [r for r in grid if "error" not in r]
    failed = [r for r in grid if "error" in r]
    ok.sort(key=lambda r: (r.get("sharpe_ratio") is None, -(r.get("sharpe_ratio") or -99)))
    result = {
        "mode": "playbook_x_universe",
        "rules": len(rules),
        "tickers": symbols,
        "scanned": len(grid),
        "ok": len(ok),
        "failed_count": len(failed),
        "failed": failed[:20],
        "history": history,
        "rows": ok[:200],
        "top": ok[:25],
    }
    _set(job_id, status="done", result=result, finished_at=time.time(), done=len(grid), ok_count=len(ok), fail_count=len(failed))


def public_job(job: dict[str, Any]) -> dict[str, Any]:
    """Strip non-JSON bits (Event) for API responses."""
    total = max(1, int(job.get("total") or 1))
    done = int(job.get("done") or 0)
    return {
        "id": job["id"],
        "mode": job.get("mode"),
        "status": job.get("status"),
        "total": job.get("total"),
        "done": done,
        "ok_count": job.get("ok_count"),
        "fail_count": job.get("fail_count"),
        "progress": round(min(1.0, done / total), 4),
        "started_at": job.get("started_at"),
        "finished_at": job.get("finished_at"),
        "meta": job.get("meta"),
        "partial_rows": job.get("partial_rows") or [],
        "result": job.get("result"),
        "error": job.get("error"),
    }
