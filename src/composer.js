/**
 * AgentComposer - Build reusable multi-agent workflow templates
 *
 * Patterns:
 *   sequential - run agents in order, each gets previous output
 *   parallel   - run agents concurrently, collect all results
 *   fallback   - try agents in order, return first success
 *   pipeline   - like sequential but passes structured context
 *
 * Usage:
 *   const composer = new AgentComposer({ rag: ragAgent, ollama: ollamaAgent });
 *   composer.define('rag-then-ollama', [
 *     { agent: 'rag', role: 'retrieval' },
 *     { agent: 'ollama', role: 'synthesis', prompt: 'Context: {prev}\n\nQuestion: {task}' }
 *   ]);
 *   const result = await composer.run('rag-then-ollama', 'What is the villa layout?');
 */
class AgentComposer {
  constructor(agents = {}) {
    this._agents = agents;
    this._templates = new Map();
  }

  // Register a named template
  define(name, steps) {
    this._templates.set(name, steps);
    return this;
  }

  // Run a named template
  async run(name, task, vars = {}) {
    const steps = this._templates.get(name);
    if (!steps) throw new Error(`Template not found: ${name}`);
    return this.sequential(steps, task, vars);
  }

  // Run steps in order; each step receives previous output
  async sequential(steps, task, vars = {}) {
    let prev = task;
    const results = [];
    for (const step of steps) {
      const agent = this._resolve(step.agent);
      const input = step.prompt
        ? step.prompt.replace('{task}', task).replace('{prev}', prev).replace('{context}', prev)
        : prev;
      prev = await agent.execute(input);
      results.push({ role: step.role || step.agent, result: prev });
    }
    return { result: prev, steps: results };
  }

  // Run all steps concurrently with the same input
  async parallel(steps, task) {
    const results = await Promise.all(
      steps.map(async step => {
        const agent = this._resolve(step.agent);
        const result = await agent.execute(task);
        return { role: step.role || step.agent, result };
      })
    );
    return { result: results.map(r => r.result).join('\n\n'), steps: results };
  }

  // Try steps in order, return first success
  async fallback(steps, task) {
    const errors = [];
    for (const step of steps) {
      try {
        const agent = this._resolve(step.agent);
        const result = await agent.execute(task);
        return { result, usedAgent: step.agent, steps: [{ role: step.role || step.agent, result }] };
      } catch (err) {
        errors.push({ agent: step.agent, error: err.message });
      }
    }
    throw new Error(`All agents failed: ${errors.map(e => `${e.agent}(${e.error})`).join(', ')}`);
  }

  _resolve(agentOrName) {
    if (typeof agentOrName === 'string') {
      const agent = this._agents[agentOrName];
      if (!agent) throw new Error(`Agent not registered: ${agentOrName}`);
      return agent;
    }
    return agentOrName; // direct agent object
  }

  addAgent(name, agent) {
    this._agents[name] = agent;
    return this;
  }
}

module.exports = AgentComposer;
