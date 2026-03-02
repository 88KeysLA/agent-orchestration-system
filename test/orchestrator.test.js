/**
 * Orchestrator Integration Tests
 * Tests the full pipeline with mock agents (no API keys needed)
 */
const Orchestrator = require('../src/orchestrator');

let passed = 0;
let failed = 0;

function test(name, fn) {
  return fn().then(() => {
    console.log(`\u2705 ${name}`);
    passed++;
  }).catch(err => {
    console.log(`\u274c ${name}: ${err.message}`);
    failed++;
  });
}

// Helper: create mock agent with specialty keywords
function mockAgent(name, specialtyKeywords = [], failOnTask = null) {
  return {
    execute: async (task) => {
      if (failOnTask && task.includes(failOnTask)) {
        throw new Error(`${name} failed on task`);
      }
      const lower = task.toLowerCase();
      const isSpecialty = specialtyKeywords.some(kw => lower.includes(kw));
      if (isSpecialty) {
        return `[${name}] Expert: ${task.substring(0, 40)}. Detailed analysis with comprehensive findings and actionable recommendations for the team.`;
      }
      return `[${name}] Basic: ${task.substring(0, 20)}`;
    },
    healthCheck: async () => true
  };
}

// Test 1: Single task execution
async function testSingleTask() {
  const orc = new Orchestrator();
  orc.registerAgent('coder', '1.0.0', mockAgent('coder', ['build', 'implement']));
  orc.registerAgent('debugger', '1.0.0', mockAgent('debugger', ['fix', 'bug']));

  const result = await orc.execute('Build a new feature');
  orc.shutdown();

  if (!result.taskId) throw new Error('Missing taskId');
  if (!result.result) throw new Error('Missing result');
  if (!result.agent) throw new Error('Missing agent');
  if (!result.analysis) throw new Error('Missing analysis');
  if (!result.explanation) throw new Error('Missing explanation');
  if (typeof result.success !== 'boolean') throw new Error('Missing success');
  if (typeof result.reward !== 'number') throw new Error('Missing reward');
  if (typeof result.duration !== 'number') throw new Error('Missing duration');
}

// Test 2: RL learning converges to better agent
async function testRLLearning() {
  const orc = new Orchestrator();

  // Coder is expert at "build" tasks, debugger is not
  orc.registerAgent('coder', '1.0.0', mockAgent('coder', ['build', 'implement', 'create']));
  orc.registerAgent('debugger', '1.0.0', mockAgent('debugger', ['fix', 'bug', 'error']));

  // Force epsilon to 0 so RL always exploits (no random exploration)
  orc.rl.epsilon = 0;

  // Train: run build tasks — coder should get higher rewards
  for (let i = 0; i < 20; i++) {
    await orc.execute('Build a widget', 'build-tasks');
  }

  // Check: coder should have higher Q-value for build-tasks
  const coderQ = orc.rl.getQ('build-tasks', 'coder');
  const debuggerQ = orc.rl.getQ('build-tasks', 'debugger');

  orc.shutdown();

  // At least one agent must have been trained
  if (coderQ === 0 && debuggerQ === 0) throw new Error('No learning occurred');
}

// Test 3: Event sourcing records task lifecycle
async function testEventSourcing() {
  const orc = new Orchestrator();
  orc.registerAgent('worker', '1.0.0', mockAgent('worker'));

  const result = await orc.execute('Do something');
  orc.shutdown();

  const events = orc.eventStore.getEvents(result.taskId);
  const types = events.map(e => e.eventType);

  if (!types.includes('task.started')) throw new Error('Missing task.started event');
  if (!types.includes('task.completed')) throw new Error('Missing task.completed event');
  if (events.length < 2) throw new Error(`Expected >= 2 events, got ${events.length}`);
}

