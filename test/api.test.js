/**
 * REST API Tests
 * Starts Express on port 0 (auto-assign), tests with native fetch
 */
const Orchestrator = require('../src/orchestrator');
const createAPI = require('../src/api');

let passed = 0;
let failed = 0;
let server, baseUrl;

function test(name, fn) {
  return fn().then(() => {
    console.log(`\u2705 ${name}`);
    passed++;
  }).catch(err => {
    console.log(`\u274c ${name}: ${err.message}`);
    failed++;
  });
}

function mockAgent(name) {
  return {
    execute: async (task) => `[${name}] Done: ${task.substring(0, 50)}`,
    healthCheck: async () => true
  };
}

function setup() {
  const orc = new Orchestrator();
  orc.registerAgent('alpha', '1.0.0', mockAgent('alpha'));
  orc.registerAgent('beta', '1.0.0', mockAgent('beta'));

  const app = createAPI(orc);
  return new Promise((resolve) => {
    server = app.listen(0, () => {
      const port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve(orc);
    });
  });
}

function teardown(orc) {
  orc.shutdown();
  return new Promise((resolve) => server.close(resolve));
}

// Tests
async function testPostTask() {
  const orc = await setup();
  const res = await fetch(`${baseUrl}/api/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ task: 'Build something' })
  });
  const data = await res.json();
  await teardown(orc);

  if (res.status !== 200) throw new Error(`Status ${res.status}`);
  if (!data.taskId) throw new Error('Missing taskId');
  if (!data.result) throw new Error('Missing result');
  if (!data.agent) throw new Error('Missing agent');
  if (typeof data.success !== 'boolean') throw new Error('Missing success');
}

async function testPostTaskMissingBody() {
  const orc = await setup();
  const res = await fetch(`${baseUrl}/api/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  });
  const data = await res.json();
  await teardown(orc);

  if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
  if (!data.error) throw new Error('Missing error message');
}

async function testPostWorkflow() {
  const orc = await setup();
  const res = await fetch(`${baseUrl}/api/workflows`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ task: 'Build a new feature' })
  });
  const data = await res.json();
  await teardown(orc);

  if (res.status !== 200) throw new Error(`Status ${res.status}`);
  if (!data.workflowId) throw new Error('Missing workflowId');
  if (typeof data.success !== 'boolean') throw new Error('Missing success');
}

async function testGetStatus() {
  const orc = await setup();
  const res = await fetch(`${baseUrl}/api/status`);
  const data = await res.json();
  await teardown(orc);

  if (res.status !== 200) throw new Error(`Status ${res.status}`);
  if (data.events === undefined) throw new Error('Missing events');
  if (!data.decisions) throw new Error('Missing decisions');
  if (!data.registry) throw new Error('Missing registry');
}

async function testGetAgents() {
  const orc = await setup();
  const res = await fetch(`${baseUrl}/api/agents`);
  const data = await res.json();
  await teardown(orc);

  if (res.status !== 200) throw new Error(`Status ${res.status}`);
  if (!data.agents || data.agents.length !== 2) throw new Error(`Expected 2 agents, got ${data.agents?.length}`);
  if (!data.agents[0].name) throw new Error('Missing agent name');
  if (!data.agents[0].status) throw new Error('Missing agent status');
}

async function testGetEvents() {
  const orc = await setup();
  // Generate some events first
  await fetch(`${baseUrl}/api/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ task: 'Do something' })
  });
  const res = await fetch(`${baseUrl}/api/events?limit=5`);
  const data = await res.json();
  await teardown(orc);

  if (res.status !== 200) throw new Error(`Status ${res.status}`);
  if (!Array.isArray(data.events)) throw new Error('events not an array');
  if (typeof data.total !== 'number') throw new Error('Missing total');
  if (data.events.length > 5) throw new Error('Limit not respected');
}

async function testGetDecisions() {
  const orc = await setup();
  await fetch(`${baseUrl}/api/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ task: 'Analyze this' })
  });
  const res = await fetch(`${baseUrl}/api/decisions`);
  const data = await res.json();
  await teardown(orc);

  if (res.status !== 200) throw new Error(`Status ${res.status}`);
  if (!Array.isArray(data.decisions)) throw new Error('decisions not an array');
  if (!data.analysis) throw new Error('Missing analysis');
  if (data.decisions.length < 1) throw new Error('Should have at least 1 decision');
}

async function testPostTaskWithContext() {
  const orc = await setup();
  const res = await fetch(`${baseUrl}/api/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ task: 'Fix a bug', context: 'bugfix-context' })
  });
  const data = await res.json();
  await teardown(orc);

  if (res.status !== 200) throw new Error(`Status ${res.status}`);
  if (!data.success) throw new Error('Should succeed');
}

async function testWorkflowMissingBody() {
  const orc = await setup();
  const res = await fetch(`${baseUrl}/api/workflows`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  });
  const data = await res.json();
  await teardown(orc);

  if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
}

async function testEventsDefaultLimit() {
  const orc = await setup();
  // Generate events
  for (let i = 0; i < 3; i++) {
    await fetch(`${baseUrl}/api/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task: `Task ${i}` })
    });
  }
  const res = await fetch(`${baseUrl}/api/events`);
  const data = await res.json();
  await teardown(orc);

  if (res.status !== 200) throw new Error(`Status ${res.status}`);
  if (data.events.length > 50) throw new Error('Default limit exceeded');
}

async function testGetRLStats() {
  const orc = await setup();
  // Generate some RL data
  await fetch(`${baseUrl}/api/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ task: 'Do something' })
  });
  const res = await fetch(`${baseUrl}/api/rl-stats`);
  const data = await res.json();
  await teardown(orc);

  if (res.status !== 200) throw new Error(`Status ${res.status}`);
  if (typeof data.entries !== 'number') throw new Error('Missing entries count');
  if (typeof data.totalUpdates !== 'number') throw new Error('Missing totalUpdates');
  if (!data.byContext) throw new Error('Missing byContext');
  if (!Array.isArray(data.raw)) throw new Error('Missing raw array');
}

(async () => {
  console.log('Testing REST API...\n');

  await test('POST /api/tasks returns result', testPostTask);
  await test('POST /api/tasks 400 without body', testPostTaskMissingBody);
  await test('POST /api/tasks with context', testPostTaskWithContext);
  await test('POST /api/workflows returns result', testPostWorkflow);
  await test('POST /api/workflows 400 without body', testWorkflowMissingBody);
  await test('GET /api/status returns status', testGetStatus);
  await test('GET /api/agents lists agents', testGetAgents);
  await test('GET /api/events with limit', testGetEvents);
  await test('GET /api/events default limit', testEventsDefaultLimit);
  await test('GET /api/decisions returns history', testGetDecisions);
  await test('GET /api/rl-stats returns learning state', testGetRLStats);

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed === 0) {
    console.log('\u2705 All API tests passed!\n');
    process.exit(0);
  } else {
    console.log('\u274c Some tests failed\n');
    process.exit(1);
  }
})();
