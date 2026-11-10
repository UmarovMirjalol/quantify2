"""Technical indicator calculations — causal (no look-ahead)."""

from __future__ import annotations

import numpy as np
import pandas as pd


def sma(series: pd.Series, period: int) -> pd.Series:
    """Simple moving average using only past and current values."""
    if period < 1:
        raise ValueError("SMA period must be >= 1")
    return series.rolling(window=period, min_periods=period).mean()


def _seeded_average(series: pd.Series, alpha: float, period: int) -> pd.Series:
    """Recursive average whose first value is the SMA of the first `period` valid values.

    This is the seeding used by Wilder, TradingView (ta.ema, ta.rma) and backtrader, so
    signals agree with them from the first bar instead of only after the warm-up fades.
    """
    s = series.astype(float)
    out = pd.Series(np.nan, index=s.index)
    valid = np.flatnonzero(s.notna().to_numpy())
    if len(valid) < period:
        return out
    seed_at = valid[period - 1]
    tail = s.iloc[seed_at:].copy()
    tail.iloc[0] = float(s.iloc[valid[0] : seed_at + 1].mean())
    out.iloc[seed_at:] = tail.ewm(alpha=alpha, adjust=False).mean().to_numpy()
    return out


def ema(series: pd.Series, period: int) -> pd.Series:
    """Exponential moving average, alpha 2/(N+1), seeded with the first N-bar SMA."""
    if period < 1:
        raise ValueError("EMA period must be >= 1")
    return _seeded_average(series, 2.0 / (period + 1), period)


def rma(series: pd.Series, period: int) -> pd.Series:
    """Wilder's smoothing (alpha 1/N), seeded with the first N-bar SMA."""
    if period < 1:
        raise ValueError("Smoothing period must be >= 1")
    return _seeded_average(series, 1.0 / period, period)


def rsi(series: pd.Series, period: int = 14) -> pd.Series:
    """Relative Strength Index (Wilder-style via ewm)."""
    if period < 1:
        raise ValueError("RSI period must be >= 1")
    delta = series.diff()
    gain = delta.clip(lower=0.0)
    loss = (-delta).clip(lower=0.0)
    avg_gain = rma(gain, period)
    avg_loss = rma(loss, period)
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
    signal_line = ema(macd_line, signal_period)
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


