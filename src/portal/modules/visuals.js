/**
 * Villa Portal — Visual Generation Module
 * BPM-synced video generation for currently playing track
 */
(function() {
  'use strict';

  const els = {};
  let currentJob = null;
  let currentVideo = null;

  function init() {
    els.panel = document.getElementById('panel-visuals');
    if (!els.panel) return;

    els.panel.innerHTML = `
      <div class="visuals-container">
        <div class="visual-player">
          <video id="visual-video" loop muted autoplay></video>
          <div class="visual-overlay">
            <div class="visual-info"></div>
          </div>
        </div>
        
        <div class="visual-controls">
          <div class="control-group">
            <label>BPM</label>
            <input type="number" id="visual-bpm" value="120" min="40" max="200">
          </div>
          
          <div class="control-group">
            <label>Mood</label>
            <select id="visual-mood">
              <option value="calm">Calm</option>
              <option value="happy">Happy</option>
              <option value="sad">Sad</option>
              <option value="energetic" selected>Energetic</option>
              <option value="dark">Dark</option>
              <option value="mysterious">Mysterious</option>
            </select>
          </div>
          
          <button id="visual-generate" class="btn-primary">Generate Visual</button>
          <button id="visual-auto" class="btn-secondary">Auto-Generate</button>
        </div>
        
        <div class="visual-status"></div>
        
        <div class="visual-cache">
          <h3>Cached Visuals</h3>
          <div class="cache-grid"></div>
        </div>
      </div>
    `;

    els.video = document.getElementById('visual-video');
    els.bpmInput = document.getElementById('visual-bpm');
    els.moodSelect = document.getElementById('visual-mood');
    els.generateBtn = document.getElementById('visual-generate');
    els.autoBtn = document.getElementById('visual-auto');
    els.status = els.panel.querySelector('.visual-status');
    els.info = els.panel.querySelector('.visual-info');
    els.cacheGrid = els.panel.querySelector('.cache-grid');

    els.generateBtn.addEventListener('click', generateVisual);
    els.autoBtn.addEventListener('click', toggleAutoGenerate);

    loadCachedVisuals();
  }

  async function generateVisual() {
    const bpm = parseInt(els.bpmInput.value);
    const mood = els.moodSelect.value;

    if (bpm < 40 || bpm > 200) {
      showStatus('BPM must be between 40 and 200', 'error');
      return;
    }

    els.generateBtn.disabled = true;
    showStatus('Starting generation...', 'info');

    try {
      const res = await fetch('/api/visual/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bpm, mood, trackId: Date.now() })
      });

      const { jobId } = await res.json();
      currentJob = jobId;

      pollJobStatus(jobId);
    } catch (err) {
      showStatus(`Error: ${err.message}`, 'error');
      els.generateBtn.disabled = false;
    }
  }

  async function pollJobStatus(jobId) {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/visual/status/${jobId}`);
        const job = await res.json();

        if (job.status === 'complete') {
          clearInterval(interval);
          showStatus('Generation complete!', 'success');
          loadVisual(job.result);
          loadCachedVisuals();
          els.generateBtn.disabled = false;
        } else if (job.status === 'failed') {
          clearInterval(interval);
          showStatus(`Failed: ${job.error}`, 'error');
          els.generateBtn.disabled = false;
        } else {
          showStatus('Generating... (~30-50 seconds)', 'info');
        }
      } catch (err) {
        clearInterval(interval);
        showStatus(`Error: ${err.message}`, 'error');
        els.generateBtn.disabled = false;
      }
    }, 2000);
  }

  function loadVisual(result) {
    const cacheKey = `${result.bpm}_${result.mood}`;
    els.video.src = `/api/visual/video/${cacheKey}`;
    els.video.load();
    els.video.play();
    
    els.info.textContent = `${result.bpm} BPM • ${result.mood} • ${result.cached ? 'Cached' : 'Fresh'}`;
    currentVideo = result;
  }

  async function loadCachedVisuals() {
    try {
      const res = await fetch('/api/visual/cache');
      const { cached } = await res.json();

      els.cacheGrid.innerHTML = cached.map(key => {
        const [bpm, mood] = key.split('_');
        return `
          <div class="cache-item" data-key="${key}">
            <video src="/api/visual/video/${key}" muted loop></video>
            <div class="cache-info">${bpm} BPM • ${mood}</div>
          </div>
        `;
      }).join('');

      els.cacheGrid.querySelectorAll('.cache-item').forEach(item => {
        item.addEventListener('click', () => {
          const key = item.dataset.key;
          const [bpm, mood] = key.split('_');
          loadVisual({ bpm, mood, cached: true });
        });

        const video = item.querySelector('video');
        item.addEventListener('mouseenter', () => video.play());
        item.addEventListener('mouseleave', () => video.pause());
      });
    } catch (err) {
      console.error('Failed to load cache:', err);
    }
  }

  function toggleAutoGenerate() {
    // TODO: Hook into music player to auto-generate on track change
    showStatus('Auto-generate not yet implemented', 'info');
  }

  function showStatus(message, type = 'info') {
    els.status.textContent = message;
    els.status.className = `visual-status status-${type}`;
    setTimeout(() => {
      if (els.status.textContent === message) {
        els.status.textContent = '';
      }
    }, 5000);
  }

  if (typeof VP !== 'undefined') {
    VP.modules.visuals = { init };
  }
})();
