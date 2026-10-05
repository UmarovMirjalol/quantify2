"""Pydantic schemas for structured trading strategies."""

from __future__ import annotations

from enum import Enum
from typing import Annotated, Literal, Union

from pydantic import BaseModel, Field, field_validator, model_validator


class IndicatorType(str, Enum):
    SMA = "SMA"
    EMA = "EMA"
    RSI = "RSI"
    MACD = "MACD"
    BOLLINGER = "BOLLINGER"
    ATR = "ATR"
    PRICE = "PRICE"


class ConditionOp(str, Enum):
    GREATER_THAN = "greater_than"
    LESS_THAN = "less_than"
    CROSS_ABOVE = "cross_above"
    CROSS_BELOW = "cross_below"
    EQUALS = "equals"


class LogicOp(str, Enum):
    AND = "AND"
    OR = "OR"


class PositionSizing(str, Enum):
    FIXED = "fixed"
    PERCENT_CAPITAL = "percent_capital"
    RISK_BASED = "risk_based"


class Side(str, Enum):
    LONG = "long"
    # SHORT reserved for future extension
    # SHORT = "short"


class IndicatorRef(BaseModel):
    """Reference to an indicator series or a price field."""

    indicator: IndicatorType
    period: int | None = Field(default=None, ge=1, le=500)
    fast_period: int | None = Field(default=None, ge=1, le=500)
    slow_period: int | None = Field(default=None, ge=1, le=500)
    signal_period: int | None = Field(default=None, ge=1, le=100)
    std_dev: float | None = Field(default=None, ge=0.1, le=10.0)
    # For Bollinger: which band (upper/middle/lower); for MACD: line/signal/histogram
    component: Literal[
        "value",
        "upper",
        "middle",
        "lower",
        "macd",
        "signal",
        "histogram",
        "open",
        "high",
        "low",
        "close",
    ] = "value"

    @model_validator(mode="after")
    def validate_periods(self) -> IndicatorRef:
        ind = self.indicator
        if ind in (IndicatorType.SMA, IndicatorType.EMA, IndicatorType.RSI, IndicatorType.ATR):
            if self.period is None:
                raise ValueError(f"{ind.value} requires 'period'")
        if ind == IndicatorType.MACD:
            if self.fast_period is None:
                self.fast_period = 12
            if self.slow_period is None:
                self.slow_period = 26
            if self.signal_period is None:
                self.signal_period = 9
            if self.fast_period >= self.slow_period:
                raise ValueError("MACD fast_period must be less than slow_period")
            if self.component == "value":
                self.component = "macd"
        if ind == IndicatorType.BOLLINGER:
            if self.period is None:
                self.period = 20
            if self.std_dev is None:
                self.std_dev = 2.0
            if self.component == "value":
                self.component = "middle"
        if ind == IndicatorType.PRICE:
            if self.component not in ("open", "high", "low", "close"):
                self.component = "close"
        return self


class Condition(BaseModel):
    """A single entry or exit condition comparing two sides."""

    left: IndicatorRef
    operator: ConditionOp
    right: IndicatorRef | float
    # Convenience fields for common MA crossover shorthand from LLM
    indicator: IndicatorType | None = None
    fast_period: int | None = None
    slow_period: int | None = None
    condition: ConditionOp | None = None
    threshold: float | None = None
    period: int | None = None

    @model_validator(mode="before")
    @classmethod
    def expand_shorthand(cls, data: object) -> object:
        """Expand LLM shorthand like {indicator: SMA, fast_period, slow_period, condition}."""
        if not isinstance(data, dict):
            return data
        if "left" in data and "operator" in data:
            return data

        indicator = data.get("indicator")
        condition = data.get("condition") or data.get("operator")
        if indicator and condition:
            ind = IndicatorType(indicator) if isinstance(indicator, str) else indicator
            op = ConditionOp(condition) if isinstance(condition, str) else condition
            fast = data.get("fast_period")
            slow = data.get("slow_period")
            period = data.get("period")
            threshold = data.get("threshold")
            component = data.get("component", "value")

            if ind in (IndicatorType.SMA, IndicatorType.EMA) and fast and slow:
                return {
                    "left": {
                        "indicator": ind.value if isinstance(ind, IndicatorType) else ind,
                        "period": int(fast),
                    },
                    "operator": op.value if isinstance(op, ConditionOp) else op,
                    "right": {
                        "indicator": ind.value if isinstance(ind, IndicatorType) else ind,
                        "period": int(slow),
                    },
                    "indicator": ind,
                    "fast_period": fast,
                    "slow_period": slow,
                    "condition": op,
                }

            if ind == IndicatorType.RSI:
                thr = threshold if threshold is not None else 30.0
                if op in (ConditionOp.CROSS_ABOVE, ConditionOp.GREATER_THAN) and thr < 50:
                    # typically oversold recovery uses cross_above 30
                    pass
                return {
                    "left": {
                        "indicator": "RSI",
                        "period": int(period or 14),
                    },
                    "operator": op.value if isinstance(op, ConditionOp) else op,
                    "right": float(thr),
                    "indicator": ind,
                    "period": period or 14,
                    "condition": op,
                    "threshold": thr,
                }

            if ind == IndicatorType.MACD:
                return {
                    "left": {
                        "indicator": "MACD",
                        "fast_period": data.get("fast_period", 12),
                        "slow_period": data.get("slow_period", 26),
                        "signal_period": data.get("signal_period", 9),
                        "component": "macd",
                    },
                    "operator": op.value if isinstance(op, ConditionOp) else op,
                    "right": {
                        "indicator": "MACD",
                        "fast_period": data.get("fast_period", 12),
                        "slow_period": data.get("slow_period", 26),
                        "signal_period": data.get("signal_period", 9),
                        "component": "signal",
                    },
                    "indicator": ind,
                    "condition": op,
                }

            if ind == IndicatorType.BOLLINGER:
                band = component if component in ("upper", "lower", "middle") else "lower"
                return {
                    "left": {"indicator": "PRICE", "component": "close"},
                    "operator": op.value if isinstance(op, ConditionOp) else op,
                    "right": {
                        "indicator": "BOLLINGER",
                        "period": int(period or 20),
                        "std_dev": float(data.get("std_dev", 2.0)),
                        "component": band,
                    },
                    "indicator": ind,
                    "period": period or 20,
                    "condition": op,
                }

            if ind == IndicatorType.ATR and threshold is not None:
                return {
                    "left": {
                        "indicator": "ATR",
                        "period": int(period or 14),
                    },
                    "operator": op.value if isinstance(op, ConditionOp) else op,
                    "right": float(threshold),
                    "indicator": ind,
                    "period": period or 14,
                    "condition": op,
                    "threshold": threshold,
                }

            if threshold is not None and period is not None:
                return {
                    "left": {
                        "indicator": ind.value if isinstance(ind, IndicatorType) else ind,
                        "period": int(period),
                        "component": component,
                    },
                    "operator": op.value if isinstance(op, ConditionOp) else op,
                    "right": float(threshold),
                    "indicator": ind,
                    "period": period,
                    "condition": op,
                    "threshold": threshold,
                }

        raise ValueError(
            "Condition must include left/operator/right or shorthand indicator fields"
        )


