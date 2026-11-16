"""Signal screener: one rule set across a list of tickers, ranked by what to do today."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from typing import Any

import pandas as pd

from app.backtesting.engine import BacktestEngine, BacktestError
from app.data.market_fetcher import fetch_market_frame
from app.llm.schemas import StrategySpec

MAX_TICKERS = 60
WORKERS = 10

# Yahoo symbols; crypto uses the -USD pairs Yahoo quotes daily.
UNIVERSES: dict[str, dict[str, Any]] = {
    "us_megacaps": {
        "label": "US mega caps",
        "tickers": [
            "AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "META", "TSLA", "AVGO", "BRK-B", "JPM",
            "V", "UNH", "XOM", "LLY", "JNJ", "WMT", "MA", "PG", "HD", "COST",
            "NFLX", "AMD", "ORCL", "CRM", "BAC", "KO", "PEP", "ADBE", "CSCO", "INTC",
        ],
    },
    "us_growth": {
        "label": "US growth & high-beta",
        "tickers": [
            "NVDA", "AMD", "AVGO", "SMCI", "ARM", "PLTR", "SNOW", "CRWD", "NET", "DDOG",
            "SHOP", "SQ", "COIN", "HOOD", "UBER", "ABNB", "DASH", "RBLX", "U", "PATH",
            "TSLA", "RIVN", "LCID", "NIO", "MARA", "RIOT", "MSTR", "OKLO", "IONQ", "RKLB",
        ],
    },
    "us_value_cyclical": {
        "label": "US value & cyclicals",
        "tickers": [
            "XOM", "CVX", "COP", "OXY", "SLB", "BA", "CAT", "DE", "GE", "HON",
            "UPS", "FDX", "GM", "F", "DAL", "UAL", "AAL", "CCL", "RCL", "MGM",
            "JPM", "BAC", "WFC", "C", "GS", "MS", "BLK", "SCHW", "AXP", "USB",
        ],
    },
    "etfs": {
        "label": "ETFs: indices, sectors, bonds, metals",
        "tickers": [
            "SPY", "QQQ", "IWM", "DIA", "MDY", "EFA", "EEM", "VEA", "VWO", "FXI",
            "TLT", "IEF", "SHY", "HYG", "LQD", "TIP", "GLD", "SLV", "USO", "UNG",
            "XLE", "XLF", "XLK", "XLV", "XLY", "XLP", "XLI", "XLU", "XLB", "VNQ",
            "ARKK", "SMH", "SOXX", "XBI", "IBB", "KWEB", "EWJ", "EWZ", "INDA", "GREK",
        ],
    },
    "international": {
        "label": "International ADRs & markets",
        "tickers": [
            "TSM", "ASML", "SAP", "NVO", "AZN", "UL", "SONY", "TM", "HMC", "BABA",
            "PDD", "JD", "BIDU", "NIO", "SE", "GRAB", "MELI", "NU", "ITUB", "VALE",
            "BP", "SHEL", "TTE", "RIO", "BHP", "RELX", "DEO", "BUD", "SNY", "GSK",
        ],
    },
    "fx": {
        "label": "FX majors & crosses",
        "tickers": [
            "EURUSD=X", "GBPUSD=X", "USDJPY=X", "USDCHF=X", "AUDUSD=X", "USDCAD=X",
            "NZDUSD=X", "EURGBP=X", "EURJPY=X", "GBPJPY=X", "AUDJPY=X", "EURCHF=X",
            "USDMXN=X", "USDTRY=X", "USDBRL=X", "USDZAR=X", "USDSEK=X", "USDNOK=X",
            "USDINR=X", "USDCNY=X",
        ],
    },
    "commodities": {
        "label": "Commodities & futures proxies",
        "tickers": [
            "GC=F", "SI=F", "CL=F", "BZ=F", "NG=F", "HG=F", "PL=F", "PA=F",
            "ZC=F", "ZW=F", "ZS=F", "KC=F", "CT=F", "SB=F", "LE=F", "HE=F",
            "GLD", "SLV", "USO", "UNG", "DBA", "DBC", "PDBC", "COPX",
        ],
    },
    "factors_vol": {
        "label": "Factors, vol & alternatives",
        "tickers": [
            "MTUM", "VLUE", "QUAL", "SIZE", "USMV", "SPHQ", "SPHD", "DVY",
            "VXX", "UVXY", "SVXY", "TAIL", "BTAL", "KMLM", "DBMF", "PAVE",
            "BITO", "IBIT", "ETHA", "GBTC", "ARKK", "BOTZ", "ROBO", "HACK",
        ],
    },
    "crypto": {
        "label": "Crypto majors & alts",
        "tickers": [
            "BTC-USD", "ETH-USD", "SOL-USD", "BNB-USD", "XRP-USD", "DOGE-USD", "ADA-USD",
            "AVAX-USD", "LINK-USD", "DOT-USD", "LTC-USD", "TRX-USD", "TON11419-USD", "NEAR-USD",
            "ATOM-USD", "UNI-USD", "AAVE-USD", "APT-USD", "SUI-USD", "PEPE-USD",
            "MATIC-USD", "SHIB-USD", "ICP-USD", "FIL-USD", "ARB-USD", "OP-USD",
        ],
    },
}

_ACTION_ORDER = {"enter": 0, "exit": 1, "add": 2, "hold": 3, "wait": 4}


def universe_list() -> list[dict[str, Any]]:
    return [{"id": k, "label": v["label"], "count": len(v["tickers"])} for k, v in UNIVERSES.items()]


def _display(symbol: str) -> str:
    if symbol.startswith("TON"):
        return "TON-USD"
    return symbol


def _scan_one(strategy: StrategySpec, symbol: str, history: str) -> dict[str, Any]:
    name = _display(symbol)
    try:
        df, source = fetch_market_frame(symbol, history=history, yahoo_symbol=symbol)
    except Exception as exc:  # noqa: BLE001
        return {"ticker": name, "error": f"No data: {exc}"[:160]}
    if len(df) < 30:
        return {"ticker": name, "error": "Too little history to scan."}
    try:
        result = BacktestEngine(strategy).run(df, metrics_only=True)
    except (BacktestError, ValueError) as exc:
        return {"ticker": name, "error": str(exc)[:160]}
    m, sig = result["metrics"], result["live_signal"]
    closes = pd.to_numeric(df["close"], errors="coerce")
    hold = float(closes.iloc[-1] / closes.iloc[0] - 1.0) if closes.iloc[0] else None
    change_1d = float(closes.iloc[-1] / closes.iloc[-2] - 1.0) if len(closes) > 1 and closes.iloc[-2] else None
    return {
        "ticker": name,
        "symbol": symbol,
        "source": source,
        "bars": len(df),
        "start": str(df["date"].iloc[0])[:10],
        "action": sig["action"],
        "in_position": sig["in_position"],
        "as_of": sig["as_of"][:10],
        "last_close": sig["last_close"],
        "change_1d": change_1d,
        "entry_price": sig["entry_price"],
        "entry_date": (sig["entry_date"] or "")[:10] or None,
        "unrealized_pct": sig["unrealized_pct"],
        "total_return": m.get("total_return"),
        "buy_hold_return": hold,
        "sharpe_ratio": m.get("sharpe_ratio"),
        "max_drawdown": m.get("max_drawdown"),
        "win_rate": m.get("win_rate"),
        "trades": int(m.get("number_of_trades") or 0),
    }


def run_screener(strategy: StrategySpec, symbols: list[str], history: str = "5y") -> dict[str, Any]:
    if strategy.is_custom:
        raise ValueError("The screener runs plain-English rules; Python strategies run one dataset at a time.")
    symbols = list(dict.fromkeys(s.strip().upper() for s in symbols if s.strip()))[:MAX_TICKERS]
    if not symbols:
        raise ValueError("Pick a universe or enter at least one ticker.")
    with ThreadPoolExecutor(max_workers=min(WORKERS, len(symbols))) as pool:
        rows = list(pool.map(lambda s: _scan_one(strategy, s, history), symbols))

    ok = [r for r in rows if "error" not in r]
    failed = [r for r in rows if "error" in r]
    ok.sort(key=lambda r: (_ACTION_ORDER.get(r["action"], 9), -(r["sharpe_ratio"] or -99)))
    counts = {a: sum(1 for r in ok if r["action"] == a) for a in _ACTION_ORDER}
    return {
        "rows": ok,
        "failed": failed,
        "counts": counts,
        "scanned": len(rows),
        "history": history,
        "side": strategy.side.value,
    }
