/**
 * Multi-LLM Research Engine
 * Queries 4 LLMs in parallel, assembles best-of-breed response, learns via RL
 */
const SimpleRL = require('./simple-rl');
const MultiObjectiveReward = require('./multi-objective-reward');

class ResearchEngine {
  constructor(orchestrator) {
    this.orc = orchestrator;
    this.rl = new SimpleRL({
      epsilon: 0.15, // Higher exploration for research quality
      persistPath: './data/research-rl.json'
    });
    this.scorer = new MultiObjectiveReward({
      quality: 0.5,    // Research quality is paramount
      relevance: 0.3,  // Must be on-topic
      speed: 0.1,      // Less critical for research
      cost: 0.1        // Optimize but not primary
    });
  }

  /**
   * Execute research task using all 4 LLMs
   * @param {string} topic - Research topic
   * @param {Object} options - depth, format, sources
   * @returns {Object} - Assembled research with citations
   */
  async research(topic, options = {}) {
    const depth = options.depth || 'comprehensive';
    const format = options.format || 'markdown';
    
    console.log(`[Research] Starting: ${topic}`);
    console.log(`[Research] Querying 4 LLMs in parallel...`);
    
    const startTime = Date.now();
    
    // Phase 1: Parallel LLM queries
    const llmPromises = [
      this.queryLLM('claude', topic, depth),
      this.queryLLM('gpt', topic, depth),
      this.queryLLM('gemini', topic, depth),
      this.queryLLM('ollama', topic, depth)
    ];
    
    const results = await Promise.allSettled(llmPromises);
    const responses = results
      .filter(r => r.status === 'fulfilled')
      .map(r => r.value);
    
    console.log(`[Research] Received ${responses.length}/4 responses`);
    
    // Phase 2: Score each response
    const scored = responses.map(resp => ({
      ...resp,
      score: this.scorer.score(resp.content, {
        duration: resp.duration,
        tokens: resp.tokens,
        task: topic
      })
    }));
    
    scored.sort((a, b) => b.score - a.score);
    console.log('[Research] Scores:', scored.map(s => `${s.llm}: ${s.score.toFixed(1)}`));
    
    // Phase 3: Assemble best-of-breed
    const assembled = await this.assemble(topic, scored);
    
    // Phase 4: Update RL
    const totalDuration = Date.now() - startTime;
    scored.forEach(resp => {
      this.rl.update(`research:${topic}`, resp.llm, resp.score);
    });
    
    console.log(`[Research] Complete in ${(totalDuration/1000).toFixed(1)}s`);
    
    return {
      topic,
      content: assembled.content,
      sources: assembled.sources,
      llmContributions: scored.map(s => ({ llm: s.llm, score: s.score })),
      duration: totalDuration,
      quality: assembled.quality
    };
  }

  /**
   * Query single LLM with research prompt
   */
  async queryLLM(llm, topic, depth) {
    const prompt = this.buildPrompt(topic, depth);
    const startTime = Date.now();
    
    try {
      const agent = this.getAgent(llm);
      if (!agent) {
        console.log(`[Research] ${llm} not available, skipping`);
        return null;
      }
      
      const result = await agent.execute({
        messages: [{ role: 'user', content: prompt }]
      });
      
      return {
        llm,
        content: result.content || result,
        duration: Date.now() - startTime,
        tokens: result.tokens || {}
      };
    } catch (error) {
      console.error(`[Research] ${llm} failed:`, error.message);
      return null;
    }
  }

  /**
   * Build research prompt optimized for quality
   */
  buildPrompt(topic, depth) {
    const depthInstructions = {
      quick: 'Provide a concise overview with key points.',
      standard: 'Provide comprehensive coverage with examples and comparisons.',
      comprehensive: 'Provide exhaustive analysis with pros/cons, use cases, benchmarks, and recommendations.'
    };
    
    return `Research Task: ${topic}

Instructions:
- ${depthInstructions[depth]}
- Include specific facts, data, and metrics
- Compare alternatives with objective criteria
- Cite sources where possible
- Provide actionable recommendations
- Use clear structure with headers

Format: Markdown with ## headers, bullet points, and code blocks where relevant.

Begin research:`;
  }

  /**
   * Assemble best-of-breed response from scored LLM outputs
   */
  async assemble(topic, scored) {
    // Use top 2 responses as primary sources
    const primary = scored[0];
    const secondary = scored[1];
    
    console.log(`[Research] Assembling from ${primary.llm} (${primary.score.toFixed(1)}) + ${secondary.llm} (${secondary.score.toFixed(1)})`);
    
    // Extract best sections from each
    const sections = this.extractSections(primary.content);
    const supplemental = this.extractSections(secondary.content);
    
    // Merge: primary structure + supplemental details
    const merged = this.mergeSections(sections, supplemental);
    
    // Add citations
    const sources = this.extractSources(scored);
    
    // Quality assessment
    const quality = this.assessQuality(merged, scored);
    
    return {
      content: this.formatOutput(merged, sources),
      sources,
      quality
    };
  }

