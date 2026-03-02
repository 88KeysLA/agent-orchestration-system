#!/usr/bin/env node

/**
 * Meta-Agent Routing System
 * Intelligently selects optimal agent(s) based on task analysis
 */

const agentRules = {
  // Task type detection with scoring
  taskTypes: {
    bugFix: {
      keywords: ['bug', 'fix', 'error', 'broken', 'issue', 'problem', 'crash', 'fail'],
      agents: ['prreddy-debugger', 'gpu-dev'],
      pattern: 'Quick Fix',
      priority: 'high'
    },
    debugging: {
      keywords: ['debug', 'diagnose', 'trace', 'stack trace', 'why is', 'investigate error'],
      agents: ['prreddy-debugger'],
      pattern: 'Investigation-Heavy',
      priority: 'high'
    },
    performance: {
      keywords: ['slow', 'optimize', 'performance', 'speed', 'latency', 'bottleneck', 'memory'],
      agents: ['prreddy-performance'],
      pattern: 'Performance Optimization',
      priority: 'medium'
    },
    apiDesign: {
      keywords: ['api design', 'rest api', 'graphql', 'openapi', 'swagger', 'endpoint'],
      agents: ['prreddy-api-designer'],
      pattern: 'API Design & Implementation',
      priority: 'medium'
    },
    migration: {
      keywords: ['migrate', 'migration', 'schema change', 'database change', 'alter table'],
      agents: ['prreddy-db-migration'],
      pattern: 'Data Migration',
      priority: 'high'
    },
    feature: {
      keywords: ['feature', 'add', 'implement', 'build', 'create new'],
      agents: ['music-researcher', 'music-planner', 'music-general'],
      pattern: 'Research-Plan-Build-Document',
      priority: 'medium'
    },
    architecture: {
      keywords: ['architecture', 'design system', 'microservices', 'infrastructure'],
      agents: ['eos'],
      pattern: 'Architecture-First',
      priority: 'medium'
    },
    security: {
      keywords: ['security', 'vulnerability', 'audit', 'compliance', 'penetration'],
      agents: ['prreddy-auditor'],
      pattern: 'Security Hardening',
      priority: 'high'
    },
    documentation: {
      keywords: ['document', 'docs', 'readme', 'guide', 'wiki'],
      agents: ['prreddy-writer', 'music-docs'],
      pattern: 'Documentation Sprint',
      priority: 'low'
    },
    investigation: {
      keywords: ['investigate', 'analyze', 'understand', 'why', 'how does'],
      agents: ['prreddy-researcher', 'music-logs'],
      pattern: 'Investigation-Heavy',
      priority: 'medium'
    },
    incident: {
      keywords: ['incident', 'outage', 'down', 'p0', 'sev1', 'emergency', 'production'],
      agents: ['music-logs', 'music-rca'],
      pattern: 'Incident Response',
      priority: 'critical'
    },
    testing: {
      keywords: ['test', 'qa', 'quality', 'validation', 'verify'],
      agents: ['music-qa', 'prreddy-ui-tester'],
      pattern: 'Testing & Validation',
      priority: 'medium'
    },
    homeControl: {
      keywords: ['turn on', 'turn off', 'set brightness', 'set mode', 'set mood',
        'light', 'dim', 'volume', 'temperature', 'villa mode', 'mood'],
      agents: ['ha'],
      pattern: 'Direct Execution',
      priority: 'high'
    }
  },

  // Domain detection
  domains: {
    music: {
      keywords: ['music', 'playlist', 'song', 'artist', 'album', 'playback', 'tessitura'],
      agentPrefix: 'music-',
      priority: 10
    },
    alexa: {
      keywords: ['alexa', 'voice', 'skill', 'echo', 'device'],
      agentPrefix: 'alexa-',
      priority: 10
    },
    homeAutomation: {
      keywords: ['light', 'lights', 'turn on', 'turn off', 'brightness', 'mode',
        'villa', 'mood', 'temperature', 'thermostat', 'home assistant', 'entity',
        'scene', 'sonos', 'media player', 'volume', 'smart home'],
      agentPrefix: 'ha-',
      priority: 10
    },
    generic: {
      keywords: [],
      agentPrefix: 'prreddy-',
      priority: 1
    }
  },

  // Urgency detection
  urgency: {
    critical: {
      keywords: ['p0', 'sev1', 'critical', 'emergency', 'now', 'immediately', 'asap'],
      recommendation: 'Skip planning, use fastest agent',
      fastTrack: true
    },
    high: {
      keywords: ['urgent', 'high priority', 'today', 'same-day'],
      recommendation: 'Minimal planning, focus on execution',
      fastTrack: true
    },
    normal: {
      keywords: ['sprint', 'week', 'soon', 'normal'],
      recommendation: 'Full workflow with planning',
      fastTrack: false
    },
    low: {
      keywords: ['backlog', 'future', 'eventually', 'nice to have'],
      recommendation: 'Thorough planning and documentation',
      fastTrack: false
    }
  },

  // Complexity detection
  complexity: {
    trivial: {
      keywords: ['trivial', 'tiny', 'one-line'],
      recommendation: 'Single agent, no planning',
      agentCount: 1
    },
    low: {
      keywords: ['simple', 'small', 'minor', 'quick'],
      recommendation: 'Single agent sufficient',
      agentCount: 1
    },
    medium: {
      keywords: ['moderate', 'standard', 'typical'],
      recommendation: '2-3 agents sequential',
      agentCount: 3
    },
    high: {
      keywords: ['complex', 'large', 'major', 'significant'],
      recommendation: 'Full orchestration pattern',
      agentCount: 5
    },
    veryHigh: {
      keywords: ['massive', 'enterprise', 'critical', 'multi-team'],
      recommendation: 'Architecture → parallel teams → integration',
      agentCount: 7
    }
  },

  // Anti-patterns to avoid
  antiPatterns: [
    {
      agents: ['prreddy-coder', 'prreddy-dev'],
      reason: 'Too similar, redundant',
      suggestion: 'Use only prreddy-coder'
    },
    {
      agents: ['prreddy-researcher', 'music-researcher'],
      reason: 'Both produce similar detailed analysis',
      suggestion: 'Choose based on domain (Music vs generic)'
    },
    {
      agents: ['prreddy-writer', 'music-docs'],
      reason: 'Different approaches cause confusion',
      suggestion: 'prreddy-writer for custom, music-docs for Music'
    },
    {
      agents: ['gpu-dev', 'amzn-builder'],
      reason: 'Overlapping capabilities',
      suggestion: 'Use gpu-dev for speed, amzn-builder for Amazon tools'
    }
  ]
};

