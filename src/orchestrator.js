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
const AgentComposer = require('./composer');
const { analyzeTask, selectAgents, generateWorkflow } = require('./meta-agent-router');

class Orchestrator {
  constructor(options = {}) {
    this.bus = new MessageBus();
    this.rl = new SimpleRL({
      persistPath: options.persistPath || null,
      epsilon: options.epsilon
    });
    this.eventStore = new EventStore({
      persistPath: options.eventStorePath || null,
      maxPersistedEvents: options.maxPersistedEvents || 5000
    });
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
    this._agentMeta = new Map();
    this._taskCounter = 0;
    this._taskResults = new Map();
    this._maxCachedTasks = options.maxCachedTasks || 200;

    // Optional pluggable components
    this.hitl = options.hitl || null;
    this.tenancy = options.tenancy || null;
    this.context = options.context || null;
    this.composer = new AgentComposer();
  }

  registerAgent(name, version, agent, metadata = {}) {
    this.agents.set(name, agent);
    this._agentMeta.set(name, metadata);

    this.registry.register(name, version, agent, metadata);
    this.registry.setActive(name, version);

    const healthCheck = agent.healthCheck ? agent.healthCheck.bind(agent) : (async () => true);
    this.health.register(name, healthCheck);
    this.composer.addAgent(name, agent);

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

  async execute(taskDescription, context, options = {}) {
    const taskId = `task-${++this._taskCounter}`;
    const startTime = Date.now();
    const tenantId = options.tenantId || null;

    // 1. Analyze task via meta-router
    const analysis = analyzeTask(taskDescription);
    const contextKey = context || `${analysis.taskType}-${analysis.domain}`;

    // 2. HITL gate — check before doing anything expensive
    if (this.hitl) {
      const { approved, reason } = await this.hitl.check(taskId, taskDescription);
      if (!approved) {
        this.eventStore.append(taskId, 'task.rejected', { reason, task: taskDescription });
        return { taskId, success: false, result: `Task rejected: ${reason}`, approved: false };
      }
    }

    // 3. Tenancy quota check
    let releaseQuota = null;
    if (this.tenancy && tenantId) {
      this.tenancy.checkQuota(tenantId); // throws if over limit
      releaseQuota = this.tenancy.recordUsage(tenantId);
    }

    // 4. Get context snapshot (influences routing metadata)
    const contextSnapshot = this.context ? await this.context.getContext() : null;

    // 2. Get available agents, filter unhealthy
    const agentNames = Array.from(this.agents.keys());
    if (agentNames.length === 0) throw new Error('No agents registered');

    await this.health.checkAll();
    const healthyAgents = agentNames.filter(name => {
      const status = this.health.getStatus(name);
      return status && status.status !== 'unhealthy';
    });
    const candidates = healthyAgents.length > 0 ? healthyAgents : agentNames;

    // 3. Select agent (strength-aware RL)
    const selectedAgent = this._selectAgent(contextKey, candidates, analysis, taskDescription);

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
      task: taskDescription, agent: selectedAgent, analysis, decisionId, tenantId, contextSnapshot
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
    } finally {
      if (releaseQuota) releaseQuota();
    }

    // 7. Update RL with reward (pass metadata for multi-objective scoring)
    const duration = Date.now() - startTime;
    const tokens = this.agents.get(selectedAgent).lastUsage || null;
    const metadata = { duration, agent: selectedAgent, analysis, tokens, task: taskDescription, contextSnapshot };
    const reward = success ? this.rewardFn(result, metadata) : 0;
    this.rl.update(contextKey, selectedAgent, reward);

    const taskResult = {
      taskId,
      result,
      success,
      agent: selectedAgent,
      contextKey,
      analysis,
      explanation: this.explainer.explain(decisionId),
      reward,
      duration,
      tokens,
      tenantId,
      timestamp: new Date().toISOString()
    };

    // Cache for feedback lookups (evict oldest if over limit)
    this._taskResults.set(taskId, taskResult);
    if (this._taskResults.size > this._maxCachedTasks) {
      const oldest = this._taskResults.keys().next().value;
      this._taskResults.delete(oldest);
    }

    return taskResult;
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

  _selectAgent(contextKey, candidates, analysis, taskDescription) {
    // If RL has learned data for this context, defer to RL
    const hasData = candidates.some(c => this.rl.getQ(contextKey, c) > 0);
    if (hasData) {
      return this.rl.selectAgent(contextKey, candidates);
    }

    // No RL data yet — use strength affinity to pick the best initial agent
    // (still respect epsilon for exploration)
    if (Math.random() < this.rl.epsilon) {
      return candidates[Math.floor(Math.random() * candidates.length)];
    }

    let best = candidates[0];
    let bestScore = 0;
    // Match against both analysis categories AND the actual task description
    const taskWords = `${analysis.taskType} ${analysis.domain} ${analysis.urgency} ${taskDescription || ''}`.toLowerCase();

    for (const name of candidates) {
      const meta = this._agentMeta.get(name) || {};
      const strengths = meta.strengths || [];
      let score = 0;
      for (const s of strengths) {
        const words = s.toLowerCase().split(/\s+/);
        for (const w of words) {
          if (w.length >= 3 && taskWords.includes(w)) score++;
        }
      }
      if (score > bestScore) {
        bestScore = score;
        best = name;
      }
    }
    return best;
  }

  getTask(taskId) {
    return this._taskResults.get(taskId) || null;
  }

  submitFeedback(taskId, rating, comment) {
    const task = this._taskResults.get(taskId);
    if (!task) return null;

    // Convert 1-5 rating to RL reward adjustment
    // 1=terrible(-50), 2=bad(-20), 3=neutral(0), 4=good(+20), 5=excellent(+50)
    const rewardMap = { 1: -50, 2: -20, 3: 0, 4: 20, 5: 50 };
    const adjustment = rewardMap[rating] || 0;

    this.rl.update(task.contextKey, task.agent, task.reward + adjustment);

    const feedback = {
      taskId,
      agent: task.agent,
      contextKey: task.contextKey,
      rating,
      comment: comment || null,
      originalReward: task.reward,
      adjustedReward: task.reward + adjustment,
      timestamp: new Date().toISOString()
    };

    this.eventStore.append(taskId, 'task.feedback', feedback);
    task.feedback = feedback;

    return feedback;
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
    this.eventStore.flush();
    if (this.hitl) this.hitl.shutdown();
    if (this.context) this.context.shutdown();
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
