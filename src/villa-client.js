/**
 * VillaClient - Dispatch tasks to the Villa Romanza orchestrator from any machine
 *
 * One-way outbound dispatch, no credentials shared,
 * you control exactly what task text crosses the boundary.
 *
 * Usage:
 *   const villa = new VillaClient('http://192.168.0.60:8406');
 *   const result = await villa.execute('Summarize this doc: ...');
 *   const agents = await villa.agents();
 *   const status = await villa.status();
 */
class VillaClient {
  constructor(baseUrl = 'http://192.168.0.60:8406', options = {}) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.timeout = options.timeout || 60000;
    this.defaultAgent = options.defaultAgent || null;
    this.apiKey = options.apiKey || process.env.VILLA_API_KEY || null;
  }

  // Execute a task on the Villa mesh, returns result string
  async execute(task, options = {}) {
    const body = { task };
    if (options.agent || this.defaultAgent) body.agent = options.agent || this.defaultAgent;
    if (options.context) body.context = options.context;

    const res = await this._fetch('/api/tasks', {
      method: 'POST',
      body: JSON.stringify(body)
    });

    return res.result;
  }

  // List available agents and their health/latency
  async agents() {
    return (await this._fetch('/api/agents')).agents;
  }

  // Get system status
  async status() {
    return this._fetch('/api/status');
  }

  // Check if Villa is reachable
  async ping() {
    try {
      await this._fetch('/health');
      return true;
    } catch {
      return false;
    }
  }

  async _fetch(path, options = {}) {
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    if (this.apiKey) headers['x-api-key'] = this.apiKey;
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers,
      signal: AbortSignal.timeout(this.timeout)
    });
    if (!res.ok) throw new Error(`Villa API error: ${res.status} ${res.statusText}`);
    return res.json();
  }
}

module.exports = VillaClient;
