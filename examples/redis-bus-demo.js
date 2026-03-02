#!/usr/bin/env node
/**
 * Redis Bus Demo - Real-time AI-to-AI communication
 *
 * Run this on two machines to see Kiro and Claude communicate:
 *   Machine 1 (Kiro):   node examples/redis-bus-demo.js kiro
 *   Machine 2 (Claude): node examples/redis-bus-demo.js claude
 *
 * Or run both in one process (demo mode):
 *   node examples/redis-bus-demo.js demo
 *
 * Requires Redis: redis-server (or Docker: docker run -p 6379:6379 redis)
 * On Villa network: redis-server on Mech Mac (192.168.0.60)
 */
const RedisBus = require('../src/redis-bus');

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const mode = process.argv[2] || 'demo';

async function runKiro(bus) {
  console.log('🤖 Kiro connected to shared bus\n');

  // Listen for Claude's messages
  bus.subscribe('kiro', 'ai.chat', (msg) => {
    console.log(`📨 Kiro received from ${msg.from}: "${msg.text}"`);
  });

  bus.subscribe('kiro', 'code.review.request', (msg) => {
    console.log(`🔍 Kiro: Review requested for "${msg.component}"`);
    console.log(`   Files: ${msg.files.join(', ')}`);
    // Respond
    setTimeout(() => {
      bus.publish('code.review.response', {
        component: msg.component,
        status: 'approved',
        notes: 'Clean implementation, tests passing, solid foundation maintained'
      }, 'kiro');
    }, 500);
  });

  bus.subscribe('kiro', 'todo.update', (msg) => {
    console.log(`📋 Kiro: TODO updated by ${msg.by} — "${msg.task}" is now ${msg.status}`);
  });
}

async function runClaude(bus) {
  console.log('🤖 Claude connected to shared bus\n');

  // Listen for Kiro's messages
  bus.subscribe('claude', 'ai.chat', (msg) => {
    console.log(`📨 Claude received from ${msg.from}: "${msg.text}"`);
  });

  bus.subscribe('claude', 'code.review.response', (msg) => {
    console.log(`✅ Claude: Review for "${msg.component}" — ${msg.status}`);
    console.log(`   Notes: ${msg.notes}`);
  });
}

async function runDemo() {
  console.log('🎬 Redis Bus Demo — Real-time AI-to-AI Communication\n');
  console.log(`Redis: ${REDIS_URL}\n`);

  const kiro = new RedisBus({ url: REDIS_URL, namespace: 'agent-bus' });
  const claude = new RedisBus({ url: REDIS_URL, namespace: 'agent-bus' });

  await kiro.connect();
  await claude.connect();
  console.log('✅ Both AIs connected to shared bus\n');

  await runKiro(kiro);
  await runClaude(claude);

  await new Promise(r => setTimeout(r, 100));

  // Simulate collaboration
  console.log('--- Simulating AI collaboration ---\n');

  // Claude greets Kiro
  claude.publish('ai.chat', { from: 'claude', text: 'Hey Kiro! Just pushed CompoundAgent. Ready for review?' }, 'claude');
  await new Promise(r => setTimeout(r, 50));

  // Kiro responds
  kiro.publish('ai.chat', { from: 'kiro', text: 'On it! Pulling now...' }, 'kiro');
  await new Promise(r => setTimeout(r, 50));

  // Claude requests code review
  claude.publish('code.review.request', {
    component: 'CompoundAgent',
    files: ['src/agents/compound-agent.js', 'test/compound-agent.test.js'],
    tests: '8/8 passing'
  }, 'claude');
  await new Promise(r => setTimeout(r, 700));

  // Claude updates TODO
  claude.publish('todo.update', {
    by: 'claude',
    task: 'CompoundAgent (RAG→Ollama pipeline)',
    status: 'complete'
  }, 'claude');
  await new Promise(r => setTimeout(r, 50));

  // Kiro acknowledges
  kiro.publish('ai.chat', { from: 'kiro', text: 'TODO updated. What\'s next on your end?' }, 'kiro');
  await new Promise(r => setTimeout(r, 50));

  console.log('\n✅ Demo complete!');
  console.log('\nTo use for real:');
  console.log('  1. Start Redis: redis-server (or on Mech Mac)');
  console.log('  2. Kiro:   REDIS_URL=redis://192.168.0.60:6379 node examples/redis-bus-demo.js kiro');
  console.log('  3. Claude: REDIS_URL=redis://192.168.0.60:6379 node examples/redis-bus-demo.js claude');

  await kiro.disconnect();
  await claude.disconnect();
}

// Single-AI mode (for running on separate machines)
async function runSingle(role) {
  const bus = new RedisBus({ url: REDIS_URL, namespace: 'agent-bus' });
  await bus.connect();
  console.log(`✅ ${role} connected to ${REDIS_URL}\n`);

  if (role === 'kiro') {
    await runKiro(bus);
    console.log('Listening... (Ctrl+C to stop)');
    // Keep alive
    process.on('SIGINT', async () => { await bus.disconnect(); process.exit(0); });
  } else {
    await runClaude(bus);
    console.log('Listening... (Ctrl+C to stop)');
    process.on('SIGINT', async () => { await bus.disconnect(); process.exit(0); });
  }
}

if (mode === 'demo') {
  runDemo().catch(err => {
    if (err.message.includes('ECONNREFUSED')) {
      console.log('❌ Redis not running. Start with: redis-server');
      console.log('   Or: docker run -p 6379:6379 redis');
    } else {
      console.error(err.message);
    }
    process.exit(1);
  });
} else {
  runSingle(mode).catch(console.error);
}
