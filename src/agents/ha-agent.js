/**
 * HAAgent - Home Assistant integration agent for the orchestrator
 * Reads state, calls services, proxies mood intents, enforces safety
 * Uses native fetch (Node 18+), no external dependencies
 */

const VALID_MODES = ['NORMAL', 'LISTEN', 'LOOK', 'WATCH', 'ENTERTAIN', 'LIVE_JAM', 'SHOW', 'INTERLUDE'];

class HASafetyGate {
  constructor(overrides = {}) {
    this.rules = {
      light: { write: true, excludePatterns: [/master/i, /security/i] },
      media_player: { write: true, maxVolume: 0.7 },
      input_select: { write: true, allowedEntities: ['input_select.villa_mode'] },
      input_boolean: { write: true, allowedPatterns: [/agent_controlled/i, /mood_time/i] },
      input_number: { write: true, allowedPatterns: [/agent_controlled/i, /mood_time/i] },
      sensor: { write: false },
      binary_sensor: { write: false },
      switch: { write: true, excludePatterns: [/garage/i, /laundry/i] },
      script: { write: true },
      scene: { write: true },
      ...overrides
    };
  }

  check(operation, entityId, data) {
    const domain = entityId.split('.')[0];
    const rule = this.rules[domain];

    // Read operations always allowed
    if (operation === 'read') return { allowed: true };

    // Unknown domain blocked
    if (!rule) return { allowed: false, reason: `Domain '${domain}' not in safety allowlist` };

    // Read-only domains
    if (!rule.write) return { allowed: false, reason: `Domain '${domain}' is read-only` };

    // Exclude patterns (master suite, security, garage, laundry)
    if (rule.excludePatterns) {
      for (const pattern of rule.excludePatterns) {
        if (pattern.test(entityId)) {
          return { allowed: false, reason: `Entity '${entityId}' excluded by safety rule: ${pattern}` };
        }
      }
    }

    // Allowed entities whitelist
    if (rule.allowedEntities) {
      if (!rule.allowedEntities.includes(entityId)) {
        return { allowed: false, reason: `Entity '${entityId}' not in allowed list for ${domain}` };
      }
    }

    // Allowed patterns whitelist
    if (rule.allowedPatterns) {
      const matches = rule.allowedPatterns.some(p => p.test(entityId));
      if (!matches) {
        return { allowed: false, reason: `Entity '${entityId}' does not match allowed patterns for ${domain}` };
      }
    }

    // Volume cap for media_player
    if (domain === 'media_player' && rule.maxVolume && data) {
      if (data.volume_level !== undefined && data.volume_level > rule.maxVolume) {
        data.volume_level = rule.maxVolume;
      }
    }

    return { allowed: true };
  }
}

