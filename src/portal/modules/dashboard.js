/**
 * Villa Portal — Dashboard Module
 * Mode selector, agent health grid, gates, time info, services
 */
(function () {
  'use strict';
  const VP = window.VillaPortal;

  const MODES = ['NORMAL', 'LISTEN', 'LOOK', 'WATCH', 'ENTERTAIN', 'LIVE_JAM', 'SHOW', 'INTERLUDE'];
  const GATES = ['lighting_enable', 'media_enable', 'visual_enable', 'time_aware_enable'];

  let currentMode = null;
  let els = {};

  function renderModes(active) {
    els.modeGrid.innerHTML = MODES.map(m =>
      `<button class="mode-btn${m === active ? ' active' : ''}" data-mode="${m}">${m.replace('_', ' ')}</button>`
    ).join('');
  }

  function renderGates(state) {
    els.gateRow.innerHTML = '';
    for (const g of GATES) {
      const label = g.replace('_enable', '').replace('_', ' ');
      const val = state[g];
      const cls = val === true ? 'on' : val === false ? 'off' : 'unknown';
      els.gateRow.innerHTML += `<div class="gate-chip"><span class="dot ${cls}"></span>${label}</div>`;
    }
    // Mech Mac
    const mechOnline = state.mech_online;
    const mechCls = mechOnline === true ? 'on' : mechOnline === false ? 'off' : 'unknown';
    els.gateRow.innerHTML += `<div class="gate-chip"><span class="dot ${mechCls}"></span>Mech Mac</div>`;
  }

  function renderAgents(agents) {
    els.agentGrid.innerHTML = (agents || []).map(a =>
      `<div class="agent-card">
        <span class="dot ${a.status}"></span>
        <span class="agent-name">${a.name}</span>
        <span class="agent-type">${a.type}</span>
      </div>`
    ).join('');
  }

  function renderTime(time) {
    if (!time || !time.hour) {
      els.timeInfo.innerHTML = '<span>Time data unavailable</span>';
      return;
    }
    const h = time.hour.toString().padStart(2, '0');
    const m = (time.minute || 0).toString().padStart(2, '0');
    els.timeInfo.innerHTML = `
      <span>Time:<strong>${h}:${m}</strong></span>
      <span>Period:<strong>${time.period || '--'}</strong></span>
      <span>Day:<strong>${time.isWeekend ? 'Weekend' : 'Weekday'}</strong></span>
    `;
  }

  function renderServices(services) {
    els.servicesList.innerHTML = (services || []).map(s =>
      `<div class="service-row">
        <span class="dot ${s.status}"></span>
        <span>${s.name}</span>
      </div>`
    ).join('');
  }

  async function setMode(mode) {
    if (mode === currentMode) return;
    try {
      await VP.apiFetch('/api/villa/mode', {
        method: 'POST',
        body: JSON.stringify({ mode })
      });
      currentMode = mode;
      renderModes(mode);
    } catch (err) {
      console.error('Failed to set mode:', err);
    }
  }

  async function loadServices() {
    try {
      const data = await VP.apiFetch('/api/services/health');
      renderServices(data.services);
    } catch {}
  }

  VP.modules.dashboard = {
    init() {
      const panel = document.getElementById('panel-dashboard');
      panel.innerHTML = `
        <div class="dashboard">
          <div class="dash-section">
            <h2>Villa Mode</h2>
            <div class="mode-grid" id="dash-modes"></div>
          </div>
          <div class="dash-section">
            <h2>Gates</h2>
            <div class="gate-row" id="dash-gates"></div>
          </div>
          <div class="dash-section">
            <h2>Time Context</h2>
            <div class="time-info" id="dash-time"></div>
          </div>
          <div class="dash-section">
            <h2>Agents (${0})</h2>
            <div class="agent-grid" id="dash-agents"></div>
          </div>
          <div class="dash-section">
            <h2>Services</h2>
            <div class="services-list" id="dash-services"></div>
          </div>
        </div>
      `;

      els.modeGrid = document.getElementById('dash-modes');
      els.gateRow = document.getElementById('dash-gates');
      els.timeInfo = document.getElementById('dash-time');
      els.agentGrid = document.getElementById('dash-agents');
      els.servicesList = document.getElementById('dash-services');

      renderModes(null);

      // Mode button clicks
      els.modeGrid.addEventListener('click', (e) => {
        const btn = e.target.closest('.mode-btn');
        if (btn) setMode(btn.dataset.mode);
      });
    },

    onStateUpdate(state) {
      currentMode = state.mode;
      renderModes(state.mode);
      renderGates(state);
      renderAgents(state.agents);
      renderTime(state.time);

      // Update agent count header
      const header = els.agentGrid.previousElementSibling;
      if (header) header.textContent = `Agents (${state.agentCount || 0})`;
    },

    onActivate() {
      loadServices();
    },

    onWSMessage(msg) {
      // Refresh on mode change events
      if (msg.type === 'event' && msg.event?.eventType?.includes('mode')) {
        VP.refreshState();
      }
    }
  };
})();
