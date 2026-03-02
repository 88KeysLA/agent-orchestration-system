'use strict';
const { ContextManager, StaticProvider, TimeProvider, PollingProvider, ComputedProvider } = require('../src/context-providers');

let passed = 0, failed = 0;
function test(name, fn) {
  return fn()
    .then(() => { console.log(`✅ ${name}`); passed++; })
    .catch(err => { console.error(`❌ ${name}: ${err.message}`); failed++; });
}

async function run() {
  await test('StaticProvider returns fixed data', async () => {
    const p = new StaticProvider({ region: 'villa', tier: 'prod' });
    const ctx = await p.getContext();
    if (ctx.region !== 'villa') throw new Error('Wrong region');
    if (ctx.tier !== 'prod') throw new Error('Wrong tier');
  });

  await test('StaticProvider.set updates value', async () => {
    const p = new StaticProvider({ x: 1 });
    p.set('x', 99);
    const ctx = await p.getContext();
    if (ctx.x !== 99) throw new Error('Not updated');
  });

  await test('TimeProvider returns expected shape', async () => {
    const p = new TimeProvider();
    const ctx = await p.getContext();
    if (typeof ctx.hour !== 'number') throw new Error('Missing hour');
    if (!['night','morning','afternoon','evening'].includes(ctx.period)) throw new Error(`Bad period: ${ctx.period}`);
    if (typeof ctx.isWeekend !== 'boolean') throw new Error('Missing isWeekend');
  });

  await test('ContextManager merges multiple providers', async () => {
    const mgr = new ContextManager();
    mgr.add('env', new StaticProvider({ region: 'villa' }));
    mgr.add('time', new TimeProvider());
    const ctx = await mgr.getContext();
    if (!ctx.env || ctx.env.region !== 'villa') throw new Error('Missing env');
    if (!ctx.time || typeof ctx.time.hour !== 'number') throw new Error('Missing time');
  });

  await test('ContextManager caches results within TTL', async () => {
    let calls = 0;
    const provider = { getContext: async () => { calls++; return { v: calls }; } };
    const mgr = new ContextManager();
    mgr.add('x', provider, 1000);
    await mgr.getContext();
    await mgr.getContext();
    if (calls !== 1) throw new Error(`Expected 1 call, got ${calls}`);
  });

  await test('ContextManager re-fetches after TTL expires', async () => {
    let calls = 0;
    const provider = { getContext: async () => { calls++; return { v: calls }; } };
    const mgr = new ContextManager();
    mgr.add('x', provider, 10); // 10ms TTL
    await mgr.getContext();
    await new Promise(r => setTimeout(r, 20));
    await mgr.getContext();
    if (calls !== 2) throw new Error(`Expected 2 calls, got ${calls}`);
  });

  await test('ContextManager.get returns single provider context', async () => {
    const mgr = new ContextManager();
    mgr.add('env', new StaticProvider({ zone: 'living-room' }));
    const env = await mgr.get('env');
    if (env.zone !== 'living-room') throw new Error('Wrong value');
  });

  await test('ContextManager.get returns null for unknown provider', async () => {
    const mgr = new ContextManager();
    const result = await mgr.get('ghost');
    if (result !== null) throw new Error('Should be null');
  });

  await test('ContextManager uses stale cache on provider error', async () => {
    let fail = false;
    const provider = { getContext: async () => { if (fail) throw new Error('down'); return { v: 42 }; } };
    const mgr = new ContextManager();
    mgr.add('x', provider, 10);
    await mgr.getContext(); // prime cache
    fail = true;
    await new Promise(r => setTimeout(r, 20)); // expire TTL
    const ctx = await mgr.getContext();
    if (ctx.x.v !== 42) throw new Error('Should use stale cache');
  });

  await test('ComputedProvider derives from explicit deps', async () => {
    const timeProvider = new StaticProvider({ hour: 14, period: 'afternoon' });
    const mgr = new ContextManager();
    mgr.add('time', timeProvider);
    mgr.add('derived', new ComputedProvider({ time: timeProvider }, async (ctx) => ({
      preferFast: ctx.time.period === 'afternoon'
    })));
    const ctx = await mgr.getContext();
    if (!ctx.derived.preferFast) throw new Error('Derived value wrong');
  });

  await test('ContextManager.remove drops provider', async () => {
    const mgr = new ContextManager();
    mgr.add('a', new StaticProvider({ x: 1 }));
    mgr.add('b', new StaticProvider({ y: 2 }));
    mgr.remove('a');
    if (mgr.providers.includes('a')) throw new Error('Should be removed');
    const ctx = await mgr.getContext();
    if (ctx.a !== undefined) throw new Error('Should not be in context');
    if (!ctx.b) throw new Error('b should still be there');
  });

  await test('PollingProvider fetches on first getContext call', async () => {
    let fetched = false;
    const provider = new PollingProvider('http://fake', 60000);
    provider._fetch = async () => { fetched = true; provider._latest = { status: 'ok' }; };
    const ctx = await provider.getContext();
    if (!fetched) throw new Error('Should have fetched');
    if (ctx.status !== 'ok') throw new Error('Wrong value');
  });

  await test('ContextManager.shutdown stops polling providers', async () => {
    let stopped = false;
    const poller = new PollingProvider('http://fake', 60000);
    poller._fetch = async () => { poller._latest = { ok: true }; };
    const origStop = poller.stop.bind(poller);
    poller.stop = () => { stopped = true; return origStop(); };
    const mgr = new ContextManager();
    mgr.add('poll', poller);
    mgr.add('static', new StaticProvider({ x: 1 }));
    await mgr.getContext(); // prime cache
    mgr.shutdown();
    if (!stopped) throw new Error('Should have called stop on polling provider');
    // Cache should be cleared
    const ctx = await mgr.getContext();
    // Static provider still works (it has no stop), but cache was cleared so it re-fetches
  });

  console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

run();
