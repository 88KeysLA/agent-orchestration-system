#!/usr/bin/env node

const SimpleRL = require('../src/simple-rl');

console.log('🧠 Simple RL Demo\n');

const rl = new SimpleRL();
const agents = ['gpu-dev', 'prreddy-coder', 'music-general'];

console.log('Training agent selection...\n');

// Simulate 100 tasks
for (let i = 0; i < 100; i++) {
  const context = i % 2 === 0 ? 'bug-fix' : 'feature';
  const agent = rl.selectAgent(context, agents);
  
  // Simulate reward (gpu-dev is best for bug-fix, music-general for feature)
  let reward = 0;
  if (context === 'bug-fix' && agent === 'gpu-dev') reward = 100;
  else if (context === 'feature' && agent === 'music-general') reward = 100;
  else reward = 50;
  
  rl.update(context, agent, reward);
  
  if (i % 20 === 0) {
    console.log(`Task ${i}: ${context} → ${agent} (reward: ${reward})`);
  }
}

console.log('\n📊 Final Q-values:');
console.log('Bug-fix context:');
agents.forEach(agent => {
  const q = rl.getQ('bug-fix', agent);
  console.log(`  ${agent}: ${q.toFixed(2)}`);
});

console.log('\nFeature context:');
agents.forEach(agent => {
  const q = rl.getQ('feature', agent);
  console.log(`  ${agent}: ${q.toFixed(2)}`);
});

console.log('\n✅ RL learned optimal agent selection!\n');
