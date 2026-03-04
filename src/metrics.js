const client = require('prom-client');

const register = new client.Registry();

// Default metrics (CPU, memory, etc.)
client.collectDefaultMetrics({ register });

// Custom metrics
const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status'],
  registers: [register]
});

const httpRequestTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status'],
  registers: [register]
});

const workerUtilization = new client.Gauge({
  name: 'worker_utilization',
  help: 'Worker pool utilization (busy/total)',
  registers: [register]
});

const taskQueueSize = new client.Gauge({
  name: 'task_queue_size',
  help: 'Number of tasks in queue',
  registers: [register]
});

module.exports = {
  register,
  httpRequestDuration,
  httpRequestTotal,
  workerUtilization,
  taskQueueSize
};
