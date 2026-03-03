/**
 * Villa Portal — Main Application Controller
 * Auth, WebSocket, routing, module initialization
 */
(function () {
  'use strict';

  const VP = window.VillaPortal = {
    token: localStorage.getItem('villa_portal_token'),
    ws: null,
    wsReconnectTimer: null,
    activePanel: 'chat',
    modules: {},

    // --- Auth ---
    headers() {
      const h = { 'Content-Type': 'application/json' };
      if (this.token) h['Authorization'] = `Bearer ${this.token}`;
      return h;
    },

    async apiFetch(path, opts = {}) {
      opts.headers = this.headers();
      const res = await fetch(path, opts);
      if (res.status === 401) {
        this.logout();
        throw new Error('Unauthorized');
      }
      return res.json();
    },

    login(key) {
      this.token = key;
      localStorage.setItem('villa_portal_token', key);
      document.getElementById('login-overlay').classList.add('hidden');
      document.getElementById('app').classList.remove('hidden');
      this.init();
    },

    logout() {
      this.token = null;
      localStorage.removeItem('villa_portal_token');
      if (this.ws) this.ws.close();
      document.getElementById('login-overlay').classList.remove('hidden');
      document.getElementById('app').classList.add('hidden');
    },

    // --- WebSocket ---
    connectWS() {
      if (this.ws && this.ws.readyState <= 1) return;
      clearTimeout(this.wsReconnectTimer);

      const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
      const url = `${proto}//${location.host}/ws?token=${encodeURIComponent(this.token || '')}`;
      const statusDot = document.getElementById('ws-status');
      statusDot.className = 'status-dot connecting';

      const ws = new WebSocket(url);

      ws.onopen = () => {
        statusDot.className = 'status-dot connected';
        console.log('[Portal] WebSocket connected');
      };

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          this.handleWSMessage(msg);
        } catch {}
      };

      ws.onclose = () => {
        statusDot.className = 'status-dot';
        console.log('[Portal] WebSocket disconnected, reconnecting in 3s');
        this.wsReconnectTimer = setTimeout(() => this.connectWS(), 3000);
      };

      ws.onerror = () => {
        ws.close();
      };

      this.ws = ws;
    },

    handleWSMessage(msg) {
      // Dispatch to modules
      for (const mod of Object.values(this.modules)) {
        if (typeof mod.onWSMessage === 'function') mod.onWSMessage(msg);
      }
    },

    sendWS(msg) {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify(msg));
        return true;
      }
      return false;
    },

    // --- Routing ---
    switchPanel(name) {
      this.activePanel = name;
      document.querySelectorAll('.nav-tab').forEach(t => {
        t.classList.toggle('active', t.dataset.panel === name);
      });
      document.querySelectorAll('.panel').forEach(p => {
        p.classList.toggle('active', p.id === `panel-${name}`);
      });
      const mod = this.modules[name];
      if (mod && typeof mod.onActivate === 'function') mod.onActivate();
    },

    // --- Init ---
    init() {
      this.connectWS();

      // Tab switching
      document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.addEventListener('click', () => this.switchPanel(tab.dataset.panel));
      });

      // Init modules (they register themselves on VillaPortal.modules)
      for (const mod of Object.values(this.modules)) {
        if (typeof mod.init === 'function') mod.init();
      }

      // Fetch initial state
      this.refreshState();
      this._stateInterval = setInterval(() => this.refreshState(), 15000);
    },

    async refreshState() {
      try {
        const state = await this.apiFetch('/api/villa/state');
        document.getElementById('mode-badge').textContent = state.mode || '--';
        for (const mod of Object.values(this.modules)) {
          if (typeof mod.onStateUpdate === 'function') mod.onStateUpdate(state);
        }
      } catch {}
    }
  };

  // --- Boot ---
  document.addEventListener('DOMContentLoaded', () => {
    // Login form
    document.getElementById('login-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const key = document.getElementById('login-key').value.trim();
      if (key) VP.login(key);
    });

    // Auto-login from ?token= query param (bookmarkable URL)
    const urlToken = new URLSearchParams(location.search).get('token');
    if (urlToken) {
      VP.login(urlToken);
      // Clean token from URL bar so it's not visible/shared accidentally
      history.replaceState(null, '', location.pathname);
      return;
    }

    // Auto-login if token exists in localStorage
    if (VP.token) {
      document.getElementById('login-overlay').classList.add('hidden');
      document.getElementById('app').classList.remove('hidden');
      VP.init();
    }
  });
})();
