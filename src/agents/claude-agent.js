/**
 * ClaudeAPIAgent - Wraps Claude API as an orchestrator-compatible agent
 * Lazy-loads @anthropic-ai/sdk so this module is safe to import without the package
 */
class ClaudeAPIAgent {
  constructor(options = {}) {
    this.apiKey = options.apiKey || process.env.ANTHROPIC_API_KEY;
    this.model = options.model || 'claude-sonnet-4-6';
    this.systemPrompt = options.systemPrompt || 'You are a helpful assistant.';
    this.maxTokens = options.maxTokens || 4096;
    this.lastUsage = null;
    this._client = null;
  }

  _getClient() {
    if (!this._client) {
      const Anthropic = require('@anthropic-ai/sdk');
      this._client = new Anthropic({ apiKey: this.apiKey });
    }
    return this._client;
  }

  async execute(task) {
    const client = this._getClient();
    const response = await client.messages.create({
      model: this.model,
      max_tokens: this.maxTokens,
      system: this.systemPrompt,
      messages: [{ role: 'user', content: task }]
    });
    this.lastUsage = {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens
    };
    return response.content[0].text;
  }

  async healthCheck() {
    if (!this.apiKey) return false;
    try {
      this._getClient();
      return true;
    } catch {
      return false;
    }
  }
}

module.exports = ClaudeAPIAgent;
