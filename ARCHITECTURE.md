# System Architecture

**Last Updated:** 2026-03-04  
**Status:** Current

---

## Overview

Agent Orchestration System is a Kubernetes-inspired platform for managing AI agents with intelligent routing, automatic lifecycle management, and real-time coordination.

```
┌─────────────────────────────────────────────────────────────┐
│                    Agent Orchestration System                │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────┐      ┌──────────────┐      ┌───────────┐ │
│  │   Lifecycle  │◄────►│ Orchestrator │◄────►│  Redis    │ │
│  │   Manager    │      │              │      │  Message  │ │
│  └──────────────┘      └──────────────┘      │  Bus      │ │
│         │                     │               └───────────┘ │
│         │                     │                      │       │
│         ▼                     ▼                      ▼       │
│  ┌──────────────┐      ┌──────────────┐      ┌───────────┐ │
│  │   Agent      │      │  Simple RL   │      │  Remote   │ │
│  │   Manifests  │      │  Routing     │      │  Agents   │ │
│  └──────────────┘      └──────────────┘      └───────────┘ │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

---

## Core Components

### 1. Agent Lifecycle Manager

**Purpose:** Kubernetes-style agent orchestration  
**Files:** `src/agent-lifecycle-manager.js`, `src/lifecycle-controller.js`, `src/agent-manifest.js`

**Responsibilities:**
- Load agents on demand
- Unload idle agents
- Match tasks to capabilities
- Reconcile desired state

**State Machine:**
```
UNLOADED → LOADING → ACTIVE → IDLE → UNLOADING → UNLOADED
```

**Example Manifest:**
```javascript
{
  name: 'gpu-dev',
  capabilities: ['code', 'debug'],
  triggers: { patterns: ['fix bug', 'quick code'] },
  resources: { memory: '256MB', cpu: 0.5 },
  lifecycle: { maxIdleTime: '5m', autoUnload: true }
}
```

### 2. Redis Message Bus

**Purpose:** Real-time AI-to-AI communication  
**File:** `src/redis-bus.js`

**Features:**
- Broadcast messaging
- Request-response pattern
- Self-exclusion (no echo)
- Authentication support
- Message validation

**Security:**
- Redis password authentication
- 1MB message size limit
- Input validation
- Error handling

**Example:**
```javascript
const bus = new RedisBus({ 
  url: 'redis://localhost:6379',
  password: process.env.REDIS_PASSWORD 
});

await bus.connect();
bus.subscribe('kiro', 'task.completed', (payload) => {
  console.log('Task done:', payload);
});
bus.publish('task.completed', { result: 'success' }, 'kiro');
```

### 3. Orchestrator

**Purpose:** Central task routing and execution  
**File:** `src/orchestrator.js`

**Responsibilities:**
- Route tasks to agents
- Track execution history
- Learn from outcomes (RL)
- Manage agent registry

**Integration Points:**
- Lifecycle Manager (agent loading)
- Redis Bus (cross-machine coordination)
- Simple RL (intelligent routing)
- Event Store (history tracking)

### 4. Simple RL (Reinforcement Learning)

**Purpose:** Learn optimal agent selection  
**File:** `src/simple-rl.js`

**Algorithm:** Multi-armed bandit with epsilon-greedy  
**Persistence:** Q-table saved to `data/rl-qtable.json`

**Metrics:**
- Quality (0-1)
- Speed (normalized)
- Cost (normalized)
- Relevance (0-1)

### 5. Event Store

**Purpose:** Event sourcing and time travel  
**File:** `src/event-store.js`

**Features:**
- Append-only log
- Time travel (replay to point)
- Persistence to disk
- Debounced writes

---

## Data Flow

### Task Execution Flow

```
1. Task arrives
   ↓
2. Lifecycle Manager checks if agent loaded
   ↓
3. If not loaded → Load agent from manifest
   ↓
4. Orchestrator routes task to agent
   ↓
5. Agent executes task
   ↓
6. Result returned
   ↓
7. RL updates Q-table
   ↓
8. Event stored
   ↓
9. Lifecycle Manager marks agent as used
```

### Agent Lifecycle Flow

```
1. Task matches manifest pattern
   ↓
2. Lifecycle Controller loads agent
   ↓
3. Agent registered with orchestrator
   ↓
4. Agent executes tasks
   ↓
5. After idle timeout → State changes to IDLE
   ↓
6. Reconciliation loop runs
   ↓
7. If still idle → Agent unloaded
   ↓
8. Require cache cleared
   ↓
9. Memory freed
```

### Cross-Machine Communication Flow

```
Machine A (Kiro)                Machine B (Claude)
     │                                │
     │  1. Publish task.delegate      │
     ├───────────────────────────────►│
     │                                │
     │                          2. Receive & execute
     │                                │
     │  3. Publish task.completed     │
     │◄───────────────────────────────┤
     │                                │
     │  4. Receive result             │
```

---

## Integration Patterns

### Pattern 1: Automatic Agent Loading

```javascript
const manager = new AgentLifecycleManager(orchestrator);

// Register manifests
manager.registerManifest({
  name: 'gpu-dev',
  modulePath: './agents/gpu-dev.js',
  triggers: { patterns: ['fix bug'] }
});

