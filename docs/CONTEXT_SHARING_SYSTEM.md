# Agent Context Sharing System

## Problem
Agents currently work in isolation. When one agent hands off to another, context is lost.

## Solution
Shared context store with handoff summaries and decision logs.

---

## Architecture

```
┌─────────────────────────────────────────┐
│         Context Store (JSON)            │
│  - Task metadata                        │
│  - Agent handoffs                       │
│  - Decision logs                        │
│  - File changes                         │
│  - Validation results                   │
└─────────────────────────────────────────┘
           ↑                    ↑
           │                    │
    ┌──────┴──────┐      ┌─────┴──────┐
    │   Agent 1   │  →   │  Agent 2   │
    │ (Researcher)│      │  (Coder)   │
    └─────────────┘      └────────────┘
```

---

## Context Store Schema

```json
{
  "taskId": "task-1234",
  "taskDescription": "Build playlist recommendation feature",
  "startTime": "2026-03-02T02:00:00Z",
  "mode": "thorough",
  "pattern": "Research-Plan-Build-Document",
  
  "handoffs": [
    {
      "from": "music-researcher",
      "to": "music-planner",
      "timestamp": "2026-03-02T02:15:00Z",
      "summary": "Found existing recommendation engine in music-core. Uses collaborative filtering. Performance: 200ms p99.",
      "keyFindings": [
        "Existing engine handles 10K RPS",
        "Uses Redis for caching",
        "No personalization layer"
      ],
      "recommendations": [
        "Add personalization layer",
        "Reuse existing infrastructure",
        "Estimate 2 weeks implementation"
      ],
      "filesAnalyzed": [
        "backend/services/recommendations.js",
        "backend/cache/redis-client.js"
      ]
    },
    {
      "from": "music-planner",
      "to": "music-general",
      "timestamp": "2026-03-02T02:30:00Z",
      "summary": "Created 5-component plan. Total estimate: 85 hours. Critical path: personalization layer (27h).",
      "plan": {
        "components": [
          {
            "name": "Personalization Layer",
            "estimate": "27h",
            "priority": 1,
            "dependencies": []
          },
          {
            "name": "API Integration",
            "estimate": "21h",
            "priority": 2,
            "dependencies": ["Personalization Layer"]
          }
        ]
      },
      "risks": [
        "Redis capacity may need scaling",
        "Personalization algorithm complexity"
      ]
    }
  ],
  
  "decisions": [
    {
      "timestamp": "2026-03-02T02:20:00Z",
      "agent": "music-planner",
      "decision": "Reuse existing recommendation engine",
      "rationale": "Already handles 10K RPS, proven in production",
      "alternatives": ["Build from scratch", "Use third-party service"],
      "impact": "Saves 40 hours development time"
    }
  ],
  
  "validations": [
    {
      "timestamp": "2026-03-02T02:25:00Z",
      "agent": "music-validator",
      "target": "plan",
      "result": "APPROVED",
      "evidence": [
        "Existing engine verified in production",
        "Redis capacity confirmed with ops team",
        "Timeline validated against team velocity"
      ],
      "concerns": []
    }
  ],
  
  "fileChanges": [
    {
      "path": "backend/services/personalization.js",
      "action": "created",
      "agent": "music-general",
      "timestamp": "2026-03-02T03:00:00Z"
    }
  ],
  
  "metrics": {
    "totalTime": "2h 30m",
    "agentsUsed": 3,
    "validationsPassed": 2,
    "filesModified": 5
  }
}
```

---

## Implementation

