# SHARED TODO - Agent Orchestration System

**Last Updated:** 2026-03-02 10:30 UTC
**Contributors:** Kiro, Claude

---

## ✅ DONE: Real-Time AI-to-AI Message Bus (Kiro + Claude)

- [x] **Redis Message Bus** — Live on Mech Mac, fully operational
  - `src/redis-bus.js` — drop-in replacement for MessageBus, works across machines
  - `test/redis-bus.test.js` — 8/8 tests passing (mock-based, no live Redis needed)
  - `examples/redis-bus-demo.js` — shows Kiro ↔ Claude coordination
  - **Redis:** Installed on Mech Mac (built from source, v8.6.1), running on :6379, crontab persistent
  - **Server:** `REDIS_URL=redis://localhost:6379` wired into server.js + crontab
  - **Review:** Claude reviewed Kiro's code, fixed 2 bugs (request channel filter, self-exclusion), added 2 tests
  - **Verified:** Live pub/sub, self-exclusion, and request-response all tested over real Redis
  - **Assignee:** Kiro (original code) + Claude (review, fixes, deployment)
  - **Status:** ✅ Complete and deployed

---

## NEW: Villa Romanza Infrastructure Available

**Read VILLA_RESOURCES.md for full details.**

The system is now **deployed and live** on the Villa Romanza home network:
- **Live API**: `http://192.168.0.60:8406` — running on Mech Mac (M4 Mac Mini)
- **Ollama**: llama3.1:8b at localhost — registered and executing real tasks
- **RAG**: 40 docs, 798 chunks of villa knowledge — available when server is running
- **Claude API**: Ready to register when API key is set
- **5 Macs** on the network for distributed compute

This changes what we should build next. We have real hardware, real AI, and a real deployment target.

---

## PRIORITY: Production Hardening (Claude — DONE)

- [x] **RL Persistence** — Q-table saves to `data/rl-qtable.json`, survives restarts
  - **Assignee:** Claude
  - **Status:** Complete — 8 tests, deployed to Mech Mac

- [x] **Strength-Based Routing** — Agents matched to tasks by declared strengths on cold start, RL takes over once it has data
  - **Assignee:** Claude
  - **Status:** Complete — 5 tests, deployed to Mech Mac

---

## PRIORITY: Practical Features

- [x] **Human-in-the-loop Feedback**
  - GET /api/tasks/:id — retrieve cached task results
  - POST /api/tasks/:id/feedback — submit rating (1-5) with RL correction
  - Task result caching with LRU eviction
  - **Assignee:** Claude
  - **Status:** Complete — 10 tests (5 orchestrator + 5 API)

- [x] **Agent Composition**
  - CompoundAgent chains N agents in a pipeline
  - rag-ollama compound: RAG retrieval → Ollama synthesis
  - Custom prompt templates per stage
  - **Assignee:** Claude
  - **Status:** Complete — 8 tests

- [x] **Multi-Machine Agents** — Distribute agents across machines via Redis bus
  - `src/remote-agent-runner.js` — Lightweight runner, scp-able, connects to Redis, heartbeats
  - `src/agents/remote-agent.js` — Proxy agent for orchestrator: routes tasks via Redis bus request()
  - `test/remote-agent.test.js` — 8 tests (mock-based, no live Redis needed)
  - `examples/multi-machine-demo.js` — Sequential + parallel execution demo
  - Latency tracking via heartbeat timestamps
  - **Assignee:** Kiro (original) + Claude (review, 3 bug fixes, 2 added tests)
  - **Status:** ✅ Complete — reviewed, fixed, 135 tests across 17 files

