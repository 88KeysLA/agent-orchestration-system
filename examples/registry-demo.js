#!/usr/bin/env node
/**
 * Agent Registry Demo - Versioning and canary deployments
 */
const AgentRegistry = require('../src/registry');

console.log('🎬 Agent Registry Demo - Versioning & Canary Deployments\n');

// Create registry
const registry = new AgentRegistry();

// Register multiple versions of an agent
console.log('📦 Registering agent versions:');

const v1 = {
  execute: (task) => {
    return { version: '1.0.0', result: `Processed by v1: ${task}` };
  }
};

const v2 = {
  execute: (task) => {
    return { version: '2.0.0', result: `Processed by v2 (faster): ${task}`, performance: '+20%' };
  }
};

registry.register('code-agent', '1.0.0', v1, { stable: true });
console.log('  ✅ Registered code-agent@1.0.0');

registry.register('code-agent', '2.0.0', v2, { experimental: true });
console.log('  ✅ Registered code-agent@2.0.0');

// Activate v1
console.log('\n🚀 Deploying v1.0.0 (direct):');
registry.setActive('code-agent', '1.0.0');

for (let i = 0; i < 3; i++) {
  const agent = registry.get('code-agent');
  const result = agent.implementation.execute('task-' + i);
  console.log(`  ${result.result}`);
}

// Start canary deployment
console.log('\n🐤 Starting canary deployment (20% traffic to v2.0.0):');
const deploymentId = registry.startCanary('code-agent', '2.0.0', 20);
console.log(`  Deployment ID: ${deploymentId}`);

const v1Count = { count: 0 };
const v2Count = { count: 0 };

for (let i = 0; i < 10; i++) {
  const agent = registry.get('code-agent');
  const result = agent.implementation.execute('task-' + i);
  if (result.version === '1.0.0') v1Count.count++;
  if (result.version === '2.0.0') v2Count.count++;
  console.log(`  ${result.result}`);
}

console.log(`\n📊 Traffic split: v1=${v1Count.count}, v2=${v2Count.count}`);

// Promote canary
console.log('\n✅ Canary successful! Promoting v2.0.0 to 100%:');
registry.promoteCanary(deploymentId);

for (let i = 0; i < 3; i++) {
  const agent = registry.get('code-agent');
  const result = agent.implementation.execute('task-' + i);
  console.log(`  ${result.result} (${result.performance})`);
}

// Show registry state
console.log('\n📋 Registry state:');
const agents = registry.list();
agents.forEach(agent => {
  console.log(`\n  ${agent.agentId}:`);
  console.log(`    Active version: ${agent.activeVersion}`);
  console.log(`    All versions: ${agent.versions.join(', ')}`);
  console.log(`    Deployment: ${agent.deploymentStrategy}`);
});

console.log('\n✅ Demo complete!');
