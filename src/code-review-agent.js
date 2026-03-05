/**
 * Code Review Agent - Continuous debugging and optimization
 * Uses specialist agents and alternate LLMs for comprehensive review
 */
const fs = require('fs').promises;
const path = require('path');

class CodeReviewAgent {
  constructor(orchestrator) {
    this.orc = orchestrator;
    this.reviewHistory = new Map(); // file -> last review timestamp
    this.issuesFound = [];
  }

  /**
   * Review code file with multiple specialist perspectives
   */
  async reviewFile(filepath, options = {}) {
    console.log(`[CodeReview] Analyzing: ${filepath}`);
    
    const code = await fs.readFile(filepath, 'utf8');
    const fileInfo = {
      path: filepath,
      lines: code.split('\n').length,
      size: code.length,
      language: this.detectLanguage(filepath)
    };
    
    // Run parallel reviews from different perspectives
    const reviews = await Promise.allSettled([
      this.securityReview(code, fileInfo),
      this.performanceReview(code, fileInfo),
      this.maintainabilityReview(code, fileInfo),
      this.bugDetection(code, fileInfo)
    ]);
    
    const findings = reviews
      .filter(r => r.status === 'fulfilled')
      .map(r => r.value)
      .flat();
    
    // Aggregate and prioritize
    const report = this.aggregateFindings(findings, fileInfo);
    
    // Store for tracking
    this.reviewHistory.set(filepath, Date.now());
    this.issuesFound.push(...report.issues);
    
    return report;
  }

  /**
   * Security review using Claude (best for security analysis)
   */
  async securityReview(code, fileInfo) {
    const prompt = `Security Review: ${fileInfo.path}

Analyze this ${fileInfo.language} code for security vulnerabilities:
- SQL injection risks
- XSS vulnerabilities
- Authentication/authorization issues
- Sensitive data exposure
- Input validation gaps
- Cryptographic weaknesses

Code:
\`\`\`${fileInfo.language}
${code}
\`\`\`

Return JSON array of issues:
[{"severity": "high|medium|low", "line": number, "issue": "description", "fix": "recommendation"}]`;

    try {
      const agent = this.orc.registry?.agents.get('claude');
      if (!agent) return [];
      
      const result = await agent.execute({
        messages: [{ role: 'user', content: prompt }]
      });
      
      return this.parseIssues(result, 'security');
    } catch (error) {
      console.error('[CodeReview] Security review failed:', error.message);
      return [];
    }
  }

  /**
   * Performance review using GPT (good for optimization)
   */
  async performanceReview(code, fileInfo) {
    const prompt = `Performance Review: ${fileInfo.path}

Analyze this ${fileInfo.language} code for performance issues:
- Inefficient algorithms (O(n²) → O(n log n))
- Memory leaks
- Unnecessary loops or iterations
- Database query optimization
- Caching opportunities
- Async/await improvements

Code:
\`\`\`${fileInfo.language}
${code}
\`\`\`

Return JSON array of issues:
[{"severity": "high|medium|low", "line": number, "issue": "description", "fix": "recommendation"}]`;

    try {
      const agent = this.orc.registry?.agents.get('openai');
      if (!agent) return [];
      
      const result = await agent.execute({
        messages: [{ role: 'user', content: prompt }]
      });
      
      return this.parseIssues(result, 'performance');
    } catch (error) {
      console.error('[CodeReview] Performance review failed:', error.message);
      return [];
    }
  }

  /**
   * Maintainability review using Gemini
   */
  async maintainabilityReview(code, fileInfo) {
    const prompt = `Maintainability Review: ${fileInfo.path}

Analyze this ${fileInfo.language} code for maintainability:
- Code complexity (cyclomatic complexity)
- Function length (should be < 50 lines)
- Naming clarity
- Documentation gaps
- DRY violations (repeated code)
- SOLID principle violations
- Error handling completeness

Code:
\`\`\`${fileInfo.language}
${code}
\`\`\`

Return JSON array of issues:
[{"severity": "high|medium|low", "line": number, "issue": "description", "fix": "recommendation"}]`;

    try {
      const agent = this.orc.registry?.agents.get('gemini');
      if (!agent) return [];
      
      const result = await agent.execute({
        messages: [{ role: 'user', content: prompt }]
      });
      
      return this.parseIssues(result, 'maintainability');
    } catch (error) {
      console.error('[CodeReview] Maintainability review failed:', error.message);
      return [];
    }
  }

