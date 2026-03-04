const RedisBus = require('./redis-bus');

class DistributedPool {
  constructor(redisBus, localPool) {
    this.bus = redisBus;
    this.localPool = localPool;
    this.nodes = new Map(); // Track available nodes
    this.pendingTasks = new Map();
    
    // Register this node
    this.nodeId = `${require('os').hostname()}-${process.pid}`;
    this.setupListeners();
    this.heartbeat();
  }

  setupListeners() {
    // Listen for task requests
    this.bus.subscribe('task:request', async (msg) => {
      if (msg.targetNode && msg.targetNode !== this.nodeId) return;
      
      try {
        const result = await this.localPool.execute(msg.task);
        await this.bus.publish('task:response', {
          taskId: msg.taskId,
          nodeId: this.nodeId,
          result
        });
      } catch (error) {
        await this.bus.publish('task:response', {
          taskId: msg.taskId,
          nodeId: this.nodeId,
          error: error.message
        });
      }
    });

    // Listen for task responses
    this.bus.subscribe('task:response', (msg) => {
      const pending = this.pendingTasks.get(msg.taskId);
      if (pending) {
        if (msg.error) {
          pending.reject(new Error(msg.error));
        } else {
          pending.resolve(msg.result);
        }
        this.pendingTasks.delete(msg.taskId);
      }
    });

    // Listen for node heartbeats
    this.bus.subscribe('node:heartbeat', (msg) => {
      this.nodes.set(msg.nodeId, {
        hostname: msg.hostname,
        cores: msg.cores,
        load: msg.load,
        lastSeen: Date.now()
      });
    });
  }

  async heartbeat() {
    const sendHeartbeat = async () => {
      await this.bus.publish('node:heartbeat', {
        nodeId: this.nodeId,
        hostname: require('os').hostname(),
        cores: require('os').cpus().length,
        load: require('os').loadavg()[0]
      });
    };

    await sendHeartbeat();
    setInterval(sendHeartbeat, 5000); // Every 5 seconds
  }

  async execute(task, targetNode = null) {
    const taskId = `${this.nodeId}-${Date.now()}-${Math.random()}`;
    
    return new Promise((resolve, reject) => {
      this.pendingTasks.set(taskId, { resolve, reject });
      
      // Timeout after 30 seconds
      setTimeout(() => {
        if (this.pendingTasks.has(taskId)) {
          this.pendingTasks.delete(taskId);
          reject(new Error('Task timeout'));
        }
      }, 30000);
      
      this.bus.publish('task:request', {
        taskId,
        task,
        targetNode,
        sourceNode: this.nodeId
      });
    });
  }

  getNodes() {
    const now = Date.now();
    const active = [];
    
    for (const [nodeId, info] of this.nodes.entries()) {
      if (now - info.lastSeen < 15000) { // Active in last 15 seconds
        active.push({ nodeId, ...info });
      }
    }
    
    return active;
  }

  async executeOnLeastLoaded(task) {
    const nodes = this.getNodes();
    if (nodes.length === 0) {
      // No remote nodes, use local
      return this.localPool.execute(task);
    }
    
    // Find least loaded node
    const leastLoaded = nodes.reduce((min, node) => 
      node.load < min.load ? node : min
    );
    
    return this.execute(task, leastLoaded.nodeId);
  }
}

module.exports = DistributedPool;
