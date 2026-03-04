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
      // Detect codec from URL
      const codec = detectCodec(url);
      const spatialAudio = codec === 'atmos' || url.includes('atmos');
      const device = els.deviceSelect ? els.deviceSelect.value : 'media_player.anthem_740';
      
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
              <option value="media_player.anthem_mrx_slm">MRX SLM (Whole House via Sonos)</option>
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
        </style>
      `;

      els.serviceGrid = document.getElementById('audition-services');
      els.deviceSelect = document.getElementById('audition-device');
      els.urlInput = document.getElementById('audition-url');
      els.volumeSlider = document.getElementById('audition-volume');
      els.volumeLabel = document.getElementById('audition-volume-label');
      els.playBtn = document.getElementById('audition-play');
      els.status = document.getElementById('audition-status');
      els.info = document.getElementById('audition-info');

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
