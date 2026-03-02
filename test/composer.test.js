'use strict';
const AgentComposer = require('../src/composer');

let passed = 0, failed = 0;
function test(name, fn) {
  return fn()
    .then(() => { console.log(`✅ ${name}`); passed++; })
    .catch(err => { console.error(`❌ ${name}: ${err.message}`); failed++; });
}

const makeAgent = (name, fn) => ({
  execute: fn || (async (t) => `${name}(${t})`),
  healthCheck: async () => true
});

async function run() {
  await test('sequential — chains output through steps', async () => {
    const c = new AgentComposer({
      a: makeAgent('a', async t => `A:${t}`),
      b: makeAgent('b', async t => `B:${t}`)
    });
    const { result, steps } = await c.sequential(
      [{ agent: 'a', role: 'first' }, { agent: 'b', role: 'second' }],
      'hello'
    );
    if (result !== 'B:A:hello') throw new Error(`Wrong: ${result}`);
    if (steps.length !== 2) throw new Error('Wrong steps count');
  });

  await test('sequential — prompt template substitution', async () => {
    const c = new AgentComposer({
      rag: makeAgent('rag', async () => 'context data'),
      llm: makeAgent('llm', async t => `answer to: ${t}`)
    });
    const { result } = await c.sequential([
      { agent: 'rag' },
      { agent: 'llm', prompt: 'Context: {prev}\n\nQ: {task}' }
    ], 'what is X?');
    if (!result.includes('context data')) throw new Error(`Missing context: ${result}`);
    if (!result.includes('what is X?')) throw new Error(`Missing task: ${result}`);
  });

  await test('parallel — runs all agents with same input', async () => {
    const c = new AgentComposer({
      a: makeAgent('a', async t => `A:${t}`),
      b: makeAgent('b', async t => `B:${t}`)
    });
    const { result, steps } = await c.parallel(
      [{ agent: 'a' }, { agent: 'b' }],
      'task'
    );
    if (!result.includes('A:task')) throw new Error('Missing A result');
    if (!result.includes('B:task')) throw new Error('Missing B result');
    if (steps.length !== 2) throw new Error('Wrong steps');
  });

  await test('fallback — returns first success', async () => {
    const c = new AgentComposer({
      bad: makeAgent('bad', async () => { throw new Error('fail'); }),
      good: makeAgent('good', async t => `good:${t}`)
    });
    const { result, usedAgent } = await c.fallback(
      [{ agent: 'bad' }, { agent: 'good' }],
      'task'
    );
    if (result !== 'good:task') throw new Error(`Wrong: ${result}`);
    if (usedAgent !== 'good') throw new Error('Wrong agent');
  });

  await test('fallback — throws when all fail', async () => {
    const c = new AgentComposer({
      a: makeAgent('a', async () => { throw new Error('err-a'); }),
      b: makeAgent('b', async () => { throw new Error('err-b'); })
    });
    let threw = false;
    try { await c.fallback([{ agent: 'a' }, { agent: 'b' }], 'task'); } catch { threw = true; }
    if (!threw) throw new Error('Should throw');
  });

  await test('define + run template', async () => {
    const c = new AgentComposer({
      rag: makeAgent('rag', async () => 'docs'),
      llm: makeAgent('llm', async t => `reply: ${t}`)
    });
    c.define('rag-pipeline', [
      { agent: 'rag', role: 'retrieval' },
      { agent: 'llm', role: 'synthesis' }
    ]);
    const { result } = await c.run('rag-pipeline', 'question');
    if (!result.includes('docs')) throw new Error(`Wrong: ${result}`);
  });

  await test('run unknown template throws', async () => {
    const c = new AgentComposer({});
    let threw = false;
    try { await c.run('ghost', 'task'); } catch { threw = true; }
    if (!threw) throw new Error('Should throw');
  });

  await test('resolve unknown agent throws', async () => {
    const c = new AgentComposer({});
    let threw = false;
    try { await c.sequential([{ agent: 'missing' }], 'task'); } catch { threw = true; }
    if (!threw) throw new Error('Should throw');
  });

  await test('addAgent and use inline agent object', async () => {
    const c = new AgentComposer();
    const agent = makeAgent('inline', async t => `inline:${t}`);
    c.addAgent('inline', agent);
    const { result } = await c.sequential([{ agent: 'inline' }], 'x');
    if (result !== 'inline:x') throw new Error(`Wrong: ${result}`);
  });

  console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

run();
