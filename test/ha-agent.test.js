/**
 * HA Agent Tests
 * Uses mocked fetch — no live Home Assistant needed
 */
const HAAgent = require('../src/agents/ha-agent');
const { HASafetyGate } = require('../src/agents/ha-agent');

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

function mockFetch(responseBody, status = 200) {
  global.fetch = async (url, opts) => ({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: async () => responseBody,
    text: async () => JSON.stringify(responseBody)
  });
}

function mockFetchCapture() {
  const calls = [];
  global.fetch = async (url, opts) => {
    calls.push({ url, opts });
    return {
      ok: true, status: 200, statusText: 'OK',
      json: async () => ({ state: 'on', attributes: { friendly_name: 'Test' }, status: 'ok' }),
      text: async () => '{}'
    };
  };
  return calls;
}

// === Constructor tests ===

async function testDefaults() {
  const agent = new HAAgent({ token: 'test-token' });
  if (agent.baseUrl !== 'http://192.168.1.6:8123') throw new Error(`Wrong baseUrl: ${agent.baseUrl}`);
  if (agent.token !== 'test-token') throw new Error('Wrong token');
  if (agent.intentResolverUrl !== 'http://192.168.0.60:8400') throw new Error('Wrong resolver URL');
  if (agent.lastUsage !== null) throw new Error('lastUsage should be null');
}

async function testCustomOptions() {
  const agent = new HAAgent({
    baseUrl: 'http://custom:8123',
    token: 'custom-token',
    intentResolverUrl: 'http://custom:8400'
  });
  if (agent.baseUrl !== 'http://custom:8123') throw new Error('Wrong baseUrl');
  if (agent.token !== 'custom-token') throw new Error('Wrong token');
  if (agent.intentResolverUrl !== 'http://custom:8400') throw new Error('Wrong resolver');
}

// === Health check tests ===

async function testHealthCheckOk() {
  mockFetch({ message: 'API running.' });
  const agent = new HAAgent({ token: 'test-token', baseUrl: 'http://localhost:8123' });
  const healthy = await agent.healthCheck();
  if (!healthy) throw new Error('Should be healthy on 200');
}

async function testHealthCheckFail() {
  global.fetch = async () => { throw new Error('Connection refused'); };
  const agent = new HAAgent({ token: 'test-token', baseUrl: 'http://localhost:99999' });
  const healthy = await agent.healthCheck();
  if (healthy) throw new Error('Should be unhealthy on network error');
}

async function testHealthCheckNoToken() {
  const agent = new HAAgent({ token: '' });
  const healthy = await agent.healthCheck();
  if (healthy) throw new Error('Should be unhealthy without token');
}

// === Structured command tests ===

async function testStructuredState() {
  mockFetch({ state: 'on', attributes: { friendly_name: 'Theatre', brightness: 255 } });
  const agent = new HAAgent({ token: 'test', baseUrl: 'http://localhost:8123' });
  const result = await agent.execute('ha:state:light.theatre');
  if (!result.includes('Theatre')) throw new Error(`Missing friendly_name: ${result}`);
  if (!result.includes('100%')) throw new Error(`Missing brightness: ${result}`);
}

async function testStructuredService() {
  const calls = mockFetchCapture();
  const agent = new HAAgent({ token: 'test', baseUrl: 'http://localhost:8123' });
  const result = await agent.execute('ha:service:light/turn_on:{"entity_id":"light.theatre","brightness_pct":80}');
  if (!result.includes('OK')) throw new Error(`Expected OK: ${result}`);
  const serviceCall = calls.find(c => c.url.includes('/api/services/'));
  if (!serviceCall) throw new Error('No service call made');
  if (!serviceCall.url.includes('light/turn_on')) throw new Error(`Wrong URL: ${serviceCall.url}`);
}

