/**
 * Orchestrator - Unified integration of all components
 * Merges composable design with workflow support
 */
const MessageBus = require('./message-bus');
const SimpleRL = require('./simple-rl');
const EventStore = require('./event-store');
const AgentRegistry = require('./registry');
const HealthMonitor = require('./health-monitor');
const Explainer = require('./explainer');
const DynamicReplanner = require('./replanner');
const Saga = require('./saga');
const MultiObjectiveOptimizer = require('./optimizer');
const { analyzeTask, selectAgents, generateWorkflow } = require('./meta-agent-router');

class Orchestrator {
  constructor(options = {}) {
    // Allow passing components or auto-create
    this.messageBus = options.messageBus || new MessageBus();
    this.rl = options.rl || new SimpleRL();
    this.registry = options.registry || new AgentRegistry();
    this.healthMonitor = options.healthMonitor || new HealthMonitor({
      checkInterval: options.healthCheckInterval || 10000,
      unhealthyThreshold: options.unhealthyThreshold || 3
    });
    this.eventStore = options.eventStore || new EventStore();
    this.explainer = options.explainer || new Explainer();
    this.replanner = options.replanner || new DynamicReplanner({
      replanThreshold: options.replanThreshold || 0.3,
      maxReplans: options.maxReplans || 3
    });
    this.optimizer = options.optimizer || new MultiObjectiveOptimizer();
    
    this.agents = new Map();
    this.running = false;
    this._taskCounter = 0;
  }

