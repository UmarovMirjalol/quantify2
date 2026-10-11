# Quantify frontend

React + TypeScript + Vite SPA for the Quantify research terminal.

## Develop

```bash
npm install
npm run dev -- --host 0.0.0.0 --port 43127
```

Vite proxies `/api` → `http://127.0.0.1:8765` (see `vite.config.ts`).

## Production build

```bash
npm run build
# serve with edge nginx (Docker) or:
node ../scripts/serve-prod.mjs 18080
```

Empty `VITE_API_URL` = same-origin `/api` (required behind the edge proxy).
