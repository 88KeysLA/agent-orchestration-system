/**
 * OpenAI Agent Tests
 * Uses mocked fetch — no live OpenAI API needed
 */
const OpenAIAgent = require('../src/agents/openai-agent');
const { AgentToolkit } = require('../src/agent-tools');

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

function assert(condition, msg) {
  if (!condition) throw new Error(msg);
}

// --- Mock helpers ---

function mockOpenAI(responseContent, usage = {}) {
  return async (url, options) => {
    if (url.includes('/models')) {
      return { ok: true, status: 200, json: async () => ({ data: [] }), text: async () => '{}' };
    }
    return {
      ok: true, status: 200,
      json: async () => ({
        choices: [{
          message: { role: 'assistant', content: responseContent, tool_calls: null },
          finish_reason: 'stop'
        }],
        usage: { prompt_tokens: usage.input || 100, completion_tokens: usage.output || 50 }
      }),
      text: async () => ''
    };
  };
}

function mockOpenAIWithTools(toolCalls, finalResponse, usage = {}) {
  let callCount = 0;
  return async (url, options) => {
    if (url.includes('/models')) {
      return { ok: true, status: 200, json: async () => ({ data: [] }), text: async () => '{}' };
    }
    callCount++;
    if (callCount === 1) {
      // First call: return tool calls
      return {
        ok: true, status: 200,
        json: async () => ({
          choices: [{
            message: {
              role: 'assistant', content: null,
              tool_calls: toolCalls.map((tc, i) => ({
                id: `call_${i}`,
                type: 'function',
                function: { name: tc.name, arguments: JSON.stringify(tc.args) }
              }))
            },
            finish_reason: 'tool_calls'
          }],
          usage: { prompt_tokens: usage.input || 100, completion_tokens: usage.output || 20 }
        }),
        text: async () => ''
      };
    }
    // Second call: return final text
    return {
      ok: true, status: 200,
      json: async () => ({
        choices: [{
          message: { role: 'assistant', content: finalResponse, tool_calls: null },
          finish_reason: 'stop'
        }],
        usage: { prompt_tokens: 200, completion_tokens: 80 }
      }),
      text: async () => ''
    };
  };
}

// --- Tests ---

async function testConstructorDefaults() {
  const agent = new OpenAIAgent();
  assert(agent.model === 'gpt-4o', `Expected gpt-4o, got ${agent.model}`);
  assert(agent.maxTokens === 4096, `Expected 4096, got ${agent.maxTokens}`);
  assert(agent.toolkit === null, 'Toolkit should be null');
  assert(agent.lastUsage === null, 'lastUsage should be null');
}

async function testConstructorCustom() {
  const agent = new OpenAIAgent({
    apiKey: 'sk-test', model: 'gpt-4o-mini',
    systemPrompt: 'Custom prompt', maxTokens: 2048
  });
  assert(agent.apiKey === 'sk-test', 'Wrong key');
  assert(agent.model === 'gpt-4o-mini', `Expected gpt-4o-mini, got ${agent.model}`);
  assert(agent.systemPrompt === 'Custom prompt', 'Wrong prompt');
  assert(agent.maxTokens === 2048, 'Wrong maxTokens');
}

async function testHealthCheckTrue() {
  const agent = new OpenAIAgent({
    apiKey: 'sk-test',
    fetch: async () => ({ ok: true, status: 200 })
  });
  const healthy = await agent.healthCheck();
  assert(healthy === true, 'Should be healthy');
}

async function testHealthCheckFalse() {
  const agent = new OpenAIAgent({ apiKey: '' });
  const healthy = await agent.healthCheck();
  assert(healthy === false, 'Should be unhealthy without key');
}

async function testHealthCheckNetworkError() {
  const agent = new OpenAIAgent({
    apiKey: 'sk-test',
    fetch: async () => { throw new Error('Network down'); }
  });
  const healthy = await agent.healthCheck();
  assert(healthy === false, 'Should be unhealthy on network error');
}

async function testExecuteTextOnly() {
  const agent = new OpenAIAgent({
    apiKey: 'sk-test',
    fetch: mockOpenAI('Hello from GPT!', { input: 50, output: 10 })
  });
  const result = await agent.execute('Say hello');
  assert(result === 'Hello from GPT!', `Expected 'Hello from GPT!', got '${result}'`);
  assert(agent.lastUsage.inputTokens === 50, `Expected 50, got ${agent.lastUsage.inputTokens}`);
  assert(agent.lastUsage.outputTokens === 10, `Expected 10, got ${agent.lastUsage.outputTokens}`);
}

