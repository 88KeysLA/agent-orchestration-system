# Villa Romanza — Infrastructure for Agent Orchestration

**Updated:** 2026-03-02 by Claude
**Status:** LIVE deployment on Mech Mac

---

## Live Deployment

The agent orchestration system is **running in production** on the Villa Romanza network.

| Service | Host | Port | Status |
|---------|------|------|--------|
| **Agent Orchestration API** | 192.168.0.60 (Mech Mac) | 8406 | LIVE |
| **Ollama LLM** | 192.168.0.60 | 11434 | LIVE — llama3.1:8b |
| **RAG Server** | 192.168.0.60 | 8450 | Available (40 docs, 798 chunks) |
| **Claude API** | cloud | — | Available (needs ANTHROPIC_API_KEY) |

### Test It
```bash
# Status
curl http://192.168.0.60:8406/api/status

# List agents
curl http://192.168.0.60:8406/api/agents

# Execute a task (goes through full RL pipeline → Ollama)
curl -X POST http://192.168.0.60:8406/api/tasks \
  -H "Content-Type: application/json" \
  -d '{"task": "What are 3 benefits of a smart home?"}'

# Execute a workflow (multi-step with saga rollback)
curl -X POST http://192.168.0.60:8406/api/workflows \
  -H "Content-Type: application/json" \
  -d '{"task": "Analyze and summarize smart home automation"}'
```

---

## Available Hardware (5 Macs)

| Machine | IP | Role | CPU | Status |
|---------|----|----|-----|--------|
| **Mech Mac** (Mac Mini M4) | 192.168.0.60 | Orchestration, LLM, RAG | Apple M4 | Online |
| **FX Mac** (Mac Mini) | 192.168.0.61 | Analysis, effects | Apple Silicon | Online |
| **Show Mac** (Mac Mini) | 192.168.0.62 | Visuals, display | Apple Silicon | Online |
| **MacBook Pro** | 192.168.0.63 | Studio Hub, DAW | Apple Silicon | Online |
| **Mac Pro** (tower) | 192.168.0.64 | Generator (heavy compute) | Intel | Pingable, no SSH |

### Mech Mac Services Already Running
- Intent Resolver (:8400)
- Villa Orchestrator (:8401) — home automation modes
- FX Service (:8402)
- Show Service (:8403)
- Music Director (:8404)
- Villa Voice (:8405) — ElevenLabs TTS, 5 personas
- **Agent Orchestration (:8406)** — THIS PROJECT
- RAG (:8450) — vector search over villa docs
- Ollama (:11434) — local LLM inference
- Supervisor (:8499) — monitors all services, auto-restart

---

## Available AI Backends

### 1. Ollama (Local, Zero Cost)
- **Models**: llama3.1:8b (primary), llama3.2:3b (fast), nomic-embed-text (embeddings)
- **Speed**: ~50 tok/s generation on M4
- **Best for**: Routine tasks, fast responses, no API cost
- **API**: `POST http://192.168.0.60:11434/api/generate`

### 2. Claude API (Cloud, High Quality)
- **Models**: claude-sonnet-4-6 (default), claude-opus-4-6, claude-haiku-4-5
- **Best for**: Complex reasoning, code generation, analysis
- **Requires**: `ANTHROPIC_API_KEY` environment variable

### 3. RAG Server (Local, Villa Knowledge)
- **Corpus**: 40 documents, 798 chunks — villa architecture, devices, network, AV, automations
- **Embeddings**: nomic-embed-text via Ollama
- **Best for**: "What is entity X?", "How does the AV system work?", device lookups
- **API**: `POST http://192.168.0.60:8450/query` with `{"query": "...", "top_k": 5}`

---

## Network Topology

```
Internet
    ├── WAN1 (Spectrum 1.1Gbps, primary)
    └── WAN2 (Starlink, failover)
         │
    UniFi Gateway
         │
    ┌────┴────┐
    │ Core /23│ ← 192.168.0.0/23
    │ VLAN 1  │   Macs, HA, Crestron, AV
    ├─────────┤
    │ Sec /24 │ ← VLAN 4: Cameras, NVR, Access
    │ IoT /24 │ ← VLAN 6: Ecobees, iRobots, MyQ
    │Guest/24 │ ← VLAN 7: Guest WiFi
    │Light/24 │ ← VLAN 20: Hue bridges, Sync Boxes
    └─────────┘
```

**Key IPs:**
- Home Assistant: 192.168.1.6
- Crestron CP4-R: 192.168.1.2
- Mech Mac: 192.168.0.60
- Ollama: 192.168.0.60:11434
- RAG: 192.168.0.60:8450

---

## What This Means for Development

### Kiro — What You Can Do Now

1. **Build features that use real AI backends** — The orchestrator is live. Any new component can be tested against actual Ollama inference, not just mocks.

2. **Use agent strengths metadata** — Agents are registered with `strengths` arrays:
   ```javascript
   // Claude: ['complex reasoning', 'code generation', 'analysis']
   // Ollama: ['fast response', 'zero cost', 'routine tasks']
   // RAG:    ['villa knowledge', 'documentation lookup', 'device info']
   ```
   The meta-agent-router can use these for smarter selection.

3. **Deploy and test on Mech Mac** — Push to main, SSH to Mech Mac, `git pull && npm install`. Or use `deploy.sh`.

4. **Multi-machine agents** — FX Mac (.61), Show Mac (.62) are available for distributed workloads. Each could run specialized agents.

### Development Workflow
```bash
# Develop locally
npm run test:all

# Deploy to Mech Mac
./deploy.sh

# Monitor
ssh villaromanzamech@192.168.0.60 'tail -f ~/logs/agent-orchestration.log'
```

---

## Agent Registration Pattern

The server auto-registers agents based on what's reachable:

```javascript
// server.js auto-detection:
// 1. Claude → registered if ANTHROPIC_API_KEY is set
// 2. Ollama → registered if 192.168.0.60:11434 responds
// 3. RAG    → registered if 192.168.0.60:8450 responds
// 4. Mock   → registered only if nothing else is available
```

To add a new agent, follow the pattern in `src/agents/`:
```javascript
class MyAgent {
  constructor(options = {}) { this.lastUsage = null; }
  async execute(task) { /* return string */ }
  async healthCheck() { /* return boolean */ }
}
```

Register in `server.js` with metadata:
```javascript
orc.registerAgent('myagent', '1.0.0', agent, {
  type: 'local',
  provider: 'custom',
  strengths: ['what', 'it', 'does best']
});
```
