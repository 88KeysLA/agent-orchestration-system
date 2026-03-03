/**
 * Villa Portal — Backend API + WebSocket
 * Extends the agent orchestration server with portal-specific endpoints
 *
 * Phase 1: Chat, images, villa state, mode control
 * Phase 2: TTS (browser audio), visual stream proxy, music director proxy
 * Phase 3: Demo sequences
 * Phase 4: Music Platform (unified search, Sonos playback, AI generation)
 */
const path = require('path');
const fs = require('fs');
const http = require('http');
const express = require('express');
const { DemoEngine } = require('./demo-engine');

/**
 * HA API helper using Node http module (avoids undici EHOSTUNREACH on multi-homed hosts)
 */
function haFetch(urlPath, { method = 'GET', body, timeout = 15000 } = {}) {
  const haUrl = process.env.HA_URL || 'http://192.168.1.6:8123';
  const haToken = process.env.HA_TOKEN || '';
  const url = new URL(urlPath, haUrl);

  return new Promise((resolve, reject) => {
    const reqBody = body ? JSON.stringify(body) : null;
    const req = http.request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method,
      headers: {
        'Authorization': `Bearer ${haToken}`,
        ...(reqBody ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(reqBody) } : {}),
      },
      timeout,
      family: 4, // Force IPv4
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, text: () => Promise.resolve(data), json: () => Promise.resolve(JSON.parse(data)) }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('HA request timeout')); });
    if (reqBody) req.write(reqBody);
    req.end();
  });
}

const IMAGES_DIR = path.join(process.env.HOME || '/tmp', 'generated-images');
const MUSIC_DIR = process.env.MUSIC_DIR || path.join(process.env.HOME || '/tmp', 'generated-music');
const VOICE_URL = 'http://192.168.0.60:8405';
const MUSIC_URL = 'http://192.168.0.60:8404';
const SHOW_URL = 'http://192.168.0.62:8403';
const HA_URL = process.env.HA_URL || 'http://192.168.1.6:8123';
const HA_TOKEN = process.env.HA_TOKEN || '';
if (HA_TOKEN) console.log(`[Portal] HA configured: ${HA_URL} (token ${HA_TOKEN.substring(0, 20)}...)`);
else console.log('[Portal] WARNING: HA_TOKEN not set');

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