function analyzeTask(taskDescription) {
  const lower = taskDescription.toLowerCase();
  
  // Detect task type with scoring
  let taskType = 'feature';
  let maxScore = 0;
  
  for (const [type, config] of Object.entries(agentRules.taskTypes)) {
    const score = config.keywords.filter(kw => lower.includes(kw)).length;
    if (score > maxScore) {
      maxScore = score;
      taskType = type;
    }
  }
  
  // Detect domain with priority
  let domain = 'generic';
  let domainPriority = 0;
  
  for (const [dom, config] of Object.entries(agentRules.domains)) {
    const matches = config.keywords.filter(kw => lower.includes(kw)).length;
    if (matches > 0 && config.priority > domainPriority) {
      domain = dom;
      domainPriority = config.priority;
    }
  }
  
  // Detect urgency
  let urgency = 'normal';
  for (const [urg, config] of Object.entries(agentRules.urgency)) {
    if (config.keywords.some(kw => lower.includes(kw))) {
      urgency = urg;
      break;
    }
  }
  
  // Detect complexity
  let complexity = 'medium';
  for (const [comp, config] of Object.entries(agentRules.complexity)) {
    if (config.keywords.some(kw => lower.includes(kw))) {
      complexity = comp;
      break;
    }
  }
  
  return { taskType, domain, urgency, complexity };
}

function selectAgents(analysis) {
  const { taskType, domain, urgency, complexity } = analysis;
  const taskConfig = agentRules.taskTypes[taskType];
  
  let agents = [...taskConfig.agents];
  let mode = 'thorough';
  
  // Adjust for domain
  if (domain === 'music') {
    agents = agents.map(agent => {
      if (agent.startsWith('prreddy-') && !agent.includes('debugger') && !agent.includes('performance')) {
        const suffix = agent.replace('prreddy-', '');
        return `music-${suffix}`;
      }
      return agent;
    });
  }
  
  // Adjust for urgency (fast-track mode)
  if (urgency === 'critical' || urgency === 'high') {
    mode = 'fast-track';
    if (taskType === 'bugFix' || taskType === 'debugging') {
      agents = ['gpu-dev'];
    } else if (taskType === 'incident') {
      agents = ['music-logs', 'gpu-dev'];
    }
  }
  
  // Adjust for complexity
  const complexityConfig = agentRules.complexity[complexity];
  if (agents.length > complexityConfig.agentCount) {
    agents = agents.slice(0, complexityConfig.agentCount);
  }
  
  // Check for anti-patterns
  const warnings = [];
  for (const antiPattern of agentRules.antiPatterns) {
    const overlap = antiPattern.agents.filter(a => agents.includes(a));
    if (overlap.length > 1) {
      warnings.push({
        agents: overlap,
        reason: antiPattern.reason,
        suggestion: antiPattern.suggestion
      });
    }
  }
  
  return {
    agents,
    pattern: taskConfig.pattern,
    mode,
    urgencyNote: agentRules.urgency[urgency].recommendation,
    complexityNote: complexityConfig.recommendation,
    warnings
  };
}

