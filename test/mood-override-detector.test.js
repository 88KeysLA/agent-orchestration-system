/**
 * Mood Override Detector Tests
 * Uses mocked fetch — no live Home Assistant needed
 */
const MoodOverrideDetector = require('../src/mood-override-detector');

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

function mockHAState(entityId, state, attributes = {}) {
  global.fetch = async (url) => {
    if (url.includes(`/api/states/${entityId}`)) {
      return {
        ok: true, status: 200,
        json: async () => ({ entity_id: entityId, state, attributes })
      };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };
}

function mockHAStates(stateMap) {
  global.fetch = async (url) => {
    for (const [entityId, data] of Object.entries(stateMap)) {
      if (url.includes(`/api/states/${entityId}`)) {
        return {
          ok: true, status: 200,
          json: async () => ({
            entity_id: entityId,
            state: data.state,
            attributes: data.attributes || {}
          })
        };
      }
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };
}

// --- Tests ---

async function testRecordExpectedState() {
  const detector = new MoodOverrideDetector({ token: 'test' });
  detector.recordExpectedState('light.theatre', 200, { room: 'theatre', intent: 'romance' });
  if (detector._expectations.size !== 1) throw new Error(`Expected 1 expectation, got ${detector._expectations.size}`);
  const entry = detector._expectations.get('light.theatre');
  if (entry.expected !== 200) throw new Error(`Wrong expected: ${entry.expected}`);
  if (entry.context.room !== 'theatre') throw new Error(`Wrong room: ${entry.context.room}`);
}

async function testOverrideDetectedAboveThreshold() {
  mockHAState('light.theatre', 'on', { brightness: 100 });
  const overrides = [];
  const detector = new MoodOverrideDetector({
    token: 'test', haUrl: 'http://localhost:8123',
    driftThreshold: 0.1,
    onOverride: (o) => overrides.push(o)
  });
  detector.recordExpectedState('light.theatre', 200, { room: 'theatre', intent: 'romance', timePeriod: 'evening' });
  await detector._checkOverrides();
  if (overrides.length !== 1) throw new Error(`Expected 1 override, got ${overrides.length}`);
  if (overrides[0].entityId !== 'light.theatre') throw new Error(`Wrong entity: ${overrides[0].entityId}`);
  if (overrides[0].expected !== 200) throw new Error(`Wrong expected: ${overrides[0].expected}`);
  if (overrides[0].actual !== 100) throw new Error(`Wrong actual: ${overrides[0].actual}`);
  if (overrides[0].drift <= 0.1) throw new Error(`Drift should be > 0.1: ${overrides[0].drift}`);
}

async function testNoOverrideBelowThreshold() {
  mockHAState('light.theatre', 'on', { brightness: 195 });
  const overrides = [];
  const detector = new MoodOverrideDetector({
    token: 'test', haUrl: 'http://localhost:8123',
    driftThreshold: 0.1,
    onOverride: (o) => overrides.push(o)
  });
  detector.recordExpectedState('light.theatre', 200, { room: 'theatre', intent: 'romance' });
  await detector._checkOverrides();
  if (overrides.length !== 0) throw new Error(`Expected 0 overrides, got ${overrides.length}`);
}

async function testCallbackFires() {
  mockHAState('light.bar', 'off');
  let callbackFired = false;
  const detector = new MoodOverrideDetector({
    token: 'test', haUrl: 'http://localhost:8123',
    onOverride: () => { callbackFired = true; }
  });
  detector.recordExpectedState('light.bar', 'on', {});
  await detector._checkOverrides();
  if (!callbackFired) throw new Error('Callback did not fire');
}

async function testExpiredEntriesCleaned() {
  mockHAState('light.theatre', 'on', { brightness: 200 });
  const detector = new MoodOverrideDetector({
    token: 'test', haUrl: 'http://localhost:8123',
    detectionWindow: 100 // 100ms
  });
  detector.recordExpectedState('light.theatre', 200, { room: 'theatre' });
  // Wait for window to expire
  await new Promise(r => setTimeout(r, 150));
  await detector._checkOverrides();
  if (detector._expectations.size !== 0) throw new Error(`Expected 0 expectations after expiry, got ${detector._expectations.size}`);
}

async function testDriftComputationNumeric() {
  const detector = new MoodOverrideDetector({ token: 'test' });
  // 50% drift
  const drift1 = detector._computeDrift(200, 100);
  if (Math.abs(drift1 - 0.5) > 0.01) throw new Error(`Expected ~0.5 drift, got ${drift1}`);
  // Zero drift
  const drift2 = detector._computeDrift(100, 100);
  if (drift2 !== 0) throw new Error(`Expected 0 drift, got ${drift2}`);
  // Capped at 1.0
  const drift3 = detector._computeDrift(50, 200);
  if (drift3 > 1.0) throw new Error(`Drift should be capped at 1.0, got ${drift3}`);
}

async function testDriftComputationOnOff() {
  const detector = new MoodOverrideDetector({ token: 'test' });
  const drift1 = detector._computeDrift('on', 'off');
  if (drift1 !== 1.0) throw new Error(`Expected 1.0 for on/off mismatch, got ${drift1}`);
  const drift2 = detector._computeDrift('on', 'on');
  if (drift2 !== 0.0) throw new Error(`Expected 0.0 for on/on match, got ${drift2}`);
}

async function testGetOverridesFiltersByTimestamp() {
  const detector = new MoodOverrideDetector({ token: 'test' });
  const now = Date.now();
  detector._overrides = [
    { entityId: 'light.old', detectedAt: now - 60000, drift: 0.5 },
    { entityId: 'light.new', detectedAt: now - 1000, drift: 0.3 }
  ];
  const recent = detector.getOverrides(now - 10000);
  if (recent.length !== 1) throw new Error(`Expected 1 recent override, got ${recent.length}`);
  if (recent[0].entityId !== 'light.new') throw new Error(`Wrong entity: ${recent[0].entityId}`);
  const all = detector.getOverrides();
  if (all.length !== 2) throw new Error(`Expected 2 total overrides, got ${all.length}`);
}

async function testMultipleEntityTracking() {
  mockHAStates({
    'light.theatre': { state: 'on', attributes: { brightness: 50 } },
    'light.bar': { state: 'on', attributes: { brightness: 250 } }
  });
  const overrides = [];
  const detector = new MoodOverrideDetector({
    token: 'test', haUrl: 'http://localhost:8123',
    driftThreshold: 0.1,
    onOverride: (o) => overrides.push(o)
  });
  detector.recordExpectedState('light.theatre', 200, { room: 'theatre' });
  detector.recordExpectedState('light.bar', 200, { room: 'bar' });
  await detector._checkOverrides();
  // Theatre drifted (200→50), bar barely drifted (200→250 = 25% drift)
  if (overrides.length !== 2) throw new Error(`Expected 2 overrides, got ${overrides.length}`);
}

async function testSatisfactionScoreMapping() {
  mockHAState('light.theatre', 'on', { brightness: 100 });
  const overrides = [];
  const detector = new MoodOverrideDetector({
    token: 'test', haUrl: 'http://localhost:8123',
    onOverride: (o) => overrides.push(o)
  });
  detector.recordExpectedState('light.theatre', 200, {});
  await detector._checkOverrides();
  const o = overrides[0];
  // drift = |100-200|/200 = 0.5, satisfaction = round(100 * (1 - 0.5)) = 50
  if (o.satisfaction !== 50) throw new Error(`Expected satisfaction 50, got ${o.satisfaction}`);
}

async function testStopClearsTimer() {
  const detector = new MoodOverrideDetector({ token: 'test' });
  detector.startPolling(100000);
  if (!detector._timer) throw new Error('Timer not started');
  detector.stop();
  if (detector._timer) throw new Error('Timer not stopped');
}

async function testGracefulOnFetchError() {
  global.fetch = async () => { throw new Error('Network down'); };
  const overrides = [];
  const detector = new MoodOverrideDetector({
    token: 'test', haUrl: 'http://localhost:8123',
    onOverride: (o) => overrides.push(o)
  });
  detector.recordExpectedState('light.theatre', 200, {});
  // Should not throw
  await detector._checkOverrides();
  if (overrides.length !== 0) throw new Error(`Should not detect override on error, got ${overrides.length}`);
}

async function testNoTokenSkipsCheck() {
  let fetchCalled = false;
  global.fetch = async () => { fetchCalled = true; return { ok: true, json: async () => ({}) }; };
  const detector = new MoodOverrideDetector({ token: '' });
  detector.recordExpectedState('light.theatre', 200, {});
  await detector._checkOverrides();
  if (fetchCalled) throw new Error('Should not fetch without token');
}

async function testMediaPlayerVolumeExtraction() {
  global.fetch = async (url) => {
    if (url.includes('media_player.theatre')) {
      return {
        ok: true, status: 200,
        json: async () => ({
          entity_id: 'media_player.theatre',
          state: 'playing',
          attributes: { volume_level: 0.4 }
        })
      };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };
  const overrides = [];
  const detector = new MoodOverrideDetector({
    token: 'test', haUrl: 'http://localhost:8123',
    onOverride: (o) => overrides.push(o)
  });
  // Expected 60% volume, actual 40%
  detector.recordExpectedState('media_player.theatre', 60, { room: 'theatre' });
  await detector._checkOverrides();
  if (overrides.length !== 1) throw new Error(`Expected 1 override, got ${overrides.length}`);
  if (overrides[0].actual !== 40) throw new Error(`Expected actual=40, got ${overrides[0].actual}`);
}

async function testOverrideRemovesExpectation() {
  mockHAState('light.theatre', 'off');
  const detector = new MoodOverrideDetector({
    token: 'test', haUrl: 'http://localhost:8123',
    onOverride: () => {}
  });
  detector.recordExpectedState('light.theatre', 'on', {});
  if (detector._expectations.size !== 1) throw new Error('Should have 1 expectation');
  await detector._checkOverrides();
  if (detector._expectations.size !== 0) throw new Error(`Expectation should be removed after override, got ${detector._expectations.size}`);
}

async function testConstructorDefaults() {
  const detector = new MoodOverrideDetector();
  if (detector.driftThreshold !== 0.1) throw new Error(`Wrong threshold: ${detector.driftThreshold}`);
  if (detector.detectionWindow !== 300000) throw new Error(`Wrong window: ${detector.detectionWindow}`);
  if (detector._timer !== null) throw new Error('Timer should be null');
  if (detector._overrides.length !== 0) throw new Error('Overrides should be empty');
}

// --- Run ---

(async () => {
  console.log('Testing Mood Override Detector...\n');

  await test('Records expected state', testRecordExpectedState);
  await test('Override detected above threshold', testOverrideDetectedAboveThreshold);
  await test('No override below threshold', testNoOverrideBelowThreshold);
  await test('Callback fires on override', testCallbackFires);
  await test('Expired entries cleaned up', testExpiredEntriesCleaned);
  await test('Drift computation (numeric)', testDriftComputationNumeric);
  await test('Drift computation (on/off)', testDriftComputationOnOff);
  await test('getOverrides filters by timestamp', testGetOverridesFiltersByTimestamp);
  await test('Multiple entity tracking', testMultipleEntityTracking);
  await test('Satisfaction score mapping', testSatisfactionScoreMapping);
  await test('Stop clears timer', testStopClearsTimer);
  await test('Graceful on fetch error', testGracefulOnFetchError);
  await test('No token skips check', testNoTokenSkipsCheck);
  await test('Media player volume extraction', testMediaPlayerVolumeExtraction);
  await test('Override removes expectation', testOverrideRemovesExpectation);
  await test('Constructor defaults', testConstructorDefaults);

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed === 0) {
    console.log('\u2705 All mood override detector tests passed!\n');
    process.exit(0);
  } else {
    console.log('\u274c Some tests failed\n');
    process.exit(1);
  }
})();
