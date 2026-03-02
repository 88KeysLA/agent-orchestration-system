/**
 * Event Store Tests
 */
const EventStore = require('../src/event-store');

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

(async () => {
  await asyncTest('Time travel to specific timestamp', testTimeTravel);
  console.log('\n✅ All event store tests passed!');
})();

