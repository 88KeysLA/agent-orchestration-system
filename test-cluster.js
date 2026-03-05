// Test if distributed pool sees all nodes
const RedisBus = require('./src/redis-bus');

async function test() {
  const bus = new RedisBus({ url: 'redis://192.168.0.60:6379' });
  await bus.connect();
  
  console.log('Listening for heartbeats...');
  
  const nodes = new Set();
  
  bus.subscribe('test', 'agent.heartbeat', (msg) => {
    nodes.add(msg.name);
    console.log(`[${msg.name}] Heartbeat - ${msg.capabilities?.model || 'no model'}`);
  });
  
  // Listen for 15 seconds
  setTimeout(() => {
    console.log(`\nTotal nodes discovered: ${nodes.size}`);
    console.log('Nodes:', Array.from(nodes));
    process.exit(0);
  }, 15000);
}

test().catch(console.error);
