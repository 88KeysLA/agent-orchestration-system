/**
 * Tests for GeminiAgent
 */
const assert = require('assert');
const Module = require('module');

// Mock @google/generative-ai before requiring the agent
const MockGenAI = class { getGenerativeModel() { return {}; } };
const origLoad = Module._load;
Module._load = (req, ...args) =>
  req === '@google/generative-ai' ? { GoogleGenerativeAI: MockGenAI } : origLoad(req, ...args);

const GeminiAgent = require('../src/agents/gemini-agent');

let passed = 0;
let failed = 0;
const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

async function run() {
  console.log('GeminiAgent Tests');
  console.log('=================');

  for (const { name, fn } of tests) {
    try {
      await fn();
      passed++;
      console.log(`  ✓ ${name}`);
    } catch (err) {
      failed++;
      console.log(`  ✗ ${name}: ${err.message}`);
    }
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

// Constructor tests
test('constructor uses defaults', () => {
  const agent = new GeminiAgent();
  assert.strictEqual(agent.model, 'gemini-2.5-pro');
  assert.strictEqual(agent.maxTokens, 8192);
  assert.strictEqual(agent.systemPrompt, 'You are a helpful assistant.');
  assert.strictEqual(agent.lastUsage, null);
  assert.strictEqual(agent.toolkit, null);
  assert.strictEqual(agent.maxToolRounds, 10);
});

test('constructor accepts options', () => {
  const agent = new GeminiAgent({
    apiKey: 'test-key',
    model: 'gemini-2.5-flash',
    systemPrompt: 'Custom prompt',
    maxTokens: 4096
  });
  assert.strictEqual(agent.apiKey, 'test-key');
  assert.strictEqual(agent.model, 'gemini-2.5-flash');
  assert.strictEqual(agent.systemPrompt, 'Custom prompt');
  assert.strictEqual(agent.maxTokens, 4096);
});

test('constructor reads GEMINI_API_KEY from env', () => {
  const orig = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = 'env-test-key';
  const agent = new GeminiAgent();
  assert.strictEqual(agent.apiKey, 'env-test-key');
  if (orig) process.env.GEMINI_API_KEY = orig;
  else delete process.env.GEMINI_API_KEY;
});

// Health check tests
test('healthCheck returns false without API key', async () => {
  const origKey = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  const agent = new GeminiAgent({ apiKey: '' });
  const result = await agent.healthCheck();
  assert.strictEqual(result, false);
});

test('healthCheck returns true with API key', async () => {
  const agent = new GeminiAgent({ apiKey: 'test-key' });
  const result = await agent.healthCheck();
  assert.strictEqual(result, true);
});

// Lazy client tests
test('_getGenAI creates client lazily', () => {
  const agent = new GeminiAgent({ apiKey: 'test-key' });
  assert.strictEqual(agent._genAI, null);
  const client = agent._getGenAI();
  assert.ok(client);
  assert.strictEqual(agent._genAI, client);
  assert.strictEqual(agent._getGenAI(), client);
});

// Tool conversion tests
test('_convertTools returns null without toolkit', () => {
  const agent = new GeminiAgent();
  assert.strictEqual(agent._convertTools(), null);
});

test('_convertTools converts Anthropic format to Gemini format', () => {
  const mockToolkit = {
    size: 2,
    getDefinitions: () => [
      {
        name: 'test_tool',
        description: 'A test tool',
        input_schema: {
          type: 'object',
          properties: { arg1: { type: 'string' } },
          required: ['arg1']
        }
      },
      {
        name: 'another_tool',
        description: 'Another tool',
        input_schema: {
          type: 'object',
          properties: { num: { type: 'number' } },
          required: []
        }
      }
    ]
  };
  const agent = new GeminiAgent({ toolkit: mockToolkit });
  const tools = agent._convertTools();
  assert.ok(Array.isArray(tools));
  assert.strictEqual(tools.length, 1);
  assert.ok(tools[0].functionDeclarations);
  assert.strictEqual(tools[0].functionDeclarations.length, 2);

  const decl = tools[0].functionDeclarations[0];
  assert.strictEqual(decl.name, 'test_tool');
  assert.strictEqual(decl.description, 'A test tool');
  assert.deepStrictEqual(decl.parameters, {
    type: 'object',
    properties: { arg1: { type: 'string' } },
    required: ['arg1']
  });
});

test('_convertTools returns null for empty toolkit', () => {
  const mockToolkit = { size: 0, getDefinitions: () => [] };
  const agent = new GeminiAgent({ toolkit: mockToolkit });
  assert.strictEqual(agent._convertTools(), null);
});

test('module exports GeminiAgent class', () => {
  assert.strictEqual(typeof GeminiAgent, 'function');
  assert.strictEqual(GeminiAgent.name, 'GeminiAgent');
});

run();
