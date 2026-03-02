/**
 * Orchestrator - Integration harness wiring all components together
 *
 * Composes: MessageBus, SimpleRL, EventStore, AgentRegistry, HealthMonitor,
 * Explainer, DynamicReplanner, Saga, and MetaRouter into a single execute() flow.
 */
const MessageBus = require('./message-bus');
const SimpleRL = require('./simple-rl');
const EventStore = require('./event-store');
const AgentRegistry = require('./registry');
const HealthMonitor = require('./health-monitor');
const Explainer = require('./explainer');
const DynamicReplanner = require('./replanner');
const Saga = require('./saga');
const { analyzeTask, selectAgents, generateWorkflow } = require('./meta-agent-router');

class Orchestrator {
  constructor(options = {}) {
    this.bus = new MessageBus();
    this.rl = new SimpleRL();
    this.eventStore = new EventStore();
    this.registry = new AgentRegistry();
    this.health = new HealthMonitor({
      checkInterval: options.healthCheckInterval || 10000,
      unhealthyThreshold: options.unhealthyThreshold || 3
    });
    this.explainer = new Explainer();
    this.replanner = new DynamicReplanner({
      replanThreshold: options.replanThreshold || 0.3,
      maxReplans: options.maxReplans || 3
    });

    this.rewardFn = options.rewardFn || defaultReward;
    this.agents = new Map();
    this._taskCounter = 0;
  }

  registerAgent(name, version, agent, metadata = {}) {
    this.agents.set(name, agent);

    this.registry.register(name, version, agent, metadata);
    this.registry.setActive(name, version);

    const healthCheck = agent.healthCheck || (async () => true);
    this.health.register(name, healthCheck);

    this.bus.subscribe(name, `task.${name}`, async (msg) => {
      try {
        const result = await agent.execute(msg.task);
        this.bus.publish(msg.responseId, { agent: name, result, success: true }, name);
      } catch (error) {
        this.bus.publish(msg.responseId, { agent: name, error: error.message, success: false }, name);
      }
    });

    this.eventStore.append(name, 'agent.registered', { name, version, metadata });
  }

  async execute(taskDescription, context) {
    const taskId = `task-${++this._taskCounter}`;
    const startTime = Date.now();

    // 1. Analyze task via meta-router
    const analysis = analyzeTask(taskDescription);
    const contextKey = context || `${analysis.taskType}-${analysis.domain}`;

    // 2. Get available agents, filter unhealthy
    const agentNames = Array.from(this.agents.keys());
    if (agentNames.length === 0) throw new Error('No agents registered');

    await this.health.checkAll();
    const healthyAgents = agentNames.filter(name => {
      const status = this.health.getStatus(name);
      return status && status.status !== 'unhealthy';
    });
    const candidates = healthyAgents.length > 0 ? healthyAgents : agentNames;

    // 3. RL selects best agent
    const selectedAgent = this.rl.selectAgent(contextKey, candidates);

    // 4. Record decision with explainer
    const alternatives = candidates.map(name => ({
      agent: name,
      score: this.rl.getQ(contextKey, name)
    }));

    const decisionId = this.explainer.recordDecision(
      { type: contextKey, taskType: analysis.taskType, domain: analysis.domain },
      selectedAgent,
      alternatives,
      {
        summary: `RL selected ${selectedAgent} for ${contextKey} (${analysis.urgency} urgency)`,
        factors: [
          { name: 'qValue', value: this.rl.getQ(contextKey, selectedAgent), weight: 0.7 },
          { name: 'taskType', value: analysis.taskType, weight: 0.15 },
          { name: 'urgency', value: analysis.urgency, weight: 0.15 }
        ]
      }
    );

    // 5. Event: task started
    this.eventStore.append(taskId, 'task.started', {
      task: taskDescription, agent: selectedAgent, analysis, decisionId
    });

    // 6. Execute agent
    let result, success;
    try {
      const agent = this.agents.get(selectedAgent);
      result = await agent.execute(taskDescription);
      success = true;
      this.eventStore.append(taskId, 'task.completed', {
        agent: selectedAgent,
        resultLength: typeof result === 'string' ? result.length : JSON.stringify(result).length
      });
    } catch (error) {
      result = error.message;
      success = false;
      this.eventStore.append(taskId, 'task.failed', {
        agent: selectedAgent, error: error.message
      });
    }

    // 7. Update RL with reward
    const reward = success ? this.rewardFn(result) : 0;
    this.rl.update(contextKey, selectedAgent, reward);

    return {
      taskId,
      result,
      success,
      agent: selectedAgent,
      analysis,
      explanation: this.explainer.explain(decisionId),
      reward,
      duration: Date.now() - startTime
    };
  }

  async executeWorkflow(taskDescription) {
    const workflowId = `workflow-${++this._taskCounter}`;
    const startTime = Date.now();

    // 1. Analyze and generate workflow from meta-router
    const analysis = analyzeTask(taskDescription);
    const selection = selectAgents(analysis);
    const workflow = generateWorkflow(selection.agents, selection.pattern, selection.mode);

    const planSteps = workflow.steps.map(step => ({
      action: step.action,
      agent: step.agent,
      validation: step.validation,
      stepId: step.step
    }));

    this.replanner.createPlan(workflowId, planSteps, taskDescription);

    this.eventStore.append(workflowId, 'workflow.started', {
      task: taskDescription, analysis, steps: planSteps.length, mode: selection.mode
    });

    // 2. Build saga — each step executes via the RL pipeline
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

          this.eventStore.append(workflowId, 'workflow.step.completed', {
            step: step.stepId, action: step.action,
            agent: stepResult.agent, success: stepResult.success
          });

          if (!stepResult.success) {
            throw new Error(`Step ${step.stepId} failed: ${stepResult.result}`);
          }

          return { [`step_${step.stepId}`]: stepResult.result };
        },
        async () => {
          this.eventStore.append(workflowId, 'workflow.step.rolled_back', {
            step: step.stepId, action: step.action
          });
        }
      );
    }

    // 3. Execute saga
    const sagaResult = await saga.execute();

    const eventType = sagaResult.success ? 'workflow.completed' : 'workflow.failed';
    this.eventStore.append(workflowId, eventType, {
      success: sagaResult.success,
      steps: stepResults.length,
      rolledBack: sagaResult.rolledBack || false
    });

    return {
      workflowId,
      success: sagaResult.success,
      steps: stepResults,
      analysis,
      mode: selection.mode,
      pattern: selection.pattern,
      replans: this.replanner.getStatus(workflowId)?.replans || 0,
      events: this.eventStore.getEvents(workflowId),
      duration: Date.now() - startTime
    };
  }

  getStatus() {
    return {
      agents: this.health.getStatus(),
      decisions: this.explainer.analyze(),
      events: this.eventStore.getAllEvents().length,
      registry: this.registry.list()
    };
  }

  shutdown() {
    this.health.stop();
  }
}

function defaultReward(result) {
  if (!result) return 10;
  const len = typeof result === 'string' ? result.length : JSON.stringify(result).length;
  if (len < 10) return 20;
  if (len < 50) return 50;
  if (len < 200) return 80;
  if (len < 1000) return 100;
  return 70;
}

module.exports = Orchestrator;
