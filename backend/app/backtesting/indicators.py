"""Technical indicator calculations — causal (no look-ahead)."""

from __future__ import annotations

import numpy as np
import pandas as pd


def sma(series: pd.Series, period: int) -> pd.Series:
    """Simple moving average using only past and current values."""
    if period < 1:
        raise ValueError("SMA period must be >= 1")
    return series.rolling(window=period, min_periods=period).mean()


def ema(series: pd.Series, period: int) -> pd.Series:
    """Exponential moving average (pandas ewm, adjust=False for recursive EMA)."""
    if period < 1:
        raise ValueError("EMA period must be >= 1")
    return series.ewm(span=period, adjust=False, min_periods=period).mean()


def rsi(series: pd.Series, period: int = 14) -> pd.Series:
    """Relative Strength Index (Wilder-style via ewm)."""
    if period < 1:
        raise ValueError("RSI period must be >= 1")
    delta = series.diff()
    gain = delta.clip(lower=0.0)
    loss = (-delta).clip(lower=0.0)
    avg_gain = gain.ewm(alpha=1 / period, adjust=False, min_periods=period).mean()
    avg_loss = loss.ewm(alpha=1 / period, adjust=False, min_periods=period).mean()
    rs = avg_gain / avg_loss.replace(0, np.nan)
    result = 100 - (100 / (1 + rs))
    # When avg_loss is 0 and avg_gain > 0, RSI = 100
    result = result.where(~((avg_loss == 0) & (avg_gain > 0)), 100.0)
    result = result.where(~((avg_loss == 0) & (avg_gain == 0)), 50.0)
    return result


def macd(
    series: pd.Series,
    fast_period: int = 12,
    slow_period: int = 26,
    signal_period: int = 9,
) -> tuple[pd.Series, pd.Series, pd.Series]:
    """MACD line, signal line, and histogram."""
    if fast_period >= slow_period:
        raise ValueError("MACD fast_period must be < slow_period")
    fast = ema(series, fast_period)
    slow = ema(series, slow_period)
    macd_line = fast - slow
    signal_line = ema(macd_line.dropna(), signal_period).reindex(macd_line.index)
    # Recompute signal with proper alignment: ewm on full series with NaNs handled
    signal_line = macd_line.ewm(span=signal_period, adjust=False, min_periods=signal_period).mean()
    histogram = macd_line - signal_line
    return macd_line, signal_line, histogram


def bollinger_bands(
    series: pd.Series, period: int = 20, std_dev: float = 2.0
) -> tuple[pd.Series, pd.Series, pd.Series]:
    """Bollinger Bands: middle (SMA), upper, lower."""
    middle = sma(series, period)
    rolling_std = series.rolling(window=period, min_periods=period).std(ddof=0)
    upper = middle + std_dev * rolling_std
    lower = middle - std_dev * rolling_std
    return upper, middle, lower


def atr(df: pd.DataFrame, period: int = 14) -> pd.Series:
    """Average True Range. Requires columns high, low, close."""
    if period < 1:
        raise ValueError("ATR period must be >= 1")
    high = df["high"]
    low = df["low"]
    close = df["close"]
    prev_close = close.shift(1)
    tr = pd.concat(
        [
            (high - low).abs(),
            (high - prev_close).abs(),
            (low - prev_close).abs(),
        ],
        axis=1,
    ).max(axis=1)
    return tr.ewm(alpha=1 / period, adjust=False, min_periods=period).mean()


def compute_indicator_series(
    df: pd.DataFrame,
    indicator: str,
    *,
    period: int | None = None,
    fast_period: int | None = None,
    slow_period: int | None = None,
    signal_period: int | None = None,
    std_dev: float | None = None,
    component: str = "value",
) -> pd.Series:
    """Compute a named indicator series from OHLCV data."""
    close = df["close"]
    ind = indicator.upper()

    if ind == "PRICE":
        col = component if component in ("open", "high", "low", "close") else "close"
        return df[col].astype(float)

    if ind == "SMA":
        if period is None:
            raise ValueError("SMA requires period")
        return sma(close, period)

    if ind == "EMA":
        if period is None:
            raise ValueError("EMA requires period")
        return ema(close, period)

    if ind == "RSI":
        return rsi(close, period or 14)

    if ind == "MACD":
        macd_line, signal_line, histogram = macd(
            close,
            fast_period or 12,
            slow_period or 26,
            signal_period or 9,
        )
        mapping = {
            "macd": macd_line,
            "signal": signal_line,
            "histogram": histogram,
            "value": macd_line,
        }
        return mapping.get(component, macd_line)

    if ind == "BOLLINGER":
        upper, middle, lower = bollinger_bands(close, period or 20, std_dev or 2.0)
        mapping = {"upper": upper, "middle": middle, "lower": lower, "value": middle}
        return mapping.get(component, middle)

    if ind == "ATR":
        return atr(df, period or 14)

    raise ValueError(f"Unsupported indicator: {indicator}")
