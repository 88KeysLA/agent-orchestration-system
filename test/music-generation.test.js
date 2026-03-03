/**
 * AI Music Generation Tests (Suno, Udio, Amazon AI, GenerationManager)
 * Uses mocked fetch — no API keys or network needed
 */
const { SunoAdapter } = require('../src/music/suno-adapter');
const { UdioAdapter } = require('../src/music/udio-adapter');
const { AmazonAIAdapter } = require('../src/music/amazon-ai-adapter');
const { GenerationManager } = require('../src/music/generation-manager');
const { UnifiedMusicService } = require('../src/music/music-service');
const fs = require('fs');
const path = require('path');
const os = require('os');

let passed = 0;
let failed = 0;
const originalFetch = global.fetch;

function test(name, fn) {
  return fn().then(() => {
    console.log(`\u2705 ${name}`);
    passed++;
  }).catch(err => {
    console.log(`\u274c ${name}: ${err.message}`);
    failed++;
  }).finally(() => {
    global.fetch = originalFetch;
  });
}

function mockFetch(responseBody, status = 200) {
  global.fetch = async (url, opts) => ({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: async () => responseBody,
    text: async () => JSON.stringify(responseBody),
  });
}

// --- Suno adapter tests ---

async function testSunoUnavailableWithoutKey() {
  const suno = new SunoAdapter({});
  if (suno.isAvailable()) throw new Error('Should be unavailable without API key');
}

async function testSunoAvailableWithKey() {
  const suno = new SunoAdapter({ apiKey: 'test-key-123' });
  if (!suno.isAvailable()) throw new Error('Should be available with API key');
}

async function testSunoGenerateRequestFormat() {
  let capturedUrl, capturedOpts;
  global.fetch = async (url, opts) => {
    capturedUrl = url;
    capturedOpts = opts;
    return {
      ok: true,
      status: 200,
      json: async () => ({ data: { taskId: 'suno-task-42' } }),
      text: async () => '{}',
    };
  };

  const suno = new SunoAdapter({ apiKey: 'test-key' });
  const result = await suno.generate('ambient piano for late evening', { style: 'ambient', instrumental: true });

  if (result.jobId !== 'suno-task-42') throw new Error(`Wrong jobId: ${result.jobId}`);
  if (!capturedUrl.includes('apibox.erweima.ai')) throw new Error(`Wrong URL: ${capturedUrl}`);

  const body = JSON.parse(capturedOpts.body);
  if (body.prompt !== 'ambient piano for late evening') throw new Error(`Wrong prompt: ${body.prompt}`);
  if (body.style !== 'ambient') throw new Error(`Wrong style: ${body.style}`);
  if (body.instrumental !== true) throw new Error('instrumental should be true');
  if (body.customMode !== true) throw new Error('customMode should be true when style set');
  if (body.model !== 'V4') throw new Error(`Wrong model: ${body.model}`);
  if (capturedOpts.headers['Authorization'] !== 'Bearer test-key') throw new Error('Wrong auth header');
}

async function testSunoJobStatusMapsSuccess() {
  mockFetch({
    data: {
      status: 'SUCCESS',
      tracks: [
        { title: 'Evening Glow', audioUrl: 'https://cdn.suno.ai/track.mp3', duration: 120 },
      ],
    },
  });

  const suno = new SunoAdapter({ apiKey: 'test-key' });
  const result = await suno.getJobStatus('suno-task-42');

  if (result.status !== 'complete') throw new Error(`Wrong status: ${result.status}`);
  if (result.tracks.length !== 1) throw new Error(`Wrong track count: ${result.tracks.length}`);
  if (result.tracks[0].title !== 'Evening Glow') throw new Error(`Wrong title: ${result.tracks[0].title}`);
  if (result.tracks[0].audioUrl !== 'https://cdn.suno.ai/track.mp3') throw new Error('Wrong audioUrl');
  if (result.tracks[0].duration !== 120) throw new Error(`Wrong duration: ${result.tracks[0].duration}`);
}

async function testSunoSearchReturnsEmpty() {
  const suno = new SunoAdapter({ apiKey: 'test-key' });
  const results = await suno.search('anything');
  if (!Array.isArray(results) || results.length !== 0) {
    throw new Error('search() should return empty array for generation-only adapter');
  }
}

// --- Udio adapter tests ---

async function testUdioUnavailableWithoutKey() {
  const udio = new UdioAdapter({});
  if (udio.isAvailable()) throw new Error('Should be unavailable without API key');
}

