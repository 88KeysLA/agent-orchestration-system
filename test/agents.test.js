/**
 * Agent Tests (Claude + Ollama)
 * Uses mocked fetch — no API keys or network needed
 */
const ClaudeAPIAgent = require('../src/agents/claude-agent');
const OllamaAgent = require('../src/agents/ollama-agent');

let passed = 0;
let failed = 0;
const originalFetch = global.fetch;

function test(name, fn) {
  return fn().then(() => {
    console.log(`\u2705 ${name}`);
    passed++;
  }).catch(err => {
    console.log(`\u274c ${name}: ${err.message}`);
    failed++;
  }).finally(() => {
    global.fetch = originalFetch;
  });
}

function mockFetch(responseBody, status = 200) {
  global.fetch = async (url, opts) => ({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: async () => responseBody,
    text: async () => JSON.stringify(responseBody)
  });
}

// Claude tests
async function testClaudeDefaults() {
  const agent = new ClaudeAPIAgent();
  if (agent.model !== 'claude-sonnet-4-6') throw new Error(`Wrong model: ${agent.model}`);
  if (agent.maxTokens !== 4096) throw new Error(`Wrong maxTokens: ${agent.maxTokens}`);
  if (agent.lastUsage !== null) throw new Error('lastUsage should be null');
  if (agent.systemPrompt !== 'You are a helpful assistant.') throw new Error('Wrong default prompt');
}

async function testClaudeCustomOptions() {
  const agent = new ClaudeAPIAgent({
    apiKey: 'test-key',
    model: 'claude-haiku-4-5-20251001',
    systemPrompt: 'Custom prompt',
    maxTokens: 2048
  });
  if (agent.model !== 'claude-haiku-4-5-20251001') throw new Error('Wrong model');
  if (agent.maxTokens !== 2048) throw new Error('Wrong maxTokens');
  if (agent.apiKey !== 'test-key') throw new Error('Wrong apiKey');
}

async function testClaudeHealthNoKey() {
  const agent = new ClaudeAPIAgent({ apiKey: '' });
  const healthy = await agent.healthCheck();
  if (healthy) throw new Error('Should be unhealthy without API key');
}

async function testClaudeInterface() {
  const agent = new ClaudeAPIAgent();
  if (typeof agent.execute !== 'function') throw new Error('Missing execute');
  if (typeof agent.healthCheck !== 'function') throw new Error('Missing healthCheck');
}

// Ollama tests
async function testOllamaDefaults() {
  const agent = new OllamaAgent();
  if (agent.host !== 'http://192.168.0.60:11434') throw new Error(`Wrong host: ${agent.host}`);
  if (agent.model !== 'llama3.1:8b') throw new Error(`Wrong model: ${agent.model}`);
  if (agent.lastUsage !== null) throw new Error('lastUsage should be null');
}

async function testOllamaExecute() {
  mockFetch({
    response: 'Hello from Ollama!',
    prompt_eval_count: 15,
    eval_count: 10,
    eval_duration: 500000000
  });

  const agent = new OllamaAgent({ host: 'http://localhost:11434' });
  const result = await agent.execute('Say hello');

  if (result !== 'Hello from Ollama!') throw new Error(`Wrong result: ${result}`);
  if (!agent.lastUsage) throw new Error('lastUsage not set');
  if (agent.lastUsage.totalTokens !== 25) throw new Error(`Wrong totalTokens: ${agent.lastUsage.totalTokens}`);
  if (agent.lastUsage.evalCount !== 10) throw new Error(`Wrong evalCount: ${agent.lastUsage.evalCount}`);
}

async function testOllamaHealthOk() {
  mockFetch({ models: [] });
  const agent = new OllamaAgent({ host: 'http://localhost:11434' });
  const healthy = await agent.healthCheck();
  if (!healthy) throw new Error('Should be healthy on 200');
}

async function testOllamaHealthFail() {
  global.fetch = async () => { throw new Error('Connection refused'); };
  const agent = new OllamaAgent({ host: 'http://localhost:99999' });
  const healthy = await agent.healthCheck();
  if (healthy) throw new Error('Should be unhealthy on network error');
}

async function testOllamaExecuteError() {
  mockFetch({}, 500);
  const agent = new OllamaAgent({ host: 'http://localhost:11434' });
  try {
    await agent.execute('test');
    throw new Error('Should have thrown');
  } catch (err) {
    if (!err.message.includes('500')) throw new Error(`Wrong error: ${err.message}`);
  }
}

async function testOllamaSystemPrompt() {
  let capturedBody;
  global.fetch = async (url, opts) => {
    capturedBody = JSON.parse(opts.body);
    return {
      ok: true, status: 200,
      json: async () => ({ response: 'ok', eval_count: 5, prompt_eval_count: 10 })
    };
  };

  const agent = new OllamaAgent({
    host: 'http://localhost:11434',
    systemPrompt: 'You are a pirate.'
  });
  await agent.execute('Hello');

  if (!capturedBody.prompt.includes('You are a pirate.')) {
    throw new Error('System prompt not included in request');
  }
  if (!capturedBody.prompt.includes('Hello')) {
    throw new Error('Task not included in request');
  }
}

(async () => {
  console.log('Testing Agents (Claude + Ollama)...\n');

  await test('Claude: default options', testClaudeDefaults);
  await test('Claude: custom options', testClaudeCustomOptions);
  await test('Claude: healthCheck false without key', testClaudeHealthNoKey);
  await test('Claude: implements agent interface', testClaudeInterface);
  await test('Ollama: default options', testOllamaDefaults);
  await test('Ollama: execute with mock fetch', testOllamaExecute);
  await test('Ollama: healthCheck on 200', testOllamaHealthOk);
  await test('Ollama: healthCheck on network error', testOllamaHealthFail);
  await test('Ollama: execute error handling', testOllamaExecuteError);
  await test('Ollama: system prompt in request', testOllamaSystemPrompt);

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed === 0) {
    console.log('\u2705 All agent tests passed!\n');
    process.exit(0);
  } else {
    console.log('\u274c Some tests failed\n');
    process.exit(1);
  }
})();
