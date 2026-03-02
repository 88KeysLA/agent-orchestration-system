# Using Agent Orchestration with Claude

## The Real Question

**How to use this system to coordinate multiple Claude instances as agents?**

## Architecture

```
Agent Orchestration System
    ↓
Coordinates multiple Claude instances
    ↓
Each Claude = One Agent (gpu-dev, prreddy-coder, etc.)
```

## Implementation

### 1. Claude as Agent Wrapper

```javascript
// claude-agent.js
const Anthropic = require('@anthropic-ai/sdk');
const MessageBus = require('./src/message-bus');

class ClaudeAgent {
  constructor(name, systemPrompt, apiKey) {
    this.name = name;
    this.systemPrompt = systemPrompt;
    this.client = new Anthropic({ apiKey });
    this.bus = null;
  }
  
  connectToBus(bus) {
    this.bus = bus;
    
    // Subscribe to tasks for this agent
    this.bus.subscribe(this.name, 'task', async (msg) => {
      const result = await this.execute(msg.task);
      this.bus.publish(msg.responseId, result, this.name);
    });
  }
  
  async execute(task) {
    const response = await this.client.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 8096,
      system: this.systemPrompt,
      messages: [{
        role: 'user',
        content: task
      }]
    });
    
    return {
      agent: this.name,
      result: response.content[0].text
    };
  }
}

module.exports = ClaudeAgent;
```

### 2. Agent Registry with Claude

```javascript
// claude-orchestrator.js
const MessageBus = require('./src/message-bus');
const SimpleRL = require('./src/simple-rl');
const ClaudeAgent = require('./claude-agent');

class ClaudeOrchestrator {
  constructor(apiKey) {
    this.bus = new MessageBus();
    this.rl = new SimpleRL();
    this.agents = new Map();
    this.apiKey = apiKey;
  }
  
  registerAgent(name, systemPrompt) {
    const agent = new ClaudeAgent(name, systemPrompt, this.apiKey);
    agent.connectToBus(this.bus);
    this.agents.set(name, agent);
  }
  
  async executeTask(task, context) {
    // Use RL to select best agent
    const agentNames = Array.from(this.agents.keys());
    const selectedName = this.rl.selectAgent(context, agentNames);
    
    console.log(`Selected agent: ${selectedName}`);
    
    // Execute via message bus
    const result = await this.bus.request(
      'task',
      { task },
      'orchestrator',
      30000
    );
    
    // Update RL based on result quality
    const reward = this.evaluateResult(result);
    this.rl.update(context, selectedName, reward);
    
    return result;
  }
  
  evaluateResult(result) {
    // Simple evaluation - can be made more sophisticated
    return result.result.length > 100 ? 100 : 50;
  }
}

module.exports = ClaudeOrchestrator;
```

### 3. Usage Example

```javascript
// example-claude-orchestration.js
const ClaudeOrchestrator = require('./claude-orchestrator');

async function main() {
  const orchestrator = new ClaudeOrchestrator(process.env.ANTHROPIC_API_KEY);
  
  // Register Claude agents with different specializations
  orchestrator.registerAgent('gpu-dev', `
    You are gpu-dev, a fast minimal coder.
    Write only the essential code, no boilerplate.
    Keep implementations under 50 lines.
  `);
  
  orchestrator.registerAgent('prreddy-coder', `
    You are prreddy-coder, a quality-focused developer.
    Write production-ready code with error handling.
    Include comprehensive validation.
  `);
  
  orchestrator.registerAgent('prreddy-auditor', `
    You are prreddy-auditor, a security expert.
    Review code for vulnerabilities.
    Provide actionable security recommendations.
  `);
  
  // Execute tasks - system learns which agent is best
  const result1 = await orchestrator.executeTask(
    'Write a function to validate email addresses',
    'quick-task'
  );
  console.log('Result:', result1);
  
  const result2 = await orchestrator.executeTask(
    'Review this code for security issues: [code]',
    'security-review'
  );
  console.log('Result:', result2);
}

main();
```