async function testStructuredIntent() {
  mockFetch({ status: 'ok', room: 'theatre', intent: 'romance' });
  const agent = new HAAgent({ token: 'test', baseUrl: 'http://localhost:8123', intentResolverUrl: 'http://localhost:8400' });
  const result = await agent.execute('ha:intent:theatre/romance');
  if (!result.includes('romance')) throw new Error(`Missing intent: ${result}`);
  if (!result.includes('theatre')) throw new Error(`Missing room: ${result}`);
}

async function testStructuredMode() {
  mockFetch([]);
  const agent = new HAAgent({ token: 'test', baseUrl: 'http://localhost:8123' });
  const result = await agent.execute('ha:mode:WATCH');
  if (!result.includes('WATCH')) throw new Error(`Missing mode: ${result}`);
}

async function testStructuredInvalidMode() {
  const agent = new HAAgent({ token: 'test' });
  const result = await agent.execute('ha:mode:PARTY');
  if (!result.includes('Invalid mode')) throw new Error(`Expected error: ${result}`);
}

async function testStructuredUnknownType() {
  const agent = new HAAgent({ token: 'test' });
  const result = await agent.execute('ha:bogus:thing');
  if (!result.includes('Unknown command type')) throw new Error(`Expected error: ${result}`);
}

async function testStructuredBadServiceFormat() {
  const agent = new HAAgent({ token: 'test' });
  const result = await agent.execute('ha:service:badformat');
  if (!result.includes('domain/service')) throw new Error(`Expected format error: ${result}`);
}

async function testStructuredBadJSON() {
  const agent = new HAAgent({ token: 'test' });
  const result = await agent.execute('ha:service:light/turn_on:{bad json}');
  if (!result.includes('Invalid JSON')) throw new Error(`Expected JSON error: ${result}`);
}

// === NL parsing tests ===

async function testNLTurnOn() {
  const calls = mockFetchCapture();
  const agent = new HAAgent({ token: 'test', baseUrl: 'http://localhost:8123' });
  await agent.execute('turn on theatre lights');
  const serviceCall = calls.find(c => c.url.includes('light/turn_on'));
  if (!serviceCall) throw new Error('No turn_on call made');
  const body = JSON.parse(serviceCall.opts.body);
  if (body.entity_id !== 'light.theatre') throw new Error(`Wrong entity: ${body.entity_id}`);
}

async function testNLTurnOff() {
  const calls = mockFetchCapture();
  const agent = new HAAgent({ token: 'test', baseUrl: 'http://localhost:8123' });
  await agent.execute('turn off kitchen lights');
  const serviceCall = calls.find(c => c.url.includes('light/turn_off'));
  if (!serviceCall) throw new Error('No turn_off call made');
  const body = JSON.parse(serviceCall.opts.body);
  if (body.entity_id !== 'light.kitchen') throw new Error(`Wrong entity: ${body.entity_id}`);
}

async function testNLSetBrightness() {
  const calls = mockFetchCapture();
  const agent = new HAAgent({ token: 'test', baseUrl: 'http://localhost:8123' });
  await agent.execute('set theatre to 50%');
  const serviceCall = calls.find(c => c.url.includes('light/turn_on'));
  if (!serviceCall) throw new Error('No turn_on call for brightness');
  const body = JSON.parse(serviceCall.opts.body);
  if (body.brightness_pct !== 50) throw new Error(`Wrong brightness: ${body.brightness_pct}`);
}

async function testNLGetState() {
  mockFetch({ state: 'NORMAL', attributes: { friendly_name: 'Villa Mode' } });
  const agent = new HAAgent({ token: 'test', baseUrl: 'http://localhost:8123' });
  const result = await agent.execute('what is input_select.villa_mode state');
  if (!result.includes('NORMAL')) throw new Error(`Missing state: ${result}`);
}

async function testNLSetMode() {
  mockFetch([]);
  const agent = new HAAgent({ token: 'test', baseUrl: 'http://localhost:8123' });
  const result = await agent.execute('set mode to LISTEN');
  if (!result.includes('LISTEN')) throw new Error(`Missing mode: ${result}`);
}

