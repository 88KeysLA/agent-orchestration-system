/**
 * HAContextProvider - Polls Home Assistant entities for orchestrator context
 * Feeds villa_mode, agent gates, and sensor states into RL routing decisions
 * Uses native fetch with auth headers (not PollingProvider — needs Bearer token)
 */

const DEFAULT_ENTITIES = [
  'input_select.villa_mode',
  'binary_sensor.mech_mac_ping',
  'input_boolean.agent_controlled_lighting_enable',
  'input_boolean.agent_controlled_media_enable',
  'input_boolean.mood_time_aware_enable'
];

class HAContextProvider {
  constructor(options = {}) {
    this.baseUrl = options.baseUrl || process.env.HA_URL || 'http://192.168.1.6:8123';
    this.token = options.token || process.env.HA_TOKEN || '';
    this.pollInterval = options.pollInterval || 30000;
    this.entities = options.entities || DEFAULT_ENTITIES;
    this._latest = null;
    this._timer = null;
  }

  async getContext() {
    if (!this._latest) await this._poll();
    return this._latest || {};
  }

  start() {
    this._poll().catch(() => {});
    this._timer = setInterval(() => this._poll().catch(() => {}), this.pollInterval);
    return this;
  }

  stop() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
    return this;
  }

  async _poll() {
    if (!this.token) return;

    try {
      const states = {};
      for (const entityId of this.entities) {
        try {
          const res = await fetch(`${this.baseUrl}/api/states/${entityId}`, {
            headers: { 'Authorization': `Bearer ${this.token}` },
            signal: AbortSignal.timeout(5000)
          });
          if (res.ok) {
            const data = await res.json();
            const shortKey = entityId.split('.').slice(1).join('.');
            states[shortKey] = data.state;
          }
        } catch {
          // Skip individual entity errors
        }
      }

      // Only update if at least one entity was fetched; preserve stale otherwise
      if (Object.keys(states).length > 0 || !this._latest) {
        this._latest = {
          villa_mode: states.villa_mode || this._latest?.villa_mode || 'NORMAL',
          mech_online: 'mech_mac_ping' in states ? states.mech_mac_ping === 'on' : (this._latest?.mech_online ?? false),
          lighting_enabled: 'agent_controlled_lighting_enable' in states ? states.agent_controlled_lighting_enable === 'on' : (this._latest?.lighting_enabled ?? false),
          media_enabled: 'agent_controlled_media_enable' in states ? states.agent_controlled_media_enable === 'on' : (this._latest?.media_enabled ?? false),
          time_aware_enabled: 'mood_time_aware_enable' in states ? states.mood_time_aware_enable === 'on' : (this._latest?.time_aware_enabled ?? false)
        };
      }
    } catch {
      // Keep stale value on total failure
    }
  }
}

module.exports = HAContextProvider;
