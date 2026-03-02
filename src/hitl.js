/**
 * HITL - Human-in-the-loop approval gates
 * Intercepts tasks matching registered patterns and waits for human approval
 *
 * Usage:
 *   const hitl = new HITL({ timeout: 30000, defaultAction: 'reject' });
 *   hitl.addGate(/delete|destroy/, async (taskId, task) => {
 *     console.log(`Approve? ${task}`);
 *   });
 *   const { approved } = await hitl.check('task-1', 'delete all files');
 */
class HITL {
  constructor(options = {}) {
    this.timeout = options.timeout || 30000;
    this.defaultAction = options.defaultAction || 'reject'; // on timeout: 'approve' | 'reject'
    this._gates = []; // { pattern, handler }
    this._pending = new Map(); // taskId -> { resolve, timer, task }
  }

  // Register a gate: pattern is string (substring) or RegExp
  addGate(pattern, handler) {
    this._gates.push({ pattern, handler });
  }

  // Check if task needs approval. Returns { approved, reason }
  async check(taskId, task) {
    const gate = this._gates.find(g =>
      g.pattern instanceof RegExp ? g.pattern.test(task) : task.includes(g.pattern)
    );
    if (!gate) return { approved: true };

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this._pending.delete(taskId);
        resolve(this.defaultAction === 'approve'
          ? { approved: true, reason: 'timeout-auto-approved' }
          : { approved: false, reason: 'timeout' });
      }, this.timeout);

      this._pending.set(taskId, { resolve, timer, task });
      gate.handler(taskId, task).catch(() => {});
    });
  }

  approve(taskId, notes = '') {
    const entry = this._pending.get(taskId);
    if (!entry) return false;
    clearTimeout(entry.timer);
    this._pending.delete(taskId);
    entry.resolve({ approved: true, notes });
    return true;
  }

  reject(taskId, reason = 'rejected') {
    const entry = this._pending.get(taskId);
    if (!entry) return false;
    clearTimeout(entry.timer);
    this._pending.delete(taskId);
    entry.resolve({ approved: false, reason });
    return true;
  }

  get pending() {
    return Array.from(this._pending.entries()).map(([id, e]) => ({ id, task: e.task }));
  }

  // Clear all pending gates (prevents timer leaks on shutdown)
  shutdown() {
    for (const [id, entry] of this._pending) {
      clearTimeout(entry.timer);
      entry.resolve({ approved: false, reason: 'shutdown' });
    }
    this._pending.clear();
  }
}

module.exports = HITL;
