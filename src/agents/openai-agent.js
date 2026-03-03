/**
 * OpenAIAgent - Wraps OpenAI API as an orchestrator-compatible agent
 * Uses native fetch (no SDK dependency). Supports tool use via AgentToolkit.
 *
 * Two modes:
 *   - Text-only (no toolkit): single request/response
 *   - Tool-using (with toolkit): multi-round tool call loop
 */
class OpenAIAgent {
  constructor(options = {}) {
    this.apiKey = options.apiKey || process.env.OPENAI_API_KEY;
    this.model = options.model || 'gpt-4o';
    this.systemPrompt = options.systemPrompt || 'You are a helpful assistant.';
    this.maxTokens = options.maxTokens || 4096;
    this.toolkit = options.toolkit || null;
    this.maxToolRounds = options.maxToolRounds || 10;
    this.lastUsage = null;
    this._baseUrl = options.baseUrl || 'https://api.openai.com/v1';
    this._fetchFn = options.fetch || fetch;
  }

  _buildToolDefs() {
    if (!this.toolkit || this.toolkit.size === 0) return null;
    return this.toolkit.getDefinitions().map(t => ({
      type: 'function',
      function: { name: t.name, description: t.description, parameters: t.input_schema }
    }));
  }

  async execute(task) {
    const messages = [
      { role: 'system', content: this.systemPrompt },
      { role: 'user', content: task }
    ];

    const tools = this._buildToolDefs();
    let totalInput = 0, totalOutput = 0;

    for (let round = 0; round <= this.maxToolRounds; round++) {
      const body = { model: this.model, messages, max_tokens: this.maxTokens };
      if (tools) body.tools = tools;

      const response = await this._fetchFn(`${this._baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(60000)
      });

      if (!response.ok) {
        const err = await response.text();
        throw new Error(`OpenAI API ${response.status}: ${err}`);
      }

      const data = await response.json();
      const choice = data.choices[0];
      totalInput += data.usage?.prompt_tokens || 0;
      totalOutput += data.usage?.completion_tokens || 0;

      // No tool calls — return text
      if (choice.finish_reason !== 'tool_calls' || !choice.message.tool_calls) {
        this.lastUsage = { inputTokens: totalInput, outputTokens: totalOutput, toolRounds: round };
        return choice.message.content || '(no response)';
      }

      // Can't do tools without a toolkit
      if (!this.toolkit) {
        this.lastUsage = { inputTokens: totalInput, outputTokens: totalOutput, toolRounds: round };
        return choice.message.content || '(no response)';
      }

      // Process tool calls
      messages.push(choice.message);

      for (const toolCall of choice.message.tool_calls) {
        let args;
        try { args = JSON.parse(toolCall.function.arguments); } catch { args = {}; }
        const result = await this.toolkit.execute(toolCall.function.name, args);
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: result
        });
      }
    }

    this.lastUsage = { inputTokens: totalInput, outputTokens: totalOutput, toolRounds: this.maxToolRounds };
    return 'Max tool rounds reached';
  }

  async healthCheck() {
    if (!this.apiKey) return false;
    try {
      const response = await this._fetchFn(`${this._baseUrl}/models`, {
        headers: { 'Authorization': `Bearer ${this.apiKey}` },
        signal: AbortSignal.timeout(5000)
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}

module.exports = OpenAIAgent;
