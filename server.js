#!/usr/bin/env node

/**
 * Agent Orchestration Server — Villa Romanza
 * Creates orchestrator, registers available agents, starts Express API
 *
 * Default port: 8406 (Villa service range)
 * Agents auto-register based on reachability:
 *   - Claude API (if ANTHROPIC_API_KEY set)
 *   - Ollama on Mech Mac (192.168.0.60:11434)
 *   - RAG on Mech Mac (192.168.0.60:8450)
 *   - Mock fallback if nothing else available
 */
const path = require('path');
const express = require('express');
const Orchestrator = require('./src/orchestrator');
const MultiObjectiveReward = require('./src/multi-objective-reward');
const createAPI = require('./src/api');
const { setupRoutes: setupPortal, setupWebSocket } = require('./src/portal-api');

let ClaudeAPIAgent, OllamaAgent, RAGAgent, CompoundAgent, RedisBus, RemoteAgent, HAAgent, HAContextProvider;
try { ClaudeAPIAgent = require('./src/agents/claude-agent'); } catch {}
let GeminiAgent;
try { GeminiAgent = require("./src/agents/gemini-agent"); } catch {}
let ImagenAgent;
try { ImagenAgent = require("./src/agents/imagen-agent"); } catch {}
try { OllamaAgent = require('./src/agents/ollama-agent'); } catch {}
try { RAGAgent = require('./src/agents/rag-agent'); } catch {}
try { CompoundAgent = require('./src/agents/compound-agent'); } catch {}
try { RedisBus = require('./src/redis-bus'); } catch {}
try { RemoteAgent = require('./src/agents/remote-agent'); } catch {}
try { HAAgent = require('./src/agents/ha-agent'); } catch {}
try { HAContextProvider = require('./src/ha-context-provider'); } catch {}
let MoodOverrideDetector;
try { MoodOverrideDetector = require('./src/mood-override-detector'); } catch {}
let UnifiedMusicService, SpotifyAdapter, AppleMusicAdapter, AmazonAdapter;
let SunoAdapter, UdioAdapter, AmazonAIAdapter, GenerationManager;
try { ({ UnifiedMusicService } = require('./src/music/music-service')); } catch {}
try { ({ SpotifyAdapter } = require('./src/music/spotify-adapter')); } catch {}
try { ({ AppleMusicAdapter } = require('./src/music/apple-music-adapter')); } catch {}
try { ({ AmazonAdapter } = require('./src/music/amazon-adapter')); } catch {}
try { ({ SunoAdapter } = require('./src/music/suno-adapter')); } catch {}
try { ({ UdioAdapter } = require('./src/music/udio-adapter')); } catch {}
try { ({ AmazonAIAdapter } = require('./src/music/amazon-ai-adapter')); } catch {}
try { ({ GenerationManager } = require('./src/music/generation-manager')); } catch {}
let OpenAIAgent;
try { OpenAIAgent = require('./src/agents/openai-agent'); } catch {}
let AgentToolkit, addHATools, addCrestronTools, addUtilityTools;
try { ({ AgentToolkit, addHATools, addCrestronTools, addUtilityTools } = require('./src/agent-tools')); } catch {}

const HITL = require('./src/hitl');
const { ContextManager, StaticProvider, TimeProvider } = require('./src/context-providers');
const { PluginLoader } = require('./src/plugin-loader');
let TenantManager;
try { TenantManager = require('./src/tenancy'); } catch {}

const VILLA_SYSTEM_PROMPT = `You are an AI agent in the Villa Romanza orchestration system.
Villa Romanza is a large-scale smart home with 76 areas across 5 floors.
You assist with home automation, AV control, lighting, climate, and general tasks.
Be concise and actionable. When referencing devices, use their Home Assistant entity IDs.`;

