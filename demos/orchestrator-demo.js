#!/usr/bin/env node

/**
 * Orchestrator Demo — End-to-end integration of all components
 *
 * Shows: agent registration, RL learning, explainer output,
 * event sourcing, health filtering, and multi-step workflows.
 */
const Orchestrator = require('../src/orchestrator');

// Mock agents with different specialties
function createAgent(name, keywords) {
  return {
    execute: async (task) => {
      const lower = task.toLowerCase();
      const match = keywords.some(kw => lower.includes(kw));
      if (match) {
        return `[${name}] Expert analysis of "${task.substring(0, 40)}": This is a detailed, thorough response with specific recommendations and implementation steps for the team to follow.`;
      }
      return `[${name}] Brief: ${task.substring(0, 30)}`;
    },
    healthCheck: async () => true
  };
}

async function main() {
  console.log('=== Agent Orchestration System — Integration Demo ===\n');

  const orc = new Orchestrator();

  // 1. Register agents with specialties
  console.log('--- Registering Agents ---');
  orc.registerAgent('coder', '1.0.0',
    createAgent('coder', ['build', 'implement', 'create', 'feature', 'add']),
    { role: 'implementation' }
  );
  orc.registerAgent('debugger', '1.0.0',
    createAgent('debugger', ['fix', 'bug', 'error', 'debug', 'crash']),
    { role: 'debugging' }
  );
  orc.registerAgent('researcher', '1.0.0',
    createAgent('researcher', ['investigate', 'analyze', 'understand', 'research']),
    { role: 'analysis' }
  );
  console.log('Registered: coder, debugger, researcher\n');

  // Disable exploration so RL learning is visible
  orc.rl.epsilon = 0;

  // 2. Execute tasks and show RL learning
  console.log('--- Executing Tasks (RL Learning) ---');
  const tasks = [
    'Fix the authentication bug in production',
    'Build a new user dashboard feature',
    'Investigate why the API is slow',
    'Fix a crash in the payment module',
    'Create a notification system',
    'Debug the memory leak',
    'Analyze the codebase for security issues',
    'Implement rate limiting',
    'Fix error handling in the router',
    'Build an agent marketplace',
  ];

  for (const task of tasks) {
    const result = await orc.execute(task);
    const check = result.success ? '\u2713' : '\u2717';
    console.log(`  ${check} [${result.agent}] "${task.substring(0, 45)}" (reward: ${result.reward})`);
  }

  // 3. Show RL Q-values
  console.log('\n--- RL Q-Values (Learned Agent Preferences) ---');
  const agents = ['coder', 'debugger', 'researcher'];
  const contexts = ['bugFix-generic', 'feature-generic', 'investigation-generic'];
  for (const ctx of contexts) {
    const values = agents.map(a => `${a}=${orc.rl.getQ(ctx, a).toFixed(1)}`).join(', ');
    console.log(`  ${ctx}: ${values}`);
  }

  // 4. Show explainer analysis
  console.log('\n--- Explainer Analysis ---');
  const analysis = orc.explainer.analyze();
  console.log(`  Total decisions: ${analysis.totalDecisions}`);
  console.log('  Agent usage:', JSON.stringify(analysis.agentUsage));
  console.log('  Context distribution:', JSON.stringify(analysis.contextDistribution));

  // 5. Show last decision explanation
  const history = orc.explainer.getHistory(1);
  if (history.length > 0) {
    const explanation = orc.explainer.explain(history[0].id);
    console.log(`\n--- Last Decision Explanation ---`);
    console.log(`  ${explanation.decision}`);
    console.log(`  Reasoning: ${explanation.reasoning}`);
    console.log(`  Factors: ${explanation.factors.join(', ')}`);
  }

  // 6. Show event store stats
  console.log('\n--- Event Store ---');
  const allEvents = orc.eventStore.getAllEvents();
  const eventTypes = {};
  allEvents.forEach(e => { eventTypes[e.eventType] = (eventTypes[e.eventType] || 0) + 1; });
  console.log(`  Total events: ${allEvents.length}`);
  console.log('  By type:', JSON.stringify(eventTypes));

  // 7. Execute a multi-step workflow
  console.log('\n--- Multi-Step Workflow ---');
  const wfResult = await orc.executeWorkflow('Build a new feature for the platform');
  console.log(`  Workflow: ${wfResult.workflowId}`);
  console.log(`  Success: ${wfResult.success}`);
  console.log(`  Mode: ${wfResult.mode}`);
  console.log(`  Pattern: ${wfResult.pattern}`);
  console.log(`  Steps completed: ${wfResult.steps.length}`);
  for (const step of wfResult.steps) {
    console.log(`    Step ${step.step}: ${step.action} -> [${step.agent}] ${step.success ? '\u2713' : '\u2717'}`);
  }

  // 8. Final status
  console.log('\n--- System Status ---');
  const status = orc.getStatus();
  console.log(`  Events recorded: ${status.events}`);
  console.log(`  Decisions made: ${status.decisions.totalDecisions}`);
  console.log(`  Registered agents: ${status.registry.length}`);

  orc.shutdown();
  console.log('\n=== Demo Complete ===\n');
}

main().catch(err => {
  console.error('Demo failed:', err);
  process.exit(1);
});
