const AgentLifecycleManager = require('../src/agent-lifecycle-manager');
const AgentManifest = require('../src/agent-manifest');

// Mock orchestrator
class MockOrchestrator {
  constructor() {
    this.agents = new Map();
  }
  registerAgent(name, version, instance, metadata) {
    this.agents.set(name, { version, instance, metadata });
  }
  async execute(task, options) {
    return { result: `Executed: ${task}`, agent: options.preferredAgent };
  }
}

// Mock agent
class MockAgent {
  async execute(task) {
    return `Mock result for: ${task}`;
  }
}

async function test(name, fn) {
  try {
    await fn();
    console.log(`✓ ${name}`);
  } catch (err) {
    console.log(`✗ ${name}`);
    console.error(err.message);
    process.exit(1);
  }
}

async function runTests() {
  console.log('\nTesting Agent Lifecycle Manager...\n');

  await test('Manifest parsing', async () => {
    const manifest = new AgentManifest({
      name: 'test-agent',
      capabilities: ['code', 'debug'],
      triggers: { patterns: ['fix bug', 'debug'] },
      lifecycle: { maxIdleTime: '2m' }
    });
    
    if (manifest.name !== 'test-agent') throw new Error('Name mismatch');
    if (!manifest.matches('fix bug in login')) throw new Error('Should match');
    if (manifest.matches('write docs')) throw new Error('Should not match');
    if (manifest.maxIdleMs !== 120000) throw new Error('Time parsing failed');
  });

  await test('Load and unload agent', async () => {
    const orchestrator = new MockOrchestrator();
    const manager = new AgentLifecycleManager(orchestrator);
    
    manager.registerManifest({
      name: 'mock-agent',
      modulePath: require.resolve('./mock-agent-module'),
      capabilities: ['test'],
      triggers: { patterns: ['test'] }
    });

    if (manager.controller.getState('mock-agent') !== 'UNLOADED') {
      throw new Error('Should start unloaded');
    }

    await manager.execute('test task');

    if (manager.controller.getState('mock-agent') !== 'ACTIVE') {
      throw new Error('Should be active after execute');
    }

    await manager.controller.unloadAgent('mock-agent');

    if (manager.controller.getState('mock-agent') !== 'UNLOADED') {
      throw new Error('Should be unloaded');
    }
  });

  await test('Reconciliation unloads idle agents', async () => {
    const orchestrator = new MockOrchestrator();
    const manager = new AgentLifecycleManager(orchestrator);
    
    manager.registerManifest({
      name: 'idle-agent',
      modulePath: require.resolve('./mock-agent-module'),
      capabilities: ['test'],
      triggers: { patterns: ['test'] },
      lifecycle: { maxIdleTime: '50ms', autoUnload: true }
    });

    await manager.execute('test task');
    
    if (manager.controller.size !== 1) throw new Error('Should have 1 agent');

    const agent = manager.controller.agents.get('idle-agent');
    const maxIdle = agent.manifest.maxIdleMs;
    
    // Wait longer than maxIdle
    await new Promise(r => setTimeout(r, maxIdle + 50));
    
    const idleTime = Date.now() - agent.lastUsed;
    if (idleTime < maxIdle) {
      throw new Error(`Not idle long enough: ${idleTime}ms < ${maxIdle}ms`);
    }
    
    await manager.controller.reconcile();

    if (manager.controller.size !== 0) {
      throw new Error(`Should have unloaded idle agent (idle: ${idleTime}ms, max: ${maxIdle}ms)`);
    }
  });

  await test('Mark used prevents unload', async () => {
    const orchestrator = new MockOrchestrator();
    const manager = new AgentLifecycleManager(orchestrator);
    
    manager.registerManifest({
      name: 'active-agent',
      modulePath: require.resolve('./mock-agent-module'),
      capabilities: ['test'],
      triggers: { patterns: ['test'] },
      lifecycle: { maxIdleTime: '100ms', autoUnload: true }
    });

    await manager.execute('test task');
    
    // Keep marking as used
    const interval = setInterval(() => {
      manager.controller.markUsed('active-agent');
    }, 50);

    await new Promise(r => setTimeout(r, 200));
    await manager.controller.reconcile();

    clearInterval(interval);

    if (manager.controller.size !== 1) {
      throw new Error('Should still have agent (was marked used)');
    }
  });

  await test('Get status', async () => {
    const orchestrator = new MockOrchestrator();
    const manager = new AgentLifecycleManager(orchestrator);
    
    manager.registerManifest({
      name: 'agent1',
      modulePath: require.resolve('./mock-agent-module'),
      capabilities: ['code'],
      triggers: { patterns: ['code'] }
    });

    manager.registerManifest({
      name: 'agent2',
      modulePath: require.resolve('./mock-agent-module'),
      capabilities: ['docs'],
      triggers: { patterns: ['docs'] }
    });

    const status = manager.getStatus();
    if (status.totalManifests !== 2) throw new Error('Should have 2 manifests');
    if (status.agents.length !== 2) throw new Error('Should list 2 agents');
    if (status.agents[0].state !== 'UNLOADED') throw new Error('Should be unloaded');
  });

  await test('Reconciliation timer', async () => {
    const orchestrator = new MockOrchestrator();
    const manager = new AgentLifecycleManager(orchestrator, { reconcileInterval: 100 });
    
    manager.startReconciliation();
    await new Promise(r => setTimeout(r, 50));
    manager.stopReconciliation();
    
    // Should not throw
  });

  console.log('\n6 passed, 0 failed');
  console.log('✅ All tests passed!\n');
}

// Create mock agent module for testing
const fs = require('fs');
const path = require('path');
const mockModulePath = path.join(__dirname, 'mock-agent-module.js');
fs.writeFileSync(mockModulePath, `
class MockAgent {
  async execute(task) {
    return 'Mock result for: ' + task;
  }
}
module.exports = MockAgent;
`);

runTests().catch(console.error);
