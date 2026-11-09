"""Standalone Python backtest generator.

The exported file needs only numpy and pandas. It carries Quantify's indicator module
verbatim, the strategy (rules interpreter + spec, or the user's own ``strategy(df)``),
and a compact copy of the engine with the same fill rules, so a run on the same CSV
reproduces the site's trades without the site.
"""

from __future__ import annotations

import re
from pathlib import Path
from pprint import pformat

from app.llm.schemas import StrategySpec

_HERE = Path(__file__).resolve().parent
_INDICATORS = _HERE.parent / "backtesting" / "indicators.py"
_MARKED = re.compile(r"# --- standalone:start ---\n(.*?)# --- standalone:end ---", re.S)

_TA_SHIM = '''class ta:
    """Same helpers the Quantify sandbox exposes to Python strategies."""
    sma = staticmethod(sma)
    ema = staticmethod(ema)
    rsi = staticmethod(rsi)
    macd = staticmethod(macd)
    bollinger = staticmethod(bollinger_bands)
    atr = staticmethod(atr)
    vwap = staticmethod(vwap)
    obv = staticmethod(obv)
'''

_MAIN = '''
def load_csv(path):
    df = pd.read_csv(path)
    df.columns = [str(c).strip().lower() for c in df.columns]
    if "date" not in df.columns:
        for alt in ("datetime", "timestamp", "time"):
            if alt in df.columns:
                df = df.rename(columns={alt: "date"})
                break
    if "volume" not in df.columns:
        df["volume"] = 0.0
    df["date"] = pd.to_datetime(df["date"])
    return df.sort_values("date").reset_index(drop=True)


def run(df):
    signals = strategy(df.copy())
    entry, exit_ = (np.nan_to_num(np.asarray(s, dtype=float), nan=0.0) != 0 for s in signals[:2])
    size = None
    if len(signals) == 3 and signals[2] is not None:
        size = np.clip(np.nan_to_num(np.broadcast_to(np.asarray(signals[2], dtype=float), len(df)), nan=0.0), 0.0, 1.0)
    trades, equity = backtest(df, SPEC, entry, exit_, size)
    return trades, equity, summarize(equity, trades, SPEC["initial_capital"])


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[1])
    parser.add_argument("csv", help="OHLCV CSV with date, open, high, low, close[, volume]")
    parser.add_argument("--trades", help="optional path to write the trade list as CSV")
    args = parser.parse_args()

    trades, equity, stats = run(load_csv(args.csv))
    for key, value in stats.items():
        shown = "n/a" if value is None else (f"{value:.4f}" if isinstance(value, float) else value)
        print(f"{key:>18}: {shown}")
    if args.trades:
        pd.DataFrame(trades).to_csv(args.trades, index=False)
        print(f"Trades written to {args.trades}")
'''


def _marked(path: Path) -> str:
    match = _MARKED.search(path.read_text(encoding="utf-8"))
    if not match:
        raise RuntimeError(f"standalone markers missing in {path.name}")
    return match.group(1).rstrip() + "\n"


def _indicator_source() -> str:
    text = _INDICATORS.read_text(encoding="utf-8")
    body = text.split("import pandas as pd", 1)[1]
    return body.strip() + "\n"


def generate_python_script(strategy: StrategySpec, title: str | None = None) -> str:
    """Self-contained script: python script.py data.csv [--trades trades.csv]."""
    spec = strategy.model_dump(mode="json")
    code = spec.pop("custom_code", None)
    name = (title or strategy.asset).replace('"""', "'''").strip().splitlines()[0][:120]

    if code:
        strategy_block = "# ---- your strategy (unchanged) ----\n" + code.rstrip() + "\n"
    else:
        strategy_block = (
            "# ---- rule interpreter ----\n"
            + _marked(_HERE / "standalone_rules.py")
            + "\n\ndef strategy(df):\n"
            + '    entry, exit_ = rule_signals(df, SPEC)\n'
            + "    return entry, exit_\n"
        )

    parts = [
        f'"""\nQuantify standalone backtest: {name}\n\n'
        "Exported from Quantify. Needs only numpy and pandas; no account, no server.\n"
        "Usage: python this_file.py prices.csv [--trades trades.csv]\n\n"
        "Fill rules match the site: signals at the close of bar t fill at the open of bar t+1,\n"
        "stops and takes are checked intrabar (stop first when both are touched), and every\n"
        "fill pays the slippage and commission below.\n"
        '"""\n',
        "from __future__ import annotations\n\nimport argparse\nimport math\n\nimport numpy as np\nimport pandas as pd\n",
        "\n# ---- strategy settings ----\nSPEC = " + pformat(spec, sort_dicts=False, width=100) + "\n",
        "\n# ---- indicators (verbatim from Quantify) ----\n" + _indicator_source(),
        "\n" + _TA_SHIM,
        "\n" + strategy_block,
        "\n# ---- engine ----\n" + _marked(_HERE / "standalone_engine.py"),
        _MAIN,
    ]
    return "\n".join(parts)
