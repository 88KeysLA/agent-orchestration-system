/**
 * OllamaAgent - Wraps Ollama REST API as an orchestrator-compatible agent
 * Uses native fetch (Node 18+), no external dependencies
 */
class OllamaAgent {
  constructor(options = {}) {
    this.host = options.host || 'http://192.168.0.60:11434';
    this.model = options.model || 'llama3.1:8b';
    this.systemPrompt = options.systemPrompt || '';
    this.lastUsage = null;
  }

  async execute(task) {
    const prompt = this.systemPrompt
      ? `${this.systemPrompt}\n\nUser: ${task}\nAssistant:`
      : task;

    const response = await fetch(`${this.host}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: this.model, prompt, stream: false })
    });

    if (!response.ok) {
      throw new Error(`Ollama error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    this.lastUsage = {
      totalTokens: (data.prompt_eval_count || 0) + (data.eval_count || 0),
      evalCount: data.eval_count || 0,
      evalDuration: data.eval_duration || 0
    };
    return data.response;
  }

  async healthCheck() {
    try {
      const response = await fetch(`${this.host}/api/tags`, {
        signal: AbortSignal.timeout(3000)
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}

module.exports = OllamaAgent;
