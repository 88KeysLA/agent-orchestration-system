/**
 * Multi-Machine Demo — shows distributed agent execution across Villa Macs
 *
 * Simulates FX Mac (.61) and Show Mac (.62) as remote agents,
 * with Mech Mac (.60) as the orchestrator.
 *
 * Real usage:
 *   # On FX Mac (192.168.0.61):
 *   REDIS_URL=redis://192.168.0.60:6379 node src/remote-agent-runner.js \
 *     --name fx-ollama --model llama3.2:3b
 *
 *   # On Show Mac (192.168.0.62):
 *   REDIS_URL=redis://192.168.0.60:6379 node src/remote-agent-runner.js \
 *     --name show-runner --model llama3.2:1b
 *
 *   # On Mech Mac (orchestrator):
 *   REDIS_URL=redis://192.168.0.60:6379 node examples/multi-machine-demo.js
 */
const RedisBus = require('../src/redis-bus');
const RemoteAgent = require('../src/agents/remote-agent');

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

async function simulateRemoteRunner(bus, name, model) {
  bus.subscribe(name, `agent.tasks.${name}`, async (payload) => {
    console.log(`  [${name}] received task: "${payload.task}"`);
    await new Promise(r => setTimeout(r, 100)); // simulate inference
    bus.publish(payload.responseId, {
      result: `[${name}/${model}] ${payload.task} → done`
    }, name);
  });

  // Send initial heartbeat
  bus.publish('agent.heartbeat', {
    name,
    capabilities: { model, machine: name.split('-')[0] },
    ts: Date.now()
  }, name);
}

async function main() {
  console.log('🌐 Multi-Machine Agent Mesh Demo');
  console.log(`Redis: ${REDIS_URL}\n`);

  const bus = new RedisBus({ url: REDIS_URL });
  await bus.connect();
  console.log('✅ Connected to Redis\n');

  // --- Simulate remote runners (in real use, these run on other Macs) ---
  console.log('🖥️  Simulating remote agents:');
  console.log('   FX Mac (192.168.0.61) — fx-ollama (llama3.2:3b)');
  console.log('   Show Mac (192.168.0.62) — show-runner (llama3.2:1b)\n');

  await simulateRemoteRunner(bus, 'fx-ollama', 'llama3.2:3b');
  await simulateRemoteRunner(bus, 'show-runner', 'llama3.2:1b');

  // --- Set up proxy agents on orchestrator ---
  const fxAgent = new RemoteAgent({ name: 'fx-ollama', bus, timeout: 5000 });
  const showAgent = new RemoteAgent({ name: 'show-runner', bus, timeout: 5000 });
  fxAgent.listen();
  showAgent.listen();

  await new Promise(r => setTimeout(r, 50)); // wait for heartbeats

  // --- Health check ---
  console.log('💓 Health checks:');
  console.log(`   fx-ollama:    ${await fxAgent.healthCheck() ? '✅ alive' : '❌ dead'}`);
  console.log(`   show-runner:  ${await showAgent.healthCheck() ? '✅ alive' : '❌ dead'}`);
  console.log();

  // --- Execute tasks across machines ---
  console.log('🚀 Dispatching tasks across Villa network:\n');

  const tasks = [
    { agent: fxAgent, name: 'fx-ollama', task: 'Analyze chord progression in C major' },
    { agent: showAgent, name: 'show-runner', task: 'Generate visual concept for track' },
    { agent: fxAgent, name: 'fx-ollama', task: 'Suggest mix improvements' },
  ];

  for (const { agent, name, task } of tasks) {
    console.log(`📤 Orchestrator → ${name}: "${task}"`);
    const result = await agent.execute(task);
    console.log(`📥 Result: ${result}\n`);
  }

  // --- Parallel execution ---
  console.log('⚡ Parallel execution across both machines:');
  const [r1, r2] = await Promise.all([
    fxAgent.execute('parallel task A'),
    showAgent.execute('parallel task B'),
  ]);
  console.log(`   fx-ollama:   ${r1}`);
  console.log(`   show-runner: ${r2}`);

  console.log('\n✅ Demo complete!');
  console.log('\nTo deploy for real:');
  console.log('  scp src/remote-agent-runner.js src/redis-bus.js user@192.168.0.61:~/');
  console.log('  ssh user@192.168.0.61 "REDIS_URL=redis://192.168.0.60:6379 node remote-agent-runner.js --name fx-ollama"');

  await bus.disconnect();
}

main().catch(err => { console.error(err); process.exit(1); });
