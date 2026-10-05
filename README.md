# QuantLLM Backtester

LLM-powered quantitative backtesting platform. Describe a long-only trading strategy in natural language, upload historical OHLCV data, and run a custom pandas/NumPy simulation with risk management, transaction costs, performance metrics, and charts.

> **Synthetic sample data:** `data/sample_data.csv` is a labeled synthetic OHLCV series for demos and tests. Results on this file are **not** real historical market performance.

## Features

- Natural-language strategy input with OpenAI-compatible LLM parsing
- Deterministic **Demo Mode** when no API key is set
- Strict Pydantic strategy specifications (no arbitrary code execution)
- Custom bar-by-bar backtesting engine (not a third-party wrapper)
- Risk engine: position sizing, stops, exposure, cash, leverage, costs, slippage
- CSV upload with validation
- Performance metrics (Sharpe, Sortino, CAGR, max drawdown, profit factor, …)
- Equity / drawdown / price-with-markers charts
- SQLite backtest history

## Architecture

```
Natural language
  → LLM / demo parser
  → StrategySpec (Pydantic)
  → validation
  → signal generation (indicators, causal)
  → BacktestEngine (signal at close → execute next open)
  → RiskEngine (sizing, stops, costs)
  → metrics + charts + SQLite persistence
```

| Layer | Stack |
|-------|--------|
| Backend | Python 3.12, FastAPI, Pydantic, pandas, NumPy, SQLAlchemy/SQLite |
| Frontend | React, TypeScript, Vite, Plotly |
| LLM | OpenAI-compatible Chat Completions API (optional) |

## Backtesting methodology

**Execution convention (look-ahead bias prevention):**

1. Indicators and signals at bar `t` use only data available at or before the close of bar `t`.
2. A signal observed at the close of bar `t` is executed at the **open of bar `t+1`**.
3. Stop-loss / take-profit are evaluated on the execution bar using high/low. If both could be hit in the same bar, the engine assumes the stop is hit first (conservative), unless the open gaps through the take-profit without trading through the stop.

Commission is modeled as a fraction of fill notional. Slippage worsens the fill price (higher for buys, lower for sells).

## Supported strategy components

**Indicators:** SMA, EMA, RSI, MACD, Bollinger Bands, ATR, PRICE  

**Conditions:** greater_than, less_than, crosses above/below, equals  

**Logic:** AND / OR across entry or exit condition lists  

**Risk:** fixed shares, % of capital, risk-per-trade sizing, stop-loss, take-profit, max position %, max exposure, leverage limit, commission, slippage  

MVP is **long-only**; short-selling can be added later via the existing `PositionSide.SHORT` placeholder.

## Project structure

```
backend/
  app/
    main.py              # FastAPI app
    config.py
    database.py
    api/routes.py
    llm/                 # parser, schemas, prompts
    backtesting/         # engine, indicators, portfolio, orders, positions
    risk/risk_engine.py
    data/                # CSV loader + validators
    metrics/performance.py
    models/backtest.py
    strategies/interpreter.py
  tests/
frontend/                # React + Vite UI
data/sample_data.csv     # synthetic demo dataset
uploads/                 # uploaded CSVs (runtime)
docker-compose.yml
.env.example
```

## Installation

### Prerequisites

- Python 3.11+
- Node.js 20+
- (Optional) OpenAI-compatible API key

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

Copy environment file from the repo root:

```bash
cp ../.env.example ../.env
```

### Frontend

```bash
cd frontend
npm install
```

## Environment variables

See `.env.example`:

| Variable | Purpose |
|----------|---------|
| `LLM_API_KEY` | API key for OpenAI-compatible endpoint. Empty → Demo Mode |
| `LLM_MODEL` | Model name (default `gpt-4o-mini`) |
| `LLM_BASE_URL` | API base URL (default OpenAI) |
| `DATABASE_URL` | SQLAlchemy URL (default SQLite file) |
| `CORS_ORIGINS` | Comma-separated allowed origins |
| `DEMO_MODE_FORCE` | Set `true` to force demo parsing even if a key is present |

**Never commit real secrets.** `.env` is gitignored.

## How to run

### Backend (port 8765)

```bash
cd backend
export PYTHONPATH=.
uvicorn app.main:app --host 127.0.0.1 --port 8765 --reload
```

API docs: http://127.0.0.1:8765/docs

### Frontend (port 4173)

```bash
cd frontend
npm run dev
```

Open http://127.0.0.1:4173 — the Vite dev server proxies `/api` to the backend.

### Docker Compose

```bash
docker compose up --build
```

## How to run the demo (no API key)

1. Leave `LLM_API_KEY` empty.
2. Start backend + frontend.
3. Open the UI — the header shows **Demo Mode**.
4. Use an example strategy (or paste one below) and the built-in `sample_data.csv`.
5. Click **Run Backtest**.

Demo mode matches predefined natural-language patterns (SMA crossover, RSI, EMA, Bollinger, MACD). Unrecognized text returns a clear error until you enable an LLM.

## How to enable a real LLM

1. Set in `.env`:

```bash
LLM_API_KEY=sk-...
LLM_MODEL=gpt-4o-mini
LLM_BASE_URL=https://api.openai.com/v1
```

2. Restart the backend. Health endpoint `/api/health` should report `llm_enabled: true`.
3. Any OpenAI-compatible provider works by changing `LLM_BASE_URL` and `LLM_MODEL`.

The LLM must return JSON conforming to `StrategySpec`. Output is validated with Pydantic; invalid payloads are rejected. **No LLM-generated code is executed.**

## Uploading data

CSV must include columns:

```text
date,open,high,low,close,volume
```

Validation rejects missing columns, invalid dates, duplicates, non-numeric prices, and non-positive prices. Unsorted data is sorted ascending with a warning.

Use the upload control on the home page, or:

```bash
curl -F "file=@my_data.csv" http://127.0.0.1:8765/api/data/upload
```

## Example strategies

```text
Buy SPY when the 20-day SMA crosses above the 50-day SMA and sell when the 20-day SMA crosses below the 50-day SMA. Risk 1% per trade.
```

```text
Buy when RSI falls below 30 and sell when RSI rises above 70.
```

```text
Buy when the 12-day EMA crosses above the 26-day EMA and sell when it crosses below. Use a 2% stop-loss and 5% take-profit.
```

```text
Buy when price closes below the lower Bollinger Band and sell when it crosses above the middle band.
```

## API

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Status + demo/LLM mode |
| POST | `/api/parse-strategy` | NL → StrategySpec |
| POST | `/api/backtest` | Parse (optional) + run + save |
| GET | `/api/backtests` | History list |
| GET | `/api/backtests/{id}` | Full saved result |
| POST | `/api/data/upload` | Upload CSV |
| GET | `/api/datasets` | List sample + uploaded files |

## Tests

```bash
cd backend
export PYTHONPATH=.
pytest -q
```

Coverage includes CSV validation, SMA/EMA/RSI, MA crossover, entry/exit execution, position sizing, stop-loss, take-profit, costs, slippage, drawdown, Sharpe, look-ahead checks, invalid strategy rejection, demo/LLM schema validation, and an end-to-end NL → metrics path.

## Limitations

- Long-only (no short selling yet)
- Single-asset backtests per run
- Integer share sizing
- Limited indicator/condition set for MVP
- Demo mode only recognizes a fixed set of strategy phrasings
- Intrabar stop/take paths use conservative assumptions when both are touched
- Synthetic sample data is not investable market history
- No portfolio multi-strategy or live brokerage connectivity

## License

MIT