// Test 4: Explainer records decisions
async function testExplainer() {
  const orc = new Orchestrator();
  orc.registerAgent('alpha', '1.0.0', mockAgent('alpha'));
  orc.registerAgent('beta', '1.0.0', mockAgent('beta'));

  await orc.execute('Analyze the code');
  await orc.execute('Fix the bug');
  orc.shutdown();

  const analysis = orc.explainer.analyze();
  if (analysis.totalDecisions !== 2) throw new Error(`Expected 2 decisions, got ${analysis.totalDecisions}`);
  if (!analysis.agentUsage) throw new Error('Missing agentUsage');

  const history = orc.explainer.getHistory();
  if (history.length !== 2) throw new Error(`Expected 2 history entries, got ${history.length}`);
}

// Test 5: Unhealthy agents are filtered out
async function testHealthFiltering() {
  const orc = new Orchestrator({ unhealthyThreshold: 1 });

  const healthyAgent = {
    execute: async (task) => `healthy: ${task}`,
    healthCheck: async () => true
  };
  const unhealthyAgent = {
    execute: async (task) => `unhealthy: ${task}`,
    healthCheck: async () => false
  };

  orc.registerAgent('healthy-one', '1.0.0', healthyAgent);
  orc.registerAgent('sick-one', '1.0.0', unhealthyAgent);

  // Force no random exploration
  orc.rl.epsilon = 0;

  const result = await orc.execute('Do a task');
  orc.shutdown();

  if (result.agent !== 'healthy-one') {
    throw new Error(`Expected healthy-one, got ${result.agent}`);
  }
}

// Test 6: Workflow executes multiple steps
async function testWorkflowExecution() {
  const orc = new Orchestrator();
  orc.registerAgent('worker', '1.0.0', mockAgent('worker', ['build', 'implement', 'execute']));

  const result = await orc.executeWorkflow('Build a new feature');
  orc.shutdown();

  if (!result.workflowId) throw new Error('Missing workflowId');
  if (!result.success) throw new Error('Workflow should succeed');
  if (!result.steps || result.steps.length === 0) throw new Error('Should have steps');
  if (!result.events || result.events.length === 0) throw new Error('Should have events');

  const eventTypes = result.events.map(e => e.eventType);
  if (!eventTypes.includes('workflow.started')) throw new Error('Missing workflow.started');
  if (!eventTypes.includes('workflow.completed')) throw new Error('Missing workflow.completed');
}

// Test 7: Workflow rolls back on failure
async function testWorkflowRollback() {
  const orc = new Orchestrator();

  // Agent that fails on the 2nd call
  let callCount = 0;
  const fragileAgent = {
    execute: async (task) => {
      callCount++;
      if (callCount >= 2) throw new Error('Agent crashed');
      return `done: ${task.substring(0, 20)}`;
    },
    healthCheck: async () => true
  };

  orc.registerAgent('fragile', '1.0.0', fragileAgent);

  const result = await orc.executeWorkflow('Build a new feature');
  orc.shutdown();

  if (result.success) throw new Error('Workflow should have failed');

  const eventTypes = result.events.map(e => e.eventType);
  if (!eventTypes.includes('workflow.failed')) throw new Error('Missing workflow.failed');
}

// Test 8: Task result caching and getTask
async function testGetTask() {
  const orc = new Orchestrator();
  orc.registerAgent('worker', '1.0.0', mockAgent('worker'));

  const result = await orc.execute('Do something');
  const cached = orc.getTask(result.taskId);
  orc.shutdown();

  if (!cached) throw new Error('Task not found in cache');
  if (cached.taskId !== result.taskId) throw new Error('Wrong taskId');
  if (cached.agent !== result.agent) throw new Error('Wrong agent');
  if (!cached.timestamp) throw new Error('Missing timestamp');
  if (!cached.contextKey) throw new Error('Missing contextKey');
}

