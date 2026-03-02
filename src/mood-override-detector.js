/**
 * MoodOverrideDetector - Detects user manual adjustments after mood intents
 * Feeds override data back to RL for learning optimal mood recipes
 *
 * Flow: Intent executed → expected states recorded → poll actual states →
 *       drift > threshold → override event → satisfaction score → RL update
 *
 * Uses REST polling (10s default), no WebSocket dependency
 */

class MoodOverrideDetector {
  constructor(options = {}) {
    this.haUrl = options.haUrl || process.env.HA_URL || 'http://192.168.1.6:8123';
    this.token = options.token || process.env.HA_TOKEN || '';
    this.driftThreshold = options.driftThreshold ?? 0.1;
    this.detectionWindow = options.detectionWindow || 300000; // 5 minutes
    this.onOverride = options.onOverride || null;
    this._expectations = new Map(); // entityId → { expected, intentContext, recordedAt }
    this._overrides = []; // historical override records
    this._timer = null;
  }

  /**
   * Record expected state after intent execution
   * @param {string} entityId - e.g. 'light.theatre'
   * @param {*} expectedValue - numeric (0-255 brightness) or string ('on'/'off')
   * @param {object} intentContext - { room, intent, timePeriod }
   */
  recordExpectedState(entityId, expectedValue, intentContext = {}) {
    this._expectations.set(entityId, {
      expected: expectedValue,
      context: intentContext,
      recordedAt: Date.now()
    });
  }

  /**
   * Start polling for override detection
   */
  startPolling(intervalMs = 10000) {
    this.stop();
    this._timer = setInterval(() => this._checkOverrides().catch(() => {}), intervalMs);
    return this;
  }

  /**
   * Stop polling
   */
  stop() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
    return this;
  }

  /**
   * Get historical overrides, optionally filtered by timestamp
   */
  getOverrides(since = 0) {
    if (since === 0) return [...this._overrides];
    return this._overrides.filter(o => o.detectedAt >= since);
  }

  /**
   * Compute drift between expected and actual values
   * Returns 0.0 (no drift) to 1.0 (maximum drift)
   */
  _computeDrift(expected, actual) {
    // On/off binary comparison
    if (typeof expected === 'string' || typeof actual === 'string') {
      const expStr = String(expected).toLowerCase();
      const actStr = String(actual).toLowerCase();
      return expStr === actStr ? 0.0 : 1.0;
    }

    // Numeric comparison (brightness 0-255, volume 0-100, etc.)
    const expNum = Number(expected);
    const actNum = Number(actual);
    if (isNaN(expNum) || isNaN(actNum)) return 1.0;

    const maxVal = Math.max(Math.abs(expNum), 1);
    return Math.min(Math.abs(actNum - expNum) / maxVal, 1.0);
  }

  /**
   * Poll HA for actual states and compare to expectations
   */
  async _checkOverrides() {
    if (!this.token || this._expectations.size === 0) return;

    const now = Date.now();
    const expired = [];

    for (const [entityId, expectation] of this._expectations) {
      // Clean up expired entries
      if (now - expectation.recordedAt > this.detectionWindow) {
        expired.push(entityId);
        continue;
      }

      try {
        const res = await fetch(`${this.haUrl}/api/states/${entityId}`, {
          headers: { 'Authorization': `Bearer ${this.token}` },
          signal: AbortSignal.timeout(5000)
        });

        if (!res.ok) continue;

        const data = await res.json();
        const actual = this._extractValue(data);
        const drift = this._computeDrift(expectation.expected, actual);

        if (drift > this.driftThreshold) {
          const override = {
            entityId,
            expected: expectation.expected,
            actual,
            drift,
            satisfaction: Math.max(0, Math.round(100 * (1 - Math.abs(drift)))),
            context: expectation.context,
            detectedAt: now
          };

          this._overrides.push(override);

          // Remove expectation — override already detected
          expired.push(entityId);

          // Fire callback
          if (typeof this.onOverride === 'function') {
            try { this.onOverride(override); } catch {}
          }
        }
      } catch {
        // Skip individual entity errors
      }
    }

    // Cleanup expired/detected entries
    for (const entityId of expired) {
      this._expectations.delete(entityId);
    }
  }

  /**
   * Extract the relevant value from an HA state response
   * For lights: brightness attribute (numeric) or state (on/off)
   * For media_player: volume_level attribute or state
   * For others: state string
   */
  _extractValue(stateData) {
    const attrs = stateData.attributes || {};
    const domain = (stateData.entity_id || '').split('.')[0];

    if (domain === 'light' && typeof attrs.brightness === 'number') {
      return attrs.brightness;
    }
    if (domain === 'media_player' && typeof attrs.volume_level === 'number') {
      return Math.round(attrs.volume_level * 100);
    }
    return stateData.state;
  }
}

module.exports = MoodOverrideDetector;
