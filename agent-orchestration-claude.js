// agent-orchestration-claude.js
// Single-file version for Claude environments
// Copy-paste this entire file into Claude and use directly

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
  
  getStats() {
    const stats = {};
    for (const [key, value] of this.qValues.entries()) {
      stats[key] = {
        qValue: value,
        count: this.counts.get(key) || 0
      };
    }
    return stats;
  }
}

// Export for Node.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { MessageBus, SimpleRL };
}

// Export for browser/Claude
if (typeof window !== 'undefined') {
  window.MessageBus = MessageBus;
  window.SimpleRL = SimpleRL;
}

// Quick test function
function runQuickTest() {
  console.log('🧪 Running quick test...\n');
  
  // Test MessageBus
  const bus = new MessageBus();
  let received = false;
  
  bus.subscribe('agent1', 'test', (msg) => {
    received = true;
    console.log('✓ MessageBus: Received message');
  });
  
  bus.publish('test', { data: 'hello' }, 'agent2');
  
  if (!received) {
    console.log('✗ MessageBus: Failed');
    return false;
  }
  
  // Test SimpleRL
  const rl = new SimpleRL();
  const agents = ['agent-a', 'agent-b'];
  
  // Train
  for (let i = 0; i < 20; i++) {
    const agent = rl.selectAgent('context1', agents);
    const reward = agent === 'agent-a' ? 100 : 50;
    rl.update('context1', agent, reward);
  }
  
  const best = rl.bestAgent('context1', agents);
  if (best === 'agent-a') {
    console.log('✓ SimpleRL: Learned optimal agent');
  } else {
    console.log('✗ SimpleRL: Failed to learn');
    return false;
  }
  
  console.log('\n✅ All tests passed!\n');
  return true;
}

// Auto-run test if in Node.js
if (typeof require !== 'undefined' && require.main === module) {
  runQuickTest();
}
