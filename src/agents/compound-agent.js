/**
 * CompoundAgent - Chains multiple agents into a pipeline
 *
 * Primary use case: RAG retrieval → LLM synthesis
 * Each stage's output becomes context for the next stage.
 * Follows the standard agent interface (execute, healthCheck, lastUsage).
 */
class CompoundAgent {
  constructor(stages, options = {}) {
    if (!stages || stages.length < 2) {
      throw new Error('CompoundAgent requires at least 2 stages');
    }
    this.stages = stages; // [{ name, agent, promptTemplate? }]
    this.lastUsage = null;
    this.separator = options.separator || '\n\n---\n\n';
  }

  async execute(task) {
    // Strip agent prefix if present (e.g. "claude-ha:turn on lights" → "turn on lights")
    const prefixMatch = task.match(/^[\w-]+:(.*)/s);
    if (prefixMatch) task = prefixMatch[1].trim();

    let context = '';
    const usages = [];

    for (let i = 0; i < this.stages.length; i++) {
      const stage = this.stages[i];
      const isFirst = i === 0;
      const isLast = i === this.stages.length - 1;

      let prompt;
      if (stage.promptTemplate) {
        prompt = stage.promptTemplate
          .replace('{task}', task)
          .replace('{context}', context);
      } else if (isFirst) {
        prompt = task;
      } else {
        prompt = `Based on the following context, answer the question.\n\nContext:\n${context}\n\nQuestion: ${task}`;
      }

      let result = await stage.agent.execute(prompt);

      // Between stages: extract structured command if present (e.g. ha:state:...)
      if (!isLast && typeof result === 'string') {
        const cmdMatch = result.match(/^(ha:\S+.*)$/m) || result.match(/`(ha:\S+.*?)`/);
        if (cmdMatch) result = cmdMatch[1].trim();
        else result = result.trim();
      }

      context = isLast ? result : context + this.separator + result;

      if (stage.agent.lastUsage) {
        usages.push({ stage: stage.name, ...stage.agent.lastUsage });
      }
    }

    this.lastUsage = {
      stages: usages,
      totalStages: this.stages.length
    };

    return context;
  }

  async healthCheck() {
    for (const stage of this.stages) {
      const healthy = await stage.agent.healthCheck();
      if (!healthy) return false;
    }
    return true;
  }
}

module.exports = CompoundAgent;
