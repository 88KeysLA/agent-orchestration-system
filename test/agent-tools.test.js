/**
 * Agent Tools Tests
 * Tests AgentToolkit, HA tools, Crestron tools, utility tools
 * Uses mocked fetch — no live services needed
 */
const { AgentToolkit, addHATools, addCrestronTools, addUtilityTools, CrestronSession } = require('../src/agent-tools');

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

function assert(condition, msg) {
  if (!condition) throw new Error(msg);
}

// --- Mock helpers ---

function mockFetch(responses = {}) {
  return async (url, options = {}) => {
    for (const [pattern, handler] of Object.entries(responses)) {
      if (url.includes(pattern)) {
        const result = typeof handler === 'function' ? handler(url, options) : handler;
        return {
          ok: true,
          status: 200,
          json: async () => result,
          text: async () => JSON.stringify(result)
        };
      }
    }
    return { ok: false, status: 404, json: async () => ({}), text: async () => '' };
  };
}

function mockCrestronFetch(responses = {}) {
  return async (url, options = {}) => {
    for (const [pattern, handler] of Object.entries(responses)) {
      if (url.includes(pattern)) {
        const result = typeof handler === 'function' ? handler(url, options) : handler;
        return {
          ok: true,
          status: 200,
          body: JSON.stringify(result),
          json: () => result,
          headers: {}
        };
      }
    }
    return { ok: false, status: 404, body: 'Not found', json: () => ({}), headers: {} };
  };
}

// --- Toolkit Core Tests ---

async function testToolkitAddAndGet() {
  const tk = new AgentToolkit();
  tk.add('test_tool', 'A test tool', { type: 'object', properties: {} }, async () => 'hello');
  assert(tk.size === 1, `Expected size 1, got ${tk.size}`);
  assert(tk.has('test_tool'), 'Should have test_tool');
  const defs = tk.getDefinitions();
  assert(defs.length === 1, `Expected 1 definition, got ${defs.length}`);
  assert(defs[0].name === 'test_tool', `Expected name test_tool, got ${defs[0].name}`);
  assert(defs[0].description === 'A test tool', 'Wrong description');
}

async function testToolkitExecute() {
  const tk = new AgentToolkit();
  tk.add('echo', 'Echo', { type: 'object', properties: {} }, async (input) => `echo: ${input.msg}`);
  const result = await tk.execute('echo', { msg: 'hi' });
  assert(result === 'echo: hi', `Expected 'echo: hi', got '${result}'`);
}

async function testToolkitExecuteUnknown() {
  const tk = new AgentToolkit();
  const result = await tk.execute('nonexistent', {});
  assert(result.includes('Unknown tool'), `Expected unknown tool error, got '${result}'`);
}

async function testToolkitExecuteError() {
  const tk = new AgentToolkit();
  tk.add('fail', 'Fail', { type: 'object', properties: {} }, async () => { throw new Error('boom'); });
  const result = await tk.execute('fail', {});
  assert(result.includes('Error: boom'), `Expected error message, got '${result}'`);
}

async function testToolkitObjectResult() {
  const tk = new AgentToolkit();
  tk.add('obj', 'Obj', { type: 'object', properties: {} }, async () => ({ key: 'value' }));
  const result = await tk.execute('obj', {});
  const parsed = JSON.parse(result);
  assert(parsed.key === 'value', 'Object should be JSON-stringified');
}

// --- HA Tools Tests ---

async function testHAGetState() {
  const tk = new AgentToolkit();
  addHATools(tk, {
    baseUrl: 'http://test:8123', token: 'tok',
    fetch: mockFetch({
      '/api/states/light.theatre': {
        entity_id: 'light.theatre', state: 'on',
        attributes: { friendly_name: 'Theatre', brightness: 255 },
        last_changed: '2026-01-01T00:00:00Z'
      }
    })
  });
  const result = JSON.parse(await tk.execute('ha_get_state', { entity_id: 'light.theatre' }));
  assert(result.state === 'on', `Expected on, got ${result.state}`);
  assert(result.brightness_pct === 100, `Expected 100%, got ${result.brightness_pct}`);
  assert(result.friendly_name === 'Theatre', `Expected Theatre, got ${result.friendly_name}`);
}

