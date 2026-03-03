/**
 * ImagenAgent - Google Imagen + Gemini native image generation
 * Lazy-loads @google/genai so this module is safe to import without the package
 *
 * Two modes:
 *   - Imagen 4: Dedicated image gen model (generateImages API)
 *   - Gemini native: Text+image multimodal output (generateContent with image model)
 *
 * Usage via orchestrator:
 *   "imagen:a sunset over Villa Romanza"
 *   "imagen:edit:make this more dramatic" (future: with image input)
 */
const path = require('path');
const fs = require('fs');

class ImagenAgent {
  constructor(options = {}) {
    this.apiKey = options.apiKey || process.env.GEMINI_API_KEY;
    this.imagenModel = options.imagenModel || 'imagen-4.0-generate-001';
    this.geminiImageModel = options.geminiImageModel || 'gemini-2.5-flash-preview-image-generation';
    this.outputDir = options.outputDir || path.join(process.env.HOME || '/tmp', 'generated-images');
    this.numberOfImages = options.numberOfImages || 1;
    this.aspectRatio = options.aspectRatio || '16:9';
    this.lastUsage = null;
    this._ai = null;

    // Ensure output dir exists
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  _getAI() {
    if (!this._ai) {
      const { GoogleGenAI } = require('@google/genai');
      this._ai = new GoogleGenAI({ apiKey: this.apiKey });
    }
    return this._ai;
  }

  /**
   * Generate a unique filename with timestamp
   */
  _filename(prefix, idx) {
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    return `${prefix}-${ts}-${idx}.png`;
  }

  /**
   * Parse task for mode and parameters
   * Formats:
   *   "a sunset painting"                    -> Imagen generation
   *   "gemini:a cat on a skateboard"         -> Gemini native image gen
   *   "aspect:9:16 a portrait photo"         -> Custom aspect ratio
   *   "count:4 multiple variations of..."    -> Multiple images
   */
  _parseTask(task) {
    let mode = 'imagen';
    let prompt = task;
    let aspectRatio = this.aspectRatio;
    let count = this.numberOfImages;

    // Check for gemini native mode
    if (prompt.startsWith('gemini:')) {
      mode = 'gemini';
      prompt = prompt.slice(7).trim();
    }

    // Check for aspect ratio override
    const aspectMatch = prompt.match(/^aspect:(\d+:\d+)\s+/);
    if (aspectMatch) {
      aspectRatio = aspectMatch[1];
      prompt = prompt.slice(aspectMatch[0].length);
    }

    // Check for count override
    const countMatch = prompt.match(/^count:(\d+)\s+/);
    if (countMatch) {
      count = Math.min(parseInt(countMatch[1]), 4);
      prompt = prompt.slice(countMatch[0].length);
    }

    return { mode, prompt, aspectRatio, count };
  }

  /**
   * Generate images using Imagen 4
   */
  async _generateImagen(prompt, aspectRatio, count) {
    const ai = this._getAI();

    const response = await ai.models.generateImages({
      model: this.imagenModel,
      prompt,
      config: {
        numberOfImages: count,
        aspectRatio
      }
    });

    const saved = [];
    let idx = 1;
    for (const genImage of (response.generatedImages || [])) {
      const imgBytes = genImage.image.imageBytes;
      const buffer = Buffer.from(imgBytes, 'base64');
      const filename = this._filename('imagen', idx);
      const filepath = path.join(this.outputDir, filename);
      fs.writeFileSync(filepath, buffer);
      saved.push(filepath);
      idx++;
    }

    return saved;
  }

  /**
   * Generate image using Gemini native multimodal output
   */
  async _generateGemini(prompt) {
    const ai = this._getAI();

    const response = await ai.models.generateContent({
      model: this.geminiImageModel,
      contents: prompt,
      config: {
        responseModalities: ['TEXT', 'IMAGE']
      }
    });

    const saved = [];
    let text = '';
    let idx = 1;

    const parts = response.candidates?.[0]?.content?.parts || [];
    for (const part of parts) {
      if (part.text) {
        text += part.text + '\n';
      } else if (part.inlineData) {
        const buffer = Buffer.from(part.inlineData.data, 'base64');
        const filename = this._filename('gemini-img', idx);
        const filepath = path.join(this.outputDir, filename);
        fs.writeFileSync(filepath, buffer);
        saved.push(filepath);
        idx++;
      }
    }

    return { saved, text: text.trim() };
  }

  async execute(task) {
    const { mode, prompt, aspectRatio, count } = this._parseTask(task);

    try {
      if (mode === 'gemini') {
        const { saved, text } = await this._generateGemini(prompt);
        this.lastUsage = { mode: 'gemini-native', images: saved.length };

        if (saved.length === 0) {
          return text || 'No image generated. Try a different prompt.';
        }

        const paths = saved.map(p => `  ${p}`).join('\n');
        return `Generated ${saved.length} image(s) via Gemini native:\n${paths}${text ? '\n\n' + text : ''}`;
      }

      // Default: Imagen
      const saved = await this._generateImagen(prompt, aspectRatio, count);
      this.lastUsage = { mode: 'imagen', images: saved.length, aspectRatio };

      if (saved.length === 0) {
        return 'No images generated. The prompt may have been filtered. Try a different prompt.';
      }

      const paths = saved.map(p => `  ${p}`).join('\n');
      return `Generated ${saved.length} image(s) via Imagen 4 (${aspectRatio}):\n${paths}`;
    } catch (err) {
      this.lastUsage = { mode, error: err.message };
      return `Image generation failed: ${err.message}`;
    }
  }

  async healthCheck() {
    if (!this.apiKey) return false;
    try {
      this._getAI();
      return true;
    } catch {
      return false;
    }
  }
}

module.exports = ImagenAgent;
