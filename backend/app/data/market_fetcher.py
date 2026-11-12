"""Market data fetcher: Yahoo Finance & Binance public APIs with auto-fallback."""

from __future__ import annotations

import json
import re
import time
import urllib.request
from typing import Any
import pandas as pd

from app.config import UPLOAD_DIR
from app.data.validators import validate_ohlcv_dataframe


_FIAT = {"USD", "EUR", "GBP", "JPY", "CHF", "AUD", "CAD", "NZD", "CNY", "HKD", "SGD", "SEK", "NOK", "MXN", "TRY", "RUB", "INR", "KZT", "UZS"}
_COMMODITIES = {"GOLD": "GC=F", "XAUUSD": "GC=F", "SILVER": "SI=F", "XAGUSD": "SI=F", "OIL": "CL=F", "WTI": "CL=F", "BRENT": "BZ=F", "NATGAS": "NG=F"}


def _normalize_symbol(ticker: str) -> tuple[str, str]:
    """Normalize input ticker into (binance_symbol, yahoo_symbol)."""
    cleaned = ticker.strip().upper()
    if any(ch in cleaned for ch in "-.^="):
        # Already a Yahoo symbol: BRK-B, BTC-USD, ^GSPC, EURUSD=X.
        base = cleaned.split("-")[0].replace(".", "").replace("^", "")
        return f"{base}USDT", cleaned
    raw = cleaned.replace("/", "").replace(" ", "")
    compact = raw.replace("_", "")
    if compact in _COMMODITIES:
        return f"{compact}USDT", _COMMODITIES[compact]
    if len(compact) == 6 and compact[:3] in _FIAT and compact[3:] in _FIAT and compact[:3] != compact[3:]:
        return f"{compact}USDT", f"{compact}=X"
    crypto_bases = {"BTC", "ETH", "SOL", "BNB", "XRP", "DOGE", "ADA", "AVAX", "NEAR", "TON"}
    if raw in crypto_bases:
        return f"{raw}USDT", f"{raw}-USD"
    if raw.endswith("USDT"):
        base = raw[:-4]
        return raw, f"{base}-USD"
    return f"{raw}USDT", raw


HISTORY_RANGES = ("1y", "5y", "10y", "max")
# Daily bars per year, used to cap the Binance fallback (crypto trades every day).
_BINANCE_DAYS = {"1y": 365, "5y": 365 * 5, "10y": 365 * 10, "max": 365 * 20}


_MARKET_FILE = re.compile(r"^([A-Z0-9_.^=]+?)_(5m|15m|1h|4h|1d|1D)(?:_(5y|10y|max))?\.csv$")


def market_dataset_source(dataset_id: str) -> tuple[str, str, str] | None:
    """(ticker, interval, history) for a file written by ``fetch_and_save_market_data``, else None."""
    match = _MARKET_FILE.match(dataset_id)
    if not match:
        return None
    sym, interval, history = match.groups()
    return sym.replace("_", "-"), interval, history or "1y"


def fetch_from_yahoo(symbol: str, interval: str = "1d", range_param: str = "10y") -> pd.DataFrame:
    """Fetch OHLCV data from Yahoo Finance."""
    interval_map = {"5m": "5m", "15m": "15m", "1h": "1h", "1d": "1d", "1D": "1d"}
    inv = interval_map.get(interval, "1d")
    # Yahoo only serves intraday bars for recent history.
    if inv in ("5m", "15m"):
        range_param = "1mo"
    elif inv == "1h":
        range_param = "2y" if range_param != "1y" else "1y"

    # range=max silently downsamples to monthly bars; an explicit window keeps the requested interval.
    span = f"period1=0&period2={int(time.time())}" if range_param == "max" else f"range={range_param}"
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?interval={inv}&{span}"
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0"},
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        data = json.loads(resp.read().decode())

    result = data["chart"]["result"][0]
    timestamps = result.get("timestamp", [])
    if not timestamps:
        raise ValueError(f"No timestamps returned for {symbol}")
    quote = result["indicators"]["quote"][0]

    date_format = "%Y-%m-%d %H:%M:%S" if inv in ("5m", "15m", "1h") else "%Y-%m-%d"
    dates = [pd.to_datetime(t, unit="s").strftime(date_format) for t in timestamps]

    df = pd.DataFrame(
        {
            "date": dates,
            "open": quote.get("open", []),
            "high": quote.get("high", []),
            "low": quote.get("low", []),
            "close": quote.get("close", []),
            "volume": quote.get("volume", []),
        }
    ).dropna()

    df["open"] = df["open"].round(4)
    df["high"] = df["high"].round(4)
    df["low"] = df["low"].round(4)
    df["close"] = df["close"].round(4)
    df["volume"] = df["volume"].astype(float)
    return df


