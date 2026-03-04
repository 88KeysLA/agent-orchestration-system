/**
 * AgentLifecycleManager - Main facade for intelligent agent management
 */
const AgentManifest = require('./agent-manifest');
const LifecycleController = require('./lifecycle-controller');

class AgentLifecycleManager {
  constructor(orchestrator, options = {}) {
    this.orchestrator = orchestrator;
    this.controller = new LifecycleController(orchestrator);
    this.manifests = new Map(); // name -> manifest
    this.reconcileInterval = options.reconcileInterval || 60000; // 1 min
    this._reconcileTimer = null;
  }

  registerManifest(manifest) {
    if (!(manifest instanceof AgentManifest)) {
      manifest = new AgentManifest(manifest);
    }
    this.manifests.set(manifest.name, manifest);
  }

  async execute(task) {
    // Find matching agents
    const matches = [];
    for (const [name, manifest] of this.manifests) {
      if (manifest.matches(task)) {
        matches.push({ name, manifest });
      }
    }

    if (matches.length === 0) {
      throw new Error('No agents match this task');
    }

    // Load first match if not loaded
    const { name, manifest } = matches[0];
    const state = this.controller.getState(name);
    
    if (state === 'UNLOADED') {
      await this.controller.loadAgent(manifest);
    }

    this.controller.markUsed(name);

    // Execute via orchestrator
    return this.orchestrator.execute(task, { preferredAgent: name });
  }

  startReconciliation() {
    if (this._reconcileTimer) return;
    this._reconcileTimer = setInterval(
      () => this.controller.reconcile(),
      this.reconcileInterval
    );
  }

  stopReconciliation() {
    if (this._reconcileTimer) {
      clearInterval(this._reconcileTimer);
      this._reconcileTimer = null;
    }
  }

  getStatus() {
    const agents = [];
    for (const [name, manifest] of this.manifests) {
      agents.push({
        name,
        state: this.controller.getState(name),
        capabilities: manifest.capabilities,
        autoUnload: manifest.lifecycle.autoUnload
      });
    }
    return { agents, totalManifests: this.manifests.size };
  }
}

module.exports = AgentLifecycleManager;
