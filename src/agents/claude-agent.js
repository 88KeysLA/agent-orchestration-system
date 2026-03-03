/**
 * ClaudeAPIAgent - Wraps Claude API as an orchestrator-compatible agent
 * Lazy-loads @anthropic-ai/sdk so this module is safe to import without the package
 *
 * Supports two modes:
 *   - Text-only (no toolkit): single request/response
 *   - Tool-using (with toolkit): multi-round tool call loop via Anthropic tool use API
 */
class ClaudeAPIAgent {
  constructor(options = {}) {
    this.apiKey = options.apiKey || process.env.ANTHROPIC_API_KEY;
    this.model = options.model || 'claude-sonnet-4-6';
    this.systemPrompt = options.systemPrompt || 'You are a helpful assistant.';
    this.maxTokens = options.maxTokens || 4096;
    this.toolkit = options.toolkit || null;
    this.maxToolRounds = options.maxToolRounds || 10;
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

    // Text-only path (no tools)
    if (!this.toolkit || this.toolkit.size === 0) {
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

    // Tool-use loop
    const messages = [{ role: 'user', content: task }];
    const tools = this.toolkit.getDefinitions();
    let totalInput = 0, totalOutput = 0;

    for (let round = 0; round < this.maxToolRounds; round++) {
      const response = await client.messages.create({
        model: this.model,
        max_tokens: this.maxTokens,
        system: this.systemPrompt,
        messages,
        tools
      });

      totalInput += response.usage.input_tokens;
      totalOutput += response.usage.output_tokens;

      if (response.stop_reason !== 'tool_use') {
        this.lastUsage = { inputTokens: totalInput, outputTokens: totalOutput, toolRounds: round };
        const text = response.content.filter(c => c.type === 'text').map(c => c.text).join('\n');
        return text || '(no response)';
      }

      // Process tool calls
      messages.push({ role: 'assistant', content: response.content });

      const toolResults = [];
      for (const block of response.content) {
        if (block.type === 'tool_use') {
          const result = await this.toolkit.execute(block.name, block.input);
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: result
          });
        }
      }

      messages.push({ role: 'user', content: toolResults });
    }

    this.lastUsage = { inputTokens: totalInput, outputTokens: totalOutput, toolRounds: this.maxToolRounds };
    return 'Max tool rounds reached';
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
