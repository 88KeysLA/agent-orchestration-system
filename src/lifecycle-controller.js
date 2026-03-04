/**
 * LifecycleController - Kubernetes-style agent lifecycle management
 */
const AgentManifest = require('./agent-manifest');

class LifecycleController {
  constructor(orchestrator) {
    this.orchestrator = orchestrator;
    this.agents = new Map(); // name -> { manifest, instance, state, lastUsed }
    this.states = { UNLOADED: 0, LOADING: 1, ACTIVE: 2, IDLE: 3, UNLOADING: 4 };
  }

  async loadAgent(manifest) {
    if (this.agents.has(manifest.name)) return;
    
    this.agents.set(manifest.name, {
      manifest,
      instance: null,
      state: this.states.LOADING,
      lastUsed: Date.now()
    });

    try {
      const Agent = require(manifest.modulePath);
      const instance = typeof Agent === 'function' ? new Agent() : Agent;
      
      this.orchestrator.registerAgent(
        manifest.name,
        manifest.version,
        instance,
        { capabilities: manifest.capabilities }
      );

      const agent = this.agents.get(manifest.name);
      agent.instance = instance;
      agent.state = this.states.ACTIVE;
    } catch (err) {
      this.agents.delete(manifest.name);
      throw err;
    }
  }

  async unloadAgent(name) {
    const agent = this.agents.get(name);
    if (!agent) return;

    agent.state = this.states.UNLOADING;
    
    // Unregister from orchestrator
    if (this.orchestrator.agents) {
      this.orchestrator.agents.delete(name);
    }

    // Clear require cache
    if (agent.manifest.modulePath) {
      delete require.cache[require.resolve(agent.manifest.modulePath)];
    }

    this.agents.delete(name);
  }

  markUsed(name) {
    const agent = this.agents.get(name);
    if (agent) {
      agent.lastUsed = Date.now();
      if (agent.state === this.states.IDLE) {
        agent.state = this.states.ACTIVE;
      }
    }
  }

  async reconcile() {
    const now = Date.now();
    const toUnload = [];
    
    for (const [name, agent] of this.agents) {
      if (!agent.manifest.lifecycle.autoUnload) continue;
      
      const idleTime = now - agent.lastUsed;
      const maxIdle = agent.manifest.maxIdleMs;

      if (agent.state === this.states.ACTIVE && idleTime > maxIdle / 2) {
        agent.state = this.states.IDLE;
      }

      if (idleTime > maxIdle) {
        toUnload.push(name);
      }
    }

    for (const name of toUnload) {
      await this.unloadAgent(name);
    }
  }

  getState(name) {
    const agent = this.agents.get(name);
    return agent ? Object.keys(this.states)[agent.state] : 'UNLOADED';
  }

  get size() {
    return this.agents.size;
  }
}

module.exports = LifecycleController;
