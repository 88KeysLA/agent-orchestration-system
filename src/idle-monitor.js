/**
 * Idle Monitor - Detects system downtime for auto-task execution
 */
const os = require('os');
const ResearchEngine = require('./research-engine');

class IdleMonitor {
  constructor(orchestrator, config = {}) {
    this.orc = orchestrator;
    this.config = {
      idleThreshold: config.idleThreshold || 0.3,      // CPU < 30%
      loadThreshold: config.loadThreshold || 2.0,      // Load < 2.0
      quietHours: config.quietHours || ['02:00', '06:00'],
      checkInterval: config.checkInterval || 300000,   // 5 minutes
      enabled: config.enabled !== false
    };
    
    this.research = new ResearchEngine(orchestrator);
    this.taskQueue = [];
    this.running = false;
    this.stats = {
      tasksCompleted: 0,
      tasksQueued: 0,
      totalTime: 0
    };
  }

  /**
   * Start monitoring for idle time
   */
  start() {
    if (!this.config.enabled) {
      console.log('[IdleMonitor] Disabled in config');
      return;
    }
    
    console.log('[IdleMonitor] Starting...');
    console.log(`[IdleMonitor] Thresholds: CPU < ${this.config.idleThreshold * 100}%, Load < ${this.config.loadThreshold}`);
    console.log(`[IdleMonitor] Quiet hours: ${this.config.quietHours.join(' - ')}`);
    
    this.running = true;
    this.checkLoop();
  }

  /**
   * Stop monitoring
   */
  stop() {
    console.log('[IdleMonitor] Stopping...');
    this.running = false;
  }

  /**
   * Main check loop
   */
  async checkLoop() {
    while (this.running) {
      try {
        if (this.isIdle() && this.isQuietHours()) {
          console.log('[IdleMonitor] System idle, checking for tasks...');
          await this.executeNextTask();
        }
      } catch (error) {
        console.error('[IdleMonitor] Error:', error.message);
      }
      
      await this.sleep(this.config.checkInterval);
    }
  }

  /**
   * Check if system is idle
   */
  isIdle() {
    const cpus = os.cpus();
    const load = os.loadavg()[0];
    const cpuCount = cpus.length;
    
    // Calculate CPU usage (rough estimate)
    let totalIdle = 0;
    let totalTick = 0;
    
    for (const cpu of cpus) {
      for (const type in cpu.times) {
        totalTick += cpu.times[type];
      }
      totalIdle += cpu.times.idle;
    }
    
    const idlePercent = totalIdle / totalTick;
    const loadPercent = load / cpuCount;
    
    const isIdle = idlePercent > (1 - this.config.idleThreshold) && 
                   load < this.config.loadThreshold;
    
    if (!isIdle) {
      console.log(`[IdleMonitor] Not idle: CPU ${((1-idlePercent)*100).toFixed(1)}%, Load ${load.toFixed(2)}`);
    }
    
    return isIdle;
  }

  /**
   * Check if current time is in quiet hours
   */
  isQuietHours() {
    const now = new Date();
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    
    const [start, end] = this.config.quietHours;
    
    // Handle overnight ranges (e.g., 22:00 - 06:00)
    if (start > end) {
      return currentTime >= start || currentTime < end;
    }
    
    return currentTime >= start && currentTime < end;
  }

  /**
   * Queue a research task
   */
  queueTask(task) {
    this.taskQueue.push({
      ...task,
      queuedAt: Date.now(),
      priority: task.priority || 50
    });
    
    // Sort by priority
    this.taskQueue.sort((a, b) => b.priority - a.priority);
    this.stats.tasksQueued++;
    
    console.log(`[IdleMonitor] Queued: ${task.type} - ${task.description}`);
  }

  /**
   * Execute next task in queue
   */
  async executeNextTask() {
    if (this.taskQueue.length === 0) {
      console.log('[IdleMonitor] No tasks in queue');
      return;
    }
    
    const task = this.taskQueue.shift();
    console.log(`[IdleMonitor] Executing: ${task.description}`);
    
    const startTime = Date.now();
    
    try {
      let result;
      
      switch (task.type) {
        case 'research':
          result = await this.research.research(task.topic, task.options);
          await this.saveResearch(task, result);
          break;
          
        case 'documentation':
          result = await this.generateDocs(task);
          break;
          
        case 'testing':
          result = await this.generateTests(task);
          break;
          
        default:
          console.log(`[IdleMonitor] Unknown task type: ${task.type}`);
          return;
      }
      
      const duration = Date.now() - startTime;
      this.stats.tasksCompleted++;
      this.stats.totalTime += duration;
      
      console.log(`[IdleMonitor] Completed in ${(duration/1000).toFixed(1)}s`);
      console.log(`[IdleMonitor] Quality: ${result.quality?.score || 'N/A'}`);
      
      // Update TODO
      if (task.todoFile) {
        await this.updateTODO(task, result);
      }
      
    } catch (error) {
      console.error(`[IdleMonitor] Task failed:`, error.message);
    }
  }

  /**
   * Save research results
   */
  async saveResearch(task, result) {
    const fs = require('fs').promises;
    const path = require('path');
    
    const filename = task.topic
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    
    const filepath = path.join(
      process.cwd(),
      'research',
      `${filename}.md`
    );
    
    // Ensure directory exists
    await fs.mkdir(path.dirname(filepath), { recursive: true });
    
    // Write research
    const content = `# ${task.topic}

**Generated:** ${new Date().toISOString()}
**Quality Score:** ${result.quality.score}/100
**Duration:** ${(result.duration/1000).toFixed(1)}s
**LLM Contributions:** ${result.llmContributions.map(c => `${c.llm} (${c.score.toFixed(1)})`).join(', ')}

---

${result.content}
`;
    
    await fs.writeFile(filepath, content);
    console.log(`[IdleMonitor] Saved: ${filepath}`);
    
    return filepath;
  }

  /**
   * Update TODO file with completion
   */
  async updateTODO(task, result) {
    const fs = require('fs').promises;
    
    try {
      const content = await fs.readFile(task.todoFile, 'utf8');
      
      // Find and mark task complete
      const updated = content.replace(
        new RegExp(`- \\[ \\] ${task.description}`, 'g'),
        `- [x] ${task.description} (auto-completed: ${new Date().toISOString().split('T')[0]})`
      );
      
      await fs.writeFile(task.todoFile, updated);
      console.log(`[IdleMonitor] Updated TODO: ${task.todoFile}`);
    } catch (error) {
      console.error('[IdleMonitor] Failed to update TODO:', error.message);
    }
  }

  /**
   * Get monitoring stats
   */
  getStats() {
    return {
      ...this.stats,
      queueLength: this.taskQueue.length,
      avgTaskTime: this.stats.tasksCompleted > 0 
        ? this.stats.totalTime / this.stats.tasksCompleted 
        : 0,
      isIdle: this.isIdle(),
      isQuietHours: this.isQuietHours()
    };
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = IdleMonitor;
