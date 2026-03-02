const fs = require('fs');
const path = require('path');

class SimpleRL {
  constructor(options = {}) {
    this.qValues = new Map();
    this.counts = new Map();
    this.epsilon = options.epsilon != null ? options.epsilon : 0.1;
    this.persistPath = options.persistPath || null;

    if (this.persistPath) {
      this.load();
    }
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

    if (this.persistPath) {
      this.save();
    }
  }

  getQ(context, agent) {
    return this.qValues.get(`${context}-${agent}`) || 0;
  }

  save() {
    if (!this.persistPath) return;
    const dir = path.dirname(this.persistPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const data = {
      qValues: Object.fromEntries(this.qValues),
      counts: Object.fromEntries(this.counts),
      savedAt: new Date().toISOString()
    };
    fs.writeFileSync(this.persistPath, JSON.stringify(data, null, 2));
  }

  load() {
    if (!this.persistPath) return;
    try {
      const raw = fs.readFileSync(this.persistPath, 'utf8');
      const data = JSON.parse(raw);
      this.qValues = new Map(Object.entries(data.qValues || {}));
      this.counts = new Map(Object.entries(data.counts || {}).map(([k, v]) => [k, Number(v)]));
    } catch {
      // File doesn't exist yet or is corrupt — start fresh
    }
  }

  getStats() {
    const entries = [];
    for (const [key, q] of this.qValues) {
      entries.push({ key, qValue: q, count: this.counts.get(key) || 0 });
    }
    return entries.sort((a, b) => b.qValue - a.qValue);
  }
}

module.exports = SimpleRL;
