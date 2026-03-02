/**
 * REST API - Express wrapper around the Orchestrator
 * Returns an Express app (does not call listen — caller manages lifecycle)
 */
const express = require('express');

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function createAPI(orchestrator) {
  const app = express();
  app.use(express.json());

  // GET / — Status dashboard
  app.get('/', async (req, res) => {
    try {
      await orchestrator.health.checkAll();
      const agents = Array.from(orchestrator.agents.keys()).map(name => {
        const s = orchestrator.health.getStatus(name);
        const meta = orchestrator._agentMeta.get(name) || {};
        return { name, status: s ? s.status : 'unknown', type: meta.type || '-', strengths: (meta.strengths || []).join(', ') };
      });
      const stats = orchestrator.rl.getStats();
      const totalEvents = orchestrator.eventStore.getAllEvents().length;
      const decisions = orchestrator.explainer.analyze();
      const recentEvents = orchestrator.eventStore.getAllEvents().slice(-10);

      const agentRows = agents.map(a => {
        const dot = a.status === 'healthy' ? '&#x1F7E2;' : a.status === 'degraded' ? '&#x1F7E1;' : '&#x1F534;';
        return `<tr><td>${dot} ${esc(a.name)}</td><td>${esc(a.type)}</td><td>${esc(a.status)}</td><td>${esc(a.strengths)}</td></tr>`;
      }).join('');

      const rlRows = stats.slice(0, 20).map(e => {
        const parts = e.key.split('-');
        const agent = parts.pop();
        const ctx = parts.join('-');
        return `<tr><td>${esc(ctx)}</td><td>${esc(agent)}</td><td>${e.qValue.toFixed(1)}</td><td>${e.count}</td></tr>`;
      }).join('');

      const eventRows = recentEvents.reverse().map(e =>
        `<tr><td>${esc(e.aggregateId)}</td><td>${esc(e.eventType)}</td><td>${new Date(e.timestamp).toLocaleTimeString()}</td></tr>`
      ).join('');

      res.type('html').send(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Villa Orchestrator</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,system-ui,sans-serif;background:#1a1a2e;color:#e0e0e0;padding:20px}
  h1{color:#e94560;margin-bottom:4px}
  .sub{color:#888;margin-bottom:20px}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px}
  @media(max-width:768px){.grid{grid-template-columns:1fr}}
  .card{background:#16213e;border-radius:8px;padding:16px;border:1px solid #0f3460}
  .card h2{color:#e94560;font-size:14px;text-transform:uppercase;margin-bottom:8px}
  .stat{font-size:28px;font-weight:bold;color:#fff}
  .stat-label{font-size:12px;color:#888}
  table{width:100%;border-collapse:collapse;font-size:13px}
  th{text-align:left;color:#e94560;border-bottom:1px solid #0f3460;padding:6px 8px}
  td{padding:6px 8px;border-bottom:1px solid #0f346044}
  .stats-row{display:flex;gap:16px;margin-bottom:16px}
  .stats-row .card{flex:1;text-align:center}
</style></head><body>
<h1>Villa Romanza Orchestrator</h1>
<p class="sub">Agent orchestration with reinforcement learning</p>
<div class="stats-row">
  <div class="card"><div class="stat">${agents.length}</div><div class="stat-label">Agents</div></div>
  <div class="card"><div class="stat">${totalEvents}</div><div class="stat-label">Events</div></div>
  <div class="card"><div class="stat">${decisions.totalDecisions || 0}</div><div class="stat-label">Decisions</div></div>
  <div class="card"><div class="stat">${stats.length}</div><div class="stat-label">RL Entries</div></div>
</div>
<div class="grid">
  <div class="card"><h2>Agents</h2><table><tr><th>Name</th><th>Type</th><th>Status</th><th>Strengths</th></tr>${agentRows}</table></div>
  <div class="card"><h2>RL Q-Values (top 20)</h2><table><tr><th>Context</th><th>Agent</th><th>Q</th><th>Count</th></tr>${rlRows || '<tr><td colspan=4 style="color:#888">No data yet</td></tr>'}</table></div>
</div>
<div class="card"><h2>Recent Events (last 10)</h2><table><tr><th>Aggregate</th><th>Event</th><th>Time</th></tr>${eventRows || '<tr><td colspan=3 style="color:#888">No events yet</td></tr>'}</table></div>
</body></html>`);
    } catch (error) {
      res.status(500).send(`Error: ${error.message}`);
    }
  });

  // POST /api/tasks — Execute a single task
  app.post('/api/tasks', async (req, res) => {
    try {
      const { task, context } = req.body;
      if (!task) return res.status(400).json({ error: 'task is required' });
      const result = await orchestrator.execute(task, context);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/workflows — Execute a multi-step workflow
  app.post('/api/workflows', async (req, res) => {
    try {
      const { task } = req.body;
      if (!task) return res.status(400).json({ error: 'task is required' });
      const result = await orchestrator.executeWorkflow(task);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/status — System status
  app.get('/api/status', (req, res) => {
    try {
      res.json(orchestrator.getStatus());
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/agents — List agents with health
  app.get('/api/agents', async (req, res) => {
    try {
      await orchestrator.health.checkAll();
      const agents = Array.from(orchestrator.agents.keys()).map(name => {
        const status = orchestrator.health.getStatus(name);
        const agent = orchestrator.agents.get(name);
        return {
          name,
          status: status ? status.status : 'unknown',
          lastCheck: status ? status.lastCheck : null,
          latency: agent.latency != null ? agent.latency : undefined,
          capabilities: agent.capabilities && Object.keys(agent.capabilities).length ? agent.capabilities : undefined
        };
      });
      res.json({ agents });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/events — Event history
  app.get('/api/events', (req, res) => {
    try {
      const limit = parseInt(req.query.limit) || 50;
      const allEvents = orchestrator.eventStore.getAllEvents();
      res.json({ events: allEvents.slice(-limit), total: allEvents.length });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/rl-stats — RL learning state
  app.get('/api/rl-stats', (req, res) => {
    try {
      const stats = orchestrator.rl.getStats();
      const byContext = {};
      for (const entry of stats) {
        const parts = entry.key.split('-');
        const agent = parts.pop();
        const context = parts.join('-');
        if (!byContext[context]) byContext[context] = [];
        byContext[context].push({ agent, qValue: entry.qValue, count: entry.count });
      }
      res.json({
        entries: stats.length,
        totalUpdates: stats.reduce((sum, e) => sum + e.count, 0),
        byContext,
        raw: stats
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/tasks/:id — Retrieve a cached task result
  app.get('/api/tasks/:id', (req, res) => {
    try {
      const task = orchestrator.getTask(req.params.id);
      if (!task) return res.status(404).json({ error: 'Task not found' });
      res.json(task);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/tasks/:id/feedback — Submit human feedback for RL correction
  app.post('/api/tasks/:id/feedback', (req, res) => {
    try {
      const { rating, comment } = req.body;
      if (!rating || rating < 1 || rating > 5) {
        return res.status(400).json({ error: 'rating (1-5) is required' });
      }
      const feedback = orchestrator.submitFeedback(req.params.id, rating, comment);
      if (!feedback) return res.status(404).json({ error: 'Task not found' });
      res.json(feedback);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/decisions — Explainer decisions
  app.get('/api/decisions', (req, res) => {
    try {
      const limit = parseInt(req.query.limit) || 10;
      res.json({
        decisions: orchestrator.explainer.getHistory(limit),
        analysis: orchestrator.explainer.analyze()
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  return app;
}

module.exports = createAPI;
