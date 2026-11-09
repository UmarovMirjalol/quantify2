"""Pine Script v5 code generator from StrategySpec."""

from __future__ import annotations

from typing import Any
from app.llm.schemas import Condition, ConditionOp, IndicatorRef, IndicatorType, Side, StrategySpec


def _var_name(ref: IndicatorRef) -> str:
    ind = ref.indicator.value if hasattr(ref.indicator, "value") else str(ref.indicator)
    ind = ind.lower()
    if ind == "price":
        return ref.component if ref.component in ("open", "high", "low", "close") else "close"
    if ind == "sma":
        return f"sma_{ref.period}"
    if ind == "ema":
        return f"ema_{ref.period}"
    if ind == "rsi":
        return f"rsi_{ref.period}"
    if ind == "macd":
        return f"macd_{ref.component}"
    if ind == "bollinger":
        return f"bb_{ref.component}_{ref.period}"
    if ind == "atr":
        return f"atr_{ref.period}"
    if ind == "volume":
        if ref.component == "sma":
            return f"vol_sma_{ref.period or 20}"
        return "volume"
    if ind == "vwap":
        return "vwap_val"
    if ind == "obv":
        return "obv_val"
    if ind == "hammer":
        return "is_hammer"
    if ind == "pinbar":
        comp = ref.component if ref.component in ("bullish", "bearish") else "bullish"
        return f"is_{comp}_pinbar"
    if ind == "engulfing":
        comp = ref.component if ref.component in ("bullish", "bearish") else "bullish"
        return f"is_{comp}_engulfing"
    return f"{ind}_val"


def _format_side(side: IndicatorRef | float | int) -> str:
    if isinstance(side, (int, float)):
        return str(side)
    return _var_name(side)


def _condition_to_pine(cond: Condition) -> str:
    op = cond.operator
    left_str = _format_side(cond.left)
    right_str = _format_side(cond.right)

    if op == ConditionOp.GREATER_THAN:
        return f"({left_str} > {right_str})"
    if op == ConditionOp.LESS_THAN:
        return f"({left_str} < {right_str})"
    if op == ConditionOp.EQUALS:
        if isinstance(cond.right, (int, float)) and cond.right == 1.0:
            return f"({left_str})"
        return f"({left_str} == {right_str})"
    if op == ConditionOp.CROSS_ABOVE:
        return f"ta.crossover({left_str}, {right_str})"
    if op == ConditionOp.CROSS_BELOW:
        return f"ta.crossunder({left_str}, {right_str})"
    return f"({left_str} == {right_str})"