// NL parsing patterns
const NL_PATTERNS = [
  { regex: /^turn\s+on\s+(.+?)(?:\s+lights?)?$/i, handler: 'turnOn' },
  { regex: /^turn\s+off\s+(.+?)(?:\s+lights?)?$/i, handler: 'turnOff' },
  { regex: /^set\s+(.+?)\s+(?:brightness\s+)?to\s+(\d+)\s*%$/i, handler: 'setBrightness' },
  { regex: /^(?:what(?:'s| is)\s+(?:the\s+)?)?(?:state|status)\s+(?:of\s+)?(.+)$/i, handler: 'getState' },
  { regex: /^(?:what(?:'s| is)\s+)(.+?)\s+(?:state|status)$/i, handler: 'getState' },
  { regex: /^set\s+(?:villa\s+)?mode\s+(?:to\s+)?(\w+)$/i, handler: 'setMode' },
  { regex: /^(?:villa\s+)?mode\s+(\w+)$/i, handler: 'setMode' },
  { regex: /^set\s+(?:volume|media)\s+(?:in\s+)?(.+?)\s+to\s+(\d+)\s*%$/i, handler: 'setVolume' },
  { regex: /^(?:set\s+)?(.+?)\s+(?:to\s+)?(\w+)\s+mood$/i, handler: 'setMood' },
  { regex: /^mood\s+(\w+)\s+(?:in\s+)?(.+)$/i, handler: 'setMoodReverse' },
];

class HAAgent {
  constructor(options = {}) {
    this.baseUrl = options.baseUrl || process.env.HA_URL || 'http://192.168.1.6:8123';
    this.token = options.token || process.env.HA_TOKEN || '';
    this.intentResolverUrl = options.intentResolverUrl || process.env.INTENT_RESOLVER_URL || 'http://192.168.0.60:8400';
    this.lastUsage = null;
    this._safety = new HASafetyGate(options.safetyOverrides || {});
  }

  async execute(task) {
    const start = Date.now();
    const parsed = this._parseTask(task.trim());

    if (parsed.error) {
      return parsed.error;
    }

    let result;
    switch (parsed.type) {
      case 'state':
        result = await this._getState(parsed.entityId);
        break;
      case 'service': {
        const safety = this._safety.check('write', parsed.data.entity_id || '', parsed.data);
        if (!safety.allowed) return `Blocked: ${safety.reason}`;
        result = await this._callService(parsed.domain, parsed.service, parsed.data);
        break;
      }
      case 'intent':
        result = await this._proxyIntent(parsed.room, parsed.intent);
        break;
      case 'mode':
        result = await this._setMode(parsed.mode);
        break;
      default:
        return 'Unknown command type';
    }

    this.lastUsage = {
      type: parsed.type,
      duration: Date.now() - start
    };
    return result;
  }

  _parseTask(task) {
    // Structured commands: ha:type:args
    if (task.startsWith('ha:')) {
      return this._parseStructured(task);
    }
    // Natural language
    return this._parseNL(task);
  }

  _parseStructured(task) {
    const parts = task.split(':');
    const type = parts[1];

    switch (type) {
      case 'state':
        if (!parts[2]) return { error: 'Usage: ha:state:{entity_id}' };
        return { type: 'state', entityId: parts.slice(2).join(':') };

      case 'service': {
        if (!parts[2]) return { error: 'Usage: ha:service:{domain}/{service}:{json_data}' };
        const [domain, service] = parts[2].split('/');
        if (!domain || !service) return { error: 'Service format: domain/service (e.g. light/turn_on)' };
        let data = {};
        if (parts[3]) {
          try { data = JSON.parse(parts.slice(3).join(':')); } catch {
            return { error: 'Invalid JSON in service data' };
          }
        }
        return { type: 'service', domain, service, data };
      }

      case 'intent': {
        if (!parts[2]) return { error: 'Usage: ha:intent:{room}/{intent}' };
        const [room, intent] = parts[2].split('/');
        if (!room || !intent) return { error: 'Intent format: room/intent (e.g. theatre/romance)' };
        return { type: 'intent', room, intent };
      }

      case 'mode': {
        if (!parts[2]) return { error: 'Usage: ha:mode:{MODE_NAME}' };
        const mode = parts[2].toUpperCase();
        if (!VALID_MODES.includes(mode)) {
          return { error: `Invalid mode '${parts[2]}'. Valid: ${VALID_MODES.join(', ')}` };
        }
        return { type: 'mode', mode };
      }

      default:
        return { error: `Unknown command type '${type}'. Supported: state, service, intent, mode` };
    }
  }

  _parseNL(task) {
    for (const { regex, handler } of NL_PATTERNS) {
      const match = task.match(regex);
      if (!match) continue;

      switch (handler) {
        case 'turnOn':
          return { type: 'service', domain: 'light', service: 'turn_on',
            data: { entity_id: this._resolveEntity(match[1], 'light') } };
        case 'turnOff':
          return { type: 'service', domain: 'light', service: 'turn_off',
            data: { entity_id: this._resolveEntity(match[1], 'light') } };
        case 'setBrightness':
          return { type: 'service', domain: 'light', service: 'turn_on',
            data: { entity_id: this._resolveEntity(match[1], 'light'), brightness_pct: parseInt(match[2]) } };
        case 'getState':
          return { type: 'state', entityId: this._resolveEntity(match[1]) };
        case 'setMode': {
          const mode = match[1].toUpperCase();
          if (!VALID_MODES.includes(mode)) {
            return { error: `Invalid mode '${match[1]}'. Valid: ${VALID_MODES.join(', ')}` };
          }
          return { type: 'mode', mode };
        }
        case 'setVolume':
          return { type: 'service', domain: 'media_player', service: 'volume_set',
            data: { entity_id: this._resolveEntity(match[1], 'media_player'), volume_level: parseInt(match[2]) / 100 } };
        case 'setMood':
          return { type: 'intent', room: match[1].toLowerCase().replace(/\s+/g, '_'), intent: match[2].toLowerCase() };
        case 'setMoodReverse':
          return { type: 'intent', room: match[2].toLowerCase().replace(/\s+/g, '_'), intent: match[1].toLowerCase() };
      }
    }

    return {
      error: `Unrecognized command. Supported formats:\n` +
        `  Structured: ha:state:{entity}, ha:service:{domain/service}:{json}, ha:intent:{room/intent}, ha:mode:{MODE}\n` +
        `  Natural: "turn on/off {name}", "set {name} to {N}%", "set mode to {MODE}", "mood {intent} in {room}"`
    };
  }

  _resolveEntity(name, domain) {
    // If already a full entity_id, return as-is
    if (name.includes('.')) return name;
    // Normalize: "theatre lights" → "theatre", "great room" → "great_room"
    const normalized = name.toLowerCase().replace(/\s+lights?$/i, '').replace(/\s+/g, '_');
    return domain ? `${domain}.${normalized}` : normalized;
  }

  async _getState(entityId) {
    const response = await this._fetch(`${this.baseUrl}/api/states/${entityId}`);
    if (!response.ok) {
      if (response.status === 404) return `Entity '${entityId}' not found`;
      throw new Error(`HA error: ${response.status} ${response.statusText}`);
    }
    const data = await response.json();
    const attrs = data.attributes || {};
    let result = `${entityId}: ${data.state}`;
    if (attrs.friendly_name) result = `${attrs.friendly_name} (${entityId}): ${data.state}`;
    if (attrs.brightness !== undefined) result += `, brightness: ${Math.round(attrs.brightness / 2.55)}%`;
    if (attrs.temperature !== undefined) result += `, temp: ${attrs.temperature}`;
    if (attrs.current_temperature !== undefined) result += `, current: ${attrs.current_temperature}`;
    return result;
  }

  async _callService(domain, service, data) {
    const response = await this._fetch(`${this.baseUrl}/api/services/${domain}/${service}`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
    if (!response.ok) {
      throw new Error(`HA service error: ${response.status} ${response.statusText}`);
    }
    const entityId = data.entity_id || 'unknown';
    return `OK: ${domain}.${service} called on ${entityId}`;
  }

  async _proxyIntent(room, intent) {
    const response = await this._fetch(`${this.intentResolverUrl}/intent`, {
      method: 'POST',
      body: JSON.stringify({ room, intent, backend: 'static' })
    });
    if (!response.ok) {
      throw new Error(`Intent resolver error: ${response.status}`);
    }
    const data = await response.json();
    return `Mood '${intent}' applied to ${room}: ${data.status || 'ok'}`;
  }

  async _setMode(mode) {
    const safety = this._safety.check('write', 'input_select.villa_mode', {});
    if (!safety.allowed) return `Blocked: ${safety.reason}`;

    const response = await this._fetch(`${this.baseUrl}/api/services/input_select/select_option`, {
      method: 'POST',
      body: JSON.stringify({
        entity_id: 'input_select.villa_mode',
        option: mode
      })
    });
    if (!response.ok) {
      throw new Error(`HA mode change error: ${response.status}`);
    }
    return `Villa mode set to ${mode}`;
  }

  async _fetch(url, options = {}) {
    return fetch(url, {
      ...options,
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json',
        ...options.headers
      },
      signal: options.signal || AbortSignal.timeout(10000)
    });
  }

  async healthCheck() {
    if (!this.token) return false;
    try {
      const response = await fetch(`${this.baseUrl}/api/`, {
        headers: { 'Authorization': `Bearer ${this.token}` },
        signal: AbortSignal.timeout(3000)
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}

module.exports = HAAgent;
module.exports.HASafetyGate = HASafetyGate;