  /**
   * Extract sections from markdown content
   */
  extractSections(content) {
    const sections = [];
    const lines = content.split('\n');
    let currentSection = null;
    
    for (const line of lines) {
      if (line.startsWith('##')) {
        if (currentSection) sections.push(currentSection);
        currentSection = { title: line.replace(/^#+\s*/, ''), content: [] };
      } else if (currentSection) {
        currentSection.content.push(line);
      }
    }
    
    if (currentSection) sections.push(currentSection);
    return sections;
  }

  /**
   * Merge sections: primary structure + supplemental details
   */
  mergeSections(primary, supplemental) {
    const merged = [...primary];
    
    // Add unique sections from supplemental
    for (const suppSection of supplemental) {
      const exists = merged.find(s => 
        s.title.toLowerCase().includes(suppSection.title.toLowerCase()) ||
        suppSection.title.toLowerCase().includes(s.title.toLowerCase())
      );
      
      if (!exists) {
        merged.push(suppSection);
      } else {
        // Merge content if section exists
        const uniqueLines = suppSection.content.filter(line => 
          !exists.content.some(existingLine => 
            existingLine.trim() === line.trim()
          )
        );
        exists.content.push(...uniqueLines);
      }
    }
    
    return merged;
  }

  /**
   * Extract source citations from LLM responses
   */
  extractSources(scored) {
    const sources = [];
    
    for (const resp of scored) {
      // Extract URLs, citations, references
      const urls = resp.content.match(/https?:\/\/[^\s)]+/g) || [];
      sources.push(...urls);
    }
    
    return [...new Set(sources)]; // Deduplicate
  }

  /**
   * Assess overall research quality
   */
  assessQuality(merged, scored) {
    const metrics = {
      depth: merged.length, // Number of sections
      avgScore: scored.reduce((sum, s) => sum + s.score, 0) / scored.length,
      consensus: this.calculateConsensus(scored),
      completeness: this.checkCompleteness(merged)
    };
    
    // Overall quality score (0-100)
    const quality = (
      (Math.min(metrics.depth / 8, 1) * 25) +  // Depth: 8+ sections = full points
      (metrics.avgScore / 100 * 40) +           // Avg LLM score
      (metrics.consensus * 20) +                // Agreement between LLMs
      (metrics.completeness * 15)               // Has key sections
    );
    
    return {
      score: Math.round(quality),
      metrics
    };
  }

  /**
   * Calculate consensus between LLM responses
   */
  calculateConsensus(scored) {
    if (scored.length < 2) return 0;
    
    // Compare top 2 responses for similar content
    const top1 = scored[0].content.toLowerCase();
    const top2 = scored[1].content.toLowerCase();
    
    // Simple word overlap metric
    const words1 = new Set(top1.split(/\s+/).filter(w => w.length > 4));
    const words2 = new Set(top2.split(/\s+/).filter(w => w.length > 4));
    
    const intersection = [...words1].filter(w => words2.has(w)).length;
    const union = new Set([...words1, ...words2]).size;
    
    return intersection / union; // Jaccard similarity
  }

  /**
   * Check for key research sections
   */
  checkCompleteness(sections) {
    const required = ['overview', 'comparison', 'recommendation', 'conclusion'];
    const titles = sections.map(s => s.title.toLowerCase()).join(' ');
    
    const found = required.filter(keyword => titles.includes(keyword)).length;
    return found / required.length;
  }

  /**
   * Format final output with citations
   */
  formatOutput(sections, sources) {
    let output = '';
    
    for (const section of sections) {
      output += `## ${section.title}\n\n`;
      output += section.content.join('\n') + '\n\n';
    }
    
    if (sources.length > 0) {
      output += '## Sources\n\n';
      sources.forEach((source, i) => {
        output += `${i + 1}. ${source}\n`;
      });
    }
    
    return output;
  }

  /**
   * Get agent by LLM name
   */
  getAgent(llm) {
    const agentMap = {
      claude: 'claude',
      gpt: 'openai',
      gemini: 'gemini',
      ollama: 'ollama'
    };
    
    const agentName = agentMap[llm];
    return this.orc.registry?.agents.get(agentName);
  }

  /**
   * Get RL stats for research tasks
   */
  getStats() {
    return this.rl.getStats().filter(s => s.key.startsWith('research:'));
  }
}

module.exports = ResearchEngine;
