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
      const prev = this.activePanel;
      this.activePanel = name;
      document.querySelectorAll('.nav-tab').forEach(t => {
        t.classList.toggle('active', t.dataset.panel === name);
      });
      document.querySelectorAll('.panel').forEach(p => {
        p.classList.toggle('active', p.id === `panel-${name}`);
      });
      // Notify previous module of deactivation
      const prevMod = this.modules[prev];
      if (prevMod && typeof prevMod.onDeactivate === 'function') prevMod.onDeactivate();
      // Notify new module of activation
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

  // --- Keyboard Shortcuts ---
  const PANELS = ['chat','dashboard','demo','visual','visuals','jukebox','music','audition','audio','images','hitl'];

  function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      // Ignore when typing in inputs/textareas
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
      // Ignore with modifier keys (except shift)
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      // 1-9, 0 to switch panels
      const num = parseInt(e.key);
      if (num >= 1 && num <= 9 && num <= PANELS.length) {
        e.preventDefault();
        VP.switchPanel(PANELS[num - 1]);
        return;
      }
      if (e.key === '0' && PANELS.length >= 10) {
        e.preventDefault();
        VP.switchPanel(PANELS[9]);
        return;
      }

      // Escape closes lightboxes/modals/help
      if (e.key === 'Escape') {
        const lb = document.querySelector('.lightbox');
        if (lb) { lb.remove(); return; }
        const help = document.getElementById('shortcut-help');
        if (help) { help.remove(); return; }
        return;
      }

      // ? shows shortcut help
      if (e.key === '?') {
        toggleShortcutHelp();
        return;
      }
    });
  }

  function toggleShortcutHelp() {
    let overlay = document.getElementById('shortcut-help');
    if (overlay) { overlay.remove(); return; }
    overlay = document.createElement('div');
    overlay.id = 'shortcut-help';
    overlay.className = 'shortcut-overlay';

    const shortcuts = [
      ['1', 'Chat'], ['2', 'Dashboard'], ['3', 'Demo'], ['4', 'Visual'],
      ['5', 'Visuals'], ['6', 'Jukebox'], ['7', 'Music'], ['8', 'Audition'],
      ['9', 'Audio'], ['0', 'Images'], ['/', 'Focus chat input'],
      ['Esc', 'Close modal'], ['?', 'This help']
    ];

    const grid = shortcuts.map(([k, v]) =>
      `<kbd>${k}</kbd><span>${v}</span>`
    ).join('');

    const card = document.createElement('div');
    card.className = 'shortcut-card';
    card.innerHTML = `<h2>Keyboard Shortcuts</h2><div class="shortcut-grid">${grid}</div>`;

    const closeBtn = document.createElement('button');
    closeBtn.textContent = 'Close';
    closeBtn.addEventListener('click', () => overlay.remove());
    card.appendChild(closeBtn);

    overlay.appendChild(card);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });
    document.body.appendChild(overlay);
  }

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

    // Setup keyboard shortcuts
    setupKeyboardShortcuts();
  });
})();