// Execute task - agent loads automatically
await manager.execute('fix bug in login.js');
```

### Pattern 2: Cross-Machine Coordination

```javascript
// Machine A
const busA = new RedisBus({ url: 'redis://192.168.0.60:6379' });
await busA.connect();
busA.publish('task.delegate', { task: 'Write docs' }, 'kiro');

// Machine B
const busB = new RedisBus({ url: 'redis://192.168.0.60:6379' });
await busB.connect();
busB.subscribe('claude', 'task.delegate', async (payload) => {
  const result = await executeTask(payload.task);
  busB.publish('task.completed', { result }, 'claude');
});
```

### Pattern 3: RL-Based Routing

```javascript
const orchestrator = new Orchestrator();
orchestrator.registerAgent('agent1', '1.0.0', agent1, { strengths: ['code'] });
orchestrator.registerAgent('agent2', '1.0.0', agent2, { strengths: ['docs'] });

// First call: Uses strengths
await orchestrator.execute('Write code');  // → agent1

// After learning: Uses Q-table
await orchestrator.execute('Write code');  // → best performing agent
```

---

## Deployment Architecture

### Single Machine

```
┌─────────────────────────────────┐
│         Local Machine            │
│                                  │
│  ┌──────────────────────────┐   │
│  │  Orchestrator + Agents   │   │
│  └──────────────────────────┘   │
│              │                   │
│  ┌──────────────────────────┐   │
│  │    Redis (localhost)     │   │
│  └──────────────────────────┘   │
└─────────────────────────────────┘
```

### Multi-Machine (LAN)

```
┌──────────────┐      ┌──────────────┐      ┌──────────────┐
│  Machine A   │      │  Machine B   │      │  Machine C   │
│              │      │              │      │              │
│ Orchestrator │      │  Agent Pool  │      │  Agent Pool  │
│   + Redis    │◄────►│              │◄────►│              │
│              │      │              │      │              │
└──────────────┘      └──────────────┘      └──────────────┘
       │
       │ Redis pub/sub
       │
       ▼
  All machines coordinate via Redis
```

### Production (Cloud)

```
┌─────────────────────────────────────────────┐
│              Load Balancer                   │
└─────────────────────────────────────────────┘
                    │
        ┌───────────┼───────────┐
        ▼           ▼           ▼
   ┌────────┐  ┌────────┐  ┌────────┐
   │ Node 1 │  │ Node 2 │  │ Node 3 │
   └────────┘  └────────┘  └────────┘
        │           │           │
        └───────────┼───────────┘
                    ▼
         ┌─────────────────────┐
         │   Redis Cluster     │
         └─────────────────────┘
```

---

## Security Model

### Authentication
- Redis password required in production
- Environment variable: `REDIS_PASSWORD`
- TLS support available

### Validation
- Message size limits (1MB default)
- Input type checking
- JSON parse error handling

### Resource Protection
- Agent idle timeouts
- Memory limits per agent
- Automatic cleanup

### Error Handling
- Connection error handlers
- Graceful degradation
- Structured logging

---

## Performance Characteristics

### Agent Loading
- **Cold start:** 50-200ms (module load + registration)
- **Warm start:** <1ms (already loaded)
- **Unload:** 10-50ms (cleanup + GC)

### Message Bus
- **Latency:** <1ms (LAN), <10ms (WAN)
- **Throughput:** 10,000+ msg/sec
- **Overhead:** ~100 bytes per message

### RL Routing
- **Decision time:** <1ms
- **Learning:** Continuous (after each task)
- **Convergence:** 10-50 tasks per agent

---

## Scalability

### Horizontal Scaling
- Add machines to LAN
- Redis handles coordination
- Linear throughput scaling

### Vertical Scaling
- More agents per machine
- Resource limits prevent overload
- Automatic idle cleanup

### Limits
- **Agents per machine:** 20-50 (depends on memory)
- **Messages per second:** 10,000+
- **Machines per cluster:** 100+ (Redis limit)

---

## Monitoring

### Key Metrics
- Agent load/unload rate
- Message bus throughput
- RL convergence rate
- Task success rate
- Resource usage per agent

### Health Checks
- Redis connection status
- Agent state (ACTIVE/IDLE/UNLOADED)
- Q-table size
- Event store size

---

## Future Architecture

### Planned Additions
1. **Semantic Matching** - Embed task descriptions, find best agents
2. **Hot Reload** - Update agents without restart
3. **Circuit Breaker** - Prevent cascading failures
4. **Rate Limiting** - DoS protection
5. **Distributed Tracing** - Cross-machine observability

### Not Planned
- Agent marketplace (replaced by lifecycle manager)
- Manual agent management (automated)
- Static routing (RL-based)

---

## Related Documents

- [Agent Lifecycle Manager](AGENT_LIFECYCLE_MANAGER.md) - Detailed design
- [AI-to-AI Communication](AI_TO_AI_VERIFIED.md) - Verification report
- [Security](SECURITY.md) - Security documentation (TODO)
- [Migration Guide](MIGRATION_GUIDE.md) - Marketplace → Lifecycle (TODO)

---

**Questions?** See [README.md](README.md) or [TODO.md](TODO.md)
