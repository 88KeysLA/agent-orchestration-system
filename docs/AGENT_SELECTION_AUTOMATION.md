# Agent Selection Automation

## Overview

This tool analyzes task descriptions and automatically suggests the best agent(s) and orchestration pattern.

## Usage

```bash
node agent-selector.js "Fix authentication bug in production"
node agent-selector.js "Design new microservices architecture"
node agent-selector.js "Create documentation for API"
```

## Implementation

```javascript
// agent-selector.js
const agentRules = {
  // Task type detection
  taskTypes: {
    bugFix: {
      keywords: ['bug', 'fix', 'error', 'broken', 'issue', 'problem'],
      agents: ['gpu-dev'],
      pattern: 'Quick Fix'
    },
    feature: {
      keywords: ['feature', 'add', 'implement', 'build', 'create new'],
      agents: ['music-researcher', 'music-planner', 'music-general'],
      pattern: 'Research-Plan-Build-Document'
    },
    architecture: {
      keywords: ['architecture', 'design', 'system', 'microservices', 'infrastructure'],
      agents: ['eos'],
      pattern: 'Architecture-First'
    },
    security: {
      keywords: ['security', 'vulnerability', 'audit', 'compliance', 'penetration'],
      agents: ['prreddy-auditor'],
      pattern: 'Security Hardening'
    },
    documentation: {
      keywords: ['document', 'docs', 'readme', 'guide', 'wiki'],
      agents: ['prreddy-writer', 'music-docs'],
      pattern: 'Documentation Sprint'
    },
    investigation: {
      keywords: ['investigate', 'debug', 'analyze', 'understand', 'why'],
      agents: ['prreddy-researcher', 'music-logs'],
      pattern: 'Investigation-Heavy'
    },
    incident: {
      keywords: ['incident', 'outage', 'down', 'p0', 'sev1', 'emergency'],
      agents: ['music-logs', 'music-rca'],
      pattern: 'Incident Response'
    },
    testing: {
      keywords: ['test', 'qa', 'quality', 'validation', 'verify'],
      agents: ['music-qa', 'prreddy-ui-tester'],
      pattern: 'Testing & Validation'
    },
    performance: {
      keywords: ['performance', 'slow', 'optimize', 'speed', 'latency'],
      agents: ['prreddy-researcher', 'gpu-research', 'prreddy-coder'],
      pattern: 'Performance Optimization'
    },
    migration: {
      keywords: ['migrate', 'migration', 'move', 'transfer', 'upgrade'],
      agents: ['prreddy-researcher', 'eos', 'prreddy-coder'],
      pattern: 'Data Migration'
    }
  },

  // Domain detection
  domains: {
    music: {
      keywords: ['music', 'playlist', 'song', 'artist', 'album', 'playback'],
      agentPrefix: 'music-'
    },
    alexa: {
      keywords: ['alexa', 'voice', 'skill', 'echo', 'device'],
      agentPrefix: 'alexa-'
    },
    generic: {
      keywords: [],
      agentPrefix: 'prreddy-'
    }
  },

  // Urgency detection
  urgency: {
    immediate: {
      keywords: ['urgent', 'asap', 'now', 'immediately', 'critical', 'p0'],
      recommendation: 'Skip planning, use gpu-dev for speed'
    },
    sameDay: {
      keywords: ['today', 'same-day', 'quick'],
      recommendation: 'Minimal planning, focus on execution'
    },
    normal: {
      keywords: ['sprint', 'week', 'soon'],
      recommendation: 'Full workflow with planning'
    }
  },

  // Complexity detection
  complexity: {
    low: {
      keywords: ['simple', 'small', 'minor', 'quick', 'trivial'],
      recommendation: 'Single agent sufficient'
    },
    medium: {
      keywords: ['moderate', 'standard', 'typical'],
      recommendation: '2-3 agents sequential'
    },
    high: {
      keywords: ['complex', 'large', 'major', 'significant'],
      recommendation: 'Full orchestration pattern'
    },
    veryHigh: {
      keywords: ['massive', 'enterprise', 'critical', 'multi-team'],
      recommendation: 'Architecture → parallel teams → integration'
    }
  }
};

function analyzeTask(taskDescription) {
  const lower = taskDescription.toLowerCase();
  
  // Detect task type
  let taskType = 'feature'; // default
  let maxScore = 0;
  
  for (const [type, config] of Object.entries(agentRules.taskTypes)) {
    const score = config.keywords.filter(kw => lower.includes(kw)).length;
    if (score > maxScore) {
      maxScore = score;
      taskType = type;
    }
  }
  
  // Detect domain
  let domain = 'generic';
  for (const [dom, config] of Object.entries(agentRules.domains)) {
    if (config.keywords.some(kw => lower.includes(kw))) {
      domain = dom;
      break;
    }
  }
  
  // Detect urgency
  let urgency = 'normal';
  for (const [urg, config] of Object.entries(agentRules.urgency)) {
    if (config.keywords.some(kw => lower.includes(kw))) {
      urgency = urg;
      break;
    }
  }
  
  // Detect complexity
  let complexity = 'medium';
  for (const [comp, config] of Object.entries(agentRules.complexity)) {
    if (config.keywords.some(kw => lower.includes(kw))) {
      complexity = comp;
      break;
    }
  }
  
  return { taskType, domain, urgency, complexity };
}

function selectAgents(analysis) {
  const { taskType, domain, urgency, complexity } = analysis;
  const taskConfig = agentRules.taskTypes[taskType];
  
  let agents = [...taskConfig.agents];
  
  // Adjust for domain
  if (domain === 'music') {
    agents = agents.map(agent => {
      if (agent.startsWith('prreddy-')) {
        return agent.replace('prreddy-', 'music-');
      }
      return agent;
    });
  }
  
  // Adjust for urgency
  if (urgency === 'immediate') {
    agents = ['gpu-dev']; // Override with fastest agent
  }
  
  // Adjust for complexity
  if (complexity === 'low' && agents.length > 1) {
    agents = [agents[0]]; // Use only first agent for simple tasks
  }
  
  return {
    agents,
    pattern: taskConfig.pattern,
    urgencyNote: agentRules.urgency[urgency].recommendation,
    complexityNote: agentRules.complexity[complexity].recommendation
  };
}

function generateCommand(agents, pattern) {
  if (agents.length === 1) {
    return `kiro-cli chat --agent ${agents[0]}`;
  }
  
  return `# Use orchestration pattern: ${pattern}
