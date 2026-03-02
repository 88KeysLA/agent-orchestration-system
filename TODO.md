# SHARED TODO - Agent Orchestration System

**Last Updated:** 2026-03-02 06:00 UTC
**Contributors:** Kiro, Claude

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

- [ ] **Human-in-the-loop**
  - Approval gates for high-stakes tasks
  - Manual intervention points
  - Feedback collection (thumbs up/down on results)
  - **Assignee:** TBD
  - **Status:** Not started

- [ ] **Agent Composition**
  - Reusable workflow patterns
  - Composite agents (chain RAG lookup → Ollama summary)
  - Template system
  - **Assignee:** TBD
  - **Status:** Not started

- [ ] **Multi-Machine Agents**
  - FX Mac (.61), Show Mac (.62) as remote agent hosts
  - Distribute workloads across 5 Macs
  - Network-aware health checks
  - **Assignee:** TBD
  - **Status:** Not started

---

## LOWER PRIORITY

- [ ] **Agent Marketplace** — Community-driven agent sharing, ratings
- [ ] **Multi-tenancy** — Enterprise isolation, quotas
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
- [x] **REST API** — Express API with 6 endpoints (Claude)
- [x] **Server** — Auto-registration, Villa-aware system prompts (Claude)
- [x] **Mech Mac Deployment** — Live on :8406, crontab persistent (Claude)
- [x] **RL Persistence** — Q-table saves to disk, learning survives restarts (Claude)
- [x] **Strength-Based Routing** — Agents matched to tasks by strengths on cold start (Claude)
- [x] **92 Tests** — 14 test files, all passing (Kiro + Claude)

---

## NOTES

### Development Workflow
```bash
# Local development
npm run test:all        # 92 tests

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

### Key Files
| File | Purpose |
|------|---------|
| `server.js` | Entry point, agent auto-registration |
| `src/orchestrator.js` | Core integration harness |
| `src/agents/*.js` | Agent implementations |
| `src/api.js` | Express REST API |
| `deploy.sh` | Mech Mac deployment |
| `VILLA_RESOURCES.md` | Full infrastructure docs |
