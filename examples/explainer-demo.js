#!/usr/bin/env node
/**
 * Explainer Demo - Transparent routing decisions
 */
const Explainer = require('../src/explainer');

console.log('🎬 Explainer Demo - Transparent Routing Decisions\n');

const explainer = new Explainer();

// Simulate routing decisions
console.log('📊 Making routing decisions:\n');

// Decision 1: Code task
const d1 = explainer.recordDecision(
  { type: 'code', language: 'rust', complexity: 'high' },
  'rust-expert',
  [
    { agent: 'rust-expert', score: 0.95 },
    { agent: 'generalist', score: 0.6 },
    { agent: 'junior-dev', score: 0.3 }
  ],
  {
    summary: 'Selected rust-expert due to language match and high complexity',
    factors: [
      { name: 'language-match', value: 'rust', weight: 1.0 },
      { name: 'complexity-handling', value: 'high', weight: 0.9 },
      { name: 'past-performance', value: '95%', weight: 0.8 }
    ]
  }
);

console.log('Decision 1: Code task (Rust, high complexity)');
console.log('  Selected: rust-expert');
console.log('  Alternatives: generalist (0.6), junior-dev (0.3)');

// Decision 2: Test task
const d2 = explainer.recordDecision(
  { type: 'test', framework: 'jest' },
  'test-specialist',
  [
    { agent: 'test-specialist', score: 0.9 },
    { agent: 'generalist', score: 0.7 }
  ],
  {
    summary: 'Test specialist has best framework knowledge',
    factors: [
      { name: 'framework-expertise', value: 'jest', weight: 0.9 },
      { name: 'test-coverage', value: '98%', weight: 0.85 }
    ]
  }
);

console.log('\nDecision 2: Test task (Jest framework)');
console.log('  Selected: test-specialist');
console.log('  Alternatives: generalist (0.7)');

// Decision 3: Deploy task
const d3 = explainer.recordDecision(
  { type: 'deploy', environment: 'production' },
  'senior-devops',
  [
    { agent: 'senior-devops', score: 0.98 },
    { agent: 'junior-devops', score: 0.5 }
  ],
  {
    summary: 'Production deployment requires senior expertise',
    factors: [
      { name: 'environment-risk', value: 'production', weight: 1.0 },
      { name: 'experience', value: 'senior', weight: 0.95 },
      { name: 'incident-rate', value: '0.1%', weight: 0.9 }
    ]
  }
);

console.log('\nDecision 3: Deploy task (Production)');
console.log('  Selected: senior-devops');
console.log('  Alternatives: junior-devops (0.5)');

// Explain decisions
console.log('\n\n🔍 Detailed Explanations:\n');

console.log('Decision 1 Explanation:');
const exp1 = explainer.explain(d1);
console.log(`  ${exp1.decision}`);
console.log(`  Reasoning: ${exp1.reasoning}`);
console.log('  Factors:');
exp1.factors.forEach(f => console.log(`    - ${f}`));
console.log('  Alternatives considered:');
exp1.alternatives.forEach(a => console.log(`    - ${a}`));

console.log('\nDecision 3 Explanation:');
const exp3 = explainer.explain(d3);
console.log(`  ${exp3.decision}`);
console.log(`  Reasoning: ${exp3.reasoning}`);
console.log('  Factors:');
exp3.factors.forEach(f => console.log(`    - ${f}`));

// Analyze patterns
console.log('\n\n📈 Decision Analysis:\n');
const analysis = explainer.analyze();
console.log(`Total decisions: ${analysis.totalDecisions}`);
console.log('\nAgent usage:');
Object.entries(analysis.agentUsage).forEach(([agent, count]) => {
  console.log(`  ${agent}: ${count} times`);
});
console.log('\nContext distribution:');
Object.entries(analysis.contextDistribution).forEach(([ctx, count]) => {
  console.log(`  ${ctx}: ${count} times`);
});
console.log(`\nAverage alternatives considered: ${analysis.averageAlternatives.toFixed(1)}`);

// Show history
console.log('\n\n📜 Recent History:');
const history = explainer.getHistory(3);
history.forEach(h => {
  console.log(`  [${h.id}] ${h.agent} for ${h.context} task`);
});

console.log('\n✅ Demo complete!');
