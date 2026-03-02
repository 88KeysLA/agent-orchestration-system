'use strict';
const AgentMarketplace = require('../src/marketplace');

let passed = 0, failed = 0;
function test(name, fn) {
  return fn()
    .then(() => { console.log(`✅ ${name}`); passed++; })
    .catch(err => { console.error(`❌ ${name}: ${err.message}`); failed++; });
}

const mockAgent = (name) => ({ execute: async (t) => `${name}: ${t}`, healthCheck: async () => true });

async function run() {
  await test('Publish and retrieve agent', async () => {
    const m = new AgentMarketplace();
    m.publish('fast-agent', '1.0.0', mockAgent('fast'), { description: 'Fast inference', strengths: ['speed'] });
    if (m.size !== 1) throw new Error('Wrong size');
    if (!m.get('fast-agent')) throw new Error('Not found');
  });

  await test('Search by name', async () => {
    const m = new AgentMarketplace();
    m.publish('code-agent', '1.0.0', mockAgent('code'), { description: 'Code generation' });
    m.publish('chat-agent', '1.0.0', mockAgent('chat'), { description: 'Conversation' });
    const results = m.search('code');
    if (results.length !== 1 || results[0].name !== 'code-agent') throw new Error('Wrong search result');
  });

  await test('Search by strengths', async () => {
    const m = new AgentMarketplace();
    m.publish('a', '1.0.0', mockAgent('a'), { strengths: ['fast', 'cheap'] });
    m.publish('b', '1.0.0', mockAgent('b'), { strengths: ['accurate', 'slow'] });
    const results = m.search('fast');
    if (results.length !== 1 || results[0].name !== 'a') throw new Error('Wrong result');
  });

  await test('Rate agent and compute avgRating', async () => {
    const m = new AgentMarketplace();
    m.publish('rated', '1.0.0', mockAgent('r'), {});
    m.rate('rated', 4, 'good');
    m.rate('rated', 5, 'excellent');
    const [result] = m.search('rated');
    if (result.avgRating !== 4.5) throw new Error(`Wrong avg: ${result.avgRating}`);
    if (result.ratingCount !== 2) throw new Error('Wrong count');
  });

  await test('Rate invalid score throws', async () => {
    const m = new AgentMarketplace();
    m.publish('x', '1.0.0', mockAgent('x'), {});
    let threw = false;
    try { m.rate('x', 6); } catch { threw = true; }
    if (!threw) throw new Error('Should throw on score > 5');
  });

  await test('Install into orchestrator', async () => {
    const m = new AgentMarketplace();
    const agent = mockAgent('installed');
    m.publish('my-agent', '2.0.0', agent, { strengths: ['test'] });
    const registered = {};
    const fakeOrc = { registerAgent: (n, v, a, meta) => { registered[n] = { v, a, meta }; } };
    const ver = m.install('my-agent', fakeOrc);
    if (ver !== '2.0.0') throw new Error('Wrong version');
    if (!registered['my-agent']) throw new Error('Not registered');
  });

  await test('Install unknown agent throws', async () => {
    const m = new AgentMarketplace();
    let threw = false;
    try { m.install('ghost', {}); } catch { threw = true; }
    if (!threw) throw new Error('Should throw');
  });

  await test('Search returns all when no query', async () => {
    const m = new AgentMarketplace();
    m.publish('a', '1.0.0', mockAgent('a'), {});
    m.publish('b', '1.0.0', mockAgent('b'), {});
    if (m.search().length !== 2) throw new Error('Should return all');
  });

  await test('Install picks highest semver, not last published', async () => {
    const m = new AgentMarketplace();
    m.publish('multi', '2.0.0', mockAgent('v2'), {});
    m.publish('multi', '1.5.0', mockAgent('v1.5'), {});
    const registered = {};
    const fakeOrc = { registerAgent: (n, v) => { registered.ver = v; } };
    const ver = m.install('multi', fakeOrc);
    if (ver !== '2.0.0') throw new Error(`Wrong version: ${ver} (should be 2.0.0)`);
  });

  console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

run();
