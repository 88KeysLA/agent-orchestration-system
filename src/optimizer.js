/**
 * Multi-Objective Optimizer - Balances multiple goals
 * Optimizes for speed, quality, cost, and long-term value
 */
class MultiObjectiveOptimizer {
  constructor(weights = {}) {
    this.weights = {
      speed: weights.speed || 0.3,
      quality: weights.quality || 0.4,
      cost: weights.cost || 0.2,
      longTerm: weights.longTerm || 0.1
    };
    this.history = [];
  }

  // Evaluate options against multiple objectives
  evaluate(options, context = {}) {
    const scores = options.map(option => {
      const objectives = {
        speed: this.evaluateSpeed(option, context),
        quality: this.evaluateQuality(option, context),
        cost: this.evaluateCost(option, context),
        longTerm: this.evaluateLongTerm(option, context)
      };
      
      const weightedScore = 
        objectives.speed * this.weights.speed +
        objectives.quality * this.weights.quality +
        objectives.cost * this.weights.cost +
        objectives.longTerm * this.weights.longTerm;
      
      return {
        option,
        objectives,
        weightedScore,
        breakdown: this.getBreakdown(objectives)
      };
    });
    
    scores.sort((a, b) => b.weightedScore - a.weightedScore);
    
    this.history.push({
      context,
      options: options.length,
      selected: scores[0].option,
      score: scores[0].weightedScore,
      timestamp: Date.now()
    });
    
    return scores;
  }

  // Select best option
  select(options, context = {}) {
    const scores = this.evaluate(options, context);
    return scores[0];
  }

  // Evaluate speed objective
  evaluateSpeed(option, context) {
    const baseSpeed = option.estimatedTime ? 1 / option.estimatedTime : 0.5;
    const parallelBonus = option.canParallelize ? 0.2 : 0;
    return Math.min(1, baseSpeed + parallelBonus);
  }

  // Evaluate quality objective
  evaluateQuality(option, context) {
    const accuracy = option.accuracy || 0.7;
    const reliability = option.reliability || 0.8;
    const testCoverage = option.testCoverage || 0.5;
    return (accuracy + reliability + testCoverage) / 3;
  }

  // Evaluate cost objective
  evaluateCost(option, context) {
    const cost = option.cost || 1;
    return 1 / cost; // Lower cost = higher score
  }

  // Evaluate long-term value
  evaluateLongTerm(option, context) {
    const maintainability = option.maintainability || 0.6;
    const reusability = option.reusability || 0.5;
    const scalability = option.scalability || 0.7;
    return (maintainability + reusability + scalability) / 3;
  }

  // Get score breakdown
  getBreakdown(objectives) {
    return Object.entries(objectives).map(([name, score]) => ({
      objective: name,
      score: score.toFixed(2),
      weighted: (score * this.weights[name]).toFixed(2),
      weight: this.weights[name]
    }));
  }

  // Update weights based on feedback
  updateWeights(feedback) {
    Object.entries(feedback).forEach(([objective, adjustment]) => {
      if (this.weights[objective] !== undefined) {
        this.weights[objective] = Math.max(0, Math.min(1, 
          this.weights[objective] + adjustment
        ));
      }
    });
    
    // Normalize weights
    const total = Object.values(this.weights).reduce((a, b) => a + b, 0);
    Object.keys(this.weights).forEach(key => {
      this.weights[key] /= total;
    });
  }

  // Get optimization history
  getHistory(limit = 10) {
    return this.history.slice(-limit);
  }

  // Analyze trade-offs
  analyzeTradeoffs(scores) {
    const best = scores[0];
    const alternatives = scores.slice(1, 3);
    
    return {
      selected: best.option,
      score: best.weightedScore,
      tradeoffs: alternatives.map(alt => ({
        option: alt.option,
        scoreDiff: (best.weightedScore - alt.weightedScore).toFixed(2),
        advantages: this.findAdvantages(alt, best),
        disadvantages: this.findDisadvantages(alt, best)
      }))
    };
  }

  // Find where alternative is better
  findAdvantages(alt, best) {
    return Object.entries(alt.objectives)
      .filter(([key, val]) => val > best.objectives[key])
      .map(([key, val]) => `${key}: ${val.toFixed(2)} vs ${best.objectives[key].toFixed(2)}`);
  }

  // Find where alternative is worse
  findDisadvantages(alt, best) {
    return Object.entries(alt.objectives)
      .filter(([key, val]) => val < best.objectives[key])
      .map(([key, val]) => `${key}: ${val.toFixed(2)} vs ${best.objectives[key].toFixed(2)}`);
  }
}

module.exports = MultiObjectiveOptimizer;
