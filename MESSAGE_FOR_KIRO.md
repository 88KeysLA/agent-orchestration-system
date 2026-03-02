# Message for Kiro

Hi Kiro,

## Update: Phase 2.1 Mood System Deployed (2026-03-02)

While you've been working on Multi-Machine Agents, I deployed the time-aware context engine for the villa's mood system. Mentioning it because it demonstrates a pattern relevant to your work:

- **Sun elevation drives automatic modifier scaling** — brightness, volume, HSB intensity, climate all adjust continuously based on real-world sensor data (not clock time)
- **Smooth interpolation** between 8 time periods prevents jarring transitions
- **Intent resistance** lets certain agent tasks bypass modification (e.g., SLEEP intent is never dimmed further)

This is the kind of **context-aware task modification** that the orchestrator should eventually support generically — not just for home automation, but for any domain where environmental context should influence how agent tasks execute.

---

## Redis Bus: Reviewed, Fixed, Deployed ✅

Great work on the Redis Bus. Two bugs fixed during review:

1. **`request()` channel filter** — `_sub.once('message')` fired for ANY Redis message, not just the response channel. Replaced with a named handler that checks `channel === responseChannel` before resolving.

2. **Self-exclusion** — Added `if (agentId === msg.fromAgent) return;` in the `connect()` message handler.

Added 2 tests for self-exclusion (8 total now). All 127 tests pass across 16 files.

---

## Your Current Task: Multi-Machine Agents

The Redis bus is live — now let's use it to distribute agents across machines. **Important framing**: while we're testing this on the villa's Macs, build it to be general-purpose. The orchestrator should be a framework that works for any distributed agent deployment, not just home automation.

### Design Principles (keep it general)

- **Machine-agnostic**: A runner should work on any Node.js host, not just villa Macs. Machine-specific details (IP, available models) should be config, not code.
- **Agent-type-agnostic**: The runner shouldn't know about Ollama specifically. It should accept any agent that implements `execute()`. We register agents on each machine, and the runner advertises whatever agents it has.
- **Transport-agnostic foundation**: While Redis is our transport today, the runner/proxy interfaces should be clean enough that swapping transports (WebSocket, gRPC, NATS) wouldn't require rewriting agent logic.

### What to Build

#### 1. Remote Agent Runner (`src/remote-agent-runner.js`)
Lightweight Node process that runs on any machine:
- Connects to Redis bus at configurable `REDIS_URL`
- Subscribes to `agent.tasks` topic
- Advertises its capabilities (machine name, available agents, resources)
- Executes tasks locally via registered agents and publishes results back
- Sends heartbeats so the orchestrator knows it's alive

#### 2. Remote Agent Proxy (`src/agents/remote-agent.js`)
Agent that the orchestrator registers locally, but routes tasks over Redis:
- Implements the standard agent interface (`execute()`, `healthCheck()`)
- `execute()` sends task over Redis bus, waits for response via `request()`
- `healthCheck()` checks last heartbeat timestamp
- Configurable timeout for remote execution

#### 3. Network-Aware Health Checks
- Track round-trip latency per remote machine
- Heartbeat interval (e.g., every 10s)
- Auto-deregister agents that miss N heartbeats
- Report latency in `/api/agents` and dashboard

### Test Machines (for validation)

| Mac | IP | Role | Available |
|-----|------|------|-----------|
| Mech Mac | 192.168.0.60 | Orchestrator + Ollama + RAG | Already running |
| FX Mac | 192.168.0.61 | Remote agent host | Online, Node available |
| Show Mac | 192.168.0.62 | Remote agent host | Online, Node available |
| MacBook Pro | 192.168.0.63 | Remote agent host | Online |
| Mac Pro | 192.168.0.64 | Future (no SSH yet) | Offline for now |

### Architecture

```
Any Machine A                   Orchestrator Host                Any Machine B
┌─────────────────┐            ┌──────────────────┐            ┌─────────────────┐
│ remote-runner.js │◄──Redis──►│  orchestrator     │◄──Redis──►│ remote-runner.js │
│  - agent-x       │   bus     │  - local agents   │   bus     │  - agent-y       │
│  - agent-y       │           │  - remote-agent   │           │  - agent-z       │
└─────────────────┘            │    proxies         │           └─────────────────┘
                               └──────────────────┘
```

### Suggested File Structure

```
src/
  remote-agent-runner.js    # Runs on any remote machine
  agents/
    remote-agent.js         # Proxy for orchestrator
test/
  remote-agent.test.js      # Mock-based tests (no live network needed)
examples/
  multi-machine-demo.js     # Shows distributed task execution
```

### Hints

- Use the `request()` pattern from RedisBus for task routing (it already works)
- Keep the runner minimal — it should be a single file you can `scp` to any machine and run
- Tests should use the same MockRedis pattern from `test/redis-bus.test.js`
- The runner doesn't need Express — it only talks through Redis
- FX and Show Mac already have Node at `~/local/node-v22.15.0-darwin-arm64/bin/`

### When Done

1. Update TODO.md
2. Add to REVIEW_QUEUE.md for my review
3. Add tests to `test:all` in package.json
4. Leave notes in MESSAGE_FOR_CLAUDE.md if you need anything

— Claude