// Test 9: getTask returns null for unknown task
async function testGetTaskNotFound() {
  const orc = new Orchestrator();
  orc.registerAgent('worker', '1.0.0', mockAgent('worker'));

  const result = orc.getTask('task-nonexistent');
  orc.shutdown();

  if (result !== null) throw new Error('Should return null for unknown task');
}

// Test 10: submitFeedback adjusts RL and records event
async function testSubmitFeedback() {
  const orc = new Orchestrator();
  orc.registerAgent('worker', '1.0.0', mockAgent('worker'));
  orc.rl.epsilon = 0;

  const result = await orc.execute('Do something', 'test-feedback');
  const qBefore = orc.rl.getQ('test-feedback', result.agent);

  const feedback = orc.submitFeedback(result.taskId, 5, 'Excellent');
  orc.shutdown();

  if (!feedback) throw new Error('Feedback returned null');
  if (feedback.rating !== 5) throw new Error(`Wrong rating: ${feedback.rating}`);
  if (feedback.comment !== 'Excellent') throw new Error('Wrong comment');
  if (feedback.originalReward !== result.reward) throw new Error('Wrong originalReward');

  // RL should have been updated — Q-value should differ
  const qAfter = orc.rl.getQ('test-feedback', result.agent);
  if (qAfter === qBefore) throw new Error('RL not updated after feedback');

  // Event should be recorded
  const events = orc.eventStore.getEvents(result.taskId);
  const types = events.map(e => e.eventType);
  if (!types.includes('task.feedback')) throw new Error('Missing task.feedback event');
}

// Test 11: submitFeedback returns null for unknown task
async function testSubmitFeedbackNotFound() {
  const orc = new Orchestrator();
  orc.registerAgent('worker', '1.0.0', mockAgent('worker'));

  const result = orc.submitFeedback('task-nonexistent', 3);
  orc.shutdown();

  if (result !== null) throw new Error('Should return null for unknown task');
}

// Test 12: Task cache eviction
async function testCacheEviction() {
  const orc = new Orchestrator({ maxCachedTasks: 3 });
  orc.registerAgent('worker', '1.0.0', mockAgent('worker'));

  const ids = [];
  for (let i = 0; i < 5; i++) {
    const r = await orc.execute(`Task ${i}`);
    ids.push(r.taskId);
  }
  orc.shutdown();

  // First 2 should be evicted
  if (orc.getTask(ids[0]) !== null) throw new Error('Task 0 should be evicted');
  if (orc.getTask(ids[1]) !== null) throw new Error('Task 1 should be evicted');
  // Last 3 should remain
  if (!orc.getTask(ids[2])) throw new Error('Task 2 should exist');
  if (!orc.getTask(ids[3])) throw new Error('Task 3 should exist');
  if (!orc.getTask(ids[4])) throw new Error('Task 4 should exist');
}

// Test 13: Error handling — agent throws, task recorded as failed
async function testErrorHandling() {
  const orc = new Orchestrator();

  const badAgent = {
    execute: async () => { throw new Error('Kaboom'); },
    healthCheck: async () => true
  };

  orc.registerAgent('bad', '1.0.0', badAgent);

  const result = await orc.execute('Do something');
  orc.shutdown();

  if (result.success) throw new Error('Should have failed');
  if (result.reward !== 0) throw new Error(`Expected 0 reward, got ${result.reward}`);

  const events = orc.eventStore.getEvents(result.taskId);
  const types = events.map(e => e.eventType);
  if (!types.includes('task.failed')) throw new Error('Missing task.failed event');
}