const CLAUDE_TOOLS_PROMPT = `You are a Villa Romanza AI agent with direct control over the smart home.
Villa Romanza is a large estate with 76 areas across 5 floors, managed by Crestron CP4-R and Home Assistant.

You have tools to control Home Assistant entities and Crestron devices. Use them to fulfill requests.

Safety rules:
- NEVER control master suite lights (excluded from agent control)
- NEVER control security, garage, or laundry devices (Hard Rule 4)
- Media player volume NEVER exceeds 70%
- Sensors are read-only
- When unsure of an entity name, use ha_search_entities first

Villa modes: NORMAL, LISTEN, LOOK, WATCH, ENTERTAIN, LIVE_JAM, SHOW, INTERLUDE
Common HA rooms: theatre, bar, library, cabana, great_room, master, kitchen, north_hall

Be concise. Use tools to check state before answering questions about the house.
After controlling a device, briefly confirm what you did.`;

async function main() {
  const port = parseInt(process.env.PORT) || 8406;

  const dataDir = process.env.DATA_DIR || path.join(__dirname, 'data');
  const scorer = new MultiObjectiveReward();

  // HITL approval gates — destructive tasks require human approval
  const hitl = new HITL({ timeout: 60000, defaultAction: 'reject' });
  hitl.addGate(/\b(delete|destroy|drop|truncate|shutdown|reboot)\b/i, async (taskId, task) => {
    console.log(`[HITL] Approval needed for task ${taskId}: ${task.substring(0, 80)}`);
  });
  console.log('HITL: destructive task gates active');

  // Context providers — time awareness + static environment
  const context = new ContextManager();
  context.add('time', new TimeProvider());
  context.add('env', new StaticProvider({
    region: 'villa-romanza',
    tier: process.env.NODE_ENV === 'production' ? 'production' : 'development',
    host: require('os').hostname()
  }));
  console.log('Context: time + env providers active');

  // Tenancy — opt-in via TENANTS env var (e.g., TENANTS=villa:100:5,dev:50:3)
  let tenancy = null;
  if (TenantManager && process.env.TENANTS) {
    tenancy = new TenantManager();
    for (const spec of process.env.TENANTS.split(',').map(s => s.trim()).filter(Boolean)) {
      const [id, tasksPerHour, concurrent] = spec.split(':');
      tenancy.create(id, {
        tasksPerHour: parseInt(tasksPerHour) || Infinity,
        concurrent: parseInt(concurrent) || Infinity
      });
      console.log(`Tenant: ${id} (${tasksPerHour || '∞'} tasks/hr, ${concurrent || '∞'} concurrent)`);
    }
  }

  const orc = new Orchestrator({
    rewardFn: (result, metadata) => scorer.score(result, metadata),
    persistPath: path.join(dataDir, 'rl-qtable.json'),
    eventStorePath: path.join(dataDir, 'events.json'),
    hitl,
    context,
    tenancy,
    contextKeyFn: (analysis, snapshot) => {
      const period = snapshot?.time?.period || 'any';
      const mode = snapshot?.ha?.villa_mode || 'any';
      return `${analysis.taskType}-${analysis.domain}-${period}-${mode}`;
    },
    contextBiasFn: (candidates, snapshot) => {
      // Prefer local ollama at night — lowest latency, zero cost
      if (snapshot?.time?.period === 'night' && candidates.includes('ollama')) return 'ollama';
      return null;
    }
  });

  // Connect Redis bus for cross-machine messaging (if REDIS_URL set)
  let redisBus = null;
  if (RedisBus && process.env.REDIS_URL) {
    try {
      redisBus = new RedisBus({ url: process.env.REDIS_URL });
      await redisBus.connect();
      orc.bus = redisBus;
      console.log(`Redis bus: ${process.env.REDIS_URL}`);
    } catch (err) {
      console.log(`Skipped: Redis bus (${err.message})`);
      redisBus = null;
    }
  }

  // Register remote agents from REMOTE_AGENTS env var (requires Redis bus)
  // Format: REMOTE_AGENTS=fx-ollama,show-runner,road-mac
  if (RemoteAgent && redisBus && process.env.REMOTE_AGENTS) {
    for (const name of process.env.REMOTE_AGENTS.split(',').map(s => s.trim()).filter(Boolean)) {
      const agent = new RemoteAgent({ name, bus: redisBus });
      agent.listen();
      orc.registerAgent(name, '1.0.0', agent, {
        type: 'remote', provider: 'redis',
        strengths: ['remote execution', 'distributed inference']
      });
      console.log(`Registered: ${name} (remote via Redis)`);
    }
  }

  // Register Claude agent if API key available
  if (ClaudeAPIAgent && process.env.ANTHROPIC_API_KEY) {
    const claude = new ClaudeAPIAgent({
      systemPrompt: process.env.CLAUDE_SYSTEM_PROMPT || VILLA_SYSTEM_PROMPT,
      maxTokens: parseInt(process.env.CLAUDE_MAX_TOKENS) || 4096
    });
    orc.registerAgent('claude', '1.0.0', claude, {
      type: 'cloud', provider: 'anthropic',
      strengths: ['complex reasoning', 'code generation', 'analysis']
    });
    console.log('Registered: claude (Anthropic API)');
  }

  // Register Gemini agent if API key available
  if (GeminiAgent && process.env.GEMINI_API_KEY) {
    const gemini = new GeminiAgent({
      systemPrompt: VILLA_SYSTEM_PROMPT,
      maxTokens: 8192
    });
    orc.registerAgent('gemini', '1.0.0', gemini, {
      type: 'cloud', provider: 'google',
      strengths: ['long context', 'code generation', 'analysis', 'multimodal', 'app development']
    });
    console.log('Registered: gemini (Google Gemini API)');
  }

  // Register Imagen agent if Gemini API key available
  if (ImagenAgent && process.env.GEMINI_API_KEY) {
    const imagen = new ImagenAgent({
      outputDir: require('path').join(process.env.HOME || '/tmp', 'generated-images'),
      aspectRatio: '16:9'
    });
    orc.registerAgent('imagen', '1.0.0', imagen, {
      type: 'cloud', provider: 'google',
      strengths: ['image generation', 'visual art', 'creative', 'design',
        'illustration', 'photo', 'picture', 'draw', 'paint', 'render']
    });
    console.log('Registered: imagen (Google Imagen 4 + Gemini native image gen)');
  }

  // Register ChatGPT agent if OpenAI API key available
  if (OpenAIAgent && process.env.OPENAI_API_KEY) {
    const chatgpt = new OpenAIAgent({
      systemPrompt: VILLA_SYSTEM_PROMPT,
      maxTokens: 4096
    });
    const healthy = await chatgpt.healthCheck();
    if (healthy) {
      orc.registerAgent('chatgpt', '1.0.0', chatgpt, {
        type: 'cloud', provider: 'openai',
        strengths: ['creative writing', 'conversation', 'general knowledge', 'voice scripts']
      });
      console.log('Registered: chatgpt (OpenAI API)');
    } else {
      console.log('Skipped: chatgpt (OpenAI API unreachable)');
    }
  }

  // Register Ollama agent if host is reachable
  if (OllamaAgent) {
    const ollamaHost = process.env.OLLAMA_HOST || 'http://192.168.0.60:11434';
    const ollamaModel = process.env.OLLAMA_MODEL || 'llama3.1:8b';
    const ollama = new OllamaAgent({
      host: ollamaHost,
      model: ollamaModel,
      systemPrompt: VILLA_SYSTEM_PROMPT
    });

    const healthy = await ollama.healthCheck();
    if (healthy) {
      orc.registerAgent('ollama', '1.0.0', ollama, {
        type: 'local', provider: 'ollama',
        strengths: ['fast response', 'zero cost', 'routine tasks']
      });
      console.log(`Registered: ollama (${ollamaModel} at ${ollamaHost})`);
    } else {
      console.log(`Skipped: ollama (unreachable at ${ollamaHost})`);
    }
  }

  // Register RAG agent if server is reachable
  if (RAGAgent) {
    const ragHost = process.env.RAG_HOST || 'http://192.168.0.60:8450';
    const rag = new RAGAgent({ host: ragHost, topK: 5 });

    const healthy = await rag.healthCheck();
    if (healthy) {
      orc.registerAgent('rag', '1.0.0', rag, {
        type: 'local', provider: 'villa-rag',
        strengths: ['villa knowledge', 'documentation lookup', 'device info']
      });
      console.log(`Registered: rag (${ragHost})`);
    } else {
      console.log(`Skipped: rag (unreachable at ${ragHost})`);
    }
  }

  // Register compound RAG→Ollama agent if both are available
  if (CompoundAgent && orc.agents.has('rag') && orc.agents.has('ollama')) {
    const ragOllama = new CompoundAgent([
      { name: 'rag-retrieval', agent: orc.agents.get('rag') },
      {
        name: 'ollama-synthesis', agent: orc.agents.get('ollama'),
        promptTemplate: `You are a Villa Romanza assistant. Use the following context from the villa knowledge base to answer the question. If the context doesn't contain relevant information, say so and answer from general knowledge.\n\nContext:\n{context}\n\nQuestion: {task}`
      }
    ]);
    orc.registerAgent('rag-ollama', '1.0.0', ragOllama, {
      type: 'compound', provider: 'villa',
      strengths: ['villa knowledge', 'synthesized answers', 'device info', 'documentation']
    });
    console.log('Registered: rag-ollama (RAG retrieval + Ollama synthesis)');
  }

  // Register HA agent if token available
  if (HAAgent && process.env.HA_TOKEN) {
    const ha = new HAAgent({
      baseUrl: process.env.HA_URL || 'http://192.168.1.6:8123',
      token: process.env.HA_TOKEN,
      intentResolverUrl: process.env.INTENT_RESOLVER_URL || 'http://192.168.0.60:8400'
    });

    const healthy = await ha.healthCheck();
    if (healthy) {
      orc.registerAgent('ha', '1.0.0', ha, {
        type: 'local', provider: 'home-assistant',
        strengths: ['home automation', 'smart home', 'lights', 'device control',
          'villa mode', 'mood', 'temperature', 'turn on', 'turn off']
      });
      console.log(`Registered: ha (Home Assistant at ${process.env.HA_URL || 'http://192.168.1.6:8123'})`);
    } else {
      console.log('Skipped: ha (HA unreachable)');
    }
  }

  // Register HA context provider (read-only, works even if HA agent didn't register)
  if (HAContextProvider && process.env.HA_TOKEN) {
    const haCtx = new HAContextProvider({
      baseUrl: process.env.HA_URL || 'http://192.168.1.6:8123',
      token: process.env.HA_TOKEN
    });
    context.add('ha', haCtx);
    haCtx.start();
    console.log('Context: ha provider active');
  }

  // Register compound Claude→HA agent (Claude interprets NL, HA executes)
  if (CompoundAgent && orc.agents.has('claude') && orc.agents.has('ha')) {
    const claudeHA = new CompoundAgent([
      {
        name: 'claude-interpret', agent: orc.agents.get('claude'),
        promptTemplate: `You are a command translator. Convert the user request into exactly ONE Home Assistant command. Output ONLY the command on a single line — no explanation, no markdown, no quotes.

Commands:
ha:state:{entity_id}                          — read state (e.g. ha:state:light.theatre)
ha:service:{domain}/{service}:{json}          — call service (e.g. ha:service:light/turn_on:{"entity_id":"light.theatre"})
ha:intent:{room}/{intent}                     — mood intent (e.g. ha:intent:theatre/romance)
ha:mode:{MODE}                                — set villa mode (NORMAL|LISTEN|LOOK|WATCH|ENTERTAIN|LIVE_JAM|SHOW|INTERLUDE)

Entity naming: light.{room}, media_player.{room}, sensor.{type}, input_select.villa_mode
Common rooms: theatre, bar, library, cabana, great_room, master, kitchen, north_hall
Safety: NEVER master suite lights, security lights, garage, laundry. Volume max 70%.

Request: {task}`
      },
      { name: 'ha-execute', agent: orc.agents.get('ha') }
    ]);
    orc.registerAgent('claude-ha', '1.0.0', claudeHA, {
      type: 'compound', provider: 'villa',
      strengths: ['natural language home control', 'complex home automation', 'villa commands']
    });
    console.log('Registered: claude-ha (Claude NL + HA execution)');
  }

  // Register compound Gemini→HA agent (Gemini interprets NL, HA executes)
  if (CompoundAgent && orc.agents.has('gemini') && orc.agents.has('ha')) {
    const geminiHA = new CompoundAgent([
      {
        name: 'gemini-interpret', agent: orc.agents.get('gemini'),
        promptTemplate: `You are a command translator. Convert the user request into exactly ONE Home Assistant command. Output ONLY the command on a single line — no explanation, no markdown, no quotes.

Commands:
ha:state:{entity_id}                          — read state (e.g. ha:state:light.theatre)
ha:service:{domain}/{service}:{json}          — call service (e.g. ha:service:light/turn_on:{"entity_id":"light.theatre"})
ha:intent:{room}/{intent}                     — mood intent (e.g. ha:intent:theatre/romance)
ha:mode:{MODE}                                — set villa mode (NORMAL|LISTEN|LOOK|WATCH|ENTERTAIN|LIVE_JAM|SHOW|INTERLUDE)

Entity naming: light.{room}, media_player.{room}, sensor.{type}, input_select.villa_mode
Common rooms: theatre, bar, library, cabana, great_room, master, kitchen, north_hall
Safety: NEVER master suite lights, security lights, garage, laundry. Volume max 70%.

Request: {task}`
      },
      { name: 'ha-execute', agent: orc.agents.get('ha') }
    ]);
    orc.registerAgent('gemini-ha', '1.0.0', geminiHA, {
      type: 'compound', provider: 'villa',
      strengths: ['natural language home control', 'complex home automation', 'villa commands']
    });
    console.log('Registered: gemini-ha (Gemini NL + HA execution)');
  }

  // Build shared toolkit for tool-using agents (Claude + ChatGPT)
  let sharedToolkit = null;
  if (AgentToolkit) {
    const toolkit = new AgentToolkit();
    addUtilityTools(toolkit);

    if (process.env.HA_TOKEN) {
      addHATools(toolkit, {
        baseUrl: process.env.HA_URL || 'http://192.168.1.6:8123',
        token: process.env.HA_TOKEN
      });
    }

    if (process.env.CRESTRON_AUTH_TOKEN) {
      addCrestronTools(toolkit, {
        host: process.env.CRESTRON_HOST || '192.168.1.2',
        authToken: process.env.CRESTRON_AUTH_TOKEN
      });
    }

    if (toolkit.size > 1) sharedToolkit = toolkit; // >1 means more than just utility tools
  }

  // Register tool-using Claude agent
  if (sharedToolkit && ClaudeAPIAgent && process.env.ANTHROPIC_API_KEY) {
    const claudeTools = new ClaudeAPIAgent({
      systemPrompt: CLAUDE_TOOLS_PROMPT,
      maxTokens: 4096,
      toolkit: sharedToolkit
    });
    const toolNames = sharedToolkit.getDefinitions().map(t => t.name);
    orc.registerAgent('claude-tools', '1.0.0', claudeTools, {
      type: 'cloud', provider: 'anthropic',
      strengths: ['complex reasoning', 'multi-step tasks', 'home automation',
        'smart home', 'device control', 'shades', 'scenes', 'villa queries',
        'status checks', 'natural language home control']
    });
    console.log(`Registered: claude-tools (${sharedToolkit.size} tools: ${toolNames.join(', ')})`);
  }

  // Register tool-using ChatGPT agent
  if (sharedToolkit && OpenAIAgent && process.env.OPENAI_API_KEY && orc.agents.has('chatgpt')) {
    const chatgptTools = new OpenAIAgent({
      systemPrompt: CLAUDE_TOOLS_PROMPT,
      maxTokens: 4096,
      toolkit: sharedToolkit
    });
    orc.registerAgent('chatgpt-tools', '1.0.0', chatgptTools, {
      type: 'cloud', provider: 'openai',
      strengths: ['creative home control', 'multi-step tasks', 'home automation',
        'smart home', 'device control', 'shades', 'scenes', 'villa queries']
    });
    console.log(`Registered: chatgpt-tools (${sharedToolkit.size} tools)`);
  }

  // Register tool-using Gemini agent (Gemini + HA tools + Crestron tools + utilities)
  if (AgentToolkit && GeminiAgent && process.env.GEMINI_API_KEY) {
    const gemToolkit = new AgentToolkit();
    addUtilityTools(gemToolkit);

    if (process.env.HA_TOKEN) {
      addHATools(gemToolkit, {
        baseUrl: process.env.HA_URL || 'http://192.168.1.6:8123',
        token: process.env.HA_TOKEN
      });
    }

    if (process.env.CRESTRON_AUTH_TOKEN) {
      addCrestronTools(gemToolkit, {
        host: process.env.CRESTRON_HOST || '192.168.1.2',
        authToken: process.env.CRESTRON_AUTH_TOKEN
      });
    }

    if (gemToolkit.size > 1) {
      const geminiTools = new GeminiAgent({
        systemPrompt: CLAUDE_TOOLS_PROMPT.replace('You are a Villa Romanza AI agent', 'You are a Villa Romanza Gemini AI agent'),
        maxTokens: 8192,
        toolkit: gemToolkit
      });
      const gemToolNames = gemToolkit.getDefinitions().map(t => t.name);
      orc.registerAgent('gemini-tools', '1.0.0', geminiTools, {
        type: 'cloud', provider: 'google',
        strengths: ['complex reasoning', 'multi-step tasks', 'home automation',
          'smart home', 'device control', 'shades', 'scenes', 'villa queries',
          'status checks', 'natural language home control', 'long context', 'code generation']
      });
      console.log(`Registered: gemini-tools (${gemToolkit.size} tools: ${gemToolNames.join(', ')})`);
    }
  }

  // Mood override detector — feeds RL with user correction data
  if (MoodOverrideDetector && process.env.HA_TOKEN && orc.agents.has('ha')) {
    const overrideDetector = new MoodOverrideDetector({
      haUrl: process.env.HA_URL || 'http://192.168.1.6:8123',
      token: process.env.HA_TOKEN,
      onOverride: (override) => {
        const contextKey = `mood-${override.context.room || 'unknown'}-${override.context.intent || 'unknown'}-${override.context.timePeriod || 'any'}`;
        orc.rl.update(contextKey, 'ha', override.satisfaction);
        orc.eventStore.append('mood-override', 'override.detected', {
          entityId: override.entityId,
          drift: override.drift,
          satisfaction: override.satisfaction,
          context: override.context
        });
      }
    });
    overrideDetector.startPolling(10000);
    orc.overrideDetector = overrideDetector;
    console.log('Mood: override detector active (10s poll, 5min window)');
  }

  // Load plugins from plugins/ directory
  const pluginsDir = path.join(__dirname, 'plugins');
  const fs = require('fs');
  if (fs.existsSync(pluginsDir)) {
    const results = PluginLoader.loadDir(orc, pluginsDir);
    const loaded = results.filter(r => typeof r === 'string');
    const errors = results.filter(r => typeof r === 'object');
    if (loaded.length) console.log(`Plugins: ${loaded.join(', ')}`);
    if (errors.length) console.log(`Plugin errors: ${errors.map(e => `${e.file}(${e.error})`).join(', ')}`);
  }

  // Fallback mock agent so system is never empty
  if (orc.agents.size === 0) {
    orc.registerAgent('mock', '1.0.0', {
      execute: async (task) => `[mock] Processed: ${task.substring(0, 100)}`,
      healthCheck: async () => true
    }, { type: 'mock' });
    console.log('Registered: mock (fallback)');
  }

  // --- Music Platform ---
  let musicService = null;
  let genManager = null;

  if (UnifiedMusicService) {
    musicService = new UnifiedMusicService();

    // Register streaming adapters
    if (SpotifyAdapter) {
      const spotify = new SpotifyAdapter();
      musicService.registerAdapter(spotify);
      console.log(`Music: spotify (${spotify.isAvailable() ? 'available' : 'no credentials'})`);
    }
    if (AppleMusicAdapter) {
      const apple = new AppleMusicAdapter();
      musicService.registerAdapter(apple);
      console.log(`Music: apple_music (${apple.isAvailable() ? 'available' : 'no credentials'})`);
    }
    if (AmazonAdapter) {
      const amazon = new AmazonAdapter({ catalog: [] }); // TODO: load from audio_sources.yaml
      musicService.registerAdapter(amazon);
      console.log(`Music: amazon (catalog)`);
    }

    // Register AI generators
    if (SunoAdapter) {
      const suno = new SunoAdapter({ apiKey: process.env.SUNO_API_KEY });
      musicService.registerGenerator(suno);
      console.log(`Music: suno (${suno.isAvailable() ? 'available' : 'no API key'})`);
    }
    if (UdioAdapter) {
      const udio = new UdioAdapter({ apiKey: process.env.UDIO_API_KEY });
      musicService.registerGenerator(udio);
      console.log(`Music: udio (${udio.isAvailable() ? 'available' : 'no API key'})`);
    }
    if (AmazonAIAdapter) {
      const amazonAI = new AmazonAIAdapter();
      musicService.registerGenerator(amazonAI);
    }

    // Generation manager
    if (GenerationManager) {
      genManager = new GenerationManager({
        musicService,
        musicDir: process.env.MUSIC_DIR || path.join(process.env.HOME || '/tmp', 'generated-music'),
      });
      console.log('Music: generation manager active');
    }

    const { services } = musicService.getAvailableServices();
    const avail = services.filter(s => s.available).map(s => s.name);
    console.log(`Music Platform: ${avail.length} services available (${avail.join(', ') || 'none'})`);
  }

  // Create parent Express app with portal, then mount API sub-app
  const apiApp = createAPI(orc);
  const app = express();
  app.use(express.json());
  
  // Add cookie parser for sessions
  const cookieParser = require('cookie-parser');
  app.use(cookieParser());
  
  // Setup authentication
  const { authMiddleware, setupAuthRoutes } = require('./src/auth');
  setupAuthRoutes(app);
  
  // Serve login page for unauthenticated requests
  app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'src/portal/login.html'));
  });
  
  // Check auth and redirect to login if needed
  app.use((req, res, next) => {
    // Skip auth for login page and auth endpoints
    if (req.path === '/login' || req.path.startsWith('/api/auth/')) {
      return next();
    }
    
    // Check if authenticated
    const sessionId = req.cookies?.villa_session;
    if (!sessionId) {
      if (req.path.startsWith('/api/')) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      return res.redirect('/login');
    }
    next();
  });
  
  const engines = setupPortal(app, orc, { musicService, generationManager: genManager });
  app.use(apiApp);          // API sub-app (existing routes preserved)

  // Setup music service routes (Mantis + Amazon Music)
  const setupMusicServiceRoutes = require('./src/music-service-routes');
  const musicConfig = require('./src/music-service-config');
  musicConfig.enableService('mantis');  // Enable Mantis by default (priority 1)
  setupMusicServiceRoutes(app, null); // MCP client can be added later
  console.log('Music service routes: enabled (Mantis priority 1)');

  // Setup audio streaming routes (hi-fi/Atmos support)
  const setupAudioStreamingRoutes = require('./src/audio-streaming-routes');
  setupAudioStreamingRoutes(app);
  console.log('Audio streaming API: enabled (hi-fi/Atmos capable)');

  const server = app.listen(port, () => {
    console.log(`\nVilla Romanza Agent Orchestration API on port ${port}`);
    console.log(`Portal: http://localhost:${port}/`);
    console.log(`Agents: ${Array.from(orc.agents.keys()).join(', ')}`);
    console.log(`\nEndpoints:`);
    console.log(`  GET  /                - Villa Portal`);
    console.log(`  WS   /ws             - WebSocket (chat + events)`);
    console.log(`  POST /api/chat       - Chat with agents`);
    console.log(`  POST /api/tasks      - Execute a task`);
    console.log(`  GET  /api/villa/state - Villa state`);
    console.log(`  GET  /api/images     - Generated images`);
    console.log(`  GET  /api/agents     - List agents`);
    console.log(`  GET  /api/rl-stats   - RL learning state`);
    console.log(`  GET  /api/music/services - Music service config`);
    console.log(`  POST /api/music/play - Play audio (Mantis/Amazon)`);
    console.log(`  POST /api/audio/stream - Hi-fi audio streaming (Atmos capable)`);
  });

  const wss = setupWebSocket(server, orc, engines, { generationManager: genManager });

  const shutdown = async () => {
    orc.shutdown();
    if (wss) wss.close();
    if (redisBus) await redisBus.disconnect().catch(() => {});
    server.close();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch(err => {
  console.error('Server startup failed:', err);
  process.exit(1);
});