## Key Differences for Claude

### 1. Async Communication
Claude API calls are async, so:
```javascript
// All agent executions are async
const result = await agent.execute(task);

// Message bus handles async request-response
const result = await bus.request('task', data, 'orchestrator');
```

### 2. API Rate Limits
```javascript
class ClaudeOrchestrator {
  constructor(apiKey) {
    this.rateLimiter = new RateLimiter(50); // 50 requests/min
  }
  
  async executeTask(task, context) {
    await this.rateLimiter.wait();
    // ... execute
  }
}
```

### 3. Cost Tracking
```javascript
class ClaudeAgent {
  async execute(task) {
    const response = await this.client.messages.create({...});
    
    // Track costs
    this.logUsage({
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cost: this.calculateCost(response.usage)
    });
    
    return result;
  }
}
```

### 4. Context Management
```javascript
class ClaudeAgent {
  constructor(name, systemPrompt, apiKey) {
    this.conversationHistory = [];
  }
  
  async execute(task) {
    // Add to history
    this.conversationHistory.push({
      role: 'user',
      content: task
    });
    
    const response = await this.client.messages.create({
      messages: this.conversationHistory
    });
    
    // Store response
    this.conversationHistory.push({
      role: 'assistant',
      content: response.content[0].text
    });
  }
}
```

## Complete Working Example

```javascript
// claude-orchestration-demo.js
const Anthropic = require('@anthropic-ai/sdk');
const MessageBus = require('./src/message-bus');
const SimpleRL = require('./src/simple-rl');

class ClaudeAgent {
  constructor(name, systemPrompt, client) {
    this.name = name;
    this.systemPrompt = systemPrompt;
    this.client = client;
  }
  
  async execute(task) {
    const response = await this.client.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 4096,
      system: this.systemPrompt,
      messages: [{ role: 'user', content: task }]
    });
    
    return response.content[0].text;
  }
}

async function demo() {
  const client = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY
  });
  
  const bus = new MessageBus();
  const rl = new SimpleRL();
  
  // Create Claude agents
  const agents = {
    'gpu-dev': new ClaudeAgent('gpu-dev', 'You write minimal code', client),
    'prreddy-coder': new ClaudeAgent('prreddy-coder', 'You write quality code', client)
  };
  
  // Connect agents to bus
  Object.entries(agents).forEach(([name, agent]) => {
    bus.subscribe(name, 'task', async (msg) => {
      console.log(`${name} executing...`);
      const result = await agent.execute(msg.task);
      bus.publish(msg.responseId, { agent: name, result }, name);
    });
  });
  
  // Execute task with RL selection
  const agentNames = Object.keys(agents);
  const context = 'bug-fix';
  const selectedAgent = rl.selectAgent(context, agentNames);
  
  console.log(`RL selected: ${selectedAgent}`);
  
  const result = await bus.request(
    'task',
    { task: 'Write a function to reverse a string' },
    'orchestrator',
    30000
  );
  
  console.log('Result:', result);
  
  // Update RL
  const reward = result.result.length < 200 ? 100 : 50;
  rl.update(context, selectedAgent, reward);
}

demo();
```

## Installation

```bash
npm install @anthropic-ai/sdk
export ANTHROPIC_API_KEY=your-key-here
node claude-orchestration-demo.js
```

## Benefits

1. **Multiple Claude instances** work as specialized agents
2. **RL learns** which Claude agent is best for each task
3. **Message bus** coordinates communication
4. **Cost efficient** - only calls needed agents
5. **Parallel execution** - multiple Claudes work simultaneously

## Summary

✅ Each Claude instance = One specialized agent
✅ Message bus coordinates them
✅ RL learns optimal selection
✅ System tracks costs and performance
✅ Scales to many Claude agents

**This turns Claude into a multi-agent system!** 🚀
