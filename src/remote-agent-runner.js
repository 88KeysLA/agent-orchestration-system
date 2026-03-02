/**
 * RemoteAgentRunner - Runs on any Villa Mac, connects to Redis bus
 * Executes tasks locally and reports back to orchestrator
 *
 * Usage:
 *   REDIS_URL=redis://192.168.0.60:6379 node src/remote-agent-runner.js \
 *     --name fx-ollama --model llama3.2:3b --ollama http://localhost:11434
 */
const RedisBus = require('./redis-bus');

const HEARTBEAT_INTERVAL = 10000;
const TASK_TOPIC = 'agent.tasks';
const HEARTBEAT_TOPIC = 'agent.heartbeat';

class RemoteAgentRunner {
  constructor(options = {}) {
    this.name = options.name || `remote-${require('os').hostname()}`;
    this.capabilities = options.capabilities || {};
    this.executeFn = options.executeFn; // async (task) => result
    this.bus = new RedisBus({ url: options.redisUrl });
    this._heartbeatTimer = null;
  }

  async start() {
    await this.bus.connect();

    // Subscribe to tasks directed at this agent
    this.bus.subscribe(this.name, `${TASK_TOPIC}.${this.name}`, async (payload, msg) => {
      const { task, responseId } = payload;
      try {
        const result = await this.executeFn(task);
        this.bus.publish(responseId, { result }, this.name);
      } catch (err) {
        this.bus.publish(responseId, { error: err.message }, this.name);
      }
    });

    // Send heartbeats
    const sendHeartbeat = () => {
      this.bus.publish(HEARTBEAT_TOPIC, {
        name: this.name,
        capabilities: this.capabilities,
        ts: Date.now()
      }, this.name);
    };

    sendHeartbeat();
    this._heartbeatTimer = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL);

    console.log(`[${this.name}] Running — connected to ${this.bus.redisUrl}`);
    return this;
  }

  async stop() {
    clearInterval(this._heartbeatTimer);
    await this.bus.disconnect();
  }
}

// CLI entry point
if (require.main === module) {
  const args = Object.fromEntries(
    process.argv.slice(2)
      .filter(a => a.startsWith('--'))
      .map(a => a.slice(2).split('='))
      .map(([k, v]) => [k, v || true])
  );

  const name = args.name || `remote-${require('os').hostname()}`;
  const ollamaHost = args.ollama || 'http://localhost:11434';
  const model = args.model || 'llama3.1:8b';

  const executeFn = async (task) => {
    const res = await fetch(`${ollamaHost}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt: task, stream: false })
    });
    if (!res.ok) throw new Error(`Ollama ${res.status}`);
    const data = await res.json();
    return data.response;
  };

  const runner = new RemoteAgentRunner({
    name,
    redisUrl: process.env.REDIS_URL,
    capabilities: { model, ollama: ollamaHost },
    executeFn
  });

  runner.start().catch(err => { console.error(err); process.exit(1); });

  process.on('SIGINT', () => runner.stop().then(() => process.exit(0)));
}

module.exports = RemoteAgentRunner;
