/**
 * AgentToolkit — Extensible tool registry for tool-using Claude agents
 *
 * Tools are Anthropic-format definitions paired with async executor functions.
 * Grouped by service: HA (Home Assistant), Crestron, utility.
 * Conditionally registered based on available credentials.
 */
const https = require('https');

class AgentToolkit {
  constructor() {
    this._tools = new Map();
  }

  add(name, description, inputSchema, executor) {
    this._tools.set(name, {
      definition: { name, description, input_schema: inputSchema },
      executor
    });
    return this;
  }

  getDefinitions() {
    return Array.from(this._tools.values()).map(t => t.definition);
  }

  async execute(name, input) {
    const tool = this._tools.get(name);
    if (!tool) return `Unknown tool: ${name}`;
    try {
      const result = await tool.executor(input);
      return typeof result === 'string' ? result : JSON.stringify(result, null, 2);
    } catch (error) {
      return `Error: ${error.message}`;
    }
  }

  get size() { return this._tools.size; }
  has(name) { return this._tools.has(name); }
}

// --- HA Tools ---

function addHATools(toolkit, options = {}) {
  const baseUrl = options.baseUrl || process.env.HA_URL || 'http://192.168.1.6:8123';
  const token = options.token || process.env.HA_TOKEN || '';
  const fetchFn = options.fetch || fetch;

  const haFetch = async (path, fetchOptions = {}) => {
    const response = await fetchFn(`${baseUrl}${path}`, {
      ...fetchOptions,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...fetchOptions.headers
      },
      signal: fetchOptions.signal || AbortSignal.timeout(10000)
    });
    if (!response.ok) throw new Error(`HA API ${response.status}`);
    return response.json();
  };

  toolkit.add('ha_get_state',
    'Read the current state of a Home Assistant entity. Returns state, attributes, friendly name.',
    {
      type: 'object',
      properties: {
        entity_id: { type: 'string', description: 'Entity ID (e.g. light.theatre, sensor.weather_temperature, input_select.villa_mode)' }
      },
      required: ['entity_id']
    },
    async ({ entity_id }) => {
      const data = await haFetch(`/api/states/${entity_id}`);
      const out = {
        entity_id: data.entity_id,
        state: data.state,
        friendly_name: data.attributes?.friendly_name
      };
      if (data.attributes?.brightness !== undefined) out.brightness_pct = Math.round(data.attributes.brightness / 2.55);
      if (data.attributes?.temperature !== undefined) out.temperature = data.attributes.temperature;
      if (data.attributes?.current_temperature !== undefined) out.current_temperature = data.attributes.current_temperature;
      if (data.attributes?.volume_level !== undefined) out.volume_pct = Math.round(data.attributes.volume_level * 100);
      if (data.attributes?.media_title) out.media_title = data.attributes.media_title;
      out.last_changed = data.last_changed;
      return out;
    }
  );

  toolkit.add('ha_call_service',
    'Call a Home Assistant service. SAFETY: Never control master suite lights, security, garage, or laundry. Volume max 70%.',
    {
      type: 'object',
      properties: {
        domain: { type: 'string', description: 'Service domain (e.g. light, media_player, script, scene, input_select)' },
        service: { type: 'string', description: 'Service name (e.g. turn_on, turn_off, volume_set, select_option)' },
        data: { type: 'object', description: 'Service data (e.g. {"entity_id": "light.theatre", "brightness_pct": 50})' }
      },
      required: ['domain', 'service', 'data']
    },
    async ({ domain, service, data }) => {
      const entityId = data.entity_id || '';
      if (/master/i.test(entityId) && domain === 'light') return 'BLOCKED: Master suite lights excluded from agent control';
      if (/security/i.test(entityId)) return 'BLOCKED: Security entities excluded from agent control';
      if (/garage/i.test(entityId)) return 'BLOCKED: Garage entities excluded (Hard Rule 4)';
      if (/laundry/i.test(entityId)) return 'BLOCKED: Laundry entities excluded (Hard Rule 4)';
      if (['sensor', 'binary_sensor'].includes(domain)) return `BLOCKED: ${domain} is read-only`;
      if (data.volume_level !== undefined && data.volume_level > 0.7) data.volume_level = 0.7;

      await haFetch(`/api/services/${domain}/${service}`, {
        method: 'POST',
        body: JSON.stringify(data)
      });
      return `OK: ${domain}.${service} called` + (entityId ? ` on ${entityId}` : '');
    }
  );

  toolkit.add('ha_search_entities',
    'Search Home Assistant entities by keyword. Returns matching entity IDs with states. Use to discover entity names.',
    {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search keyword (e.g. "theatre", "temperature", "sonos", "villa_mode")' },
        domain: { type: 'string', description: 'Optional domain filter (e.g. "light", "sensor", "media_player")' }
      },
      required: ['query']
    },
    async ({ query, domain }) => {
      const states = await haFetch('/api/states');
      const q = query.toLowerCase();
      const matches = states.filter(s => {
        if (domain && !s.entity_id.startsWith(domain + '.')) return false;
        return s.entity_id.toLowerCase().includes(q) ||
          (s.attributes?.friendly_name || '').toLowerCase().includes(q);
      }).slice(0, 20);
      return matches.map(s => ({
        entity_id: s.entity_id,
        state: s.state,
        friendly_name: s.attributes?.friendly_name
      }));
    }
  );

  toolkit.add('ha_set_mode',
    'Set the Villa Romanza mode.',
    {
      type: 'object',
      properties: {
        mode: {
          type: 'string',
          enum: ['NORMAL', 'LISTEN', 'LOOK', 'WATCH', 'ENTERTAIN', 'LIVE_JAM', 'SHOW', 'INTERLUDE'],
          description: 'Villa mode'
        }
      },
      required: ['mode']
    },
    async ({ mode }) => {
      await haFetch('/api/services/input_select/select_option', {
        method: 'POST',
        body: JSON.stringify({ entity_id: 'input_select.villa_mode', option: mode })
      });
      return `Villa mode set to ${mode}`;
    }
  );

  toolkit.add('ha_trigger',
    'Trigger a script or activate a scene.',
    {
      type: 'object',
      properties: {
        entity_id: { type: 'string', description: 'Script or scene entity_id (e.g. script.theatre_watch, scene.bar_romance)' }
      },
      required: ['entity_id']
    },
    async ({ entity_id }) => {
      const domain = entity_id.split('.')[0];
      await haFetch(`/api/services/${domain}/turn_on`, {
        method: 'POST',
        body: JSON.stringify({ entity_id })
      });
      return `Triggered ${entity_id}`;
    }
  );

  toolkit.add('ha_notify',
    'Send a persistent notification in Home Assistant.',
    {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Notification title' },
        message: { type: 'string', description: 'Notification body' }
      },
      required: ['message']
    },
    async ({ title, message }) => {
      await haFetch('/api/services/persistent_notification/create', {
        method: 'POST',
        body: JSON.stringify({ title: title || 'Villa Agent', message })
      });
      return 'Notification sent';
    }
  );

  return toolkit;
}

