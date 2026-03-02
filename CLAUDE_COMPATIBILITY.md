# Claude Environment Compatibility

## Current Status
✅ **Already Claude-compatible!** The system is pure JavaScript with no external dependencies.

## What Works in Claude

### 1. All Core Components
- ✅ `src/message-bus.js` - Pure JS, no dependencies
- ✅ `src/simple-rl.js` - Pure JS, no dependencies
- ✅ `src/meta-agent-router.js` - Pure JS, no dependencies

### 2. All Demos
- ✅ `examples/message-bus-demo.js` - Works in Claude
- ✅ `examples/simple-rl-demo.js` - Works in Claude

### 3. All Tests
- ✅ `test/message-bus.test.js` - Works in Claude

## Usage in Claude

### Option 1: Copy-Paste Components
```javascript
// Just copy the component code into Claude
const MessageBus = /* paste src/message-bus.js */;

// Use it
const bus = new MessageBus();
bus.subscribe('agent1', 'topic', (msg) => console.log(msg));
```

### Option 2: Use as MCP Server
The system can be exposed as an MCP (Model Context Protocol) server:

```javascript
// mcp-server.js
const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const MessageBus = require('./src/message-bus');
const SimpleRL = require('./src/simple-rl');

const server = new Server({
  name: 'agent-orchestration',
  version: '0.1.0'
});

const bus = new MessageBus();
const rl = new SimpleRL();

// Expose as MCP tools
server.setRequestHandler('tools/list', async () => ({
  tools: [
    {
      name: 'agent_communicate',
      description: 'Send message between agents',
      inputSchema: {
        type: 'object',
        properties: {
          from: { type: 'string' },
          to: { type: 'string' },
          message: { type: 'object' }
        }
      }
    },
    {
      name: 'select_agent',
      description: 'Use RL to select optimal agent',
      inputSchema: {
        type: 'object',
        properties: {
          context: { type: 'string' },
          agents: { type: 'array', items: { type: 'string' } }
        }
      }
    }
  ]
}));

server.setRequestHandler('tools/call', async (request) => {
  if (request.params.name === 'agent_communicate') {
    const { from, to, message } = request.params.arguments;
    bus.publish(to, message, from);
    return { success: true };
  }
  
  if (request.params.name === 'select_agent') {
    const { context, agents } = request.params.arguments;
    const selected = rl.selectAgent(context, agents);
    return { agent: selected };
  }
});
```

### Option 3: Inline Usage (Recommended for Claude)
Since Claude can execute JavaScript, just use it directly:

```javascript
// In Claude conversation:

// 1. Define the classes inline
class MessageBus {
  constructor() {
    this.subscribers = new Map();
  }
  
  subscribe(agentId, topic, handler) {
    if (!this.subscribers.has(topic)) {
      this.subscribers.set(topic, []);
    }
    this.subscribers.get(topic).push({ agentId, handler });
  }
  
  publish(topic, message, fromAgent) {
    const subs = this.subscribers.get(topic) || [];
    subs.forEach(({ agentId, handler }) => {
      if (agentId !== fromAgent) {
        handler(message);
      }
    });
  }
}

// 2. Use it
const bus = new MessageBus();
bus.subscribe('validator', 'validate', (msg) => {
  console.log('Validating:', msg);
});
bus.publish('validate', { code: 'test' }, 'coder');
```

## Key Differences for Claude

### 1. No File System (Usually)
Claude typically can't write files, so:
- ❌ Can't use `fs.writeFileSync`
- ✅ Can use in-memory storage
- ✅ Can return results as JSON

### 2. No External Dependencies
- ✅ Already pure JS, no npm packages needed
- ✅ No require() needed in Claude
- ✅ Just copy-paste the code

### 3. Async Handling
- ✅ Promises work fine
- ✅ async/await works fine
- ✅ setTimeout works fine

## Claude-Optimized Version

Here's a single-file version perfect for Claude:

```javascript
// agent-orchestration-claude.js
// Copy-paste this entire file into Claude

class MessageBus {
  constructor() {
    this.subscribers = new Map();
  }
  
  subscribe(agentId, topic, handler) {
    if (!this.subscribers.has(topic)) {
      this.subscribers.set(topic, []);
    }
    this.subscribers.get(topic).push({ agentId, handler });
  }
  
  publish(topic, message, fromAgent) {
    const subs = this.subscribers.get(topic) || [];
    subs.forEach(({ agentId, handler }) => {
      if (agentId !== fromAgent) {
        handler(message);
      }
    });
  }
  
  async request(topic, message, fromAgent, timeout = 5000) {
    return new Promise((resolve, reject) => {
      const responseId = `response-${Date.now()}`;
      const timeoutId = setTimeout(() => reject(new Error('Timeout')), timeout);
      
      this.subscribe(fromAgent, responseId, (response) => {
        clearTimeout(timeoutId);
        resolve(response);
      });
      
      this.publish(topic, { ...message, responseId }, fromAgent);
    });
  }
}

class SimpleRL {
  constructor() {
    this.qValues = new Map();
    this.counts = new Map();
    this.epsilon = 0.1;
  }
  
  selectAgent(context, agents) {
    if (Math.random() < this.epsilon) {
      return agents[Math.floor(Math.random() * agents.length)];
    }
    return this.bestAgent(context, agents);
  }
  
  bestAgent(context, agents) {
    let best = agents[0];
    let bestQ = this.getQ(context, best);
    
    for (const agent of agents) {
      const q = this.getQ(context, agent);
      if (q > bestQ) {
        bestQ = q;
        best = agent;
      }
    }
    return best;
  }
  
  update(context, agent, reward) {
    const key = `${context}-${agent}`;
    const n = this.counts.get(key) || 0;
    const q = this.qValues.get(key) || 0;
    
    this.counts.set(key, n + 1);
    this.qValues.set(key, q + (reward - q) / (n + 1));
  }
  
  getQ(context, agent) {
    return this.qValues.get(`${context}-${agent}`) || 0;
  }
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { MessageBus, SimpleRL };
}

// Example usage in Claude:
// const { MessageBus, SimpleRL } = /* paste this file */;
// const bus = new MessageBus();
// const rl = new SimpleRL();
```

## Testing in Claude

You can test it directly:

```javascript
// Test 1: Message Bus
const bus = new MessageBus();
let received = false;

bus.subscribe('agent1', 'test', (msg) => {
  received = true;
  console.log('✓ Received:', msg);
});

bus.publish('test', { data: 'hello' }, 'agent2');
console.log('Message bus works:', received); // true

// Test 2: RL
const rl = new SimpleRL();
const agents = ['gpu-dev', 'prreddy-coder'];

// Train
for (let i = 0; i < 50; i++) {
  const agent = rl.selectAgent('bug-fix', agents);
  const reward = agent === 'gpu-dev' ? 100 : 50;
  rl.update('bug-fix', agent, reward);
}

// Check learned
const best = rl.bestAgent('bug-fix', agents);
console.log('RL learned best agent:', best); // 'gpu-dev'
```

## Summary

✅ **Already Claude-compatible** - Pure JS, no dependencies
✅ **Copy-paste ready** - Single file version available
✅ **Works in browser** - Can run in Claude's JS environment
✅ **No modifications needed** - Current code works as-is

**Recommendation:** Use the single-file version above for Claude. Just copy-paste and use!