async function testExecuteSystemPrompt() {
  let capturedBody;
  const agent = new OpenAIAgent({
    apiKey: 'sk-test',
    systemPrompt: 'You are a villa assistant',
    fetch: async (url, opts) => {
      capturedBody = JSON.parse(opts.body);
      return {
        ok: true, status: 200,
        json: async () => ({
          choices: [{ message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 10, completion_tokens: 5 }
        })
      };
    }
  });
  await agent.execute('test');
  assert(capturedBody.messages[0].role === 'system', 'First message should be system');
  assert(capturedBody.messages[0].content === 'You are a villa assistant', 'Wrong system prompt');
  assert(capturedBody.messages[1].role === 'user', 'Second message should be user');
  assert(capturedBody.model === 'gpt-4o', `Expected gpt-4o, got ${capturedBody.model}`);
}

async function testExecuteToolUse() {
  const toolkit = new AgentToolkit();
  toolkit.add('test_tool', 'A test', { type: 'object', properties: {} }, async () => 'tool result');

  const agent = new OpenAIAgent({
    apiKey: 'sk-test',
    toolkit,
    fetch: mockOpenAIWithTools(
      [{ name: 'test_tool', args: {} }],
      'Based on the tool result: all good!'
    )
  });

  const result = await agent.execute('Use the tool');
  assert(result === 'Based on the tool result: all good!', `Got: ${result}`);
  assert(agent.lastUsage.toolRounds === 1, `Expected 1 round, got ${agent.lastUsage.toolRounds}`);
}

async function testExecuteMultipleToolCalls() {
  const toolkit = new AgentToolkit();
  toolkit.add('tool_a', 'A', { type: 'object', properties: {} }, async () => 'result A');
  toolkit.add('tool_b', 'B', { type: 'object', properties: {} }, async () => 'result B');

  let capturedMessages;
  let callCount = 0;
  const agent = new OpenAIAgent({
    apiKey: 'sk-test',
    toolkit,
    fetch: async (url, opts) => {
      callCount++;
      if (callCount === 1) {
        return {
          ok: true, status: 200,
          json: async () => ({
            choices: [{
              message: {
                role: 'assistant', content: null,
                tool_calls: [
                  { id: 'c1', type: 'function', function: { name: 'tool_a', arguments: '{}' } },
                  { id: 'c2', type: 'function', function: { name: 'tool_b', arguments: '{}' } }
                ]
              },
              finish_reason: 'tool_calls'
            }],
            usage: { prompt_tokens: 100, completion_tokens: 20 }
          })
        };
      }
      capturedMessages = JSON.parse(opts.body).messages;
      return {
        ok: true, status: 200,
        json: async () => ({
          choices: [{ message: { role: 'assistant', content: 'Combined result' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 200, completion_tokens: 30 }
        })
      };
    }
  });

  const result = await agent.execute('Use both tools');
  assert(result === 'Combined result', `Got: ${result}`);
  // Should have 2 tool result messages
  const toolMessages = capturedMessages.filter(m => m.role === 'tool');
  assert(toolMessages.length === 2, `Expected 2 tool messages, got ${toolMessages.length}`);
  assert(toolMessages[0].content === 'result A', `Wrong content: ${toolMessages[0].content}`);
  assert(toolMessages[1].content === 'result B', `Wrong content: ${toolMessages[1].content}`);
}

async function testExecuteErrorHandling() {
  const agent = new OpenAIAgent({
    apiKey: 'sk-test',
    fetch: async () => ({ ok: false, status: 429, text: async () => 'Rate limited' })
  });
  let threw = false;
  try {
    await agent.execute('test');
  } catch (err) {
    threw = true;
    assert(err.message.includes('429'), `Expected 429 in error: ${err.message}`);
  }
  assert(threw, 'Should have thrown on API error');
}

async function testToolDefConversion() {
  const toolkit = new AgentToolkit();
  toolkit.add('my_tool', 'My description', {
    type: 'object',
    properties: { name: { type: 'string', description: 'A name' } },
    required: ['name']
  }, async () => 'ok');

  const agent = new OpenAIAgent({ apiKey: 'sk-test', toolkit });
  const defs = agent._buildToolDefs();
  assert(defs.length === 1, `Expected 1 def, got ${defs.length}`);
  assert(defs[0].type === 'function', 'Should be function type');
  assert(defs[0].function.name === 'my_tool', 'Wrong name');
  assert(defs[0].function.description === 'My description', 'Wrong description');
  assert(defs[0].function.parameters.required[0] === 'name', 'Wrong required');
}

async function testNoToolkitNoDefs() {
  const agent = new OpenAIAgent({ apiKey: 'sk-test' });
  const defs = agent._buildToolDefs();
  assert(defs === null, 'Should return null without toolkit');
}

async function testUsageAccumulation() {
  const toolkit = new AgentToolkit();
  toolkit.add('t', 'T', { type: 'object', properties: {} }, async () => 'ok');

  const agent = new OpenAIAgent({
    apiKey: 'sk-test',
    toolkit,
    fetch: mockOpenAIWithTools(
      [{ name: 't', args: {} }],
      'done',
      { input: 150, output: 30 }
    )
  });
  await agent.execute('test');
  // Round 1: 150 in + 30 out, Round 2: 200 in + 80 out
  assert(agent.lastUsage.inputTokens === 350, `Expected 350, got ${agent.lastUsage.inputTokens}`);
  assert(agent.lastUsage.outputTokens === 110, `Expected 110, got ${agent.lastUsage.outputTokens}`);
}

async function testImplementsInterface() {
  const agent = new OpenAIAgent({ apiKey: 'sk-test' });
  assert(typeof agent.execute === 'function', 'Must have execute');
  assert(typeof agent.healthCheck === 'function', 'Must have healthCheck');
  assert('lastUsage' in agent, 'Must have lastUsage');
}

async function testBadToolArgsParsing() {
  const toolkit = new AgentToolkit();
  toolkit.add('t', 'T', { type: 'object', properties: {} }, async () => 'ok');

  let callCount = 0;
  const agent = new OpenAIAgent({
    apiKey: 'sk-test',
    toolkit,
    fetch: async (url, opts) => {
      callCount++;
      if (callCount === 1) {
        return {
          ok: true, status: 200,
          json: async () => ({
            choices: [{
              message: {
                role: 'assistant', content: null,
                tool_calls: [{ id: 'c1', type: 'function', function: { name: 't', arguments: 'invalid json' } }]
              },
              finish_reason: 'tool_calls'
            }],
            usage: { prompt_tokens: 10, completion_tokens: 5 }
          })
        };
      }
      return {
        ok: true, status: 200,
        json: async () => ({
          choices: [{ message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 10, completion_tokens: 5 }
        })
      };
    }
  });
  // Should not throw — bad JSON args parsed as {}
  const result = await agent.execute('test');
  assert(result === 'ok', `Expected ok, got ${result}`);
}

// --- Run ---

(async () => {
  console.log('Testing OpenAI Agent...\n');

  await test('Constructor: defaults', testConstructorDefaults);
  await test('Constructor: custom options', testConstructorCustom);
  await test('healthCheck: true on 200', testHealthCheckTrue);
  await test('healthCheck: false without key', testHealthCheckFalse);
  await test('healthCheck: false on network error', testHealthCheckNetworkError);
  await test('Execute: text-only response', testExecuteTextOnly);
  await test('Execute: system prompt sent', testExecuteSystemPrompt);
  await test('Execute: single tool use round', testExecuteToolUse);
  await test('Execute: multiple parallel tool calls', testExecuteMultipleToolCalls);
  await test('Execute: API error throws', testExecuteErrorHandling);
  await test('Tool defs: converts to OpenAI format', testToolDefConversion);
  await test('Tool defs: null without toolkit', testNoToolkitNoDefs);
  await test('Usage: accumulates across rounds', testUsageAccumulation);
  await test('Interface: execute + healthCheck + lastUsage', testImplementsInterface);
  await test('Graceful: bad tool args JSON', testBadToolArgsParsing);

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed === 0) {
    console.log('\u2705 All OpenAI agent tests passed!\n');
    process.exit(0);
  } else {
    console.log('\u274c Some tests failed\n');
    process.exit(1);
  }
})();
