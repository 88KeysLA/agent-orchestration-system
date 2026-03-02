/**
 * Agent Registry - Agent versioning and deployment management
 * Supports canary and blue-green deployments
 */
class AgentRegistry {
  constructor() {
    this.agents = new Map();
    this.versions = new Map();
    this.deployments = new Map();
  }

  // Register agent version
  register(agentId, version, implementation, metadata = {}) {
    const versionKey = `${agentId}@${version}`;
    
    if (!this.agents.has(agentId)) {
      this.agents.set(agentId, {
        versions: [],
        activeVersion: null,
        deploymentStrategy: 'direct'
      });
    }
    
    this.versions.set(versionKey, {
      agentId,
      version,
      implementation,
      metadata,
      registeredAt: Date.now()
    });
    
    const agent = this.agents.get(agentId);
    if (!agent.versions.includes(version)) {
      agent.versions.push(version);
    }
    
    return versionKey;
  }

  // Set active version (direct deployment)
  setActive(agentId, version) {
    const agent = this.agents.get(agentId);
    if (!agent) throw new Error(`Agent ${agentId} not found`);
    
    const versionKey = `${agentId}@${version}`;
    if (!this.versions.has(versionKey)) {
      throw new Error(`Version ${version} not found for ${agentId}`);
    }
    
    agent.activeVersion = version;
    agent.deploymentStrategy = 'direct';
    return true;
  }

  // Start canary deployment
  startCanary(agentId, newVersion, trafficPercent = 10) {
    const agent = this.agents.get(agentId);
    if (!agent) throw new Error(`Agent ${agentId} not found`);
    if (!agent.activeVersion) throw new Error(`No active version for ${agentId}`);
    
    const deploymentId = `canary-${Date.now()}`;
    this.deployments.set(deploymentId, {
      agentId,
      type: 'canary',
      oldVersion: agent.activeVersion,
      newVersion,
      trafficPercent,
      startedAt: Date.now()
    });
    
    agent.deploymentStrategy = 'canary';
    agent.canaryVersion = newVersion;
    agent.canaryTraffic = trafficPercent;
    
    return deploymentId;
  }

  // Promote canary to full deployment
  promoteCanary(deploymentId) {
    const deployment = this.deployments.get(deploymentId);
    if (!deployment) throw new Error(`Deployment ${deploymentId} not found`);
    if (deployment.type !== 'canary') throw new Error('Not a canary deployment');
    
    const agent = this.agents.get(deployment.agentId);
    agent.activeVersion = deployment.newVersion;
    agent.deploymentStrategy = 'direct';
    delete agent.canaryVersion;
    delete agent.canaryTraffic;
    
    this.deployments.delete(deploymentId);
    return true;
  }

  // Rollback canary
  rollbackCanary(deploymentId) {
    const deployment = this.deployments.get(deploymentId);
    if (!deployment) throw new Error(`Deployment ${deploymentId} not found`);
    
    const agent = this.agents.get(deployment.agentId);
    agent.deploymentStrategy = 'direct';
    delete agent.canaryVersion;
    delete agent.canaryTraffic;
    
    this.deployments.delete(deploymentId);
    return true;
  }

  // Get agent implementation (respects deployment strategy)
  get(agentId, context = {}) {
    const agent = this.agents.get(agentId);
    if (!agent) return null;
    
    let version = agent.activeVersion;
    
    // Canary routing
    if (agent.deploymentStrategy === 'canary' && agent.canaryVersion) {
      const random = Math.random() * 100;
      if (random < agent.canaryTraffic) {
        version = agent.canaryVersion;
      }
    }
    
    const versionKey = `${agentId}@${version}`;
    const versionInfo = this.versions.get(versionKey);
    
    return versionInfo ? {
      ...versionInfo,
      deploymentStrategy: agent.deploymentStrategy
    } : null;
  }

  // List all agents
  list() {
    return Array.from(this.agents.entries()).map(([agentId, info]) => ({
      agentId,
      ...info
    }));
  }

  // Get deployment info
  getDeployment(deploymentId) {
    return this.deployments.get(deploymentId);
  }
}

module.exports = AgentRegistry;