async function testHACallService() {
  let calledUrl, calledBody;
  const tk = new AgentToolkit();
  addHATools(tk, {
    baseUrl: 'http://test:8123', token: 'tok',
    fetch: async (url, opts) => {
      calledUrl = url;
      calledBody = opts.body;
      return { ok: true, status: 200, json: async () => ([]) };
    }
  });
  const result = await tk.execute('ha_call_service', {
    domain: 'light', service: 'turn_on',
    data: { entity_id: 'light.theatre', brightness_pct: 50 }
  });
  assert(result.includes('OK'), `Expected OK, got '${result}'`);
  assert(calledUrl.includes('/api/services/light/turn_on'), `Wrong URL: ${calledUrl}`);
}

async function testHASafetyMaster() {
  const tk = new AgentToolkit();
  addHATools(tk, { baseUrl: 'http://test:8123', token: 'tok', fetch: mockFetch({}) });
  const result = await tk.execute('ha_call_service', {
    domain: 'light', service: 'turn_on',
    data: { entity_id: 'light.master_1' }
  });
  assert(result.includes('BLOCKED'), `Expected blocked, got '${result}'`);
  assert(/master/i.test(result), `Expected master mention, got '${result}'`);
}

async function testHASafetySecurity() {
  const tk = new AgentToolkit();
  addHATools(tk, { baseUrl: 'http://test:8123', token: 'tok', fetch: mockFetch({}) });
  const result = await tk.execute('ha_call_service', {
    domain: 'light', service: 'turn_on',
    data: { entity_id: 'light.security_front' }
  });
  assert(result.includes('BLOCKED'), `Expected blocked, got '${result}'`);
}

async function testHASafetyGarage() {
  const tk = new AgentToolkit();
  addHATools(tk, { baseUrl: 'http://test:8123', token: 'tok', fetch: mockFetch({}) });
  const result = await tk.execute('ha_call_service', {
    domain: 'switch', service: 'turn_on',
    data: { entity_id: 'switch.garage_door' }
  });
  assert(result.includes('BLOCKED'), `Expected blocked, got '${result}'`);
  assert(/garage/i.test(result), `Expected garage mention, got '${result}'`);
}

async function testHASafetyLaundry() {
  const tk = new AgentToolkit();
  addHATools(tk, { baseUrl: 'http://test:8123', token: 'tok', fetch: mockFetch({}) });
  const result = await tk.execute('ha_call_service', {
    domain: 'switch', service: 'turn_on',
    data: { entity_id: 'switch.laundry_outlet' }
  });
  assert(result.includes('BLOCKED'), `Expected blocked, got '${result}'`);
}

async function testHASafetyVolumeCap() {
  let capturedData;
  const tk = new AgentToolkit();
  addHATools(tk, {
    baseUrl: 'http://test:8123', token: 'tok',
    fetch: async (url, opts) => {
      if (opts.body) capturedData = JSON.parse(opts.body);
      return { ok: true, status: 200, json: async () => ([]) };
    }
  });
  await tk.execute('ha_call_service', {
    domain: 'media_player', service: 'volume_set',
    data: { entity_id: 'media_player.theatre', volume_level: 0.95 }
  });
  assert(capturedData.volume_level === 0.7, `Volume should be capped at 0.7, got ${capturedData.volume_level}`);
}

async function testHASafetyReadOnly() {
  const tk = new AgentToolkit();
  addHATools(tk, { baseUrl: 'http://test:8123', token: 'tok', fetch: mockFetch({}) });
  const result = await tk.execute('ha_call_service', {
    domain: 'sensor', service: 'turn_on',
    data: { entity_id: 'sensor.temperature' }
  });
  assert(result.includes('BLOCKED'), `Expected blocked, got '${result}'`);
  assert(result.includes('read-only'), `Expected read-only mention, got '${result}'`);
}

