/**
 * CompoundAgent Tests
 * Tests agent chaining (RAG → LLM pipeline pattern)
 */
const CompoundAgent = require('../src/agents/compound-agent');

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

function mockAgent(name, response) {
  return {
    execute: async (task) => typeof response === 'function' ? response(task) : response,
    healthCheck: async () => true,
    lastUsage: { tokens: 10 }
  };
}

function unhealthyAgent() {
  return {
    execute: async () => 'ok',
    healthCheck: async () => false,
    lastUsage: null
  };
}

async function testBasicChain() {
  const rag = mockAgent('rag', 'Villa Romanza has 76 areas across 5 floors.');
  const llm = mockAgent('llm', (prompt) => {
    if (!prompt.includes('76 areas')) throw new Error('Context not passed');
    return 'Villa Romanza is a large smart home with 76 areas.';
  });

  const compound = new CompoundAgent([
    { name: 'rag', agent: rag },
    { name: 'llm', agent: llm }
  ]);

  const result = await compound.execute('What is Villa Romanza?');
  if (!result.includes('76 areas')) throw new Error(`Missing content: ${result}`);
}

async function testLastUsage() {
  const a = mockAgent('a', 'step 1');
  const b = mockAgent('b', 'step 2');

  const compound = new CompoundAgent([
    { name: 'retriever', agent: a },
    { name: 'synthesizer', agent: b }
  ]);

  await compound.execute('test');
  if (!compound.lastUsage) throw new Error('lastUsage not set');
  if (compound.lastUsage.totalStages !== 2) throw new Error('Wrong stage count');
  if (compound.lastUsage.stages.length !== 2) throw new Error('Wrong usage entries');
  if (compound.lastUsage.stages[0].stage !== 'retriever') throw new Error('Wrong stage name');
}

async function testCustomPromptTemplate() {
  let capturedPrompt;
  const llm = {
    execute: async (prompt) => { capturedPrompt = prompt; return 'answer'; },
    healthCheck: async () => true,
    lastUsage: null
  };

  const compound = new CompoundAgent([
    { name: 'rag', agent: mockAgent('rag', 'context data here') },
    { name: 'llm', agent: llm, promptTemplate: 'You are Villa AI. Context: {context}\n\nUser asked: {task}' }
  ]);

  await compound.execute('How many rooms?');
  if (!capturedPrompt.includes('Villa AI')) throw new Error('Template not used');
  if (!capturedPrompt.includes('context data here')) throw new Error('Context not injected');
  if (!capturedPrompt.includes('How many rooms?')) throw new Error('Task not injected');
}

async function testThreeStages() {
  const compound = new CompoundAgent([
    { name: 'search', agent: mockAgent('search', 'raw results') },
    { name: 'filter', agent: mockAgent('filter', 'filtered results') },
    { name: 'summarize', agent: mockAgent('summarize', 'final summary') }
  ]);

  const result = await compound.execute('complex query');
  if (result !== 'final summary') throw new Error(`Expected final summary, got: ${result}`);
  if (compound.lastUsage.totalStages !== 3) throw new Error('Wrong stage count');
}

async function testHealthCheckAllHealthy() {
  const compound = new CompoundAgent([
    { name: 'a', agent: mockAgent('a', 'ok') },
    { name: 'b', agent: mockAgent('b', 'ok') }
  ]);
  const healthy = await compound.healthCheck();
  if (!healthy) throw new Error('Should be healthy');
}

async function testHealthCheckOneUnhealthy() {
  const compound = new CompoundAgent([
    { name: 'a', agent: mockAgent('a', 'ok') },
    { name: 'b', agent: unhealthyAgent() }
  ]);
  const healthy = await compound.healthCheck();
  if (healthy) throw new Error('Should be unhealthy when any stage is unhealthy');
}

async function testMinimumStages() {
  try {
    new CompoundAgent([{ name: 'only', agent: mockAgent('a', 'ok') }]);
    throw new Error('Should have thrown');
  } catch (err) {
    if (!err.message.includes('at least 2')) throw new Error(`Wrong error: ${err.message}`);
  }
}

async function testStageErrorPropagates() {
  const failing = {
    execute: async () => { throw new Error('stage failed'); },
    healthCheck: async () => true,
    lastUsage: null
  };

  const compound = new CompoundAgent([
    { name: 'ok', agent: mockAgent('ok', 'fine') },
    { name: 'bad', agent: failing }
  ]);

  try {
    await compound.execute('test');
    throw new Error('Should have thrown');
  } catch (err) {
    if (!err.message.includes('stage failed')) throw new Error(`Wrong error: ${err.message}`);
  }
}

(async () => {
  console.log('Testing CompoundAgent...\n');

  await test('Basic two-stage chain', testBasicChain);
  await test('Tracks lastUsage per stage', testLastUsage);
  await test('Custom prompt template', testCustomPromptTemplate);
  await test('Three-stage pipeline', testThreeStages);
  await test('Health check: all healthy', testHealthCheckAllHealthy);
  await test('Health check: one unhealthy', testHealthCheckOneUnhealthy);
  await test('Requires at least 2 stages', testMinimumStages);
  await test('Stage error propagates', testStageErrorPropagates);

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed === 0) {
    console.log('\u2705 All compound agent tests passed!\n');
    process.exit(0);
  } else {
    console.log('\u274c Some tests failed\n');
    process.exit(1);
  }
})();
