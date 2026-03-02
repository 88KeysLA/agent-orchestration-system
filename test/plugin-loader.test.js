'use strict';
const { PluginLoader, definePlugin } = require('../src/plugin-loader');

let passed = 0, failed = 0;
function test(name, fn) {
  return fn()
    .then(() => { console.log(`✅ ${name}`); passed++; })
    .catch(err => { console.error(`❌ ${name}: ${err.message}`); failed++; });
}

const makePlugin = (overrides = {}) => ({
  name: 'test-agent',
  version: '1.0.0',
  execute: async t => `result: ${t}`,
  healthCheck: async () => true,
  strengths: ['testing'],
  ...overrides
});

const makeOrc = () => {
  const registered = {};
  return {
    registerAgent: (name, ver, agent, meta) => { registered[name] = { ver, agent, meta }; },
    _registered: registered
  };
};

async function run() {
  await test('validate passes valid plugin', async () => {
    PluginLoader.validate(makePlugin());
  });

  await test('validate throws on missing name', async () => {
    let threw = false;
    try { PluginLoader.validate(makePlugin({ name: undefined })); } catch { threw = true; }
    if (!threw) throw new Error('Should throw');
  });

  await test('validate throws on missing execute', async () => {
    let threw = false;
    try { PluginLoader.validate(makePlugin({ execute: undefined })); } catch { threw = true; }
    if (!threw) throw new Error('Should throw');
  });

  await test('validate throws on missing healthCheck', async () => {
    let threw = false;
    try { PluginLoader.validate(makePlugin({ healthCheck: undefined })); } catch { threw = true; }
    if (!threw) throw new Error('Should throw');
  });

  await test('validate throws if execute is not a function', async () => {
    let threw = false;
    try { PluginLoader.validate(makePlugin({ execute: 'not-a-fn' })); } catch { threw = true; }
    if (!threw) throw new Error('Should throw');
  });

  await test('register wires plugin into orchestrator', async () => {
    const orc = makeOrc();
    PluginLoader.register(orc, makePlugin());
    if (!orc._registered['test-agent']) throw new Error('Not registered');
    if (orc._registered['test-agent'].ver !== '1.0.0') throw new Error('Wrong version');
  });

  await test('register passes strengths as metadata', async () => {
    const orc = makeOrc();
    PluginLoader.register(orc, makePlugin({ strengths: ['fast', 'cheap'] }));
    const meta = orc._registered['test-agent'].meta;
    if (!meta.strengths.includes('fast')) throw new Error('Missing strength');
  });

  await test('register applies overrides', async () => {
    const orc = makeOrc();
    PluginLoader.register(orc, makePlugin(), { description: 'overridden' });
    if (orc._registered['test-agent'].meta.description !== 'overridden') throw new Error('Override not applied');
  });

  await test('load from file path', async () => {
    const orc = makeOrc();
    PluginLoader.load(orc, './plugins/echo-plugin.js');
    if (!orc._registered['echo']) throw new Error('Echo plugin not registered');
  });

  await test('loadDir loads all plugins from directory', async () => {
    const orc = makeOrc();
    const results = PluginLoader.loadDir(orc, './plugins');
    if (!results.includes('echo')) throw new Error('Echo not in results');
    if (!orc._registered['echo']) throw new Error('Echo not registered');
  });

  await test('loadDir skips invalid plugins without crashing', async () => {
    const path = require('path');
    const fs = require('fs');
    // Write a bad plugin temporarily (no underscore prefix so it gets loaded)
    const badPath = path.resolve('./plugins/bad-plugin-temp.js');
    fs.writeFileSync(badPath, 'module.exports = { name: "bad" }; // missing execute');
    const orc = makeOrc();
    let results;
    try {
      results = PluginLoader.loadDir(orc, './plugins');
    } finally {
      fs.unlinkSync(badPath);
    }
    const errors = results.filter(r => typeof r === 'object');
    if (errors.length === 0) throw new Error('Should have reported error for bad plugin');
  });

  await test('loadDir throws on missing directory', async () => {
    let threw = false;
    try { PluginLoader.loadDir(makeOrc(), './nonexistent-dir'); } catch { threw = true; }
    if (!threw) throw new Error('Should throw');
  });

  await test('definePlugin validates and returns plugin', async () => {
    const plugin = definePlugin(makePlugin({ name: 'defined' }));
    if (plugin.name !== 'defined') throw new Error('Wrong name');
  });

  await test('definePlugin throws on invalid spec', async () => {
    let threw = false;
    try { definePlugin({ name: 'bad' }); } catch { threw = true; }
    if (!threw) throw new Error('Should throw');
  });

  await test('registered plugin execute works', async () => {
    const orc = makeOrc();
    PluginLoader.register(orc, makePlugin());
    const agent = orc._registered['test-agent'].agent;
    const result = await agent.execute('hello');
    if (result !== 'result: hello') throw new Error(`Wrong: ${result}`);
  });

  console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

run();
