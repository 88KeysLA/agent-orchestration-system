#!/usr/bin/env node
/**
 * Full System Demo - All components integrated
 */
const Orchestrator = require('../src/orchestrator');
const MessageBus = require('../src/message-bus');
const SimpleRL = require('../src/simple-rl');
const AgentRegistry = require('../src/registry');
const HealthMonitor = require('../src/health-monitor');
const EventStore = require('../src/event-store');
const Explainer = require('../src/explainer');
const MultiObjectiveOptimizer = require('../src/optimizer');

console.log('🎬 Full System Demo - All Components Integrated\n');

// Initialize all components
console.log('🔧 Initializing components...\n');

const messageBus = new MessageBus();
const rl = new SimpleRL();
const registry = new AgentRegistry();
const healthMonitor = new HealthMonitor({ checkInterval: 2000, unhealthyThreshold: 2 });
const eventStore = new EventStore();
const explainer = new Explainer();
const optimizer = new MultiObjectiveOptimizer();

// Register agents
console.log('📦 Registering agents:\n');

registry.register('code-agent', '1.0.0', {
  execute: (task) => ({ result: 'Code written', quality: 0.9 })
}, { estimatedTime: 2, accuracy: 0.9, cost: 1 });

registry.register('test-agent', '1.0.0', {
  execute: (task) => ({ result: 'Tests passed', quality: 0.95 })
}, { estimatedTime: 1, accuracy: 0.95, cost: 0.5 });

registry.register('deploy-agent', '1.0.0', {
  execute: (task) => ({ result: 'Deployed', quality: 0.85 })
}, { estimatedTime: 3, accuracy: 0.85, cost: 2 });

registry.setActive('code-agent', '1.0.0');
registry.setActive('test-agent', '1.0.0');
registry.setActive('deploy-agent', '1.0.0');

console.log('  ✅ code-agent@1.0.0');
console.log('  ✅ test-agent@1.0.0');
console.log('  ✅ deploy-agent@1.0.0');

// Register health checks
healthMonitor.register('code-agent', async () => true);
healthMonitor.register('test-agent', async () => true);
healthMonitor.register('deploy-agent', async () => true);

console.log('\n💚 Health monitoring configured');

// Create orchestrator
const orchestrator = new Orchestrator({
  messageBus,
  rl,
  registry,
  healthMonitor,
  eventStore,
  explainer,
  optimizer
});

// Start system
console.log('\n🚀 Starting orchestration system...\n');
orchestrator.start();

// Show system status
const status = orchestrator.getStatus();
console.log('📊 System Status:');
console.log(`  Running: ${status.running}`);
console.log(`  Agents: ${status.agents}`);
console.log(`  Healthy: ${status.healthyAgents}`);
console.log('  Components:');
Object.entries(status.components).forEach(([name, enabled]) => {
  console.log(`    ${enabled ? '✅' : '❌'} ${name}`);
});

// Execute tasks
console.log('\n\n🎯 Executing Tasks:\n');

async function executeTasks() {
  // Task 1: Code task
  console.log('Task 1: Write code');
  let result = await orchestrator.executeTask({ type: 'code', complexity: 'medium' });
  console.log(`  Agent: ${result.agent}`);
  console.log(`  Result: ${result.success ? '✅ Success' : '❌ Failed'}`);
  
  // Task 2: Test task
  console.log('\nTask 2: Run tests');
  result = await orchestrator.executeTask({ type: 'test', framework: 'jest' });
  console.log(`  Agent: ${result.agent}`);
  console.log(`  Result: ${result.success ? '✅ Success' : '❌ Failed'}`);
  
  // Task 3: Deploy task
  console.log('\nTask 3: Deploy application');
  result = await orchestrator.executeTask({ type: 'deploy', environment: 'production' });
  console.log(`  Agent: ${result.agent}`);
  console.log(`  Result: ${result.success ? '✅ Success' : '❌ Failed'}`);
  
  // Show RL learning
  console.log('\n\n🧠 RL Learning Status:');
  console.log('  Best agents per context:');
  const contexts = [
    { type: 'code' },
    { type: 'test' },
    { type: 'deploy' }
  ];
  contexts.forEach(ctx => {
    const agents = ['code-agent', 'test-agent', 'deploy-agent'];
    const best = rl.bestAgent(ctx, agents);
    const qValue = rl.getQ(ctx, best);
    console.log(`    ${ctx.type}: ${best} (Q=${qValue.toFixed(2)})`);
  });
  
  // Show decision explanations
  console.log('\n\n🔍 Decision Explanations:');
  const history = explainer.getHistory(3);
  history.forEach((h, i) => {
    const explanation = explainer.explain(h.id);
    console.log(`\n  Decision ${i + 1}:`);
    console.log(`    ${explanation.decision}`);
    console.log(`    Reasoning: ${explanation.reasoning}`);
  });
  
  // Show event history
  console.log('\n\n📜 Event History:');
  const events = eventStore.getAllEvents().slice(-5);
  events.forEach(e => {
    console.log(`  [${new Date(e.timestamp).toISOString()}] ${e.eventType}`);
  });
  
  // Show optimizer analysis
  console.log('\n\n📈 Optimizer Analysis:');
  const optHistory = optimizer.getHistory();
  console.log(`  Total optimizations: ${optHistory.length}`);
  if (optHistory.length > 0) {
    const last = optHistory[optHistory.length - 1];
    console.log(`  Last selection: ${last.selected.name}`);
    console.log(`  Score: ${last.score.toFixed(3)}`);
  }
  
  // Final status
  console.log('\n\n✅ System Performance:');
  const analysis = explainer.analyze();
  console.log(`  Total decisions: ${analysis.totalDecisions}`);
  console.log('  Agent usage:');
  Object.entries(analysis.agentUsage).forEach(([agent, count]) => {
    console.log(`    ${agent}: ${count} times`);
  });
  
  // Stop system
  console.log('\n\n🛑 Stopping orchestration system...');
  orchestrator.stop();
  
  console.log('\n✅ Demo complete!');
}

executeTasks();
