/**
 * Villa Router — Deterministic task routing for Villa Romanza agents
 * * Villa-specific deterministic task router
 *
 * Routes are explicit pattern matches against actual registered agents.
 * RL is only used as a tiebreaker when multiple agents match equally.
 */

// Deterministic route table: pattern → agent name
// Order matters — first match wins
const ROUTES = [
  // Direct HA control (structured or NL)
  { pattern: /^ha:/i, agent: 'ha' },
  { pattern: /^(turn\s+(on|off)|set\s+(brightness|temperature|volume|mode|mood)|dim\s|brighten\s)/i, agent: 'ha' },
  { pattern: /^(what('s|\s+is)\s+(the\s+)?(state|status|temperature|mode))/i, agent: 'ha' },
  { pattern: /^(villa\s+mode|set\s+mode|change\s+mode)/i, agent: 'ha' },

  // Image generation
  { pattern: /^imagen:/i, agent: 'imagen' },
  { pattern: /(generate|create|make|draw|paint|render)\s+(an?\s+)?(image|picture|photo|illustration|art|visual)/i, agent: 'imagen' },

  // Villa knowledge (RAG)
  { pattern: /^rag:/i, agent: 'rag' },
  { pattern: /(what|where|which|how many|tell me about)\s+.*(device|camera|switch|vlan|ip|mac|sonos|hue|bridge|room|area)/i, agent: 'rag' },
  { pattern: /(villa|house|system)\s+(knowledge|info|documentation|inventory)/i, agent: 'rag' },

  // Local LLM (zero cost, routine tasks)
  { pattern: /^ollama:/i, agent: 'ollama' },
  { pattern: /^(classify|categorize|tag|label|summarize briefly)\s/i, agent: 'ollama' },

  // Gemini (long context, analysis, code)
  { pattern: /^gemini:/i, agent: 'gemini-tools' },
  { pattern: /(analyze|review|audit|compare|diff|explain this code|refactor)/i, agent: 'gemini-tools' },
  { pattern: /(long|large|full|entire)\s+(context|document|file|codebase)/i, agent: 'gemini-tools' },

  // ChatGPT (creative, voice, writing)
  { pattern: /^chatgpt:/i, agent: 'chatgpt-tools' },
  { pattern: /(write|compose|draft|script|story|creative|voice line|narrat)/i, agent: 'chatgpt-tools' },

  // Remote agents (explicit only)
  { pattern: /^fx-ollama:/i, agent: 'fx-ollama' },
  { pattern: /^show-runner:/i, agent: 'show-runner' },
  { pattern: /^road-mac:/i, agent: 'road-mac' },
];

// Default agent when no pattern matches
const DEFAULT_AGENT = 'claude-tools';

/**
 * Analyze a task and return routing metadata.
 * Kept for backward compat with orchestrator.js (analysis.taskType, analysis.domain).
 */
function analyzeTask(taskDescription) {
  const lower = taskDescription.toLowerCase();

  let taskType = 'general';
  let domain = 'generic';

  if (/turn\s+(on|off)|brightness|volume|temperature|mode|mood|light|dim/i.test(lower)) {
    taskType = 'homeControl';
    domain = 'homeAutomation';
  } else if (/image|picture|photo|draw|paint|visual|illustration/i.test(lower)) {
    taskType = 'imageGeneration';
    domain = 'creative';
  } else if (/camera|vlan|switch|ip |mac |device|sonos|hue|bridge/i.test(lower)) {
    taskType = 'knowledge';
    domain = 'villa';
  } else if (/analyze|review|audit|refactor|code/i.test(lower)) {
    taskType = 'analysis';
    domain = 'technical';
  } else if (/write|compose|draft|creative|voice|script/i.test(lower)) {
    taskType = 'creative';
    domain = 'writing';
  } else if (/classify|categorize|tag|summarize/i.test(lower)) {
    taskType = 'routine';
    domain = 'utility';
  }

  return { taskType, domain, urgency: 'normal', complexity: 'medium' };
}

/**
 * Route a task to the best agent.
 * Returns the agent name, or null if no deterministic match (falls through to RL/default).
 */
function routeTask(taskDescription, availableAgents) {
  // Direct prefix routing: "agentname:task" bypasses everything
  const prefixMatch = taskDescription.match(/^([\w-]+):(.*)/s);
  if (prefixMatch) {
    const prefix = prefixMatch[1].toLowerCase();
    if (availableAgents.includes(prefix)) return prefix;
  }

  // Deterministic pattern matching
  for (const route of ROUTES) {
    if (route.pattern.test(taskDescription) && availableAgents.includes(route.agent)) {
      return route.agent;
    }
  }

  // Default to claude-tools if available
  if (availableAgents.includes(DEFAULT_AGENT)) return DEFAULT_AGENT;

  // Last resort: first available agent
  return null;
}

// Legacy exports for backward compat with orchestrator.js executeWorkflow()
function selectAgents(analysis) {
  return { agents: [DEFAULT_AGENT], pattern: 'Direct Execution', mode: 'fast-track' };
}

function generateWorkflow(agents, pattern, mode) {
  return {
    type: 'fast-track',
    steps: agents.map((agent, i) => ({
      step: i + 1, agent, action: 'Execute', validation: 'Check result'
    }))
  };
}

module.exports = { analyzeTask, routeTask, selectAgents, generateWorkflow, ROUTES, DEFAULT_AGENT };
