/**
 * Villa Portal — Visual Stream Module
 * Show Mac MJPEG viewer with loading/error states
 */
(function () {
  'use strict';
  const VP = window.VillaPortal;

  let els = {};
  let streaming = false;
  let showState = null;

  function startStream() {
    if (streaming) return;
    const token = VP.token ? `&token=${encodeURIComponent(VP.token)}` : '';
    const url = `/api/stream/show?width=720&fps=15&quality=70${token}`;
    els.stream.src = url;
    els.stream.style.display = 'block';
    els.placeholder.style.display = 'none';
    els.startBtn.textContent = 'Stop';
    streaming = true;
  }

  function stopStream() {
    els.stream.src = '';
    els.stream.style.display = 'none';
    els.placeholder.style.display = 'flex';
    els.startBtn.textContent = 'Start Stream';
    streaming = false;
  }

  async function fetchShowState() {
    try {
      showState = await VP.apiFetch('/api/show/state');
      renderState();
    } catch {}
  }

  function renderState() {
    if (!showState) {
      els.stateInfo.innerHTML = '<span>Show pipeline offline</span>';
      return;
    }
    els.stateInfo.innerHTML = `
      <span>Mode:<strong>${showState.mode || '--'}</strong></span>
      <span>FPS:<strong>${(showState.fps || 0).toFixed(1)}</strong></span>
      <span>Frames:<strong>${showState.frame_count || 0}</strong></span>
      <span>Audio:<strong>${showState.audio_active ? 'Active' : 'Off'}</strong></span>
    `;
  }

  VP.modules.visual = {
    init() {
      const panel = document.getElementById('panel-visual');
      panel.innerHTML = `
        <div class="visual-container">
          <div class="visual-toolbar">
            <h2>Show Mac — Visual Compositor</h2>
            <div class="visual-controls">
              <button id="visual-toggle" class="visual-btn">Start Stream</button>
              <button id="visual-refresh" class="visual-btn">Refresh State</button>
            </div>
          </div>
          <div class="visual-viewport">
            <div class="visual-placeholder" id="visual-placeholder">
              <div>Visual stream offline</div>
              <div class="visual-sub">Tap Start to connect to Show Mac</div>
            </div>
            <img id="visual-stream" class="visual-stream" alt="Show Mac visual stream" style="display:none">
          </div>
          <div class="visual-state time-info" id="visual-state">
            <span>Loading...</span>
          </div>
        </div>
      `;

      els.stream = document.getElementById('visual-stream');
      els.placeholder = document.getElementById('visual-placeholder');
      els.startBtn = document.getElementById('visual-toggle');
      els.stateInfo = document.getElementById('visual-state');

      els.startBtn.addEventListener('click', () => {
        if (streaming) stopStream(); else startStream();
      });

      document.getElementById('visual-refresh').addEventListener('click', fetchShowState);

      // Handle stream errors
      els.stream.addEventListener('error', () => {
        stopStream();
        els.placeholder.innerHTML = '<div>Stream disconnected</div><div class="visual-sub">Tap Start to reconnect</div>';
      });
    },

    onActivate() {
      fetchShowState();
    }
  };
})();
