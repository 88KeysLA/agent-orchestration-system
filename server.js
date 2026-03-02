#!/usr/bin/env node

/**
 * Agent Orchestration Server
 * Creates orchestrator, registers available agents, starts Express API
 */
const Orchestrator = require('./src/orchestrator');
const MultiObjectiveReward = require('./src/multi-objective-reward');
const createAPI = require('./src/api');

let ClaudeAPIAgent, OllamaAgent;
try { ClaudeAPIAgent = require('./src/agents/claude-agent'); } catch {}
try { OllamaAgent = require('./src/agents/ollama-agent'); } catch {}

async function main() {
  const port = parseInt(process.env.PORT) || 3000;

  const scorer = new MultiObjectiveReward();
  const orc = new Orchestrator({
    rewardFn: (result, metadata) => scorer.score(result, metadata)
  });

  // Register Claude agent if API key available
  if (ClaudeAPIAgent && process.env.ANTHROPIC_API_KEY) {
    const claude = new ClaudeAPIAgent({
      systemPrompt: process.env.CLAUDE_SYSTEM_PROMPT || 'You are a helpful AI assistant.',
      maxTokens: parseInt(process.env.CLAUDE_MAX_TOKENS) || 4096
    });
    orc.registerAgent('claude', '1.0.0', claude, { type: 'cloud', provider: 'anthropic' });
    console.log('Registered: claude (Anthropic API)');
  }

  // Register Ollama agent if host is reachable
  if (OllamaAgent) {
    const ollamaHost = process.env.OLLAMA_HOST || 'http://192.168.0.60:11434';
    const ollamaModel = process.env.OLLAMA_MODEL || 'llama3.1:8b';
    const ollama = new OllamaAgent({ host: ollamaHost, model: ollamaModel });

    const healthy = await ollama.healthCheck();
    if (healthy) {
      orc.registerAgent('ollama', '1.0.0', ollama, { type: 'local', provider: 'ollama' });
      console.log(`Registered: ollama (${ollamaModel} at ${ollamaHost})`);
    } else {
      console.log(`Skipped: ollama (unreachable at ${ollamaHost})`);
    }
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
    console.log(`\nAgent Orchestration API on port ${port}`);
    console.log(`Agents: ${Array.from(orc.agents.keys()).join(', ')}`);
    console.log(`\nEndpoints:`);
    console.log(`  POST /api/tasks       - Execute a task`);
    console.log(`  POST /api/workflows   - Execute a workflow`);
    console.log(`  GET  /api/status      - System status`);
    console.log(`  GET  /api/agents      - List agents`);
    console.log(`  GET  /api/events      - Event history`);
    console.log(`  GET  /api/decisions   - Decision history`);
  });

  const shutdown = () => {
    orc.shutdown();
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