# Step 1: kiro-cli chat --agent ${agents[0]}
# Step 2: kiro-cli chat --agent ${agents[1]}
${agents.length > 2 ? `# Step 3: kiro-cli chat --agent ${agents[2]}` : ''}`;
}

// CLI Interface
if (require.main === module) {
  const taskDescription = process.argv[2];
  
  if (!taskDescription) {
    console.log('Usage: node agent-selector.js "your task description"');
    process.exit(1);
  }
  
  console.log('\\n🤖 Agent Selection Tool\\n');
  console.log(`Task: "${taskDescription}"\\n`);
  
  const analysis = analyzeTask(taskDescription);
  console.log('📊 Analysis:');
  console.log(`  Task Type: ${analysis.taskType}`);
  console.log(`  Domain: ${analysis.domain}`);
  console.log(`  Urgency: ${analysis.urgency}`);
  console.log(`  Complexity: ${analysis.complexity}\\n`);
  
  const selection = selectAgents(analysis);
  console.log('✅ Recommended Agents:');
  selection.agents.forEach((agent, i) => {
    console.log(`  ${i + 1}. ${agent}`);
  });
  
  console.log(`\\n📋 Orchestration Pattern: ${selection.pattern}`);
  console.log(`⚡ Urgency Note: ${selection.urgencyNote}`);
  console.log(`🎯 Complexity Note: ${selection.complexityNote}\\n`);
  
  console.log('💻 Command:');
  console.log(generateCommand(selection.agents, selection.pattern));
  console.log('');
}

module.exports = { analyzeTask, selectAgents, generateCommand };
```

## Examples

### Example 1: Bug Fix
```bash
$ node agent-selector.js "Fix authentication bug in production"

🤖 Agent Selection Tool

Task: "Fix authentication bug in production"

📊 Analysis:
  Task Type: bugFix
  Domain: generic
  Urgency: normal
  Complexity: medium

✅ Recommended Agents:
  1. gpu-dev

📋 Orchestration Pattern: Quick Fix
⚡ Urgency Note: Full workflow with planning
🎯 Complexity Note: 2-3 agents sequential

💻 Command:
kiro-cli chat --agent gpu-dev
```

### Example 2: New Feature
```bash
$ node agent-selector.js "Build new Music playlist recommendation feature"

🤖 Agent Selection Tool

Task: "Build new Music playlist recommendation feature"

📊 Analysis:
  Task Type: feature
  Domain: music
  Urgency: normal
  Complexity: medium

✅ Recommended Agents:
  1. music-researcher
  2. music-planner
  3. music-general

📋 Orchestration Pattern: Research-Plan-Build-Document
⚡ Urgency Note: Full workflow with planning
🎯 Complexity Note: 2-3 agents sequential

💻 Command:
# Use orchestration pattern: Research-Plan-Build-Document
# Step 1: kiro-cli chat --agent music-researcher
# Step 2: kiro-cli chat --agent music-planner
# Step 3: kiro-cli chat --agent music-general
```

### Example 3: Security Audit
```bash
$ node agent-selector.js "Security audit of authentication system"

🤖 Agent Selection Tool

Task: "Security audit of authentication system"

📊 Analysis:
  Task Type: security
  Domain: generic
  Urgency: normal
  Complexity: medium

✅ Recommended Agents:
  1. prreddy-auditor

📋 Orchestration Pattern: Security Hardening
⚡ Urgency Note: Full workflow with planning
🎯 Complexity Note: 2-3 agents sequential

💻 Command:
kiro-cli chat --agent prreddy-auditor
```

### Example 4: Urgent Production Issue
```bash
$ node agent-selector.js "URGENT: API is down, fix now!"

🤖 Agent Selection Tool

Task: "URGENT: API is down, fix now!"

📊 Analysis:
  Task Type: incident
  Domain: generic
  Urgency: immediate
  Complexity: medium

✅ Recommended Agents:
  1. gpu-dev

📋 Orchestration Pattern: Incident Response
⚡ Urgency Note: Skip planning, use gpu-dev for speed
🎯 Complexity Note: 2-3 agents sequential

💻 Command:
kiro-cli chat --agent gpu-dev
```

## Integration with Kiro CLI

To integrate this into Kiro CLI, add to your shell profile:

```bash
# ~/.bashrc or ~/.zshrc
agent-select() {
  node ~/aip-leadership-dashboard/agent-selector.js "$1"
}
```

Then use:
```bash
agent-select "your task description"
```

## Future Enhancements

1. **Machine Learning**: Train model on historical task→agent mappings
2. **Context Awareness**: Consider current project, recent tasks
3. **Team Preferences**: Learn team-specific agent preferences
4. **Success Metrics**: Track which agent selections led to successful outcomes
5. **Interactive Mode**: Ask clarifying questions for ambiguous tasks
