'use strict';
const HITL = require('../src/hitl');

let passed = 0, failed = 0;
function test(name, fn) {
  return fn()
    .then(() => { console.log(`✅ ${name}`); passed++; })
    .catch(err => { console.error(`❌ ${name}: ${err.message}`); failed++; });
}

async function run() {
  await test('No gate — task passes through immediately', async () => {
    const hitl = new HITL();
    const r = await hitl.check('t1', 'routine task');
    if (!r.approved) throw new Error('Should be approved');
  });

  await test('Gate matches — pending until approved', async () => {
    const hitl = new HITL({ timeout: 5000 });
    hitl.addGate('delete', async () => {});
    const promise = hitl.check('t2', 'delete all files');
    await new Promise(r => setTimeout(r, 10));
    if (hitl.pending.length !== 1) throw new Error('Should have 1 pending');
    hitl.approve('t2', 'confirmed');
    const r = await promise;
    if (!r.approved) throw new Error('Should be approved');
    if (r.notes !== 'confirmed') throw new Error('Wrong notes');
  });

  await test('Gate matches — reject', async () => {
    const hitl = new HITL();
    hitl.addGate(/destroy/, async () => {});
    const promise = hitl.check('t3', 'destroy database');
    await new Promise(r => setTimeout(r, 10));
    hitl.reject('t3', 'too dangerous');
    const r = await promise;
    if (r.approved) throw new Error('Should be rejected');
    if (r.reason !== 'too dangerous') throw new Error('Wrong reason');
  });

  await test('Timeout — default reject', async () => {
    const hitl = new HITL({ timeout: 50, defaultAction: 'reject' });
    hitl.addGate('risky', async () => {});
    const r = await hitl.check('t4', 'risky operation');
    if (r.approved) throw new Error('Should be rejected on timeout');
    if (r.reason !== 'timeout') throw new Error('Wrong reason');
  });

  await test('Timeout — auto-approve', async () => {
    const hitl = new HITL({ timeout: 50, defaultAction: 'approve' });
    hitl.addGate('risky', async () => {});
    const r = await hitl.check('t5', 'risky operation');
    if (!r.approved) throw new Error('Should be auto-approved');
  });

  await test('RegExp gate pattern', async () => {
    const hitl = new HITL({ timeout: 5000 });
    hitl.addGate(/^(delete|drop|truncate)/i, async () => {});
    const promise = hitl.check('t6', 'DROP TABLE users');
    await new Promise(r => setTimeout(r, 10));
    hitl.approve('t6');
    const r = await promise;
    if (!r.approved) throw new Error('Should be approved');
  });

  await test('approve/reject unknown taskId returns false', async () => {
    const hitl = new HITL();
    if (hitl.approve('nope')) throw new Error('Should return false');
    if (hitl.reject('nope')) throw new Error('Should return false');
  });

  await test('shutdown resolves all pending as rejected', async () => {
    const hitl = new HITL({ timeout: 60000 });
    hitl.addGate('risky', async () => {});
    const p1 = hitl.check('s1', 'risky task 1');
    const p2 = hitl.check('s2', 'risky task 2');
    await new Promise(r => setTimeout(r, 10));
    if (hitl.pending.length !== 2) throw new Error('Should have 2 pending');
    hitl.shutdown();
    const r1 = await p1;
    const r2 = await p2;
    if (r1.approved || r2.approved) throw new Error('Both should be rejected');
    if (r1.reason !== 'shutdown') throw new Error('Wrong reason');
    if (hitl.pending.length !== 0) throw new Error('Should be cleared');
  });

  console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

run();
