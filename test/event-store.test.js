/**
 * Event Store Tests
 */
const EventStore = require('../src/event-store');
const fs = require('fs');
const path = require('path');
const os = require('os');

function test(name, fn) {
  try {
    fn();
    console.log(`✅ ${name}`);
  } catch (err) {
    console.error(`❌ ${name}: ${err.message}`);
    process.exit(1);
  }
}

async function asyncTest(name, fn) {
  try {
    await fn();
    console.log(`✅ ${name}`);
  } catch (err) {
    console.error(`❌ ${name}: ${err.message}`);
    process.exit(1);
  }
}

// Test 1: Append and retrieve events
test('Append and retrieve events', () => {
  const store = new EventStore();
  store.append('task-1', 'TASK_CREATED', { name: 'Build feature' });
  store.append('task-1', 'TASK_STARTED', { startedBy: 'agent-1' });
  
  const events = store.getEvents('task-1');
  if (events.length !== 2) throw new Error('Expected 2 events');
  if (events[0].eventType !== 'TASK_CREATED') throw new Error('Wrong event type');
});

// Test 2: Replay events to rebuild state
test('Replay events to rebuild state', () => {
  const store = new EventStore();
  store.append('task-1', 'TASK_CREATED', { name: 'Build feature' });
  store.append('task-1', 'TASK_STARTED', { startedBy: 'agent-1' });
  store.append('task-1', 'TASK_COMPLETED', { completedBy: 'agent-1' });
  
  const reducer = (state, event) => {
    if (event.eventType === 'TASK_CREATED') return { ...state, name: event.data.name, status: 'created' };
    if (event.eventType === 'TASK_STARTED') return { ...state, status: 'started' };
    if (event.eventType === 'TASK_COMPLETED') return { ...state, status: 'completed' };
    return state;
  };
  
  const state = store.replay('task-1', reducer, {});
  if (state.status !== 'completed') throw new Error('Wrong final state');
  if (state.name !== 'Build feature') throw new Error('Lost task name');
});

// Test 3: Time travel debugging
async function testTimeTravel() {
  const store = new EventStore();
  const event1 = store.append('task-1', 'TASK_CREATED', { name: 'Build feature' });
  const t1 = event1.timestamp;
  
  // Wait to ensure different timestamp
  await new Promise(resolve => setTimeout(resolve, 10));
  
  store.append('task-1', 'TASK_STARTED', { startedBy: 'agent-1' });
  
  const reducer = (state, event) => {
    if (event.eventType === 'TASK_CREATED') return { ...state, status: 'created' };
    if (event.eventType === 'TASK_STARTED') return { ...state, status: 'started' };
    return state;
  };
  
  // State at t1 should only have TASK_CREATED
  const stateAtT1 = store.getStateAt('task-1', t1, reducer, {});
  if (stateAtT1.status !== 'created') throw new Error('Time travel failed');
}

// Test 4: Event subscriptions
test('Subscribe to events', () => {
  const store = new EventStore();
  let notified = false;
  
  store.subscribe('TASK_CREATED', (event) => {
    notified = true;
    if (event.data.name !== 'Build feature') throw new Error('Wrong event data');
  });
  
  store.append('task-1', 'TASK_CREATED', { name: 'Build feature' });
  if (!notified) throw new Error('Subscriber not notified');
});

// Test 5: Persistence — save and load
async function testPersistence() {
  const tmpFile = path.join(os.tmpdir(), `event-store-test-${Date.now()}.json`);
  try {
    const store1 = new EventStore({ persistPath: tmpFile });
    store1.append('task-1', 'TASK_CREATED', { name: 'Test' });
    store1.append('task-1', 'TASK_COMPLETED', { result: 'ok' });
    store1.flush();

    // Load into new store
    const store2 = new EventStore({ persistPath: tmpFile });
    const events = store2.getEvents('task-1');
    if (events.length !== 2) throw new Error(`Expected 2 events, got ${events.length}`);
    if (events[0].eventType !== 'TASK_CREATED') throw new Error('Wrong event type');
    if (events[1].data.result !== 'ok') throw new Error('Wrong event data');
  } finally {
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
  }
}

// Test 6: No persistence by default
function testNoPersistence() {
  const store = new EventStore();
  store.append('task-1', 'TASK_CREATED', { name: 'Test' });
  store.flush(); // should not throw
}

// Test 7: Corrupt file recovery
function testCorruptFile() {
  const tmpFile = path.join(os.tmpdir(), `event-store-corrupt-${Date.now()}.json`);
  try {
    fs.writeFileSync(tmpFile, 'NOT VALID JSON!!!');
    const store = new EventStore({ persistPath: tmpFile });
    if (store.events.length !== 0) throw new Error('Should start fresh on corrupt file');
  } finally {
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
  }
}

// Test 8: Missing file starts fresh
function testMissingFile() {
  const store = new EventStore({ persistPath: '/tmp/nonexistent-event-store-12345.json' });
  if (store.events.length !== 0) throw new Error('Should start with empty events');
}

// Test 9: Max persisted events trimming
async function testMaxEvents() {
  const tmpFile = path.join(os.tmpdir(), `event-store-max-${Date.now()}.json`);
  try {
    const store = new EventStore({ persistPath: tmpFile, maxPersistedEvents: 3 });
    for (let i = 0; i < 5; i++) {
      store.append('task-1', `EVENT_${i}`, { i });
    }
    store.flush();

    // Load — should have only last 3
    const store2 = new EventStore({ persistPath: tmpFile });
    if (store2.events.length !== 3) throw new Error(`Expected 3, got ${store2.events.length}`);
    if (store2.events[0].data.i !== 2) throw new Error(`First event should be i=2, got ${store2.events[0].data.i}`);
  } finally {
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
  }
}

// Test 10: Debounced save (rapid appends batch)
async function testDebouncedSave() {
  const tmpFile = path.join(os.tmpdir(), `event-store-debounce-${Date.now()}.json`);
  try {
    const store = new EventStore({ persistPath: tmpFile });
    // Rapid appends
    store.append('task-1', 'A', {});
    store.append('task-1', 'B', {});
    store.append('task-1', 'C', {});

    // File shouldn't exist yet (debounce pending)
    // Wait for debounce timer
    await new Promise(r => setTimeout(r, 150));

    // Now it should be saved
    if (!fs.existsSync(tmpFile)) throw new Error('File should exist after debounce');
    const data = JSON.parse(fs.readFileSync(tmpFile, 'utf8'));
    if (data.events.length !== 3) throw new Error(`Expected 3 events in file, got ${data.events.length}`);
    store.flush();
  } finally {
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
  }
}

(async () => {
  await asyncTest('Time travel to specific timestamp', testTimeTravel);
  await asyncTest('Persistence: save and load', testPersistence);
  test('No persistence by default', testNoPersistence);
  test('Corrupt file recovery', testCorruptFile);
  test('Missing file starts fresh', testMissingFile);
  await asyncTest('Max persisted events trimming', testMaxEvents);
  await asyncTest('Debounced save batches appends', testDebouncedSave);
  console.log('\n✅ All event store tests passed!');
})();

