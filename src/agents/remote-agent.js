/**
 * RemoteAgent - Proxy agent that routes tasks to a remote Mac via Redis
 * Implements standard agent interface (execute, healthCheck)
 *
 * Usage:
 *   const agent = new RemoteAgent({ name: 'fx-ollama', bus });
 *   orc.registerAgent('fx-ollama', '1.0.0', agent, { strengths: ['fast inference'] });
 */
const HEARTBEAT_TOPIC = 'agent.heartbeat';
const TASK_TOPIC = 'agent.tasks';
const HEARTBEAT_TIMEOUT = 35000; // miss 3 heartbeats

class RemoteAgent {
  constructor(options = {}) {
    this.name = options.name;
    this.bus = options.bus; // shared RedisBus instance
    this.timeout = options.timeout || 30000;
    this._lastHeartbeat = null;
    this._latency = null;
    this._capabilities = {};
    this._listening = false;
  }

  // Start listening for heartbeats (call once after bus.connect())
  listen() {
    if (this._listening) return;
    this._listening = true;
    this.bus.subscribe(`proxy:${this.name}`, HEARTBEAT_TOPIC, (payload) => {
      if (payload.name === this.name) {
        this._lastHeartbeat = Date.now(); // local receipt time, not remote ts
        this._latency = payload.ts ? Date.now() - payload.ts : null;
        this._capabilities = payload.capabilities || {};
      }
    });
  }

  async execute(task) {
    const result = await this.bus.request(
      `${TASK_TOPIC}.${this.name}`,
      { task },
      `proxy:${this.name}`,
      this.timeout
    );
    if (result.error) throw new Error(result.error);
    return result.result;
  }

  async healthCheck() {
    if (!this._lastHeartbeat) return false;
    return (Date.now() - this._lastHeartbeat) < HEARTBEAT_TIMEOUT;
  }

  get capabilities() {
    return this._capabilities;
  }

  get latency() {
    return this._latency;
  }
}

module.exports = RemoteAgent;