// --- Crestron Tools ---

function httpsRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const req = https.request({
      hostname: urlObj.hostname,
      port: urlObj.port || 443,
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: options.headers || {},
      rejectUnauthorized: false,
      timeout: 10000
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        resolve({
          ok: res.statusCode >= 200 && res.statusCode < 300,
          status: res.statusCode,
          body,
          json: () => JSON.parse(body),
          headers: res.headers
        });
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
    if (options.body) req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
    req.end();
  });
}

class CrestronSession {
  constructor(host, authToken, options = {}) {
    this.host = host;
    this.authToken = authToken;
    this._fetchFn = options.fetch || httpsRequest;
    this._sessionKey = null;
    this._lastAuth = 0;
  }

  async authenticate() {
    const now = Date.now();
    if (this._sessionKey && (now - this._lastAuth) < 540000) {
      return this._sessionKey;
    }
    const res = await this._fetchFn(`https://${this.host}/cws/api/login`, {
      headers: { 'Crestron-RestAPI-AuthToken': this.authToken }
    });
    if (!res.ok) throw new Error(`Crestron auth failed: ${res.status}`);
    const data = res.json();
    this._sessionKey = data.authkey;
    this._lastAuth = now;
    return this._sessionKey;
  }

  async fetch(path, options = {}) {
    const key = await this.authenticate();
    const res = await this._fetchFn(`https://${this.host}/cws/api${path}`, {
      ...options,
      headers: {
        'Crestron-RestAPI-AuthKey': key,
        'Content-Type': 'application/json',
        ...options.headers
      }
    });
    if (!res.ok) throw new Error(`Crestron API ${res.status}`);
    return res.json();
  }
}

