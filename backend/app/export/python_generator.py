"""Python backtest script generator from StrategySpec."""

from __future__ import annotations

import json
from app.llm.schemas import StrategySpec


def generate_python_script(strategy: StrategySpec, title: str | None = None) -> str:
    """Generate standalone Python backtesting / bot script."""
    strat_dict = strategy.model_dump()
    strat_json = json.dumps(strat_dict, indent=4)
    asset = strategy.asset
    stop_loss = strategy.stop_loss
    take_profit = strategy.take_profit

    script = f'''"""
Quantify Trading Strategy Bot - {title or asset}
Generated automatically by Quantify Platform.
Requires: pandas, numpy
Run: python strategy_bot.py --data market_data.csv
"""

import argparse
import numpy as np
import pandas as pd

# Strategy configuration
STRATEGY_SPEC = {strat_json}


def calculate_indicators(df: pd.DataFrame) -> pd.DataFrame:
    """Calculate all technical indicators and Price Action patterns."""
    data = df.copy()
    close = data["close"]
    high = data["high"]
    low = data["low"]
    open_ = data["open"]
    volume = data["volume"]

    # Basic moving averages
    data["sma_20"] = close.rolling(20).mean()
    data["sma_50"] = close.rolling(50).mean()
    data["ema_12"] = close.ewm(span=12, adjust=False).mean()
    data["ema_26"] = close.ewm(span=26, adjust=False).mean()

    # RSI (14)
    delta = close.diff()
    gain = delta.clip(lower=0.0)
    loss = (-delta).clip(lower=0.0)
    avg_gain = gain.ewm(alpha=1/14, adjust=False).mean()
    avg_loss = loss.ewm(alpha=1/14, adjust=False).mean()
    rs = avg_gain / avg_loss.replace(0, np.nan)
    data["rsi_14"] = 100 - (100 / (1 + rs))

    # MACD
    data["macd_line"] = data["ema_12"] - data["ema_26"]
    data["macd_signal"] = data["macd_line"].ewm(span=9, adjust=False).mean()

    # VWAP
    typical_price = (high + low + close) / 3.0
    data["vwap"] = (typical_price * volume).cumsum() / volume.cumsum().replace(0, np.nan)

    # OBV
    direction = np.sign(close.diff()).fillna(0.0)
    data["obv"] = (direction * volume).cumsum()

    # Price Action: Pin-bar
    total_range = high - low
    body = (close - open_).abs()
    lower_shadow = open_.combine(close, min) - low
    upper_shadow = high - open_.combine(close, max)
    data["bullish_pinbar"] = (
        (total_range > 0)
        & (lower_shadow >= 0.55 * total_range)
        & (upper_shadow <= 0.25 * total_range)
        & (body <= 0.35 * total_range)
    ).astype(float)
    data["bearish_pinbar"] = (
        (total_range > 0)
        & (upper_shadow >= 0.55 * total_range)
        & (lower_shadow <= 0.25 * total_range)
        & (body <= 0.35 * total_range)
    ).astype(float)

    # Price Action: Hammer
    data["hammer"] = (
        (total_range > 0)
        & (lower_shadow >= 2.0 * body)
        & (upper_shadow <= 0.25 * total_range)
        & (body >= 0.05 * total_range)
    ).astype(float)

    return data


def run_backtest(df: pd.DataFrame, initial_capital: float = {strategy.initial_capital:.1f}):
    """Execute strategy simulation with risk management."""
    data = calculate_indicators(df)
    capital = initial_capital
    position = 0
    entry_price = 0.0
    trades = []
    equity_curve = [capital]

    stop_pct = {stop_loss if stop_loss is not None else "None"}
    take_pct = {take_profit if take_profit is not None else "None"}

    for i in range(1, len(data)):
        row = data.iloc[i]
        prev = data.iloc[i - 1]
        price = row["open"]  # Next-open fill

        # Check existing position for SL/TP
        if position > 0:
            hit_stop = stop_pct is not None and row["low"] <= entry_price * (1.0 - stop_pct)
            hit_take = take_pct is not None and row["high"] >= entry_price * (1.0 + take_pct)

            if hit_stop or hit_take:
                exit_price = entry_price * (1.0 - stop_pct) if hit_stop else entry_price * (1.0 + take_pct)
                pnl = position * (exit_price - entry_price)
                capital += position * exit_price
                trades.append({{"type": "EXIT_BRACKET", "price": exit_price, "pnl": pnl}})
                position = 0
                entry_price = 0.0

        equity = capital + position * row["close"]
        equity_curve.append(equity)

    total_return = (equity_curve[-1] - initial_capital) / initial_capital * 100.0
    print(f"=== BACKTEST COMPLETE ===")
    print(f"Initial Capital: ${{initial_capital:,.2f}}")
    print(f"Final Capital:   ${{equity_curve[-1]:,.2f}}")
    print(f"Total Return:    {{total_return:.2f}}%")
    print(f"Trades count:    {{len(trades)}}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Quantify Strategy Bot Runner")
    parser.add_argument("--data", type=str, default="sample_data.csv", help="Path to OHLCV CSV file")
    args = parser.parse_args()

    print(f"Loading data from {{args.data}}...")
    try:
        df = pd.read_csv(args.data)
        run_backtest(df)
    except FileNotFoundError:
        print(f"File {{args.data}} not found. Generating synthetic demo data...")
        dates = pd.date_range("2023-01-01", periods=100, freq="D")
        np.random.seed(42)
        close = 100.0 + np.cumsum(np.random.randn(100) * 1.5)
        df_demo = pd.DataFrame({{
            "date": dates,
            "open": close + np.random.randn(100) * 0.5,
            "high": close + np.random.rand(100) * 2.0,
            "low": close - np.random.rand(100) * 2.0,
            "close": close,
            "volume": np.random.randint(1000, 50000, size=100),
        }})
        run_backtest(df_demo)
'''
    return script

