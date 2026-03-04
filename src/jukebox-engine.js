/**
 * Visual Jukebox Engine — Villa Romanza
 *
 * Browser-based audiovisual experience: mood → Spotify search → harmonic sequencing →
 * Web Audio playback with synthesized transition beds + AI-generated visuals.
 *
 * All audio plays client-side via Web Audio API. This engine handles:
 *   - Mood-to-query expansion (presets or Ollama)
 *   - Spotify search + audio features
 *   - Camelot wheel harmonic sequencing
 *   - Session state machine (step through tracks with WS events)
 *   - Fire-and-forget Imagen generation per track
 */

const crypto = require('crypto');

// ---------------------------------------------------------------------------
// Camelot Wheel — harmonic mixing compatibility
// ---------------------------------------------------------------------------

// Spotify key (0=C, 1=C#, ... 11=B) + mode (0=minor, 1=major) → Camelot code
// Camelot: 1A-12A (minor), 1B-12B (major)
const CAMELOT_MAP = {
  // minor (mode=0): key → camelot number
  '0-0': '5A',   // C minor
  '1-0': '12A',  // C# minor
  '2-0': '7A',   // D minor
  '3-0': '2A',   // D# minor
  '4-0': '9A',   // E minor
  '5-0': '4A',   // F minor
  '6-0': '11A',  // F# minor
  '7-0': '6A',   // G minor
  '8-0': '1A',   // G# minor
  '9-0': '8A',   // A minor
  '10-0': '3A',  // A# minor
  '11-0': '10A', // B minor
  // major (mode=1): key → camelot number
  '0-1': '8B',   // C major
  '1-1': '3B',   // C# major
  '2-1': '10B',  // D major
  '3-1': '5B',   // D# major
  '4-1': '12B',  // E major
  '5-1': '7B',   // F major
  '6-1': '2B',   // F# major
  '7-1': '9B',   // G major
  '8-1': '4B',   // G# major
  '9-1': '11B',  // A major
  '10-1': '6B',  // A# major
  '11-1': '1B',  // B major
};

function getCamelot(key, mode) {
  if (key < 0 || key > 11) return null;
  return CAMELOT_MAP[`${key}-${mode === 1 ? 1 : 0}`] || null;
}

function camelotDistance(a, b) {
  if (!a || !b) return 6; // max penalty for unknown keys
  const numA = parseInt(a);
  const numB = parseInt(b);
  const letterA = a.slice(-1);
  const letterB = b.slice(-1);

  // Same code = 0
  if (a === b) return 0;

  // ±1 on wheel (same letter)
  if (letterA === letterB) {
    const diff = Math.abs(numA - numB);
    const wrap = Math.min(diff, 12 - diff);
    if (wrap <= 1) return 1;
    return wrap;
  }

  // Relative major/minor (same number, different letter)
  if (numA === numB) return 1;

  // Everything else — distance on wheel
  const diff = Math.abs(numA - numB);
  return Math.min(diff, 12 - diff) + 1;
}

// ---------------------------------------------------------------------------
// Note frequencies for transition bed synthesis
// ---------------------------------------------------------------------------

