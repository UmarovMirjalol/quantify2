"""Curated strategy playbook shown on landing + /playbook."""

from __future__ import annotations

from typing import Any

PLAYBOOK: list[dict[str, Any]] = [
    {
        "id": "sma-cross",
        "title": "SMA crossover",
        "tag": "Trend",
        "blurb": "Classic 20/50 moving-average cross with RSI take-profit.",
        "text": (
            "Buy SPY when the 20-day moving average crosses above the 50-day moving average. "
            "Risk 1% per trade and exit when RSI exceeds 70."
        ),
        "indicators": ["SMA", "RSI"],
    },
    {
        "id": "rsi-reversion",
        "title": "RSI mean reversion",
        "tag": "Mean reversion",
        "blurb": "Buy oversold, sell overbought — simple threshold rules.",
        "text": (
            "Buy when RSI falls below 30 and sell when RSI rises above 70. "
            "Risk 1% per trade."
        ),
        "indicators": ["RSI"],
    },
    {
        "id": "ema-stops",
        "title": "EMA trend + stops",
        "tag": "Trend",
        "blurb": "12/26 EMA cross with hard stop-loss and take-profit.",
        "text": (
            "Buy when the 12-day EMA crosses above the 26-day EMA and sell when it crosses below. "
            "Use a 2% stop-loss and 5% take-profit."
        ),
        "indicators": ["EMA", "Stop", "TP"],
    },
    {
        "id": "bollinger-bounce",
        "title": "Bollinger bounce",
        "tag": "Volatility",
        "blurb": "Fade touches of the lower band back to the middle.",
        "text": (
            "Buy when price closes below the lower Bollinger Band and sell when it crosses "
            "above the middle band. Risk 1% per trade."
        ),
        "indicators": ["Bollinger"],
    },
    {
        "id": "macd-momentum",
        "title": "MACD momentum",
        "tag": "Momentum",
        "blurb": "Enter on MACD signal-line cross, exit on reverse.",
        "text": (
            "Buy when MACD crosses above its signal line and sell when MACD crosses below "
            "the signal line. Risk 1% per trade."
        ),
        "indicators": ["MACD"],
    },
    {
        "id": "dual-filter",
        "title": "Trend + RSI filter",
        "tag": "Hybrid",
        "blurb": "Only take SMA crosses when RSI is not overbought.",
        "text": (
            "Buy when the 20-day SMA crosses above the 50-day SMA and RSI is below 60. "
            "Sell when the 20-day SMA crosses below the 50-day SMA or RSI exceeds 75. "
            "Risk 1% per trade."
        ),
        "indicators": ["SMA", "RSI"],
    },
]


RELEASES: list[dict[str, str]] = [
    {
        "version": "0.20",
        "title": "Durable live counters",
        "body": "Upstash-backed visitor and backtest totals so public stats stay consistent on Vercel.",
    },
    {
        "version": "0.19",
        "title": "Brand pack for quantifylab.xyz",
        "body": "favicon.ico, 48px+ PNGs, OG image, and shorter tab title for search surfaces.",
    },
    {
        "version": "0.18",
        "title": "Vercel container API",
        "body": "FastAPI API shipped as a container service so pandas/numpy load reliably in production.",
    },
    {
        "version": "0.17",
        "title": "Vercel Services split",
        "body": "Vite web + FastAPI api on one domain with /api rewrites.",
    },
    {
        "version": "0.16",
        "title": "History search & sort",
        "body": "Filter and sort saved backtests by return, Sharpe, drawdown, and trade count.",
    },
    {
        "version": "0.15",
        "title": "Edit & re-run",
        "body": "Deep-link a past run back into the workspace with the same strategy draft.",
    },
    {
        "version": "0.14",
        "title": "CSV / JSON export",
        "body": "Download trades, equity curve, and full metrics from the results view.",
    },
    {
        "version": "0.13",
        "title": "Buy & hold overlay",
        "body": "Benchmark strategy equity against a simple buy-and-hold path on the same bars.",
    },
    {
        "version": "0.12",
        "title": "Parse preview",
        "body": "Debounced live preview of asset, risk, and entry/exit rules before you run.",
    },
    {
        "version": "0.11",
        "title": "Parse preview & exports",
        "body": "Live parsed-spec preview, buy-and-hold overlay, CSV/JSON export, history search, edit & re-run.",
    },
    {
        "version": "0.10",
        "title": "Public free mode",
        "body": "Open landing with built-in parser, no signup, no API key required for core strategies.",
    },
    {
        "version": "0.9",
        "title": "Strategy of the day",
        "body": "Daily rotating preset plus Instant Try handoff into the workspace.",
    },
    {
        "version": "0.8",
        "title": "Guide & SEO surface",
        "body": "Crawlable guide, robots/sitemap, and FAQ structured data on the landing.",
    },
    {
        "version": "0.7",
        "title": "Daily fact",
        "body": "Rotating quant research notes on the public landing page.",
    },
    {
        "version": "0.6",
        "title": "Live stats",
        "body": "Public counters for users, backtests, and releases with visitor ping.",
    },
    {
        "version": "0.5",
        "title": "Activity pulse",
        "body": "Anonymized recent-run feed for the landing page.",
    },
    {
        "version": "0.4",
        "title": "Interactive demo",
        "body": "Chip-driven demo console with equity, metrics, and blotter.",
    },
    {
        "version": "0.3",
        "title": "Live pulse & playbook",
        "body": "Public activity feed, strategy gallery, and playbook presets.",
    },
    {
        "version": "0.2",
        "title": "Production edge",
        "body": "Docker Compose deploy, optional access gate, rate limits, smoke tests.",
    },
    {
        "version": "0.1",
        "title": "Research core",
        "body": "Plain-English strategies, look-ahead-safe engine, risk sizing, metrics, SQLite history.",
    },
]
