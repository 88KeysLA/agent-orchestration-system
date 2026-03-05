/**
 * Villa Portal — Music Module
 * Unified music search, Sonos playback, AI generation, elegant player UI
 */
(function () {
  'use strict';
  const VP = window.VillaPortal;

  const MOODS = ['calm', 'happy', 'energetic', 'melancholic', 'tense', 'focus', 'romance'];
  const SERVICE_COLORS = {
    spotify: '#1DB954',
    apple_music: '#FC3C44',
    amazon: '#00A8E1',
    suno: '#8B5CF6',
    udio: '#F97316',
  };
  const SERVICE_LABELS = {
    spotify: 'S',
    apple_music: 'A',
    amazon: 'Am',
    suno: 'Su',
    udio: 'Ud',
  };

  let musicState = null;
  let recommendations = [];
  let speakers = [];
  let nowPlaying = null;
  let searchResults = {};
  let services = [];
  let generatedTracks = [];
  let activeService = 'all';
  let selectedSpeaker = localStorage.getItem('villa_music_speaker') || '';
  let searchTimer = null;
  let els = {};

  // --- API calls ---

  async function fetchServices() {
    try {
      const data = await VP.apiFetch('/api/music/services');
      services = data.services || [];
    } catch {}
  }

  async function fetchSpeakers() {
    try {
      const data = await VP.apiFetch('/api/music/sonos/speakers');
      speakers = data.speakers || [];
      renderSpeakerSelect();
      // Auto-select first playing speaker or saved speaker
      if (!selectedSpeaker && speakers.length > 0) {
        const playing = speakers.find(s => s.state === 'playing');
        selectedSpeaker = playing ? playing.entityId : speakers[0].entityId;
        localStorage.setItem('villa_music_speaker', selectedSpeaker);
      }
    } catch {}
  }

  async function fetchNowPlaying() {
    if (!selectedSpeaker) return;
    try {
      const data = await VP.apiFetch(`/api/music/sonos/now-playing/${selectedSpeaker}`);
      nowPlaying = data;
      renderNowPlaying();
      
      // Trigger visual generation if auto-enabled
      if (window.VP?.modules?.visuals?.autoGenerateEnabled && data?.track) {
        window.VP.modules.visuals.generateForTrack(data.track);
      }
    } catch {}
  }

  async function fetchMusicState() {
    try {
      musicState = await VP.apiFetch('/api/music/state');
    } catch {}
  }

  async function fetchRecommendations() {
    try {
      const data = await VP.apiFetch('/api/music/recommendations?limit=10');
      recommendations = data.recommendations || [];
      renderRecommendations();
    } catch {}
  }

  async function doSearch(query) {
    if (!query || query.length < 2) {
      searchResults = {};
      renderSearchResults();
      return;
    }
    try {
      const svc = activeService === 'all' ? '' : `&service=${activeService}`;
      const data = await VP.apiFetch(`/api/music/search?q=${encodeURIComponent(query)}${svc}&limit=15`);
      searchResults = data.results || {};
      renderSearchResults();
    } catch {
      searchResults = {};
      renderSearchResults();
    }
  }

  async function playOnSonos(contentType, contentId) {
    if (!selectedSpeaker) return;
    try {
      await VP.apiFetch('/api/music/sonos/play', {
        method: 'POST',
        body: JSON.stringify({ entityId: selectedSpeaker, contentType, contentId }),
      });
      setTimeout(fetchNowPlaying, 1500);
    } catch (err) {
      console.error('Play failed:', err);
    }
  }

  async function playItem(item) {
    if (item.uri) {
      const contentType = item.uri.startsWith('FV:') ? 'favorite_item_id' : 'music';
      await playOnSonos(contentType, item.uri);
    }
  }

  async function transportCmd(cmd) {
    if (!selectedSpeaker) return;
    try {
      const service = cmd === 'play_pause' ? 'media_play_pause'
        : cmd === 'next' ? 'media_next_track'
        : cmd === 'prev' ? 'media_previous_track' : cmd;
      await VP.apiFetch('/api/music/sonos/play', {
        method: 'POST',
        body: JSON.stringify({
          entityId: selectedSpeaker,
          contentType: '_service_call',
          contentId: `media_player/${service}`,
        }),
      });
      setTimeout(fetchNowPlaying, 500);
    } catch {}
  }

  async function setVolume(level) {
    if (!selectedSpeaker) return;
    try {
      // Cap at 70%
      const capped = Math.min(level, 0.7);
      await VP.apiFetch('/api/music/sonos/play', {
        method: 'POST',
        body: JSON.stringify({
          entityId: selectedSpeaker,
          contentType: '_volume',
          contentId: String(capped),
        }),
      });
    } catch {}
  }

  async function setMood(mood) {
    try {
      await VP.apiFetch('/api/music/mood', {
        method: 'POST',
        body: JSON.stringify({ mood, duration_minutes: 15 }),
      });
      fetchRecommendations();
    } catch {}
  }

  async function fetchGenerated() {
    try {
      const data = await VP.apiFetch('/api/music/generated');
      generatedTracks = data.tracks || [];
      renderGenerated();
    } catch {}
  }

  async function startGeneration() {
    const prompt = els.genPrompt?.value?.trim();
    if (!prompt) return;
    const service = els.genService?.value || 'suno';
    const style = els.genStyle?.value?.trim() || undefined;
    const instrumental = els.genInstrumental?.checked || false;
    try {
      els.genBtn.disabled = true;
      els.genBtn.textContent = 'Generating...';
      await VP.apiFetch('/api/music/generate', {
        method: 'POST',
        body: JSON.stringify({ service, prompt, style, instrumental }),
      });
      els.genPrompt.value = '';
    } catch (err) {
      console.error('Generation failed:', err);
    } finally {
      els.genBtn.disabled = false;
      els.genBtn.textContent = 'Generate';
    }
  }

  async function playGenerated(filename) {
    if (!selectedSpeaker || !filename) return;
    try {
      await VP.apiFetch(`/api/music/generated/${encodeURIComponent(filename)}/play`, {
        method: 'POST',
        body: JSON.stringify({ entityId: selectedSpeaker }),
      });
      setTimeout(fetchNowPlaying, 1500);
    } catch (err) {
      console.error('Play generated failed:', err);
    }
  }

  // --- Rendering ---

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function formatDuration(secs) {
    if (!secs) return '';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  function serviceBadge(service) {
    const color = SERVICE_COLORS[service] || '#888';
    const label = SERVICE_LABELS[service] || service.charAt(0).toUpperCase();
    return `<span class="music-service-badge" style="background:${color}">${label}</span>`;
  }

  function renderNowPlaying() {
    if (!nowPlaying || !nowPlaying.title) {
      els.nowPlaying.innerHTML = `
        <div class="music-np-empty">
          <div class="music-np-placeholder">No music playing</div>
          <div class="music-np-sub">Search or pick a recommendation to start</div>
        </div>`;
      return;
    }

    const art = nowPlaying.albumArt
      ? `<img class="music-album-art" src="${esc(nowPlaying.albumArt)}" alt="">`
      : `<div class="music-album-art music-art-placeholder">&#9835;</div>`;

    const vol = nowPlaying.volume != null ? Math.round(nowPlaying.volume * 100) : 50;
    const isPlaying = nowPlaying.state === 'playing';

    els.nowPlaying.innerHTML = `
      <div class="music-np-row">
        ${art}
        <div class="music-np-info">
          <div class="music-np-title">${esc(nowPlaying.title)}</div>
          <div class="music-np-artist">${esc(nowPlaying.artist || '')}${nowPlaying.album ? ' &mdash; ' + esc(nowPlaying.album) : ''}</div>
        </div>
        <div class="music-transport">
          <button class="music-transport-btn" data-cmd="prev">&#9664;&#9664;</button>
          <button class="music-transport-btn music-play-btn" data-cmd="play_pause">${isPlaying ? '&#10074;&#10074;' : '&#9654;'}</button>
          <button class="music-transport-btn" data-cmd="next">&#9654;&#9654;</button>
        </div>
      </div>
      <div class="music-np-bottom">
        <div class="music-volume-row">
          <span class="music-vol-icon">&#128264;</span>
          <input type="range" class="music-volume-slider" min="0" max="70" value="${vol}" id="music-vol">
          <span class="music-vol-pct">${vol}%</span>
        </div>
        <select class="music-room-select" id="music-room-select">
          ${speakers.map(s => `<option value="${esc(s.entityId)}" ${s.entityId === selectedSpeaker ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}
        </select>
      </div>
    `;
  }

  function renderSpeakerSelect() {
    const sel = document.getElementById('music-room-select');
    if (!sel) return;
    sel.innerHTML = speakers.map(s =>
      `<option value="${esc(s.entityId)}" ${s.entityId === selectedSpeaker ? 'selected' : ''}>${esc(s.name)}</option>`
    ).join('');
  }

  function renderSearchResults() {
    const allResults = [];
    for (const [svc, items] of Object.entries(searchResults)) {
      for (const item of items) {
        allResults.push({ ...item, _svc: svc });
      }
    }

    if (allResults.length === 0) {
      if (els.searchInput?.value?.trim().length > 1) {
        els.results.innerHTML = '<div class="music-empty">No results found</div>';
      } else {
        els.results.innerHTML = '';
      }
      return;
    }

    els.results.innerHTML = allResults.map((item, i) => {
      const art = item.albumArt
        ? `<img class="music-result-art" src="${esc(item.albumArt)}" alt="" loading="lazy">`
        : `<div class="music-result-art music-art-placeholder">&#9835;</div>`;

      return `<div class="music-result-item" data-index="${i}">
        ${art}
        <div class="music-result-info">
          <div class="music-result-title">${esc(item.title)}</div>
          <div class="music-result-meta">${esc(item.artist)}${item.album ? ' &mdash; ' + esc(item.album) : ''} ${formatDuration(item.duration)}</div>
        </div>
        ${serviceBadge(item.service || item._svc)}
        <button class="music-result-play" data-index="${i}">&#9654;</button>
      </div>`;
    }).join('');

    // Store for click handler
    els.results._items = allResults;
  }

  function renderRecommendations() {
    if (recommendations.length === 0) {
      els.recScroll.innerHTML = '<div class="music-empty">No recommendations</div>';
      return;
    }

    els.recScroll.innerHTML = recommendations.map((r, i) => `
      <div class="music-rec-card" data-index="${i}">
        <div class="music-rec-name">${esc(r.name || r.source || 'Unknown')}</div>
        <div class="music-rec-meta">${esc(r.source_type || '')} &middot; ${(r.score || 0).toFixed(1)}</div>
      </div>
    `).join('');
  }

  function renderGenerated() {
    if (generatedTracks.length === 0) {
      els.genList.innerHTML = '<div class="music-empty">No generated tracks yet</div>';
      return;
    }
    els.genList.innerHTML = generatedTracks.map(t => `
      <div class="music-result-item music-gen-track" data-filename="${esc(t.filename)}">
        <div class="music-result-art music-art-placeholder" style="background:${SERVICE_COLORS[t.service] || '#8B5CF6'}44">&#9835;</div>
        <div class="music-result-info">
          <div class="music-result-title">${esc(t.title)}</div>
          <div class="music-result-meta">${esc(t.service)} &middot; ${esc(t.prompt?.substring(0, 60) || '')}</div>
        </div>
        <button class="music-result-play" data-filename="${esc(t.filename)}">&#9654;</button>
      </div>
    `).join('');
  }

  // --- Module lifecycle ---

  VP.modules.music = {
    init() {
      const panel = document.getElementById('panel-music');
      panel.innerHTML = `
        <div class="music-container">
          <!-- Now Playing Bar -->
          <div class="music-now-playing" id="music-now-playing">
            <div class="music-np-empty">
              <div class="music-np-placeholder">Loading...</div>
            </div>
          </div>

          <div class="music-scroll-area">
            <!-- Search -->
            <div class="music-search-section">
              <div class="music-search-bar">
                <span class="music-search-icon">&#128269;</span>
                <input type="text" class="music-search-input" id="music-search" placeholder="Search across all services..." autocomplete="off">
              </div>
              <div class="music-service-pills" id="music-pills">
                <button class="music-service-pill active" data-service="all">All</button>
              </div>
            </div>

            <!-- Search Results -->
            <div class="music-results" id="music-results"></div>

            <!-- Mood Override -->
            <div class="music-section">
              <h3 class="music-section-title">Mood</h3>
              <div class="music-mood-pills" id="music-moods">
                ${MOODS.map(m => `<button class="music-mood-pill" data-mood="${m}">${m}</button>`).join('')}
                <button class="music-mood-pill music-mood-clear" data-mood="clear">Clear</button>
              </div>
            </div>

            <!-- Recommendations -->
            <div class="music-section">
              <h3 class="music-section-title">Recommendations</h3>
              <div class="music-rec-scroll" id="music-recs"></div>
            </div>

            <!-- AI Generation -->
            <div class="music-section">
              <h3 class="music-section-title">AI Generate</h3>
              <div class="music-gen-form">
                <select class="music-gen-select" id="music-gen-service">
                  <option value="suno">Suno v5</option>
                  <option value="udio">Udio v1.5</option>
                </select>
                <textarea class="music-gen-prompt" id="music-gen-prompt" placeholder="Describe the music you want..." rows="2"></textarea>
                <div class="music-gen-options">
                  <input type="text" class="music-gen-style" id="music-gen-style" placeholder="Style (optional)">
                  <label class="music-gen-check"><input type="checkbox" id="music-gen-instrumental"> Instrumental</label>
                  <button class="music-gen-btn" id="music-gen-btn">Generate</button>
                </div>
              </div>
              <div class="music-gen-list" id="music-gen-list"></div>
            </div>
          </div>
        </div>
      `;

      // Cache elements
      els.nowPlaying = document.getElementById('music-now-playing');
      els.searchInput = document.getElementById('music-search');
      els.pills = document.getElementById('music-pills');
      els.results = document.getElementById('music-results');
      els.recScroll = document.getElementById('music-recs');
      els.genService = document.getElementById('music-gen-service');
      els.genPrompt = document.getElementById('music-gen-prompt');
      els.genStyle = document.getElementById('music-gen-style');
      els.genInstrumental = document.getElementById('music-gen-instrumental');
      els.genBtn = document.getElementById('music-gen-btn');
      els.genList = document.getElementById('music-gen-list');

      // --- Event listeners ---

      // Search with debounce
      els.searchInput.addEventListener('input', () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => doSearch(els.searchInput.value.trim()), 300);
      });

      // Service filter pills
      els.pills.addEventListener('click', (e) => {
        const pill = e.target.closest('.music-service-pill');
        if (!pill) return;
        activeService = pill.dataset.service;
        els.pills.querySelectorAll('.music-service-pill').forEach(p => p.classList.toggle('active', p.dataset.service === activeService));
        if (els.searchInput.value.trim()) doSearch(els.searchInput.value.trim());
      });

      // Search result play
      els.results.addEventListener('click', (e) => {
        const btn = e.target.closest('.music-result-play');
        const row = e.target.closest('.music-result-item');
        if (!btn && !row) return;
        const idx = parseInt((btn || row).dataset.index);
        const items = els.results._items;
        if (items && items[idx]) playItem(items[idx]);
      });

      // Transport controls
      els.nowPlaying.addEventListener('click', (e) => {
        const btn = e.target.closest('.music-transport-btn');
        if (btn) transportCmd(btn.dataset.cmd);
      });

      // Volume slider
      els.nowPlaying.addEventListener('input', (e) => {
        if (e.target.classList.contains('music-volume-slider')) {
          const val = parseInt(e.target.value) / 100;
          setVolume(val);
          const pct = e.target.parentElement.querySelector('.music-vol-pct');
          if (pct) pct.textContent = e.target.value + '%';
        }
      });

      // Room select
      els.nowPlaying.addEventListener('change', (e) => {
        if (e.target.id === 'music-room-select') {
          selectedSpeaker = e.target.value;
          localStorage.setItem('villa_music_speaker', selectedSpeaker);
          fetchNowPlaying();
        }
      });

      // Mood pills
      document.getElementById('music-moods').addEventListener('click', (e) => {
        const pill = e.target.closest('.music-mood-pill');
        if (!pill) return;
        const mood = pill.dataset.mood;
        if (mood === 'clear') {
          VP.apiFetch('/api/music/mood', {
            method: 'POST',
            body: JSON.stringify({ mood: 'calm', duration_minutes: 0 }),
          }).then(() => fetchRecommendations());
        } else {
          setMood(mood);
        }
      });

      // Recommendation click
      els.recScroll.addEventListener('click', (e) => {
        const card = e.target.closest('.music-rec-card');
        if (!card) return;
        const idx = parseInt(card.dataset.index);
        if (recommendations[idx]) {
          VP.apiFetch('/api/music/play', {
            method: 'POST',
            body: JSON.stringify({ player: selectedSpeaker?.replace('media_player.', '') || 'bar', recommendation_index: idx }),
          }).then(() => setTimeout(fetchNowPlaying, 1500));
        }
      });

      // AI Generation
      els.genBtn.addEventListener('click', startGeneration);
      els.genPrompt.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); startGeneration(); }
      });

      // Generated track play
      els.genList.addEventListener('click', (e) => {
        const btn = e.target.closest('.music-result-play');
        const row = e.target.closest('.music-gen-track');
        const filename = (btn || row)?.dataset?.filename;
        if (filename) playGenerated(filename);
      });
    },

    onActivate() {
      fetchServices().then(() => {
        // Build service pills
        const streamingServices = services.filter(s => s.type === 'streaming' && s.available);
        const pillsHtml = '<button class="music-service-pill active" data-service="all">All</button>' +
          streamingServices.map(s =>
            `<button class="music-service-pill" data-service="${esc(s.name)}" style="--pill-color:${SERVICE_COLORS[s.name] || '#888'}">${esc(s.displayName)}</button>`
          ).join('');
        els.pills.innerHTML = pillsHtml;
      });
      fetchSpeakers();
      fetchNowPlaying();
      fetchMusicState();
      fetchRecommendations();
      fetchGenerated();
    },

    onWSMessage(msg) {
      if (msg.type === 'now_playing') {
        nowPlaying = msg;
        renderNowPlaying();
      } else if (msg.type === 'generation_complete') {
        fetchGenerated();
      }
    },
  };
})();
