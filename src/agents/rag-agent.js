/**
 * RAGAgent - Queries a Villa Romanza RAG server as an orchestrator-compatible agent
 * Uses native fetch (Node 18+), no external dependencies
 */
class RAGAgent {
  constructor(options = {}) {
    this.host = options.host || 'http://192.168.0.60:8450';
    this.topK = options.topK || 5;
    this.lastUsage = null;
  }

  async execute(task) {
    const startTime = Date.now();
    const response = await fetch(`${this.host}/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: task, top_k: this.topK })
    });

    if (!response.ok) {
      throw new Error(`RAG error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const duration = Date.now() - startTime;

    // Villa RAG returns { answer, sources, query_time_ms }
    // Generic RAG returns { results: [...] } or { matches: [...] }
    if (data.answer) {
      const sources = data.sources || [];
      this.lastUsage = {
        chunksReturned: sources.length,
        queryDuration: data.query_time_ms || duration,
        model: data.model_used || null
      };
      const sourceList = sources.map((s, i) =>
        `[${i + 1}] ${s.file || ''}${s.section ? ' > ' + s.section : ''} (${(s.score || 0).toFixed(3)})`
      ).join('\n');
      return sourceList ? `${data.answer}\n\nSources:\n${sourceList}` : data.answer;
    }

    const chunks = data.results || data.matches || [];
    this.lastUsage = {
      chunksReturned: chunks.length,
      queryDuration: duration
    };

    if (chunks.length === 0) {
      return 'No relevant documents found.';
    }

    return chunks.map((c, i) => {
      const text = c.text || c.content || c.document || '';
      const source = c.source || c.metadata?.source || '';
      const score = c.score != null ? ` (score: ${c.score.toFixed(3)})` : '';
      return `[${i + 1}]${source ? ' ' + source : ''}${score}\n${text}`;
    }).join('\n\n');
  }

  async healthCheck() {
    try {
      const response = await fetch(`${this.host}/health`, {
        signal: AbortSignal.timeout(3000)
      });
      return response.ok;
    } catch {
      try {
        const response = await fetch(this.host, {
          signal: AbortSignal.timeout(3000)
        });
        return response.ok;
      } catch {
        return false;
      }
    }
  }
}

module.exports = RAGAgent;
