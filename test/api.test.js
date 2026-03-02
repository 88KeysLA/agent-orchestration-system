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

async function testGetTaskById() {
  const orc = await setup();
  const createRes = await fetch(`${baseUrl}/api/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ task: 'Build something' })
  });
  const created = await createRes.json();

  const res = await fetch(`${baseUrl}/api/tasks/${created.taskId}`);
  const data = await res.json();
  await teardown(orc);

  if (res.status !== 200) throw new Error(`Status ${res.status}`);
  if (data.taskId !== created.taskId) throw new Error('Wrong taskId');
  if (data.agent !== created.agent) throw new Error('Wrong agent');
  if (!data.timestamp) throw new Error('Missing timestamp');
}

async function testGetTaskNotFound() {
  const orc = await setup();
  const res = await fetch(`${baseUrl}/api/tasks/task-999`);
  const data = await res.json();
  await teardown(orc);

  if (res.status !== 404) throw new Error(`Expected 404, got ${res.status}`);
  if (!data.error) throw new Error('Missing error message');
}

async function testPostFeedback() {
  const orc = await setup();
  const createRes = await fetch(`${baseUrl}/api/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ task: 'Build something' })
  });
  const created = await createRes.json();

  const res = await fetch(`${baseUrl}/api/tasks/${created.taskId}/feedback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rating: 5, comment: 'Great job' })
  });
  const data = await res.json();
  await teardown(orc);

  if (res.status !== 200) throw new Error(`Status ${res.status}`);
  if (data.rating !== 5) throw new Error(`Wrong rating: ${data.rating}`);
  if (data.comment !== 'Great job') throw new Error('Wrong comment');
  if (data.taskId !== created.taskId) throw new Error('Wrong taskId');
  if (typeof data.originalReward !== 'number') throw new Error('Missing originalReward');
  if (typeof data.adjustedReward !== 'number') throw new Error('Missing adjustedReward');
}

async function testPostFeedbackBadRating() {
  const orc = await setup();
  const createRes = await fetch(`${baseUrl}/api/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ task: 'Build something' })
  });
  const created = await createRes.json();

  const res = await fetch(`${baseUrl}/api/tasks/${created.taskId}/feedback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rating: 7 })
  });
  const data = await res.json();
  await teardown(orc);

  if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
  if (!data.error) throw new Error('Missing error message');
}

async function testPostFeedbackNotFound() {
  const orc = await setup();
  const res = await fetch(`${baseUrl}/api/tasks/task-999/feedback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rating: 3 })
  });
  const data = await res.json();
  await teardown(orc);

  if (res.status !== 404) throw new Error(`Expected 404, got ${res.status}`);
}

async function testDashboard() {
  const orc = await setup();
  const res = await fetch(`${baseUrl}/`);
  const html = await res.text();
  await teardown(orc);

  if (res.status !== 200) throw new Error(`Status ${res.status}`);
  if (!html.includes('Villa Romanza Orchestrator')) throw new Error('Missing title');
  if (!html.includes('alpha')) throw new Error('Missing agent name');
  if (!html.includes('Agents')) throw new Error('Missing agents section');
  if (!html.includes('RL Q-Values')) throw new Error('Missing RL section');
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

async function testApiKeyBlocked() {
  process.env.API_KEY = 'test-secret';
  const orc = await setup();
  const res = await fetch(`${baseUrl}/api/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ task: 'Do something' })
  });
  await teardown(orc);
  delete process.env.API_KEY;
  if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
}

async function testApiKeyAllowed() {
  process.env.API_KEY = 'test-secret';
  const orc = await setup();
  const res = await fetch(`${baseUrl}/api/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': 'test-secret' },
    body: JSON.stringify({ task: 'Do something' })
  });
  await teardown(orc);
  delete process.env.API_KEY;
  if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
}

async function testApiKeyGetAllowed() {
  process.env.API_KEY = 'test-secret';
  const orc = await setup();
  const res = await fetch(`${baseUrl}/api/status`);
  await teardown(orc);
  delete process.env.API_KEY;
  if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
}

async function testRateLimit() {
  process.env.RATE_LIMIT = '3';
  process.env.RATE_WINDOW = '5000';
  const orc = await setup();
  // 3 requests should pass
  for (let i = 0; i < 3; i++) {
    const res = await fetch(`${baseUrl}/api/status`);
    if (res.status !== 200) throw new Error(`Request ${i+1} failed: ${res.status}`);
  }
  // 4th should be rate limited
  const res = await fetch(`${baseUrl}/api/status`);
  await teardown(orc);
  delete process.env.RATE_LIMIT;
  delete process.env.RATE_WINDOW;
  if (res.status !== 429) throw new Error(`Expected 429, got ${res.status}`);
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
  await test('GET /api/tasks/:id returns task', testGetTaskById);
  await test('GET /api/tasks/:id 404 not found', testGetTaskNotFound);
  await test('POST /api/tasks/:id/feedback updates RL', testPostFeedback);
  await test('POST /api/tasks/:id/feedback 400 bad rating', testPostFeedbackBadRating);
  await test('POST /api/tasks/:id/feedback 404 not found', testPostFeedbackNotFound);
  await test('GET / returns dashboard HTML', testDashboard);
  await test('GET /api/rl-stats returns learning state', testGetRLStats);
  await test('POST /api/tasks blocked without API key', testApiKeyBlocked);
  await test('POST /api/tasks allowed with correct API key', testApiKeyAllowed);
  await test('GET /api/status allowed without API key', testApiKeyGetAllowed);
  await test('rate limiter returns 429 after limit exceeded', testRateLimit);

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed === 0) {
    console.log('\u2705 All API tests passed!\n');
    process.exit(0);
  } else {
    console.log('\u274c Some tests failed\n');
    process.exit(1);
  }
})();
