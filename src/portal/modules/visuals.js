/**
 * Villa Portal — Visual Generation Module
 * BPM-synced video generation for currently playing track
 */
(function() {
  'use strict';
  const VP = window.VillaPortal;

  const els = {};
  let currentJob = null;
  let currentVideo = null;
  let autoGenerateEnabled = false;
  let lastGeneratedTrack = null;

  function init() {
    els.panel = document.getElementById('panel-visuals');
    if (!els.panel) return;

    els.panel.innerHTML = `
      <div class="visuals-container">
        <div class="visual-presets">
          <button class="preset-btn" data-bpm="70" data-mood="calm">🎹 Chill Lounge</button>
          <button class="preset-btn" data-bpm="128" data-mood="energetic">💃 Dance Party</button>
          <button class="preset-btn" data-bpm="140" data-mood="dark">🌑 Dark Club</button>
          <button class="preset-btn" data-bpm="120" data-mood="happy">😊 Happy Hour</button>
          <button class="preset-btn" data-bpm="116" data-mood="energetic">🎸 Rock Energy</button>
          <button class="preset-btn" data-bpm="93" data-mood="dark">🎤 Hip Hop</button>
          <button class="preset-btn" data-bpm="138" data-mood="mysterious">✨ Trance</button>
          <button class="preset-btn" data-bpm="66" data-mood="calm">🎻 Classical</button>
        </div>
        
        <div class="visual-player" id="visual-player">
          <video id="visual-video" loop muted autoplay></video>
          <div class="visual-overlay">
            <div class="visual-info"></div>
            <button class="fullscreen-btn" title="Fullscreen (double-click video)">⛶</button>
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
          <button id="visual-auto" class="btn-secondary">Auto-Generate: OFF</button>
        </div>
        
        <div class="visual-status"></div>
        
        <div class="visual-cache">
          <h3>Cached Visuals</h3>
          <div class="cache-grid"></div>
        </div>
      </div>
    `;

    els.video = document.getElementById('visual-video');
    els.player = document.getElementById('visual-player');
    els.bpmInput = document.getElementById('visual-bpm');
    els.moodSelect = document.getElementById('visual-mood');
    els.generateBtn = document.getElementById('visual-generate');
    els.autoBtn = document.getElementById('visual-auto');
    els.fullscreenBtn = els.panel.querySelector('.fullscreen-btn');
    els.status = els.panel.querySelector('.visual-status');
    els.info = els.panel.querySelector('.visual-info');
    els.cacheGrid = els.panel.querySelector('.cache-grid');

    els.generateBtn.addEventListener('click', generateVisual);
    els.autoBtn.addEventListener('click', toggleAutoGenerate);
    els.fullscreenBtn.addEventListener('click', toggleFullscreen);
    els.video.addEventListener('dblclick', toggleFullscreen);
    
    // Preset buttons
    els.panel.querySelectorAll('.preset-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const bpm = parseInt(btn.dataset.bpm);
        const mood = btn.dataset.mood;
        loadCachedVisual(bpm, mood);
      });
    });

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

  async function generateForTrack(track) {
    // Avoid regenerating for same track
    if (lastGeneratedTrack === track.title) return;
    lastGeneratedTrack = track.title;

    // Estimate BPM and mood from track metadata
    const bpm = estimateBPM(track);
    const mood = estimateMood(track);

    els.bpmInput.value = bpm;
    els.moodSelect.value = mood;

    showStatus(`Auto-generating for: ${track.title}`, 'info');
    await generateVisual();
  }

  function estimateBPM(track) {
    // Try to extract BPM from track metadata
    // Fallback to genre-based estimation
    const genre = (track.genre || '').toLowerCase();
    
    if (genre.includes('ambient') || genre.includes('chill')) return 70;
    if (genre.includes('house') || genre.includes('dance')) return 128;
    if (genre.includes('drum') || genre.includes('bass')) return 170;
    if (genre.includes('techno')) return 140;
    
    return 120; // Default
  }

  function estimateMood(track) {
    const title = (track.title || '').toLowerCase();
    const genre = (track.genre || '').toLowerCase();
    
    if (title.includes('dark') || genre.includes('dark')) return 'dark';
    if (title.includes('happy') || genre.includes('happy')) return 'happy';
    if (title.includes('sad') || genre.includes('sad')) return 'sad';
    if (title.includes('chill') || genre.includes('ambient')) return 'calm';
    if (genre.includes('dance') || genre.includes('house')) return 'energetic';
    
    return 'energetic'; // Default
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
    autoGenerateEnabled = !autoGenerateEnabled;
    els.autoBtn.textContent = `Auto-Generate: ${autoGenerateEnabled ? 'ON' : 'OFF'}`;
    els.autoBtn.classList.toggle('btn-active', autoGenerateEnabled);
    
    if (autoGenerateEnabled) {
      showStatus('Auto-generate enabled - will generate on track change', 'success');
    } else {
      showStatus('Auto-generate disabled', 'info');
      lastGeneratedTrack = null;
    }
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      els.player.requestFullscreen().catch(err => {
        console.error('Fullscreen failed:', err);
      });
    } else {
      document.exitFullscreen();
    }
  }

  async function loadCachedVisual(bpm, mood) {
    const cacheKey = `${bpm}_${mood}`;
    
    try {
      const res = await fetch(`/api/visual/video/${cacheKey}`);
      if (res.ok) {
        loadVisual({ bpm, mood, cached: true });
        els.bpmInput.value = bpm;
        els.moodSelect.value = mood;
      } else {
        showStatus(`Visual not cached - generating...`, 'info');
        els.bpmInput.value = bpm;
        els.moodSelect.value = mood;
        await generateVisual();
      }
    } catch (err) {
      showStatus(`Error loading visual: ${err.message}`, 'error');
    }
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

  VP.modules.visuals = { 
    init,
    generateForTrack,
    get autoGenerateEnabled() { return autoGenerateEnabled; }
  };
})();
