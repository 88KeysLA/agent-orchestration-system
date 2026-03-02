/**
 * RedisBus Tests — uses mock so no live Redis needed
 */
const EventEmitter = require('events');
const Module = require('module');

// --- Mock Redis ---
const instances = new Set();

class MockRedis extends EventEmitter {
  constructor() {
    super();
    this._channels = new Set();
    instances.add(this);
  }
  async connect() { return this; }
  async quit() { instances.delete(this); return 'OK'; }
  subscribe(ch) { this._channels.add(ch); return Promise.resolve(); }
  unsubscribe(ch) { this._channels.delete(ch); return Promise.resolve(); }
  publish(channel, message) {
    instances.forEach(inst => {
      if (inst._channels.has(channel)) {
        setImmediate(() => inst.emit('message', channel, message));
      }
    });
    return Promise.resolve(1);
  }
}

// Patch ioredis
const orig = Module._load;
Module._load = (req, ...args) => req === 'ioredis' ? MockRedis : orig(req, ...args);
const RedisBus = require('../src/redis-bus');
Module._load = orig;

// --- Test runner ---
let passed = 0, failed = 0;
function test(name, fn) {
  return fn().then(() => { console.log(`✅ ${name}`); passed++; })
    .catch(err => { console.error(`❌ ${name}: ${err.message}`); failed++; });
}

// Tests
async function run() {
  await test('Connect and disconnect', async () => {
    const bus = new RedisBus();
    await bus.connect();
    if (!bus.connected) throw new Error('Should be connected');
    await bus.disconnect();
    if (bus.connected) throw new Error('Should be disconnected');
  });

  await test('Subscribe and publish', async () => {
    const bus = new RedisBus({ namespace: 'test' });
    await bus.connect();
    let received = null;
    bus.subscribe('kiro', 'ai.updates', (payload) => { received = payload; });
    await new Promise(r => setTimeout(r, 10));
    bus.publish('ai.updates', { text: 'hello from claude' }, 'claude');
    await new Promise(r => setTimeout(r, 20));
    if (!received || received.text !== 'hello from claude') throw new Error('Wrong payload');
    await bus.disconnect();
  });

  await test('Multiple subscribers on same topic', async () => {
    const bus = new RedisBus({ namespace: 'test2' });
    await bus.connect();
    let count = 0;
    bus.subscribe('kiro', 'events', () => count++);
    bus.subscribe('claude', 'events', () => count++);
    await new Promise(r => setTimeout(r, 10));
    bus.publish('events', { type: 'task.done' }, 'system');
    await new Promise(r => setTimeout(r, 20));
    if (count !== 2) throw new Error(`Expected 2, got ${count}`);
    await bus.disconnect();
  });

  await test('Namespace isolation', async () => {
    const bus1 = new RedisBus({ namespace: 'ns1' });
    const bus2 = new RedisBus({ namespace: 'ns2' });
    await bus1.connect();
    await bus2.connect();
    let received = false;
    bus2.subscribe('agent', 'updates', () => { received = true; });
    await new Promise(r => setTimeout(r, 10));
    bus1.publish('updates', { text: 'ns1 only' }, 'agent');
    await new Promise(r => setTimeout(r, 20));
    if (received) throw new Error('Cross-namespace leak');
    await bus1.disconnect();
    await bus2.disconnect();
  });

  await test('Message includes metadata', async () => {
    const bus = new RedisBus({ namespace: 'test3' });
    await bus.connect();
    let meta = null;
    bus.subscribe('kiro', 'tasks', (payload, msg) => { meta = msg; });
    await new Promise(r => setTimeout(r, 10));
    bus.publish('tasks', { task: 'build feature' }, 'claude');
    await new Promise(r => setTimeout(r, 20));
    if (!meta) throw new Error('No metadata');
    if (meta.fromAgent !== 'claude') throw new Error('Wrong fromAgent');
    if (!meta.timestamp) throw new Error('Missing timestamp');
    await bus.disconnect();
  });

  await test('Two buses communicate (cross-process simulation)', async () => {
    const kiro = new RedisBus({ namespace: 'collab' });
    const claude = new RedisBus({ namespace: 'collab' });
    await kiro.connect();
    await claude.connect();

    let kiroReceived = null;
    let claudeReceived = null;

    kiro.subscribe('kiro', 'ai.chat', (payload) => { kiroReceived = payload; });
    claude.subscribe('claude', 'ai.chat', (payload) => { claudeReceived = payload; });

    await new Promise(r => setTimeout(r, 10));
    claude.publish('ai.chat', { from: 'claude', msg: 'Hey Kiro!' }, 'claude');
    kiro.publish('ai.chat', { from: 'kiro', msg: 'Hey Claude!' }, 'kiro');
    await new Promise(r => setTimeout(r, 30));

    if (!kiroReceived) throw new Error('Kiro did not receive');
    if (!claudeReceived) throw new Error('Claude did not receive');
    await kiro.disconnect();
    await claude.disconnect();
  });

  await test('Self-exclusion: publisher does not receive own message', async () => {
    const bus = new RedisBus({ namespace: 'test-self' });
    await bus.connect();
    let received = false;
    bus.subscribe('claude', 'updates', () => { received = true; });
    await new Promise(r => setTimeout(r, 10));
    // claude publishes as claude — should NOT receive own message
    bus.publish('updates', { text: 'self test' }, 'claude');
    await new Promise(r => setTimeout(r, 30));
    if (received) throw new Error('Publisher received own message');
    await bus.disconnect();
  });

  await test('Self-exclusion: other agent still receives', async () => {
    const bus = new RedisBus({ namespace: 'test-self2' });
    await bus.connect();
    let kiroReceived = false;
    let claudeReceived = false;
    bus.subscribe('kiro', 'updates', () => { kiroReceived = true; });
    bus.subscribe('claude', 'updates', () => { claudeReceived = true; });
    await new Promise(r => setTimeout(r, 10));
    bus.publish('updates', { text: 'hello' }, 'claude');
    await new Promise(r => setTimeout(r, 30));
    if (!kiroReceived) throw new Error('Other agent did not receive');
    if (claudeReceived) throw new Error('Sender received own message');
    await bus.disconnect();
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) { console.log('❌ Some tests failed'); process.exit(1); }
  else console.log('✅ All Redis bus tests passed!');
}

run();
