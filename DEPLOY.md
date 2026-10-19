# Deploy Quantify

## Vercel (recommended for quick public URL)

Stack is already wired as **Vercel Services** (Vite SPA + FastAPI) via root [`vercel.json`](vercel.json).

```
Users → Vercel edge
          ├─ /api/*  → api service (FastAPI, Fluid)
          └─ /*      → web service (Vite SPA)
```

### One-time setup

1. Push this repo to GitHub (already at `UmarovMirjalol/quantify2` if you use that remote).
2. [vercel.com/new](https://vercel.com/new) → Import the repo.
3. **Framework Preset: Services** (required when `services` is in `vercel.json`).
4. Root Directory: leave as repo root (`.`).
5. Add env vars from [`.env.vercel.example`](.env.vercel.example) (at least `APP_ENV=production`, `FORCE_BUILTIN_PARSER=true`, `CORS_ORIGINS=*`).
6. Deploy.

CLI alternative:

```bash
npm i -g vercel
vercel link          # Framework: Services
vercel env pull      # optional
vercel --prod
```

Same-origin API: leave `VITE_API_URL` unset so the SPA calls `/api/...` and Vercel rewrites hit the FastAPI service.

### Vercel caveats

- The API runs as a **container** (`backend/Dockerfile.vercel`) so pandas/numpy load reliably. Framework Preset must stay **Services**.
- SQLite + CSV uploads live under `/tmp` (ephemeral). History can reset on cold starts / new instances. Fine for demos; for durable history later attach Neon (Postgres) or keep Docker Compose.
- **Landing counters** (users / backtests) need Upstash Redis or they reset between instances. Set `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` in Vercel env (see `.env.vercel.example`).
- Leave `APP_ACCESS_TOKEN` empty for public free mode. If you set a token, the Access Gate appears.
- Free Hobby: enough for a public demo with the built-in parser (no OpenAI key).

### If you see “API unreachable” on Vercel

1. Confirm Project → Settings → General → **Framework Preset = Services**
2. Redeploy the latest `main` (container API)
3. Hit `https://YOUR_APP.vercel.app/api/health` — should return JSON `{"status":"ok",...}` not `FUNCTION_INVOCATION_FAILED`

---

## Docker Compose (full persistence)

Production stack: Docker Compose + access token + optional HTTPS.

```
Users → (optional Caddy HTTPS) → edge nginx :APP_PORT
                                    ├─ /api → backend (FastAPI + SQLite)
                                    └─ /    → frontend (SPA)
```

## One-command deploy

```bash
cp .env.production.example .env.production
# optional: edit APP_PORT / LLM_API_KEY
./deploy/scripts/deploy.sh
# or: make deploy
```

The script:

1. Uses `.env.production` (does not overwrite local `.env`)
2. Generates `APP_ACCESS_TOKEN` if empty
3. Builds & starts containers
4. Prints the access token to share with users

Open `http://YOUR_HOST:${APP_PORT}/`, paste the token once, then use the app.

Smoke:

```bash
export APP_ACCESS_TOKEN=$(grep APP_ACCESS_TOKEN .env.production | cut -d= -f2-)
./deploy/scripts/smoke.sh http://127.0.0.1:${APP_PORT:-80}
```

Public (no token) landing endpoints: `/api/health`, `/api/stats`, `/api/stats/ping`, `/api/pulse`, `/api/playbook`, `/api/releases`.

## Google Search / Search Console

After you put Quantify on a public domain:

1. Confirm these return 200 (not the SPA HTML shell):
   - `https://YOUR_DOMAIN/robots.txt`
   - `https://YOUR_DOMAIN/sitemap.xml`
2. In [Google Search Console](https://search.google.com/search-console) → add property → submit sitemap `https://YOUR_DOMAIN/sitemap.xml`
3. Optional: edit `frontend/public/sitemap.xml` and replace paths with absolute `https://YOUR_DOMAIN/...` URLs before rebuild
4. Landing includes FAQ + WebApplication JSON-LD, Strategy of the Day, Instant Try, and `/guide` for crawlable copy

Public free mode (`PUBLIC_ACCESS=true`) is what you want indexed — no login wall.

## Free public launch (recommended for end users)

Default in `.env.production.example`:

```bash
PUBLIC_ACCESS=true
APP_ACCESS_TOKEN=
FORCE_BUILTIN_PARSER=true
LLM_API_KEY=
```

Users open the URL and run backtests **with no login and no API key**.  
Free strategies: SMA/EMA cross, RSI, MACD, Bollinger (+ the Playbook gallery).

Rate limit still protects the server (`RATE_LIMIT_PER_MINUTE`).

## Where do the keys come from?

### 1) Access token — `APP_ACCESS_TOKEN` (optional)

Only if you set `PUBLIC_ACCESS=false`. Then deploy generates a password for the Access Gate.

```bash
grep APP_ACCESS_TOKEN .env.production
```

### 2) LLM API key — `LLM_API_KEY` (optional, costs money)

Not needed for free public testing. Only if you want broader NLP than the built-in parser.

1. Open [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
2. Create a secret key
3. Put it in `.env.production` and set `FORCE_BUILTIN_PARSER=false`
4. Recreate backend:

```bash
docker compose --env-file .env.production up -d --force-recreate backend
```

## Environment

| Variable | Default | Notes |
|----------|---------|--------|
| `APP_PORT` | `80` | Host port for edge |
| `APP_ACCESS_TOKEN` | auto | First-visit gate — from `.env.production` |
| `LLM_API_KEY` | empty | Optional — from OpenAI (or compatible) |
| `LLM_MODEL` / `LLM_BASE_URL` | gpt-4o-mini / OpenAI | Any OpenAI-compatible API |
| `ENABLE_DOCS` | `false` | OpenAPI `/docs` in production |
| `ALLOW_RUNTIME_LLM_CONFIG` | `false` | Keep false publicly |
| `RATE_LIMIT_PER_MINUTE` | `60` | Per IP / client |
| `MAX_UPLOAD_SIZE_MB` | `25` | CSV uploads |

## HTTPS (Let's Encrypt)

```bash
APP_PORT=18080 DOMAIN=app.example.com EMAIL=ops@example.com \
  docker compose --env-file .env.production -f docker-compose.yml -f docker-compose.https.yml up -d --build
```

## Backup / restore

```bash
./deploy/scripts/backup.sh
# → backups/quantify-YYYYMMDDTHHMMSSZ.tar.gz

docker compose --env-file .env.production cp ./backups/quantify-…/backtests.db backend:/data/backtests.db
docker compose --env-file .env.production restart backend
```

## Security defaults

- Access token required (generated by deploy)
- Rate limiting on
- `/docs` off
- Runtime LLM key upload off
- Security headers on edge nginx
- Non-root backend container

## Stop

```bash
./deploy/scripts/down.sh          # keep volumes
./deploy/scripts/down.sh --purge  # wipe DB/uploads
```

## Local production preview (no Docker)

```bash
cd frontend && npm ci && npm run build
# terminal 1
cd backend && uvicorn app.main:app --host 0.0.0.0 --port 8765
# terminal 2
node scripts/serve-prod.mjs 18080
```

Open `http://127.0.0.1:18080`
