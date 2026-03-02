#!/usr/bin/env node
/**
 * Health Monitor Demo - Real-time monitoring with auto-remediation
 */
const HealthMonitor = require('../src/health-monitor');

console.log('🎬 Health Monitor Demo - Real-time Monitoring\n');

// Create monitor
const monitor = new HealthMonitor({
  checkInterval: 2000,
  unhealthyThreshold: 2
});

// Simulate agents with varying health
let agent1Healthy = true;
let agent2Healthy = true;
let agent3CheckCount = 0;

monitor.register('agent-1', async () => {
  console.log('  🔍 Checking agent-1:', agent1Healthy ? '✅ healthy' : '❌ unhealthy');
  return agent1Healthy;
});

monitor.register('agent-2', async () => {
  console.log('  🔍 Checking agent-2:', agent2Healthy ? '✅ healthy' : '❌ unhealthy');
  return agent2Healthy;
});

monitor.register('agent-3', async () => {
  agent3CheckCount++;
  const healthy = agent3CheckCount % 3 !== 0; // Fails every 3rd check
  console.log('  🔍 Checking agent-3:', healthy ? '✅ healthy' : '❌ unhealthy');
  return healthy;
});

// Add remediation handler
monitor.onUnhealthy((agentId, agent) => {
  console.log(`\n🚨 REMEDIATION TRIGGERED for ${agentId}`);
  console.log(`   Status: ${agent.status}`);
  console.log(`   Consecutive failures: ${agent.consecutiveFailures}`);
  console.log(`   Last healthy: ${agent.lastHealthy ? new Date(agent.lastHealthy).toISOString() : 'never'}`);
  console.log('   Action: Restarting agent...\n');
  
  // Simulate remediation
  if (agentId === 'agent-1') agent1Healthy = true;
  if (agentId === 'agent-2') agent2Healthy = true;
});

// Start monitoring
console.log('🚀 Starting health monitoring...\n');
monitor.start();

// Simulate agent failures
setTimeout(() => {
  console.log('\n💥 Simulating agent-1 failure...\n');
  agent1Healthy = false;
}, 3000);

setTimeout(() => {
  console.log('\n💥 Simulating agent-2 failure...\n');
  agent2Healthy = false;
}, 5000);

// Show status after 10 seconds
setTimeout(() => {
  console.log('\n📊 Final Status:');
  const status = monitor.getStatus();
  Object.entries(status).forEach(([agentId, info]) => {
    console.log(`\n  ${agentId}:`);
    console.log(`    Status: ${info.status}`);
    console.log(`    Consecutive failures: ${info.consecutiveFailures}`);
    console.log(`    Last check: ${new Date(info.lastCheck).toISOString()}`);
  });
  
  monitor.stop();
  console.log('\n✅ Demo complete!');
}, 12000);
