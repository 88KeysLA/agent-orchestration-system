/**
 * Tests for ImagenAgent
 */
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const Module = require('module');

// Mock @google/genai before requiring the agent
const MockAI = class { models = { generateImages: async () => ({ generatedImages: [] }), generateContent: async () => ({ text: '' }) }; };
const origLoad = Module._load;
Module._load = (req, ...args) =>
  req === '@google/genai' ? { GoogleGenAI: MockAI } : origLoad(req, ...args);

const ImagenAgent = require('../src/agents/imagen-agent');

let passed = 0;
let failed = 0;
const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

async function run() {
  console.log('ImagenAgent Tests');
  console.log('=================');

  for (const { name, fn } of tests) {
    try {
      await fn();
      passed++;
      console.log(`  \u2713 ${name}`);
    } catch (err) {
      failed++;
      console.log(`  \u2717 ${name}: ${err.message}`);
    }
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

// Constructor tests
test('constructor uses defaults', () => {
  const agent = new ImagenAgent({ apiKey: 'test' });
  assert.strictEqual(agent.imagenModel, 'imagen-4.0-generate-001');
  assert.strictEqual(agent.geminiImageModel, 'gemini-2.5-flash-preview-image-generation');
  assert.strictEqual(agent.numberOfImages, 1);
  assert.strictEqual(agent.aspectRatio, '16:9');
  assert.strictEqual(agent.lastUsage, null);
});

test('constructor accepts options', () => {
  const agent = new ImagenAgent({
    apiKey: 'test-key',
    imagenModel: 'imagen-4.0-ultra-generate-001',
    numberOfImages: 4,
    aspectRatio: '1:1',
    outputDir: '/tmp/test-images'
  });
  assert.strictEqual(agent.apiKey, 'test-key');
  assert.strictEqual(agent.imagenModel, 'imagen-4.0-ultra-generate-001');
  assert.strictEqual(agent.numberOfImages, 4);
  assert.strictEqual(agent.aspectRatio, '1:1');
  assert.strictEqual(agent.outputDir, '/tmp/test-images');
});

test('constructor reads GEMINI_API_KEY from env', () => {
  const orig = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = 'env-test-key';
  const agent = new ImagenAgent();
  assert.strictEqual(agent.apiKey, 'env-test-key');
  if (orig) process.env.GEMINI_API_KEY = orig;
  else delete process.env.GEMINI_API_KEY;
});

// Health check tests
test('healthCheck returns false without API key', async () => {
  const orig = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  try {
    const agent = new ImagenAgent({ apiKey: '' });
    const result = await agent.healthCheck();
    assert.strictEqual(result, false);
  } finally {
    if (orig) process.env.GEMINI_API_KEY = orig;
  }
});

test('healthCheck returns true with API key', async () => {
  const agent = new ImagenAgent({ apiKey: 'test-key' });
  const result = await agent.healthCheck();
  assert.strictEqual(result, true);
});

// Task parsing tests
test('_parseTask defaults to imagen mode', () => {
  const agent = new ImagenAgent({ apiKey: 'test' });
  const result = agent._parseTask('a beautiful sunset');
  assert.strictEqual(result.mode, 'imagen');
  assert.strictEqual(result.prompt, 'a beautiful sunset');
  assert.strictEqual(result.aspectRatio, '16:9');
  assert.strictEqual(result.count, 1);
});

test('_parseTask detects gemini: prefix', () => {
  const agent = new ImagenAgent({ apiKey: 'test' });
  const result = agent._parseTask('gemini:a cat on a roof');
  assert.strictEqual(result.mode, 'gemini');
  assert.strictEqual(result.prompt, 'a cat on a roof');
});

test('_parseTask parses aspect ratio', () => {
  const agent = new ImagenAgent({ apiKey: 'test' });
  const result = agent._parseTask('aspect:9:16 a tall building');
  assert.strictEqual(result.aspectRatio, '9:16');
  assert.strictEqual(result.prompt, 'a tall building');
});

test('_parseTask parses count', () => {
  const agent = new ImagenAgent({ apiKey: 'test' });
  const result = agent._parseTask('count:3 variations of a logo');
  assert.strictEqual(result.count, 3);
  assert.strictEqual(result.prompt, 'variations of a logo');
});

test('_parseTask caps count at 4', () => {
  const agent = new ImagenAgent({ apiKey: 'test' });
  const result = agent._parseTask('count:10 many images');
  assert.strictEqual(result.count, 4);
});

test('_parseTask handles combined params', () => {
  const agent = new ImagenAgent({ apiKey: 'test' });
  const result = agent._parseTask('gemini:aspect:1:1 count:2 a square image');
  assert.strictEqual(result.mode, 'gemini');
  assert.strictEqual(result.aspectRatio, '1:1');
  assert.strictEqual(result.count, 2);
  assert.strictEqual(result.prompt, 'a square image');
});

// Filename tests
test('_filename generates timestamped names', () => {
  const agent = new ImagenAgent({ apiKey: 'test' });
  const name = agent._filename('imagen', 1);
  assert.ok(name.startsWith('imagen-'));
  assert.ok(name.endsWith('-1.png'));
  assert.ok(name.length > 20);
});

// Module export test
test('module exports ImagenAgent class', () => {
  assert.strictEqual(typeof ImagenAgent, 'function');
  assert.strictEqual(ImagenAgent.name, 'ImagenAgent');
});

// Lazy client test
test('_getAI creates client lazily', () => {
  const agent = new ImagenAgent({ apiKey: 'test-key' });
  assert.strictEqual(agent._ai, null);
  const ai = agent._getAI();
  assert.ok(ai);
  assert.strictEqual(agent._ai, ai);
  assert.strictEqual(agent._getAI(), ai);
});

run();
