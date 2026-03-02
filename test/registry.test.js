/**
 * Agent Registry Tests
 */
const AgentRegistry = require('../src/registry');

function test(name, fn) {
  try {
    fn();
    console.log(`✅ ${name}`);
  } catch (err) {
    console.error(`❌ ${name}: ${err.message}`);
    process.exit(1);
  }
}

// Test 1: Register and activate agent version
test('Register and activate agent version', () => {
  const registry = new AgentRegistry();
  
  const impl1 = { execute: () => 'v1' };
  registry.register('agent-1', '1.0.0', impl1);
  registry.setActive('agent-1', '1.0.0');
  
  const agent = registry.get('agent-1');
  if (!agent) throw new Error('Agent not found');
  if (agent.version !== '1.0.0') throw new Error('Wrong version');
  if (agent.implementation.execute() !== 'v1') throw new Error('Wrong implementation');
});

// Test 2: Multiple versions
test('Multiple versions', () => {
  const registry = new AgentRegistry();
  
  registry.register('agent-1', '1.0.0', { execute: () => 'v1' });
  registry.register('agent-1', '2.0.0', { execute: () => 'v2' });
  
  registry.setActive('agent-1', '1.0.0');
  let agent = registry.get('agent-1');
  if (agent.implementation.execute() !== 'v1') throw new Error('Should use v1');
  
  registry.setActive('agent-1', '2.0.0');
  agent = registry.get('agent-1');
  if (agent.implementation.execute() !== 'v2') throw new Error('Should use v2');
});

// Test 3: Canary deployment
test('Canary deployment', () => {
  const registry = new AgentRegistry();
  
  registry.register('agent-1', '1.0.0', { execute: () => 'v1' });
  registry.register('agent-1', '2.0.0', { execute: () => 'v2' });
  registry.setActive('agent-1', '1.0.0');
  
  const deploymentId = registry.startCanary('agent-1', '2.0.0', 50);
  
  // Check traffic split (approximate)
  let v1Count = 0;
  let v2Count = 0;
  for (let i = 0; i < 100; i++) {
    const agent = registry.get('agent-1');
    if (agent.implementation.execute() === 'v1') v1Count++;
    if (agent.implementation.execute() === 'v2') v2Count++;
  }
  
  // Should be roughly 50/50 (allow some variance)
  if (v2Count < 30 || v2Count > 70) {
    throw new Error(`Canary traffic split wrong: ${v2Count}% (expected ~50%)`);
  }
});

// Test 4: Promote canary
test('Promote canary', () => {
  const registry = new AgentRegistry();
  
  registry.register('agent-1', '1.0.0', { execute: () => 'v1' });
  registry.register('agent-1', '2.0.0', { execute: () => 'v2' });
  registry.setActive('agent-1', '1.0.0');
  
  const deploymentId = registry.startCanary('agent-1', '2.0.0', 10);
  registry.promoteCanary(deploymentId);
  
  // All traffic should go to v2
  for (let i = 0; i < 10; i++) {
    const agent = registry.get('agent-1');
    if (agent.implementation.execute() !== 'v2') {
      throw new Error('Should use v2 after promotion');
    }
  }
});

// Test 5: Rollback canary
test('Rollback canary', () => {
  const registry = new AgentRegistry();
  
  registry.register('agent-1', '1.0.0', { execute: () => 'v1' });
  registry.register('agent-1', '2.0.0', { execute: () => 'v2' });
  registry.setActive('agent-1', '1.0.0');
  
  const deploymentId = registry.startCanary('agent-1', '2.0.0', 50);
  registry.rollbackCanary(deploymentId);
  
  // All traffic should go back to v1
  for (let i = 0; i < 10; i++) {
    const agent = registry.get('agent-1');
    if (agent.implementation.execute() !== 'v1') {
      throw new Error('Should use v1 after rollback');
    }
  }
});

// Test 6: List agents
test('List agents', () => {
  const registry = new AgentRegistry();
  
  registry.register('agent-1', '1.0.0', {});
  registry.register('agent-2', '1.0.0', {});
  registry.setActive('agent-1', '1.0.0');
  
  const agents = registry.list();
  if (agents.length !== 2) throw new Error('Should have 2 agents');
  if (!agents.find(a => a.agentId === 'agent-1')) throw new Error('Missing agent-1');
  if (!agents.find(a => a.agentId === 'agent-2')) throw new Error('Missing agent-2');
});

console.log('\n✅ All registry tests passed!');
