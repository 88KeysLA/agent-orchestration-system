/**
 * Villa Portal — Music Service Audition Module
 * Test and compare Mantis, Amazon Music, and other streaming services
 */
(function () {
  'use strict';
  const VP = window.VillaPortal;

  let activeService = 'mantis';
  let availableServices = [];
  let els = {};
  let presets = [];
  let playlist = [];
  let currentTrackIndex = -1;
  let playbackState = { playing: false, track: null, position: 0 };

  // Playlist management
  function addToPlaylist(url) {
    playlist.push({ url, codec: detectCodec(url) });
    renderPlaylist();
    showStatus(`Added to playlist (${playlist.length} tracks)`, false);
  }

  function removeFromPlaylist(idx) {
    playlist.splice(idx, 1);
    if (currentTrackIndex >= idx && currentTrackIndex > 0) {
      currentTrackIndex--;
    }
    renderPlaylist();
  }

  function clearPlaylist() {
    playlist = [];
    currentTrackIndex = -1;
    renderPlaylist();
    showStatus('Playlist cleared', false);
  }

  function playPlaylist(startIdx = 0) {
    if (playlist.length === 0) {
      showStatus('Playlist is empty', true);
      return;
    }
    currentTrackIndex = startIdx;
    const track = playlist[currentTrackIndex];
    const volume = parseInt(els.volumeSlider.value) / 100;
    playURL(track.url, volume);
    renderPlaylist();
  }

  function playNext() {
    if (currentTrackIndex < playlist.length - 1) {
      playPlaylist(currentTrackIndex + 1);
    } else {
      showStatus('End of playlist', false);
    }
  }

  function playPrevious() {
    if (currentTrackIndex > 0) {
      playPlaylist(currentTrackIndex - 1);
    }
  }

  function renderPlaylist() {
    if (!els.playlistContainer) return;
    
    if (playlist.length === 0) {
      els.playlistContainer.innerHTML = '<em>No tracks in playlist</em>';
      return;
    }

    els.playlistContainer.innerHTML = playlist.map((track, idx) => {
      const isCurrent = idx === currentTrackIndex;
      return `
        <div class="playlist-item ${isCurrent ? 'current' : ''}">
          <span class="track-number">${idx + 1}.</span>
          <span class="track-url">${track.url.split('/').pop()}</span>
          <span class="track-codec">${track.codec.toUpperCase()}</span>
          <button class="playlist-remove" data-idx="${idx}">✕</button>
        </div>
      `;
    }).join('');

    // Add remove listeners
    els.playlistContainer.querySelectorAll('.playlist-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        removeFromPlaylist(parseInt(btn.dataset.idx));
      });
    });
  }

  // Now playing
  function updateNowPlaying(track, device) {
    if (!els.nowPlaying) return;
    
    playbackState = {
      playing: true,
      track: track,
      device: device,
      startTime: Date.now()
    };

    const codec = detectCodec(track);
    const deviceName = els.deviceSelect.options[els.deviceSelect.selectedIndex].text;
    
    els.nowPlaying.innerHTML = `
      <div class="now-playing-info">
        <div class="now-playing-title">🎵 ${track.split('/').pop()}</div>
        <div class="now-playing-meta">
          <span>Codec: ${codec.toUpperCase()}</span> • 
          <span>Device: ${deviceName}</span>
        </div>
      </div>
    `;
  }

  function clearNowPlaying() {
    if (!els.nowPlaying) return;
    playbackState.playing = false;
    els.nowPlaying.innerHTML = '<em>Nothing playing</em>';
  }

  // Preset management
  function loadPresets() {
    const stored = localStorage.getItem('villa_audio_presets');
    presets = stored ? JSON.parse(stored) : [];
    renderPresets();
  }

  function savePresets() {
    localStorage.setItem('villa_audio_presets', JSON.stringify(presets));
  }

  function renderPresets() {
    if (!els.presetSelect) return;
    
    els.presetSelect.innerHTML = '<option value="">-- Select Preset --</option>';
    presets.forEach((preset, idx) => {
      const opt = document.createElement('option');
      opt.value = idx;
      opt.textContent = preset.name;
      els.presetSelect.appendChild(opt);
    });
  }

  function savePreset() {
    const name = els.presetName.value.trim();
    if (!name) {
      showStatus('Enter preset name', true);
      return;
    }

    const preset = {
      name,
      device: els.deviceSelect.value,
      volume: parseInt(els.volumeSlider.value),
      service: activeService
    };

    // Check if preset exists
    const existingIdx = presets.findIndex(p => p.name === name);
    if (existingIdx >= 0) {
      presets[existingIdx] = preset;
      showStatus(`Updated preset: ${name}`, false);
    } else {
      presets.push(preset);
      showStatus(`Saved preset: ${name}`, false);
    }

    savePresets();
    renderPresets();
    els.presetName.value = '';
  }

  function loadPreset() {
    const idx = els.presetSelect.value;
    if (idx === '') {
      showStatus('Select a preset', true);
      return;
    }

    const preset = presets[idx];
    if (!preset) return;

    els.deviceSelect.value = preset.device;
    els.volumeSlider.value = preset.volume;
    els.volumeLabel.textContent = preset.volume + '%';
    
    if (preset.service !== activeService) {
      switchService(preset.service);
    }

    showStatus(`Loaded: ${preset.name}`, false);
  }

  function deletePreset() {
    const idx = els.presetSelect.value;
    if (idx === '') {
      showStatus('Select a preset', true);
      return;
    }

    const preset = presets[idx];
    presets.splice(idx, 1);
    savePresets();
    renderPresets();
    showStatus(`Deleted: ${preset.name}`, false);
  }

  async function fetchServices() {
    try {
      const data = await VP.apiFetch('/api/music/services');
      activeService = data.active;
      availableServices = data.available || [];
      renderServices();
    } catch (err) {
      console.error('Fetch services failed:', err);
    }
  }

  async function switchService(service) {
    try {
      await VP.apiFetch('/api/music/services/switch', {
        method: 'POST',
        body: JSON.stringify({ service })
      });
      activeService = service;
      renderServices();
    } catch (err) {
      console.error('Switch service failed:', err);
    }
  }

  async function playURL(url, volume = 0.8) {
    try {
      const codec = detectCodec(url);
      const spatialAudio = codec === 'atmos' || url.includes('atmos');
      const device = els.deviceSelect ? els.deviceSelect.value : 'media_player.anthem_740';
      
      // Update now playing
      updateNowPlaying(url, device);
      
      // Check if streaming to all Sonos
      if (device === 'sonos_all') {
        const result = await VP.apiFetch('/api/audio/sonos/stream-all', {
          method: 'POST',
          body: JSON.stringify({ url, volume })
        });
        
        if (result.success) {
          showStatus(`🏠 Streaming to ${result.stream.deviceCount} Sonos devices`, false);
        } else {
          showStatus(result.message || 'Sonos streaming failed', true);
        }
        return;
      }
      
      const result = await VP.apiFetch('/api/music/play', {
        method: 'POST',
        body: JSON.stringify({ 
          contentId: url,
          options: { 
            volume,
            codec,
            spatialAudio,
            device
          }
        })
      });
      
      const quality = spatialAudio ? 'Atmos' : codec.toUpperCase();
      const deviceName = device.split('.')[1].replace('_', ' ');
      showStatus(`Playing ${quality} on ${deviceName}: ${url.substring(0, 30)}...`);
      return result;
    } catch (err) {
      showStatus(`Error: ${err.message}`, true);
      console.error('Play failed:', err);
    }
  }

  function detectCodec(url) {
    const ext = url.split('.').pop().toLowerCase().split('?')[0];
    const codecMap = {
      'mp3': 'mp3',
      'aac': 'aac',
      'm4a': 'aac',
      'flac': 'flac',
      'alac': 'alac',
      'wav': 'wav',
      'ec3': 'atmos',
      'eac3': 'atmos'
    };
    return codecMap[ext] || 'mp3';
  }

  function renderServices() {
    if (!els.serviceGrid) return;
    
    els.serviceGrid.innerHTML = availableServices.map(s => {
      const serviceName = s.name.toLowerCase().replace(' ', '_');
      const isActive = serviceName === activeService;
      return `
        <button class="service-btn ${isActive ? 'active' : ''}" 
                data-service="${serviceName}">
          <div class="service-name">${s.name}</div>
          <div class="service-priority">Priority ${s.priority}</div>
          ${isActive ? '<div class="service-badge">ACTIVE</div>' : ''}
        </button>
      `;
    }).join('');
  }

  function showStatus(message, isError = false) {
    if (!els.status) return;
    els.status.textContent = message;
    els.status.className = `status-message ${isError ? 'error' : 'success'}`;
    setTimeout(() => {
      els.status.className = 'status-message';
    }, 3000);
  }

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  VP.modules.audition = {
    init() {
      const panel = document.getElementById('panel-audition');
      panel.innerHTML = `
        <div class="dashboard">
          <div class="dash-section">
            <h2>Music Service</h2>
            <div class="service-grid" id="audition-services"></div>
          </div>
          
          <div class="dash-section">
            <h2>Output Device</h2>
            <select id="audition-device" class="audition-input">
              <option value="media_player.anthem_740">Anthem 740 (Theatre)</option>
              <option value="media_player.anthem_540">Anthem 540 (Master)</option>
              <option value="media_player.anthem_mrx_slm">MRX SLM (Sunroom)</option>
              <option value="sonos_all">🏠 All Sonos Amps (Whole House)</option>
            </select>
          </div>

          <div class="dash-section">
            <h2>Audition URL</h2>
            <input type="text" 
                   id="audition-url" 
                   placeholder="http://example.com/song.mp3 or file path"
                   class="audition-input">
            <div class="audition-controls">
              <input type="range" 
                     id="audition-volume" 
                     min="0" 
                     max="100" 
                     value="80"
                     class="volume-slider">
              <span id="audition-volume-label">80%</span>
              <button id="audition-play" class="play-btn">▶ Play</button>
            </div>
            <div id="audition-status" class="status-message"></div>
          </div>

          <div class="dash-section">
            <h2>Now Playing</h2>
            <div id="now-playing" class="now-playing">
              <em>Nothing playing</em>
            </div>
          </div>

          <div class="dash-section">
            <h2>Playlist</h2>
            <div class="playlist-controls">
              <button id="playlist-add" class="control-btn">➕ Add Current URL</button>
              <button id="playlist-play" class="control-btn">▶ Play Playlist</button>
              <button id="playlist-next" class="control-btn">⏭️ Next</button>
              <button id="playlist-prev" class="control-btn">⏮️ Previous</button>
              <button id="playlist-clear" class="control-btn">🗑️ Clear</button>
            </div>
            <div id="playlist-container" class="playlist-container">
              <em>No tracks in playlist</em>
            </div>
          </div>

          <div class="dash-section">
            <h2>Preset Zones</h2>
            <div class="preset-controls">
              <select id="preset-select" class="audition-input">
                <option value="">-- Select Preset --</option>
              </select>
              <div class="preset-buttons">
                <button id="preset-load" class="control-btn">📥 Load</button>
                <button id="preset-save" class="control-btn">💾 Save</button>
                <button id="preset-delete" class="control-btn">🗑️ Delete</button>
              </div>
              <input type="text" 
                     id="preset-name" 
                     placeholder="Preset name (e.g., Theatre Night)"
                     class="audition-input"
                     style="margin-top: 10px;">
            </div>
          </div>

          <div class="dash-section">
            <h2>Sonos Control</h2>
            <div class="sonos-controls">
              <button id="sonos-status-btn" class="control-btn">📊 Sonos Status</button>
              <div id="sonos-info" class="sonos-info"></div>
            </div>
          </div>

          <div class="dash-section">
            <h2>Quick Tests</h2>
            <div class="quick-tests">
              <button class="test-btn" data-url="http://commondatastorage.googleapis.com/codeskulptor-demos/DDR_assets/Kangaroo_MusiQue_-_The_Neverwritten_Role_Playing_Game.mp3">
                Test MP3
              </button>
              <button class="test-btn" data-url="http://commondatastorage.googleapis.com/codeskulptor-assets/week7-brrring.m4a">
                Test M4A
              </button>
            </div>
          </div>

          <div class="dash-section">
            <h2>Service Info</h2>
            <div id="audition-info" class="service-info"></div>
          </div>
        </div>

        <style>
          .service-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
            gap: 10px;
          }
          .service-btn {
            background: #1a1a1a;
            border: 2px solid #333;
            padding: 15px;
            border-radius: 8px;
            cursor: pointer;
            transition: all 0.2s;
            position: relative;
          }
          .service-btn:hover {
            border-color: #666;
          }
          .service-btn.active {
            border-color: #4CAF50;
            background: #1a2a1a;
          }
          .service-name {
            font-size: 16px;
            font-weight: bold;
            margin-bottom: 5px;
          }
          .service-priority {
            font-size: 12px;
            color: #888;
          }
          .service-badge {
            position: absolute;
            top: 5px;
            right: 5px;
            background: #4CAF50;
            color: white;
            padding: 2px 6px;
            border-radius: 3px;
            font-size: 10px;
          }
          .audition-input {
            width: 100%;
            padding: 12px;
            background: #1a1a1a;
            border: 1px solid #333;
            color: #fff;
            border-radius: 4px;
            margin-bottom: 10px;
            font-size: 14px;
          }
          .audition-controls {
            display: flex;
            align-items: center;
            gap: 10px;
          }
          .volume-slider {
            flex: 1;
          }
          #audition-volume-label {
            min-width: 40px;
            text-align: right;
          }
          .play-btn {
            background: #4CAF50;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 16px;
          }
          .play-btn:hover {
            background: #45a049;
          }
          .status-message {
            margin-top: 10px;
            padding: 10px;
            border-radius: 4px;
            font-size: 14px;
            opacity: 0;
            transition: opacity 0.3s;
          }
          .status-message.success {
            background: #1a2a1a;
            color: #4CAF50;
            opacity: 1;
          }
          .status-message.error {
            background: #2a1a1a;
            color: #f44336;
            opacity: 1;
          }
          .quick-tests {
            display: flex;
            gap: 10px;
          }
          .test-btn {
            flex: 1;
            padding: 10px;
            background: #1a1a1a;
            border: 1px solid #333;
            color: #fff;
            border-radius: 4px;
            cursor: pointer;
          }
          .test-btn:hover {
            border-color: #666;
          }
          .service-info {
            background: #1a1a1a;
            padding: 15px;
            border-radius: 4px;
            font-size: 14px;
            line-height: 1.6;
          }
          .now-playing {
            background: #1a1a1a;
            padding: 15px;
            border-radius: 4px;
            font-size: 14px;
            min-height: 60px;
          }
          .now-playing-title {
            font-size: 16px;
            font-weight: bold;
            margin-bottom: 8px;
          }
          .now-playing-meta {
            font-size: 12px;
            color: #888;
          }
          .playlist-controls {
            display: grid;
            grid-template-columns: repeat(5, 1fr);
            gap: 10px;
            margin-bottom: 10px;
          }
          .playlist-container {
            background: #1a1a1a;
            padding: 10px;
            border-radius: 4px;
            max-height: 300px;
            overflow-y: auto;
          }
          .playlist-item {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 8px;
            margin: 5px 0;
            background: #0a0a0a;
            border-radius: 4px;
            border-left: 3px solid #333;
          }
          .playlist-item.current {
            border-left-color: #4CAF50;
            background: #1a2a1a;
          }
          .track-number {
            min-width: 30px;
            color: #888;
          }
          .track-url {
            flex: 1;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }
          .track-codec {
            font-size: 11px;
            color: #888;
            min-width: 50px;
          }
          .playlist-remove {
            background: none;
            border: none;
            color: #f44336;
            cursor: pointer;
            font-size: 16px;
            padding: 0 5px;
          }
          .playlist-remove:hover {
            color: #ff5555;
          }
          .service-info {
            background: #1a1a1a;
            padding: 15px;
            border-radius: 4px;
            font-size: 14px;
            line-height: 1.6;
          }
          .sonos-controls {
            display: flex;
            flex-direction: column;
            gap: 10px;
          }
          .preset-controls {
            display: flex;
            flex-direction: column;
            gap: 10px;
          }
          .preset-buttons {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 10px;
          }
          .control-btn {
            padding: 10px 20px;
            background: #1a1a1a;
            border: 1px solid #333;
            color: #fff;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
          }
          .control-btn:hover {
            border-color: #666;
          }
          .sonos-info {
            background: #1a1a1a;
            padding: 15px;
            border-radius: 4px;
            font-size: 13px;
            line-height: 1.6;
            max-height: 300px;
            overflow-y: auto;
          }
          .sonos-device {
            padding: 8px;
            margin: 5px 0;
            background: #0a0a0a;
            border-radius: 4px;
            border-left: 3px solid #4CAF50;
          }
        </style>
      `;

      els.serviceGrid = document.getElementById('audition-services');
      els.deviceSelect = document.getElementById('audition-device');
      els.urlInput = document.getElementById('audition-url');
      els.volumeSlider = document.getElementById('audition-volume');
      els.volumeLabel = document.getElementById('audition-volume-label');
      els.presetSelect = document.getElementById('preset-select');
      els.presetName = document.getElementById('preset-name');
      els.presetLoad = document.getElementById('preset-load');
      els.presetSave = document.getElementById('preset-save');
      els.presetDelete = document.getElementById('preset-delete');
      els.nowPlaying = document.getElementById('now-playing');
      els.playlistContainer = document.getElementById('playlist-container');
      els.playlistAdd = document.getElementById('playlist-add');
      els.playlistPlay = document.getElementById('playlist-play');
      els.playlistNext = document.getElementById('playlist-next');
      els.playlistPrev = document.getElementById('playlist-prev');
      els.playlistClear = document.getElementById('playlist-clear');
      els.sonosStatusBtn = document.getElementById('sonos-status-btn');
      els.sonosInfo = document.getElementById('sonos-info');
      els.playBtn = document.getElementById('audition-play');
      els.status = document.getElementById('audition-status');
      els.info = document.getElementById('audition-info');

      // Load presets
      loadPresets();
      renderPlaylist();

      // Service switcher
      els.serviceGrid.addEventListener('click', (e) => {
        const btn = e.target.closest('.service-btn');
        if (!btn) return;
        switchService(btn.dataset.service);
      });

      // Volume slider
      els.volumeSlider.addEventListener('input', (e) => {
        els.volumeLabel.textContent = e.target.value + '%';
      });

      // Play button
      els.playBtn.addEventListener('click', () => {
        const url = els.urlInput.value.trim();
        if (!url) {
          showStatus('Please enter a URL', true);
          return;
        }
        const volume = parseInt(els.volumeSlider.value) / 100;
        playURL(url, volume);
      });

      // Enter key
      els.urlInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          els.playBtn.click();
        }
      });

      // Quick test buttons
      document.querySelectorAll('.test-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const url = btn.dataset.url;
          els.urlInput.value = url;
          const volume = parseInt(els.volumeSlider.value) / 100;
          playURL(url, volume);
        });
      });

      // Preset buttons
      els.presetLoad.addEventListener('click', loadPreset);
      els.presetSave.addEventListener('click', savePreset);
      els.presetDelete.addEventListener('click', deletePreset);

      // Playlist buttons
      els.playlistAdd.addEventListener('click', () => {
        const url = els.urlInput.value.trim();
        if (!url) {
          showStatus('Enter a URL first', true);
          return;
        }
        addToPlaylist(url);
      });
      els.playlistPlay.addEventListener('click', () => playPlaylist(0));
      els.playlistNext.addEventListener('click', playNext);
      els.playlistPrev.addEventListener('click', playPrevious);
      els.playlistClear.addEventListener('click', clearPlaylist);

      // Sonos status button
      els.sonosStatusBtn.addEventListener('click', async () => {
        try {
          const result = await VP.apiFetch('/api/audio/sonos-status');
          if (result.available) {
            let html = `<strong>Sonos System (${result.count} devices)</strong><br><br>`;
            result.devices.forEach(d => {
              html += `<div class="sonos-device">
                <strong>${d.name}</strong><br>
                State: ${d.state}<br>
                Volume: ${Math.round(d.volume * 100)}%<br>
                ${d.group_members.length > 1 ? `Group: ${d.group_members.length} members` : 'Solo'}
              </div>`;
            });
            els.sonosInfo.innerHTML = html;
          } else {
            els.sonosInfo.innerHTML = '<em>HA integration pending</em>';
          }
        } catch (err) {
          els.sonosInfo.innerHTML = `<em>Error: ${err.message}</em>`;
        }
      });
    },

    onActivate() {
      fetchServices();
      
      // Update service info
      if (els.info) {
        els.info.innerHTML = `
          <div><strong>Active:</strong> ${activeService}</div>
          <div><strong>Available:</strong> ${availableServices.map(s => s.name).join(', ')}</div>
          <div style="margin-top: 10px; color: #888;">
            Switch services to compare audio quality and latency.
            Mantis routes through Villa server.
          </div>
        `;
      }
    }
  };
})();
