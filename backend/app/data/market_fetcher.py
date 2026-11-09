"""Market data fetcher: Yahoo Finance & Binance public APIs with auto-fallback."""

from __future__ import annotations

import json
import urllib.request
from typing import Any
import pandas as pd

from app.config import UPLOAD_DIR
from app.data.validators import validate_ohlcv_dataframe


def _normalize_symbol(ticker: str) -> tuple[str, str]:
    """Normalize input ticker into (binance_symbol, yahoo_symbol)."""
    raw = ticker.strip().upper().replace("/", "").replace("-", "")
    crypto_bases = {"BTC", "ETH", "SOL", "BNB", "XRP", "DOGE", "ADA", "AVAX", "NEAR", "TON"}
    if raw in crypto_bases:
        return f"{raw}USDT", f"{raw}-USD"
    if raw.endswith("USDT"):
        base = raw[:-4]
        return raw, f"{base}-USD"
    return f"{raw}USDT", raw


def fetch_from_yahoo(symbol: str, interval: str = "1d", range_param: str = "1y") -> pd.DataFrame:
    """Fetch OHLCV data from Yahoo Finance."""
    interval_map = {"5m": "5m", "15m": "15m", "1h": "1h", "1d": "1d", "1D": "1d"}
    inv = interval_map.get(interval, "1d")
    if inv in ("5m", "15m"):
        range_param = "1mo"
    elif inv == "1h":
        range_param = "3mo"

    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?interval={inv}&range={range_param}"
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0"},
    )
    with urllib.request.urlopen(req, timeout=8) as resp:
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


def fetch_and_save_market_data(
    ticker: str,
    interval: str = "1d",
) -> dict[str, Any]:
    """Fetch market data from Yahoo Finance / Binance and save as a dataset."""
    binance_sym, yahoo_sym = _normalize_symbol(ticker)
    df: pd.DataFrame | None = None
    source_used = "yahoo"

    try:
        df = fetch_from_yahoo(yahoo_sym, interval=interval)
        source_used = f"Yahoo Finance ({yahoo_sym})"
    except Exception as exc1:
        try:
            url = f"https://api.binance.com/api/v3/klines?symbol={binance_sym}&interval={interval}&limit=500"
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=6) as resp:
                raw_klines = json.loads(resp.read().decode())
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

    clean_sym = ticker.strip().upper().replace("/", "_").replace("-", "_")
    filename = f"{clean_sym}_{interval}.csv"
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

