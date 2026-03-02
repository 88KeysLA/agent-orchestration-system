/**
 * RL Persistence Tests
 * Tests save/load of Q-table to disk
 */
const fs = require('fs');
const path = require('path');
const SimpleRL = require('../src/simple-rl');

let passed = 0;
let failed = 0;

const TMP_DIR = path.join(__dirname, '..', '.test-tmp');
const TMP_FILE = path.join(TMP_DIR, 'test-qtable.json');

function test(name, fn) {
  return fn().then(() => {
    console.log(`\u2705 ${name}`);
    passed++;
  }).catch(err => {
    console.log(`\u274c ${name}: ${err.message}`);
    failed++;
  });
}

function cleanup() {
  try { fs.unlinkSync(TMP_FILE); } catch {}
  try { fs.rmdirSync(TMP_DIR); } catch {}
}

async function testNoPersistByDefault() {
  const rl = new SimpleRL();
  rl.update('ctx', 'agent1', 80);
  if (rl.persistPath !== null) throw new Error('Should have no persistPath');
  // Should not throw
}

async function testSaveAndLoad() {
  cleanup();
  const rl1 = new SimpleRL({ persistPath: TMP_FILE });
  rl1.update('code', 'claude', 90);
  rl1.update('code', 'ollama', 60);
  rl1.update('chat', 'ollama', 85);

  // Verify file exists
  if (!fs.existsSync(TMP_FILE)) throw new Error('File not created');

  // Load into new instance
  const rl2 = new SimpleRL({ persistPath: TMP_FILE });
  const q1 = rl2.getQ('code', 'claude');
  const q2 = rl2.getQ('code', 'ollama');
  const q3 = rl2.getQ('chat', 'ollama');

  if (q1 !== 90) throw new Error(`claude code Q should be 90, got ${q1}`);
  if (q2 !== 60) throw new Error(`ollama code Q should be 60, got ${q2}`);
  if (q3 !== 85) throw new Error(`ollama chat Q should be 85, got ${q3}`);
  cleanup();
}

async function testLoadMissingFile() {
  cleanup();
  // Should not throw — starts fresh
  const rl = new SimpleRL({ persistPath: TMP_FILE });
  const q = rl.getQ('anything', 'any');
  if (q !== 0) throw new Error(`Should be 0, got ${q}`);
  cleanup();
}

async function testPersistsSurvivesRestart() {
  cleanup();
  const rl1 = new SimpleRL({ persistPath: TMP_FILE });

  // Train
  for (let i = 0; i < 10; i++) {
    rl1.update('task', 'agentA', 80);
    rl1.update('task', 'agentB', 40);
  }

  // "Restart" — new instance
  const rl2 = new SimpleRL({ persistPath: TMP_FILE });
  const best = rl2.bestAgent('task', ['agentA', 'agentB']);
  if (best !== 'agentA') throw new Error(`Expected agentA, got ${best}`);
  cleanup();
}

async function testGetStats() {
  cleanup();
  const rl = new SimpleRL({ persistPath: TMP_FILE });
  rl.update('ctx1', 'a', 90);
  rl.update('ctx1', 'b', 50);
  rl.update('ctx2', 'a', 70);

  const stats = rl.getStats();
  if (stats.length !== 3) throw new Error(`Expected 3 entries, got ${stats.length}`);
  if (stats[0].qValue !== 90) throw new Error(`First should be highest Q`);
  if (stats[0].count !== 1) throw new Error(`Count should be 1`);
  cleanup();
}

async function testCorruptFileRecovery() {
  cleanup();
  fs.mkdirSync(TMP_DIR, { recursive: true });
  fs.writeFileSync(TMP_FILE, 'not valid json!!!');

  // Should not throw — starts fresh
  const rl = new SimpleRL({ persistPath: TMP_FILE });
  const q = rl.getQ('x', 'y');
  if (q !== 0) throw new Error(`Should start fresh, got ${q}`);
  cleanup();
}

async function testBackwardCompatNoOptions() {
  // Old-style constructor with no args
  const rl = new SimpleRL();
  rl.update('ctx', 'a', 50);
  if (rl.getQ('ctx', 'a') !== 50) throw new Error('Basic update failed');
  if (rl.epsilon !== 0.1) throw new Error(`Default epsilon wrong: ${rl.epsilon}`);
}

async function testCustomEpsilon() {
  const rl = new SimpleRL({ epsilon: 0.5 });
  if (rl.epsilon !== 0.5) throw new Error(`Expected 0.5, got ${rl.epsilon}`);
}

(async () => {
  console.log('Testing RL Persistence...\n');

  await test('No persistence by default', testNoPersistByDefault);
  await test('Save and load Q-table', testSaveAndLoad);
  await test('Load missing file starts fresh', testLoadMissingFile);
  await test('Learning survives restart', testPersistsSurvivesRestart);
  await test('getStats returns sorted entries', testGetStats);
  await test('Corrupt file recovery', testCorruptFileRecovery);
  await test('Backward compat: no options', testBackwardCompatNoOptions);
  await test('Custom epsilon', testCustomEpsilon);

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed === 0) {
    console.log('\u2705 All RL persistence tests passed!\n');
    process.exit(0);
  } else {
    console.log('\u274c Some tests failed\n');
    process.exit(1);
  }
})();