async function testHASearchEntities() {
  const tk = new AgentToolkit();
  addHATools(tk, {
    baseUrl: 'http://test:8123', token: 'tok',
    fetch: mockFetch({
      '/api/states': [
        { entity_id: 'light.theatre', state: 'on', attributes: { friendly_name: 'Theatre' } },
        { entity_id: 'light.bar', state: 'off', attributes: { friendly_name: 'Bar' } },
        { entity_id: 'media_player.theatre', state: 'idle', attributes: { friendly_name: 'Theatre Speaker' } }
      ]
    })
  });
  // Search by keyword
  const result = JSON.parse(await tk.execute('ha_search_entities', { query: 'theatre' }));
  assert(result.length === 2, `Expected 2 results, got ${result.length}`);

  // Search with domain filter
  const result2 = JSON.parse(await tk.execute('ha_search_entities', { query: 'theatre', domain: 'light' }));
  assert(result2.length === 1, `Expected 1 filtered result, got ${result2.length}`);
}

async function testHASetMode() {
  let calledBody;
  const tk = new AgentToolkit();
  addHATools(tk, {
    baseUrl: 'http://test:8123', token: 'tok',
    fetch: async (url, opts) => {
      if (opts.body) calledBody = JSON.parse(opts.body);
      return { ok: true, status: 200, json: async () => ([]) };
    }
  });
  const result = await tk.execute('ha_set_mode', { mode: 'WATCH' });
  assert(result.includes('WATCH'), `Expected WATCH confirmation, got '${result}'`);
  assert(calledBody.option === 'WATCH', `Expected option WATCH, got ${calledBody.option}`);
  assert(calledBody.entity_id === 'input_select.villa_mode', `Wrong entity: ${calledBody.entity_id}`);
}

async function testHATrigger() {
  let calledUrl;
  const tk = new AgentToolkit();
  addHATools(tk, {
    baseUrl: 'http://test:8123', token: 'tok',
    fetch: async (url, opts) => {
      calledUrl = url;
      return { ok: true, status: 200, json: async () => ([]) };
    }
  });
  const result = await tk.execute('ha_trigger', { entity_id: 'script.theatre_watch' });
  assert(result.includes('Triggered'), `Expected triggered, got '${result}'`);
  assert(calledUrl.includes('/api/services/script/turn_on'), `Wrong URL: ${calledUrl}`);
}

async function testHANotify() {
  let calledBody;
  const tk = new AgentToolkit();
  addHATools(tk, {
    baseUrl: 'http://test:8123', token: 'tok',
    fetch: async (url, opts) => {
      if (opts.body) calledBody = JSON.parse(opts.body);
      return { ok: true, status: 200, json: async () => ({}) };
    }
  });
  const result = await tk.execute('ha_notify', { title: 'Test', message: 'Hello' });
  assert(result.includes('Notification sent'), `Expected sent, got '${result}'`);
  assert(calledBody.message === 'Hello', `Wrong message: ${calledBody.message}`);
}

// --- Crestron Tools Tests ---

async function testCrestronSessionAuth() {
  const session = new CrestronSession('192.168.1.2', 'test-token', {
    fetch: mockCrestronFetch({
      '/cws/api/login': { version: '2.0', authkey: 'session-abc' }
    })
  });
  const key = await session.authenticate();
  assert(key === 'session-abc', `Expected session-abc, got ${key}`);
  // Second call should use cached session
  const key2 = await session.authenticate();
  assert(key2 === 'session-abc', 'Should use cached session');
}

async function testCrestronListRooms() {
  const tk = new AgentToolkit();
  addCrestronTools(tk, {
    host: '192.168.1.2', authToken: 'test-token',
    fetch: mockCrestronFetch({
      '/cws/api/login': { version: '2.0', authkey: 'key123' },
      '/cws/api/rooms': { rooms: [{ id: 1, name: 'Theatre' }, { id: 2, name: 'Bar' }], version: '2.0' }
    })
  });
  const result = JSON.parse(await tk.execute('crestron_list_rooms', {}));
  assert(result.length === 2, `Expected 2 rooms, got ${result.length}`);
  assert(result[0].name === 'Theatre', `Expected Theatre, got ${result[0].name}`);
}

