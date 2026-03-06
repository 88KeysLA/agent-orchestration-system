/**
 * HA Bridge — Bidirectional connection between HA automations and Agent Orchestration
 *
 * Inbound (HA → Agents): Subscribes to HA WebSocket for events, dispatches agent tasks.
 * Outbound (Agents → HA): Exposes methods for agents to trigger HA scripts/modes/intents.
 *
 * Event routing:
 *   villa_mode change  → agent task "mode_changed:{MODE}" (for agent-side reactions)
 *   agent_controlled_* → agent task when gates are enabled
 *   Custom event "agent_task" → direct agent dispatch from HA automations
 */
const { execFileSync } = require('child_process');

class HABridge {
  constructor(options = {}) {
    this.haUrl = options.haUrl || process.env.HA_URL || 'http://192.168.1.6:8123';
    this.token = options.token || process.env.HA_TOKEN;
    this.orchestrator = options.orchestrator;
    this.intentResolverUrl = options.intentResolverUrl || process.env.INTENT_RESOLVER_URL || 'http://192.168.0.60:8400';
    this._ws = null;
    this._msgId = 1;
    this._reconnectDelay = 5000;
    this._subscriptions = new Map();
    this._running = false;
  }

  /**
   * Start listening to HA WebSocket events
   */
  async start() {
    if (!this.token) {
      console.log('HA Bridge: no token, skipping');
      return;
    }
    this._running = true;
    this._connect();
    console.log('HA Bridge: active (HA ↔ Agent bidirectional)');
  }

  stop() {
    this._running = false;
    if (this._ws) {
      this._ws.close();
      this._ws = null;
    }
  }

  _connect() {
    if (!this._running) return;
    try {
      const WebSocket = require('ws');
      const wsUrl = this.haUrl.replace('http', 'ws') + '/api/websocket';
      this._ws = new WebSocket(wsUrl);

      this._ws.on('open', () => {
        this._reconnectDelay = 5000;
      });

      this._ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data);
          this._handleMessage(msg);
        } catch (e) { /* ignore parse errors */ }
      });

      this._ws.on('close', () => {
        if (this._running) {
          setTimeout(() => this._connect(), this._reconnectDelay);
          this._reconnectDelay = Math.min(this._reconnectDelay * 1.5, 60000);
        }
      });

      this._ws.on('error', () => {}); // Handled by close
    } catch (e) {
      if (this._running) {
        setTimeout(() => this._connect(), this._reconnectDelay);
      }
    }
  }

  _send(msg) {
    if (this._ws?.readyState === 1) {
      msg.id = this._msgId++;
      this._ws.send(JSON.stringify(msg));
      return msg.id;
    }
    return null;
  }

  _handleMessage(msg) {
    if (msg.type === 'auth_required') {
      this._send({ type: 'auth', access_token: this.token });
    } else if (msg.type === 'auth_ok') {
      // Subscribe to state changes
      this._send({ type: 'subscribe_events', event_type: 'state_changed' });
      // Subscribe to custom agent_task events fired from HA automations
      this._send({ type: 'subscribe_events', event_type: 'agent_task' });
    } else if (msg.type === 'event') {
      this._handleEvent(msg.event);
    }
  }

  async _handleEvent(event) {
    if (!this.orchestrator) return;

    if (event.event_type === 'state_changed') {
      const { entity_id, new_state, old_state } = event.data;
      if (!new_state || !old_state) return;
      if (new_state.state === old_state.state) return;

      // Villa mode change → notify agents
      if (entity_id === 'input_select.villa_mode') {
        const mode = new_state.state;
        const prevMode = old_state.state;
        // Fire-and-forget notification to agents (don't block HA)
        this._dispatchAsync(`Mode changed: ${prevMode} → ${mode}. Adjust agent behavior accordingly.`, 'mode-change');
      }

      // Agent gate enabled → potential agent action
      if (entity_id === 'input_boolean.agent_controlled_lighting_enable' && new_state.state === 'on') {
        this._dispatchAsync('Lighting gate enabled. Agents may now control lighting within safety bounds.', 'gate-change');
      }
      if (entity_id === 'input_boolean.agent_controlled_media_enable' && new_state.state === 'on') {
        this._dispatchAsync('Media gate enabled. Agents may now control media within safety bounds.', 'gate-change');
      }
      if (entity_id === 'input_boolean.agent_controlled_visual_enable' && new_state.state === 'on') {
        this._dispatchAsync('Visual gate enabled. Agents may now control visuals.', 'gate-change');
      }
    }

    // Custom event: HA automation fires "agent_task" event to dispatch work to agents
    // Fire from HA: event.fire("agent_task", {"task": "...", "agent": "claude-tools"})
    if (event.event_type === 'agent_task') {
      const { task, agent } = event.data || {};
      if (task) {
        const prefixed = agent ? `${agent}:${task}` : task;
        this._dispatchAsync(prefixed, 'ha-triggered');
      }
    }
  }

  async _dispatchAsync(task, context) {
    try {
      const result = await this.orchestrator.execute(task, context);
      if (!result.success) {
        console.log(`HA Bridge: task failed (${context}): ${String(result.result).substring(0, 100)}`);
      }
    } catch (e) {
      console.log(`HA Bridge: dispatch error (${context}): ${e.message}`);
    }
  }

  // --- Outbound: Agent → HA ---

  /**
   * Trigger a villa mode change from agent code
   */
  async setMode(mode) {
    return this._callHA('input_select/select_option', {
      entity_id: 'input_select.villa_mode', option: mode
    });
  }

  /**
   * Trigger a mood intent via the intent resolver → HA
   */
  async triggerIntent(room, intent) {
    try {
      const result = execFileSync('curl', [
        '-s', '-X', 'POST',
        `${this.intentResolverUrl}/intent`,
        '-H', 'Content-Type: application/json',
        '-d', JSON.stringify({ room, intent }),
        '--connect-timeout', '5', '-m', '30'
      ], { encoding: 'utf8', timeout: 35000 });
      return JSON.parse(result);
    } catch (e) {
      return { error: e.message };
    }
  }

  /**
   * Call any HA service
   */
  async _callHA(service, data) {
    try {
      const [domain, svc] = service.includes('/') ? service.split('/') : [service, 'turn_on'];
      execFileSync('curl', [
        '-s', '-X', 'POST',
        `${this.haUrl}/api/services/${domain}/${svc}`,
        '-H', `Authorization: Bearer ${this.token}`,
        '-H', 'Content-Type: application/json',
        '-d', JSON.stringify(data),
        '--connect-timeout', '5', '-m', '30'
      ], { encoding: 'utf8', timeout: 35000 });
      return { ok: true };
    } catch (e) {
      return { error: e.message };
    }
  }
}

module.exports = HABridge;