async function testUdioGenerateRequestFormat() {
  let capturedUrl, capturedOpts;
  global.fetch = async (url, opts) => {
    capturedUrl = url;
    capturedOpts = opts;
    return {
      ok: true,
      status: 200,
      json: async () => ({ data: { id: 'udio-job-99' } }),
      text: async () => '{}',
    };
  };

  const udio = new UdioAdapter({ apiKey: 'udio-key' });
  const result = await udio.generate('cinematic orchestral score', { style: 'cinematic', duration: 60 });

  if (result.jobId !== 'udio-job-99') throw new Error(`Wrong jobId: ${result.jobId}`);
  if (!capturedUrl.includes('udioapi.pro')) throw new Error(`Wrong URL: ${capturedUrl}`);

  const body = JSON.parse(capturedOpts.body);
  if (body.prompt !== 'cinematic orchestral score') throw new Error(`Wrong prompt: ${body.prompt}`);
  if (body.model !== 'udio-v1.5') throw new Error(`Wrong model: ${body.model}`);
  if (body.duration !== 60) throw new Error(`Wrong duration: ${body.duration}`);
  if (body.style !== 'cinematic') throw new Error(`Wrong style: ${body.style}`);
  if (capturedOpts.headers['Authorization'] !== 'Bearer udio-key') throw new Error('Wrong auth header');
}

async function testUdioJobStatusMapsCorrectly() {
  // Test PROCESSING -> processing
  mockFetch({ data: { status: 'PROCESSING', tracks: [] } });
  const udio = new UdioAdapter({ apiKey: 'udio-key' });
  let result = await udio.getJobStatus('job-1');
  if (result.status !== 'processing') throw new Error(`PROCESSING should map to processing, got: ${result.status}`);

  // Test PENDING -> processing
  mockFetch({ data: { status: 'PENDING', tracks: [] } });
  result = await udio.getJobStatus('job-2');
  if (result.status !== 'processing') throw new Error(`PENDING should map to processing, got: ${result.status}`);

  // Test SUCCESS -> complete
  mockFetch({
    data: {
      status: 'SUCCESS',
      tracks: [{ title: 'Score', audio_url: 'https://cdn.udio.com/t.mp3', duration: 60 }],
    },
  });
  result = await udio.getJobStatus('job-3');
  if (result.status !== 'complete') throw new Error(`SUCCESS should map to complete, got: ${result.status}`);
  if (result.tracks.length !== 1) throw new Error(`Wrong track count: ${result.tracks.length}`);
  if (result.tracks[0].audioUrl !== 'https://cdn.udio.com/t.mp3') throw new Error('audio_url not mapped');

  // Test unknown -> failed
  mockFetch({ data: { status: 'CANCELLED' } });
  result = await udio.getJobStatus('job-4');
  if (result.status !== 'failed') throw new Error(`Unknown status should map to failed, got: ${result.status}`);
}

// --- Amazon AI stub tests ---

async function testAmazonAIUnavailable() {
  const amazon = new AmazonAIAdapter();
  if (amazon.isAvailable()) throw new Error('Amazon AI should not be available (stub)');
  if (amazon.name !== 'amazon_ai') throw new Error(`Wrong name: ${amazon.name}`);
}

async function testAmazonAIGenerateReturnsEmpty() {
  const amazon = new AmazonAIAdapter();
  const result = await amazon.generate('anything');
  // Stub returns empty object (no jobId)
  if (result.jobId) throw new Error('Stub should not return a jobId');
}

// --- GenerationManager tests ---

/**
 * Creates a mock generator adapter that resolves immediately.
 */
function createMockGenerator(name, { jobId = 'mock-job-1', statusSequence } = {}) {
  let pollCount = 0;
  const sequence = statusSequence || [{ status: 'complete', tracks: [{ title: 'Mock Track', audioUrl: 'http://mock/track.mp3', duration: 30 }] }];

  return {
    name,
    displayName: name.charAt(0).toUpperCase() + name.slice(1),
    isAvailable: () => true,
    generate: async (prompt, opts) => ({ jobId }),
    getJobStatus: async (id) => {
      const idx = Math.min(pollCount, sequence.length - 1);
      pollCount++;
      return sequence[idx];
    },
    downloadTrack: async (url, filename) => {
      const dir = path.join(os.tmpdir(), 'villa-test-music');
      fs.mkdirSync(dir, { recursive: true });
      const filePath = path.join(dir, filename);
      fs.writeFileSync(filePath, 'fake-mp3-data');
      return filePath;
    },
    search: async () => [],
  };
}

function createTestManager(generator, overrides = {}) {
  const musicService = new UnifiedMusicService();
  musicService.registerGenerator(generator);
  const musicDir = path.join(os.tmpdir(), 'villa-test-music-' + Date.now());
  return new GenerationManager({
    musicService,
    musicDir,
    pollInterval: 50,
    timeout: overrides.timeout || 5000,
    onComplete: overrides.onComplete || (() => {}),
    onFailed: overrides.onFailed || (() => {}),
  });
}

async function testStartGenerationCreatesJob() {
  const generator = createMockGenerator('mock');
  const manager = createTestManager(generator);

  try {
    const result = await manager.startGeneration('mock', 'test prompt');

    if (!result.jobId) throw new Error('startGeneration should return jobId');
    if (result.jobId !== 'mock-job-1') throw new Error(`Wrong jobId: ${result.jobId}`);
    if (result.service !== 'mock') throw new Error(`Wrong service: ${result.service}`);

    const job = manager.getJob('mock-job-1');
    if (!job) throw new Error('Job should exist after startGeneration');
    if (job.prompt !== 'test prompt') throw new Error(`Wrong prompt: ${job.prompt}`);
  } finally {
    manager.shutdown();
  }
}

