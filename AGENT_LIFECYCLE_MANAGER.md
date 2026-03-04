# Agent Lifecycle Manager

**Replaces:** Agent Marketplace (src/marketplace.js)  
**Pattern:** Kubernetes Operator for AI Agents  
**Goal:** Intelligent, automatic agent loading/unloading based on usage

---

## Problem Statement

Current marketplace is in-memory only and requires manual agent management. We need:
- **Dynamic loading** - Load agents only when needed
- **Automatic cleanup** - Unload idle agents to free resources
- **Smart routing** - Match tasks to agent capabilities semantically
- **Resource limits** - Prevent memory leaks from too many agents
- **Zero-downtime updates** - Hot reload agents without restart

---

## Architecture

### 1. Agent Manifest (Declarative)

```yaml
# agents/gpu-dev.yaml
name: gpu-dev
version: 1.0.0
capabilities:
  - code
  - debug
  - minimal-implementation
triggers:
  patterns:
    - "fix bug"
    - "quick implementation"
    - "minimal code"
resources:
  memory: 256MB
  cpu: 0.5
lifecycle:
  maxIdleTime: 5m
  autoUnload: true
  priority: high
```

### 2. Components

```
AgentLifecycleManager
├── ManifestLoader → Load agent definitions from files/registry
├── SemanticMatcher → Embed tasks, find best agents
├── ResourceMonitor → Track memory/CPU usage
├── LifecycleController → Load/unload based on usage
└── HotReloader → Reload agents without restart
```

### 3. State Machine

```
UNLOADED → LOADING → ACTIVE → IDLE → UNLOADING → UNLOADED
           ↑                                        ↓
           └────────── (re-trigger) ───────────────┘
```

---

## Implementation Plan

### Phase 1: Manifest System
```javascript
// src/agent-manifest.js
class AgentManifest {
  constructor(yaml) {
    this.name = yaml.name;
    this.version = yaml.version;
    this.capabilities = yaml.capabilities;
    this.triggers = yaml.triggers;
    this.resources = yaml.resources;
    this.lifecycle = yaml.lifecycle;
  }
  
  matches(task) {
    // Semantic matching logic
  }
}
```

### Phase 2: Lifecycle Controller
```javascript
// src/lifecycle-controller.js
class LifecycleController {
  constructor(orchestrator) {
    this.orchestrator = orchestrator;
    this.agents = new Map(); // name -> { manifest, instance, state, lastUsed }
    this.resourceMonitor = new ResourceMonitor();
  }
  
  async loadAgent(manifest) {
    // Load agent module, register with orchestrator
  }
  
  async unloadAgent(name) {
    // Unregister, clear require cache, GC
  }
  
  async reconcile() {
    // Kubernetes-style reconciliation loop
    // - Unload idle agents
    // - Enforce resource limits
    // - Handle failed agents
  }
}
```

### Phase 3: Semantic Matcher
```javascript
// src/semantic-matcher.js
class SemanticMatcher {
  constructor() {
    this.embeddings = new Map(); // agent -> embedding vector
  }
  
  async findBestAgents(task, limit = 3) {
    const taskEmbedding = await this.embed(task);
    const scores = [];
    
    for (const [name, agentEmbedding] of this.embeddings) {
      const score = this.cosineSimilarity(taskEmbedding, agentEmbedding);
      scores.push({ name, score });
    }
    
    return scores.sort((a, b) => b.score - a.score).slice(0, limit);
  }
}
```

### Phase 4: Hot Reloader
```javascript
// src/hot-reloader.js
class HotReloader {
  async reload(agentPath) {
    // 1. Clear require cache
    delete require.cache[require.resolve(agentPath)];
    
    // 2. Reload module
    const Agent = require(agentPath);
    
    // 3. Preserve state if needed
    return new Agent();
  }
}
```

### Phase 5: Resource Monitor
```javascript
// src/resource-monitor.js
class ResourceMonitor {
  constructor() {
    this.limits = { memory: '2GB', maxAgents: 20 };
    this.usage = new Map(); // agent -> { memory, cpu, lastCheck }
  }
  
  canLoad(manifest) {
    const current = this.getTotalUsage();
    const required = manifest.resources;
    return current.memory + required.memory < this.limits.memory;
  }
  
  track(agentName) {
    // Monitor memory/CPU usage
  }
}
```

---

## Usage Example

```javascript
const manager = new AgentLifecycleManager(orchestrator);

// Load manifests from directory
await manager.loadManifests('./agents');

// Task arrives
const task = "Fix the authentication bug in login.js";

// Manager automatically:
// 1. Finds best agents via semantic matching
// 2. Loads them if not already loaded
// 3. Routes task to best agent
// 4. Tracks usage
// 5. Unloads after idle timeout

const result = await manager.execute(task);

// Later: reconciliation loop runs
setInterval(() => manager.reconcile(), 60000);
```

---

## Benefits Over Marketplace

| Feature | Marketplace | Lifecycle Manager |
|---------|-------------|-------------------|
| **Loading** | Manual | Automatic |
| **Cleanup** | Never | Automatic |
| **Routing** | Name-based | Semantic |
| **Resources** | Unlimited | Monitored |
| **Updates** | Restart required | Hot reload |
| **State** | In-memory | Persistent manifests |

---

## Migration Path

1. **Keep marketplace.js** for backward compatibility
2. **Build lifecycle manager** alongside
3. **Migrate agents** to manifest format
4. **Switch orchestrator** to use lifecycle manager
5. **Deprecate marketplace** after validation

---

## File Structure

```
agent-orchestration-system/
├── agents/                    # Agent manifests
│   ├── gpu-dev.yaml
│   ├── prreddy-coder.yaml
│   └── music-general.yaml
├── src/
│   ├── agent-manifest.js      # Manifest parser
│   ├── lifecycle-controller.js # Main controller
│   ├── semantic-matcher.js    # Task → agent matching
│   ├── hot-reloader.js        # Module reloading
│   ├── resource-monitor.js    # Memory/CPU tracking
│   └── marketplace.js         # (deprecated)
└── test/
    ├── lifecycle-controller.test.js
    ├── semantic-matcher.test.js
    └── hot-reloader.test.js
```

---

## Next Steps

1. ✅ Design complete (this document)
2. ⏳ Build manifest parser
3. ⏳ Build lifecycle controller
4. ⏳ Build semantic matcher
5. ⏳ Build hot reloader
6. ⏳ Build resource monitor
7. ⏳ Integration tests
8. ⏳ Migrate existing agents to manifests
