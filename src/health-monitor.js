/**
 * Health Monitor - Real-time agent health monitoring with auto-remediation
 * Tracks agent health and triggers remediation actions
 */
class HealthMonitor {
  constructor(options = {}) {
    this.agents = new Map();
    this.checkInterval = options.checkInterval || 5000;
    this.unhealthyThreshold = options.unhealthyThreshold || 3;
    this.remediationHandlers = new Map();
    this.intervalId = null;
  }

  // Register agent for monitoring
  register(agentId, healthCheck) {
    this.agents.set(agentId, {
      healthCheck,
      status: 'unknown',
      consecutiveFailures: 0,
      lastCheck: null,
      lastHealthy: null
    });
  }

  // Unregister agent
  unregister(agentId) {
    this.agents.delete(agentId);
  }

  // Add remediation handler for unhealthy agents
  onUnhealthy(handler) {
    const id = Date.now();
    this.remediationHandlers.set(id, handler);
    return () => this.remediationHandlers.delete(id);
  }

  // Start monitoring
  start() {
    if (this.intervalId) return;
    
    this.intervalId = setInterval(() => {
      this.checkAll();
    }, this.checkInterval);
  }

  // Stop monitoring
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  // Check all agents
  async checkAll() {
    const checks = Array.from(this.agents.entries()).map(([agentId, agent]) =>
      this.checkAgent(agentId, agent)
    );
    await Promise.all(checks);
  }

  // Check single agent
  async checkAgent(agentId, agent) {
    try {
      const healthy = await agent.healthCheck();
      agent.lastCheck = Date.now();
      
      if (healthy) {
        agent.status = 'healthy';
        agent.consecutiveFailures = 0;
        agent.lastHealthy = Date.now();
      } else {
        agent.consecutiveFailures++;
        if (agent.consecutiveFailures >= this.unhealthyThreshold) {
          agent.status = 'unhealthy';
          this.triggerRemediation(agentId, agent);
        } else {
          agent.status = 'degraded';
        }
      }
    } catch (error) {
      agent.consecutiveFailures++;
      agent.lastCheck = Date.now();
      if (agent.consecutiveFailures >= this.unhealthyThreshold) {
        agent.status = 'unhealthy';
        this.triggerRemediation(agentId, agent);
      } else {
        agent.status = 'degraded';
      }
    }
  }

  // Trigger remediation
  triggerRemediation(agentId, agent) {
    this.remediationHandlers.forEach(handler => {
      handler(agentId, agent);
    });
  }

  // Get health status
  getStatus(agentId) {
    if (agentId) {
      return this.agents.get(agentId);
    }
    return Object.fromEntries(this.agents);
  }
}

module.exports = HealthMonitor;