def generate_pine_script(strategy: StrategySpec, title: str | None = None) -> str:
    """Generate TradingView Pine Script v5 code from a StrategySpec."""
    if strategy.is_custom:
        raise ValueError("Pine Script cannot express arbitrary Python. Use the Python export instead.")
    strat_title = title or f"Quantify Strategy - {strategy.asset}"
    initial_cap = strategy.initial_capital
    commission_pct = (strategy.commission or 0.001) * 100.0

    lines: list[str] = [
        "//@version=5",
        f'strategy("{strat_title}", overlay=true, initial_capital={initial_cap:.0f}, default_qty_type=strategy.percent_of_equity, default_qty_value=100, commission_type=strategy.commission.percent, commission_value={commission_pct:.2f})',
        "",
        "// === INDICATORS ===",
    ]

    # Collect unique indicators
    indicators_seen: set[str] = set()

    all_refs: list[IndicatorRef] = []
    for c in strategy.entry_conditions + strategy.exit_conditions:
        if isinstance(c.left, IndicatorRef):
            all_refs.append(c.left)
        if isinstance(c.right, IndicatorRef):
            all_refs.append(c.right)

    for ref in all_refs:
        ind = ref.indicator.value if hasattr(ref.indicator, "value") else str(ref.indicator)
        var = _var_name(ref)
        if var in indicators_seen or var in ("close", "open", "high", "low", "volume"):
            continue
        indicators_seen.add(var)

        if ind == "SMA":
            lines.append(f"{var} = ta.sma(close, {ref.period})")
            lines.append(f'plot({var}, color=color.blue, title="SMA {ref.period}")')
        elif ind == "EMA":
            lines.append(f"{var} = ta.ema(close, {ref.period})")
            lines.append(f'plot({var}, color=color.orange, title="EMA {ref.period}")')
        elif ind == "RSI":
            lines.append(f"{var} = ta.rsi(close, {ref.period})")
        elif ind == "MACD":
            fast = ref.fast_period or 12
            slow = ref.slow_period or 26
            sig = ref.signal_period or 9
            if "macd_calc" not in indicators_seen:
                indicators_seen.add("macd_calc")
                lines.append(f"[macd_line, macd_signal, macd_hist] = ta.macd(close, {fast}, {slow}, {sig})")
        elif ind == "BOLLINGER":
            p = ref.period or 20
            sd = ref.std_dev or 2.0
            if f"bb_calc_{p}" not in indicators_seen:
                indicators_seen.add(f"bb_calc_{p}")
                lines.append(f"[bb_middle_{p}, bb_upper_{p}, bb_lower_{p}] = ta.bb(close, {p}, {sd})")
                lines.append(f'plot(bb_upper_{p}, color=color.gray, title="BB Upper")')
                lines.append(f'plot(bb_lower_{p}, color=color.gray, title="BB Lower")')
        elif ind == "ATR":
            lines.append(f"{var} = ta.atr({ref.period})")
        elif ind == "VOLUME" and ref.component == "sma":
            lines.append(f"{var} = ta.sma(volume, {ref.period or 20})")
        elif ind == "VWAP":
            lines.append(f"{var} = ta.vwap(hlc3)")
            lines.append(f'plot({var}, color=color.purple, title="VWAP")')
        elif ind == "OBV":
            lines.append(f"{var} = ta.obv")
        elif ind == "HAMMER":
            lines.extend([
                "hammer_range = high - low",
                "hammer_body = math.abs(close - open)",
                "hammer_lower = math.min(open, close) - low",
                "hammer_upper = high - math.max(open, close)",
                "is_hammer = (hammer_range > 0) and (hammer_lower >= 2.0 * hammer_body) and (hammer_upper <= 0.25 * hammer_range) and (hammer_body >= 0.05 * hammer_range)",
            ])
        elif ind == "PINBAR":
            if "pinbar_calc" not in indicators_seen:
                indicators_seen.add("pinbar_calc")
                lines.extend([
                    "pb_range = high - low",
                    "pb_body = math.abs(close - open)",
                    "pb_lower = math.min(open, close) - low",
                    "pb_upper = high - math.max(open, close)",
                    "is_bullish_pinbar = (pb_range > 0) and (pb_lower >= 0.55 * pb_range) and (pb_upper <= 0.25 * pb_range) and (pb_body <= 0.35 * pb_range)",
                    "is_bearish_pinbar = (pb_range > 0) and (pb_upper >= 0.55 * pb_range) and (pb_lower <= 0.25 * pb_range) and (pb_body <= 0.35 * pb_range)",
                ])
        elif ind == "ENGULFING":
            if "engulfing_calc" not in indicators_seen:
                indicators_seen.add("engulfing_calc")
                lines.extend([
                    "is_bullish_engulfing = (close[1] < open[1]) and (close > open) and (open <= close[1]) and (close >= open[1])",
                    "is_bearish_engulfing = (close[1] > open[1]) and (close < open) and (open >= close[1]) and (close <= open[1])",
                ])

    lines.append("")
    lines.append("// === STRATEGY RULES ===")

    short = strategy.side == Side.SHORT
    tag = "short" if short else "long"
    label = "Short" if short else "Long"
    stop_sign, take_sign = ("+", "-") if short else ("-", "+")

    # Entry condition
    entry_clauses = [_condition_to_pine(c) for c in strategy.entry_conditions]
    entry_glue = " and " if strategy.entry_logic.value == "AND" else " or "
    lines.append(f"enter_{tag} = {entry_glue.join(entry_clauses)}")

    # Exit condition
    exit_clauses = [_condition_to_pine(c) for c in strategy.exit_conditions]
    exit_glue = " and " if strategy.exit_logic.value == "AND" else " or "
    lines.append(f"exit_{tag} = {exit_glue.join(exit_clauses)}")

    lines.append("")
    lines.append("// === EXECUTION ===")
    lines.append(f"if (enter_{tag})")
    lines.append(f'    strategy.entry("{label}", strategy.{tag})')

    lines.append(f"if (exit_{tag})")
    lines.append(f'    strategy.close("{label}")')

    # Stop loss & Take profit
    if strategy.stop_loss is not None or strategy.take_profit is not None:
        lines.append("")
        lines.append("// Risk Management: Stops & Targets")
        stop_arg = f"stop = strategy.position_avg_price * (1.0 {stop_sign} {strategy.stop_loss})" if strategy.stop_loss else "stop = na"
        tp_arg = f"limit = strategy.position_avg_price * (1.0 {take_sign} {strategy.take_profit})" if strategy.take_profit else "limit = na"
        lines.append(f'strategy.exit("Bracket", "{label}", {stop_arg}, {tp_arg})')

    return "\n".join(lines) + "\n"

