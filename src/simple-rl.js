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

module.exports = SimpleRL;
