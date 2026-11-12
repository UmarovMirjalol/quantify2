"""Curated strategy playbook shown on landing + /playbook."""

from __future__ import annotations

from typing import Any

PLAYBOOK: list[dict[str, Any]] = [
    {
        "id": "golden-cross",
        "title": "Golden cross",
        "tag": "Viral",
        "blurb": "The famous one: buy when the 50-day average crosses above the 200-day, sell on the death cross.",
        "text": (
            "Buy SPY when the 50-day SMA crosses above the 200-day SMA and sell when it crosses below. "
            "Use 100% of capital."
        ),
        "indicators": ["SMA"],
    },
    {
        "id": "monday-friday",
        "title": "Buy Monday, sell Friday",
        "tag": "Viral",
        "blurb": "A pure calendar rule: in the market Monday to Friday, in cash over the weekend.",
        "text": "Buy SPY on Monday and sell on Friday. Use 100% of capital.",
        "indicators": ["Calendar"],
    },
    {
        "id": "buy-the-dip",
        "title": "Buy the dip",
        "tag": "Viral",
        "blurb": "Buy after a 3% one-day drop, sell once price is back above its 20-day average.",
        "text": "Buy SPY when the price drops 3% in a day. Use 100% of capital.",
        "indicators": ["Change", "SMA"],
    },
    {
        "id": "crypto-weekend",
        "title": "Crypto weekend",
        "tag": "Viral",
        "blurb": "Hold Bitcoin only from Friday to Monday, the weekend everyone talks about.",
        "text": "Buy BTC-USD on Friday and sell on Monday. Use 100% of capital.",
        "indicators": ["Calendar"],
    },
    {
        "id": "pin-bar-support",
        "title": "Pin bar at support",
        "tag": "Price action",
        "blurb": "Long when a pin bar prints and price is under the 20-day average.",
        "text": (
            "Buy SPY when a pin bar forms on the daily chart and price is below the 20-day SMA. "
            "Exit when RSI exceeds 70. Risk 1% per trade."
        ),
        "indicators": ["PINBAR", "SMA", "RSI"],
    },
    {
        "id": "vwap-trend",
        "title": "VWAP trend",
        "tag": "Volume",
        "blurb": "Intraday trend: close crossing VWAP, confirmed by rising OBV.",
        "text": (
            "On the 15-minute chart, buy when price crosses above VWAP and OBV is rising. "
            "Sell when price crosses below VWAP. Risk 1% per trade."
        ),
        "indicators": ["VWAP", "OBV"],
    },
    {
        "id": "mtf-15m-4h",
        "title": "15m entry, 4h trend",
        "tag": "Multi-timeframe",
        "blurb": "Take 15-minute RSI dips only while the 4-hour trend is up.",
        "text": (
            "On the 15-minute chart, buy when RSI falls below 30, only if the trend on the "
            "4-hour chart is up. Sell when RSI rises above 60. Risk 1% per trade."
        ),
        "indicators": ["RSI", "SMA"],
    },
    {
        "id": "volume-breakout",
        "title": "Volume breakout",
        "tag": "Breakout",
        "blurb": "Close above the 20-day high zone only if volume expands.",
        "text": (
            "Buy when price closes above the 20-day SMA and volume is above its 20-day average. "
            "Sell when price closes below the 20-day SMA. Risk 1% per trade."
        ),
        "indicators": ["SMA", "VOLUME"],
    },
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
    {
        "id": "pinbar-support",
        "title": "Pin-bar Rejection",
        "tag": "Price Action",
        "blurb": "Rejection candle signal with a 2% stop-loss and a 5% target (2.5:1).",
        "text": (
            "Buy SPY when a Bullish Pin-bar pattern forms on daily chart. "
            "Use 2% stop-loss and 5% take-profit. Risk 1% per trade."
        ),
        "indicators": ["Pin-bar", "Stop", "TP"],
    },
    {
        "id": "hammer-bounce",
        "title": "Hammer Reversal",
        "tag": "Price Action",
        "blurb": "Classic candlestick hammer reversal after downward pressure.",
        "text": (
            "Buy when Hammer candlestick pattern appears on chart. "
            "Risk 1.5% per trade with 2% stop-loss and exit when RSI exceeds 70."
        ),
        "indicators": ["Hammer", "RSI", "Stop"],
    },
    {
        "id": "vwap-crossover",
        "title": "VWAP Institutional Bounce",
        "tag": "Volume Flow",
        "blurb": "Trade alongside volume-weighted average benchmark.",
        "text": (
            "Buy when price crosses above VWAP and sell when price crosses below VWAP. "
            "Risk 1% per trade with 1.5% stop-loss."
        ),
        "indicators": ["VWAP", "Volume", "Stop"],
    },
    {
        "id": "volume-spike",
        "title": "Volume Spike Breakout",
        "tag": "Breakout",
        "blurb": "Confirm high-volume momentum when volume exceeds its 20-day average.",
        "text": (
            "Buy when volume is above 20-day average volume and close is above 50-day SMA. "
            "Exit when close crosses below 20-day SMA. Use 2% stop-loss."
        ),
        "indicators": ["Volume", "SMA", "Breakout"],
    },
    {
        "id": "obv-trend",
        "title": "OBV Accumulation",
        "tag": "Volume Flow",
        "blurb": "Follow smart-money accumulation through On-Balance Volume.",
        "text": (
            "Buy when OBV is above 0 and 20-day SMA crosses above 50-day SMA. "
            "Risk 1% per trade and exit when OBV falls below 0."
        ),
        "indicators": ["OBV", "SMA", "Trend"],
    },
    {
        "id": "turtle-breakout",
        "title": "Turtle breakout",
        "tag": "Breakout",
        "blurb": "Donchian channel: buy a new 20-day high, exit on a 10-day low.",
        "text": (
            "Buy when price breaks above the 20-day high and sell when it breaks below the 10-day low. "
            "Risk 1% per trade."
        ),
        "indicators": ["Donchian", "Breakout"],
    },
    {
        "id": "stochastic-swing",
        "title": "Stochastic swing",
        "tag": "Mean reversion",
        "blurb": "%K crossing %D in oversold territory, out when overbought.",
        "text": (
            "Buy when Stochastic %K crosses above %D below 20 and sell when %K crosses below %D above 80. "
            "Risk 1% per trade."
        ),
        "indicators": ["Stochastic"],
    },
    {
        "id": "trend-strength",
        "title": "Trend with ADX filter",
        "tag": "Trend",
        "blurb": "Take SMA crosses only when ADX says the market is trending.",
        "text": (
            "Buy when the 20-day SMA crosses above the 50-day SMA and ADX above 25. "
            "Sell when the 20-day SMA crosses below the 50-day SMA. Risk 1% per trade."
        ),
        "indicators": ["SMA", "ADX"],
    },
]


