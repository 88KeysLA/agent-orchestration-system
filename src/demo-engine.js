/**
 * Villa Portal — Demo Sequence Engine
 * Backend-driven sequencer for mode transitions with TTS narration
 */

const SEQUENCES = {
  'grand-tour': {
    name: 'Grand Tour',
    description: 'Full walkthrough of Villa Romanza modes',
    steps: [
      {
        mode: 'NORMAL',
        dwell: 8,
        narration: "Welcome to Villa Romanza. Right now the house is in Normal mode — functional lighting, everything at rest. Let me show you what this place can do.",
        voice: 'edward'
      },
      {
        mode: 'LISTEN',
        dwell: 25,
        narration: "Now entering Listen mode. Ambient music fills the house through 21 Sonos speakers. The Hue Sync Boxes pulse gently with the music. The lighting shifts to warm perimeter tones.",
      },
      {
        mode: 'LOOK',
        dwell: 25,
        narration: "This is Look mode — visual art. Apple TV screensavers play on the theatre TV, distributed to 21 Hue Sync Boxes throughout the house. The entire home becomes a living canvas.",
      },
      {
        mode: 'ENTERTAIN',
        dwell: 25,
        narration: "Entertain mode. Social lighting, brighter accents, multi-zone music. The house is ready for guests. Climate drops to 70 degrees to keep things comfortable.",
      },
      {
        mode: 'NORMAL',
        dwell: 5,
        narration: "And we're back to Normal. That was the Grand Tour of Villa Romanza — 76 rooms, 28 Hue bridges, 22 sync boxes, 29 Sonos speakers, all orchestrated by AI.",
      },
    ]
  },
  'quick-vibes': {
    name: 'Quick Vibes',
    description: 'Fast lighting + music showcase (90s)',
    steps: [
      {
        mode: 'LISTEN',
        dwell: 20,
        narration: "Listen mode — ambient music and synchronized lighting across the entire house.",
      },
      {
        mode: 'ENTERTAIN',
        dwell: 20,
        narration: "Switching to Entertain. Brighter, more energetic. Perfect for a party.",
      },
      {
        mode: 'NORMAL',
        dwell: 3,
        narration: "Back to Normal. Quick and clean.",
      },
    ]
  },
  'visual-art': {
    name: 'Visual Art',
    description: 'LOOK mode showcase with visual narration',
    steps: [
      {
        mode: 'LOOK',
        dwell: 40,
        narration: "Welcome to Look mode. The theatre TV displays curated visual art, distributed through an HDFury VRROOM matrix to 21 Hue Sync Boxes. Every room in the house responds to the visual content — subtle color washes that transform the architecture into a living gallery.",
      },
      {
        mode: 'NORMAL',
        dwell: 3,
        narration: "Returning to Normal. The art sleeps until next time.",
      },
    ]
  },
  'interlude': {
    name: 'Interlude',
    description: 'Watch the 60-second staged fade sequence',
    steps: [
      {
        mode: 'LISTEN',
        dwell: 15,
        narration: "First, let me set the stage with Listen mode — music and synced lighting.",
      },
      {
        mode: 'INTERLUDE',
        dwell: 65,
        narration: "Now watch this — Interlude. A 60-second choreographed fade. The house gradually winds down, layer by layer, until it settles back into Normal.",
      },
    ]
  }
};

class DemoEngine {
  constructor(orchestrator) {
    this.orchestrator = orchestrator;
    this.broadcast = null; // Set by setupWebSocket
    this.state = { running: false };
  }

  async start(sequenceId) {
    if (this.state.running) {
      return { success: false, error: 'Demo already running' };
    }

    const sequence = SEQUENCES[sequenceId];
    if (!sequence) {
      return { success: false, error: `Unknown sequence: ${sequenceId}` };
    }

    const ac = new AbortController();
    this.state = {
      running: true,
      sequenceId,
      stepIndex: 0,
      totalSteps: sequence.steps.length,
      currentStep: sequence.steps[0],
      startedAt: Date.now(),
      abortController: ac,
    };

    // Run sequence in background (don't await)
    this._runSequence(sequence, ac.signal).catch(err => {
      console.error('[Demo] Sequence error:', err.message);
      this._emit({ type: 'demo:error', message: err.message });
      this.state = { running: false };
    });

    return { success: true, sequence: sequence.name, totalSteps: sequence.steps.length };
  }

  async stop() {
    if (!this.state.running) {
      return { success: false, error: 'No demo running' };
    }

    const sequenceId = this.state.sequenceId;
    this.state.abortController.abort();
    this.state = { running: false };

    // Restore NORMAL mode
    try {
      await this.orchestrator.execute('ha:mode:NORMAL');
    } catch (err) {
      console.error('[Demo] Failed to restore NORMAL:', err.message);
    }

    this._emit({ type: 'demo:stopped', sequenceId, reason: 'user' });
    return { success: true, restoredMode: 'NORMAL' };
  }

  getStatus() {
    if (!this.state.running) {
      return { running: false };
    }
    return {
      running: true,
      sequenceId: this.state.sequenceId,
      stepIndex: this.state.stepIndex,
      totalSteps: this.state.totalSteps,
      currentStep: {
        mode: this.state.currentStep.mode,
        narration: this.state.currentStep.narration,
        dwell: this.state.currentStep.dwell,
        voice: this.state.currentStep.voice || 'edward',
      },
      elapsed: Date.now() - this.state.startedAt,
    };
  }

  getSequences() {
    return Object.entries(SEQUENCES).map(([id, seq]) => ({
      id,
      name: seq.name,
      description: seq.description,
      stepCount: seq.steps.length,
      duration: seq.steps.reduce((sum, s) => sum + s.dwell, 0),
    }));
  }

  async _runSequence(sequence, signal) {
    const steps = sequence.steps;

    for (let i = 0; i < steps.length; i++) {
      if (signal.aborted) return;

      const step = steps[i];
      this.state.stepIndex = i;
      this.state.currentStep = step;

      // 1. Set mode
      console.log(`[Demo] Step ${i + 1}/${steps.length}: ${step.mode}`);
      try {
        await this.orchestrator.execute(`ha:mode:${step.mode}`);
      } catch (err) {
        console.error(`[Demo] Mode set failed: ${err.message}`);
      }

      // 2. Emit step event (browser will play TTS)
      this._emit({
        type: 'demo:step',
        sequenceId: this.state.sequenceId,
        stepIndex: i,
        totalSteps: steps.length,
        mode: step.mode,
        narration: step.narration,
        voice: step.voice || 'edward',
      });

      // 3. Wait for mode to propagate + dwell time
      await this._wait(step.dwell * 1000, signal);
      if (signal.aborted) return;
    }

    // Sequence complete
    this.state = { running: false };
    this._emit({ type: 'demo:complete', sequenceId: this.state.sequenceId || sequence.name });
    console.log(`[Demo] Sequence complete: ${sequence.name}`);
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

  _emit(msg) {
    if (typeof this.broadcast === 'function') {
      this.broadcast(msg);
    }
  }
}

module.exports = { DemoEngine, SEQUENCES };
