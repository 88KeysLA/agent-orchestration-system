/**
 * Villa Portal — Visual Jukebox Module
 * Browser-based audiovisual experience with Web Audio API playback,
 * synthesized transition beds, Imagen art, and Edward TTS narration.
 */
(function () {
  'use strict';
  const VP = window.VillaPortal;

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------
  let state = {
    running: false,
    generating: false,
    sessionId: null,
    tracks: [],
    trackIndex: -1,
    paused: false,
    fullscreen: false,
  };

  let els = {};
  let audioCtx = null;
  let currentSource = null;
  let currentBuffer = null;
  let nextBuffer = null;
  let masterGain = null;
  let previewGain = null;
  let nextPreviewGain = null;
  let bedGain = null;
  let bedOscillators = [];
  let trackStartTime = 0;
  let crossfadeTimer = null;
  let nextTrackTimer = null;
  let progressTimer = null;
  let ttsQueue = Promise.resolve();
  let overlayHideTimer = null;

  const PREVIEW_DURATION = 30; // seconds
  const CROSSFADE_START = 24;  // start crossfade at 24s
  const BED_DURATION = 5;      // transition bed duration
  const BED_START = 24;        // transition bed starts at 24s

  const PRESET_MOODS = ['Chill Lounge', 'Berlin Night', 'Jazz Cafe', 'Deep Focus', 'Sunset Vibes'];

  // Note names for display
  const KEY_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

  // ---------------------------------------------------------------------------
  // Audio Context
  // ---------------------------------------------------------------------------

  function ensureAudioContext() {
    if (audioCtx) return audioCtx;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = 0.8;
    masterGain.connect(audioCtx.destination);

    previewGain = audioCtx.createGain();
    previewGain.gain.value = 1.0;
    previewGain.connect(masterGain);

    nextPreviewGain = audioCtx.createGain();
    nextPreviewGain.gain.value = 0.0;
    nextPreviewGain.connect(masterGain);

    bedGain = audioCtx.createGain();
    bedGain.gain.value = 0.0;
    bedGain.connect(masterGain);

    return audioCtx;
  }

  // ---------------------------------------------------------------------------
  // Track Loading & Playback
  // ---------------------------------------------------------------------------

  async function loadPreview(trackId) {
    const ctx = ensureAudioContext();
    const res = await fetch(`/api/jukebox/preview/${trackId}`, {
      headers: VP.headers(),
    });
    if (!res.ok) throw new Error(`Preview fetch failed: ${res.status}`);
    const arrayBuffer = await res.arrayBuffer();
    return ctx.decodeAudioData(arrayBuffer);
  }

  function playBuffer(buffer, gainNode, startOffset = 0) {
    const ctx = ensureAudioContext();
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(gainNode);
    source.start(0, startOffset);
    return source;
  }

  function stopCurrentPlayback() {
    clearTimeout(crossfadeTimer);
    clearTimeout(nextTrackTimer);
    clearInterval(progressTimer);
    stopTransitionBed();
    if (currentSource) {
      try { currentSource.stop(); } catch {}
      currentSource = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Transition Bed Synthesis
  // ---------------------------------------------------------------------------

  function midiToFreq(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  function startTransitionBed(outTrack, inTrack, duration) {
    const ctx = ensureAudioContext();
    stopTransitionBed();

    const outChord = outTrack?.chordTones;
    const inChord = inTrack?.chordTones;
    if (!outChord && !inChord) return;

    const energy = outTrack?.features?.energy || 0.5;
    const peakGain = 0.04 + energy * 0.06; // 0.04 - 0.10
    const filterCutoff = 400 + energy * 2500; // 400 - 2900 Hz

    const now = ctx.currentTime;
    const attackEnd = now + duration * 0.15;
    const sustainEnd = now + duration * 0.70;
    const releaseEnd = now + duration;
    const glideEnd = now + duration * 0.65;

    // Low-pass filter
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterCutoff;
    filter.Q.value = 1.0;
    filter.connect(bedGain);

    const chord = outChord || inChord;
    const tones = [chord.root, chord.third, chord.fifth];

    // Create oscillators: 3 chord tones × 2 detuned + 1 sub-bass
    for (const midi of tones) {
      const freq = midiToFreq(midi);

      // Sine oscillator
      const osc1 = ctx.createOscillator();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(freq, now);
      if (inChord && outChord) {
        const targetMidi = tones.indexOf(midi) === 0 ? inChord.root
          : tones.indexOf(midi) === 1 ? inChord.third : inChord.fifth;
        osc1.frequency.linearRampToValueAtTime(midiToFreq(targetMidi), glideEnd);
      }

      const gain1 = ctx.createGain();
      gain1.gain.value = 0.5;
      osc1.connect(gain1);
      gain1.connect(filter);
      osc1.start(now);
      osc1.stop(releaseEnd);
      bedOscillators.push(osc1);

      // Triangle oscillator (slight detune for warmth)
      const osc2 = ctx.createOscillator();
      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(freq * 1.002, now);
      if (inChord && outChord) {
        const targetMidi = tones.indexOf(midi) === 0 ? inChord.root
          : tones.indexOf(midi) === 1 ? inChord.third : inChord.fifth;
        osc2.frequency.linearRampToValueAtTime(midiToFreq(targetMidi) * 1.002, glideEnd);
      }

      const gain2 = ctx.createGain();
      gain2.gain.value = 0.3;
      osc2.connect(gain2);
      gain2.connect(filter);
      osc2.start(now);
      osc2.stop(releaseEnd);
      bedOscillators.push(osc2);
    }

    // Sub-bass (root -1 octave)
    const subOsc = ctx.createOscillator();
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(midiToFreq(chord.root - 12), now);
    if (inChord) {
      subOsc.frequency.linearRampToValueAtTime(midiToFreq(inChord.root - 12), glideEnd);
    }
    const subGain = ctx.createGain();
    subGain.gain.value = 0.4;
    subOsc.connect(subGain);
    subGain.connect(filter);
    subOsc.start(now);
    subOsc.stop(releaseEnd);
    bedOscillators.push(subOsc);

    // Bed volume envelope
    bedGain.gain.setValueAtTime(0, now);
    bedGain.gain.linearRampToValueAtTime(peakGain, attackEnd);
    bedGain.gain.setValueAtTime(peakGain, sustainEnd);
    bedGain.gain.linearRampToValueAtTime(0, releaseEnd);
  }

  function stopTransitionBed() {
    for (const osc of bedOscillators) {
      try { osc.stop(); } catch {}
    }
    bedOscillators = [];
    if (bedGain) bedGain.gain.cancelScheduledValues(0);
  }

  // ---------------------------------------------------------------------------
  // Crossfade Logic
  // ---------------------------------------------------------------------------

  function scheduleCrossfade(currentTrack, nextTrackData) {
    if (!nextTrackData) return;

    const ctx = ensureAudioContext();

    crossfadeTimer = setTimeout(async () => {
      if (!state.running || state.paused) return;

      // Start transition bed
      startTransitionBed(currentTrack, nextTrackData, BED_DURATION);

      // Fade out current track
      const now = ctx.currentTime;
      previewGain.gain.setValueAtTime(1.0, now);
      previewGain.gain.linearRampToValueAtTime(0, now + 3);

      // Pre-load and start next track
      try {
        if (!nextBuffer) {
          nextBuffer = await loadPreview(nextTrackData.id);
        }
        // Start next track faded in at 27s mark
        setTimeout(() => {
          if (!state.running) return;
          nextPreviewGain.gain.setValueAtTime(0, ctx.currentTime);
          nextPreviewGain.gain.linearRampToValueAtTime(1.0, ctx.currentTime + 2);
          const nextSource = playBuffer(nextBuffer, nextPreviewGain);
          // This will be replaced when the track officially starts
          nextSource.onended = () => {};
        }, 3000);
      } catch (err) {
        console.log('[Jukebox] Next preview pre-load failed:', err.message);
      }
    }, CROSSFADE_START * 1000);
  }

  // ---------------------------------------------------------------------------
  // Track Playback Controller
  // ---------------------------------------------------------------------------

  async function playTrack(track, nextTrack) {
    stopCurrentPlayback();

    const ctx = ensureAudioContext();
    if (ctx.state === 'suspended') await ctx.resume();

    // Reset gains
    previewGain.gain.cancelScheduledValues(0);
    previewGain.gain.value = 1.0;
    nextPreviewGain.gain.cancelScheduledValues(0);
    nextPreviewGain.gain.value = 0.0;
    bedGain.gain.cancelScheduledValues(0);
    bedGain.gain.value = 0.0;

    // Load and play
    try {
      if (currentBuffer && currentBuffer._trackId === track.id) {
        // Reuse buffer
      } else if (nextBuffer && nextBuffer._trackId === track.id) {
        currentBuffer = nextBuffer;
        nextBuffer = null;
      } else {
        currentBuffer = await loadPreview(track.id);
        currentBuffer._trackId = track.id;
      }

      currentSource = playBuffer(currentBuffer, previewGain);
      trackStartTime = ctx.currentTime;
      state.paused = false;

      // Schedule crossfade if there's a next track
      if (nextTrack) {
        scheduleCrossfade(track, nextTrack);

        // Pre-load next buffer
        loadPreview(nextTrack.id).then(buf => {
          buf._trackId = nextTrack.id;
          nextBuffer = buf;
        }).catch(() => {});
      }

      // Start progress updates
      startProgressTimer();
    } catch (err) {
      console.error('[Jukebox] Playback error:', err);
      updateStatus(`Playback error: ${err.message}`);
    }
  }

  function togglePause() {
    if (!audioCtx || !state.running) return;
    if (state.paused) {
      audioCtx.resume();
      state.paused = false;
      startProgressTimer();
    } else {
      audioCtx.suspend();
      state.paused = true;
      clearInterval(progressTimer);
    }
    updateControls();
  }

  function skipTrack() {
    if (!state.running) return;
    // Server will advance via WS, but we stop playback immediately
    stopCurrentPlayback();
  }

  // ---------------------------------------------------------------------------
  // Progress Bar
  // ---------------------------------------------------------------------------

  function startProgressTimer() {
    clearInterval(progressTimer);
    progressTimer = setInterval(() => {
      if (!audioCtx || !state.running || state.paused) return;
      const elapsed = audioCtx.currentTime - trackStartTime;
      const progress = Math.min(elapsed / PREVIEW_DURATION, 1);
      if (els.progressFill) {
        els.progressFill.style.width = `${progress * 100}%`;
      }
      if (els.timeDisplay) {
        const remaining = Math.max(0, PREVIEW_DURATION - elapsed);
        els.timeDisplay.textContent = `${formatTime(elapsed)} / ${formatTime(PREVIEW_DURATION)}`;
      }
    }, 250);
  }

  function formatTime(s) {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  }

  // ---------------------------------------------------------------------------
  // Visual Display
  // ---------------------------------------------------------------------------

  function updateVisual(track, imageUrl) {
    if (!els.visualImg) return;

    const src = imageUrl || track?.albumArt || '';
    if (!src) {
      els.visualImg.style.opacity = '0';
      return;
    }

    // Crossfade: create new image, fade it in
    const newImg = document.createElement('img');
    newImg.src = src;
    newImg.className = 'jukebox-visual-img fade-in';
    newImg.alt = track ? `${track.title} by ${track.artist}` : '';

    newImg.onload = () => {
      els.visualImg.style.opacity = '0';
      setTimeout(() => {
        els.visualImg.src = src;
        els.visualImg.alt = newImg.alt;
        els.visualImg.style.opacity = '1';
      }, 500);
    };
    newImg.onerror = () => {
      // Fall back to album art if image URL fails
      if (src !== track?.albumArt && track?.albumArt) {
        els.visualImg.src = track.albumArt;
        els.visualImg.style.opacity = '1';
      }
    };
  }

  function updateTrackInfo(track) {
    if (!track) return;
    if (els.trackTitle) els.trackTitle.textContent = track.title || '';
    if (els.trackArtist) els.trackArtist.textContent = track.artist || '';

    // Key & BPM
    const f = track.features || {};
    let keyStr = '';
    if (f.key !== undefined && f.key >= 0) {
      keyStr = KEY_NAMES[f.key] + (f.mode === 1 ? ' maj' : ' min');
    }
    if (els.trackKey) els.trackKey.textContent = keyStr;
    if (els.trackBpm) els.trackBpm.textContent = f.tempo ? `${Math.round(f.tempo)} BPM` : '';
    if (els.trackCamelot) els.trackCamelot.textContent = track.camelot || '';

    // Energy bar
    if (els.energyFill) {
      els.energyFill.style.width = `${(f.energy || 0) * 100}%`;
    }
  }

  function updateUpNext(nextTrack, currentTrack) {
    if (!els.upNext) return;
    if (!nextTrack) {
      els.upNext.innerHTML = '<span class="jukebox-dim">Last track</span>';
      return;
    }

    let quality = '';
    if (currentTrack?.camelot && nextTrack?.camelot) {
      const dist = camelotDistance(currentTrack.camelot, nextTrack.camelot);
      quality = dist === 0 ? 'Perfect' : dist === 1 ? 'Smooth' : dist <= 2 ? 'Good' : 'Jump';
    }

    els.upNext.innerHTML = `
      <span class="jukebox-dim">Up next:</span> ${nextTrack.title} <span class="jukebox-dim">by</span> ${nextTrack.artist}
      ${quality ? `<span class="jukebox-transition-badge jukebox-transition-${quality.toLowerCase()}">${quality}</span>` : ''}
    `;
  }

  // Client-side camelot distance for transition badge
  function camelotDistance(a, b) {
    if (!a || !b) return 6;
    const numA = parseInt(a);
    const numB = parseInt(b);
    const letterA = a.slice(-1);
    const letterB = b.slice(-1);
    if (a === b) return 0;
    if (letterA === letterB) {
      const diff = Math.abs(numA - numB);
      return Math.min(diff, 12 - diff);
    }
    if (numA === numB) return 1;
    const diff = Math.abs(numA - numB);
    return Math.min(diff, 12 - diff) + 1;
  }

  // ---------------------------------------------------------------------------
  // Fullscreen
  // ---------------------------------------------------------------------------

  function toggleFullscreen() {
    state.fullscreen = !state.fullscreen;
    if (els.visualContainer) {
      els.visualContainer.classList.toggle('jukebox-fullscreen', state.fullscreen);
    }

    if (state.fullscreen) {
      scheduleOverlayHide();
      // Show overlay on mouse move
      els.visualContainer?.addEventListener('mousemove', onFullscreenMouseMove);
      els.visualContainer?.addEventListener('touchstart', onFullscreenMouseMove);
    } else {
      clearTimeout(overlayHideTimer);
      els.visualContainer?.removeEventListener('mousemove', onFullscreenMouseMove);
      els.visualContainer?.removeEventListener('touchstart', onFullscreenMouseMove);
      if (els.trackOverlay) els.trackOverlay.style.opacity = '1';
    }
  }

  function onFullscreenMouseMove() {
    if (els.trackOverlay) els.trackOverlay.style.opacity = '1';
    if (els.controlsBar) els.controlsBar.style.opacity = '1';
    scheduleOverlayHide();
  }

  function scheduleOverlayHide() {
    clearTimeout(overlayHideTimer);
    overlayHideTimer = setTimeout(() => {
      if (state.fullscreen) {
        if (els.trackOverlay) els.trackOverlay.style.opacity = '0';
        if (els.controlsBar) els.controlsBar.style.opacity = '0';
      }
    }, 3000);
  }

  // ---------------------------------------------------------------------------
  // TTS
  // ---------------------------------------------------------------------------

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

      // Play TTS through a separate gain node at lower volume so it doesn't overwhelm music
      const ctx = ensureAudioContext();
      const arrayBuf = await blob.arrayBuffer();
      const audioBuf = await ctx.decodeAudioData(arrayBuf);
      const ttsGain = ctx.createGain();
      ttsGain.gain.value = 0.9;
      ttsGain.connect(masterGain);
      const source = ctx.createBufferSource();
      source.buffer = audioBuf;
      source.connect(ttsGain);

      // Duck music volume during TTS
      if (previewGain) {
        previewGain.gain.setTargetAtTime(0.3, ctx.currentTime, 0.3);
      }

      source.start();
      await new Promise(resolve => {
        source.onended = () => {
          // Restore music volume
          if (previewGain) {
            previewGain.gain.setTargetAtTime(1.0, ctx.currentTime, 0.3);
          }
          URL.revokeObjectURL(url);
          resolve();
        };
      });
    } catch {}
  }

  // ---------------------------------------------------------------------------
  // UI Updates
  // ---------------------------------------------------------------------------

  function updateStatus(text) {
    if (els.status) els.status.textContent = text;
  }

  function updateControls() {
    if (els.pauseBtn) {
      els.pauseBtn.textContent = state.paused ? 'Resume' : 'Pause';
    }
  }

  function setGenerating(isGen) {
    state.generating = isGen;
    if (els.generateBtn) {
      els.generateBtn.disabled = isGen;
      els.generateBtn.textContent = isGen ? 'Curating...' : 'Generate';
    }
    if (els.moodInput) els.moodInput.disabled = isGen;
  }

  function showPlayer() {
    if (els.idleSection) els.idleSection.classList.add('hidden');
    if (els.playerSection) els.playerSection.classList.remove('hidden');
  }

  function showIdle() {
    if (els.idleSection) els.idleSection.classList.remove('hidden');
    if (els.playerSection) els.playerSection.classList.add('hidden');
    state.running = false;
    state.trackIndex = -1;
    state.tracks = [];
    stopCurrentPlayback();
  }

  function renderPlaylist() {
    if (!els.playlist) return;
    els.playlist.innerHTML = state.tracks.map((t, i) => {
      const active = i === state.trackIndex ? ' active' : '';
      const played = i < state.trackIndex ? ' played' : '';
      const f = t.features || {};
      return `
        <div class="jukebox-playlist-item${active}${played}" data-index="${i}">
          <img class="jukebox-playlist-art" src="${t.albumArt || ''}" alt="" loading="lazy">
          <div class="jukebox-playlist-info">
            <div class="jukebox-playlist-title">${t.title}</div>
            <div class="jukebox-playlist-artist">${t.artist}</div>
          </div>
          <div class="jukebox-playlist-meta">
            ${t.camelot ? `<span class="jukebox-camelot">${t.camelot}</span>` : ''}
            ${f.tempo ? `<span class="jukebox-bpm">${Math.round(f.tempo)}</span>` : ''}
          </div>
        </div>
      `;
    }).join('');
  }

  // ---------------------------------------------------------------------------
  // Session Actions
  // ---------------------------------------------------------------------------

  async function generateSession() {
    const mood = els.moodInput?.value?.trim();
    if (!mood) return;

    setGenerating(true);
    updateStatus('Searching for tracks...');

    try {
      const res = await VP.apiFetch('/api/jukebox/create', {
        method: 'POST',
        body: JSON.stringify({ mood }),
      });

      if (res.error) {
        updateStatus(`Error: ${res.error}`);
        setGenerating(false);
        return;
      }

      // Session created — WS events will drive the UI from here
      state.sessionId = res.sessionId;
      state.tracks = res.tracks || [];
      state.running = true;
      state.trackIndex = -1;

      showPlayer();
      renderPlaylist();
      updateStatus(`${state.tracks.length} tracks curated for "${mood}"`);

      // Edward introduces the session
      queueTTS(
        `Welcome to the Visual Jukebox. I've curated ${state.tracks.length} tracks for ${mood}. Let's begin.`,
        'edward'
      );
    } catch (err) {
      updateStatus(`Error: ${err.message}`);
    }
    setGenerating(false);
  }

  async function stopSession() {
    try {
      await VP.apiFetch('/api/jukebox/stop', { method: 'POST', body: '{}' });
    } catch {}
    showIdle();
    updateStatus('Session stopped');
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  function render() {
    const panel = document.getElementById('panel-jukebox');
    panel.innerHTML = `
      <div class="jukebox-container">
        <!-- Idle Section: Mood Input -->
        <div id="jukebox-idle" class="jukebox-idle">
          <div class="jukebox-header">
            <h2>Visual Jukebox</h2>
            <p class="jukebox-subtitle">Type a mood, get a harmonically sequenced audiovisual experience</p>
          </div>
          <div class="jukebox-input-row">
            <input type="text" id="jukebox-mood" class="jukebox-mood-input"
                   placeholder="Enter a mood (e.g., sunset jazz, late night Berlin)..."
                   autocomplete="off">
            <button id="jukebox-generate" class="jukebox-generate-btn">Generate</button>
          </div>
          <div class="jukebox-presets" id="jukebox-presets">
            ${PRESET_MOODS.map(m => `<button class="jukebox-preset-chip">${m}</button>`).join('')}
          </div>
          <div class="jukebox-status" id="jukebox-status"></div>
        </div>

        <!-- Player Section -->
        <div id="jukebox-player" class="jukebox-player hidden">
          <div class="jukebox-visual-container" id="jukebox-visual-container">
            <img class="jukebox-visual-img" id="jukebox-visual-img" alt="">
            <div class="jukebox-track-overlay" id="jukebox-track-overlay">
              <div class="jukebox-track-title" id="jukebox-track-title"></div>
              <div class="jukebox-track-artist" id="jukebox-track-artist"></div>
              <div class="jukebox-track-tags">
                <span class="jukebox-tag" id="jukebox-track-key"></span>
                <span class="jukebox-tag" id="jukebox-track-bpm"></span>
                <span class="jukebox-tag jukebox-camelot-tag" id="jukebox-track-camelot"></span>
              </div>
              <div class="jukebox-energy-bar">
                <div class="jukebox-energy-fill" id="jukebox-energy-fill"></div>
              </div>
            </div>
          </div>

          <div class="jukebox-controls-bar" id="jukebox-controls-bar">
            <div class="jukebox-progress">
              <div class="jukebox-progress-fill" id="jukebox-progress-fill"></div>
            </div>
            <div class="jukebox-time" id="jukebox-time">0:00 / 0:30</div>
            <div class="jukebox-up-next" id="jukebox-up-next"></div>
            <div class="jukebox-controls">
              <button class="jukebox-ctrl-btn" id="jukebox-pause">Pause</button>
              <button class="jukebox-ctrl-btn" id="jukebox-skip">Skip</button>
              <button class="jukebox-ctrl-btn" id="jukebox-fullscreen">Fullscreen</button>
              <button class="jukebox-ctrl-btn jukebox-stop-btn" id="jukebox-stop">Stop</button>
            </div>
          </div>

          <div class="jukebox-playlist-container">
            <h3>Playlist <span class="jukebox-dim" id="jukebox-playlist-count"></span></h3>
            <div class="jukebox-playlist" id="jukebox-playlist"></div>
          </div>
        </div>
      </div>
    `;

    cacheElements();
    attachEvents();
  }

  function cacheElements() {
    els.moodInput = document.getElementById('jukebox-mood');
    els.generateBtn = document.getElementById('jukebox-generate');
    els.presets = document.getElementById('jukebox-presets');
    els.status = document.getElementById('jukebox-status');
    els.idleSection = document.getElementById('jukebox-idle');
    els.playerSection = document.getElementById('jukebox-player');
    els.visualContainer = document.getElementById('jukebox-visual-container');
    els.visualImg = document.getElementById('jukebox-visual-img');
    els.trackOverlay = document.getElementById('jukebox-track-overlay');
    els.trackTitle = document.getElementById('jukebox-track-title');
    els.trackArtist = document.getElementById('jukebox-track-artist');
    els.trackKey = document.getElementById('jukebox-track-key');
    els.trackBpm = document.getElementById('jukebox-track-bpm');
    els.trackCamelot = document.getElementById('jukebox-track-camelot');
    els.energyFill = document.getElementById('jukebox-energy-fill');
    els.progressFill = document.getElementById('jukebox-progress-fill');
    els.timeDisplay = document.getElementById('jukebox-time');
    els.upNext = document.getElementById('jukebox-up-next');
    els.pauseBtn = document.getElementById('jukebox-pause');
    els.skipBtn = document.getElementById('jukebox-skip');
    els.fullscreenBtn = document.getElementById('jukebox-fullscreen');
    els.stopBtn = document.getElementById('jukebox-stop');
    els.controlsBar = document.getElementById('jukebox-controls-bar');
    els.playlist = document.getElementById('jukebox-playlist');
    els.playlistCount = document.getElementById('jukebox-playlist-count');
  }

  function attachEvents() {
    els.generateBtn?.addEventListener('click', generateSession);
    els.moodInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') generateSession();
    });
    els.presets?.querySelectorAll('.jukebox-preset-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        els.moodInput.value = chip.textContent;
        generateSession();
      });
    });
    els.pauseBtn?.addEventListener('click', togglePause);
    els.skipBtn?.addEventListener('click', skipTrack);
    els.fullscreenBtn?.addEventListener('click', toggleFullscreen);
    els.stopBtn?.addEventListener('click', stopSession);

    // ESC exits fullscreen
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && state.fullscreen) toggleFullscreen();
    });
  }

  // ---------------------------------------------------------------------------
  // Module Interface
  // ---------------------------------------------------------------------------

  VP.modules.jukebox = {
    init() {
      render();
    },

    async onActivate() {
      // Check if a session is already running
      try {
        const status = await VP.apiFetch('/api/jukebox/status');
        if (status.running) {
          state.running = true;
          state.sessionId = status.sessionId;
          showPlayer();
          updateStatus(`Session in progress: ${status.mood}`);
        }
      } catch {}
    },

    onWSMessage(msg) {
      if (msg.type === 'jukebox:ready') {
        state.sessionId = msg.sessionId;
        state.tracks = msg.tracks || [];
        state.running = true;
        state.trackIndex = -1;
        showPlayer();
        renderPlaylist();
        if (els.playlistCount) els.playlistCount.textContent = `(${state.tracks.length} tracks)`;
        updateStatus(`Session ready: ${msg.mood}`);
      }

      else if (msg.type === 'jukebox:track') {
        state.trackIndex = msg.trackIndex;
        const track = msg.track;
        const nextTrack = msg.nextTrack || null;

        // Update visuals
        updateTrackInfo(track);
        updateVisual(track, msg.imageUrl);
        updateUpNext(nextTrack, track);
        renderPlaylist();

        // Play audio
        playTrack(track, nextTrack);

        // TTS announce track (short, non-overlapping with intro)
        if (msg.trackIndex > 0) {
          queueTTS(`${track.title} by ${track.artist}`, 'edward');
        }
      }

      else if (msg.type === 'jukebox:image') {
        // Update image for a track
        const track = state.tracks.find(t => t.id === msg.trackId);
        if (track) {
          track._imageUrl = msg.imageUrl;
          // If this is the current track, update the visual
          if (state.trackIndex >= 0 && state.tracks[state.trackIndex]?.id === msg.trackId) {
            updateVisual(track, msg.imageUrl);
          }
        }
      }

      else if (msg.type === 'jukebox:complete') {
        updateStatus('Session complete');
        stopCurrentPlayback();
        queueTTS('That concludes this Visual Jukebox session. I hope you enjoyed it.', 'edward');
        setTimeout(() => showIdle(), 8000);
      }

      else if (msg.type === 'jukebox:stopped') {
        showIdle();
      }

      else if (msg.type === 'jukebox:error') {
        updateStatus(`Error: ${msg.error}`);
        showIdle();
      }
    },

    onStateUpdate(villaState) {
      // No villa state dependencies for jukebox
    }
  };
})();
