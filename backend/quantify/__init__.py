"""Public Python API for Quantify — same engine the site runs.

Example::

    from quantify import Engine, load_csv

    df = load_csv("SPY.csv")
    result = Engine.from_text(
        "Buy when the 20-day SMA crosses above the 50-day SMA and sell when it crosses below."
    ).run(df)

    print(result["metrics"]["sharpe_ratio"], len(result["trades"]))
"""

from __future__ import annotations

from quantify.api import Engine, farm, load_csv, paper, playbook_farm, portfolio, risk

__all__ = ["Engine", "load_csv", "portfolio", "farm", "playbook_farm", "paper", "risk"]
