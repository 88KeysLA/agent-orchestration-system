/**
 * AgentManifest - Declarative agent definition
 */
class AgentManifest {
  constructor(data) {
    this.name = data.name;
    this.version = data.version || '1.0.0';
    this.capabilities = data.capabilities || [];
    this.triggers = data.triggers || { patterns: [] };
    this.resources = data.resources || { memory: '256MB', cpu: 0.5 };
    this.lifecycle = data.lifecycle || { maxIdleTime: '5m', autoUnload: true };
    this.modulePath = data.modulePath;
  }

  matches(task) {
    const taskLower = task.toLowerCase();
    return this.triggers.patterns.some(p => taskLower.includes(p.toLowerCase()));
  }

  get maxIdleMs() {
    const time = this.lifecycle.maxIdleTime;
    const match = time.match(/^(\d+)([smh])$/);
    if (!match) return 300000; // 5m default
    const [, num, unit] = match;
    const multipliers = { s: 1000, m: 60000, h: 3600000 };
    return parseInt(num) * multipliers[unit];
  }
}

module.exports = AgentManifest;
