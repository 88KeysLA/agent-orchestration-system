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

      const result = await stage.agent.execute(prompt);
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
