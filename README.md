# Villa Romanza — Agent Orchestration System

Multi-AI agent orchestration for Villa Romanza smart home. Routes tasks across 11 agents using deterministic pattern matching with RL tiebreaking.

## Architecture

- **11 agents**: ha, claude-tools, gemini-tools, chatgpt-tools, imagen, ollama, rag, echo + 3 remote (fx-ollama, show-runner, road-mac)
- **Deterministic router** (`villa-router.js`): 22 pattern rules match tasks to agents; RL only used as tiebreaker
- **Safety gateway** (`safety-gateway.js`): Single source of truth for entity safety (domain allowlists, exclude patterns, volume caps)
- **HA Bridge** (`ha-bridge.js`): Bidirectional WebSocket connection between HA automations and agent tasks
- **HITL gates**: Destructive tasks (delete/destroy/shutdown/reboot) require human approval via Portal
- **Redis bus**: Cross-machine pub/sub for distributed agent mesh (4 Macs)
- **Portal**: Web UI at :8406 with chat, dashboard, jukebox, visual generation, HITL approval

## Agents

| Agent | Type | Strengths |
|-------|------|-----------|
| ha | local | Home Assistant control (structured + NL) |
| claude-tools | cloud | General tasks with 14-tool toolkit |
| gemini-tools | cloud | Long context, analysis, code gen |
| chatgpt-tools | cloud | Creative writing, voice scripts |
| imagen | cloud | Image generation (Imagen 4 + Gemini native) |
| ollama | local | Routine tasks (zero cost, llama3.1:8b) |
| rag | local | Knowledge retrieval (56 docs, 1014 chunks) |
| echo | local | Test/debug echo agent |
| fx-ollama | remote | Audio analysis Mac (.61) |
| show-runner | remote | Visual pipeline Mac (.62) |
| road-mac | remote | Mobile Mac via VPN |

## Running

```bash
PORT=8406 \
REDIS_URL=redis://:password@localhost:6379 \
HA_TOKEN=... HA_URL=http://192.168.1.6:8123 \
ANTHROPIC_API_KEY=... GEMINI_API_KEY=... OPENAI_API_KEY=... \
node server.js
```

## API

- `POST /api/chat` — Send task to agent orchestrator
- `GET /api/villa/state` — Current mode, agents, gates
- `POST /api/villa/mode` — Set villa mode
- `POST /api/bridge/intent` — Trigger mood intent (room + intent)
- `POST /api/bridge/mode` — Set mode via bridge
- `GET /api/hitl/pending` — Pending HITL approvals
- `POST /api/hitl/:id/approve` — Approve pending task
- `POST /api/hitl/:id/reject` — Reject pending task
- `WS /ws` — WebSocket for real-time events

Auth: Bearer token via `PORTAL_KEY` env var, or session login.

## Tests

```bash
node test/run-all.js
```
