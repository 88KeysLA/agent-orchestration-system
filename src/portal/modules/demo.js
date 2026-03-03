/**
 * Villa Portal — Demo Sequences Module
 * One-click mode demos with Edward TTS narration
 */
(function () {
  'use strict';
  const VP = window.VillaPortal;

  let sequences = [];
  let selectedId = null;
  let running = false;
  let els = {};
  let ttsQueue = Promise.resolve();

  function render() {
    const panel = document.getElementById('panel-demo');
    panel.innerHTML = `
      <div class="demo-container dashboard">
        <div class="dash-section">
          <h2>Demo Sequences</h2>
          <div class="demo-grid" id="demo-grid"></div>
        </div>
        <div id="demo-idle-section">
          <button class="demo-start-btn" id="demo-start" disabled>Select a sequence</button>
        </div>
        <div id="demo-running-section" class="hidden">
          <div class="dash-section">
            <h2>Now Playing</h2>
            <div class="demo-step-label" id="demo-step-label"></div>
            <div class="demo-progress"><div class="demo-progress-fill" id="demo-progress-fill"></div></div>
            <div class="demo-narration" id="demo-narration"></div>
          </div>
          <button class="demo-stop-btn" id="demo-stop">Stop Demo</button>
        </div>
      </div>
    `;

    els.grid = document.getElementById('demo-grid');
    els.startBtn = document.getElementById('demo-start');
    els.stopBtn = document.getElementById('demo-stop');
    els.idleSection = document.getElementById('demo-idle-section');
    els.runningSection = document.getElementById('demo-running-section');
    els.stepLabel = document.getElementById('demo-step-label');
    els.progressFill = document.getElementById('demo-progress-fill');
    els.narration = document.getElementById('demo-narration');

    els.startBtn.addEventListener('click', startDemo);
    els.stopBtn.addEventListener('click', stopDemo);

    renderCards();
  }

  function renderCards() {
    if (!els.grid) return;
    els.grid.innerHTML = sequences.map(s => `
      <div class="demo-card${selectedId === s.id ? ' selected' : ''}" data-id="${s.id}">
        <div class="demo-card-name">${s.name}</div>
        <div class="demo-card-desc">${s.description}</div>
        <div class="demo-card-meta">${s.stepCount} steps &middot; ${formatDuration(s.duration)}</div>
      </div>
    `).join('');

    els.grid.querySelectorAll('.demo-card').forEach(card => {
      card.addEventListener('click', () => selectSequence(card.dataset.id));
    });
  }

  function formatDuration(seconds) {
    if (seconds < 60) return `${seconds}s`;
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return s ? `${m}m ${s}s` : `${m}m`;
  }

  function selectSequence(id) {
    if (running) return;
    selectedId = id;
    const seq = sequences.find(s => s.id === id);
    renderCards();
    els.startBtn.disabled = false;
    els.startBtn.textContent = `Start ${seq ? seq.name : id}`;
  }

  async function startDemo() {
    if (!selectedId || running) return;
    els.startBtn.disabled = true;
    try {
      const res = await VP.apiFetch('/api/demo/start', {
        method: 'POST',
        body: JSON.stringify({ sequence: selectedId }),
      });
      if (res.success) {
        setRunning(true, selectedId, 0, res.totalSteps);
      } else {
        els.startBtn.disabled = false;
        els.startBtn.textContent = res.error || 'Failed';
      }
    } catch (err) {
      els.startBtn.disabled = false;
      els.startBtn.textContent = 'Error — try again';
    }
  }

  async function stopDemo() {
    els.stopBtn.disabled = true;
    try {
      await VP.apiFetch('/api/demo/stop', { method: 'POST', body: '{}' });
    } catch {}
    setRunning(false);
    els.stopBtn.disabled = false;
  }

  function setRunning(isRunning, seqId, stepIdx, totalSteps) {
    running = isRunning;
    if (isRunning) {
      els.idleSection.classList.add('hidden');
      els.runningSection.classList.remove('hidden');
      updateProgress(stepIdx, totalSteps, '', '');
    } else {
      els.idleSection.classList.remove('hidden');
      els.runningSection.classList.add('hidden');
      els.startBtn.disabled = !selectedId;
      const seq = sequences.find(s => s.id === selectedId);
      els.startBtn.textContent = selectedId ? `Start ${seq ? seq.name : selectedId}` : 'Select a sequence';
    }
  }

  function updateProgress(stepIdx, totalSteps, mode, narration) {
    const pct = totalSteps > 0 ? ((stepIdx + 1) / totalSteps) * 100 : 0;
    els.stepLabel.textContent = `Step ${stepIdx + 1} of ${totalSteps}: ${mode}`;
    els.progressFill.style.width = `${pct}%`;
    if (narration) {
      els.narration.textContent = narration;
      els.narration.classList.remove('demo-narration-fade');
      void els.narration.offsetWidth; // trigger reflow
      els.narration.classList.add('demo-narration-fade');
    }
  }

  /** Queue TTS so narrations don't overlap */
  function queueTTS(text, voice) {
    ttsQueue = ttsQueue.then(() => speakTTS(text, voice)).catch(() => {});
  }

  async function speakTTS(text, voice) {
    if (!text) return;
    try {
      const res = await fetch('/api/villa/tts', {
        method: 'POST',
        headers: VP.headers(),
        body: JSON.stringify({ text, voice: voice || 'edward' }),
      });
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      await new Promise((resolve) => {
        audio.addEventListener('ended', () => { URL.revokeObjectURL(url); resolve(); });
        audio.addEventListener('error', () => { URL.revokeObjectURL(url); resolve(); });
        audio.play().catch(resolve);
      });
    } catch {}
  }

  VP.modules.demo = {
    init() {
      render();
    },

    async onActivate() {
      // Fetch sequences
      try {
        const data = await VP.apiFetch('/api/demo/sequences');
        sequences = data.sequences || [];
        renderCards();
      } catch {}

      // Check if a demo is already running (reconnect resilience)
      try {
        const status = await VP.apiFetch('/api/demo/status');
        if (status.running) {
          selectedId = status.sequenceId;
          setRunning(true, status.sequenceId, status.stepIndex, status.totalSteps);
          if (status.currentStep) {
            updateProgress(status.stepIndex, status.totalSteps, status.currentStep.mode, status.currentStep.narration);
          }
        }
      } catch {}
    },

    onWSMessage(msg) {
      if (msg.type === 'demo:step') {
        setRunning(true, msg.sequenceId, msg.stepIndex, msg.totalSteps);
        updateProgress(msg.stepIndex, msg.totalSteps, msg.mode, msg.narration);
        queueTTS(msg.narration, msg.voice);
      } else if (msg.type === 'demo:complete') {
        setRunning(false);
      } else if (msg.type === 'demo:stopped') {
        setRunning(false);
      } else if (msg.type === 'demo:error') {
        setRunning(false);
        if (els.startBtn) els.startBtn.textContent = `Error: ${msg.message}`;
      }
    },

    onStateUpdate(state) {
      // Mode badge is updated by app.js already
    }
  };
})();
