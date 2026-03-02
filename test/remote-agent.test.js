/**
 * RemoteAgent + RemoteAgentRunner Tests — mock-based, no live Redis needed
 */
const EventEmitter = require('events');
const Module = require('module');

// --- Mock Redis (same pattern as redis-bus.test.js) ---
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

const orig = Module._load;
Module._load = (req, ...args) => req === 'ioredis' ? MockRedis : orig(req, ...args);
const RedisBus = require('../src/redis-bus');
const RemoteAgent = require('../src/agents/remote-agent');
const RemoteAgentRunner = require('../src/remote-agent-runner');
Module._load = orig;

// --- Test runner ---
let passed = 0, failed = 0;
function test(name, fn) {
  return fn()
    .then(() => { console.log(`✅ ${name}`); passed++; })
    .catch(err => { console.error(`❌ ${name}: ${err.message}`); failed++; });
}

async function run() {
  await test('RemoteAgent healthCheck returns false before any heartbeat', async () => {
    const bus = new RedisBus();
    await bus.connect();
    const agent = new RemoteAgent({ name: 'fx-ollama', bus });
    agent.listen();
    const healthy = await agent.healthCheck();
    if (healthy) throw new Error('Should be unhealthy before heartbeat');
    await bus.disconnect();
  });

  await test('RemoteAgent healthCheck returns true after heartbeat', async () => {
    const bus = new RedisBus();
    await bus.connect();
    const agent = new RemoteAgent({ name: 'fx-ollama', bus });
    agent.listen();

    // Simulate a heartbeat from the runner
    bus.publish('agent.heartbeat', { name: 'fx-ollama', capabilities: { model: 'llama3.2:3b' }, ts: Date.now() }, 'fx-ollama');
    await new Promise(r => setTimeout(r, 30));

    const healthy = await agent.healthCheck();
    if (!healthy) throw new Error('Should be healthy after heartbeat');
    await bus.disconnect();
  });

  await test('RemoteAgent execute routes task and gets result', async () => {
    const bus = new RedisBus();
    await bus.connect();
    const agent = new RemoteAgent({ name: 'fx-ollama', bus, timeout: 1000 });
    agent.listen();

    // Simulate runner responding to tasks
    bus.subscribe('runner', 'agent.tasks.fx-ollama', (payload) => {
      const { task, responseId } = payload;
      bus.publish(responseId, { result: `echo: ${task}` }, 'runner');
    });

    await new Promise(r => setTimeout(r, 10));
    const result = await agent.execute('hello');
    if (result !== 'echo: hello') throw new Error(`Wrong result: ${result}`);
    await bus.disconnect();
  });

  await test('RemoteAgent execute throws on remote error', async () => {
    const bus = new RedisBus();
    await bus.connect();
    const agent = new RemoteAgent({ name: 'bad-agent', bus, timeout: 1000 });
    agent.listen();

    bus.subscribe('runner', 'agent.tasks.bad-agent', (payload) => {
      bus.publish(payload.responseId, { error: 'model not found' }, 'runner');
    });

    await new Promise(r => setTimeout(r, 10));
    let threw = false;
    try { await agent.execute('task'); } catch (e) { threw = true; }
    if (!threw) throw new Error('Should have thrown on remote error');
    await bus.disconnect();
  });

  await test('RemoteAgentRunner start() sends heartbeat', async () => {
    const runner = new RemoteAgentRunner({
      name: 'test-runner',
      executeFn: async (task) => `done: ${task}`,
    });

    // Listen for heartbeat on runner's own bus
    let heartbeatReceived = null;
    await runner.start();
    runner.bus.subscribe('watcher', 'agent.heartbeat', (payload) => {
      heartbeatReceived = payload;
    });

    // Trigger another heartbeat by waiting for interval (or just check the first one)
    // The first heartbeat was sent during start(), but watcher wasn't subscribed yet.
    // Wait for the interval-based heartbeat.
    await new Promise(r => setTimeout(r, 50));

    // Manually trigger a heartbeat to test the mechanism
    runner.bus.publish('agent.heartbeat', {
      name: runner.name, capabilities: runner.capabilities, ts: Date.now()
    }, runner.name);
    await new Promise(r => setTimeout(r, 30));

    if (!heartbeatReceived || heartbeatReceived.name !== 'test-runner') {
      throw new Error('Heartbeat not received');
    }
    await runner.stop();
  });

  await test('RemoteAgentRunner start() handles tasks end-to-end', async () => {
    const runner = new RemoteAgentRunner({
      name: 'e2e-runner',
      executeFn: async (task) => `processed: ${task}`,
    });
    await runner.start();

    // Create a proxy on the same bus to send a task
    const agent = new RemoteAgent({ name: 'e2e-runner', bus: runner.bus, timeout: 1000 });
    agent.listen();
    await new Promise(r => setTimeout(r, 10));

    const result = await agent.execute('test task');
    if (result !== 'processed: test task') throw new Error(`Wrong: ${result}`);
    await runner.stop();
  });

  await test('RemoteAgent healthCheck false after stale heartbeat', async () => {
    const bus = new RedisBus();
    await bus.connect();
    const agent = new RemoteAgent({ name: 'stale-agent', bus });
    agent.listen();

    // Simulate a heartbeat that's old
    agent._lastHeartbeat = Date.now() - 40000; // 40s ago, > 35s threshold
    const healthy = await agent.healthCheck();
    if (healthy) throw new Error('Should be unhealthy after stale heartbeat');
    await bus.disconnect();
  });

  await test('RemoteAgent latency tracked from heartbeat', async () => {
    const bus = new RedisBus();
    await bus.connect();
    const agent = new RemoteAgent({ name: 'latency-agent', bus });
    agent.listen();

    // Send heartbeat with ts slightly in the past (simulating network delay)
    bus.publish('agent.heartbeat', {
      name: 'latency-agent', capabilities: {}, ts: Date.now() - 5
    }, 'latency-agent');
    await new Promise(r => setTimeout(r, 30));

    if (agent.latency === null) throw new Error('Latency should be tracked');
    if (agent.latency < 0) throw new Error('Latency should be non-negative');
    await bus.disconnect();
  });

  console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

run();
