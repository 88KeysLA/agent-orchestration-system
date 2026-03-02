// claude-orchestrator.js
// Orchestrates multiple Claude instances as specialized agents

const MessageBus = require('./message-bus');
const SimpleRL = require('./simple-rl');
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
    console.log(`✓ Registered agent: ${name}`);
  }
  
  async executeTask(task, context = 'general') {
    const agentNames = Array.from(this.agents.keys());
    const selectedName = this.rl.selectAgent(context, agentNames);
    
    console.log(`\n🤖 Selected agent: ${selectedName} (context: ${context})`);
    console.log(`📝 Task: ${task.substring(0, 60)}...`);
    
    const result = await this.bus.request(
      'task',
      { task },
      'orchestrator',
      60000
    );
    
    if (result.success) {
      const reward = this.evaluateResult(result);
      this.rl.update(context, selectedName, reward);
      console.log(`✅ Completed (reward: ${reward})`);
    } else {
      this.rl.update(context, selectedName, 0);
      console.log(`❌ Failed: ${result.error}`);
    }
    
    return result;
  }
  
  evaluateResult(result) {
    // Simple heuristic - can be made more sophisticated
    const length = result.result.length;
    if (length < 50) return 30;
    if (length < 200) return 70;
    if (length < 1000) return 100;
    return 80;
  }
  
  getStats() {
    return this.rl.getStats();
  }
}

module.exports = ClaudeOrchestrator;