// Semitone → frequency (A4 = 440 Hz, C4 = 261.63 Hz)
function midiToFreq(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

// Spotify key (0-11) → MIDI note for C4 octave
function keyToMidi(key) {
  return 60 + key; // C4 = 60
}

// Get chord tones (root, 3rd, 5th) based on key and mode
function getChordTones(key, mode) {
  const root = keyToMidi(key);
  const third = mode === 1 ? root + 4 : root + 3; // major 3rd vs minor 3rd
  const fifth = root + 7;
  return { root, third, fifth };
}

// ---------------------------------------------------------------------------
// Preset mood queries
// ---------------------------------------------------------------------------

const PRESET_MOODS = {
  'chill lounge': ['chill lounge ambient', 'downtempo chillhop', 'lo-fi jazz beats'],
  'berlin night': ['berlin techno minimal', 'deep house underground', 'dark electronic ambient'],
  'jazz cafe': ['jazz cafe smooth', 'bossa nova instrumental', 'jazz trio piano'],
  'deep focus': ['ambient focus music', 'deep concentration instrumental', 'minimal electronic focus'],
  'sunset vibes': ['sunset chill acoustic', 'golden hour indie', 'warm ambient electronic'],
};

// ---------------------------------------------------------------------------
// JukeboxEngine
// ---------------------------------------------------------------------------

class JukeboxEngine {
  constructor(musicService, orchestrator) {
    this.musicService = musicService;
    this.orchestrator = orchestrator;
    this.broadcast = null; // Set by portal-api WebSocket wiring
    this._session = null;
    this._abortController = null;
    this._sessions = []; // history
  }

  /**
   * Create a new jukebox session from a mood string.
   * Searches Spotify, fetches audio features, sequences harmonically.
   */
  async create(mood) {
    if (!mood) throw new Error('mood required');
    if (!this.musicService) throw new Error('Music service not configured');

    // Stop any running session
    if (this._session?.running) {
      await this.stop();
    }

    const sessionId = crypto.randomBytes(8).toString('hex');
    console.log(`[Jukebox] Creating session ${sessionId} for mood: "${mood}"`);

    // 1. Get search queries for the mood
    const queries = await this._moodToQueries(mood);

    // 2. Search Spotify for tracks with preview URLs
    const spotifyAdapter = this.musicService.adapters?.get('spotify');
    if (!spotifyAdapter || !spotifyAdapter.isAvailable()) {
      throw new Error('Spotify adapter not available');
    }

    let allTracks = [];
    for (const query of queries) {
      try {
        const results = await spotifyAdapter.search(query, { limit: 10, type: 'track' });
        const tracks = results.filter(t => t.type === 'track');
        allTracks.push(...tracks);
      } catch (err) {
        console.log(`[Jukebox] Search failed for "${query}": ${err.message}`);
      }
    }

    // Deduplicate by ID
    const seen = new Set();
    allTracks = allTracks.filter(t => {
      if (seen.has(t.id)) return false;
      seen.add(t.id);
      return true;
    });

    if (allTracks.length < 2) {
      throw new Error(`Not enough tracks found for mood "${mood}" (got ${allTracks.length})`);
    }

    // 3. Fetch audio features (may fail — Spotify deprecated this for new apps in Nov 2024)
    const ids = allTracks.map(t => t.id);
    let features = {};
    try {
      features = await spotifyAdapter.getAudioFeatures(ids);
      console.log(`[Jukebox] Got audio features for ${Object.keys(features).length} tracks`);
    } catch (err) {
      console.log(`[Jukebox] Audio features unavailable (${err.message}) — using estimated features`);
    }

    // 4. Enrich tracks with features + camelot codes
    const enriched = allTracks.map(t => {
      const f = features[t.id] || {};
      const hasFeatures = f.key !== undefined && f.mode !== undefined;
      const camelot = hasFeatures ? getCamelot(f.key, f.mode) : null;

      // Estimate features from mood if Spotify features unavailable
      if (!hasFeatures) {
        const est = this._estimateFeatures(mood);
        Object.assign(f, est);
      }

      return {
        ...t,
        features: f,
        camelot,
        chordTones: hasFeatures ? getChordTones(f.key, f.mode) : this._estimateChordTones(mood),
      };
    });

    // 5. Sequence — harmonic if we have camelot data, otherwise energy-shuffle
    const withCamelot = enriched.filter(t => t.camelot);
    let sequenced;
    if (withCamelot.length >= 2) {
      sequenced = this._harmonicSequence(withCamelot);
    } else {
      // Shuffle with gentle energy arc: start mid, rise, peak, descend
      sequenced = this._energyArcSequence(enriched);
    }

    return this._startSession(sessionId, mood, sequenced.slice(0, 10));
  }

  _startSession(sessionId, mood, tracks) {
    const session = {
      id: sessionId,
      mood,
      tracks,
      trackIndex: -1,
      running: true,
      createdAt: Date.now(),
      images: {}, // trackId → imageUrl
    };

    this._session = session;
    this._abortController = new AbortController();

    // Add to history
    this._sessions.unshift({ id: sessionId, mood, trackCount: tracks.length, createdAt: session.createdAt });
    if (this._sessions.length > 20) this._sessions.pop();

    // Emit ready event
    const trackList = tracks.map(t => ({
      id: t.id,
      title: t.title,
      artist: t.artist,
      albumArt: t.albumArt,
      previewUrl: t.previewUrl,
      camelot: t.camelot,
      features: t.features,
      chordTones: t.chordTones,
    }));

    this._emit({ type: 'jukebox:ready', sessionId, mood, tracks: trackList });

    // Start stepping through tracks in background
    this._runSession(session, this._abortController.signal).catch(err => {
      if (err.name !== 'AbortError') {
        console.error(`[Jukebox] Session error: ${err.message}`);
        this._emit({ type: 'jukebox:error', sessionId, error: err.message });
      }
      session.running = false;
    });

    // Fire-and-forget image generation
    this._generateImages(session).catch(err => {
      console.log(`[Jukebox] Image generation error: ${err.message}`);
    });

    return {
      sessionId,
      mood,
      tracks: trackList,
    };
  }

  async stop() {
    if (!this._session?.running) return { success: false, error: 'No session running' };
    const sessionId = this._session.id;
    this._abortController?.abort();
    this._session.running = false;
    this._emit({ type: 'jukebox:stopped', sessionId });
    return { success: true, sessionId };
  }

  getStatus() {
    if (!this._session?.running) return { running: false };
    const s = this._session;
    const current = s.tracks[s.trackIndex] || null;
    const next = s.tracks[s.trackIndex + 1] || null;
    return {
      running: true,
      sessionId: s.id,
      mood: s.mood,
      trackIndex: s.trackIndex,
      totalTracks: s.tracks.length,
      currentTrack: current ? { id: current.id, title: current.title, artist: current.artist } : null,
      nextTrack: next ? { id: next.id, title: next.title, artist: next.artist } : null,
    };
  }

  getSessions() {
    return this._sessions;
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  /**
   * Harmonic sequencing using greedy nearest-neighbor on Camelot wheel + energy.
   */
  _harmonicSequence(tracks) {
    if (tracks.length <= 1) return tracks;

    // Start with highest-energy track
    const sorted = [...tracks].sort((a, b) => (b.features?.energy || 0) - (a.features?.energy || 0));
    const result = [sorted[0]];
    const remaining = new Set(sorted.slice(1));

    while (remaining.size > 0) {
      const last = result[result.length - 1];
      let best = null;
      let bestScore = Infinity;

      for (const candidate of remaining) {
        const harmDist = camelotDistance(last.camelot, candidate.camelot);
        const energyDiff = Math.abs((last.features?.energy || 0.5) - (candidate.features?.energy || 0.5));
        const score = harmDist * 2 + energyDiff * 3;
        if (score < bestScore) {
          bestScore = score;
          best = candidate;
        }
      }

      if (best) {
        result.push(best);
        remaining.delete(best);
      }
    }

    return result;
  }

  /**
   * Step through tracks with 35s dwell (30s preview + 5s transition).
   */
  async _runSession(session, signal) {
    const DWELL_MS = 35000;

    for (let i = 0; i < session.tracks.length; i++) {
      if (signal.aborted) return;

      session.trackIndex = i;
      const track = session.tracks[i];
      const next = session.tracks[i + 1] || null;

      console.log(`[Jukebox] Track ${i + 1}/${session.tracks.length}: ${track.title} by ${track.artist}`);

      this._emit({
        type: 'jukebox:track',
        sessionId: session.id,
        trackIndex: i,
        totalTracks: session.tracks.length,
        track: {
          id: track.id,
          title: track.title,
          artist: track.artist,
          albumArt: track.albumArt,
          previewUrl: track.previewUrl,
          camelot: track.camelot,
          features: track.features,
          chordTones: track.chordTones,
        },
        nextTrack: next ? {
          id: next.id,
          title: next.title,
          artist: next.artist,
          camelot: next.camelot,
          features: next.features,
          chordTones: next.chordTones,
        } : null,
        imageUrl: session.images[track.id] || null,
      });

      await this._wait(DWELL_MS, signal);
    }

    session.running = false;
    this._emit({ type: 'jukebox:complete', sessionId: session.id });
    console.log(`[Jukebox] Session complete: ${session.id}`);
  }

  /**
   * Generate Imagen art for each track (fire-and-forget, emits WS events).
   */
  async _generateImages(session) {
    if (!this.orchestrator) return;

    for (const track of session.tracks) {
      if (!session.running) return;

      const prompt = `Cinematic, atmospheric visual art for the song "${track.title}" by ${track.artist}. ` +
        `Mood: ${session.mood}. Abstract, immersive, 16:9 widescreen. ` +
        `Rich colors, dreamy lighting, no text or logos.`;

      try {
        const result = await this.orchestrator.execute(`imagen: ${prompt}`);
        if (result.success && typeof result.result === 'string') {
          // Extract image path from Imagen response
          const match = result.result.match(/\/generated-images\/[^\s)]+/);
          if (match) {
            const imageUrl = `/api/images/${match[0].split('/').pop()}`;
            session.images[track.id] = imageUrl;
            this._emit({
              type: 'jukebox:image',
              sessionId: session.id,
              trackId: track.id,
              imageUrl,
            });
          }
        }
      } catch (err) {
        console.log(`[Jukebox] Image gen failed for "${track.title}": ${err.message}`);
      }
    }
  }

  /**
   * Energy-arc sequencing when harmonic data unavailable.
   * Creates a gentle rise-peak-descend curve.
   */
  _energyArcSequence(tracks) {
    if (tracks.length <= 2) return tracks;
    // Shuffle first for variety
    const shuffled = [...tracks].sort(() => Math.random() - 0.5);
    // Sort by estimated energy
    shuffled.sort((a, b) => (a.features?.energy || 0.5) - (b.features?.energy || 0.5));
    // Interleave: pick from alternating ends for a natural arc
    const result = [];
    let lo = 0, hi = shuffled.length - 1;
    let pickHigh = false;
    while (lo <= hi) {
      result.push(shuffled[pickHigh ? hi-- : lo++]);
      pickHigh = !pickHigh;
    }
    return result;
  }

  /**
   * Estimate audio features from mood when Spotify API unavailable.
   */
  _estimateFeatures(mood) {
    const m = mood.toLowerCase();
    const MOOD_FEATURES = {
      chill: { energy: 0.3, valence: 0.5, tempo: 90, danceability: 0.4 },
      lounge: { energy: 0.35, valence: 0.55, tempo: 95, danceability: 0.5 },
      jazz: { energy: 0.4, valence: 0.6, tempo: 120, danceability: 0.5 },
      cafe: { energy: 0.35, valence: 0.6, tempo: 110, danceability: 0.45 },
      focus: { energy: 0.25, valence: 0.4, tempo: 80, danceability: 0.3 },
      night: { energy: 0.5, valence: 0.4, tempo: 125, danceability: 0.65 },
      berlin: { energy: 0.6, valence: 0.35, tempo: 128, danceability: 0.7 },
      techno: { energy: 0.7, valence: 0.3, tempo: 130, danceability: 0.75 },
      sunset: { energy: 0.35, valence: 0.65, tempo: 100, danceability: 0.45 },
      party: { energy: 0.8, valence: 0.7, tempo: 125, danceability: 0.8 },
      ambient: { energy: 0.2, valence: 0.45, tempo: 75, danceability: 0.2 },
    };

    // Match first keyword found
    for (const [key, feat] of Object.entries(MOOD_FEATURES)) {
      if (m.includes(key)) {
        // Add slight randomness so tracks aren't identical
        return {
          energy: feat.energy + (Math.random() - 0.5) * 0.15,
          valence: feat.valence + (Math.random() - 0.5) * 0.1,
          tempo: feat.tempo + (Math.random() - 0.5) * 15,
          danceability: feat.danceability + (Math.random() - 0.5) * 0.1,
        };
      }
    }
    // Default mid-energy
    return {
      energy: 0.4 + (Math.random() - 0.5) * 0.2,
      valence: 0.5 + (Math.random() - 0.5) * 0.15,
      tempo: 105 + (Math.random() - 0.5) * 20,
      danceability: 0.5 + (Math.random() - 0.5) * 0.15,
    };
  }

  /**
   * Estimate chord tones from mood for transition bed synthesis.
   * Returns common keys associated with mood types.
   */
  _estimateChordTones(mood) {
    const m = mood.toLowerCase();
    // Map moods to common musical keys
    const MOOD_KEYS = {
      chill: { key: 0, mode: 1 },    // C major
      jazz: { key: 5, mode: 1 },     // F major
      cafe: { key: 7, mode: 1 },     // G major
      lounge: { key: 9, mode: 0 },   // A minor
      night: { key: 2, mode: 0 },    // D minor
      berlin: { key: 4, mode: 0 },   // E minor
      focus: { key: 0, mode: 1 },    // C major
      sunset: { key: 7, mode: 1 },   // G major
      ambient: { key: 0, mode: 1 },  // C major
    };

    for (const [keyword, info] of Object.entries(MOOD_KEYS)) {
      if (m.includes(keyword)) return getChordTones(info.key, info.mode);
    }
    return getChordTones(0, 1); // Default: C major
  }

  /**
   * Convert mood string to Spotify search queries.
   */
  async _moodToQueries(mood) {
    const normalized = mood.toLowerCase().trim();

    // Check presets first
    if (PRESET_MOODS[normalized]) {
      return PRESET_MOODS[normalized];
    }

    // Try Ollama for custom moods
    const ollamaHost = process.env.OLLAMA_HOST || 'http://192.168.0.60:11434';
    try {
      const res = await fetch(`${ollamaHost}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'llama3.2:3b',
          prompt: `Given the mood "${mood}", generate 3 Spotify search queries that would find matching tracks. Return ONLY the queries, one per line, no numbering or explanation.`,
          stream: false,
        }),
        signal: AbortSignal.timeout(10000),
      });

      if (res.ok) {
        const data = await res.json();
        const lines = (data.response || '')
          .split('\n')
          .map(l => l.trim())
          .filter(l => l.length > 2 && l.length < 60);
        if (lines.length >= 2) return lines.slice(0, 3);
      }
    } catch {
      // Ollama unavailable — fall back to raw mood as query
    }

    // Fallback: use mood directly as search queries
    return [mood, `${mood} music`, `${mood} instrumental`];
  }

  _emit(msg) {
    if (typeof this.broadcast === 'function') {
      this.broadcast(msg);
    }
  }

  _wait(ms, signal) {
    return new Promise((resolve) => {
      const timer = setTimeout(resolve, ms);
      const onAbort = () => {
        clearTimeout(timer);
        resolve();
      };
      signal.addEventListener('abort', onAbort, { once: true });
    });
  }
}

module.exports = { JukeboxEngine, getCamelot, camelotDistance, getChordTones, PRESET_MOODS };
