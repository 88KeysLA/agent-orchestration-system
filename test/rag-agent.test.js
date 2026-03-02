/**
 * RAG Agent Tests
 * Uses mocked fetch — no RAG server needed
 */
const RAGAgent = require('../src/agents/rag-agent');

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

// Constructor
async function testDefaults() {
  const agent = new RAGAgent();
  if (agent.host !== 'http://192.168.0.60:8450') throw new Error(`Wrong host: ${agent.host}`);
  if (agent.topK !== 5) throw new Error(`Wrong topK: ${agent.topK}`);
  if (agent.lastUsage !== null) throw new Error('lastUsage should be null');
}

async function testCustomOptions() {
  const agent = new RAGAgent({ host: 'http://localhost:9000', topK: 10 });
  if (agent.host !== 'http://localhost:9000') throw new Error('Wrong host');
  if (agent.topK !== 10) throw new Error('Wrong topK');
}

// Execute
async function testExecuteWithResults() {
  mockFetch({
    results: [
      { text: 'Villa Romanza is a smart home.', source: 'system.md', score: 0.95 },
      { text: 'The Mech Mac runs at 192.168.0.60.', source: 'network.md', score: 0.87 }
    ]
  });

  const agent = new RAGAgent({ host: 'http://localhost:8450' });
  const result = await agent.execute('What is Villa Romanza?');

  if (!result.includes('Villa Romanza')) throw new Error('Missing content');
  if (!result.includes('[1]')) throw new Error('Missing numbering');
  if (!result.includes('system.md')) throw new Error('Missing source');
  if (!result.includes('0.950')) throw new Error('Missing score');
  if (!agent.lastUsage) throw new Error('lastUsage not set');
  if (agent.lastUsage.chunksReturned !== 2) throw new Error(`Wrong chunks: ${agent.lastUsage.chunksReturned}`);
}

async function testExecuteEmptyResults() {
  mockFetch({ results: [] });

  const agent = new RAGAgent({ host: 'http://localhost:8450' });
  const result = await agent.execute('Something unknown');

  if (result !== 'No relevant documents found.') throw new Error(`Wrong empty: ${result}`);
  if (agent.lastUsage.chunksReturned !== 0) throw new Error('Should be 0 chunks');
}

async function testExecuteAlternateFormat() {
  mockFetch({
    matches: [
      { content: 'Some content here.', metadata: { source: 'docs.md' } }
    ]
  });

  const agent = new RAGAgent({ host: 'http://localhost:8450' });
  const result = await agent.execute('test');

  if (!result.includes('Some content here')) throw new Error('Missing content from alternate format');
  if (!result.includes('docs.md')) throw new Error('Missing source from metadata');
}

async function testVillaRAGFormat() {
  mockFetch({
    answer: 'The VRROOM is an HDFury device at 192.168.1.70.',
    model_used: 'llama3.1:8b',
    sources: [
      { file: 'vrroom.md', section: 'Overview', score: 0.89 },
      { file: 'network.md', section: 'AV Devices', score: 0.75 }
    ],
    query_time_ms: 3200
  });

  const agent = new RAGAgent({ host: 'http://localhost:8450' });
  const result = await agent.execute('What is the VRROOM?');

  if (!result.includes('HDFury device')) throw new Error('Missing answer');
  if (!result.includes('Sources:')) throw new Error('Missing sources section');
  if (!result.includes('vrroom.md')) throw new Error('Missing source file');
  if (!result.includes('0.890')) throw new Error('Missing score');
  if (agent.lastUsage.model !== 'llama3.1:8b') throw new Error('Missing model in usage');
  if (agent.lastUsage.queryDuration !== 3200) throw new Error('Wrong query duration');
}

async function testExecuteError() {
  mockFetch({}, 500);
  const agent = new RAGAgent({ host: 'http://localhost:8450' });
  try {
    await agent.execute('test');
    throw new Error('Should have thrown');
  } catch (err) {
    if (!err.message.includes('500')) throw new Error(`Wrong error: ${err.message}`);
  }
}

// Health check
async function testHealthOk() {
  mockFetch({ status: 'ok' });
  const agent = new RAGAgent({ host: 'http://localhost:8450' });
  const healthy = await agent.healthCheck();
  if (!healthy) throw new Error('Should be healthy on 200');
}

async function testHealthFail() {
  global.fetch = async () => { throw new Error('Connection refused'); };
  const agent = new RAGAgent({ host: 'http://localhost:99999' });
  const healthy = await agent.healthCheck();
  if (healthy) throw new Error('Should be unhealthy on network error');
}

async function testSendsTopK() {
  let capturedBody;
  global.fetch = async (url, opts) => {
    capturedBody = JSON.parse(opts.body);
    return {
      ok: true, status: 200,
      json: async () => ({ results: [{ text: 'result', score: 0.9 }] })
    };
  };

  const agent = new RAGAgent({ host: 'http://localhost:8450', topK: 3 });
  await agent.execute('test query');

  if (capturedBody.top_k !== 3) throw new Error(`Wrong top_k: ${capturedBody.top_k}`);
  if (capturedBody.question !== 'test query') throw new Error(`Wrong question: ${capturedBody.question}`);
}

(async () => {
  console.log('Testing RAG Agent...\n');

  await test('RAG: default options', testDefaults);
  await test('RAG: custom options', testCustomOptions);
  await test('RAG: execute with results', testExecuteWithResults);
  await test('RAG: execute empty results', testExecuteEmptyResults);
  await test('RAG: execute alternate format', testExecuteAlternateFormat);
  await test('RAG: Villa RAG response format', testVillaRAGFormat);
  await test('RAG: execute error handling', testExecuteError);
  await test('RAG: healthCheck on 200', testHealthOk);
  await test('RAG: healthCheck on network error', testHealthFail);
  await test('RAG: sends topK in request', testSendsTopK);

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed === 0) {
    console.log('\u2705 All RAG agent tests passed!\n');
    process.exit(0);
  } else {
    console.log('\u274c Some tests failed\n');
    process.exit(1);
  }
})();