def _binance_klines(symbol: str, interval: str, history: str) -> list[list[Any]]:
    """Newest-first pages of 1000 bars, walking back until the requested span or the listing date."""
    wanted = _BINANCE_DAYS.get(history, 365 * 10) if interval in ("1d", "1D") else 1000
    klines: list[list[Any]] = []
    end_time: int | None = None
    while len(klines) < wanted:
        url = f"https://api.binance.com/api/v3/klines?symbol={symbol}&interval={interval}&limit=1000"
        if end_time is not None:
            url += f"&endTime={end_time}"
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            page = json.loads(resp.read().decode())
        if not page:
            break
        klines = page + klines
        if len(page) < 1000:
            break
        end_time = int(page[0][0]) - 1
    return klines[-wanted:]


def fetch_market_frame(
    ticker: str,
    interval: str = "1d",
    history: str = "10y",
    yahoo_symbol: str | None = None,
) -> tuple[pd.DataFrame, str]:
    """Validated OHLCV bars and a source label, without writing a dataset file."""
    if history not in HISTORY_RANGES:
        history = "10y"
    binance_sym, yahoo_sym = _normalize_symbol(ticker)
    yahoo_sym = yahoo_symbol or yahoo_sym
    df: pd.DataFrame | None = None
    source_used = "yahoo"

    try:
        df = fetch_from_yahoo(yahoo_sym, interval=interval, range_param=history)
        source_used = f"Yahoo Finance ({yahoo_sym})"
    except Exception as exc1:
        try:
            raw_klines = _binance_klines(binance_sym, interval, history)
            date_fmt = "%Y-%m-%d %H:%M:%S" if interval in ("5m", "15m", "1h") else "%Y-%m-%d"
            df = pd.DataFrame(
                {
                    "date": [
                        pd.to_datetime(k[0], unit="ms").strftime(date_fmt) for k in raw_klines
                    ],
                    "open": [float(k[1]) for k in raw_klines],
                    "high": [float(k[2]) for k in raw_klines],
                    "low": [float(k[3]) for k in raw_klines],
                    "close": [float(k[4]) for k in raw_klines],
                    "volume": [float(k[5]) for k in raw_klines],
                }
            )
            source_used = f"Binance ({binance_sym})"
        except Exception as exc2:
            raise RuntimeError(
                f"Could not fetch market data for '{ticker}'. Details: {exc1}"
            ) from exc2

    if df is None or df.empty:
        raise ValueError(f"No price data found for ticker '{ticker}'")

    validation = validate_ohlcv_dataframe(df)
    if not validation.valid:
        raise ValueError("; ".join(validation.errors))
    return df.reset_index(drop=True), source_used


def fetch_and_save_market_data(
    ticker: str,
    interval: str = "1d",
    history: str = "10y",
) -> dict[str, Any]:
    """Fetch market data from Yahoo Finance / Binance and save as a dataset."""
    if history not in HISTORY_RANGES:
        history = "10y"
    df, source_used = fetch_market_frame(ticker, interval=interval, history=history)

    clean_sym = ticker.strip().upper().replace("/", "_").replace("-", "_")
    filename = f"{clean_sym}_{interval}.csv" if history == "1y" else f"{clean_sym}_{interval}_{history}.csv"
    save_path = UPLOAD_DIR / filename
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    df.to_csv(save_path, index=False)

    return {
        "dataset_id": filename,
        "name": filename,
        "rows": len(df),
        "source": source_used,
        "date_start": str(df["date"].iloc[0]),
        "date_end": str(df["date"].iloc[-1]),
    }

