# Deploy QuantLLM Backtester

Production deployment uses Docker Compose with three services behind one public port:

```
Browser → edge (nginx :80)
            ├─ /api,/docs  → backend (FastAPI)
            └─ /           → frontend (static SPA)
```

## Requirements

- Docker Engine 24+
- Docker Compose v2
- Ports: host `APP_PORT` (default **80**)

## Quick start

```bash
cp .env.production.example .env
# optional: set LLM_API_KEY, APP_PORT=8080, …

./deploy/scripts/deploy.sh
# or: make deploy
```

Open:

- App: `http://YOUR_HOST/` (or `http://YOUR_HOST:$APP_PORT/`)
- Health: `http://YOUR_HOST/api/health`
- API docs: `http://YOUR_HOST/docs`

Smoke test:

```bash
./deploy/scripts/smoke.sh
# APP_PORT=8080 ./deploy/scripts/smoke.sh http://127.0.0.1:8080
```

Stop:

```bash
./deploy/scripts/down.sh          # keep DB/uploads volumes
./deploy/scripts/down.sh --purge  # delete volumes
```

## Environment

See `.env.production.example`:

| Variable | Default | Notes |
|----------|---------|--------|
| `APP_PORT` | `80` | Host port for edge nginx |
| `IMAGE_TAG` | `latest` | Docker image tag |
| `LLM_API_KEY` | empty | Enables LLM parser |
| `LLM_MODEL` | `gpt-4o-mini` | |
| `LLM_BASE_URL` | OpenAI | Any OpenAI-compatible API |
| `CORS_ORIGINS` | `*` | Same-origin via edge is fine |
| `MAX_UPLOAD_SIZE_MB` | `25` | CSV upload limit |

Secrets stay in `.env` (gitignored). Never bake keys into images.

## Architecture details

| Service | Image | Role |
|---------|-------|------|
| `backend` | `Dockerfile.backend` | FastAPI, SQLite, sample data baked in |
| `frontend` | `Dockerfile.frontend` | Vite build served by nginx |
| `edge` | `Dockerfile.edge` | Reverse proxy, single public port |

Persistent volumes:

- `backtest-db` → `/data/backtests.db`
- `uploads-data` → `/app/uploads`

Healthchecks run on backend, frontend, and edge.

## HTTPS / cloud

Put a TLS terminator in front of `edge`:

- **Caddy / Traefik / nginx** on the host
- **AWS ALB / GCP LB / Cloudflare** pointing to `APP_PORT`
- Or change edge to listen with certs (extend `deploy/nginx/edge.conf`)

Example Traefik label approach is left to your orchestrator; the container already speaks plain HTTP on port 80 inside the network.

## Local non-Docker run

Still supported for development — see root `README.md`.

```bash
# API
cd backend && PYTHONPATH=. uvicorn app.main:app --host 127.0.0.1 --port 8765

# UI (proxies /api → 8765)
cd frontend && npm run dev
```

## Dev Compose overlay

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```

Exposes backend `:8765`, frontend `:4173`, edge `:8080` by default.

## Troubleshooting

```bash
docker compose ps
docker compose logs backend --tail=100
docker compose logs edge --tail=100
curl -v http://127.0.0.1:${APP_PORT:-80}/api/health
```

If port 80 is busy: set `APP_PORT=8080` in `.env` and redeploy.

## CI suggestion

```yaml
# example
- run: docker compose build
- run: docker compose up -d
- run: ./deploy/scripts/smoke.sh http://127.0.0.1:80
```