class RiskConfig(BaseModel):
    """Risk parameters attached to a strategy."""

    risk_per_trade: float = Field(default=0.01, ge=0.0001, le=1.0)
    max_position_pct: float = Field(default=1.0, ge=0.01, le=1.0)
    max_portfolio_exposure: float = Field(default=1.0, ge=0.01, le=2.0)
    max_leverage: float = Field(default=1.0, ge=1.0, le=5.0)
    fixed_shares: int | None = Field(default=None, ge=1)
    percent_capital: float | None = Field(default=None, ge=0.01, le=1.0)


class StrategySpec(BaseModel):
    """Strict structured representation of a trading strategy."""

    asset: str = Field(default="SPY", min_length=1, max_length=32)
    timeframe: str = Field(default="1d", pattern=r"^(1d|1h|4h|1w)$")
    side: Side = Side.LONG
    initial_capital: float = Field(default=100_000.0, gt=0, le=1e9)
    entry_conditions: list[Condition] = Field(min_length=1, max_length=5)
    exit_conditions: list[Condition] = Field(min_length=1, max_length=5)
    entry_logic: LogicOp = LogicOp.AND
    exit_logic: LogicOp = LogicOp.AND
    risk: RiskConfig = Field(default_factory=RiskConfig)
    stop_loss: float | None = Field(default=None, ge=0.001, le=0.5)
    take_profit: float | None = Field(default=None, ge=0.001, le=5.0)
    position_sizing: PositionSizing = PositionSizing.RISK_BASED
    commission: float = Field(default=0.0, ge=0.0, le=0.05)
    slippage: float = Field(default=0.0, ge=0.0, le=0.05)

    @field_validator("asset")
    @classmethod
    def normalize_asset(cls, v: str) -> str:
        return v.strip().upper()

    @model_validator(mode="after")
    def validate_risk_sizing(self) -> StrategySpec:
        if self.position_sizing == PositionSizing.FIXED and not self.risk.fixed_shares:
            self.risk.fixed_shares = 100
        if self.position_sizing == PositionSizing.PERCENT_CAPITAL:
            if self.risk.percent_capital is None:
                self.risk.percent_capital = 0.1
        if self.position_sizing == PositionSizing.RISK_BASED:
            if self.stop_loss is None and self.risk.risk_per_trade > 0:
                # Without stop-loss, risk-based sizing falls back to percent of capital
                pass
        if len(self.entry_conditions) + len(self.exit_conditions) > 8:
            raise ValueError("Strategy too complex: max 8 total conditions for MVP")
        return self


class ParseStrategyRequest(BaseModel):
    text: str = Field(min_length=5, max_length=4000)
    initial_capital: float | None = Field(default=None, gt=0)
    risk_per_trade: float | None = Field(default=None, ge=0.0001, le=1.0)
    commission: float | None = Field(default=None, ge=0.0, le=0.05)
    slippage: float | None = Field(default=None, ge=0.0, le=0.05)
    asset: str | None = None


class ParseStrategyResponse(BaseModel):
    strategy: StrategySpec
    demo_mode: bool
    raw_text: str
    warnings: list[str] = Field(default_factory=list)


class BacktestConfig(BaseModel):
    initial_capital: float = Field(default=100_000.0, gt=0, le=1e9)
    commission: float = Field(default=0.001, ge=0.0, le=0.05)
    slippage: float = Field(default=0.0005, ge=0.0, le=0.05)
    risk_per_trade: float | None = Field(default=None, ge=0.0001, le=1.0)
