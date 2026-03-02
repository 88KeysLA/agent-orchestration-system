/**
 * Explainer Tests
 */
const Explainer = require('../src/explainer');

function test(name, fn) {
  try {
    fn();
    console.log(`✅ ${name}`);
  } catch (err) {
    console.error(`❌ ${name}: ${err.message}`);
    process.exit(1);
  }
}

// Test 1: Record and explain decision
test('Record and explain decision', () => {
  const explainer = new Explainer();
  
  const decisionId = explainer.recordDecision(
    { type: 'code', complexity: 'high' },
    'expert-coder',
    [
      { agent: 'expert-coder', score: 0.9 },
      { agent: 'junior-coder', score: 0.3 }
    ],
    {
      summary: 'Selected expert-coder due to high complexity',
      factors: [
        { name: 'complexity', value: 'high', weight: 0.8 },
        { name: 'experience', value: 'expert', weight: 0.9 }
      ]
    }
  );
  
  const explanation = explainer.explain(decisionId);
  if (!explanation) throw new Error('No explanation found');
  if (!explanation.decision.includes('expert-coder')) throw new Error('Wrong agent in explanation');
  if (explanation.factors.length !== 2) throw new Error('Wrong number of factors');
});

// Test 2: Decision history
test('Decision history', () => {
  const explainer = new Explainer();
  
  explainer.recordDecision({ type: 'code' }, 'coder', [], { summary: 'test' });
  explainer.recordDecision({ type: 'test' }, 'tester', [], { summary: 'test' });
  explainer.recordDecision({ type: 'deploy' }, 'deployer', [], { summary: 'test' });
  
  const history = explainer.getHistory(2);
  if (history.length !== 2) throw new Error('Should return last 2 decisions');
  if (history[0].agent !== 'tester') throw new Error('Wrong order');
  if (history[1].agent !== 'deployer') throw new Error('Wrong order');
});

// Test 3: Analyze patterns
test('Analyze decision patterns', () => {
  const explainer = new Explainer();
  
  explainer.recordDecision({ type: 'code' }, 'coder', [{ agent: 'coder', score: 1 }], { summary: 'test' });
  explainer.recordDecision({ type: 'code' }, 'coder', [{ agent: 'coder', score: 1 }], { summary: 'test' });
  explainer.recordDecision({ type: 'test' }, 'tester', [{ agent: 'tester', score: 1 }], { summary: 'test' });
  
  const analysis = explainer.analyze();
  if (analysis.totalDecisions !== 3) throw new Error('Wrong total');
  if (analysis.agentUsage.coder !== 2) throw new Error('Wrong coder count');
  if (analysis.agentUsage.tester !== 1) throw new Error('Wrong tester count');
  if (analysis.contextDistribution.code !== 2) throw new Error('Wrong context count');
});

// Test 4: Clear history
test('Clear history', () => {
  const explainer = new Explainer();
  
  explainer.recordDecision({ type: 'code' }, 'coder', [], { summary: 'test' });
  explainer.clear();
  
  const history = explainer.getHistory();
  if (history.length !== 0) throw new Error('History should be empty');
});

// Test 5: Multiple factors in explanation
test('Multiple factors in explanation', () => {
  const explainer = new Explainer();
  
  const decisionId = explainer.recordDecision(
    { type: 'code', language: 'rust' },
    'rust-expert',
    [
      { agent: 'rust-expert', score: 0.95 },
      { agent: 'generalist', score: 0.6 }
    ],
    {
      summary: 'Rust expert selected for Rust task',
      factors: [
        { name: 'language-match', value: 'rust', weight: 1.0 },
        { name: 'expertise', value: 'expert', weight: 0.9 },
        { name: 'availability', value: 'available', weight: 0.7 }
      ]
    }
  );
  
  const explanation = explainer.explain(decisionId);
  if (explanation.factors.length !== 3) throw new Error('Should have 3 factors');
  if (!explanation.factors[0].includes('language-match')) throw new Error('Missing factor');
});

console.log('\n✅ All explainer tests passed!');
