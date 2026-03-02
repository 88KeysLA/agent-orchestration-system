#!/usr/bin/env node

/**
 * Agent Orchestration Server — Villa Romanza
 * Creates orchestrator, registers available agents, starts Express API
 *
 * Default port: 8406 (Villa service range)
 * Agents auto-register based on reachability:
 *   - Claude API (if ANTHROPIC_API_KEY set)
 *   - Ollama on Mech Mac (192.168.0.60:11434)
 *   - RAG on Mech Mac (192.168.0.60:8450)
 *   - Mock fallback if nothing else available
 */
const path = require('path');
const Orchestrator = require('./src/orchestrator');
const MultiObjectiveReward = require('./src/multi-objective-reward');
const createAPI = require('./src/api');

let ClaudeAPIAgent, OllamaAgent, RAGAgent, CompoundAgent, RedisBus;
try { ClaudeAPIAgent = require('./src/agents/claude-agent'); } catch {}
try { OllamaAgent = require('./src/agents/ollama-agent'); } catch {}
try { RAGAgent = require('./src/agents/rag-agent'); } catch {}
try { CompoundAgent = require('./src/agents/compound-agent'); } catch {}
try { RedisBus = require('./src/redis-bus'); } catch {}

const VILLA_SYSTEM_PROMPT = `You are an AI agent in the Villa Romanza orchestration system.
Villa Romanza is a large-scale smart home with 76 areas across 5 floors.
You assist with home automation, AV control, lighting, climate, and general tasks.
Be concise and actionable. When referencing devices, use their Home Assistant entity IDs.`;

async function main() {
  const port = parseInt(process.env.PORT) || 8406;

  const dataDir = process.env.DATA_DIR || path.join(__dirname, 'data');
  const scorer = new MultiObjectiveReward();
  const orc = new Orchestrator({
    rewardFn: (result, metadata) => scorer.score(result, metadata),
    persistPath: path.join(dataDir, 'rl-qtable.json'),
    eventStorePath: path.join(dataDir, 'events.json')
  });

  // Connect Redis bus for cross-machine messaging (if REDIS_URL set)
  let redisBus = null;
  if (RedisBus && process.env.REDIS_URL) {
    try {
      redisBus = new RedisBus({ url: process.env.REDIS_URL });
      await redisBus.connect();
      orc.bus = redisBus;
      console.log(`Redis bus: ${process.env.REDIS_URL}`);
    } catch (err) {
      console.log(`Skipped: Redis bus (${err.message})`);
      redisBus = null;
    }
  }

  // Register Claude agent if API key available
  if (ClaudeAPIAgent && process.env.ANTHROPIC_API_KEY) {
    const claude = new ClaudeAPIAgent({
      systemPrompt: process.env.CLAUDE_SYSTEM_PROMPT || VILLA_SYSTEM_PROMPT,
      maxTokens: parseInt(process.env.CLAUDE_MAX_TOKENS) || 4096
    });
    orc.registerAgent('claude', '1.0.0', claude, {
      type: 'cloud', provider: 'anthropic',
      strengths: ['complex reasoning', 'code generation', 'analysis']
    });
    console.log('Registered: claude (Anthropic API)');
  }

  // Register Ollama agent if host is reachable
  if (OllamaAgent) {
    const ollamaHost = process.env.OLLAMA_HOST || 'http://192.168.0.60:11434';
    const ollamaModel = process.env.OLLAMA_MODEL || 'llama3.1:8b';
    const ollama = new OllamaAgent({
      host: ollamaHost,
      model: ollamaModel,
      systemPrompt: VILLA_SYSTEM_PROMPT
    });

    const healthy = await ollama.healthCheck();
    if (healthy) {
      orc.registerAgent('ollama', '1.0.0', ollama, {
        type: 'local', provider: 'ollama',
        strengths: ['fast response', 'zero cost', 'routine tasks']
      });
      console.log(`Registered: ollama (${ollamaModel} at ${ollamaHost})`);
    } else {
      console.log(`Skipped: ollama (unreachable at ${ollamaHost})`);
    }
  }

  // Register RAG agent if server is reachable
  if (RAGAgent) {
    const ragHost = process.env.RAG_HOST || 'http://192.168.0.60:8450';
    const rag = new RAGAgent({ host: ragHost, topK: 5 });

    const healthy = await rag.healthCheck();
    if (healthy) {
      orc.registerAgent('rag', '1.0.0', rag, {
        type: 'local', provider: 'villa-rag',
        strengths: ['villa knowledge', 'documentation lookup', 'device info']
      });
      console.log(`Registered: rag (${ragHost})`);
    } else {
      console.log(`Skipped: rag (unreachable at ${ragHost})`);
    }
  }

  // Register compound RAG→Ollama agent if both are available
  if (CompoundAgent && orc.agents.has('rag') && orc.agents.has('ollama')) {
    const ragOllama = new CompoundAgent([
      { name: 'rag-retrieval', agent: orc.agents.get('rag') },
      {
        name: 'ollama-synthesis', agent: orc.agents.get('ollama'),
        promptTemplate: `You are a Villa Romanza assistant. Use the following context from the villa knowledge base to answer the question. If the context doesn't contain relevant information, say so and answer from general knowledge.\n\nContext:\n{context}\n\nQuestion: {task}`
      }
    ]);
    orc.registerAgent('rag-ollama', '1.0.0', ragOllama, {
      type: 'compound', provider: 'villa',
      strengths: ['villa knowledge', 'synthesized answers', 'device info', 'documentation']
    });
    console.log('Registered: rag-ollama (RAG retrieval + Ollama synthesis)');
  }

  // Fallback mock agent so system is never empty
  if (orc.agents.size === 0) {
    orc.registerAgent('mock', '1.0.0', {
      execute: async (task) => `[mock] Processed: ${task.substring(0, 100)}`,
      healthCheck: async () => true
    }, { type: 'mock' });
    console.log('Registered: mock (fallback)');
  }

  const app = createAPI(orc);

  const server = app.listen(port, () => {
    console.log(`\nVilla Romanza Agent Orchestration API on port ${port}`);
    console.log(`Agents: ${Array.from(orc.agents.keys()).join(', ')}`);
    console.log(`\nEndpoints:`);
    console.log(`  POST /api/tasks       - Execute a task`);
    console.log(`  POST /api/workflows   - Execute a workflow`);
    console.log(`  GET  /api/status      - System status`);
    console.log(`  GET  /api/agents      - List agents`);
    console.log(`  GET  /api/events      - Event history`);
    console.log(`  GET  /api/tasks/:id   - Get task result`);
    console.log(`  POST /api/tasks/:id/feedback - Submit feedback`);
    console.log(`  GET  /api/decisions   - Decision history`);
    console.log(`  GET  /api/rl-stats    - RL learning state`);
  });

  const shutdown = async () => {
    orc.shutdown();
    if (redisBus) await redisBus.disconnect().catch(() => {});
    server.close();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch(err => {
  console.error('Server startup failed:', err);
  process.exit(1);
});