RELEASES: list[dict[str, str]] = [
    {
        "title": "Price Action, Volume & Code Export",
        "body": "TradingView Pine Script v5 & Python export, candlestick patterns (Hammer, Pin-bar, Engulfing), VWAP/OBV volume indicators, MTF intraday testing, and portfolio backtest.",
    },
    {
        "title": "Durable live counters",
        "body": "Upstash-backed visitor and backtest totals so public stats stay consistent on Vercel.",
    },
    {
        "title": "Brand pack for quantifylab.xyz",
        "body": "favicon.ico, 48px+ PNGs, OG image, and shorter tab title for search surfaces.",
    },
    {
        "title": "Vercel container API",
        "body": "FastAPI API shipped as a container service so pandas/numpy load reliably in production.",
    },
    {
        "title": "Vercel Services split",
        "body": "Vite web + FastAPI api on one domain with /api rewrites.",
    },
    {
        "title": "History search & sort",
        "body": "Filter and sort saved backtests by return, Sharpe, drawdown, and trade count.",
    },
    {
        "title": "Edit & re-run",
        "body": "Deep-link a past run back into the workspace with the same strategy draft.",
    },
    {
        "title": "CSV / JSON export",
        "body": "Download trades, equity curve, and full metrics from the results view.",
    },
    {
        "title": "Buy & hold overlay",
        "body": "Benchmark strategy equity against a simple buy-and-hold path on the same bars.",
    },
    {
        "title": "Parse preview",
        "body": "Debounced live preview of asset, risk, and entry/exit rules before you run.",
    },
    {
        "title": "Parse preview & exports",
        "body": "Live parsed-spec preview, buy-and-hold overlay, CSV/JSON export, history search, edit & re-run.",
    },
    {
        "title": "Public free mode",
        "body": "Open landing with built-in parser, no signup, no API key required for core strategies.",
    },
    {
        "title": "Strategy of the day",
        "body": "Daily rotating preset plus Instant Try handoff into the workspace.",
    },
    {
        "title": "Guide & SEO surface",
        "body": "Crawlable guide, robots/sitemap, and FAQ structured data on the landing.",
    },
    {
        "title": "Daily fact",
        "body": "Rotating quant research notes on the public landing page.",
    },
    {
        "title": "Live stats",
        "body": "Public counters for users, backtests, and releases with visitor ping.",
    },
    {
        "title": "Activity pulse",
        "body": "Anonymized recent-run feed for the landing page.",
    },
    {
        "title": "Interactive demo",
        "body": "Chip-driven demo console with equity, metrics, and blotter.",
    },
    {
        "title": "Live pulse & playbook",
        "body": "Public activity feed, strategy gallery, and playbook presets.",
    },
    {
        "title": "Production edge",
        "body": "Docker Compose deploy, optional access gate, rate limits, smoke tests.",
    },
    {
        "title": "Research core",
        "body": "Plain-English strategies, look-ahead-safe engine, risk sizing, metrics, SQLite history.",
    },
]
