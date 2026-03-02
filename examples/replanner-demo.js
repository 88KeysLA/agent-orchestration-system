#!/usr/bin/env node
/**
 * Dynamic Replanner Demo - Adaptive execution
 */
const DynamicReplanner = require('../src/replanner');

console.log('🎬 Dynamic Replanner Demo - Adaptive Execution\n');

const replanner = new DynamicReplanner({
  replanThreshold: 0.4,
  maxReplans: 3
});

// Create deployment plan
console.log('📋 Initial Plan: Deploy Application\n');
const plan = replanner.createPlan('deploy-app', [
  { action: 'build', description: 'Build application' },
  { action: 'test', description: 'Run tests' },
  { action: 'deploy-staging', description: 'Deploy to staging' },
  { action: 'smoke-test', description: 'Run smoke tests' },
  { action: 'deploy-prod', description: 'Deploy to production' }
], 'Deploy application to production');

console.log('Steps:');
plan.steps.forEach((step, i) => {
  console.log(`  ${i + 1}. ${step.description}`);
});

// Execute plan with adaptive behavior
async function executePlan() {
  console.log('\n🚀 Executing Plan:\n');
  
  let stepNum = 1;
  
  // Step 1: Build succeeds
  console.log(`Step ${stepNum}: Build application`);
  let result = await replanner.executeStep('deploy-app', async (step) => {
    console.log('  ✅ Build successful');
    return { success: true };
  });
  stepNum++;
  
  // Step 2: Tests fail
  console.log(`\nStep ${stepNum}: Run tests`);
  result = await replanner.executeStep('deploy-app', async (step) => {
    console.log('  ❌ Tests failed (3 failures detected)');
    throw new Error('Tests failed');
  });
  
  if (result.needsReplan) {
    console.log(`\n🔄 REPLANNING: ${result.reason}`);
    console.log('  New strategy: Fix tests, then retry');
    
    replanner.replan('deploy-app', [
      { action: 'fix-tests', description: 'Fix failing tests' },
      { action: 'test-retry', description: 'Retry tests' },
      { action: 'deploy-staging', description: 'Deploy to staging' },
      { action: 'smoke-test', description: 'Run smoke tests' },
      { action: 'deploy-prod', description: 'Deploy to production' }
    ], result.reason);
    
    const status = replanner.getStatus('deploy-app');
    console.log(`  Replans: ${status.replans}/${replanner.maxReplans}`);
  }
  
  // Step 3: Fix tests
  console.log(`\nStep ${stepNum}: Fix failing tests`);
  result = await replanner.executeStep('deploy-app', async (step) => {
    console.log('  ✅ Tests fixed');
    return { success: true };
  });
  stepNum++;
  
  // Step 4: Retry tests
  console.log(`\nStep ${stepNum}: Retry tests`);
  result = await replanner.executeStep('deploy-app', async (step) => {
    console.log('  ✅ All tests passing');
    return { success: true };
  });
  stepNum++;
  
  // Step 5: Deploy to staging (slow)
  console.log(`\nStep ${stepNum}: Deploy to staging`);
  result = await replanner.executeStep('deploy-app', async (step) => {
    console.log('  ⚠️  Deployment slow (progress: 25%)');
    return { success: true, progress: 0.25 };
  });
  
  if (result.needsReplan) {
    console.log(`\n🔄 REPLANNING: ${result.reason}`);
    console.log('  New strategy: Use faster deployment method');
    
    replanner.replan('deploy-app', [
      { action: 'deploy-staging-fast', description: 'Fast deploy to staging' },
      { action: 'smoke-test', description: 'Run smoke tests' },
      { action: 'deploy-prod', description: 'Deploy to production' }
    ], result.reason);
    
    const status = replanner.getStatus('deploy-app');
    console.log(`  Replans: ${status.replans}/${replanner.maxReplans}`);
  }
  stepNum++;
  
  // Step 6: Fast deploy
  console.log(`\nStep ${stepNum}: Fast deploy to staging`);
  result = await replanner.executeStep('deploy-app', async (step) => {
    console.log('  ✅ Fast deployment successful');
    return { success: true, progress: 0.9 };
  });
  stepNum++;
  
  // Step 7: Smoke tests
  console.log(`\nStep ${stepNum}: Run smoke tests`);
  result = await replanner.executeStep('deploy-app', async (step) => {
    console.log('  ✅ Smoke tests passed');
    return { success: true };
  });
  stepNum++;
  
  // Step 8: Deploy to prod
  console.log(`\nStep ${stepNum}: Deploy to production`);
  result = await replanner.executeStep('deploy-app', async (step) => {
    console.log('  ✅ Production deployment successful');
    return { success: true };
  });
  
  // Show final status
  console.log('\n\n📊 Final Status:');
  const status = replanner.getStatus('deploy-app');
  console.log(`  Goal: ${status.goal}`);
  console.log(`  Status: ${status.status}`);
  console.log(`  Progress: ${(status.progress * 100).toFixed(0)}%`);
  console.log(`  Steps completed: ${status.currentStep}/${status.totalSteps}`);
  console.log(`  Replans: ${status.replans}`);
  console.log(`  Duration: ${(status.duration / 1000).toFixed(1)}s`);
  
  // Show history
  console.log('\n📜 Execution History:');
  const history = replanner.getHistory('deploy-app');
  history.forEach((entry, i) => {
    if (entry.type === 'replan') {
      console.log(`  [${i}] 🔄 Replanned: ${entry.reason}`);
    } else {
      const icon = entry.success ? '✅' : '❌';
      console.log(`  [${i}] ${icon} ${entry.action}`);
    }
  });
  
  console.log('\n✅ Demo complete!');
}

executePlan();
