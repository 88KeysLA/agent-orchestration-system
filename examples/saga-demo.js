#!/usr/bin/env node
/**
 * Saga Demo - Distributed transaction with rollback
 */
const Saga = require('../src/saga');

console.log('🎬 Saga Demo - Distributed Transaction with Rollback\n');

// Demo 1: Successful deployment
console.log('📦 Demo 1: Successful Deployment');
const successSaga = new Saga('deploy-app');

successSaga
  .addStep('build', async () => {
    console.log('  ✅ Building application...');
    return { buildId: 'build-123' };
  }, async () => {
    console.log('  ↩️  Cleaning up build...');
  })
  .addStep('test', async (ctx) => {
    console.log(`  ✅ Testing build ${ctx.buildId}...`);
    return { testsPassed: true };
  }, async () => {
    console.log('  ↩️  Reverting test environment...');
  })
  .addStep('deploy', async (ctx) => {
    console.log(`  ✅ Deploying to production...`);
    return { deploymentId: 'deploy-456' };
  }, async () => {
    console.log('  ↩️  Rolling back deployment...');
  });

successSaga.execute().then(result => {
  console.log('  Result:', result.success ? '✅ Success' : '❌ Failed');
  console.log('  Context:', result.context);
  
  // Demo 2: Failed deployment with rollback
  console.log('\n📦 Demo 2: Failed Deployment (with rollback)');
  const failSaga = new Saga('deploy-app-fail');
  
  failSaga
    .addStep('build', async () => {
      console.log('  ✅ Building application...');
      return { buildId: 'build-789' };
    }, async () => {
      console.log('  ↩️  Cleaning up build...');
    })
    .addStep('test', async (ctx) => {
      console.log(`  ✅ Testing build ${ctx.buildId}...`);
      return { testsPassed: true };
    }, async () => {
      console.log('  ↩️  Reverting test environment...');
    })
    .addStep('deploy', async () => {
      console.log('  ❌ Deployment failed! (simulated error)');
      throw new Error('Deployment server unreachable');
    }, async () => {
      console.log('  ↩️  Rolling back deployment...');
    });
  
  return failSaga.execute();
}).then(result => {
  console.log('  Result:', result.success ? '✅ Success' : '❌ Failed');
  console.log('  Error:', result.error);
  console.log('  Rolled back:', result.rolledBack ? '✅ Yes' : '❌ No');
  console.log('\n✅ Demo complete!');
});