  // Register agent with all components
  registerAgent(name, version, agent, metadata = {}) {
    this.agents.set(name, agent);
    
    // Registry
    this.registry.register(name, version, agent, metadata);
    this.registry.setActive(name, version);
    
    // Health monitoring
    const healthCheck = agent.healthCheck || (async () => true);
    this.healthMonitor.register(name, healthCheck);
    
    // Message bus
    this.messageBus.subscribe(name, `task.${name}`, async (msg) => {
      try {
        const result = await agent.execute(msg.task);
        this.messageBus.publish(msg.responseId, { agent: name, result, success: true }, name);
      } catch (error) {
        this.messageBus.publish(msg.responseId, { agent: name, error: error.message, success: false }, name);
      }
    });
    
    // Event store
    if (this.eventStore) {
      this.eventStore.append(name, 'agent.registered', { name, version, metadata });
    }
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

  // Execute single task with full pipeline
  async execute(taskDescription, context) {
    const taskId = `task-${++this._taskCounter}`;
    const startTime = Date.now();
    
    // 1. Analyze task
    const analysis = analyzeTask(taskDescription);
    const contextKey = context || `${analysis.taskType}-${analysis.domain}`;
    
    // 2. Get healthy agents (use cached status, don't block)
    const agentNames = Array.from(this.agents.keys());
    if (agentNames.length === 0) throw new Error('No agents registered');
    
    const healthyAgents = this.getHealthyAgents();
    const candidates = healthyAgents.length > 0 ? healthyAgents : agentNames;
    
    // 3. Select agent using optimizer + RL
    let selectedAgent;
    if (this.optimizer && candidates.length > 1) {
      // Use optimizer to evaluate options
      const options = candidates.map(name => {
        const agent = this.registry.get(name);
        return {
          name,
          estimatedTime: agent?.metadata?.estimatedTime || 2,
          accuracy: agent?.metadata?.accuracy || 0.8,
          cost: agent?.metadata?.cost || 1,
          reliability: agent?.metadata?.reliability || 0.8
        };
      });
      
      const best = this.optimizer.select(options, { type: contextKey });
      selectedAgent = best.option.name;
    } else if (this.rl) {
      // Fallback to RL
      selectedAgent = this.rl.selectAgent(contextKey, candidates);
    } else {
      selectedAgent = candidates[0];
    }
    
    // 4. Record decision
    if (this.explainer) {
      const alternatives = candidates.map(name => ({
        agent: name,
        score: this.rl ? this.rl.getQ(contextKey, name) : 0
      }));
      
      this.explainer.recordDecision(
        { type: contextKey, taskType: analysis.taskType, domain: analysis.domain },
        selectedAgent,
        alternatives,
        {
          summary: `Selected ${selectedAgent} for ${contextKey} (${analysis.urgency} urgency)`,
          factors: [
            { name: 'qValue', value: this.rl ? this.rl.getQ(contextKey, selectedAgent) : 0, weight: 0.7 },
            { name: 'taskType', value: analysis.taskType, weight: 0.15 },
            { name: 'urgency', value: analysis.urgency, weight: 0.15 }
          ]
        }
      );
    }
    
    // 5. Log start
    if (this.eventStore) {
      this.eventStore.append(taskId, 'task.started', {
        task: taskDescription, agent: selectedAgent, analysis
      });
    }
    
    // 6. Execute agent
    let result, success;
    try {
      const agent = this.agents.get(selectedAgent);
      result = await agent.execute(taskDescription);
      success = true;
      
      if (this.eventStore) {
        this.eventStore.append(taskId, 'task.completed', {
          agent: selectedAgent,
          resultLength: typeof result === 'string' ? result.length : JSON.stringify(result).length
        });
      }
    } catch (error) {
      result = error.message;
      success = false;
      
      if (this.eventStore) {
        this.eventStore.append(taskId, 'task.failed', {
          agent: selectedAgent, error: error.message
        });
      }
    }
    
    // 7. Update RL with reward
    if (this.rl && success) {
      const reward = this.calculateReward(result);
      this.rl.update(contextKey, selectedAgent, reward);
    }
    
    return {
      taskId,
      result,
      success,
      agent: selectedAgent,
      analysis,
      explanation: this.explainer ? this.explainer.explain(this.explainer.getHistory(1)[0]?.id) : null,
      reward: success ? this.calculateReward(result) : 0,
      duration: Date.now() - startTime
    };
  }

  // Execute multi-step workflow
  async executeWorkflow(taskDescription) {
    const workflowId = `workflow-${++this._taskCounter}`;
    const startTime = Date.now();
    
    // 1. Generate workflow
    const analysis = analyzeTask(taskDescription);
    const selection = selectAgents(analysis);
    const workflow = generateWorkflow(selection.agents, selection.pattern, selection.mode);
    
    const planSteps = workflow.steps.map(step => ({
      action: step.action,
      agent: step.agent,
      validation: step.validation,
      stepId: step.step
    }));
    
    if (this.replanner) {
      this.replanner.createPlan(workflowId, planSteps, taskDescription);
    }
    
    if (this.eventStore) {
      this.eventStore.append(workflowId, 'workflow.started', {
        task: taskDescription, analysis, steps: planSteps.length, mode: selection.mode
      });
    }
    
    // 2. Build saga for rollback support
    const saga = new Saga(workflowId);
    const stepResults = [];
    const contextKey = `${analysis.taskType}-${analysis.domain}`;
    
    for (const step of planSteps) {
      saga.addStep(
        `${step.stepId}-${step.action}`,
        async (ctx) => {
          const stepResult = await this.execute(
            `${step.action}: ${taskDescription}`,
            contextKey
          );
          
          stepResults.push({
            step: step.stepId,
            action: step.action,
            agent: stepResult.agent,
            success: stepResult.success,
            result: stepResult.result
          });
          
          if (this.eventStore) {
            this.eventStore.append(workflowId, 'workflow.step.completed', {
              step: step.stepId, action: step.action,
              agent: stepResult.agent, success: stepResult.success
            });
          }
          
          if (!stepResult.success) {
            throw new Error(`Step ${step.stepId} failed: ${stepResult.result}`);
          }
          
          return { [`step_${step.stepId}`]: stepResult.result };
        },
        async () => {
          if (this.eventStore) {
            this.eventStore.append(workflowId, 'workflow.step.rolled_back', {
              step: step.stepId, action: step.action
            });
          }
        }
      );
    }
    
    // 3. Execute saga
    const sagaResult = await saga.execute();
    
    if (this.eventStore) {
      const eventType = sagaResult.success ? 'workflow.completed' : 'workflow.failed';
      this.eventStore.append(workflowId, eventType, {
        success: sagaResult.success,
        steps: stepResults.length,
        rolledBack: sagaResult.rolledBack || false
      });
    }
    
    return {
      workflowId,
      success: sagaResult.success,
      steps: stepResults,
      analysis,
      mode: selection.mode,
      pattern: selection.pattern,
      replans: this.replanner ? this.replanner.getStatus(workflowId)?.replans || 0 : 0,
      events: this.eventStore ? this.eventStore.getEvents(workflowId) : [],
      duration: Date.now() - startTime
    };
  }

  // Get healthy agents (cached, non-blocking)
  getHealthyAgents() {
    if (!this.registry) return [];
    
    const agents = this.registry.list();
    
    if (!this.healthMonitor) {
      return agents.map(a => a.agentId);
    }
    
    return agents
      .filter(a => {
        const health = this.healthMonitor.getStatus(a.agentId);
        return health && health.status !== 'unhealthy';
      })
      .map(a => a.agentId);
  }

  // Calculate reward (length-based heuristic)
  calculateReward(result) {
    if (!result) return 10;
    const len = typeof result === 'string' ? result.length : JSON.stringify(result).length;
    if (len < 10) return 20;
    if (len < 50) return 50;
    if (len < 200) return 80;
    if (len < 1000) return 100;
    return 70;
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
      healthyAgents: this.getHealthyAgents().length,
      decisions: this.explainer ? this.explainer.analyze() : {},
      events: this.eventStore ? this.eventStore.getAllEvents().length : 0
    };
  }

  // Alias for compatibility
  shutdown() {
    this.stop();
  }
}

module.exports = Orchestrator;
