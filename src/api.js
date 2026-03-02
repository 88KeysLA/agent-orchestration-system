/**
 * REST API - Express wrapper around the Orchestrator
 * Returns an Express app (does not call listen — caller manages lifecycle)
 */
const express = require('express');

function createAPI(orchestrator) {
  const app = express();
  app.use(express.json());

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
        return {
          name,
          status: status ? status.status : 'unknown',
          lastCheck: status ? status.lastCheck : null
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
