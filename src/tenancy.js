/**
 * TenantManager - Multi-tenancy with isolation and resource quotas
 *
 * Usage:
 *   const tenants = new TenantManager();
 *   tenants.create('acme', { tasksPerHour: 100, concurrent: 5 });
 *   tenants.checkQuota('acme'); // throws if over limit
 *   tenants.recordUsage('acme');
 *   tenants.getStats('acme');
 */
class TenantManager {
  constructor() {
    this._tenants = new Map();
  }

  create(id, options = {}) {
    if (this._tenants.has(id)) throw new Error(`Tenant exists: ${id}`);
    this._tenants.set(id, {
      id,
      config: options.config || {},
      quotas: {
        tasksPerHour: options.tasksPerHour || Infinity,
        concurrent: options.concurrent || Infinity
      },
      usage: { total: 0, active: 0, hourly: [] } // hourly: [{ ts, count }]
    });
    return this;
  }

  get(id) {
    const t = this._tenants.get(id);
    if (!t) throw new Error(`Tenant not found: ${id}`);
    return t;
  }

  checkQuota(id) {
    const t = this.get(id);
    const now = Date.now();
    const hourAgo = now - 3600000;

    // Count tasks in last hour
    const hourlyCount = t.usage.hourly
      .filter(e => e.ts > hourAgo)
      .reduce((s, e) => s + e.count, 0);

    if (hourlyCount >= t.quotas.tasksPerHour) {
      throw new Error(`Tenant ${id} exceeded hourly quota (${t.quotas.tasksPerHour})`);
    }
    if (t.usage.active >= t.quotas.concurrent) {
      throw new Error(`Tenant ${id} exceeded concurrent limit (${t.quotas.concurrent})`);
    }
  }

  recordUsage(id) {
    const t = this.get(id);
    const now = Date.now();
    t.usage.total++;
    t.usage.active++;
    t.usage.hourly.push({ ts: now, count: 1 });
    // Prune old entries
    const hourAgo = now - 3600000;
    t.usage.hourly = t.usage.hourly.filter(e => e.ts > hourAgo);
    return () => { t.usage.active = Math.max(0, t.usage.active - 1); }; // release fn
  }

  getStats(id) {
    const t = this.get(id);
    const hourAgo = Date.now() - 3600000;
    const tasksThisHour = t.usage.hourly.filter(e => e.ts > hourAgo).reduce((s, e) => s + e.count, 0);
    return {
      id,
      total: t.usage.total,
      active: t.usage.active,
      tasksThisHour,
      quotas: t.quotas,
      config: t.config
    };
  }

  list() {
    return Array.from(this._tenants.keys());
  }

  delete(id) {
    return this._tenants.delete(id);
  }
}

module.exports = TenantManager;
