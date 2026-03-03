/**
 * Villa Portal — Audio Visualization Module
 * Polls Show Mac audio state, renders spectrum + metrics
 */
(function () {
  'use strict';
  const VP = window.VillaPortal;

  let els = {};
  let pollTimer = null;
  let audioData = null;

  async function pollAudio() {
    try {
      audioData = await VP.apiFetch('/api/show/audio');
      render();
    } catch {}
  }

  function render() {
    if (!audioData) {
      els.display.innerHTML = '<div class="image-empty">Audio analysis offline</div>';
      return;
    }

    const bpm = audioData.bpm || audioData.current_bpm || '--';
    const key = audioData.key || audioData.current_key || '--';
    const chord = audioData.chord || audioData.current_chord || '--';
    const energy = audioData.energy ?? audioData.current_energy;
    const mood = audioData.mood || audioData.current_mood || '--';

    const energyPct = energy != null ? (energy * 100).toFixed(0) : '--';
    const barWidth = energy != null ? Math.min(100, energy * 100) : 0;

    els.display.innerHTML = `
      <div class="audio-metrics">
        <div class="audio-big">
          <span class="audio-bpm">${bpm}</span>
          <span class="audio-bpm-label">BPM</span>
        </div>
        <div class="audio-details">
          <div class="audio-row"><span>Key</span><strong>${key}</strong></div>
          <div class="audio-row"><span>Chord</span><strong>${chord}</strong></div>
          <div class="audio-row"><span>Mood</span><strong>${mood}</strong></div>
          <div class="audio-row"><span>Energy</span><strong>${energyPct}%</strong></div>
        </div>
      </div>
      <div class="energy-bar-container">
        <div class="energy-bar" style="width:${barWidth}%"></div>
      </div>
    `;
  }

  VP.modules['audio-viz'] = {
    init() {
      const panel = document.getElementById('panel-audio');
      panel.innerHTML = `
        <div class="dashboard">
          <div class="dash-section">
            <h2>Audio Analysis — FX Mac</h2>
            <div id="audio-display" class="audio-display">
              <div class="image-empty">Connecting...</div>
            </div>
          </div>
        </div>
      `;
      els.display = document.getElementById('audio-display');
    },

    onActivate() {
      pollAudio();
      clearInterval(pollTimer);
      pollTimer = setInterval(pollAudio, 2000);
    },

    onDeactivate() {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  };
})();
