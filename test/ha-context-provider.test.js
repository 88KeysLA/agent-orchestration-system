/**
 * HA Context Provider Tests
 * Uses mocked fetch — no live Home Assistant needed
 */
const HAContextProvider = require('../src/ha-context-provider');

let passed = 0;
let failed = 0;
const originalFetch = global.fetch;

function test(name, fn) {
  return fn().then(() => {
    console.log(`\u2705 ${name}`);
    passed++;
  }).catch(err => {
    console.log(`\u274c ${name}: ${err.message}`);
    failed++;
  }).finally(() => {
    global.fetch = originalFetch;
  });
}

function mockHAStates(stateMap) {
  global.fetch = async (url) => {
    const entityId = url.split('/api/states/')[1];
    if (entityId && stateMap[entityId] !== undefined) {
      return {
        ok: true, status: 200,
        json: async () => ({ state: stateMap[entityId], attributes: {} })
      };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };
}

async function testFetchesAndTransforms() {
  mockHAStates({
    'input_select.villa_mode': 'WATCH',
    'binary_sensor.mech_mac_ping': 'on',
    'input_boolean.agent_controlled_lighting_enable': 'on',
    'input_boolean.agent_controlled_media_enable': 'off',
    'input_boolean.mood_time_aware_enable': 'on'
  });
  const provider = new HAContextProvider({ token: 'test', baseUrl: 'http://localhost:8123' });
  const ctx = await provider.getContext();
  if (ctx.villa_mode !== 'WATCH') throw new Error(`Wrong mode: ${ctx.villa_mode}`);
  if (ctx.mech_online !== true) throw new Error(`Wrong mech: ${ctx.mech_online}`);
  if (ctx.lighting_enabled !== true) throw new Error(`Wrong lighting: ${ctx.lighting_enabled}`);
  if (ctx.media_enabled !== false) throw new Error(`Wrong media: ${ctx.media_enabled}`);
  if (ctx.time_aware_enabled !== true) throw new Error(`Wrong time_aware: ${ctx.time_aware_enabled}`);
}

async function testCachesResult() {
  let fetchCount = 0;
  global.fetch = async (url) => {
    fetchCount++;
    return {
      ok: true, status: 200,
      json: async () => ({ state: 'NORMAL', attributes: {} })
    };
  };
  const provider = new HAContextProvider({ token: 'test', baseUrl: 'http://localhost:8123' });
  await provider.getContext();
  const firstCount = fetchCount;
  await provider.getContext(); // Should use cached
  if (fetchCount !== firstCount) throw new Error(`Fetched again: ${fetchCount} vs ${firstCount}`);
}

async function testStaleOnError() {
  // First call succeeds
  mockHAStates({ 'input_select.villa_mode': 'LISTEN' });
  const provider = new HAContextProvider({
    token: 'test', baseUrl: 'http://localhost:8123',
    entities: ['input_select.villa_mode']
  });
  await provider.getContext();

  // Second call fails
  global.fetch = async () => { throw new Error('Network down'); };
  await provider._poll(); // Force re-poll
  const ctx = await provider.getContext();
  if (ctx.villa_mode !== 'LISTEN') throw new Error(`Lost stale value: ${ctx.villa_mode}`);
}

async function testStartStop() {
  mockHAStates({ 'input_select.villa_mode': 'NORMAL' });
  const provider = new HAContextProvider({
    token: 'test', baseUrl: 'http://localhost:8123',
    pollInterval: 100000 // Long interval, won't fire during test
  });
  provider.start();
  if (!provider._timer) throw new Error('Timer not started');
  provider.stop();
  if (provider._timer) throw new Error('Timer not stopped');
}

async function testDefaultsToNormal() {
  global.fetch = async () => ({ ok: false, status: 500, json: async () => ({}) });
  const provider = new HAContextProvider({ token: 'test', baseUrl: 'http://localhost:8123' });
  const ctx = await provider.getContext();
  if (ctx.villa_mode !== 'NORMAL') throw new Error(`Wrong default: ${ctx.villa_mode}`);
}

async function testNoTokenSkipsPoll() {
  let fetchCalled = false;
  global.fetch = async () => { fetchCalled = true; return { ok: true, json: async () => ({}) }; };
  const provider = new HAContextProvider({ token: '', baseUrl: 'http://localhost:8123' });
  await provider._poll();
  if (fetchCalled) throw new Error('Should not fetch without token');
}

async function testBooleanParsing() {
  mockHAStates({
    'input_select.villa_mode': 'NORMAL',
    'binary_sensor.mech_mac_ping': 'off',
    'input_boolean.agent_controlled_lighting_enable': 'off',
    'input_boolean.agent_controlled_media_enable': 'on',
    'input_boolean.mood_time_aware_enable': 'off'
  });
  const provider = new HAContextProvider({ token: 'test', baseUrl: 'http://localhost:8123' });
  const ctx = await provider.getContext();
  if (ctx.mech_online !== false) throw new Error('mech should be false');
  if (ctx.lighting_enabled !== false) throw new Error('lighting should be false');
  if (ctx.media_enabled !== true) throw new Error('media should be true');
  if (ctx.time_aware_enabled !== false) throw new Error('time_aware should be false');
}

async function testCustomEntities() {
  const fetched = [];
  global.fetch = async (url) => {
    fetched.push(url);
    return { ok: true, status: 200, json: async () => ({ state: 'on', attributes: {} }) };
  };
  const provider = new HAContextProvider({
    token: 'test', baseUrl: 'http://localhost:8123',
    entities: ['sensor.custom_one', 'sensor.custom_two']
  });
  await provider._poll();
  if (fetched.length !== 2) throw new Error(`Wrong fetch count: ${fetched.length}`);
  if (!fetched[0].includes('sensor.custom_one')) throw new Error('Missing custom entity 1');
  if (!fetched[1].includes('sensor.custom_two')) throw new Error('Missing custom entity 2');
}

(async () => {
  console.log('Testing HA Context Provider...\n');

  await test('Fetches and transforms states', testFetchesAndTransforms);
  await test('Caches result on second call', testCachesResult);
  await test('Keeps stale value on error', testStaleOnError);
  await test('Start/stop controls timer', testStartStop);
  await test('Defaults to NORMAL on failure', testDefaultsToNormal);
  await test('No token skips poll', testNoTokenSkipsPoll);
  await test('Boolean parsing (on/off)', testBooleanParsing);
  await test('Custom entities polled', testCustomEntities);

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed === 0) {
    console.log('\u2705 All HA context provider tests passed!\n');
    process.exit(0);
  } else {
    console.log('\u274c Some tests failed\n');
    process.exit(1);
  }
})();
