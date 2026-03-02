/**
 * Saga Tests
 */
const Saga = require('../src/saga');

function test(name, fn) {
  return fn().then(() => {
    console.log(`✅ ${name}`);
  }).catch(err => {
    console.error(`❌ ${name}: ${err.message}`);
    process.exit(1);
  });
}

// Test 1: Successful saga execution
async function testSuccess() {
  const saga = new Saga('deploy-app');
  const log = [];
  
  saga
    .addStep('build', async () => {
      log.push('build');
      return { buildId: '123' };
    }, async () => {
      log.push('undo-build');
    })
    .addStep('deploy', async (ctx) => {
      log.push('deploy');
      return { deployId: '456' };
    }, async () => {
      log.push('undo-deploy');
    });
  
  const result = await saga.execute();
  if (!result.success) throw new Error('Saga should succeed');
  if (log.length !== 2) throw new Error('Should execute 2 steps');
  if (log[0] !== 'build' || log[1] !== 'deploy') throw new Error('Wrong execution order');
}

// Test 2: Saga rollback on failure
async function testRollback() {
  const saga = new Saga('deploy-app');
  const log = [];
  
  saga
    .addStep('build', async () => {
      log.push('build');
      return { buildId: '123' };
    }, async () => {
      log.push('undo-build');
    })
    .addStep('deploy', async () => {
      log.push('deploy');
      throw new Error('Deploy failed');
    }, async () => {
      log.push('undo-deploy');
    })
    .addStep('notify', async () => {
      log.push('notify');
    }, async () => {
      log.push('undo-notify');
    });
  
  const result = await saga.execute();
  if (result.success) throw new Error('Saga should fail');
  if (!result.rolledBack) throw new Error('Should rollback');
  if (!log.includes('undo-build')) throw new Error('Should undo build');
  if (log.includes('notify')) throw new Error('Should not execute notify');
}

// Test 3: Context passing between steps
async function testContext() {
  const saga = new Saga('process-order');
  
  saga
    .addStep('reserve', async () => {
      return { reservationId: 'R123' };
    })
    .addStep('charge', async (ctx) => {
      if (!ctx.reservationId) throw new Error('Missing reservation');
      return { chargeId: 'C456' };
    })
    .addStep('fulfill', async (ctx) => {
      if (!ctx.chargeId) throw new Error('Missing charge');
      return { fulfillmentId: 'F789' };
    });
  
  const result = await saga.execute();
  if (!result.success) throw new Error('Saga should succeed');
  if (!result.context.reservationId) throw new Error('Missing reservationId');
  if (!result.context.chargeId) throw new Error('Missing chargeId');
  if (!result.context.fulfillmentId) throw new Error('Missing fulfillmentId');
}

// Test 4: Saga status tracking
async function testStatus() {
  const saga = new Saga('test-saga');
  
  saga.addStep('step1', async () => {
    return {};
  });
  
  const initialStatus = saga.getStatus();
  if (initialStatus.status !== 'pending') throw new Error('Should be pending');
  
  await saga.execute();
  
  const finalStatus = saga.getStatus();
  if (finalStatus.status !== 'completed') throw new Error('Should be completed');
  if (finalStatus.completedSteps !== 1) throw new Error('Should have 1 completed step');
}

(async () => {
  await test('Successful saga execution', testSuccess);
  await test('Saga rollback on failure', testRollback);
  await test('Context passing between steps', testContext);
  await test('Saga status tracking', testStatus);
  console.log('\n✅ All saga tests passed!');
})();