async function testCrestronSetShade() {
  let capturedBody;
  const tk = new AgentToolkit();
  addCrestronTools(tk, {
    host: '192.168.1.2', authToken: 'test-token',
    fetch: async (url, options) => {
      if (url.includes('/login')) return { ok: true, status: 200, body: '{}', json: () => ({ authkey: 'k' }), headers: {} };
      if (url.includes('/shades/SetState')) {
        capturedBody = JSON.parse(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
        return { ok: true, status: 200, body: '{}', json: () => ({ status: 'success' }), headers: {} };
      }
      return { ok: false, status: 404, body: '', json: () => ({}), headers: {} };
    }
  });
  const result = await tk.execute('crestron_set_shade', { shade_id: 20, position: 50 });
  assert(result.includes('50%'), `Expected 50%, got '${result}'`);
  // 50% of 65535 = 32768 (rounded)
  const rawPos = capturedBody.shades[0].position;
  assert(rawPos === 32768 || rawPos === 32767, `Expected ~32768, got ${rawPos}`);
}

async function testCrestronSetLight() {
  let capturedBody;
  const tk = new AgentToolkit();
  addCrestronTools(tk, {
    host: '192.168.1.2', authToken: 'test-token',
    fetch: async (url, options) => {
      if (url.includes('/login')) return { ok: true, status: 200, body: '{}', json: () => ({ authkey: 'k' }), headers: {} };
      if (url.includes('/lights/SetState')) {
        capturedBody = JSON.parse(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
        return { ok: true, status: 200, body: '{}', json: () => ({ status: 'success' }), headers: {} };
      }
      return { ok: false, status: 404, body: '', json: () => ({}), headers: {} };
    }
  });
  const result = await tk.execute('crestron_set_light', { light_id: 10, level: 100 });
  assert(result.includes('100%'), `Expected 100%, got '${result}'`);
  const rawLevel = capturedBody.lights[0].level;
  assert(rawLevel === 65535, `Expected 65535, got ${rawLevel}`);
}

async function testCrestronSetLightClamped() {
  let capturedBody;
  const tk = new AgentToolkit();
  addCrestronTools(tk, {
    host: '192.168.1.2', authToken: 'test-token',
    fetch: async (url, options) => {
      if (url.includes('/login')) return { ok: true, status: 200, body: '{}', json: () => ({ authkey: 'k' }), headers: {} };
      if (url.includes('/lights/SetState')) {
        capturedBody = JSON.parse(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
        return { ok: true, status: 200, body: '{}', json: () => ({ status: 'success' }), headers: {} };
      }
      return { ok: false, status: 404, body: '', json: () => ({}), headers: {} };
    }
  });
  // Should clamp to 0
  await tk.execute('crestron_set_light', { light_id: 10, level: -10 });
  assert(capturedBody.lights[0].level === 0, `Expected 0, got ${capturedBody.lights[0].level}`);
  // Should clamp to 65535
  await tk.execute('crestron_set_light', { light_id: 10, level: 150 });
  assert(capturedBody.lights[0].level === 65535, `Expected 65535, got ${capturedBody.lights[0].level}`);
}

async function testCrestronActivateScene() {
  let calledUrl;
  const tk = new AgentToolkit();
  addCrestronTools(tk, {
    host: '192.168.1.2', authToken: 'test-token',
    fetch: async (url, options) => {
      if (url.includes('/login')) return { ok: true, status: 200, body: '{}', json: () => ({ authkey: 'k' }), headers: {} };
      calledUrl = url;
      return { ok: true, status: 200, body: '{}', json: () => ({ status: 'success' }), headers: {} };
    }
  });
  const result = await tk.execute('crestron_activate_scene', { scene_id: 5 });
  assert(result.includes('activated'), `Expected activated, got '${result}'`);
  assert(calledUrl.includes('/scenes/recall/5'), `Expected recall/5, got ${calledUrl}`);
}

// --- Utility Tools Tests ---

async function testGetCurrentTime() {
  const tk = new AgentToolkit();
  addUtilityTools(tk);
  const result = JSON.parse(await tk.execute('get_current_time', {}));
  assert(result.iso, 'Should have iso');
  assert(result.period, `Should have period, got ${JSON.stringify(result)}`);
  assert(result.dayOfWeek, 'Should have dayOfWeek');
  assert(typeof result.hour === 'number', 'Hour should be number');
}

// --- Tool definition format tests ---

async function testHAToolDefinitions() {
  const tk = new AgentToolkit();
  addHATools(tk, { baseUrl: 'http://test:8123', token: 'tok', fetch: mockFetch({}) });
  const defs = tk.getDefinitions();
  assert(defs.length === 6, `Expected 6 HA tools, got ${defs.length}`);
  for (const def of defs) {
    assert(def.name, 'Each tool needs a name');
    assert(def.description, `${def.name} needs a description`);
    assert(def.input_schema, `${def.name} needs input_schema`);
    assert(def.input_schema.type === 'object', `${def.name} schema must be object type`);
  }
}

async function testCrestronToolDefinitions() {
  const tk = new AgentToolkit();
  addCrestronTools(tk, { host: '192.168.1.2', authToken: 'tok', fetch: mockCrestronFetch({}) });
  const defs = tk.getDefinitions();
  assert(defs.length === 7, `Expected 7 Crestron tools, got ${defs.length}`);
  for (const def of defs) {
    assert(def.name.startsWith('crestron_'), `Tool ${def.name} should start with crestron_`);
  }
}

async function testAllToolsCombined() {
  const tk = new AgentToolkit();
  addHATools(tk, { baseUrl: 'http://test:8123', token: 'tok', fetch: mockFetch({}) });
  addCrestronTools(tk, { host: '192.168.1.2', authToken: 'tok', fetch: mockCrestronFetch({}) });
  addUtilityTools(tk);
  assert(tk.size === 14, `Expected 14 total tools, got ${tk.size}`);
}

// --- Run ---

(async () => {
  console.log('Testing Agent Tools...\n');

  await test('Toolkit: add and getDefinitions', testToolkitAddAndGet);
  await test('Toolkit: execute registered tool', testToolkitExecute);
  await test('Toolkit: execute unknown tool', testToolkitExecuteUnknown);
  await test('Toolkit: execute handles errors', testToolkitExecuteError);
  await test('Toolkit: object results JSON-stringified', testToolkitObjectResult);
  await test('HA: get_state returns formatted state', testHAGetState);
  await test('HA: call_service succeeds', testHACallService);
  await test('HA: blocks master suite lights', testHASafetyMaster);
  await test('HA: blocks security entities', testHASafetySecurity);
  await test('HA: blocks garage (Hard Rule 4)', testHASafetyGarage);
  await test('HA: blocks laundry (Hard Rule 4)', testHASafetyLaundry);
  await test('HA: caps volume at 70%', testHASafetyVolumeCap);
  await test('HA: blocks sensor writes (read-only)', testHASafetyReadOnly);
  await test('HA: search_entities filters correctly', testHASearchEntities);
  await test('HA: set_mode calls correct service', testHASetMode);
  await test('HA: trigger fires script', testHATrigger);
  await test('HA: notify sends notification', testHANotify);
  await test('Crestron: session auth + caching', testCrestronSessionAuth);
  await test('Crestron: list_rooms', testCrestronListRooms);
  await test('Crestron: set_shade percentage conversion', testCrestronSetShade);
  await test('Crestron: set_light percentage conversion', testCrestronSetLight);
  await test('Crestron: set_light clamps values', testCrestronSetLightClamped);
  await test('Crestron: activate_scene', testCrestronActivateScene);
  await test('Utility: get_current_time', testGetCurrentTime);
  await test('HA: tool definition format valid', testHAToolDefinitions);
  await test('Crestron: tool definition format valid', testCrestronToolDefinitions);
  await test('All tools combined = 15', testAllToolsCombined);

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed === 0) {
    console.log('\u2705 All agent tools tests passed!\n');
    process.exit(0);
  } else {
    console.log('\u274c Some tests failed\n');
    process.exit(1);
  }
})();
