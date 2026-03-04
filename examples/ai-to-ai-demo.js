#!/usr/bin/env node
/**
 * AI-to-AI Communication Demo
 * Shows how Kiro and Claude can coordinate in real-time via Redis
 */

const RedisBus = require('../src/redis-bus');

async function demo() {
  console.log('🤖 AI-to-AI Communication Demo\n');

  // Create two AI instances
  const kiro = new RedisBus({ url: process.env.REDIS_URL || 'redis://localhost:6379' });
  const claude = new RedisBus({ url: process.env.REDIS_URL || 'redis://localhost:6379' });

  await kiro.connect();
  await claude.connect();
  console.log('✅ Both AI instances connected to Redis\n');

  // Scenario 1: Broadcast coordination
  console.log('📡 Scenario 1: Broadcast Coordination');
  console.log('Kiro announces task completion to all AIs...\n');

  claude.subscribe('claude', 'task.completed', (payload, msg) => {
    console.log(`  Claude received: "${payload.message}" from ${msg.fromAgent}`);
  });

  kiro.publish('task.completed', { 
    message: 'Code review finished, ready for deployment',
    taskId: 'CR-123'
  }, 'kiro');

  await new Promise(r => setTimeout(r, 100));

  // Scenario 2: Request-Response pattern
  console.log('\n📨 Scenario 2: Request-Response Pattern');
  console.log('Claude asks Kiro for status...\n');

  // Kiro listens for status requests
  kiro.subscribe('kiro', 'status.request', (payload, msg) => {
    console.log(`  Kiro received request from ${msg.fromAgent}`);
    // Respond on the responseId channel
    kiro.publish(payload.responseId, {
      status: 'healthy',
      load: 0.3,
      availableAgents: ['gpu-dev', 'prreddy-coder']
    }, 'kiro');
  });

  // Claude makes request
  const response = await claude.request('status.request', {}, 'claude', 2000);
  console.log(`  Claude received response:`, response);

  // Scenario 3: Multi-AI coordination
  console.log('\n🔄 Scenario 3: Multi-AI Workflow Coordination');
  console.log('Kiro delegates subtasks to Claude...\n');

  claude.subscribe('claude', 'task.delegate', (payload, msg) => {
    console.log(`  Claude received delegation: ${payload.task}`);
    // Claude completes and reports back
    setTimeout(() => {
      claude.publish('task.completed', {
        message: `Completed: ${payload.task}`,
        result: 'success'
      }, 'claude');
    }, 50);
  });

  kiro.subscribe('kiro', 'task.completed', (payload, msg) => {
    if (msg.fromAgent === 'claude') {
      console.log(`  Kiro received completion: "${payload.message}"`);
    }
  });

  kiro.publish('task.delegate', {
    task: 'Write API documentation',
    priority: 'high'
  }, 'kiro');

  await new Promise(r => setTimeout(r, 200));

  // Cleanup
  console.log('\n✨ Demo complete! AI-to-AI communication working.\n');
  await kiro.disconnect();
  await claude.disconnect();
}

// Run demo
if (require.main === module) {
  demo().catch(console.error);
}

module.exports = demo;
