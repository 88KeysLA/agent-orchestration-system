/**
 * Explainer - Makes agent routing decisions transparent
 * Tracks reasoning and provides explanations
 */
class Explainer {
  constructor() {
    this.decisions = [];
  }

  // Record a decision with reasoning
  recordDecision(context, selectedAgent, alternatives, reasoning) {
    const decision = {
      id: this.decisions.length,
      timestamp: Date.now(),
      context,
      selectedAgent,
      alternatives,
      reasoning,
      factors: reasoning.factors || []
    };
    
    this.decisions.push(decision);
    return decision.id;
  }

  // Get explanation for a decision
  explain(decisionId) {
    const decision = this.decisions[decisionId];
    if (!decision) return null;
    
    return {
      decision: `Selected ${decision.selectedAgent}`,
      reasoning: decision.reasoning.summary,
      factors: decision.factors.map(f => `${f.name}: ${f.value} (weight: ${f.weight})`),
      alternatives: decision.alternatives.map(a => 
        `${a.agent} (score: ${a.score})`
      ),
      timestamp: new Date(decision.timestamp).toISOString()
    };
  }

  // Get decision history
  getHistory(limit = 10) {
    return this.decisions.slice(-limit).map(d => ({
      id: d.id,
      agent: d.selectedAgent,
      context: d.context.type || 'unknown',
      timestamp: d.timestamp
    }));
  }

  // Analyze decision patterns
  analyze() {
    const agentCounts = {};
    const contextCounts = {};
    
    this.decisions.forEach(d => {
      agentCounts[d.selectedAgent] = (agentCounts[d.selectedAgent] || 0) + 1;
      const ctx = d.context.type || 'unknown';
      contextCounts[ctx] = (contextCounts[ctx] || 0) + 1;
    });
    
    return {
      totalDecisions: this.decisions.length,
      agentUsage: agentCounts,
      contextDistribution: contextCounts,
      averageAlternatives: this.decisions.reduce((sum, d) => 
        sum + d.alternatives.length, 0) / this.decisions.length || 0
    };
  }

  // Clear history
  clear() {
    this.decisions = [];
  }
}

module.exports = Explainer;
