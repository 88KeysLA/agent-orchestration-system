# Deployment Architecture

## Two Separate Systems

### System 1: Agent Orchestration Core (Infrastructure)
**Location:** `/Users/mattser/agent-orchestration-system/`
**Purpose:** Core infrastructure for agent coordination
**Deployment:** Standalone library/service

```
agent-orchestration-system/
├── src/
│   ├── message-bus.js       # Core infrastructure
│   ├── simple-rl.js          # Core infrastructure
│   ├── event-store.js        # Core infrastructure
│   └── meta-agent-router.js  # Core infrastructure
├── package.json
└── README.md
```

**Use:** Import as library or run as service

---

### System 2: Claude Integration (Application Layer)
**Location:** Same repo, but separate deployment
**Purpose:** Uses Claude API as agents
**Deployment:** Separate service with API keys

```
agent-orchestration-system/
├── src/
│   ├── claude-agent.js       # Claude-specific
│   └── claude-orchestrator.js # Claude-specific
├── examples/
│   └── claude-multi-agent.js  # Claude demo
└── .env (ANTHROPIC_API_KEY)
```

**Use:** Deploys separately, calls Claude API

---

## Deployment Options

### Option A: Monorepo (Current)
```
agent-orchestration-system/
├── core/              # System 1 (infrastructure)
├── claude/            # System 2 (Claude integration)
└── dashboard/         # System 3 (AIP Dashboard)
```

**Pros:** Everything in one place
**Cons:** Coupled deployments

---

### Option B: Separate Repos (Recommended)
```
1. agent-orchestration-core/     # Infrastructure library
   └── npm package: @your-org/agent-orchestration

2. agent-orchestration-claude/   # Claude integration
   └── Service that uses core + Claude API

3. aip-leadership-dashboard/     # Your dashboard
   └── Uses core for agent coordination
```

**Pros:** Independent deployments, clear boundaries
**Cons:** More repos to manage

---

### Option C: Microservices
```
1. Core Service (Port 3000)
   - Message bus
   - RL engine
   - Agent registry

2. Claude Service (Port 3001)
   - Wraps Claude API
   - Registers with core service
   - Handles Claude-specific logic

3. Dashboard Service (Port 3002)
   - Your AIP dashboard
   - Uses core service for agents
```

**Pros:** Fully decoupled, scalable
**Cons:** More complex infrastructure

---

## Recommended Architecture

### For Your Use Case:

```
┌─────────────────────────────────────────┐
│  AIP Leadership Dashboard               │
│  (Your main application)                │
│                                         │
│  Uses: agent-orchestration-core         │
└─────────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────┐
│  Agent Orchestration Core               │
│  (Infrastructure library)               │
│                                         │
│  - Message Bus                          │
│  - Simple RL                            │
│  - Meta Router                          │
│                                         │
│  Published as: npm package              │
└─────────────────────────────────────────┘
                  ↑
        ┌─────────┴─────────┐
        ↓                   ↓
┌───────────────┐   ┌───────────────┐
│ Claude Agents │   │ Local Agents  │
│ (Separate)    │   │ (Kiro CLI)    │
│               │   │               │
│ - API calls   │   │ - Direct exec │
│ - Rate limits │   │ - Fast        │
│ - Costs $     │   │ - Free        │
└───────────────┘   └───────────────┘
```

---

## Deployment Strategy

### Phase 1: Library (Now)
```bash
# Publish core as npm package
cd agent-orchestration-system
npm publish @your-org/agent-orchestration-core

# Use in dashboard
cd aip-leadership-dashboard
npm install @your-org/agent-orchestration-core
```

### Phase 2: Claude Integration (Optional)
```bash
# Separate service for Claude agents
cd agent-orchestration-claude
npm install @your-org/agent-orchestration-core
npm install @anthropic-ai/sdk

# Deploy as separate service
docker build -t claude-agent-service .
docker run -e ANTHROPIC_API_KEY=xxx claude-agent-service
```

### Phase 3: Dashboard Integration
```javascript
// In your dashboard
const { MessageBus, SimpleRL } = require('@your-org/agent-orchestration-core');

// Use with local agents (kiro-cli)
const bus = new MessageBus();
const rl = new SimpleRL();

// Coordinate your existing agents
bus.subscribe('gpu-dev', 'task', (msg) => {
  // Execute via kiro-cli
  execSync(`echo "${msg.task}" | kiro-cli chat --agent gpu-dev`);
});
```

---

## Key Decisions

### 1. Core Infrastructure
**Decision:** Publish as npm package
**Why:** Reusable across projects
**Deploy:** npm registry

### 2. Claude Integration
**Decision:** Separate optional service
**Why:** Not everyone needs Claude API
**Deploy:** Docker container or serverless

### 3. Dashboard
**Decision:** Import core, use local agents
**Why:** Fast, free, already working
**Deploy:** Your existing deployment

---

## Summary

✅ **Core system** = Infrastructure library (npm package)
✅ **Claude integration** = Optional separate service
✅ **Dashboard** = Imports core, uses local agents

**They CAN be deployed together, but DON'T have to be.**

**Recommended:**
1. Publish core as npm package
2. Use in dashboard with local agents (kiro-cli)
3. Add Claude service later if needed

**Current state:** Everything in one repo, can be split later.
