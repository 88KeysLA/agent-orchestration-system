/**
 * Dynamic Replanner Tests
 */
const DynamicReplanner = require('../src/replanner');

function test(name, fn) {
  return fn().then(() => {
    console.log(`✅ ${name}`);
  }).catch(err => {
    console.error(`❌ ${name}: ${err.message}`);
    process.exit(1);
  });
}

// Test 1: Create and execute plan
async function testBasicExecution() {
  const replanner = new DynamicReplanner();
  
  const plan = replanner.createPlan('plan-1', [
    { action: 'step1' },
    { action: 'step2' }
  ], 'Complete task');
  
  if (plan.status !== 'active') throw new Error('Plan should be active');
  if (plan.currentStep !== 0) throw new Error('Should start at step 0');
  
  const result1 = await replanner.executeStep('plan-1', async (step) => {
    return { success: true };
  });
  
  if (!result1.success) throw new Error('Step should succeed');
  
  const status = replanner.getStatus('plan-1');
  if (status.currentStep !== 1) throw new Error('Should advance to step 1');
}

// Test 2: Replan on failure
async function testReplanOnFailure() {
  const replanner = new DynamicReplanner();
  
  replanner.createPlan('plan-1', [
    { action: 'step1' },
    { action: 'step2' },
    { action: 'step3' }
  ], 'Complete task');
  
  // First step succeeds
  await replanner.executeStep('plan-1', async () => ({ success: true }));
  
  // Second step fails
  const result = await replanner.executeStep('plan-1', async () => {
    throw new Error('Step failed');
  });
  
  if (!result.needsReplan) throw new Error('Should need replan');
  if (result.reason !== 'step_failed') throw new Error('Wrong replan reason');
  
  // Replan remaining steps
  replanner.replan('plan-1', [
    { action: 'recovery' },
    { action: 'step3-retry' }
  ], 'step_failed');
  
  const status = replanner.getStatus('plan-1');
  if (status.replans !== 1) throw new Error('Should have 1 replan');
}

// Test 3: Replan on slow progress
async function testReplanOnSlowProgress() {
  const replanner = new DynamicReplanner({ replanThreshold: 0.5 });
  
  replanner.createPlan('plan-1', [
    { action: 'step1' },
    { action: 'step2' }
  ], 'Complete task');
  
  const result = await replanner.executeStep('plan-1', async () => {
    return { success: true, progress: 0.2 }; // Slow progress
  });
  
  if (!result.needsReplan) throw new Error('Should need replan due to slow progress');
  if (result.reason !== 'slow_progress') throw new Error('Wrong replan reason');
}

// Test 4: Max replans limit
async function testMaxReplans() {
  const replanner = new DynamicReplanner({ maxReplans: 2 });
  
  replanner.createPlan('plan-1', [
    { action: 'step1' },
    { action: 'step2' },
    { action: 'step3' }
  ], 'Complete task');
  
  // Fail and replan twice
  for (let i = 0; i < 2; i++) {
    await replanner.executeStep('plan-1', async () => {
      throw new Error('Failed');
    });
    replanner.replan('plan-1', [{ action: 'retry' }], 'failed');
  }
  
  // Third failure should not trigger replan
  const result = await replanner.executeStep('plan-1', async () => {
    throw new Error('Failed');
  });
  
  const status = replanner.getStatus('plan-1');
  if (status.replans !== 2) throw new Error('Should have exactly 2 replans');
}

// Test 5: Plan completion
async function testCompletion() {
  const replanner = new DynamicReplanner();
  
  replanner.createPlan('plan-1', [
    { action: 'step1' },
    { action: 'step2' }
  ], 'Complete task');
  
  await replanner.executeStep('plan-1', async () => ({ success: true }));
  await replanner.executeStep('plan-1', async () => ({ success: true }));
  
  const result = await replanner.executeStep('plan-1', async () => ({ success: true }));
  
  if (!result.completed) throw new Error('Plan should be completed');
  
  const status = replanner.getStatus('plan-1');
  if (status.status !== 'completed') throw new Error('Status should be completed');
}

// Test 6: History tracking
async function testHistory() {
  const replanner = new DynamicReplanner();
  
  replanner.createPlan('plan-1', [
    { action: 'step1' },
    { action: 'step2' }
  ], 'Complete task');
  
  await replanner.executeStep('plan-1', async () => ({ success: true }));
  replanner.replan('plan-1', [{ action: 'new-step' }], 'test');
  
  const history = replanner.getHistory('plan-1');
  if (history.length !== 2) throw new Error('Should have 2 history entries');
  if (history[0].action !== 'step1') throw new Error('Wrong history');
  if (history[1].type !== 'replan') throw new Error('Should have replan in history');
}

(async () => {
  await test('Create and execute plan', testBasicExecution);
  await test('Replan on failure', testReplanOnFailure);
  await test('Replan on slow progress', testReplanOnSlowProgress);
  await test('Max replans limit', testMaxReplans);
  await test('Plan completion', testCompletion);
  await test('History tracking', testHistory);
  console.log('\n✅ All replanner tests passed!');
})();
