/**
 * Health Monitor Tests
 */
const HealthMonitor = require('../src/health-monitor');

function test(name, fn) {
  return fn().then(() => {
    console.log(`✅ ${name}`);
  }).catch(err => {
    console.error(`❌ ${name}: ${err.message}`);
    process.exit(1);
  });
}

// Test 1: Register and check healthy agent
async function testHealthyAgent() {
  const monitor = new HealthMonitor({ checkInterval: 100 });
  
  monitor.register('agent-1', async () => true);
  await monitor.checkAll();
  
  const status = monitor.getStatus('agent-1');
  if (status.status !== 'healthy') throw new Error('Agent should be healthy');
  if (status.consecutiveFailures !== 0) throw new Error('Should have 0 failures');
}

// Test 2: Detect unhealthy agent
async function testUnhealthyAgent() {
  const monitor = new HealthMonitor({ checkInterval: 100, unhealthyThreshold: 2 });
  
  monitor.register('agent-1', async () => false);
  
  // First check - degraded
  await monitor.checkAll();
  let status = monitor.getStatus('agent-1');
  if (status.status !== 'degraded') throw new Error('Should be degraded after 1 failure');
  
  // Second check - unhealthy
  await monitor.checkAll();
  status = monitor.getStatus('agent-1');
  if (status.status !== 'unhealthy') throw new Error('Should be unhealthy after 2 failures');
}

// Test 3: Remediation trigger
async function testRemediation() {
  const monitor = new HealthMonitor({ checkInterval: 100, unhealthyThreshold: 2 });
  let remediationCalled = false;
  let remediatedAgent = null;
  
  monitor.onUnhealthy((agentId, agent) => {
    remediationCalled = true;
    remediatedAgent = agentId;
  });
  
  monitor.register('agent-1', async () => false);
  
  // Trigger unhealthy state
  await monitor.checkAll();
  await monitor.checkAll();
  
  if (!remediationCalled) throw new Error('Remediation should be called');
  if (remediatedAgent !== 'agent-1') throw new Error('Wrong agent remediated');
}

// Test 4: Recovery from degraded state
async function testRecovery() {
  const monitor = new HealthMonitor({ checkInterval: 100, unhealthyThreshold: 3 });
  let checkCount = 0;
  
  monitor.register('agent-1', async () => {
    checkCount++;
    return checkCount > 2; // Fail first 2, then succeed
  });
  
  // First check - degraded
  await monitor.checkAll();
  let status = monitor.getStatus('agent-1');
  if (status.status !== 'degraded') throw new Error('Should be degraded');
  
  // Second check - still degraded
  await monitor.checkAll();
  status = monitor.getStatus('agent-1');
  if (status.status !== 'degraded') throw new Error('Should still be degraded');
  
  // Third check - recovered
  await monitor.checkAll();
  status = monitor.getStatus('agent-1');
  if (status.status !== 'healthy') throw new Error('Should recover to healthy');
  if (status.consecutiveFailures !== 0) throw new Error('Failures should reset');
}

// Test 5: Start/stop monitoring
async function testStartStop() {
  const monitor = new HealthMonitor({ checkInterval: 50 });
  let checkCount = 0;
  
  monitor.register('agent-1', async () => {
    checkCount++;
    return true;
  });
  
  monitor.start();
  await new Promise(resolve => setTimeout(resolve, 150));
  monitor.stop();
  
  const checksAfterStop = checkCount;
  await new Promise(resolve => setTimeout(resolve, 100));
  
  if (checkCount === checksAfterStop) {
    // Good, no more checks after stop
  } else {
    throw new Error('Checks should stop after stop()');
  }
}

(async () => {
  await test('Register and check healthy agent', testHealthyAgent);
  await test('Detect unhealthy agent', testUnhealthyAgent);
  await test('Remediation trigger', testRemediation);
  await test('Recovery from degraded state', testRecovery);
  await test('Start/stop monitoring', testStartStop);
  console.log('\n✅ All health monitor tests passed!');
})();
