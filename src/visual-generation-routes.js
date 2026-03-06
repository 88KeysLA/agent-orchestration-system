/**
 * Visual Generation Routes - Villa Portal
 * Serves pre-rendered visual assets (video + images) from ~/visual-asset-system
 * and supports on-demand generation via BPM+mood pipeline.
 *
 * Asset naming: {bpm}_{mood}_video.mp4, {bpm}_{mood}_image.png
 * Also serves named assets: /api/visual/local/:name → {name}_video.mp4
 */
const path = require('path');
const fs = require('fs').promises;

const VISUAL_SYSTEM_PATH = path.join(process.env.HOME || '/tmp', 'visual-asset-system');
const OUTPUT_PATH = path.join(VISUAL_SYSTEM_PATH, 'output', 'production');
const CACHE_PATH = path.join(__dirname, '../cache/visuals');

function setupVisualGenerationRoutes(app) {

  // Serve video by cache key (bpm_mood)
  app.get('/api/visual/video/:cacheKey', async (req, res) => {
    const key = req.params.cacheKey;

    // Try cache first, then production output
    for (const dir of [CACHE_PATH, OUTPUT_PATH]) {
      const videoPath = path.join(dir, `${key}_video.mp4`);
      try {
        await fs.access(videoPath);
        res.setHeader('Cache-Control', 'public, max-age=3600');
        return res.sendFile(videoPath);
      } catch {}
    }

    res.status(404).json({ error: 'Visual not found' });
  });

  // Serve named production assets (e.g. /api/visual/local/edm_happy)
  app.get('/api/visual/local/:name', async (req, res) => {
    const localPath = path.join(OUTPUT_PATH, `${req.params.name}_video.mp4`);
    try {
      await fs.access(localPath);
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.sendFile(localPath);
    } catch {
      res.status(404).json({ error: 'Video not found' });
    }
  });

  // List all available visuals (cache + production)
  app.get('/api/visual/cache', async (req, res) => {
    const videos = new Set();

    for (const dir of [CACHE_PATH, OUTPUT_PATH]) {
      try {
        await fs.mkdir(dir, { recursive: true });
        const files = await fs.readdir(dir);
        for (const f of files) {
          if (f.endsWith('_video.mp4')) videos.add(f.replace('_video.mp4', ''));
        }
      } catch {}
    }

    res.json({ cached: Array.from(videos).sort() });
  });

  // Serve image by cache key
  app.get('/api/visual/image/:cacheKey', async (req, res) => {
    const key = req.params.cacheKey;

    for (const dir of [CACHE_PATH, OUTPUT_PATH]) {
      const imgPath = path.join(dir, `${key}_image.png`);
      try {
        await fs.access(imgPath);
        res.setHeader('Cache-Control', 'public, max-age=3600');
        return res.sendFile(imgPath);
      } catch {}
    }

    res.status(404).json({ error: 'Image not found' });
  });
}

module.exports = setupVisualGenerationRoutes;
