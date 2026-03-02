/**
 * Orchestrator Tests
 */
const Orchestrator = require('../src/orchestrator');
const MessageBus = require('../src/message-bus');
const SimpleRL = require('../src/simple-rl');
const AgentRegistry = require('../src/registry');
const HealthMonitor = require('../src/health-monitor');
const EventStore = require('../src/event-store');
const Explainer = require('../src/explainer');
const MultiObjectiveOptimizer = require('../src/optimizer');

function test(name, fn) {
  return fn().then(() => {
    console.log(`✅ ${name}`);
  }).catch(err => {
    console.error(`❌ ${name}: ${err.message}`);
    process.exit(1);
  });
}

// Test 1: Basic orchestration
async function testBasicOrchestration() {
  const orchestrator = new Orchestrator({});
  
  await orchestrator.start();
  if (!orchestrator.running) throw new Error('Should be running');
  
  orchestrator.stop();
  if (orchestrator.running) throw new Error('Should be stopped');
}

// Test 2: Execute task with minimal components
async function testMinimalExecution() {
  const orchestrator = new Orchestrator({});
  
  const result = await orchestrator.executeTask({ type: 'test' });
  if (!result.success) throw new Error('Task should succeed');
}

// Test 3: Execute with registry
async function testWithRegistry() {
  const registry = new AgentRegistry();
  registry.register('agent-1', '1.0.0', { execute: () => 'done' });
  registry.setActive('agent-1', '1.0.0');
  
  const orchestrator = new Orchestrator({ registry });
  
  const result = await orchestrator.executeTask({ type: 'test' });
  if (!result.success) throw new Error('Task should succeed');
  if (!result.agent) throw new Error('Should have agent');
}

// Test 4: Execute with RL
async function testWithRL() {
  const rl = new SimpleRL();
  const registry = new AgentRegistry();
  registry.register('agent-1', '1.0.0', {});
  registry.register('agent-2', '1.0.0', {});
  registry.setActive('agent-1', '1.0.0');
  registry.setActive('agent-2', '1.0.0');
  
  const orchestrator = new Orchestrator({ rl, registry });
  
  const result = await orchestrator.executeTask({ type: 'test' });
  if (!result.success) throw new Error('Task should succeed');
}

// Test 5: Execute with event store
async function testWithEventStore() {
  const eventStore = new EventStore();
  const orchestrator = new Orchestrator({ eventStore });
  
  await orchestrator.start();
  await orchestrator.executeTask({ type: 'test' });
  
  const events = eventStore.getAllEvents();
  if (events.length < 2) throw new Error('Should have events');
  
  const startEvent = events.find(e => e.eventType === 'ORCHESTRATOR_STARTED');
  if (!startEvent) throw new Error('Should have start event');
}

// Test 6: Execute with explainer
async function testWithExplainer() {
  const explainer = new Explainer();
  const registry = new AgentRegistry();
  registry.register('agent-1', '1.0.0', {});
  registry.setActive('agent-1', '1.0.0');
  
  const orchestrator = new Orchestrator({ explainer, registry });
  
  await orchestrator.executeTask({ type: 'test' });
  
  const history = explainer.getHistory();
  if (history.length === 0) throw new Error('Should have decision history');
}

// Test 7: Execute with optimizer
async function testWithOptimizer() {
  const optimizer = new MultiObjectiveOptimizer();
  const registry = new AgentRegistry();
  registry.register('agent-1', '1.0.0', {});
  registry.register('agent-2', '1.0.0', {});
  registry.setActive('agent-1', '1.0.0');
  registry.setActive('agent-2', '1.0.0');
  
  const orchestrator = new Orchestrator({ optimizer, registry });
  
  const result = await orchestrator.executeTask({ type: 'test' });
  if (!result.success) throw new Error('Task should succeed');
}

// Test 8: Get system status
async function testSystemStatus() {
  const messageBus = new MessageBus();
  const rl = new SimpleRL();
  const registry = new AgentRegistry();
  const eventStore = new EventStore();
  
  registry.register('agent-1', '1.0.0', {});
  registry.setActive('agent-1', '1.0.0');
  
  const orchestrator = new Orchestrator({
    messageBus,
    rl,
    registry,
    eventStore
  });
  
  const status = orchestrator.getStatus();
  if (!status.components.messageBus) throw new Error('Should have message bus');
  if (!status.components.rl) throw new Error('Should have RL');
  if (!status.components.registry) throw new Error('Should have registry');
  if (status.agents !== 1) throw new Error('Should have 1 agent');
}

// Test 9: Full integration
async function testFullIntegration() {
  const messageBus = new MessageBus();
  const rl = new SimpleRL();
  const registry = new AgentRegistry();
  const healthMonitor = new HealthMonitor({ checkInterval: 1000 });
  const eventStore = new EventStore();
  const explainer = new Explainer();
  const optimizer = new MultiObjectiveOptimizer();
  
  registry.register('agent-1', '1.0.0', {});
  registry.setActive('agent-1', '1.0.0');
  
  healthMonitor.register('agent-1', async () => true);
  
  const orchestrator = new Orchestrator({
    messageBus,
    rl,
    registry,
    healthMonitor,
    eventStore,
    explainer,
    optimizer
  });
  
  await orchestrator.start();
  const result = await orchestrator.executeTask({ type: 'test' });
  orchestrator.stop();
  
  if (!result.success) throw new Error('Task should succeed');
  
  const status = orchestrator.getStatus();
  if (Object.values(status.components).filter(Boolean).length !== 7) {
    throw new Error('Should have 7 components');
  }
}

(async () => {
  await test('Basic orchestration', testBasicOrchestration);
  await test('Minimal execution', testMinimalExecution);
  await test('Execute with registry', testWithRegistry);
  await test('Execute with RL', testWithRL);
  await test('Execute with event store', testWithEventStore);
  await test('Execute with explainer', testWithExplainer);
  await test('Execute with optimizer', testWithOptimizer);
  await test('Get system status', testSystemStatus);
  await test('Full integration', testFullIntegration);
  console.log('\n✅ All orchestrator tests passed!');
})();
