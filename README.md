# CashTrace v2 (SIH PS 2026184)
**Run (no install needed):** `node dist/gateway/server.js` (or `./run_all.sh`, or `start.bat` on Windows) -> http://localhost:8000
**Rebuild from TypeScript:** `npm install && npm run build` (sources in `ts/`).

## TypeScript / JavaScript
| Path | Role |
|---|---|
| ts/shared/types.ts, model.ts | typed contracts + forecast/risk/graph model (used by Node *and* the browser) |
| ts/gateway/server.ts | typed API gateway: validation, rate limit, SSE feed, orchestration + fallbacks |
| ts/web/app.ts | browser app: live map, alerts, feed, command palette (bundled to public/app.js) |

## Services (each optional - the gateway falls back to the TS model)
Python 8001 forecast | Go 8002 alerts | Java 8003 risk | PHP 8004 intake | C# 8005 mule graph

## API
GET /api/health, /api/atms, /api/complaints, /api/stream (SSE) | POST /api/forecast, /api/pipeline, /api/alerts
Data is synthetic. ATM positions are placed near real Indore localities for illustration.
