/**
 * Multi-Objective Reward Tests
 */
const MultiObjectiveReward = require('../src/multi-objective-reward');

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

function assertRange(value, min, max, label) {
  if (value < min || value > max) {
    throw new Error(`${label}: ${value} not in range [${min}, ${max}]`);
  }
}

// Quality tests
async function testQualityEmpty() {
  const r = new MultiObjectiveReward();
  const d = r.evaluate(null);
  assertRange(d.quality, 0, 20, 'empty quality');
}

async function testQualityShort() {
  const r = new MultiObjectiveReward();
  const d = r.evaluate('Hello');
  assertRange(d.quality, 5, 30, 'short quality');
}

async function testQualityStructured() {
  const r = new MultiObjectiveReward();
  const structured = `# Analysis

This is a detailed response with multiple paragraphs.

- Point one about the architecture
- Point two about the implementation

\`\`\`javascript
const x = 1;
\`\`\`

The conclusion follows with recommendations.`;
  const d = r.evaluate(structured);
  assertRange(d.quality, 60, 100, 'structured quality');
}

async function testQualityMedium() {
  const r = new MultiObjectiveReward();
  const d = r.evaluate('This is a moderate length response that provides some useful information about the topic at hand and offers a few suggestions.');
  assertRange(d.quality, 30, 70, 'medium quality');
}

// Speed tests
async function testSpeedFast() {
  const r = new MultiObjectiveReward();
  const d = r.evaluate('result', { duration: 50 });
  assertRange(d.speed, 90, 100, 'fast speed');
}

async function testSpeedSlow() {
  const r = new MultiObjectiveReward();
  const d = r.evaluate('result', { duration: 45000 });
  assertRange(d.speed, 10, 30, 'slow speed');
}

async function testSpeedNull() {
  const r = new MultiObjectiveReward();
  const d = r.evaluate('result', {});
  if (d.speed !== 50) throw new Error(`Expected neutral 50, got ${d.speed}`);
}

// Cost tests
async function testCostEfficient() {
  const r = new MultiObjectiveReward();
  const result = 'A'.repeat(500);
  const d = r.evaluate(result, { tokens: { inputTokens: 20, outputTokens: 80 } });
  assertRange(d.cost, 60, 100, 'efficient cost');
}

async function testCostNoTokens() {
  const r = new MultiObjectiveReward();
  const d = r.evaluate('result', {});
  if (d.cost !== 50) throw new Error(`Expected neutral 50, got ${d.cost}`);
}

// Relevance tests
async function testRelevanceHigh() {
  const r = new MultiObjectiveReward();
  const d = r.evaluate(
    'The authentication system has a critical bug in the login handler that causes crashes.',
    { task: 'Fix the authentication bug in the login system' }
  );
  assertRange(d.relevance, 60, 100, 'high relevance');
}

async function testRelevanceLow() {
  const r = new MultiObjectiveReward();
  const d = r.evaluate(
    'The weather today is sunny and warm.',
    { task: 'Fix the authentication bug in the login system' }
  );
  assertRange(d.relevance, 20, 50, 'low relevance');
}

async function testRelevanceNoTask() {
  const r = new MultiObjectiveReward();
  const d = r.evaluate('some result', {});
  if (d.relevance !== 50) throw new Error(`Expected neutral 50, got ${d.relevance}`);
}

// Combined score
async function testCombinedScore() {
  const r = new MultiObjectiveReward();
  const score = r.score('A decent result with some content.', {
    duration: 500, task: 'Get a decent result'
  });
  assertRange(score, 0, 100, 'combined score');
  if (typeof score !== 'number') throw new Error('Score must be a number');
}

// setWeights
async function testSetWeights() {
  const r = new MultiObjectiveReward();
  r.setWeights({ quality: 1, speed: 1, cost: 1, relevance: 1 });
  const sum = Object.values(r.weights).reduce((a, b) => a + b, 0);
  if (Math.abs(sum - 1) > 0.01) throw new Error(`Weights should sum to 1, got ${sum}`);
  if (Math.abs(r.weights.quality - 0.25) > 0.01) throw new Error(`Each should be 0.25`);
}

// Backward compatibility
async function testBackwardCompat() {
  const Orchestrator = require('../src/orchestrator');
  const orc = new Orchestrator({
    rewardFn: (result) => result ? 42 : 0
  });
  orc.registerAgent('test', '1.0.0', {
    execute: async (task) => `done: ${task}`,
    healthCheck: async () => true
  });
  const r = await orc.execute('Hello');
  orc.shutdown();
  if (r.reward !== 42) throw new Error(`Expected 42, got ${r.reward}`);
}

(async () => {
  console.log('Testing Multi-Objective Reward...\n');

  await test('Quality: empty result', testQualityEmpty);
  await test('Quality: short result', testQualityShort);
  await test('Quality: structured result', testQualityStructured);
  await test('Quality: medium result', testQualityMedium);
  await test('Speed: fast execution', testSpeedFast);
  await test('Speed: slow execution', testSpeedSlow);
  await test('Speed: null duration', testSpeedNull);
  await test('Cost: efficient tokens', testCostEfficient);
  await test('Cost: no token data', testCostNoTokens);
  await test('Relevance: high overlap', testRelevanceHigh);
  await test('Relevance: low overlap', testRelevanceLow);
  await test('Relevance: no task', testRelevanceNoTask);
  await test('Combined score is scalar', testCombinedScore);
  await test('setWeights normalizes', testSetWeights);
  await test('Backward compat: old rewardFn', testBackwardCompat);

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed === 0) {
    console.log('\u2705 All multi-objective reward tests passed!\n');
    process.exit(0);
  } else {
    console.log('\u274c Some tests failed\n');
    process.exit(1);
  }
})();
