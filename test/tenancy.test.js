'use strict';
const TenantManager = require('../src/tenancy');

let passed = 0, failed = 0;
function test(name, fn) {
  return fn()
    .then(() => { console.log(`✅ ${name}`); passed++; })
    .catch(err => { console.error(`❌ ${name}: ${err.message}`); failed++; });
}

async function run() {
  await test('Create and get tenant', async () => {
    const tm = new TenantManager();
    tm.create('acme', { tasksPerHour: 100, concurrent: 5 });
    const stats = tm.getStats('acme');
    if (stats.id !== 'acme') throw new Error('Wrong id');
    if (stats.quotas.tasksPerHour !== 100) throw new Error('Wrong quota');
  });

  await test('Duplicate tenant throws', async () => {
    const tm = new TenantManager();
    tm.create('x');
    let threw = false;
    try { tm.create('x'); } catch { threw = true; }
    if (!threw) throw new Error('Should throw on duplicate');
  });

  await test('Unknown tenant throws', async () => {
    const tm = new TenantManager();
    let threw = false;
    try { tm.get('ghost'); } catch { threw = true; }
    if (!threw) throw new Error('Should throw');
  });

  await test('recordUsage increments counters', async () => {
    const tm = new TenantManager();
    tm.create('t1');
    const release = tm.recordUsage('t1');
    const stats = tm.getStats('t1');
    if (stats.total !== 1) throw new Error('Wrong total');
    if (stats.active !== 1) throw new Error('Wrong active');
    release();
    if (tm.getStats('t1').active !== 0) throw new Error('Should release');
  });

  await test('Hourly quota enforced', async () => {
    const tm = new TenantManager();
    tm.create('limited', { tasksPerHour: 2 });
    tm.recordUsage('limited');
    tm.recordUsage('limited');
    let threw = false;
    try { tm.checkQuota('limited'); } catch { threw = true; }
    if (!threw) throw new Error('Should throw on quota exceeded');
  });

  await test('Concurrent quota enforced', async () => {
    const tm = new TenantManager();
    tm.create('conc', { concurrent: 1 });
    tm.recordUsage('conc'); // active = 1
    let threw = false;
    try { tm.checkQuota('conc'); } catch { threw = true; }
    if (!threw) throw new Error('Should throw on concurrent exceeded');
  });

  await test('checkQuota passes when under limits', async () => {
    const tm = new TenantManager();
    tm.create('ok', { tasksPerHour: 100, concurrent: 10 });
    tm.checkQuota('ok'); // should not throw
  });

  await test('list returns all tenant ids', async () => {
    const tm = new TenantManager();
    tm.create('a'); tm.create('b'); tm.create('c');
    const list = tm.list();
    if (list.length !== 3) throw new Error('Wrong count');
  });

  await test('delete removes tenant', async () => {
    const tm = new TenantManager();
    tm.create('del');
    tm.delete('del');
    let threw = false;
    try { tm.get('del'); } catch { threw = true; }
    if (!threw) throw new Error('Should be deleted');
  });

  console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

run();
