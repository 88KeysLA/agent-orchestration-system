// claude-agent.js
// Wrapper to use Claude API as an agent in the orchestration system

const Anthropic = require('@anthropic-ai/sdk');

class ClaudeAgent {
  constructor(name, systemPrompt, apiKey) {
    this.name = name;
    this.systemPrompt = systemPrompt;
    this.client = new Anthropic({ apiKey });
    this.bus = null;
    this.conversationHistory = [];
  }
  
  connectToBus(bus) {
    this.bus = bus;
    
    // Subscribe to tasks for this agent
    this.bus.subscribe(this.name, 'task', async (msg) => {
      try {
        const result = await this.execute(msg.task);
        this.bus.publish(msg.responseId, {
          agent: this.name,
          result,
          success: true
        }, this.name);
      } catch (error) {
        this.bus.publish(msg.responseId, {
          agent: this.name,
          error: error.message,
          success: false
        }, this.name);
      }
    });
  }
  
  async execute(task) {
    const response = await this.client.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 8096,
      system: this.systemPrompt,
      messages: [{ role: 'user', content: task }]
    });
    
    return response.content[0].text;
  }
}

module.exports = ClaudeAgent;