function setupRoutes(app, orchestrator, { musicService, generationManager } = {}) {

  // Debug: test HA connectivity from inside server process
  app.get('/api/debug/ha', portalAuth, async (req, res) => {
    try {
      const r = await haFetch('/api/', { timeout: 5000 });
      const text = await r.text();
      res.json({ ok: r.ok, status: r.status, body: text.substring(0, 100) });
    } catch (err) {
      res.json({ error: err.message, code: err.code });
    }
  });

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

  // =========================================================================
  // Phase 4 — Music Platform (Unified Search, Sonos Playback, AI Generation)
  // =========================================================================

  // GET /api/music/services — Available music services
  app.get('/api/music/services', portalAuth, (req, res) => {
    if (!musicService) return res.json({ services: [] });
    res.json(musicService.getAvailableServices());
  });

  // GET /api/music/search — Unified music search
  app.get('/api/music/search', portalAuth, async (req, res) => {
    if (!musicService) return res.json({ results: {}, errors: { system: 'Music service not configured' } });
    try {
      const { q, service, limit } = req.query;
      if (!q) return res.status(400).json({ error: 'q (query) required' });
      const opts = { limit: parseInt(limit) || 20 };

      if (service && service !== 'all') {
        const result = await musicService.search(service, q, opts);
        res.json({ results: { [result.service]: result.results }, errors: {} });
      } else {
        const result = await musicService.searchAll(q, opts);
        res.json(result);
      }
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/music/sonos/play — Play on Sonos via HA
  // Supports: media playback, transport commands (_service_call), volume (_volume)
  app.post('/api/music/sonos/play', portalAuth, async (req, res) => {
    if (!HA_TOKEN) return res.status(503).json({ error: 'HA token not configured' });
    try {
      const { entityId, contentType, contentId } = req.body;
      if (!entityId) return res.status(400).json({ error: 'entityId required' });

      let haUrl, haBody;

      if (contentType === '_service_call') {
        // Transport commands: media_player/media_play_pause, etc.
        haUrl = `${HA_URL}/api/services/${contentId}`;
        haBody = { entity_id: entityId };
      } else if (contentType === '_volume') {
        haUrl = `${HA_URL}/api/services/media_player/volume_set`;
        haBody = { entity_id: entityId, volume_level: parseFloat(contentId) };
      } else {
        if (!contentId) return res.status(400).json({ error: 'contentId required' });
        haUrl = `${HA_URL}/api/services/media_player/play_media`;
        haBody = {
          entity_id: entityId,
          media_content_type: contentType || 'music',
          media_content_id: contentId,
        };
      }

      const haPath = haUrl.replace(HA_URL, '');
      const r = await haFetch(haPath, { method: 'POST', body: haBody, timeout: 10000 });

      if (!r.ok) {
        const text = await r.text();
        return res.status(r.status).json({ error: `HA error: ${text.substring(0, 200)}` });
      }

      res.json({ success: true, entityId });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/music/sonos/speakers — List Sonos speakers from HA
  // Uses HA template API to filter server-side (avoids 2.5MB /api/states download)
  app.get('/api/music/sonos/speakers', portalAuth, async (req, res) => {
    if (!HA_TOKEN) return res.json({ speakers: [] });
    try {
      const template = `[{% for s in states.media_player if 'tv' not in s.entity_id and 'avr' not in s.entity_id and 'apple_tv' not in s.entity_id and 'xbox' not in s.entity_id and s.attributes.friendly_name is defined %}{"entityId":"{{ s.entity_id }}","name":"{{ s.attributes.friendly_name }}","state":"{{ s.state }}","volume":{{ s.attributes.volume_level | default(0) }},"mediaTitle":"{{ s.attributes.media_title | default('') }}","mediaArtist":"{{ s.attributes.media_artist | default('') }}"}{{ "," if not loop.last }}{% endfor %}]`;

      const r = await haFetch('/api/template', { method: 'POST', body: { template } });

      if (!r.ok) return res.json({ speakers: [] });
      const text = await r.text();
      const speakers = JSON.parse(text)
        .sort((a, b) => a.name.localeCompare(b.name));

      res.json({ speakers });
    } catch (err) {
      console.error('[Speakers] fetch error:', err.message, err.cause || '');
      res.json({ speakers: [], error: err.message });
    }
  });

  // GET /api/music/sonos/now-playing/:entityId — Now playing for a specific speaker
  app.get('/api/music/sonos/now-playing/:entityId', portalAuth, async (req, res) => {
    if (!HA_TOKEN) return res.json({ error: 'HA not configured' });
    try {
      const entityId = req.params.entityId;
      const r = await haFetch(`/api/states/${entityId}`, { timeout: 5000 });
      if (!r.ok) return res.status(r.status).json({ error: 'Entity not found' });
      const state = await r.json();
      res.json({
        entityId: state.entity_id,
        state: state.state,
        title: state.attributes.media_title || null,
        artist: state.attributes.media_artist || null,
        album: state.attributes.media_album_name || null,
        albumArt: state.attributes.entity_picture
          ? `${HA_URL}${state.attributes.entity_picture}`
          : null,
        volume: state.attributes.volume_level,
        duration: state.attributes.media_duration || null,
        position: state.attributes.media_position || null,
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- AI Music Generation ---

  // POST /api/music/generate — Start AI generation job
  app.post('/api/music/generate', portalAuth, async (req, res) => {
    if (!generationManager) return res.status(503).json({ error: 'Generation not configured' });
    try {
      const { service, prompt, style, duration, instrumental } = req.body;
      if (!service || !prompt) return res.status(400).json({ error: 'service and prompt required' });
      const result = await generationManager.startGeneration(service, prompt, { style, duration, instrumental });
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/music/generate/:jobId — Poll generation job status
  app.get('/api/music/generate/:jobId', portalAuth, (req, res) => {
    if (!generationManager) return res.status(503).json({ error: 'Generation not configured' });
    const job = generationManager.getJob(req.params.jobId);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    res.json(job);
  });

  // GET /api/music/generated — List all generated tracks
  app.get('/api/music/generated', portalAuth, (req, res) => {
    if (!generationManager) return res.json({ tracks: [] });
    res.json({ tracks: generationManager.getGeneratedTracks() });
  });

  // POST /api/music/generated/:id/play — Play generated track on Sonos
  app.post('/api/music/generated/:id/play', portalAuth, async (req, res) => {
    if (!HA_TOKEN) return res.status(503).json({ error: 'HA token not configured' });
    try {
      const { entityId } = req.body;
      if (!entityId) return res.status(400).json({ error: 'entityId required' });
      const filename = req.params.id;
      const host = req.headers.host || 'localhost:8406';
      const proto = req.protocol || 'http';
      const audioUrl = `${proto}://${host}/api/music/audio/${encodeURIComponent(filename)}`;
      const contentId = `x-rincon-mp3radio://${audioUrl.replace(/^https?:\/\//, '')}`;

      const r = await haFetch('/api/services/media_player/play_media', {
        method: 'POST',
        body: { entity_id: entityId, media_content_type: 'music', media_content_id: contentId },
        timeout: 10000,
      });

      if (!r.ok) {
        const text = await r.text();
        return res.status(r.status).json({ error: `HA error: ${text.substring(0, 200)}` });
      }

      res.json({ success: true, entityId, contentId });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Serve generated music MP3s
  app.use('/api/music/audio', express.static(MUSIC_DIR));

  // GET /api/music/generate/jobs — List all generation jobs
  app.get('/api/music/generate/jobs', portalAuth, (req, res) => {
    if (!generationManager) return res.json({ jobs: [] });
    res.json({ jobs: generationManager.getAllJobs() });
  });

  // Serve service worker with correct scope
  app.get('/sw.js', (req, res) => {
    res.setHeader('Service-Worker-Allowed', '/');
    res.setHeader('Content-Type', 'application/javascript');
    res.sendFile(path.join(__dirname, 'portal', 'sw.js'));
  });

  // =========================================================================
  // Phase 3 — Demo Sequences
  // =========================================================================

  const demo = new DemoEngine(orchestrator);

  // GET /api/demo/sequences — List available sequences
  app.get('/api/demo/sequences', portalAuth, (req, res) => {
    res.json({ sequences: demo.getSequences() });
  });

  // GET /api/demo/status — Current demo state
  app.get('/api/demo/status', portalAuth, (req, res) => {
    res.json(demo.getStatus());
  });

  // POST /api/demo/start — Launch a demo sequence
  app.post('/api/demo/start', portalAuth, async (req, res) => {
    try {
      const { sequence } = req.body;
      if (!sequence) return res.status(400).json({ error: 'sequence required' });
      const result = await demo.start(sequence);
      if (!result.success) return res.status(409).json(result);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/demo/stop — Abort running demo, restore NORMAL
  app.post('/api/demo/stop', portalAuth, async (req, res) => {
    try {
      const result = await demo.stop();
      if (!result.success) return res.status(409).json(result);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return demo;
}

function setupWebSocket(httpServer, orchestrator, demo, { generationManager } = {}) {
  let WebSocket;
  try { WebSocket = require('ws'); } catch { console.log('[Portal] ws package not installed — WebSocket disabled'); return null; }

  const wss = new WebSocket.Server({ server: httpServer, path: '/ws' });

  // Wire demo engine broadcast to all WebSocket clients
  if (demo) {
    demo.broadcast = (msg) => {
      const data = JSON.stringify(msg);
      for (const client of wss.clients) {
        if (client.readyState === WebSocket.OPEN) client.send(data);
      }
    };
  }

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

  // Now-playing poller — broadcast track changes to all clients
  // Uses HA template API to get only the first playing media_player (avoids 2.5MB states fetch)
  let lastNowPlaying = '';
  if (HA_TOKEN) {
    const npTemplate = `{% set ns = namespace(found=none) %}{% for s in states.media_player if s.state == 'playing' and 'tv' not in s.entity_id and 'avr' not in s.entity_id and 'apple_tv' not in s.entity_id and 'xbox' not in s.entity_id and ns.found is none %}{% set ns.found = s %}{% endfor %}{% if ns.found %}{% set p = ns.found %}{"entityId":"{{ p.entity_id }}","name":"{{ p.attributes.friendly_name | default('') }}","title":"{{ p.attributes.media_title | default('') }}","artist":"{{ p.attributes.media_artist | default('') }}","album":"{{ p.attributes.media_album_name | default('') }}","albumArt":"{% if p.attributes.entity_picture %}${HA_URL}{{ p.attributes.entity_picture }}{% endif %}","state":"{{ p.state }}","volume":{{ p.attributes.volume_level | default(0) }}}{% endif %}`;

    const pollSpeaker = async () => {
      if (wss.clients.size === 0) return; // Skip if nobody listening
      try {
        const r = await haFetch('/api/template', { method: 'POST', body: { template: npTemplate }, timeout: 5000 });
        if (!r.ok) return;
        const text = (await r.text()).trim();
        if (!text) return;

        const playing = JSON.parse(text);
        const key = `${playing.entityId}:${playing.title}:${playing.artist}`;
        if (key === lastNowPlaying) return;
        lastNowPlaying = key;

        const msg = JSON.stringify({ type: 'now_playing', ...playing });
        for (const client of wss.clients) {
          if (client.readyState === WebSocket.OPEN) client.send(msg);
        }
      } catch {}
    };

    setInterval(pollSpeaker, 3000);
    console.log('[Portal] Now-playing poller active (3s)');
  }

  // Wire generation manager broadcasts
  if (generationManager) {
    const broadcastGen = (type, job) => {
      const msg = JSON.stringify({ type, job });
      for (const client of wss.clients) {
        if (client.readyState === WebSocket.OPEN) client.send(msg);
      }
    };
    generationManager.onComplete = (job) => broadcastGen('generation_complete', job);
    generationManager.onFailed = (job) => broadcastGen('generation_failed', job);
  }

  console.log('[Portal] WebSocket server attached at /ws');
  return wss;
}

module.exports = { setupRoutes, setupWebSocket };
