/**
 * Villa Portal — Chat Module
 * Message bubbles, agent selector, WebSocket chat, localStorage history
 * Phase 2: Auto-speak (Edward TTS in browser via ElevenLabs)
 * Phase 3: Mic input (Web Speech API for hands-free voice input)
 */
(function () {
  'use strict';
  const VP = window.VillaPortal;

  const HISTORY_KEY = 'villa_portal_chat';
  const MAX_HISTORY = 100;
  const AGENTS = ['auto', 'claude', 'gemini', 'chatgpt', 'ha', 'imagen', 'ollama', 'rag', 'claude-ha', 'claude-tools'];

  let messages = [];
  let pendingId = null;
  let autoSpeak = localStorage.getItem('villa_auto_speak') === 'true';
  let els = {};

  // Speech recognition state
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognition = null;
  let isRecording = false;

  function loadHistory() {
    try {
      messages = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]').slice(-MAX_HISTORY);
    } catch { messages = []; }
  }

  function saveHistory() {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(messages.slice(-MAX_HISTORY)));
    } catch {}
  }

  function renderMessages() {
    els.list.innerHTML = '';
    for (const m of messages) {
      els.list.appendChild(createBubble(m));
    }
    scrollBottom();
  }

  function createBubble(m) {
    const div = document.createElement('div');
    div.className = `chat-msg ${m.role}`;

    if (m.image) {
      const img = document.createElement('img');
      img.className = 'msg-image';
      img.src = `/api/images/${encodeURIComponent(m.image)}`;
      img.alt = 'Generated image';
      img.loading = 'lazy';
      img.addEventListener('click', () => openLightbox(img.src));
      div.appendChild(img);
    }

    if (m.text) {
      const p = document.createElement('div');
      p.textContent = m.text;
      div.appendChild(p);
    }

    if (m.meta) {
      const meta = document.createElement('div');
      meta.className = 'msg-meta';
      meta.textContent = m.meta;
      div.appendChild(meta);
    }

    return div;
  }

  function openLightbox(src) {
    const lb = document.createElement('div');
    lb.className = 'lightbox';
    lb.innerHTML = `<button class="lightbox-close">&times;</button><img src="${src}" alt="Full image">`;
    lb.addEventListener('click', (e) => {
      if (e.target === lb || e.target.classList.contains('lightbox-close')) lb.remove();
    });
    document.body.appendChild(lb);
  }

  function addThinking(id) {
    const div = document.createElement('div');
    div.className = 'chat-msg thinking';
    div.id = `thinking-${id}`;
    div.textContent = 'Thinking';
    els.list.appendChild(div);
    scrollBottom();
  }

  function removeThinking(id) {
    const el = document.getElementById(`thinking-${id}`);
    if (el) el.remove();
  }

  function scrollBottom() {
    requestAnimationFrame(() => {
      els.list.scrollTop = els.list.scrollHeight;
    });
  }

  /** Play TTS audio in browser via ElevenLabs */
  async function speakInBrowser(text, voice) {
    if (!text || text.length > 500) return;
    try {
      const body = { text: text.substring(0, 500), voice: voice || 'edward' };
      const res = await fetch('/api/villa/tts', {
        method: 'POST',
        headers: VP.headers(),
        body: JSON.stringify(body),
      });
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.addEventListener('ended', () => URL.revokeObjectURL(url));
      audio.play().catch(() => {});
    } catch {}
  }

  function toggleAutoSpeak() {
    autoSpeak = !autoSpeak;
    localStorage.setItem('villa_auto_speak', autoSpeak);
    els.speakBtn.classList.toggle('active', autoSpeak);
    els.speakBtn.title = autoSpeak ? 'Edward is speaking (click to mute)' : 'Enable Edward voice';
    VP.sendWS({ type: 'set_auto_speak', enabled: autoSpeak });
  }

  /** Initialize Web Speech API microphone */
  function initMic() {
    if (!SpeechRecognition) {
      els.micBtn.style.display = 'none';
      return;
    }
    recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = (e) => {
      const transcript = Array.from(e.results)
        .map(r => r[0].transcript).join('');
      els.input.value = transcript;
      els.input.style.height = 'auto';
      els.input.style.height = Math.min(els.input.scrollHeight, 120) + 'px';
      els.sendBtn.disabled = !transcript.trim();
      if (e.results[e.results.length - 1].isFinal) {
        stopMic();
        if (transcript.trim()) send();
      }
    };

    recognition.onerror = () => { stopMic(); };
    recognition.onend = () => { stopMic(); };
  }

  function toggleMic() {
    if (isRecording) { stopMic(); return; }
    isRecording = true;
    els.micBtn.classList.add('recording');
    els.input.placeholder = 'Listening...';
    recognition.start();
  }

  function stopMic() {
    if (!isRecording) return;
    isRecording = false;
    els.micBtn.classList.remove('recording');
    els.input.placeholder = 'Talk to Villa Romanza...';
    try { recognition.stop(); } catch {}
  }

  function send() {
    const text = els.input.value.trim();
    if (!text || pendingId) return;

    const agent = els.agentSelect.value;
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

    // Add user message
    const userMsg = { role: 'user', text, meta: agent !== 'auto' ? agent : null, ts: Date.now() };
    messages.push(userMsg);
    els.list.appendChild(createBubble(userMsg));
    saveHistory();

    els.input.value = '';
    els.input.style.height = 'auto';
    els.sendBtn.disabled = true;
    pendingId = id;

    // Try WebSocket first, fall back to HTTP
    const sent = VP.sendWS({ type: 'chat', id, message: text, agent });
    if (!sent) {
      sendHTTP(id, text, agent);
    }

    addThinking(id);
  }

  async function sendHTTP(id, message, agent) {
    try {
      const data = await VP.apiFetch('/api/chat', {
        method: 'POST',
        body: JSON.stringify({ message, agent })
      });
      handleResponse(id, data);
    } catch (err) {
      handleResponse(id, { result: `Error: ${err.message}`, agent: 'system', success: false });
    }
  }

  function handleResponse(id, data) {
    removeThinking(id);
    pendingId = null;
    els.sendBtn.disabled = false;

    const text = typeof data.result === 'string' ? data.result : JSON.stringify(data.result);
    const meta = [data.agent, data.duration ? `${data.duration}ms` : null].filter(Boolean).join(' | ');

    // Check if response contains an image filename
    let image = null;
    const imageMatch = text.match(/(?:saved|generated|created).*?([a-zA-Z0-9_-]+\.(png|jpg|jpeg|webp))/i);
    if (imageMatch) image = imageMatch[1];

    const pathMatch = text.match(/\/[^\s]+\.(png|jpg|jpeg|webp)/i);
    if (pathMatch && !image) {
      const parts = pathMatch[0].split('/');
      image = parts[parts.length - 1];
    }

    const agentMsg = { role: 'agent', text, meta, image, ts: Date.now() };
    messages.push(agentMsg);
    els.list.appendChild(createBubble(agentMsg));
    saveHistory();
    scrollBottom();

    // Auto-speak: have Edward read the response aloud in browser
    if (autoSpeak && data.success !== false && !image) {
      speakInBrowser(text);
    }

    // Notify images module to refresh if image was generated
    if (image && VP.modules.images && typeof VP.modules.images.refresh === 'function') {
      VP.modules.images.refresh();
    }
  }

  VP.modules.chat = {
    init() {
      const panel = document.getElementById('panel-chat');
      panel.innerHTML = `
        <div class="chat-messages" id="chat-messages"></div>
        <div class="chat-input-bar">
          <select class="chat-agent-select" id="chat-agent">
            ${AGENTS.map(a => `<option value="${a}">${a}</option>`).join('')}
          </select>
          <button class="chat-speak-btn${autoSpeak ? ' active' : ''}" id="chat-speak" title="${autoSpeak ? 'Edward is speaking (click to mute)' : 'Enable Edward voice'}">&#x1F50A;</button>
          <button class="chat-mic-btn" id="chat-mic" title="Tap to talk">&#x1F3A4;</button>
          <textarea class="chat-input" id="chat-input" placeholder="Talk to Villa Romanza..." rows="1"></textarea>
          <button class="chat-send" id="chat-send" disabled>&#9654;</button>
        </div>
      `;

      els.list = document.getElementById('chat-messages');
      els.input = document.getElementById('chat-input');
      els.sendBtn = document.getElementById('chat-send');
      els.agentSelect = document.getElementById('chat-agent');
      els.speakBtn = document.getElementById('chat-speak');
      els.micBtn = document.getElementById('chat-mic');

      // Auto-speak toggle
      els.speakBtn.addEventListener('click', toggleAutoSpeak);

      // Mic button
      els.micBtn.addEventListener('click', toggleMic);
      initMic();

      // Auto-resize textarea
      els.input.addEventListener('input', () => {
        els.input.style.height = 'auto';
        els.input.style.height = Math.min(els.input.scrollHeight, 120) + 'px';
        els.sendBtn.disabled = !els.input.value.trim();
      });

      // Send on Enter (Shift+Enter for newline)
      els.input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          send();
        }
      });

      els.sendBtn.addEventListener('click', send);

      // Keyboard shortcut: / focuses input
      document.addEventListener('keydown', (e) => {
        if (e.key === '/' && VP.activePanel === 'chat' && document.activeElement !== els.input) {
          e.preventDefault();
          els.input.focus();
        }
      });

      loadHistory();
      renderMessages();

      // Sync auto-speak state with server
      if (autoSpeak) VP.sendWS({ type: 'set_auto_speak', enabled: true });
    },

    onWSMessage(msg) {
      if (msg.type === 'chat_start' && msg.id === pendingId) {
        // Already showing thinking indicator
      } else if (msg.type === 'chat_response') {
        handleResponse(msg.id, msg);
      } else if (msg.type === 'error' && pendingId) {
        handleResponse(pendingId, { result: `Error: ${msg.message}`, agent: 'system', success: false });
      }
    },

    onActivate() {
      scrollBottom();
      els.input.focus();
    }
  };
})();
