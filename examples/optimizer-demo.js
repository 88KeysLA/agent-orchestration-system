#!/usr/bin/env node
/**
 * Multi-Objective Optimizer Demo - Balancing multiple goals
 */
const MultiObjectiveOptimizer = require('../src/optimizer');

console.log('🎬 Multi-Objective Optimizer Demo\n');

// Scenario: Choosing deployment strategy
console.log('📊 Scenario: Choosing Deployment Strategy\n');

const optimizer = new MultiObjectiveOptimizer({
  speed: 0.3,
  quality: 0.4,
  cost: 0.2,
  longTerm: 0.1
});

console.log('Current weights:');
Object.entries(optimizer.weights).forEach(([obj, weight]) => {
  console.log(`  ${obj}: ${(weight * 100).toFixed(0)}%`);
});

// Define deployment options
const deploymentOptions = [
  {
    name: 'Quick Deploy',
    estimatedTime: 0.5,
    accuracy: 0.7,
    reliability: 0.75,
    testCoverage: 0.6,
    cost: 2,
    maintainability: 0.5,
    reusability: 0.4,
    scalability: 0.6,
    canParallelize: true
  },
  {
    name: 'Standard Deploy',
    estimatedTime: 2,
    accuracy: 0.85,
    reliability: 0.9,
    testCoverage: 0.8,
    cost: 1,
    maintainability: 0.8,
    reusability: 0.7,
    scalability: 0.8,
    canParallelize: false
  },
  {
    name: 'Enterprise Deploy',
    estimatedTime: 5,
    accuracy: 0.95,
    reliability: 0.98,
    testCoverage: 0.95,
    cost: 0.5,
    maintainability: 0.95,
    reusability: 0.9,
    scalability: 0.95,
    canParallelize: false
  }
];

console.log('\n\n🔍 Evaluating Options:\n');

const scores = optimizer.evaluate(deploymentOptions);

scores.forEach((score, i) => {
  console.log(`${i + 1}. ${score.option.name}`);
  console.log(`   Overall Score: ${score.weightedScore.toFixed(3)}`);
  console.log('   Objectives:');
  score.breakdown.forEach(b => {
    console.log(`     ${b.objective}: ${b.score} (weighted: ${b.weighted})`);
  });
  console.log();
});

// Show selected option
const best = scores[0];
console.log(`✅ Selected: ${best.option.name}\n`);

// Analyze trade-offs
console.log('⚖️  Trade-off Analysis:\n');
const analysis = optimizer.analyzeTradeoffs(scores);

analysis.tradeoffs.forEach((tradeoff, i) => {
  console.log(`Alternative ${i + 1}: ${tradeoff.option.name}`);
  console.log(`  Score difference: ${tradeoff.scoreDiff}`);
  
  if (tradeoff.advantages.length > 0) {
    console.log('  Advantages:');
    tradeoff.advantages.forEach(adv => console.log(`    + ${adv}`));
  }
  
  if (tradeoff.disadvantages.length > 0) {
    console.log('  Disadvantages:');
    tradeoff.disadvantages.forEach(dis => console.log(`    - ${dis}`));
  }
  console.log();
});

// Scenario 2: Optimize for speed
console.log('\n🚀 Scenario 2: Emergency Hotfix (Speed Priority)\n');

optimizer.updateWeights({
  speed: 0.3,
  quality: -0.2,
  cost: -0.05,
  longTerm: -0.05
});

console.log('Updated weights:');
Object.entries(optimizer.weights).forEach(([obj, weight]) => {
  console.log(`  ${obj}: ${(weight * 100).toFixed(0)}%`);
});

const hotfixBest = optimizer.select(deploymentOptions);
console.log(`\n✅ Selected for hotfix: ${hotfixBest.option.name}`);
console.log(`   Score: ${hotfixBest.weightedScore.toFixed(3)}`);

// Scenario 3: Optimize for long-term
console.log('\n\n🏗️  Scenario 3: Major Refactor (Long-term Priority)\n');

const longTermOptimizer = new MultiObjectiveOptimizer({
  speed: 0.1,
  quality: 0.3,
  cost: 0.1,
  longTerm: 0.5
});

console.log('Weights:');
Object.entries(longTermOptimizer.weights).forEach(([obj, weight]) => {
  console.log(`  ${obj}: ${(weight * 100).toFixed(0)}%`);
});

const refactorBest = longTermOptimizer.select(deploymentOptions);
console.log(`\n✅ Selected for refactor: ${refactorBest.option.name}`);
console.log(`   Score: ${refactorBest.weightedScore.toFixed(3)}`);

// Show history
console.log('\n\n📜 Optimization History:');
const history = optimizer.getHistory();
history.forEach((entry, i) => {
  console.log(`  [${i}] Selected: ${entry.selected.name} (score: ${entry.score.toFixed(3)})`);
});

console.log('\n✅ Demo complete!');
