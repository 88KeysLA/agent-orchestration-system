/**
 * RedisBus - Real-time AI-to-AI message bus via Redis pub/sub
 * Drop-in replacement for MessageBus that works across machines/processes
 *
 * Usage:
 *   const bus = new RedisBus({ host: '192.168.0.60' });
 *   await bus.connect();
 *   bus.subscribe('kiro', 'ai.updates', (msg) => console.log(msg));
 *   bus.publish('ai.updates', { text: 'hello Claude' }, 'kiro');
 */
const Redis = require('ioredis');

class RedisBus {
  constructor(options = {}) {
    this.redisUrl = options.url || process.env.REDIS_URL || 'redis://localhost:6379';
    this.namespace = options.namespace || 'agent-bus';
    this.subscribers = new Map(); // agentId -> Map(topic -> [handlers])
    this._pub = null;
    this._sub = null;
    this._connected = false;
  }

  async connect() {
    this._pub = new Redis(this.redisUrl, { lazyConnect: true });
    this._sub = new Redis(this.redisUrl, { lazyConnect: true });

    await this._pub.connect();
    await this._sub.connect();

    // Route incoming messages to handlers
    this._sub.on('message', (channel, raw) => {
      const topic = channel.replace(`${this.namespace}:`, '');
      let msg;
      try { msg = JSON.parse(raw); } catch { return; }

      this.subscribers.forEach((topics) => {
        const handlers = topics.get(topic) || [];
        handlers.forEach(h => h(msg.payload, msg));
      });
    });

    this._connected = true;
  }

  // Subscribe agent to a topic
  subscribe(agentId, topic, handler) {
    if (!this.subscribers.has(agentId)) {
      this.subscribers.set(agentId, new Map());
    }
    const topics = this.subscribers.get(agentId);
    if (!topics.has(topic)) {
      topics.set(topic, []);
      this._sub.subscribe(`${this.namespace}:${topic}`);
    }
    topics.get(topic).push(handler);
  }

  // Publish message to a topic
  publish(topic, payload, fromAgent) {
    const msg = JSON.stringify({ topic, payload, fromAgent, timestamp: Date.now() });
    this._pub.publish(`${this.namespace}:${topic}`, msg);
  }

  // Request-response pattern (with timeout)
  async request(topic, payload, fromAgent, timeout = 5000) {
    const responseId = `response:${Date.now()}:${Math.random().toString(36).slice(2)}`;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this._sub.unsubscribe(`${this.namespace}:${responseId}`);
        reject(new Error(`Request timeout on ${topic}`));
      }, timeout);

      // Listen for response
      this._sub.subscribe(`${this.namespace}:${responseId}`);
      this._sub.once('message', (channel, raw) => {
        if (channel !== `${this.namespace}:${responseId}`) return;
        clearTimeout(timer);
        this._sub.unsubscribe(`${this.namespace}:${responseId}`);
        try { resolve(JSON.parse(raw).payload); } catch { reject(new Error('Bad response')); }
      });

      // Send request
      this.publish(topic, { ...payload, responseId }, fromAgent);
    });
  }

  // Disconnect cleanly
  async disconnect() {
    this._connected = false;
    await this._pub?.quit();
    await this._sub?.quit();
  }

  get connected() {
    return this._connected;
  }
}

module.exports = RedisBus;
