/**
 * Villa Portal — Music Module
 * Music Director controls: playback, recommendations, mood, zones
 */
(function () {
  'use strict';
  const VP = window.VillaPortal;

  const MOODS = ['calm', 'happy', 'energetic', 'melancholic', 'tense'];
  let musicState = null;
  let recommendations = [];
  let players = {};
  let els = {};

  async function fetchState() {
    try {
      musicState = await VP.apiFetch('/api/music/state');
      renderState();
    } catch { renderOffline(); }
  }

  async function fetchRecommendations() {
    try {
      const data = await VP.apiFetch('/api/music/recommendations?limit=8');
      recommendations = data.recommendations || [];
      players = data.players || {};
      renderRecommendations();
    } catch {}
  }

  async function fetchPlayers() {
    try {
      const data = await VP.apiFetch('/api/music/players');
      players = data.players || {};
      renderPlayers();
    } catch {}
  }

  function renderOffline() {
    els.currentInfo.innerHTML = '<span>Music Director offline</span>';
  }

  function renderState() {
    if (!musicState) return renderOffline();
    const c = musicState.current || {};
    els.currentInfo.innerHTML = `
      <div class="music-now">
        <div class="music-metric"><span class="music-label">Mood</span><span class="music-value">${c.mood || '--'}</span></div>
        <div class="music-metric"><span class="music-label">BPM</span><span class="music-value">${c.bpm || '--'}</span></div>
        <div class="music-metric"><span class="music-label">Key</span><span class="music-value">${c.key || '--'}</span></div>
        <div class="music-metric"><span class="music-label">Energy</span><span class="music-value">${c.energy != null ? (c.energy * 100).toFixed(0) + '%' : '--'}</span></div>
        <div class="music-metric"><span class="music-label">Trend</span><span class="music-value">${musicState.energy_trend || '--'}</span></div>
      </div>
    `;
  }

  function renderRecommendations() {
    if (recommendations.length === 0) {
      els.recList.innerHTML = '<div class="image-empty">No recommendations available</div>';
      return;
    }
    els.recList.innerHTML = recommendations.map((r, i) => `
      <div class="rec-card" data-index="${i}">
        <div class="rec-name">${esc(r.name || r.source || 'Unknown')}</div>
        <div class="rec-meta">${esc(r.source_type || '')} | score: ${(r.score || 0).toFixed(2)}</div>
      </div>
    `).join('');
  }

  function renderPlayers() {
    const entries = Object.entries(players);
    if (entries.length === 0) {
      els.playerList.innerHTML = '<div class="image-empty">No players</div>';
      return;
    }
    els.playerList.innerHTML = entries.map(([name, state]) => `
      <div class="player-card">
        <div class="player-name">${esc(name)}</div>
        <div class="player-state">${state?.state || 'unknown'}</div>
      </div>
    `).join('');
  }

  async function playRecommendation(index, player) {
    try {
      await VP.apiFetch('/api/music/play', {
        method: 'POST',
        body: JSON.stringify({ player, recommendation_index: index }),
      });
    } catch (err) {
      console.error('Play failed:', err);
    }
  }

  async function setMood(mood) {
    try {
      await VP.apiFetch('/api/music/mood', {
        method: 'POST',
        body: JSON.stringify({ mood, duration_minutes: 15 }),
      });
      fetchRecommendations();
    } catch (err) {
      console.error('Mood override failed:', err);
    }
  }

  async function clearMood() {
    try {
      await VP.apiFetch('/api/music/mood', {
        method: 'POST',
        body: JSON.stringify({ mood: 'calm', duration_minutes: 0 }),
      });
      fetchRecommendations();
    } catch {}
  }

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  VP.modules.music = {
    init() {
      const panel = document.getElementById('panel-music');
      panel.innerHTML = `
        <div class="dashboard">
          <div class="dash-section">
            <h2>Now Playing</h2>
            <div id="music-current" class="time-info">Loading...</div>
          </div>
          <div class="dash-section">
            <h2>Mood Override</h2>
            <div class="mode-grid" id="music-moods"></div>
          </div>
          <div class="dash-section">
            <h2>Recommendations</h2>
            <div class="services-list" id="music-recs"></div>
          </div>
          <div class="dash-section">
            <h2>Players</h2>
            <div class="services-list" id="music-players"></div>
          </div>
        </div>
      `;

      els.currentInfo = document.getElementById('music-current');
      els.recList = document.getElementById('music-recs');
      els.playerList = document.getElementById('music-players');
      const moodGrid = document.getElementById('music-moods');

      // Mood buttons
      moodGrid.innerHTML = MOODS.map(m =>
        `<button class="mode-btn" data-mood="${m}">${m}</button>`
      ).join('') + '<button class="mode-btn" data-mood="clear">Clear</button>';

      moodGrid.addEventListener('click', (e) => {
        const btn = e.target.closest('.mode-btn');
        if (!btn) return;
        const mood = btn.dataset.mood;
        if (mood === 'clear') clearMood(); else setMood(mood);
      });

      // Click recommendation to play
      els.recList.addEventListener('click', (e) => {
        const card = e.target.closest('.rec-card');
        if (!card) return;
        const index = parseInt(card.dataset.index);
        // Play on first available player (bar is common default)
        const firstPlayer = Object.keys(players)[0] || 'bar';
        playRecommendation(index, firstPlayer);
      });
    },

    onActivate() {
      fetchState();
      fetchRecommendations();
      fetchPlayers();
    }
  };
})();
