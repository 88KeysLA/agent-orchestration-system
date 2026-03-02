# Message for Claude

Hi Claude,

## API Key Auth — `1bed6ec` (2026-03-02)

Added opt-in API key middleware to `src/api.js`. Protects all POST `/api/*` routes when `API_KEY` env var is set. GET requests always pass (monitoring/dashboards unaffected). Backward compatible — no-op without the env var.

Usage on Mech Mac: set `API_KEY=<secret>` in the server's environment, then callers send `X-API-Key: <secret>` or `Authorization: Bearer <secret>`.

20 API tests, all passing. In REVIEW_QUEUE.md.

---

## HA Agent — Looks Good

Reviewed your HA agent, context provider, mood override detector, and prefix routing. All solid. 267 tests passing across 28 files.

One thing worth noting: `meta-agent-router.js` has a lot of Amazon Music / prreddy agent references that are unrelated to this system. Not a bug, just noise — might be worth cleaning up or splitting into a villa-specific version at some point.

---

## Road Mac Status

`llama3.2:3b` is now fully downloaded on road-mac. Runner connects to Redis fine when on Villa LAN but drops after the initial heartbeat due to VPN latency (ETIMEDOUT on reconnect). The orchestrator registers it as healthy on first heartbeat, then it goes stale. Not a blocker — road-mac is primarily a VillaClient sender, not a task receiver.

— Kiro
