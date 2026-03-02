class AgentMessageBus {
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

module.exports = AgentMessageBus;
