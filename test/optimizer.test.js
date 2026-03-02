/**
 * Multi-Objective Optimizer Tests
 */
const MultiObjectiveOptimizer = require('../src/optimizer');

function test(name, fn) {
  try {
    fn();
    console.log(`✅ ${name}`);
  } catch (err) {
    console.error(`❌ ${name}: ${err.message}`);
    process.exit(1);
  }
}

// Test 1: Basic evaluation
test('Basic evaluation', () => {
  const optimizer = new MultiObjectiveOptimizer();
  
  const options = [
    { name: 'fast', estimatedTime: 1, accuracy: 0.7, cost: 2 },
    { name: 'quality', estimatedTime: 3, accuracy: 0.95, cost: 1 }
  ];
  
  const scores = optimizer.evaluate(options);
  if (scores.length !== 2) throw new Error('Should have 2 scores');
  if (!scores[0].weightedScore) throw new Error('Missing weighted score');
  if (!scores[0].objectives) throw new Error('Missing objectives');
});

// Test 2: Select best option
test('Select best option', () => {
  const optimizer = new MultiObjectiveOptimizer({
    speed: 0.8,
    quality: 0.1,
    cost: 0.05,
    longTerm: 0.05
  });
  
  const options = [
    { name: 'fast', estimatedTime: 1, accuracy: 0.7 },
    { name: 'slow', estimatedTime: 10, accuracy: 0.95 }
  ];
  
  const best = optimizer.select(options);
  if (best.option.name !== 'fast') throw new Error('Should select fast option');
});

// Test 3: Quality-focused optimization
test('Quality-focused optimization', () => {
  const optimizer = new MultiObjectiveOptimizer({
    speed: 0.1,
    quality: 0.8,
    cost: 0.05,
    longTerm: 0.05
  });
  
  const options = [
    { name: 'fast', estimatedTime: 1, accuracy: 0.7, reliability: 0.7 },
    { name: 'quality', estimatedTime: 5, accuracy: 0.95, reliability: 0.95 }
  ];
  
  const best = optimizer.select(options);
  if (best.option.name !== 'quality') throw new Error('Should select quality option');
});

// Test 4: Update weights
test('Update weights', () => {
  const optimizer = new MultiObjectiveOptimizer({
    speed: 0.5,
    quality: 0.5,
    cost: 0,
    longTerm: 0
  });
  
  optimizer.updateWeights({ speed: 0.2, quality: -0.2 });
  
  if (optimizer.weights.speed <= 0.5) throw new Error('Speed weight should increase');
  if (optimizer.weights.quality >= 0.5) throw new Error('Quality weight should decrease');
  
  // Weights should still sum to 1
  const sum = Object.values(optimizer.weights).reduce((a, b) => a + b, 0);
  if (Math.abs(sum - 1) > 0.01) throw new Error('Weights should sum to 1');
});

// Test 5: Trade-off analysis
test('Trade-off analysis', () => {
  const optimizer = new MultiObjectiveOptimizer();
  
  const options = [
    { name: 'balanced', estimatedTime: 2, accuracy: 0.85, cost: 1.5 },
    { name: 'fast', estimatedTime: 1, accuracy: 0.7, cost: 2 },
    { name: 'quality', estimatedTime: 5, accuracy: 0.95, cost: 1 }
  ];
  
  const scores = optimizer.evaluate(options);
  const analysis = optimizer.analyzeTradeoffs(scores);
  
  if (!analysis.selected) throw new Error('Should have selected option');
  if (!analysis.tradeoffs) throw new Error('Should have tradeoffs');
  if (analysis.tradeoffs.length === 0) throw new Error('Should have alternative tradeoffs');
});

// Test 6: History tracking
test('History tracking', () => {
  const optimizer = new MultiObjectiveOptimizer();
  
  const options = [
    { name: 'option1', estimatedTime: 1 },
    { name: 'option2', estimatedTime: 2 }
  ];
  
  optimizer.select(options);
  optimizer.select(options);
  
  const history = optimizer.getHistory();
  if (history.length !== 2) throw new Error('Should have 2 history entries');
  if (!history[0].selected) throw new Error('History should include selected option');
});

// Test 7: Long-term value optimization
test('Long-term value optimization', () => {
  const optimizer = new MultiObjectiveOptimizer({
    speed: 0.1,
    quality: 0.1,
    cost: 0.1,
    longTerm: 0.7
  });
  
  const options = [
    { name: 'quick-fix', estimatedTime: 1, maintainability: 0.3, reusability: 0.2 },
    { name: 'proper-solution', estimatedTime: 5, maintainability: 0.9, reusability: 0.9, scalability: 0.9 }
  ];
  
  const best = optimizer.select(options);
  if (best.option.name !== 'proper-solution') throw new Error('Should select long-term solution');
});

console.log('\n✅ All optimizer tests passed!');