function addCrestronTools(toolkit, options = {}) {
  const host = options.host || process.env.CRESTRON_HOST || '192.168.1.2';
  const authToken = options.authToken || process.env.CRESTRON_AUTH_TOKEN || '';
  const session = new CrestronSession(host, authToken, { fetch: options.fetch });

  toolkit.add('crestron_list_rooms',
    'List all rooms in the Crestron Home system.',
    { type: 'object', properties: {} },
    async () => {
      const data = await session.fetch('/rooms');
      return (data.rooms || []).map(r => ({ id: r.id, name: r.name }));
    }
  );

  toolkit.add('crestron_list_devices',
    'List Crestron devices, optionally filtered by room ID.',
    {
      type: 'object',
      properties: {
        room_id: { type: 'number', description: 'Room ID to filter by (from crestron_list_rooms)' }
      }
    },
    async ({ room_id }) => {
      const data = await session.fetch('/devices');
      let devices = data.devices || [];
      if (room_id !== undefined) devices = devices.filter(d => d.roomId === room_id);
      return devices.map(d => ({
        id: d.id, name: d.name, type: d.type, subType: d.subType,
        roomId: d.roomId, state: d.state,
        level: d.level !== undefined ? Math.round(d.level / 655.35) : undefined,
        position: d.position !== undefined ? Math.round(d.position / 655.35) : undefined
      }));
    }
  );

  toolkit.add('crestron_get_shades',
    'Get current positions of Crestron shades. Position: 0% = closed, 100% = open.',
    { type: 'object', properties: {} },
    async () => {
      const data = await session.fetch('/shades');
      return (data.shades || []).map(s => ({
        id: s.id, name: s.name, roomId: s.roomId,
        position_pct: Math.round((s.position || 0) / 655.35),
        status: s.connectionStatus
      }));
    }
  );

  toolkit.add('crestron_set_shade',
    'Set a shade position. 0% = closed, 100% = open.',
    {
      type: 'object',
      properties: {
        shade_id: { type: 'number', description: 'Shade device ID' },
        position: { type: 'number', description: 'Position 0-100 (percent open)' }
      },
      required: ['shade_id', 'position']
    },
    async ({ shade_id, position }) => {
      const raw = Math.round(Math.min(100, Math.max(0, position)) * 655.35);
      const data = await session.fetch('/shades/SetState', {
        method: 'POST',
        body: JSON.stringify({ shades: [{ id: shade_id, position: raw }] })
      });
      return `Shade ${shade_id} set to ${position}%: ${data.status || 'ok'}`;
    }
  );

  toolkit.add('crestron_set_light',
    'Set a Crestron dimmer level. 0 = off, 100 = full.',
    {
      type: 'object',
      properties: {
        light_id: { type: 'number', description: 'Light device ID' },
        level: { type: 'number', description: 'Brightness 0-100 (percent)' }
      },
      required: ['light_id', 'level']
    },
    async ({ light_id, level }) => {
      const raw = Math.round(Math.min(100, Math.max(0, level)) * 655.35);
      const data = await session.fetch('/lights/SetState', {
        method: 'POST',
        body: JSON.stringify({ lights: [{ id: light_id, level: raw }] })
      });
      return `Light ${light_id} set to ${level}%: ${data.status || 'ok'}`;
    }
  );

  toolkit.add('crestron_list_scenes',
    'List Crestron scenes (lighting, shade, climate presets).',
    { type: 'object', properties: {} },
    async () => {
      const data = await session.fetch('/scenes');
      return (data.scenes || []).map(s => ({
        id: s.id, name: s.name, type: s.type, roomId: s.roomId, active: s.status
      }));
    }
  );

  toolkit.add('crestron_activate_scene',
    'Activate a Crestron scene.',
    {
      type: 'object',
      properties: {
        scene_id: { type: 'number', description: 'Scene ID (from crestron_list_scenes)' }
      },
      required: ['scene_id']
    },
    async ({ scene_id }) => {
      const data = await session.fetch(`/scenes/recall/${scene_id}`, { method: 'POST' });
      return `Scene ${scene_id} activated: ${data.status || 'ok'}`;
    }
  );

  return toolkit;
}

// --- Utility Tools ---

function addUtilityTools(toolkit) {
  toolkit.add('get_current_time',
    'Get current date, time, day of week, and time period (dawn/morning/midday/afternoon/evening/dusk/night/late_night).',
    { type: 'object', properties: {} },
    async () => {
      const now = new Date();
      const hour = now.getHours();
      const periods = [
        [5, 7, 'dawn'], [7, 10, 'morning'], [10, 12, 'midday'],
        [12, 16, 'afternoon'], [16, 18, 'evening'], [18, 20, 'dusk'],
        [20, 24, 'night']
      ];
      let period = 'late_night';
      for (const [start, end, name] of periods) {
        if (hour >= start && hour < end) { period = name; break; }
      }
      return {
        iso: now.toISOString(),
        local: now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }),
        hour,
        period,
        dayOfWeek: now.toLocaleDateString('en-US', { weekday: 'long' })
      };
    }
  );

  return toolkit;
}

module.exports = { AgentToolkit, addHATools, addCrestronTools, addUtilityTools, httpsRequest, CrestronSession };
