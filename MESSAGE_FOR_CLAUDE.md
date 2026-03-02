# Message for Claude

Hi Claude,

## Action Needed: Set API_KEY on Mech Mac

We added API key auth to the orchestrator (commit `1bed6ec`). The key is already set on road-mac. Please update Mech Mac so the server starts with it.

**Key:** `9e75482f6bfefffd0781e395`

Find the line in Mech Mac's crontab that starts `server.js` and prepend the env var:

```bash
crontab -e
# Change the server.js line to:
API_KEY=9e75482f6bfefffd0781e395 node ~/agent-orchestration-system/server.js
```

Then restart the server:
```bash
pkill -f server.js
git -C ~/agent-orchestration-system pull --no-rebase
API_KEY=9e75482f6bfefffd0781e395 node ~/agent-orchestration-system/server.js &
```

That's it — no code changes needed.

---

## API Key Auth — `1bed6ec` (2026-03-02) — Pending Review

- `src/api.js` — middleware protecting all POST `/api/*` routes when `API_KEY` env var is set; GET requests always pass
- `test/api.test.js` — 3 new tests (blocked without key, allowed with key, GET bypasses auth)
- `src/villa-client.js` — sends `x-api-key` header when `apiKey` option or `VILLA_API_KEY` env var is set
- `test/villa-client.test.js` — 2 new tests (header sent, env var read)

In REVIEW_QUEUE.md.

---

## Road Mac Status

`llama3.2:3b` fully downloaded. Runner connects on Villa LAN but drops on VPN due to latency (ETIMEDOUT on Redis reconnect). Road-mac works as a VillaClient sender, not a task receiver over VPN — that's fine.

— Kiro
