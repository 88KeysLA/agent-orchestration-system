/**
 * Visual Generation Routes - Villa Portal
 * Integrates visual-asset-system for BPM-synced video generation
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const fs = require('fs').promises;

const execAsync = promisify(exec);

const VISUAL_SYSTEM_PATH = path.join(process.env.HOME, 'visual-asset-system');
const OUTPUT_PATH = path.join(VISUAL_SYSTEM_PATH, 'output', 'production');
const CACHE_PATH = path.join(__dirname, '../cache/visuals');

// In-memory generation queue
const generationQueue = new Map();

async function generateVisual(bpm, mood, trackId) {
  const outputName = `track_${trackId}_${bpm}_${mood}`;
  const cacheKey = `${bpm}_${mood}`;
  
  // Check cache first
  const cached = await getCachedVisual(cacheKey);
  if (cached) return cached;
  
  // Generate new
  const cmd = `cd ${VISUAL_SYSTEM_PATH} && npm run generate ${bpm} ${mood} ${outputName}`;
  
  try {
    await execAsync(cmd);
    
    const videoPath = path.join(OUTPUT_PATH, `${outputName}_video.mp4`);
    const imagePath = path.join(OUTPUT_PATH, `${outputName}_image.png`);
    
    // Cache result
    await cacheVisual(cacheKey, videoPath, imagePath);
    
    return {
      videoPath,
      imagePath,
      bpm,
      mood,
      cached: false
    };
  } catch (err) {
    throw new Error(`Generation failed: ${err.message}`);
  }
}

async function getCachedVisual(cacheKey) {
  try {
    await fs.mkdir(CACHE_PATH, { recursive: true });
    const videoPath = path.join(CACHE_PATH, `${cacheKey}_video.mp4`);
    const imagePath = path.join(CACHE_PATH, `${cacheKey}_image.png`);
    
    await fs.access(videoPath);
    await fs.access(imagePath);
    
    return { videoPath, imagePath, cached: true };
  } catch {
    return null;
  }
}

async function cacheVisual(cacheKey, videoPath, imagePath) {
  await fs.mkdir(CACHE_PATH, { recursive: true });
  await fs.copyFile(videoPath, path.join(CACHE_PATH, `${cacheKey}_video.mp4`));
  await fs.copyFile(imagePath, path.join(CACHE_PATH, `${cacheKey}_image.png`));
}

function setupVisualGenerationRoutes(app) {
  // Generate visual for track
  app.post('/api/visual/generate', async (req, res) => {
    const { bpm, mood, trackId } = req.body;
    
    if (!bpm || !mood) {
      return res.status(400).json({ error: 'BPM and mood required' });
    }
    
    const jobId = `${trackId || Date.now()}_${bpm}_${mood}`;
    
    // Check if already generating
    if (generationQueue.has(jobId)) {
      return res.json({ jobId, status: 'queued' });
    }
    
    // Start generation
    generationQueue.set(jobId, { status: 'generating', progress: 0 });
    
    generateVisual(bpm, mood, trackId)
      .then(result => {
        generationQueue.set(jobId, { status: 'complete', result });
      })
      .catch(err => {
        generationQueue.set(jobId, { status: 'failed', error: err.message });
      });
    
    res.json({ jobId, status: 'started' });
  });
  
  // Check generation status
  app.get('/api/visual/status/:jobId', (req, res) => {
    const job = generationQueue.get(req.params.jobId);
    
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    res.json(job);
  });
  
  // Serve cached visual
  app.get('/api/visual/video/:cacheKey', async (req, res) => {
    const videoPath = path.join(CACHE_PATH, `${req.params.cacheKey}_video.mp4`);
    
    try {
      await fs.access(videoPath);
      res.sendFile(videoPath);
    } catch {
      res.status(404).json({ error: 'Visual not found' });
    }
  });
  
  // List cached visuals
  app.get('/api/visual/cache', async (req, res) => {
    try {
      await fs.mkdir(CACHE_PATH, { recursive: true });
      const files = await fs.readdir(CACHE_PATH);
      const videos = files.filter(f => f.endsWith('_video.mp4')).map(f => f.replace('_video.mp4', ''));
      res.json({ cached: videos });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
}

module.exports = setupVisualGenerationRoutes;
