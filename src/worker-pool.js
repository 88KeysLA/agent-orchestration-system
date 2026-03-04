const { Worker } = require('worker_threads');
const os = require('os');

class WorkerPool {
  constructor(workerScript, maxWorkers = os.cpus().length - 1) {
    this.workerScript = workerScript;
    this.maxWorkers = maxWorkers;
    this.workers = [];
    this.queue = [];
    this.activeJobs = new Map();
    
    console.log(`[WorkerPool] Initializing with ${this.maxWorkers} workers`);
  }

  async execute(task) {
    return new Promise((resolve, reject) => {
      const job = { task, resolve, reject };
      
      const worker = this._getAvailableWorker();
      if (worker) {
        this._runJob(worker, job);
      } else {
        this.queue.push(job);
      }
    });
  }

  _getAvailableWorker() {
    let worker = this.workers.find(w => !w.busy);
    
    if (!worker && this.workers.length < this.maxWorkers) {
      worker = this._createWorker();
    }
    
    return worker;
  }

  _createWorker() {
    const worker = new Worker(this.workerScript);
    worker.busy = false;
    
    worker.on('message', (result) => {
      const job = this.activeJobs.get(worker);
      if (job) {
        job.resolve(result);
        this.activeJobs.delete(worker);
        worker.busy = false;
        this._processQueue();
      }
    });
    
    worker.on('error', (error) => {
      const job = this.activeJobs.get(worker);
      if (job) {
        job.reject(error);
        this.activeJobs.delete(worker);
      }
      worker.busy = false;
      this._processQueue();
    });
    
    this.workers.push(worker);
    return worker;
  }

  _runJob(worker, job) {
    worker.busy = true;
    this.activeJobs.set(worker, job);
    worker.postMessage(job.task);
  }

  _processQueue() {
    if (this.queue.length === 0) return;
    
    const worker = this._getAvailableWorker();
    if (worker) {
      const job = this.queue.shift();
      this._runJob(worker, job);
    }
  }

  async shutdown() {
    await Promise.all(this.workers.map(w => w.terminate()));
    this.workers = [];
  }
}

module.exports = WorkerPool;
