/**
 * GeminiAgent - Wraps Google Gemini API as an orchestrator-compatible agent
 * Lazy-loads @google/generative-ai so this module is safe to import without the package
 *
 * Supports two modes:
 *   - Text-only (no toolkit): single request/response
 *   - Tool-using (with toolkit): multi-round function calling loop
 */
class GeminiAgent {
  constructor(options = {}) {
    this.apiKey = options.apiKey || process.env.GEMINI_API_KEY;
    this.model = options.model || 'gemini-2.5-pro';
    this.systemPrompt = options.systemPrompt || 'You are a helpful assistant.';
    this.maxTokens = options.maxTokens || 8192;
    this.toolkit = options.toolkit || null;
    this.maxToolRounds = options.maxToolRounds || 10;
    this.lastUsage = null;
    this._genAI = null;
  }

  _getGenAI() {
    if (!this._genAI) {
      const { GoogleGenerativeAI } = require('@google/generative-ai');
      this._genAI = new GoogleGenerativeAI(this.apiKey);
    }
    return this._genAI;
  }

  /**
   * Convert Anthropic-format tool definitions to Gemini function declarations
   */
  _convertTools() {
    if (!this.toolkit || this.toolkit.size === 0) return null;
    const defs = this.toolkit.getDefinitions();
    return [{
      functionDeclarations: defs.map(t => ({
        name: t.name,
        description: t.description,
        parameters: t.input_schema
      }))
    }];
  }

  async execute(task) {
    const genAI = this._getGenAI();
    const tools = this._convertTools();

    const modelConfig = {
      model: this.model,
      systemInstruction: this.systemPrompt,
      generationConfig: { maxOutputTokens: this.maxTokens }
    };
    if (tools) modelConfig.tools = tools;

    const model = genAI.getGenerativeModel(modelConfig);

    // Text-only path (no tools)
    if (!tools) {
      const result = await model.generateContent(task);
      const response = result.response;
      this.lastUsage = {
        inputTokens: response.usageMetadata?.promptTokenCount || 0,
        outputTokens: response.usageMetadata?.candidatesTokenCount || 0
      };
      return response.text();
    }

    // Tool-use loop via chat
    const chat = model.startChat();
    let totalInput = 0, totalOutput = 0;

    let result = await chat.sendMessage(task);
    let response = result.response;
    totalInput += response.usageMetadata?.promptTokenCount || 0;
    totalOutput += response.usageMetadata?.candidatesTokenCount || 0;

    for (let round = 0; round < this.maxToolRounds; round++) {
      const parts = response.candidates?.[0]?.content?.parts || [];
      const functionCalls = parts.filter(p => p.functionCall);

      if (functionCalls.length === 0) {
        // No more function calls — return text
        this.lastUsage = { inputTokens: totalInput, outputTokens: totalOutput, toolRounds: round };
        const text = parts.filter(p => p.text).map(p => p.text).join('\n');
        return text || '(no response)';
      }

      // Execute tool calls and send results back
      const functionResponses = [];
      for (const part of functionCalls) {
        const { name, args } = part.functionCall;
        const toolResult = await this.toolkit.execute(name, args);
        functionResponses.push({
          functionResponse: {
            name,
            response: { result: toolResult }
          }
        });
      }

      result = await chat.sendMessage(functionResponses);
      response = result.response;
      totalInput += response.usageMetadata?.promptTokenCount || 0;
      totalOutput += response.usageMetadata?.candidatesTokenCount || 0;
    }

    this.lastUsage = { inputTokens: totalInput, outputTokens: totalOutput, toolRounds: this.maxToolRounds };
    return 'Max tool rounds reached';
  }

  async healthCheck() {
    if (!this.apiKey) return false;
    try {
      this._getGenAI();
      return true;
    } catch {
      return false;
    }
  }
}

module.exports = GeminiAgent;
