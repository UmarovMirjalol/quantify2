#!/usr/bin/env node
/**
 * Production-like local server: static SPA (frontend/dist) + /api → backend.
 * Usage: node scripts/serve-prod.mjs [port]
 * Default port: 18080
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'frontend', 'dist');
const PORT = Number(process.argv[2] || process.env.APP_PORT || 18080);
const API = process.env.API_URL || 'http://127.0.0.1:8765';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    ...headers,
  });
  res.end(body);
}

function proxyApi(req, res) {
  const target = new URL(req.url, API);
  const headers = { ...req.headers, host: target.host };
  const upstream = http.request(
    target,
    { method: req.method, headers },
    (up) => {
      res.writeHead(up.statusCode || 502, up.headers);
      up.pipe(res);
    },
  );
  upstream.on('error', (err) => {
    send(res, 502, JSON.stringify({ error: 'api_unreachable', detail: String(err.message) }), {
      'Content-Type': 'application/json',
    });
  });
  req.pipe(upstream);
}

function serveStatic(req, res) {
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  let filePath = path.join(DIST, urlPath === '/' ? 'index.html' : urlPath);

  if (!filePath.startsWith(DIST)) {
    send(res, 403, 'Forbidden');
    return;
  }

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(DIST, 'index.html');
  }

  const ext = path.extname(filePath);
  const type = MIME[ext] || 'application/octet-stream';
  const cache =
    urlPath.startsWith('/assets/')
      ? 'public, max-age=604800, immutable'
      : 'no-cache';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      send(res, 500, 'Read error');
      return;
    }
    send(res, 200, data, { 'Content-Type': type, 'Cache-Control': cache });
  });
}

if (!fs.existsSync(path.join(DIST, 'index.html'))) {
  console.error('Missing frontend/dist. Run: cd frontend && npm run build');
  process.exit(1);
}

const server = http.createServer((req, res) => {
  if (req.url === '/healthz') {
    send(res, 200, 'ok', { 'Content-Type': 'text/plain' });
    return;
  }
  if ((req.url || '').startsWith('/api/') || ['/docs', '/openapi.json', '/redoc'].some((p) => (req.url || '').startsWith(p))) {
    proxyApi(req, res);
    return;
  }
  serveStatic(req, res);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Quantify production preview → http://127.0.0.1:${PORT}`);
  console.log(`API proxy → ${API}`);
});
