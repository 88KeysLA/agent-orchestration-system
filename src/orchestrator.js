/**
 * Orchestrator - Integrates all components into unified system
 * Coordinates message bus, RL, registry, health, events, sagas, explainer, replanner, optimizer
 */
class Orchestrator {
  constructor(options = {}) {
    this.messageBus = options.messageBus;
    this.rl = options.rl;
    this.registry = options.registry;
    this.healthMonitor = options.healthMonitor;
    this.eventStore = options.eventStore;
    this.explainer = options.explainer;
    this.replanner = options.replanner;
    this.optimizer = options.optimizer;
    this.running = false;
  }

  // Start orchestration
  async start() {
    if (this.running) return;
    this.running = true;
    
    if (this.healthMonitor) {
      this.healthMonitor.start();
    }
    
    if (this.eventStore) {
      this.eventStore.append('system', 'ORCHESTRATOR_STARTED', { timestamp: Date.now() });
    }
  }

  // Stop orchestration
  stop() {
    this.running = false;
    
    if (this.healthMonitor) {
      this.healthMonitor.stop();
    }
    
    if (this.eventStore) {
      this.eventStore.append('system', 'ORCHESTRATOR_STOPPED', { timestamp: Date.now() });
    }
  }

  // Execute task with full orchestration
  async executeTask(task) {
    const taskId = `task-${Date.now()}`;
    
    // Log to event store
    if (this.eventStore) {
      this.eventStore.append(taskId, 'TASK_STARTED', task);
    }
    
    try {
      // Get available agents from registry
      const agents = this.registry ? this.getHealthyAgents() : ['default-agent'];
      
      // Use optimizer to evaluate options if available
      let selectedAgent;
      if (this.optimizer && agents.length > 1) {
        const options = agents.map(a => ({
          name: a,
          estimatedTime: Math.random() * 5,
          accuracy: 0.7 + Math.random() * 0.3,
          cost: 0.5 + Math.random() * 1.5
        }));
        const best = this.optimizer.select(options, task);
        selectedAgent = best.option.name;
      } else if (this.rl) {
        // Use RL to select agent
        selectedAgent = this.rl.selectAgent(task, agents);
      } else {
        selectedAgent = agents[0];
      }
      
      // Record decision with explainer
      if (this.explainer) {
        this.explainer.recordDecision(
          task,
          selectedAgent,
          agents.map(a => ({ agent: a, score: Math.random() })),
          { summary: `Selected ${selectedAgent} for task`, factors: [] }
        );
      }
      
      // Get agent implementation
      const agent = this.registry ? this.registry.get(selectedAgent) : null;
      
      // Execute via message bus if available
      let result;
      if (this.messageBus && agent) {
        result = await this.messageBus.request('task.execute', { task, agent: selectedAgent }, 'orchestrator', 5000);
      } else {
        result = { success: true, agent: selectedAgent };
      }
      
      // Update RL with reward
      if (this.rl && result.success) {
        this.rl.update(task, selectedAgent, 1);
      }
      
      // Log success
      if (this.eventStore) {
        this.eventStore.append(taskId, 'TASK_COMPLETED', { agent: selectedAgent, result });
      }
      
      return { success: true, agent: selectedAgent, result };
      
    } catch (error) {
      // Log failure
      if (this.eventStore) {
        this.eventStore.append(taskId, 'TASK_FAILED', { error: error.message });
      }
      
      // Update RL with negative reward
      if (this.rl) {
        this.rl.update(task, 'unknown', -1);
      }
      
      return { success: false, error: error.message };
    }
  }

  // Get healthy agents from registry
  getHealthyAgents() {
    if (!this.registry) return [];
    
    const agents = this.registry.list();
    
    if (!this.healthMonitor) {
      return agents.map(a => a.agentId);
    }
    
    return agents
      .filter(a => {
        const health = this.healthMonitor.getStatus(a.agentId);
        return health && health.status === 'healthy';
      })
      .map(a => a.agentId);
  }

  // Get system status
  getStatus() {
    return {
      running: this.running,
      components: {
        messageBus: !!this.messageBus,
        rl: !!this.rl,
        registry: !!this.registry,
        healthMonitor: !!this.healthMonitor,
        eventStore: !!this.eventStore,
        explainer: !!this.explainer,
        replanner: !!this.replanner,
        optimizer: !!this.optimizer
      },
      agents: this.registry ? this.registry.list().length : 0,
      healthyAgents: this.getHealthyAgents().length
    };
  }
}

module.exports = Orchestrator;