async function testNLUnrecognized() {
  const agent = new HAAgent({ token: 'test' });
  const result = await agent.execute('fly me to the moon');
  if (!result.includes('Unrecognized')) throw new Error(`Expected help: ${result}`);
}

async function testNLMoodIntent() {
  mockFetch({ status: 'ok' });
  const agent = new HAAgent({ token: 'test', baseUrl: 'http://localhost:8123', intentResolverUrl: 'http://localhost:8400' });
  const result = await agent.execute('theatre to romance mood');
  if (!result.includes('romance')) throw new Error(`Missing intent: ${result}`);
}

async function testNLEntityWithDot() {
  const calls = mockFetchCapture();
  const agent = new HAAgent({ token: 'test', baseUrl: 'http://localhost:8123' });
  await agent.execute('turn on light.great_room');
  const serviceCall = calls.find(c => c.url.includes('light/turn_on'));
  const body = JSON.parse(serviceCall.opts.body);
  if (body.entity_id !== 'light.great_room') throw new Error(`Wrong entity: ${body.entity_id}`);
}

// === Safety tests ===

async function testSafetyBlocksMasterSuite() {
  mockFetch([]);
  const agent = new HAAgent({ token: 'test', baseUrl: 'http://localhost:8123' });
  const result = await agent.execute('ha:service:light/turn_on:{"entity_id":"light.master_1"}');
  if (!result.includes('Blocked')) throw new Error(`Expected block: ${result}`);
  if (!result.includes('master')) throw new Error(`Expected master reason: ${result}`);
}

async function testSafetyBlocksSecurity() {
  const agent = new HAAgent({ token: 'test', baseUrl: 'http://localhost:8123' });
  const result = await agent.execute('ha:service:light/turn_on:{"entity_id":"light.security_flood"}');
  if (!result.includes('Blocked')) throw new Error(`Expected block: ${result}`);
}

async function testSafetyBlocksGarage() {
  const agent = new HAAgent({ token: 'test', baseUrl: 'http://localhost:8123' });
  const result = await agent.execute('ha:service:switch/turn_on:{"entity_id":"switch.garage_door"}');
  if (!result.includes('Blocked')) throw new Error(`Expected block: ${result}`);
}

async function testSafetyBlocksLaundry() {
  const agent = new HAAgent({ token: 'test', baseUrl: 'http://localhost:8123' });
  const result = await agent.execute('ha:service:switch/turn_on:{"entity_id":"switch.laundry_washer"}');
  if (!result.includes('Blocked')) throw new Error(`Expected block: ${result}`);
}

async function testSafetyVolumeCap() {
  const gate = new HASafetyGate();
  const data = { entity_id: 'media_player.kitchen', volume_level: 0.9 };
  const result = gate.check('write', 'media_player.kitchen', data);
  if (!result.allowed) throw new Error('Should allow media_player write');
  if (data.volume_level !== 0.7) throw new Error(`Volume not capped: ${data.volume_level}`);
}

async function testSafetyAllowsVillaMode() {
  const gate = new HASafetyGate();
  const result = gate.check('write', 'input_select.villa_mode', {});
  if (!result.allowed) throw new Error('Should allow villa_mode');
}

async function testSafetyBlocksRandomInputSelect() {
  const gate = new HASafetyGate();
  const result = gate.check('write', 'input_select.random_thing', {});
  if (result.allowed) throw new Error('Should block random input_select');
}

async function testSafetyAllowsSensorRead() {
  const gate = new HASafetyGate();
  const result = gate.check('read', 'sensor.temperature', {});
  if (!result.allowed) throw new Error('Should allow sensor read');
}

async function testSafetyBlocksSensorWrite() {
  const gate = new HASafetyGate();
  const result = gate.check('write', 'sensor.temperature', {});
  if (result.allowed) throw new Error('Should block sensor write');
}

async function testSafetyBlocksUnknownDomain() {
  const gate = new HASafetyGate();
  const result = gate.check('write', 'climate.north_hall', {});
  if (result.allowed) throw new Error('Should block unknown domain');
}

