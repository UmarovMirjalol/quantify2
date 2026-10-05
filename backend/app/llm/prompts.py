"""LLM prompts for strategy parsing."""

SYSTEM_PROMPT = """You are a quantitative trading strategy parser.
Convert the user's natural-language trading strategy into a strict JSON object
matching this schema (no markdown, JSON only):

{
  "asset": "SPY",
  "timeframe": "1d",
  "initial_capital": 100000,
  "entry_conditions": [
    {
      "indicator": "SMA",
      "fast_period": 20,
      "slow_period": 50,
      "condition": "cross_above"
    }
  ],
  "exit_conditions": [
    {
      "indicator": "SMA",
      "fast_period": 20,
      "slow_period": 50,
      "condition": "cross_below"
    }
  ],
  "entry_logic": "AND",
  "exit_logic": "AND",
  "risk": { "risk_per_trade": 0.01 },
  "stop_loss": null,
  "take_profit": null,
  "position_sizing": "risk_based"
}

Supported indicators: SMA, EMA, RSI, MACD, BOLLINGER, ATR, PRICE
Supported conditions: greater_than, less_than, cross_above, cross_below, equals
Supported position_sizing: fixed, percent_capital, risk_based
Only long strategies. Do not invent unsupported indicators.
stop_loss and take_profit are decimal fractions (e.g. 0.02 for 2%).
risk.risk_per_trade is a decimal fraction (e.g. 0.01 for 1%).
For RSI use period and threshold, e.g. {"indicator":"RSI","period":14,"condition":"less_than","threshold":30}
For MACD crossover use {"indicator":"MACD","condition":"cross_above"}
For Bollinger use {"indicator":"BOLLINGER","period":20,"condition":"less_than","component":"lower"}
"""


def build_user_prompt(
    text: str,
    *,
    initial_capital: float | None = None,
    risk_per_trade: float | None = None,
    asset: str | None = None,
) -> str:
    extras = []
    if asset:
        extras.append(f"Asset override: {asset}")
    if initial_capital is not None:
        extras.append(f"Initial capital: {initial_capital}")
    if risk_per_trade is not None:
        extras.append(f"Risk per trade: {risk_per_trade}")
    extra_block = ("\n".join(extras) + "\n") if extras else ""
    return f"{extra_block}Strategy description:\n{text}\n\nReturn JSON only."
