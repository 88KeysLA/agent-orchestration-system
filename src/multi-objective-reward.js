/**
 * Multi-Objective Reward - Scores agent results on multiple dimensions
 * Returns a weighted scalar for RL integration
 */
class MultiObjectiveReward {
  constructor(weights = {}) {
    this.weights = {
      quality: weights.quality !== undefined ? weights.quality : 0.4,
      speed: weights.speed !== undefined ? weights.speed : 0.2,
      cost: weights.cost !== undefined ? weights.cost : 0.2,
      relevance: weights.relevance !== undefined ? weights.relevance : 0.2
    };
  }

  score(result, metadata = {}) {
    const d = this.evaluate(result, metadata);
    return (
      d.quality * this.weights.quality +
      d.speed * this.weights.speed +
      d.cost * this.weights.cost +
      d.relevance * this.weights.relevance
    );
  }

  evaluate(result, metadata = {}) {
    return {
      quality: this._scoreQuality(result),
      speed: this._scoreSpeed(metadata.duration),
      cost: this._scoreCost(result, metadata.tokens),
      relevance: this._scoreRelevance(result, metadata.task)
    };
  }

  _scoreQuality(result) {
    if (!result) return 10;
    const str = typeof result === 'string' ? result : JSON.stringify(result);
    const len = str.length;

    let score = 0;
    if (len < 10) score = 10;
    else if (len < 50) score = 25;
    else if (len < 200) score = 45;
    else if (len < 1000) score = 60;
    else score = 55;

    if (/[-*]\s/.test(str) || /\d+\.\s/.test(str)) score += 10;
    if (/^#+\s/m.test(str) || /^[A-Z][^.]+:$/m.test(str)) score += 10;
    if (/```/.test(str)) score += 10;
    if ((str.match(/\n\n/g) || []).length >= 2) score += 10;

    return Math.min(100, score);
  }

  _scoreSpeed(durationMs) {
    if (durationMs === undefined || durationMs === null) return 50;
    if (durationMs < 100) return 100;
    if (durationMs < 1000) return 80 + (1000 - durationMs) / 1000 * 20;
    if (durationMs < 5000) return 50 + (5000 - durationMs) / 4000 * 30;
    if (durationMs < 30000) return 20 + (30000 - durationMs) / 25000 * 30;
    if (durationMs < 60000) return 10 + (60000 - durationMs) / 30000 * 10;
    return 10;
  }

  _scoreCost(result, tokens) {
    if (!tokens) return 50;
    const total = tokens.totalTokens || ((tokens.inputTokens || 0) + (tokens.outputTokens || 0));
    if (total === 0) return 50;

    const resultLen = typeof result === 'string' ? result.length : JSON.stringify(result).length;
    const efficiency = resultLen / total;

    if (efficiency < 1) return 30;
    if (efficiency < 3) return 50 + (efficiency - 1) * 10;
    if (efficiency < 5) return 70 + (efficiency - 3) * 10;
    if (efficiency < 8) return 90 + (efficiency - 5) * 3.33;
    return 100;
  }

  _scoreRelevance(result, task) {
    if (!task || !result) return 50;
    const str = typeof result === 'string' ? result : JSON.stringify(result);
    const taskWords = task.toLowerCase().split(/\W+/).filter(w => w.length >= 4);
    if (taskWords.length === 0) return 50;

    const resultLower = str.toLowerCase();
    const matches = taskWords.filter(w => resultLower.includes(w)).length;
    return 20 + (matches / taskWords.length) * 80;
  }

  setWeights(newWeights) {
    Object.assign(this.weights, newWeights);
    const total = Object.values(this.weights).reduce((a, b) => a + b, 0);
    if (total > 0) {
      for (const key of Object.keys(this.weights)) {
        this.weights[key] /= total;
      }
    }
  }
}

module.exports = MultiObjectiveReward;
