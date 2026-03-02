/**
 * Strength-Based Routing Tests
 * Verifies that agents with matching strengths are preferred when RL has no data
 */
const Orchestrator = require('../src/orchestrator');

let passed = 0;
let failed = 0;

function test(name, fn) {
  return fn().then(() => {
    console.log(`\u2705 ${name}`);
    passed++;
  }).catch(err => {
    console.log(`\u274c ${name}: ${err.message}`);
    failed++;
  });
}

function mockAgent(name) {
  return {
    execute: async (task) => `[${name}] Done: ${task.substring(0, 50)}`,
    healthCheck: async () => true
  };
}

async function testStrengthMatchingColdStart() {
  // With epsilon=0, no randomness — pure strength matching on cold start
  const orc = new Orchestrator({ epsilon: 0 });
  orc.registerAgent('coder', '1.0.0', mockAgent('coder'), {
    strengths: ['code generation', 'complex reasoning', 'analysis']
  });
  orc.registerAgent('chatter', '1.0.0', mockAgent('chatter'), {
    strengths: ['fast response', 'routine tasks', 'zero cost']
  });
  orc.registerAgent('lookup', '1.0.0', mockAgent('lookup'), {
    strengths: ['documentation lookup', 'device info', 'villa knowledge']
  });

  // "feature-generic" analysis — "code" and "analysis" should match coder
  const r1 = await orc.execute('Analyze and implement a new feature');
  orc.shutdown();

  if (r1.agent !== 'coder') {
    throw new Error(`Expected coder for analysis task, got ${r1.agent}`);
  }
}

async function testStrengthMatchingLookup() {
  const orc = new Orchestrator({ epsilon: 0 });
  orc.registerAgent('coder', '1.0.0', mockAgent('coder'), {
    strengths: ['code generation', 'complex reasoning']
  });
  orc.registerAgent('lookup', '1.0.0', mockAgent('lookup'), {
    strengths: ['documentation lookup', 'device info']
  });

  // "documentation-generic" analysis — should match lookup
  const r = await orc.execute('Document how the API works');
  orc.shutdown();

  if (r.agent !== 'lookup') {
    throw new Error(`Expected lookup for docs task, got ${r.agent}`);
  }
}

async function testRLOverridesStrengths() {
  // After RL learns, it should override strength-based initial selection
  const orc = new Orchestrator({ epsilon: 0 });
  orc.registerAgent('fast', '1.0.0', mockAgent('fast'), {
    strengths: ['zero cost', 'routine tasks']
  });
  orc.registerAgent('smart', '1.0.0', mockAgent('smart'), {
    strengths: ['complex reasoning', 'analysis']
  });

  // Train RL: fast agent gets high rewards for analysis tasks
  const contextKey = 'feature-generic';
  for (let i = 0; i < 20; i++) {
    orc.rl.update(contextKey, 'fast', 95);
    orc.rl.update(contextKey, 'smart', 30);
  }

  // Now even though "smart" has better strength match, RL data says "fast" is better
  const r = await orc.execute('Analyze this feature');
  orc.shutdown();

  if (r.agent !== 'fast') {
    throw new Error(`Expected RL to override strengths, got ${r.agent}`);
  }
}

async function testNoStrengthsFallsThrough() {
  // Agents without strengths metadata should still work
  const orc = new Orchestrator({ epsilon: 0 });
  orc.registerAgent('plain', '1.0.0', mockAgent('plain'));
  orc.registerAgent('also-plain', '1.0.0', mockAgent('also-plain'));

  const r = await orc.execute('Do something');
  orc.shutdown();

  if (!r.success) throw new Error('Should succeed');
  if (!r.agent) throw new Error('Should have an agent');
}

async function testSingleAgentAlwaysSelected() {
  const orc = new Orchestrator({ epsilon: 0 });
  orc.registerAgent('only', '1.0.0', mockAgent('only'), {
    strengths: ['everything']
  });

  const r = await orc.execute('Any task at all');
  orc.shutdown();

  if (r.agent !== 'only') throw new Error(`Expected only, got ${r.agent}`);
}

(async () => {
  console.log('Testing Strength-Based Routing...\n');

  await test('Strength matching on cold start', testStrengthMatchingColdStart);
  await test('Strength matching for lookup tasks', testStrengthMatchingLookup);
  await test('RL overrides strengths after learning', testRLOverridesStrengths);
  await test('No strengths metadata still works', testNoStrengthsFallsThrough);
  await test('Single agent always selected', testSingleAgentAlwaysSelected);

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed === 0) {
    console.log('\u2705 All strength routing tests passed!\n');
    process.exit(0);
  } else {
    console.log('\u274c Some tests failed\n');
    process.exit(1);
  }
})();
