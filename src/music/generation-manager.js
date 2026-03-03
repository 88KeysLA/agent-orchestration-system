/**
 * AI Music Generation Manager — Villa Romanza Music Platform
 *
 * Manages generation jobs (Suno, Udio), polls for completion,
 * downloads MP3s, and broadcasts results via callback.
 */
const path = require('path');
const fs = require('fs');

class GenerationManager {
  /**
   * @param {Object} opts
   * @param {import('./music-service').UnifiedMusicService} opts.musicService
   * @param {string} [opts.musicDir] - Directory to store generated MP3s
   * @param {number} [opts.pollInterval=5000] - Poll interval in ms
   * @param {number} [opts.timeout=300000] - Job timeout in ms (5 min)
   * @param {Function} [opts.onComplete] - Called when a job completes: (job) => void
   * @param {Function} [opts.onFailed] - Called when a job fails: (job) => void
   */
  constructor(opts = {}) {
    this.musicService = opts.musicService;
    this.musicDir = opts.musicDir || path.join(process.env.HOME || '/tmp', 'generated-music');
    this.pollInterval = opts.pollInterval || 5000;
    this.timeout = opts.timeout || 300000;
    this.onComplete = opts.onComplete || (() => {});
    this.onFailed = opts.onFailed || (() => {});

    /** @type {Map<string, Object>} jobId → job state */
    this.jobs = new Map();
    this._pollers = new Map();

    // Ensure output directory
    fs.mkdirSync(this.musicDir, { recursive: true });
  }

  /**
   * Start a generation job
   * @param {string} service - Generator name (suno, udio)
   * @param {string} prompt - Text prompt
   * @param {Object} [opts] - Service-specific options
   * @returns {Promise<{ jobId: string, service: string }>}
   */
  async startGeneration(service, prompt, opts = {}) {
    const generator = this.musicService.getGenerator(service);
    if (!generator) throw new Error(`Unknown generator: ${service}`);
    if (!generator.isAvailable()) throw new Error(`${service} is not available`);

    const result = await generator.generate(prompt, opts);
    const jobId = result.jobId;

    const job = {
      jobId,
      service,
      prompt,
      opts,
      status: 'processing',
      createdAt: Date.now(),
      tracks: [],
      error: null,
    };

    this.jobs.set(jobId, job);
    this._startPolling(jobId, generator);

    return { jobId, service };
  }

  /**
   * Get job status
   * @param {string} jobId
   * @returns {Object|null}
   */
  getJob(jobId) {
    return this.jobs.get(jobId) || null;
  }

  /**
   * Get all jobs, newest first
   * @returns {Object[]}
   */
  getAllJobs() {
    return [...this.jobs.values()].sort((a, b) => b.createdAt - a.createdAt);
  }

  /**
   * Get completed tracks with local file paths
   * @returns {Object[]}
   */
  getGeneratedTracks() {
    const tracks = [];
    for (const job of this.jobs.values()) {
      if (job.status !== 'complete') continue;
      for (const track of job.tracks) {
        tracks.push({
          id: track.filename,
          title: track.title || job.prompt.substring(0, 80),
          service: job.service,
          prompt: job.prompt,
          filename: track.filename,
          localPath: track.localPath,
          duration: track.duration,
          imageUrl: track.imageUrl,
          createdAt: job.createdAt,
        });
      }
    }
    return tracks.sort((a, b) => b.createdAt - a.createdAt);
  }

  /** Stop all pollers */
  shutdown() {
    for (const [, timer] of this._pollers) {
      clearInterval(timer);
    }
    this._pollers.clear();
  }

  // --- Internal ---

  _startPolling(jobId, generator) {
    const startTime = Date.now();

    const poll = async () => {
      const job = this.jobs.get(jobId);
      if (!job || job.status !== 'processing') {
        clearInterval(this._pollers.get(jobId));
        this._pollers.delete(jobId);
        return;
      }

      // Check timeout
      if (Date.now() - startTime > this.timeout) {
        job.status = 'failed';
        job.error = 'Generation timed out';
        clearInterval(this._pollers.get(jobId));
        this._pollers.delete(jobId);
        this.onFailed(job);
        return;
      }

      try {
        const status = await generator.getJobStatus(jobId);

        if (status.status === 'complete' && status.tracks?.length > 0) {
          // Download tracks
          const downloadedTracks = [];
          for (const track of status.tracks) {
            try {
              const filename = `${job.service}_${jobId}_${Date.now()}.mp3`;
              const localPath = await generator.downloadTrack(track.audioUrl, filename);
              downloadedTracks.push({
                title: track.title || job.prompt.substring(0, 80),
                filename,
                localPath,
                duration: track.duration,
                imageUrl: track.imageUrl,
              });
            } catch (err) {
              console.error(`[GenMgr] Download failed for ${track.audioUrl}:`, err.message);
            }
          }

          job.status = 'complete';
          job.tracks = downloadedTracks;
          clearInterval(this._pollers.get(jobId));
          this._pollers.delete(jobId);
          this.onComplete(job);
        } else if (status.status === 'failed') {
          job.status = 'failed';
          job.error = status.error || 'Generation failed';
          clearInterval(this._pollers.get(jobId));
          this._pollers.delete(jobId);
          this.onFailed(job);
        }
        // else still processing, continue polling
      } catch (err) {
        console.error(`[GenMgr] Poll error for ${jobId}:`, err.message);
      }
    };

    const timer = setInterval(poll, this.pollInterval);
    this._pollers.set(jobId, timer);
    // Initial poll immediately
    poll();
  }
}

module.exports = { GenerationManager };
