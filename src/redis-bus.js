/**
 * RedisBus - Real-time AI-to-AI message bus via Redis pub/sub
 * Drop-in replacement for MessageBus that works across machines/processes
 *
 * Usage:
 *   const bus = new RedisBus({ host: '192.168.0.60' });
 *   await bus.connect();
 *   bus.subscribe("villa", "ai.updates', (msg) => console.log(msg));
 *   bus.publish('ai.updates', { text: 'hello' }, 'villa');
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
    this.maxMessageSize = options.maxMessageSize || 1024 * 1024; // 1MB
    // Parse password from URL (ioredis may not extract it when options obj is also passed)
    const parsed = new URL(this.redisUrl);
    this.redisOptions = {
      lazyConnect: true,
      password: options.password || parsed.password || process.env.REDIS_PASSWORD || undefined,
      maxRetriesPerRequest: 3,
      enableReadyCheck: true
    };
  }

  async connect() {
    this._pub = new Redis(this.redisUrl, this.redisOptions);
    this._sub = new Redis(this.redisUrl, this.redisOptions);

    this._pub.on('error', (err) => console.error('Redis pub error:', err));
    this._sub.on('error', (err) => console.error('Redis sub error:', err));

    await this._pub.connect();
    await this._sub.connect();

    // Route incoming messages to handlers
    this._sub.on('message', (channel, raw) => {
      const topic = channel.replace(`${this.namespace}:`, '');
      let msg;
      try { 
        msg = JSON.parse(raw); 
      } catch (err) {
        console.error('JSON parse failed:', { channel, error: err.message });
        return;
      }

      this.subscribers.forEach((topics, agentId) => {
        if (agentId === msg.fromAgent) return; // self-exclusion
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
    if (!topic || typeof topic !== 'string') throw new Error('Invalid topic');
    if (!fromAgent || typeof fromAgent !== 'string') throw new Error('Invalid fromAgent');
    
    const msg = JSON.stringify({ topic, payload, fromAgent, timestamp: Date.now() });
    if (msg.length > this.maxMessageSize) {
      throw new Error(`Message too large: ${msg.length} bytes (max ${this.maxMessageSize})`);
    }
    
    this._pub.publish(`${this.namespace}:${topic}`, msg);
  }

  // Request-response pattern (with timeout)
  async request(topic, payload, fromAgent, timeout = 5000) {
    const responseId = `response:${Date.now()}:${Math.random().toString(36).slice(2)}`;
    const responseChannel = `${this.namespace}:${responseId}`;
    let handler;

    return new Promise((resolve, reject) => {
      const cleanup = async () => {
        clearTimeout(timer);
        if (handler) this._sub.removeListener('message', handler);
        await this._sub.unsubscribe(responseChannel);
      };

      const timer = setTimeout(async () => {
        await cleanup();
        reject(new Error(`Request timeout on ${topic}`));
      }, timeout);

      handler = async (channel, raw) => {
        if (channel !== responseChannel) return;
        await cleanup();
        try { 
          resolve(JSON.parse(raw).payload); 
        } catch (err) { 
          reject(new Error(`Bad response: ${err.message}`)); 
        }
      };

      this._sub.subscribe(responseChannel);
      this._sub.on('message', handler);
      this.publish(topic, { ...payload, responseId }, fromAgent);
    });
  }

  // Disconnect cleanly
  async disconnect() {
    this._connected = false;
    
    // Unsubscribe from all channels
    const channels = new Set();
    this.subscribers.forEach(topics => {
      topics.forEach((handlers, topic) => {
        channels.add(`${this.namespace}:${topic}`);
      });
    });
    
    for (const channel of channels) {
      await this._sub.unsubscribe(channel);
    }
    
    this.subscribers.clear();
    await this._pub?.quit();
    await this._sub?.quit();
    this._pub = null;
    this._sub = null;
  }

  get connected() {
    return this._connected;
  }
}

module.exports = RedisBus;
