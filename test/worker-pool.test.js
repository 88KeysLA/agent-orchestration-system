const WorkerPool = require('../src/worker-pool');
const path = require('path');

async function testWorkerPool() {
  console.log('Testing Worker Pool...\n');
  
  const pool = new WorkerPool(
    path.join(__dirname, '../src/workers/task-worker.js'),
    4 // Use 4 workers for test
  );
  
  // Test 1: Single task
  console.log('Test 1: Single task');
  const start1 = Date.now();
  const result1 = await pool.execute({
    type: 'audio_process',
    data: { test: 'single' }
  });
  console.log(`✓ Completed in ${Date.now() - start1}ms`);
  console.log(`  Result:`, result1);
  
  // Test 2: Parallel tasks
  console.log('\nTest 2: 10 parallel tasks');
  const start2 = Date.now();
  const tasks = Array(10).fill(0).map((_, i) => 
    pool.execute({
      type: 'audio_process',
      data: { test: `task-${i}` }
    })
  );
  const results2 = await Promise.all(tasks);
  console.log(`✓ Completed in ${Date.now() - start2}ms`);
  console.log(`  Processed ${results2.length} tasks`);
  
  // Test 3: Queue overflow
  console.log('\nTest 3: Queue overflow (20 tasks, 4 workers)');
  const start3 = Date.now();
  const tasks3 = Array(20).fill(0).map((_, i) => 
    pool.execute({
      type: 'audio_process',
      data: { test: `overflow-${i}` }
    })
  );
  const results3 = await Promise.all(tasks3);
  console.log(`✓ Completed in ${Date.now() - start3}ms`);
  console.log(`  Processed ${results3.length} tasks`);
  
  await pool.shutdown();
  console.log('\n✓ All tests passed');
}

testWorkerPool().catch(console.error);