def _bucket_ohlcv(df: pd.DataFrame, factor: int) -> pd.DataFrame:
    """One row per completed group of `factor` base bars. No partial tail."""
    n = (len(df) // factor) * factor
    if n < factor:
        return df.iloc[0:0].copy()
    chunks = []
    for start in range(0, n, factor):
        sl = df.iloc[start : start + factor]
        chunks.append(
            {
                "open": float(sl["open"].iloc[0]),
                "high": float(sl["high"].max()),
                "low": float(sl["low"].min()),
                "close": float(sl["close"].iloc[-1]),
                "volume": float(sl["volume"].sum()),
            }
        )
    return pd.DataFrame(chunks)


def _align_completed(index: pd.Index, values: np.ndarray, factor: int) -> pd.Series:
    """Publish bucket i only after it closes, held until the next bucket closes."""
    out = np.full(len(index), np.nan)
    for i, value in enumerate(values):
        start = (i + 1) * factor
        end = min(len(index), (i + 2) * factor)
        if start < len(index):
            out[start:end] = value
    return pd.Series(out, index=index)


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
    return rma(tr, period)


def stochastic(
    df: pd.DataFrame, period: int = 14, smooth: int = 3
) -> tuple[pd.Series, pd.Series]:
    """Slow stochastic: %K is the smoothed position of the close in the N-bar range, %D its average."""
    if period < 1 or smooth < 1:
        raise ValueError("Stochastic periods must be >= 1")
    low_n = df["low"].astype(float).rolling(period, min_periods=period).min()
    high_n = df["high"].astype(float).rolling(period, min_periods=period).max()
    span = (high_n - low_n).replace(0, np.nan)
    raw = 100.0 * (df["close"].astype(float) - low_n) / span
    k = raw.rolling(smooth, min_periods=smooth).mean()
    d = k.rolling(smooth, min_periods=smooth).mean()
    return k, d


def adx(df: pd.DataFrame, period: int = 14) -> tuple[pd.Series, pd.Series, pd.Series]:
    """Wilder's ADX with +DI and -DI."""
    if period < 1:
        raise ValueError("ADX period must be >= 1")
    high = df["high"].astype(float)
    low = df["low"].astype(float)
    up = high.diff()
    down = -low.diff()
    plus_dm = up.where((up > down) & (up > 0), 0.0)
    minus_dm = down.where((down > up) & (down > 0), 0.0)
    tr = atr(df, 1)
    smooth_tr = rma(tr, period).replace(0, np.nan)
    plus_di = 100.0 * rma(plus_dm, period) / smooth_tr
    minus_di = 100.0 * rma(minus_dm, period) / smooth_tr
    dx = 100.0 * (plus_di - minus_di).abs() / (plus_di + minus_di).replace(0, np.nan)
    return rma(dx, period), plus_di, minus_di


def donchian(df: pd.DataFrame, period: int = 20) -> tuple[pd.Series, pd.Series, pd.Series]:
    """Highest high and lowest low of the previous N bars (the current bar excluded, so a close can break out)."""
    if period < 1:
        raise ValueError("Donchian period must be >= 1")
    upper = df["high"].astype(float).rolling(period, min_periods=period).max().shift(1)
    lower = df["low"].astype(float).rolling(period, min_periods=period).min().shift(1)
    return upper, (upper + lower) / 2.0, lower


def volume_indicator(
    df: pd.DataFrame, period: int | None = None, component: str = "value"
) -> pd.Series:
    """Volume series or Volume moving average."""
    vol = df["volume"].astype(float)
    if component == "sma" or (period is not None and period > 1):
        p = period if period is not None else 20
        return sma(vol, p)
    return vol


def vwap(df: pd.DataFrame, period: int | None = None) -> pd.Series:
    """Volume-Weighted Average Price.

    If period is provided, computes rolling VWAP.
    Otherwise, if date column has intraday bars, resets per calendar day;
    else cumulative across the series.
    """
    high = df["high"].astype(float)
    low = df["low"].astype(float)
    close = df["close"].astype(float)
    volume = df["volume"].astype(float)
    typical_price = (high + low + close) / 3.0
    pv = typical_price * volume

    if period is not None and period >= 1:
        rolling_pv = pv.rolling(window=period, min_periods=1).sum()
        rolling_vol = volume.rolling(window=period, min_periods=1).sum()
        return rolling_pv / rolling_vol.replace(0, np.nan)

    if "date" in df.columns:
        dates = pd.to_datetime(df["date"], errors="coerce")
        if dates.notna().all() and dates.dt.date.nunique() < len(dates):
            day_groups = dates.dt.date
            cum_pv = pv.groupby(day_groups).cumsum()
            cum_vol = volume.groupby(day_groups).cumsum()
            return cum_pv / cum_vol.replace(0, np.nan)

    cum_pv = pv.cumsum()
    cum_vol = volume.cumsum()
    return cum_pv / cum_vol.replace(0, np.nan)


def obv(df: pd.DataFrame) -> pd.Series:
    """On-Balance Volume (OBV)."""
    close = df["close"].astype(float)
    volume = df["volume"].astype(float)
    direction = np.sign(close.diff()).fillna(0.0)
    return (direction * volume).cumsum()


def hammer(df: pd.DataFrame) -> pd.Series:
    """Hammer pattern (bullish reversal candle).

    Returns 1.0 where detected, 0.0 otherwise.
    """
    open_ = df["open"].astype(float)
    high = df["high"].astype(float)
    low = df["low"].astype(float)
    close = df["close"].astype(float)

    total_range = high - low
    body = (close - open_).abs()
    lower_shadow = open_.combine(close, min) - low
    upper_shadow = high - open_.combine(close, max)

    is_hammer = (
        (total_range > 0)
        & (lower_shadow >= 2.0 * body)
        & (upper_shadow <= 0.25 * total_range)
        & (body >= 0.05 * total_range)
    )
    return is_hammer.astype(float)


def pinbar(df: pd.DataFrame, component: str = "bullish") -> pd.Series:
    """Pin-bar pattern (rejection candle).

    Returns 1.0 where detected, 0.0 otherwise.
    """
    open_ = df["open"].astype(float)
    high = df["high"].astype(float)
    low = df["low"].astype(float)
    close = df["close"].astype(float)

    total_range = high - low
    body = (close - open_).abs()
    lower_shadow = open_.combine(close, min) - low
    upper_shadow = high - open_.combine(close, max)

    bullish_pin = (
        (total_range > 0)
        & (lower_shadow >= 0.55 * total_range)
        & (upper_shadow <= 0.25 * total_range)
        & (body <= 0.35 * total_range)
    )
    bearish_pin = (
        (total_range > 0)
        & (upper_shadow >= 0.55 * total_range)
        & (lower_shadow <= 0.25 * total_range)
        & (body <= 0.35 * total_range)
    )

    if component == "bearish":
        return bearish_pin.astype(float)
    if component in ("bullish", "value"):
        return bullish_pin.astype(float)
    return (bullish_pin | bearish_pin).astype(float)


def engulfing(df: pd.DataFrame, component: str = "bullish") -> pd.Series:
    """Engulfing pattern (bullish or bearish).

    Returns 1.0 where detected, 0.0 otherwise.
    """
    open_ = df["open"].astype(float)
    close = df["close"].astype(float)

    prev_open = open_.shift(1)
    prev_close = close.shift(1)

    bullish = (
        (prev_close < prev_open)
        & (close > open_)
        & (open_ <= prev_close)
        & (close >= prev_open)
    )
    bearish = (
        (prev_close > prev_open)
        & (close < open_)
        & (open_ >= prev_close)
        & (close <= prev_open)
    )

    if component == "bearish":
        return bearish.astype(float)
    if component in ("bullish", "value"):
        return bullish.astype(float)
    return (bullish | bearish).astype(float)


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
    bar_factor: int | None = None,
) -> pd.Series:
    """Compute a named indicator series from OHLCV data."""
    if bar_factor and bar_factor > 1:
        reduced = _bucket_ohlcv(df, bar_factor)
        if reduced.empty:
            return pd.Series(np.nan, index=df.index)
        series = compute_indicator_series(
            reduced,
            indicator,
            period=period,
            fast_period=fast_period,
            slow_period=slow_period,
            signal_period=signal_period,
            std_dev=std_dev,
            component=component,
        )
        return _align_completed(df.index, series.to_numpy(dtype=float), bar_factor)

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

    if ind == "STOCH":
        k, d = stochastic(df, period or 14, signal_period or 3)
        return d if component == "d" else k

    if ind == "ADX":
        adx_line, plus_di, minus_di = adx(df, period or 14)
        return {"plus": plus_di, "minus": minus_di}.get(component, adx_line)

    if ind == "DONCHIAN":
        upper, middle, lower = donchian(df, period or 20)
        return {"lower": lower, "middle": middle}.get(component, upper)

    if ind == "VOLUME":
        return volume_indicator(df, period=period, component=component)

    if ind == "VWAP":
        return vwap(df, period=period)

    if ind == "OBV":
        return obv(df)

    if ind == "HAMMER":
        return hammer(df)

    if ind == "PINBAR":
        return pinbar(df, component=component)

    if ind == "ENGULFING":
        return engulfing(df, component=component)

    raise ValueError(f"Unsupported indicator: {indicator}")