### context-store.js
```javascript
const fs = require('fs');
const path = require('path');

class ContextStore {
  constructor(taskId) {
    this.taskId = taskId;
    this.storePath = path.join(process.env.HOME, '.kiro', 'context', `${taskId}.json`);
    this.context = this.load();
  }

  load() {
    if (fs.existsSync(this.storePath)) {
      return JSON.parse(fs.readFileSync(this.storePath, 'utf8'));
    }
    return {
      taskId: this.taskId,
      startTime: new Date().toISOString(),
      handoffs: [],
      decisions: [],
      validations: [],
      fileChanges: [],
      metrics: {}
    };
  }

  save() {
    const dir = path.dirname(this.storePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(this.storePath, JSON.stringify(this.context, null, 2));
  }

  addHandoff(from, to, summary, data = {}) {
    this.context.handoffs.push({
      from,
      to,
      timestamp: new Date().toISOString(),
      summary,
      ...data
    });
    this.save();
  }

  addDecision(agent, decision, rationale, alternatives = [], impact = '') {
    this.context.decisions.push({
      timestamp: new Date().toISOString(),
      agent,
      decision,
      rationale,
      alternatives,
      impact
    });
    this.save();
  }

  addValidation(agent, target, result, evidence = [], concerns = []) {
    this.context.validations.push({
      timestamp: new Date().toISOString(),
      agent,
      target,
      result,
      evidence,
      concerns
    });
    this.save();
  }

  addFileChange(filePath, action, agent) {
    this.context.fileChanges.push({
      path: filePath,
      action,
      agent,
      timestamp: new Date().toISOString()
    });
    this.save();
  }

  getHandoffSummary(fromAgent) {
    const handoffs = this.context.handoffs.filter(h => h.from === fromAgent);
    if (handoffs.length === 0) return null;
    return handoffs[handoffs.length - 1];
  }

  getDecisions() {
    return this.context.decisions;
  }

  getValidations() {
    return this.context.validations;
  }

  getFileChanges() {
    return this.context.fileChanges;
  }

  generateHandoffReport(toAgent) {
    const relevantHandoffs = this.context.handoffs.filter(h => h.to === toAgent);
    const decisions = this.context.decisions;
    const validations = this.context.validations;
    
    return {
      previousWork: relevantHandoffs,
      keyDecisions: decisions,
      validationResults: validations,
      filesModified: this.context.fileChanges
    };
  }
}

module.exports = ContextStore;
```

---

## Usage Examples

### Agent 1: Researcher
```javascript
const ContextStore = require('./context-store');
const store = new ContextStore('task-1234');

// After research
store.addHandoff(
  'music-researcher',
  'music-planner',
  'Found existing recommendation engine. Performance: 200ms p99.',
  {
    keyFindings: [
      'Existing engine handles 10K RPS',
      'Uses Redis for caching'
    ],
    filesAnalyzed: ['backend/services/recommendations.js']
  }
);
```

### Agent 2: Planner
```javascript
const ContextStore = require('./context-store');
const store = new ContextStore('task-1234');

// Read previous context
const previousWork = store.getHandoffSummary('music-researcher');
console.log('Previous findings:', previousWork.keyFindings);

// Make decision
store.addDecision(
  'music-planner',
  'Reuse existing recommendation engine',
  'Already handles 10K RPS, proven in production',
  ['Build from scratch', 'Use third-party service'],
  'Saves 40 hours development time'
);

// Handoff to next agent
store.addHandoff(
  'music-planner',
  'music-general',
  'Created 5-component plan. Total: 85 hours.',
  {
    plan: { /* plan details */ }
  }
);
```

### Agent 3: Validator
```javascript
const ContextStore = require('./context-store');
const store = new ContextStore('task-1234');

// Validate plan
const decisions = store.getDecisions();
const plan = store.getHandoffSummary('music-planner');

store.addValidation(
  'music-validator',
  'plan',
  'APPROVED',
  [
    'Existing engine verified in production',
    'Timeline validated against team velocity'
  ],
  []
);
```

---

## CLI Integration

### View Context
```bash
kiro-cli context show task-1234
```

### Export Context
```bash
kiro-cli context export task-1234 > task-report.json
```

### Clear Old Context
```bash
kiro-cli context clean --older-than 30d
```

---

## Benefits

1. **No Lost Context:** Next agent sees all previous work
2. **Decision Tracking:** Understand why choices were made
3. **Validation History:** See what was validated and why
4. **File Tracking:** Know what changed and when
5. **Metrics:** Measure workflow efficiency
6. **Debugging:** Understand workflow failures
7. **Learning:** Analyze successful patterns

---

## Integration with Meta-Router

```javascript
// meta-agent-router.js
const ContextStore = require('./context-store');

function executeWorkflow(taskId, workflow) {
  const store = new ContextStore(taskId);
  
  workflow.steps.forEach((step, i) => {
    console.log(`Executing step ${step.step}: ${step.agent}`);
    
    // Get context from previous step
    if (i > 0) {
      const previousAgent = workflow.steps[i - 1].agent;
      const context = store.getHandoffSummary(previousAgent);
      console.log('Previous context:', context);
    }
    
    // Execute agent (placeholder)
    // const result = executeAgent(step.agent, context);
    
    // Record handoff
    if (i < workflow.steps.length - 1) {
      const nextAgent = workflow.steps[i + 1].agent;
      store.addHandoff(
        step.agent,
        nextAgent,
        'Step completed',
        { /* result data */ }
      );
    }
  });
}
```

---

## Next Steps

1. Implement ContextStore class
2. Integrate with meta-agent-router
3. Add CLI commands
4. Test with real workflows
5. Add metrics dashboard