async function testGetJobReturnsById() {
  const generator = createMockGenerator('mock');
  const manager = createTestManager(generator);

  try {
    await manager.startGeneration('mock', 'find me');

    const found = manager.getJob('mock-job-1');
    if (!found) throw new Error('getJob should find existing job');
    if (found.prompt !== 'find me') throw new Error(`Wrong prompt: ${found.prompt}`);

    const missing = manager.getJob('nonexistent');
    if (missing !== null) throw new Error('getJob should return null for unknown id');
  } finally {
    manager.shutdown();
  }
}

async function testGetAllJobsSortedNewestFirst() {
  const musicService = new UnifiedMusicService();

  const gen1 = createMockGenerator('gen1', { jobId: 'job-a' });
  const gen2 = createMockGenerator('gen2', { jobId: 'job-b' });
  musicService.registerGenerator(gen1);
  musicService.registerGenerator(gen2);

  const musicDir = path.join(os.tmpdir(), 'villa-test-music-' + Date.now());
  const manager = new GenerationManager({
    musicService,
    musicDir,
    pollInterval: 50,
    timeout: 5000,
  });

  try {
    await manager.startGeneration('gen1', 'first');
    // Small delay so createdAt differs
    await new Promise(r => setTimeout(r, 10));
    await manager.startGeneration('gen2', 'second');

    const all = manager.getAllJobs();
    if (all.length !== 2) throw new Error(`Expected 2 jobs, got ${all.length}`);
    if (all[0].prompt !== 'second') throw new Error('Newest job should be first');
    if (all[1].prompt !== 'first') throw new Error('Oldest job should be last');
  } finally {
    manager.shutdown();
  }
}

async function testJobTimeoutAfterDuration() {
  const generator = createMockGenerator('mock', {
    jobId: 'timeout-job',
    statusSequence: [{ status: 'processing', tracks: [] }], // Never completes
  });

  let failedJob = null;
  const manager = createTestManager(generator, {
    timeout: 100, // Very short timeout for test
    onFailed: (job) => { failedJob = job; },
  });

  try {
    await manager.startGeneration('mock', 'will timeout');

    // Wait for timeout + poll cycles
    await new Promise(r => setTimeout(r, 300));

    const job = manager.getJob('timeout-job');
    if (!job) throw new Error('Job should still exist after timeout');
    if (job.status !== 'failed') throw new Error(`Expected failed status, got: ${job.status}`);
    if (job.error !== 'Generation timed out') throw new Error(`Wrong error: ${job.error}`);
    if (!failedJob) throw new Error('onFailed callback should have been called');
  } finally {
    manager.shutdown();
  }
}

async function testGetGeneratedTracksEmptyWhenNoComplete() {
  const generator = createMockGenerator('mock', {
    jobId: 'pending-job',
    statusSequence: [{ status: 'processing', tracks: [] }],
  });
  const manager = createTestManager(generator);

  try {
    await manager.startGeneration('mock', 'still processing');

    const tracks = manager.getGeneratedTracks();
    if (!Array.isArray(tracks)) throw new Error('getGeneratedTracks should return array');
    if (tracks.length !== 0) throw new Error(`Expected 0 tracks, got: ${tracks.length}`);
  } finally {
    manager.shutdown();
  }
}

// --- Run all tests ---

(async () => {
  console.log('Testing AI Music Generation...\n');

  // Suno adapter
  await test('Suno: isAvailable returns false without API key', testSunoUnavailableWithoutKey);
  await test('Suno: isAvailable returns true with API key', testSunoAvailableWithKey);
  await test('Suno: generate sends correct request format', testSunoGenerateRequestFormat);
  await test('Suno: getJobStatus maps SUCCESS to complete', testSunoJobStatusMapsSuccess);
  await test('Suno: search returns empty (generation-only)', testSunoSearchReturnsEmpty);

  // Udio adapter
  await test('Udio: isAvailable returns false without API key', testUdioUnavailableWithoutKey);
  await test('Udio: generate sends correct request format', testUdioGenerateRequestFormat);
  await test('Udio: getJobStatus maps statuses correctly', testUdioJobStatusMapsCorrectly);

  // Amazon AI stub
  await test('Amazon AI: isAvailable returns false (stub)', testAmazonAIUnavailable);
  await test('Amazon AI: generate returns empty/no jobId', testAmazonAIGenerateReturnsEmpty);

  // GenerationManager
  await test('GenerationManager: startGeneration creates job and returns jobId', testStartGenerationCreatesJob);
  await test('GenerationManager: getJob returns job by id', testGetJobReturnsById);
  await test('GenerationManager: getAllJobs sorted newest first', testGetAllJobsSortedNewestFirst);
  await test('GenerationManager: job timeout after configured duration', testJobTimeoutAfterDuration);
  await test('GenerationManager: getGeneratedTracks empty when no complete jobs', testGetGeneratedTracksEmptyWhenNoComplete);

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed === 0) {
    console.log('\u2705 All music generation tests passed!\n');
    process.exit(0);
  } else {
    console.log('\u274c Some tests failed\n');
    process.exit(1);
  }
})();
