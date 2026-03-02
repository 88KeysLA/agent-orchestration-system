'use strict';
const VillaClient = require('../src/villa-client');

let passed = 0, failed = 0;
function test(name, fn) {
  return fn()
    .then(() => { console.log(`✅ ${name}`); passed++; })
    .catch(err => { console.error(`❌ ${name}: ${err.message}`); failed++; });
}

// Mock fetch
let mockResponse = null;
global.fetch = async (url, opts) => {
  if (mockResponse instanceof Error) throw mockResponse;
  return {
    ok: mockResponse.ok !== false,
    status: mockResponse.status || 200,
    statusText: mockResponse.statusText || 'OK',
    json: async () => mockResponse.body
  };
};

async function run() {
  await test('execute returns result string', async () => {
    mockResponse = { body: { result: 'summarized text', success: true } };
    const villa = new VillaClient('http://192.168.0.60:8406');
    const result = await villa.execute('summarize this doc');
    if (result !== 'summarized text') throw new Error(`Wrong: ${result}`);
  });

  await test('execute sends task in body', async () => {
    let sentBody = null;
    global.fetch = async (url, opts) => {
      sentBody = JSON.parse(opts.body);
      return { ok: true, status: 200, json: async () => ({ result: 'ok' }) };
    };
    const villa = new VillaClient();
    await villa.execute('my task');
    if (sentBody.task !== 'my task') throw new Error('Task not in body');
  });

  await test('execute sends agent when specified', async () => {
    let sentBody = null;
    global.fetch = async (url, opts) => {
      sentBody = JSON.parse(opts.body);
      return { ok: true, status: 200, json: async () => ({ result: 'ok' }) };
    };
    const villa = new VillaClient();
    await villa.execute('task', { agent: 'fx-ollama' });
    if (sentBody.agent !== 'fx-ollama') throw new Error('Agent not in body');
  });

  await test('defaultAgent used when no per-call agent', async () => {
    let sentBody = null;
    global.fetch = async (url, opts) => {
      sentBody = JSON.parse(opts.body);
      return { ok: true, status: 200, json: async () => ({ result: 'ok' }) };
    };
    const villa = new VillaClient('http://192.168.0.60:8406', { defaultAgent: 'ollama' });
    await villa.execute('task');
    if (sentBody.agent !== 'ollama') throw new Error('Default agent not used');
  });

  await test('agents() returns agent list', async () => {
    global.fetch = async () => ({
      ok: true, status: 200,
      json: async () => ({ agents: [{ name: 'ollama', status: 'healthy' }] })
    });
    const villa = new VillaClient();
    const agents = await villa.agents();
    if (!agents[0] || agents[0].name !== 'ollama') throw new Error('Wrong agents');
  });

  await test('ping returns true when reachable', async () => {
    global.fetch = async () => ({ ok: true, status: 200, json: async () => ({ status: 'ok' }) });
    const villa = new VillaClient();
    if (!await villa.ping()) throw new Error('Should be reachable');
  });

  await test('ping returns false when unreachable', async () => {
    global.fetch = async () => { throw new Error('ECONNREFUSED'); };
    const villa = new VillaClient();
    if (await villa.ping()) throw new Error('Should be unreachable');
  });

  await test('throws on non-ok response', async () => {
    global.fetch = async () => ({ ok: false, status: 503, statusText: 'Service Unavailable', json: async () => ({}) });
    const villa = new VillaClient();
    let threw = false;
    try { await villa.execute('task'); } catch { threw = true; }
    if (!threw) throw new Error('Should throw on 503');
  });

  console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

run();