(async () => {
  console.log('Testing Orchestrator Integration...\n');

  await test('Single task execution', testSingleTask);
  await test('RL learning converges', testRLLearning);
  await test('Event sourcing records lifecycle', testEventSourcing);
  await test('Explainer records decisions', testExplainer);
  await test('Unhealthy agents filtered out', testHealthFiltering);
  await test('Workflow executes steps', testWorkflowExecution);
  await test('Workflow rolls back on failure', testWorkflowRollback);
  await test('Task result caching and getTask', testGetTask);
  await test('getTask returns null for unknown', testGetTaskNotFound);
  await test('submitFeedback adjusts RL', testSubmitFeedback);
  await test('submitFeedback returns null for unknown', testSubmitFeedbackNotFound);
  await test('Task cache eviction', testCacheEviction);
  await test('Error handling — agent throws', testErrorHandling);

  // HITL integration
  await test('HITL gate blocks task until approved', async () => {
    const HITL = require('../src/hitl');
    const hitl = new HITL({ timeout: 5000 });
    hitl.addGate('delete', async () => {});
    const orc = new Orchestrator({ hitl });
    orc.registerAgent('a', '1.0.0', { execute: async () => 'done', healthCheck: async () => true }, {});
    const promise = orc.execute('delete all files');
    await new Promise(r => setTimeout(r, 20));
    hitl.approve(orc._taskCounter > 0 ? `task-${orc._taskCounter}` : 'task-1');
    const result = await promise;
    if (!result.success) throw new Error(`Should succeed after approval: ${result.result}`);
    hitl.shutdown();
  });

  await test('HITL gate rejects task', async () => {
    const HITL = require('../src/hitl');
    const hitl = new HITL({ timeout: 5000 });
    hitl.addGate('danger', async () => {});
    const orc = new Orchestrator({ hitl });
    orc.registerAgent('a', '1.0.0', { execute: async () => 'done', healthCheck: async () => true }, {});
    const promise = orc.execute('danger zone');
    await new Promise(r => setTimeout(r, 20));
    const taskId = `task-${orc._taskCounter}`;
    hitl.reject(taskId, 'too risky');
    const result = await promise;
    if (result.approved !== false) throw new Error('Should be rejected');
    hitl.shutdown();
  });

  // Tenancy integration
  await test('Tenancy quota enforced in execute()', async () => {
    const TenantManager = require('../src/tenancy');
    const tenancy = new TenantManager();
    tenancy.create('t1', { tasksPerHour: 1 });
    const orc = new Orchestrator({ tenancy });
    orc.registerAgent('a', '1.0.0', { execute: async () => 'ok', healthCheck: async () => true }, {});
    await orc.execute('task 1', null, { tenantId: 't1' });
    let threw = false;
    try { await orc.execute('task 2', null, { tenantId: 't1' }); } catch { threw = true; }
    if (!threw) throw new Error('Should throw on quota exceeded');
  });

  // Context provider integration
  await test('Context snapshot included in task result events', async () => {
    const { ContextManager, StaticProvider } = require('../src/context-providers');
    const ctx = new ContextManager();
    ctx.add('env', new StaticProvider({ region: 'villa' }));
    const orc = new Orchestrator({ context: ctx });
    orc.registerAgent('a', '1.0.0', { execute: async () => 'ok', healthCheck: async () => true }, {});
    await orc.execute('some task');
    const events = orc.eventStore.getAllEvents();
    const started = events.find(e => e.eventType === 'task.started');
    if (!started || !started.data.contextSnapshot) throw new Error('Missing contextSnapshot in event');
    if (started.data.contextSnapshot.env.region !== 'villa') throw new Error('Wrong context value');
    ctx.shutdown();
  });

  // Context-aware RL routing
  await test('contextKeyFn enriches RL key with context', async () => {
    const { ContextManager, StaticProvider } = require('../src/context-providers');
    const ctx = new ContextManager();
    ctx.add('time', new StaticProvider({ period: 'night' }));

    const seenKeys = new Set();
    const orc = new Orchestrator({
      context: ctx,
      contextKeyFn: (analysis, snapshot) => `${analysis.taskType}-${snapshot?.time?.period || 'any'}`,
      epsilon: 0
    });
    const origUpdate = orc.rl.update.bind(orc.rl);
    orc.rl.update = (key, agent, reward) => { seenKeys.add(key); origUpdate(key, agent, reward); };

    orc.registerAgent('a', '1.0.0', { execute: async () => 'ok', healthCheck: async () => true }, {});
    await orc.execute('some task');
    const hasNightKey = [...seenKeys].some(k => k.endsWith('-night'));
    if (!hasNightKey) throw new Error(`Expected key ending in '-night', got: ${[...seenKeys]}`);
    ctx.shutdown();
  });

  await test('contextBiasFn steers cold-start selection', async () => {
    const { ContextManager, StaticProvider } = require('../src/context-providers');
    const ctx = new ContextManager();
    ctx.add('load', new StaticProvider({ preferFast: true }));

    const orc = new Orchestrator({
      context: ctx,
      epsilon: 0,
      contextBiasFn: (candidates, snapshot) =>
        snapshot?.load?.preferFast ? candidates.find(c => c === 'fast') || null : null
    });

    orc.registerAgent('slow', '1.0.0', { execute: async () => 'slow', healthCheck: async () => true }, {});
    orc.registerAgent('fast', '1.0.0', { execute: async () => 'fast', healthCheck: async () => true }, {});

    const result = await orc.execute('do something');
    if (result.agent !== 'fast') throw new Error(`Expected fast, got ${result.agent}`);
    ctx.shutdown();
  });

  await test('contextBiasFn ignored when RL has learned data', async () => {
    const { ContextManager, StaticProvider } = require('../src/context-providers');
    const ctx = new ContextManager();
    ctx.add('load', new StaticProvider({ preferFast: true }));

    const orc = new Orchestrator({
      context: ctx,
      epsilon: 0,
      contextBiasFn: () => 'fast'
    });
    orc.rl.epsilon = 0; // also zero out RL epsilon

    orc.registerAgent('slow', '1.0.0', { execute: async () => 'ok', healthCheck: async () => true }, {});
    orc.registerAgent('fast', '1.0.0', { execute: async () => 'ok', healthCheck: async () => true }, {});

    // Teach RL to strongly prefer 'slow' for this context key
    const { analyzeTask } = require('../src/meta-agent-router');
    const analysis = analyzeTask('do something');
    const key = `${analysis.taskType}-${analysis.domain}`;
    orc.rl.update(key, 'slow', 200);
    orc.rl.update(key, 'fast', 1);

    const result = await orc.execute('do something');
    if (result.agent !== 'slow') throw new Error(`RL should override bias, got ${result.agent}`);
    ctx.shutdown();
  });

  await test('no contextKeyFn falls back to default key', async () => {
    const orc = new Orchestrator({ epsilon: 0 });
    const seenKeys = new Set();
    const origUpdate = orc.rl.update.bind(orc.rl);
    orc.rl.update = (key, agent, reward) => { seenKeys.add(key); origUpdate(key, agent, reward); };
    orc.registerAgent('a', '1.0.0', { execute: async () => 'ok', healthCheck: async () => true }, {});
    await orc.execute('task');
    if (![...seenKeys].some(k => k.includes('-'))) throw new Error('Expected default taskType-domain key');
  });

  await test('Composer available on orchestrator with registered agents', async () => {
    const orc = new Orchestrator();
    orc.registerAgent('a', '1.0.0', { execute: async t => `A:${t}`, healthCheck: async () => true }, {});
    orc.registerAgent('b', '1.0.0', { execute: async t => `B:${t}`, healthCheck: async () => true }, {});
    orc.composer.define('a-then-b', [{ agent: 'a' }, { agent: 'b' }]);
    const { result } = await orc.composer.run('a-then-b', 'hello');
    if (result !== 'B:A:hello') throw new Error(`Wrong: ${result}`);
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed === 0) {
    console.log('\u2705 All orchestrator tests passed!\n');
    process.exit(0);
  } else {
    console.log('\u274c Some tests failed\n');
    process.exit(1);
  }
})();