  /**
   * Bug detection using Ollama (fast, local)
   */
  async bugDetection(code, fileInfo) {
    const prompt = `Bug Detection: ${fileInfo.path}

Find potential bugs in this ${fileInfo.language} code:
- Null/undefined reference errors
- Off-by-one errors
- Race conditions
- Resource leaks
- Logic errors
- Edge case handling

Code:
\`\`\`${fileInfo.language}
${code}
\`\`\`

Return JSON array of issues:
[{"severity": "high|medium|low", "line": number, "issue": "description", "fix": "recommendation"}]`;

    try {
      const agent = this.orc.registry?.agents.get('ollama');
      if (!agent) return [];
      
      const result = await agent.execute({
        messages: [{ role: 'user', content: prompt }]
      });
      
      return this.parseIssues(result, 'bug');
    } catch (error) {
      console.error('[CodeReview] Bug detection failed:', error.message);
      return [];
    }
  }

  /**
   * Parse LLM response into structured issues
   */
  parseIssues(result, category) {
    try {
      const content = result.content || result;
      
      // Try to extract JSON array
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const issues = JSON.parse(jsonMatch[0]);
        return issues.map(issue => ({
          ...issue,
          category,
          timestamp: Date.now()
        }));
      }
      
      // Fallback: parse markdown list
      const lines = content.split('\n');
      const issues = [];
      
      for (const line of lines) {
        if (line.match(/^[-*]\s/)) {
          issues.push({
            severity: 'medium',
            line: 0,
            issue: line.replace(/^[-*]\s/, ''),
            fix: 'Review manually',
            category,
            timestamp: Date.now()
          });
        }
      }
      
      return issues;
    } catch (error) {
      console.error('[CodeReview] Parse failed:', error.message);
      return [];
    }
  }

  /**
   * Aggregate findings and prioritize
   */
  aggregateFindings(findings, fileInfo) {
    // Deduplicate similar issues
    const unique = this.deduplicateIssues(findings);
    
    // Sort by severity
    const prioritized = unique.sort((a, b) => {
      const severityOrder = { high: 3, medium: 2, low: 1 };
      return severityOrder[b.severity] - severityOrder[a.severity];
    });
    
    // Calculate quality score
    const qualityScore = this.calculateQualityScore(prioritized, fileInfo);
    
    return {
      file: fileInfo.path,
      timestamp: Date.now(),
      issues: prioritized,
      summary: {
        total: prioritized.length,
        high: prioritized.filter(i => i.severity === 'high').length,
        medium: prioritized.filter(i => i.severity === 'medium').length,
        low: prioritized.filter(i => i.severity === 'low').length,
        categories: this.groupByCategory(prioritized)
      },
      qualityScore,
      recommendations: this.generateRecommendations(prioritized)
    };
  }

  /**
   * Deduplicate similar issues
   */
  deduplicateIssues(issues) {
    const seen = new Map();
    
    for (const issue of issues) {
      const key = `${issue.line}-${issue.issue.substring(0, 50)}`;
      if (!seen.has(key)) {
        seen.set(key, issue);
      }
    }
    
    return Array.from(seen.values());
  }

  /**
   * Calculate code quality score (0-100)
   */
  calculateQualityScore(issues, fileInfo) {
    let score = 100;
    
    // Deduct points for issues
    for (const issue of issues) {
      switch (issue.severity) {
        case 'high': score -= 10; break;
        case 'medium': score -= 5; break;
        case 'low': score -= 2; break;
      }
    }
    
    // Bonus for small files (easier to maintain)
    if (fileInfo.lines < 200) score += 5;
    
    return Math.max(0, Math.min(100, score));
  }

  /**
   * Group issues by category
   */
  groupByCategory(issues) {
    const groups = {};
    
    for (const issue of issues) {
      if (!groups[issue.category]) {
        groups[issue.category] = 0;
      }
      groups[issue.category]++;
    }
    
    return groups;
  }

  /**
   * Generate actionable recommendations
   */
  generateRecommendations(issues) {
    const recs = [];
    
    // High severity issues first
    const highIssues = issues.filter(i => i.severity === 'high');
    if (highIssues.length > 0) {
      recs.push(`Address ${highIssues.length} high-severity issues immediately`);
    }
    
    // Category-specific recommendations
    const categories = this.groupByCategory(issues);
    
    if (categories.security > 0) {
      recs.push('Run security audit and add input validation');
    }
    
    if (categories.performance > 3) {
      recs.push('Profile code and optimize hot paths');
    }
    
    if (categories.maintainability > 5) {
      recs.push('Refactor for better code organization');
    }
    
    return recs;
  }

  /**
   * Detect programming language from file extension
   */
  detectLanguage(filepath) {
    const ext = path.extname(filepath);
    const langMap = {
      '.js': 'javascript',
      '.ts': 'typescript',
      '.py': 'python',
      '.java': 'java',
      '.go': 'go',
      '.rs': 'rust',
      '.cpp': 'cpp',
      '.c': 'c'
    };
    return langMap[ext] || 'text';
  }

  /**
   * Review entire directory
   */
  async reviewDirectory(dirPath, options = {}) {
    const exclude = options.exclude || ['node_modules', 'dist', 'build', '.git'];
    const extensions = options.extensions || ['.js', '.ts', '.py'];
    
    console.log(`[CodeReview] Scanning directory: ${dirPath}`);
    
    const files = await this.findFiles(dirPath, extensions, exclude);
    console.log(`[CodeReview] Found ${files.length} files to review`);
    
    const reports = [];
    
    for (const file of files) {
      try {
        const report = await this.reviewFile(file);
        reports.push(report);
        
        // Log progress
        if (report.issues.length > 0) {
          console.log(`[CodeReview] ${file}: ${report.issues.length} issues (score: ${report.qualityScore})`);
        }
      } catch (error) {
        console.error(`[CodeReview] Failed to review ${file}:`, error.message);
      }
    }
    
    return this.generateDirectoryReport(reports);
  }

  /**
   * Find files recursively
   */
  async findFiles(dirPath, extensions, exclude) {
    const files = [];
    
    async function scan(dir) {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        
        if (entry.isDirectory()) {
          if (!exclude.includes(entry.name)) {
            await scan(fullPath);
          }
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name);
          if (extensions.includes(ext)) {
            files.push(fullPath);
          }
        }
      }
    }
    
    await scan(dirPath);
    return files;
  }

  /**
   * Generate directory-level report
   */
  generateDirectoryReport(reports) {
    const totalIssues = reports.reduce((sum, r) => sum + r.issues.length, 0);
    const avgScore = reports.reduce((sum, r) => sum + r.qualityScore, 0) / reports.length;
    
    const byCategory = {};
    const bySeverity = { high: 0, medium: 0, low: 0 };
    
    for (const report of reports) {
      for (const issue of report.issues) {
        byCategory[issue.category] = (byCategory[issue.category] || 0) + 1;
        bySeverity[issue.severity]++;
      }
    }
    
    return {
      timestamp: Date.now(),
      filesReviewed: reports.length,
      totalIssues,
      averageQualityScore: Math.round(avgScore),
      bySeverity,
      byCategory,
      topIssues: this.getTopIssues(reports, 10),
      reports
    };
  }

  /**
   * Get top N issues across all files
   */
  getTopIssues(reports, n) {
    const allIssues = reports.flatMap(r => 
      r.issues.map(issue => ({ ...issue, file: r.file }))
    );
    
    return allIssues
      .sort((a, b) => {
        const severityOrder = { high: 3, medium: 2, low: 1 };
        return severityOrder[b.severity] - severityOrder[a.severity];
      })
      .slice(0, n);
  }
}

module.exports = CodeReviewAgent;