- [x] **Distributed Agent Mesh Live** — Remote agents wired into server.js, runners deployed
  - `REMOTE_AGENTS` env var configures remote proxies at startup (Kiro's pattern)
  - Deployed runners to FX Mac (.61) and Show Mac (.62) with crontab persistence
  - Fixed Redis LAN binding (`--protected-mode no --bind 0.0.0.0`)
  - Fixed `healthCheck.bind(agent)` bug in orchestrator.js (affected ALL agents)
  - `/api/agents` returns type, latency, capabilities; dashboard has latency column
  - **Assignee:** Claude (wiring + deployment) + Kiro (env var pattern)
  - **Status:** ✅ Complete — 3 machines communicating, 1ms latency

- [x] **AgentComposer** — Multi-pattern workflow builder
  - `src/composer.js` — define/run templates with sequential, parallel, or fallback patterns
  - `test/composer.test.js` — 11 tests
  - **Assignee:** Kiro (original) + Claude (review, pattern dispatch fix, 2 added tests)
  - **Status:** ✅ Complete — reviewed, fixed

- [x] **HITL Approval Gates** — Human-in-the-loop task approval
  - `src/hitl.js` — Pattern-matching gates, timeout with configurable default, approve/reject API
  - `test/hitl.test.js` — 8 tests
  - **Assignee:** Kiro (original) + Claude (review, shutdown method, 1 added test)
  - **Status:** ✅ Complete — reviewed, fixed

- [x] **Agent Marketplace** — Agent publishing, discovery, rating, installation
  - `src/marketplace.js` — Publish, search, rate, install agents into orchestrator
  - `test/marketplace.test.js` — 9 tests
  - **Assignee:** Kiro (original) + Claude (review, semver sort fix, 1 added test)
  - **Status:** ✅ Complete — reviewed, fixed

- [x] **Multi-Tenancy** — Tenant isolation with resource quotas
  - `src/tenancy.js` — Create tenants, hourly + concurrent quotas, usage tracking
  - `test/tenancy.test.js` — 9 tests
  - **Assignee:** Kiro
  - **Status:** ✅ Complete — reviewed, no bugs found

---

## VISION: General-Purpose Agent Orchestration

This system is **not just a home automation controller**. Villa Romanza is the test bed, but the architecture is domain-agnostic:

- **RL-based task routing** works for any agent pool (LLMs, APIs, microservices, human workers)
- **Distributed agent mesh** (Multi-Machine Agents) works on any network, not just a villa LAN
- **Compound agents** (pipeline chaining) apply to any multi-step workflow (ETL, CI/CD, content creation)
- **Event sourcing + saga pattern** handle distributed transactions in any domain
- **Context-aware modification** (see villa's time-aware modifier layer) — tasks adapt to environmental state

Think of it as "Kubernetes for AI agents" — a lightweight orchestrator that routes tasks to the best available agent, learns from outcomes, and distributes work across machines.

### Future Directions (beyond home automation)
- [ ] **Domain-agnostic agent interface** — Formalize the agent contract (execute, healthCheck, strengths, config)
- [ ] **Plugin system** — Drop-in agent packages (npm modules) that self-register
- [x] **Context providers** — Pluggable context sources (src/context-providers.js)
- [ ] **Web UI** — Beyond the villa dashboard — a proper agent management console
- [x] **Agent Marketplace** — Community-driven agent sharing, ratings (src/marketplace.js)
- [x] **Multi-tenancy** — Enterprise isolation, quotas (src/tenancy.js)
- [x] **HITL Approval Gates** — Human-in-the-loop task approval (src/hitl.js)
- [x] **AgentComposer** — Multi-pattern workflow templates (src/composer.js)
- [ ] **API Reference** — Complete docs for all components
- [ ] **Deployment Guide** — Docker, production best practices

---

## COMPLETED

- [x] **Message Bus** — Real-time agent communication (Kiro)
- [x] **Simple RL** — Reinforcement learning with Q-learning (Kiro)
- [x] **Event Store** — Event sourcing with time travel (Kiro)
- [x] **Saga Pattern** — Distributed transactions with rollback (Kiro)
- [x] **Health Monitor** — 3-state health, auto-remediation (Kiro)
- [x] **Agent Registry** — Versioning, canary, blue-green (Kiro)
- [x] **Explainer** — Transparent decision reasoning (Kiro)
- [x] **Dynamic Replanner** — Adaptive mid-flight replanning (Kiro)
- [x] **Multi-Objective Optimizer** — Balance objectives (Kiro)
- [x] **Orchestrator** — Full integration harness (Kiro + Claude merged)
- [x] **Workflow Support** — Multi-step saga workflows (Claude)
- [x] **Multi-Objective Rewards** — 4-dimension scoring: quality, speed, cost, relevance (Claude)
- [x] **Claude Agent** — Anthropic API wrapper with lazy SDK loading (Claude)
- [x] **Ollama Agent** — Local LLM agent with native fetch (Claude)
- [x] **RAG Agent** — Villa knowledge base query agent (Claude)
- [x] **REST API** — Express API with 10 endpoints + dashboard (Claude)
- [x] **Server** — Auto-registration, Villa-aware system prompts (Claude)
- [x] **Mech Mac Deployment** — Live on :8406, crontab persistent (Claude)
- [x] **RL Persistence** — Q-table saves to disk, learning survives restarts (Claude)
- [x] **Strength-Based Routing** — Agents matched to tasks by strengths on cold start (Claude)
- [x] **CompoundAgent** — N-stage pipeline with custom prompt templates (Claude)
- [x] **Feedback API** — Human-in-the-loop RL correction via rating (Claude)
- [x] **Event Store Persistence** — Events saved to disk with debounced writes (Claude)
- [x] **Status Dashboard** — HTML dashboard at GET / with agents, RL, events (Claude)
- [x] **Epsilon Fix** — SimpleRL epsilon=0 was treated as falsy (Claude)
- [x] **Redis Bus** — Redis pub/sub cross-machine messaging, reviewed + fixed + deployed (Kiro + Claude)
- [x] **Multi-Machine Agents** — Remote runner + proxy + latency tracking, reviewed + fixed (Kiro + Claude)
- [x] **Orchestrator Wiring** — HITL, Tenancy, Context, Composer integrated into execute() (Kiro, reviewed by Claude)
- [x] **Ollama on FX/Show Mac** — Distributed inference live, llama3.2:3b on 3 machines (Claude)
- [x] **190 Tests** — 22 test files, all passing (Kiro + Claude)

---

## NOTES

### Development Workflow
```bash
# Local development
npm run test:all        # 127 tests across 16 files

# Deploy to Mech Mac
./deploy.sh             # Pull + restart
./deploy.sh --setup     # First-time clone + install + crontab

# Monitor
ssh villaromanzamech@192.168.0.60 'tail -f ~/logs/agent-orchestration.log'
```

### Available Agents (registered at startup)
| Agent | Type | Best For |
|-------|------|----------|
| claude | Cloud API | Complex reasoning, code gen, analysis |
| ollama | Local LLM | Fast response, zero cost, routine tasks |
| rag | Local Vector | Villa knowledge, device lookup, docs |
| rag-ollama | Compound | Synthesized villa knowledge answers |

### Key Files
| File | Purpose |
|------|---------|
| `server.js` | Entry point, agent auto-registration |
| `src/orchestrator.js` | Core integration harness |
| `src/agents/*.js` | Agent implementations |
| `src/api.js` | Express REST API |
| `deploy.sh` | Mech Mac deployment |
| `VILLA_RESOURCES.md` | Full infrastructure docs |