function generateWorkflow(agents, pattern, mode) {
  if (mode === 'fast-track') {
    return {
      type: 'fast-track',
      steps: agents.map((agent, i) => ({
        step: i + 1,
        agent,
        action: 'Execute immediately',
        validation: 'Quick smoke test'
      }))
    };
  }
  
  // Thorough mode with validation gates
  const workflow = {
    type: 'thorough',
    steps: []
  };
  
  agents.forEach((agent, i) => {
    workflow.steps.push({
      step: i + 1,
      agent,
      action: getActionForAgent(agent),
      validation: getValidationForAgent(agent)
    });
    
    // Add validation gates
    if (shouldAddValidationGate(agent, i, agents)) {
      workflow.steps.push({
        step: `${i + 1}.5`,
        agent: 'music-validator',
        action: 'Validate output',
        validation: 'Evidence-based review'
      });
    }
    
    // Add security gates
    if (shouldAddSecurityGate(agent, pattern)) {
      workflow.steps.push({
        step: `${i + 1}.7`,
        agent: 'prreddy-auditor',
        action: 'Security review',
        validation: 'Vulnerability scan'
      });
    }
  });
  
  return workflow;
}

function getActionForAgent(agent) {
  const actions = {
    'prreddy-researcher': 'Analyze codebase',
    'music-researcher': 'Research Music context',
    'prreddy-planner': 'Create implementation plan',
    'music-planner': 'Create PM plan with estimates',
    'prreddy-coder': 'Implement changes',
    'music-general': 'Implement Music feature',
    'gpu-dev': 'Quick implementation',
    'prreddy-debugger': 'Diagnose issue',
    'prreddy-performance': 'Identify bottlenecks',
    'prreddy-api-designer': 'Design API contract',
    'prreddy-db-migration': 'Plan migration',
    'eos': 'Design architecture',
    'prreddy-auditor': 'Security audit',
    'music-logs': 'Check logs',
    'music-rca': 'Root cause analysis'
  };
  return actions[agent] || 'Execute task';
}

function getValidationForAgent(agent) {
  if (agent.includes('planner')) return 'Review plan completeness';
  if (agent.includes('coder') || agent.includes('dev')) return 'Code review';
  if (agent.includes('researcher')) return 'Verify findings';
  if (agent.includes('auditor')) return 'Verify fixes';
  return 'Review output';
}

function shouldAddValidationGate(agent, index, agents) {
  // Add validator after planners and before implementation
  if (agent.includes('planner') && index < agents.length - 1) {
    return true;
  }
  // Add validator after implementation
  if ((agent.includes('coder') || agent.includes('general')) && index === agents.length - 1) {
    return true;
  }
  return false;
}

function shouldAddSecurityGate(agent, pattern) {
  // Add security gate for security-critical patterns
  const securityPatterns = ['Security Hardening', 'API Design & Implementation'];
  return securityPatterns.includes(pattern) && (agent.includes('coder') || agent.includes('general'));
}

function generateCommand(workflow) {
  const commands = [];
  
  workflow.steps.forEach(step => {
    commands.push(`# Step ${step.step}: ${step.action}`);
    commands.push(`kiro-cli chat --agent ${step.agent}`);
    commands.push(`# Validation: ${step.validation}`);
    commands.push('');
  });
  
  return commands.join('\\n');
}

// CLI Interface
if (require.main === module) {
  const taskDescription = process.argv.slice(2).join(' ');
  
  if (!taskDescription) {
    console.log('Usage: node meta-agent-router.js "your task description"');
    console.log('\\nExamples:');
    console.log('  node meta-agent-router.js "Fix authentication bug in production"');
    console.log('  node meta-agent-router.js "Design new Music playlist API"');
    console.log('  node meta-agent-router.js "Urgent: API is down"');
    process.exit(1);
  }
  
  console.log('\\n🤖 Meta-Agent Routing System\\n');
  console.log(`Task: "${taskDescription}"\\n`);
  
  const analysis = analyzeTask(taskDescription);
  console.log('📊 Analysis:');
  console.log(`  Task Type: ${analysis.taskType}`);
  console.log(`  Domain: ${analysis.domain}`);
  console.log(`  Urgency: ${analysis.urgency}`);
  console.log(`  Complexity: ${analysis.complexity}\\n`);
  
  const selection = selectAgents(analysis);
  
  console.log(`🎯 Mode: ${selection.mode.toUpperCase()}`);
  console.log(`📋 Pattern: ${selection.pattern}\\n`);
  
  console.log('✅ Recommended Agents:');
  selection.agents.forEach((agent, i) => {
    console.log(`  ${i + 1}. ${agent}`);
  });
  console.log('');
  
  if (selection.warnings.length > 0) {
    console.log('⚠️  Warnings:');
    selection.warnings.forEach(warning => {
      console.log(`  - ${warning.reason}`);
      console.log(`    Suggestion: ${warning.suggestion}`);
    });
    console.log('');
  }
  
  const workflow = generateWorkflow(selection.agents, selection.pattern, selection.mode);
  
  console.log('📝 Workflow:');
  workflow.steps.forEach(step => {
    console.log(`  Step ${step.step}: ${step.agent} - ${step.action}`);
    console.log(`           Validation: ${step.validation}`);
  });
  console.log('');
  
  console.log('💻 Commands:\\n');
  console.log(generateCommand(workflow));
}

module.exports = { analyzeTask, selectAgents, generateWorkflow, generateCommand };
