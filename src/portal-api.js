/**
 * Villa Portal — Backend API + WebSocket
 * Extends the agent orchestration server with portal-specific endpoints
 *
 * Phase 1: Chat, images, villa state, mode control
 * Phase 2: TTS (browser audio), visual stream proxy, music director proxy
 */
const path = require('path');
const fs = require('fs');
const express = require('express');

const IMAGES_DIR = path.join(process.env.HOME || '/tmp', 'generated-images');
const VOICE_URL = 'http://192.168.0.60:8405';
const MUSIC_URL = 'http://192.168.0.60:8404';
const SHOW_URL = 'http://192.168.0.62:8403';

// ElevenLabs config for browser TTS (Edward = default butler)
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || '';
const VOICE_CAST = {
  edward:    'goT3UYdM9bhm0n2lmKQx',
  priyanka:  'BpjGufoPiobT79j2vtj4',
  brock:     'DGzg6RaUqxGRTHSBjfgF',
  xavier:    'YOq2y2Up4RgXP2HyXjE5',
  announcer: 'gU0LNdkMOQCOrPrwtbee',
  blondie:   'exsUS4vynmxd379XN4yO',
};

function portalAuth(req, res, next) {
  const key = process.env.PORTAL_KEY;
  if (!key) return next();
  const token = req.headers.authorization?.replace('Bearer ', '') || req.query.token;
  if (token !== key) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

/** Proxy helper — forwards a request to an internal service */
async function proxyJSON(targetUrl, opts = {}) {
  const r = await fetch(targetUrl, {
    ...opts,
    signal: AbortSignal.timeout(opts.timeout || 10000),
  });
  return { status: r.status, data: await r.json() };
}

function setupRoutes(app, orchestrator) {

  // =========================================================================
  // Phase 1 — Core Portal
  // =========================================================================

  // Serve portal SPA at root
  app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'portal', 'index.html'));
  });

  // Static files for portal assets
  app.use('/portal', express.static(path.join(__dirname, 'portal')));

  // POST /api/chat — Execute task via orchestrator
  app.post('/api/chat', portalAuth, async (req, res) => {
    try {
      const { message, agent } = req.body;
      if (!message) return res.status(400).json({ error: 'message required' });
      const task = agent && agent !== 'auto' ? `${agent}:${message}` : message;
      const result = await orchestrator.execute(task);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/images — List generated images
  app.get('/api/images', portalAuth, async (req, res) => {
    try {
      const files = await fs.promises.readdir(IMAGES_DIR);
      const images = [];
      for (const f of files) {
        if (!/\.(png|jpg|jpeg|webp|gif)$/i.test(f)) continue;
        const stat = await fs.promises.stat(path.join(IMAGES_DIR, f));
        images.push({ name: f, size: stat.size, created: stat.birthtime });
      }
      images.sort((a, b) => new Date(b.created) - new Date(a.created));
      res.json({ images });
    } catch {
      res.json({ images: [] });
    }
  });

  // GET /api/images/:file — Serve individual image
  app.get('/api/images/:file', portalAuth, (req, res) => {
    const file = path.basename(req.params.file);
    const filePath = path.join(IMAGES_DIR, file);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Not found' });
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.sendFile(filePath);
  });

  // GET /api/villa/state — Aggregated villa state
  app.get('/api/villa/state', portalAuth, async (req, res) => {
    try {
      const ctx = orchestrator.context ? await orchestrator.context.getContext() : {};
      await orchestrator.health.checkAll();
      const agents = Array.from(orchestrator.agents.keys()).map(name => {
        const s = orchestrator.health.getStatus(name);
        const meta = orchestrator._agentMeta.get(name) || {};
        return { name, status: s ? s.status : 'unknown', type: meta.type || 'unknown' };
      });
      res.json({
        mode: ctx.ha?.villa_mode || 'UNKNOWN',
        mech_online: ctx.ha?.mech_online ?? null,
        lighting_enable: ctx.ha?.lighting_enable ?? null,
        media_enable: ctx.ha?.media_enable ?? null,
        visual_enable: ctx.ha?.visual_enable ?? null,
        time_aware_enable: ctx.ha?.time_aware_enable ?? null,
        time: ctx.time || {},
        agents,
        agentCount: agents.length
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/villa/mode — Set villa mode
  app.post('/api/villa/mode', portalAuth, async (req, res) => {
    try {
      const { mode } = req.body;
      if (!mode) return res.status(400).json({ error: 'mode required' });
      const result = await orchestrator.execute(`ha:mode:${mode}`);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/villa/speak — Proxy to Villa Voice (plays on Sonos)
  app.post('/api/villa/speak', portalAuth, async (req, res) => {
    try {
      const r = await fetch(`${VOICE_URL}/speak`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req.body),
        signal: AbortSignal.timeout(15000)
      });
      const data = await r.json();
      res.json(data);
    } catch (err) {
      res.status(502).json({ error: `Villa Voice unreachable: ${err.message}` });
    }
  });

  // GET /api/services/health — Check all villa services
  app.get('/api/services/health', portalAuth, async (req, res) => {
    const checks = [
      { name: 'intent-resolver', url: 'http://192.168.0.60:8400/health' },
      { name: 'villa-voice', url: `${VOICE_URL}/health` },
      { name: 'music-director', url: `${MUSIC_URL}/health` },
      { name: 'show-pipeline', url: `${SHOW_URL}/health` },
      { name: 'rag', url: 'http://192.168.0.60:8450/health' },
      { name: 'ollama', url: 'http://192.168.0.60:11434/api/tags' },
    ];
    const results = await Promise.allSettled(checks.map(async s => {
      try {
        const r = await fetch(s.url, { signal: AbortSignal.timeout(3000) });
        return { name: s.name, status: r.ok ? 'healthy' : 'degraded', code: r.status };
      } catch {
        return { name: s.name, status: 'down' };
      }
    }));
    res.json({ services: results.map(r => r.value || { name: 'unknown', status: 'error' }) });
  });

  // =========================================================================
  // Phase 2 — TTS (Browser Audio), Visual Stream, Music Director
  // =========================================================================

  // POST /api/villa/tts — Generate TTS audio for browser playback
  // Returns MP3 audio blob directly (not played on Sonos)
  app.post('/api/villa/tts', portalAuth, async (req, res) => {
    try {
      const { text, voice } = req.body;
      if (!text) return res.status(400).json({ error: 'text required' });
      if (!ELEVENLABS_API_KEY) return res.status(503).json({ error: 'ElevenLabs API key not configured' });

      const voiceId = VOICE_CAST[(voice || 'edward').toLowerCase()] || VOICE_CAST.edward;

      const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`, {
        method: 'POST',
        headers: {
          'xi-api-key': ELEVENLABS_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text,
          model_id: 'eleven_turbo_v2_5',
          voice_settings: { stability: 0.5, similarity_boost: 0.8 },
        }),
        signal: AbortSignal.timeout(30000),
      });

      if (!r.ok) {
        const err = await r.text();
        return res.status(r.status).json({ error: `ElevenLabs error: ${err.substring(0, 200)}` });
      }

      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Cache-Control', 'public, max-age=600');
      const buffer = Buffer.from(await r.arrayBuffer());
      res.send(buffer);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/stream/show — Proxy MJPEG from Show Mac compositor
  app.get('/api/stream/show', portalAuth, async (req, res) => {
    try {
      const width = req.query.width || 720;
      const fps = req.query.fps || 15;
      const quality = req.query.quality || 70;
      const streamUrl = `${SHOW_URL}/stream/mjpeg?width=${width}&fps=${fps}&quality=${quality}`;

      const upstream = await fetch(streamUrl, { signal: AbortSignal.timeout(5000) });
      if (!upstream.ok) return res.status(upstream.status).json({ error: 'Show pipeline unavailable' });

      // Pass through MJPEG stream
      res.setHeader('Content-Type', upstream.headers.get('content-type') || 'multipart/x-mixed-replace; boundary=frame');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const reader = upstream.body.getReader();
      const pump = async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done || res.writableEnded) break;
            res.write(value);
          }
        } catch {}
        if (!res.writableEnded) res.end();
      };

      req.on('close', () => {
        reader.cancel().catch(() => {});
      });

      pump();
    } catch (err) {
      res.status(502).json({ error: `Show pipeline unreachable: ${err.message}` });
    }
  });

  // GET /api/show/state — Show Mac visual state
  app.get('/api/show/state', portalAuth, async (req, res) => {
    try {
      const { data } = await proxyJSON(`${SHOW_URL}/state`);
      res.json(data);
    } catch (err) {
      res.status(502).json({ error: `Show pipeline unreachable: ${err.message}` });
    }
  });

  // GET /api/show/audio — Live audio state from Show Mac
  app.get('/api/show/audio', portalAuth, async (req, res) => {
    try {
      const { data } = await proxyJSON(`${SHOW_URL}/audio`);
      res.json(data);
    } catch (err) {
      res.status(502).json({ error: `Show pipeline unreachable: ${err.message}` });
    }
  });

  // --- Music Director Proxies ---

  // GET /api/music/state — Current music context
  app.get('/api/music/state', portalAuth, async (req, res) => {
    try {
      const { data } = await proxyJSON(`${MUSIC_URL}/state`);
      res.json(data);
    } catch (err) {
      res.status(502).json({ error: `Music Director unreachable: ${err.message}` });
    }
  });

  // GET /api/music/recommendations — Mood-aware recommendations
  app.get('/api/music/recommendations', portalAuth, async (req, res) => {
    try {
      const limit = req.query.limit || 10;
      const { data } = await proxyJSON(`${MUSIC_URL}/recommendations?limit=${limit}`);
      res.json(data);
    } catch (err) {
      res.status(502).json({ error: `Music Director unreachable: ${err.message}` });
    }
  });

  // POST /api/music/play — Play on Sonos via Music Director
  app.post('/api/music/play', portalAuth, async (req, res) => {
    try {
      const { data } = await proxyJSON(`${MUSIC_URL}/play`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req.body),
      });
      res.json(data);
    } catch (err) {
      res.status(502).json({ error: `Music Director unreachable: ${err.message}` });
    }
  });

  // POST /api/music/mood — Override music mood
  app.post('/api/music/mood', portalAuth, async (req, res) => {
    try {
      const { data } = await proxyJSON(`${MUSIC_URL}/mood-override`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req.body),
      });
      res.json(data);
    } catch (err) {
      res.status(502).json({ error: `Music Director unreachable: ${err.message}` });
    }
  });

  // GET /api/music/players — Sonos player states
  app.get('/api/music/players', portalAuth, async (req, res) => {
    try {
      const { data } = await proxyJSON(`${MUSIC_URL}/players`);
      res.json(data);
    } catch (err) {
      res.status(502).json({ error: `Music Director unreachable: ${err.message}` });
    }
  });
}

function setupWebSocket(httpServer, orchestrator) {
  let WebSocket;
  try { WebSocket = require('ws'); } catch { console.log('[Portal] ws package not installed — WebSocket disabled'); return null; }

  const wss = new WebSocket.Server({ server: httpServer, path: '/ws' });

  wss.on('connection', (ws, req) => {
    const key = process.env.PORTAL_KEY;
    if (key) {
      const url = new URL(req.url, `http://${req.headers.host}`);
      const token = url.searchParams.get('token');
      if (token !== key) {
        ws.close(4001, 'Unauthorized');
        return;
      }
    }

    console.log('[Portal] WebSocket client connected');
    let autoSpeak = false;

    ws.on('message', async (data) => {
      try {
        const msg = JSON.parse(data);

        if (msg.type === 'chat') {
          const task = msg.agent && msg.agent !== 'auto'
            ? `${msg.agent}:${msg.message}` : msg.message;
          ws.send(JSON.stringify({ type: 'chat_start', id: msg.id }));

          const result = await orchestrator.execute(task);
          const response = {
            type: 'chat_response',
            id: msg.id,
            result: result.result,
            agent: result.agent,
            duration: result.duration,
            success: result.success,
            taskId: result.taskId
          };

          // Auto-speak: generate TTS audio URL alongside response
          if (autoSpeak && ELEVENLABS_API_KEY && result.success && typeof result.result === 'string') {
            response.audioUrl = `/api/villa/tts`;
            response.audioText = result.result.substring(0, 500);
          }

          ws.send(JSON.stringify(response));
        } else if (msg.type === 'set_auto_speak') {
          autoSpeak = !!msg.enabled;
          ws.send(JSON.stringify({ type: 'auto_speak_set', enabled: autoSpeak }));
        } else if (msg.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
        }
      } catch (err) {
        ws.send(JSON.stringify({ type: 'error', message: err.message }));
      }
    });

    ws.on('close', () => console.log('[Portal] WebSocket client disconnected'));
    ws.send(JSON.stringify({ type: 'connected', timestamp: Date.now() }));
  });

  // Broadcast orchestrator events to all portal clients
  if (orchestrator.eventStore) {
    orchestrator.eventStore.subscribe('*', (event) => {
      const msg = JSON.stringify({ type: 'event', event });
      for (const client of wss.clients) {
        if (client.readyState === WebSocket.OPEN) client.send(msg);
      }
    });
  }

  console.log('[Portal] WebSocket server attached at /ws');
  return wss;
}

module.exports = { setupRoutes, setupWebSocket };