// === Usage tracking ===

async function testLastUsageTracked() {
  mockFetch({ state: 'on', attributes: {} });
  const agent = new HAAgent({ token: 'test', baseUrl: 'http://localhost:8123' });
  await agent.execute('ha:state:light.theatre');
  if (!agent.lastUsage) throw new Error('lastUsage not set');
  if (agent.lastUsage.type !== 'state') throw new Error(`Wrong type: ${agent.lastUsage.type}`);
  if (typeof agent.lastUsage.duration !== 'number') throw new Error('duration not a number');
}

// === Interface compliance ===

async function testAgentInterface() {
  const agent = new HAAgent({ token: 'test' });
  if (typeof agent.execute !== 'function') throw new Error('Missing execute');
  if (typeof agent.healthCheck !== 'function') throw new Error('Missing healthCheck');
}

// === State 404 ===

async function testState404() {
  mockFetch({}, 404);
  const agent = new HAAgent({ token: 'test', baseUrl: 'http://localhost:8123' });
  const result = await agent.execute('ha:state:sensor.nonexistent');
  if (!result.includes('not found')) throw new Error(`Expected not found: ${result}`);
}

(async () => {
  console.log('Testing HA Agent...\n');

  // Constructor
  await test('Constructor: default options', testDefaults);
  await test('Constructor: custom options', testCustomOptions);

  // Health check
  await test('healthCheck: returns true on 200', testHealthCheckOk);
  await test('healthCheck: returns false on error', testHealthCheckFail);
  await test('healthCheck: returns false without token', testHealthCheckNoToken);

  // Structured commands
  await test('Structured: ha:state reads entity', testStructuredState);
  await test('Structured: ha:service calls service', testStructuredService);
  await test('Structured: ha:intent proxies to resolver', testStructuredIntent);
  await test('Structured: ha:mode changes villa mode', testStructuredMode);
  await test('Structured: invalid mode returns error', testStructuredInvalidMode);
  await test('Structured: unknown type returns error', testStructuredUnknownType);
  await test('Structured: bad service format', testStructuredBadServiceFormat);
  await test('Structured: bad JSON in service data', testStructuredBadJSON);

  // NL parsing
  await test('NL: turn on theatre lights', testNLTurnOn);
  await test('NL: turn off kitchen lights', testNLTurnOff);
  await test('NL: set brightness to 50%', testNLSetBrightness);
  await test('NL: what is state', testNLGetState);
  await test('NL: set mode to LISTEN', testNLSetMode);
  await test('NL: unrecognized returns help', testNLUnrecognized);
  await test('NL: mood intent', testNLMoodIntent);
  await test('NL: entity with dot preserved', testNLEntityWithDot);

  // Safety
  await test('Safety: blocks master suite lights', testSafetyBlocksMasterSuite);
  await test('Safety: blocks security lights', testSafetyBlocksSecurity);
  await test('Safety: blocks garage switch', testSafetyBlocksGarage);
  await test('Safety: blocks laundry switch', testSafetyBlocksLaundry);
  await test('Safety: caps volume at 70%', testSafetyVolumeCap);
  await test('Safety: allows villa_mode', testSafetyAllowsVillaMode);
  await test('Safety: blocks random input_select', testSafetyBlocksRandomInputSelect);
  await test('Safety: allows sensor read', testSafetyAllowsSensorRead);
  await test('Safety: blocks sensor write', testSafetyBlocksSensorWrite);
  await test('Safety: blocks unknown domain', testSafetyBlocksUnknownDomain);

  // Usage + interface
  await test('lastUsage tracked after execute', testLastUsageTracked);
  await test('Implements agent interface', testAgentInterface);
  await test('State 404 handled', testState404);

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed === 0) {
    console.log('\u2705 All HA agent tests passed!\n');
    process.exit(0);
  } else {
    console.log('\u274c Some tests failed\n');
    process.exit(1);
  }
})();
