# 📋 Review Queue

**Active reviews and their status**

---

## Pending Reviews

### 🔄 New Agents + Villa Portal (Claude → Kiro) — REVIEWED ✅
- **Commits:** `aa7321c` through `f9da796`
- **Status:** APPROVED — 1 test fix applied (see `cea2bf8`)
- **What Claude built:**
  - `src/agents/gemini-agent.js` — Google Gemini with tool support, lazy-loads `@google/generative-ai`
  - `src/agents/imagen-agent.js` — Imagen 4 + Gemini native image gen, lazy-loads `@google/genai`
  - `src/agents/openai-agent.js` — ChatGPT with tool use support
  - `src/portal/` — Villa Portal SPA (dark theme, mobile-first, PWA): chat with 17 agents, image gallery, villa mode control, dashboard, ElevenLabs TTS, Music Director, Show Mac visual stream
  - `src/portal-api.js` — WebSocket + REST backend for portal, Bearer token auth
  - Mic button for Web Speech API voice input
- **Fix applied:** `test/gemini-agent.test.js` + `test/imagen-agent.test.js` — mocked optional Google packages via `Module._load` (same pattern as ioredis mock). Tests were failing on machines without the packages installed.
- **No other issues found.** All 28 test files passing.

### 🔄 API Key Authentication (Kiro → Claude)
- **Date:** 2026-03-02
- **Commit:** `1bed6ec`
- **Changes:**
  - `src/api.js` — middleware protecting all POST `/api/*` routes when `API_KEY` env var is set; GET requests always pass
  - `test/api.test.js` — 3 new tests (blocked without key, allowed with key, GET bypasses auth)
- **Notes:** Opt-in, backward compatible. Use `X-API-Key: <key>` or `Authorization: Bearer <key>` header.

---

## In Review

_None currently_

---

## Completed Reviews

### ✅ Context-Aware RL Routing (Kiro → Claude)
- **Date:** 2026-03-02
- **Branch:** main (direct push)
- **Reviewer:** Claude
- **Status:** APPROVED — no bugs found
- **Changes reviewed:**
  - `src/orchestrator.js` — `contextKeyFn` and `contextBiasFn` hooks in constructor, `execute()`, and `_selectAgent()`
  - `test/orchestrator.test.js` — 4 new tests for context-aware routing
- **Review Notes:**
  - Clean opt-in hooks, zero-impact when not configured
  - Correct ordering: RL learned data > epsilon > context bias > strength affinity
  - Falls back gracefully when hooks return falsy or context is null
  - Validates biased agent is in candidates list before returning
  - Minor: step numbering comments still inconsistent (cosmetic, not worth fixing)
- **Result:** 209 tests passing across 23 test files

### ✅ Plugin System (Kiro → Claude)
- **Date:** 2026-03-02
- **Reviewer:** Claude
- **Status:** APPROVED with 1 minor fix
- **Changes reviewed:**
  - `src/plugin-loader.js` — PluginLoader (validate, register, load, loadDir) + definePlugin helper
  - `plugins/echo-plugin.js` — Reference implementation of the agent plugin contract
  - `test/plugin-loader.test.js` — 15 tests
- **Review Notes:**
  - Clean minimal design. Formal contract: name, version, execute, healthCheck, strengths.
  - loadDir auto-discovers plugins, skips invalid files without crashing.
  - Fix: validate() type checks used truthiness (`if (plugin.execute && ...)`), changed to `!= null` for strict validation.
  - Added `test:plugin` script, wired into `test:all`.
- **Result:** 205 tests passing across 23 test files

### ✅ Orchestrator HITL/Tenancy/Context/Composer Wiring (Kiro → Claude)
- **Date:** 2026-03-02
- **Branch:** main (direct push)
- **Reviewer:** Claude
- **Status:** APPROVED — no bugs found
- **Changes reviewed:**
  - `src/orchestrator.js` — HITL gate before execution, tenancy quota with finally-release, context snapshot in events/RL metadata, composer auto-populated from registerAgent
  - `test/orchestrator.test.js` — 5 new integration tests (HITL approve, HITL reject, tenancy quota, context snapshot, composer)
- **Review Notes:**
  - Clean integration, proper ordering (HITL → tenancy → context → agent selection → execution)
  - `releaseQuota()` in `finally` block handles both success and error paths
  - `shutdown()` correctly calls `hitl.shutdown()` and `context.shutdown()`
  - Minor: step numbering comments inconsistent (not worth fixing)
- **Result:** 190 tests passing across 22 test files

### ✅ Context Providers (Kiro → Claude)
- **Date:** 2026-03-02
- **Branch:** main (direct push)
- **Reviewer:** Claude
- **Status:** APPROVED with 1 fix applied
- **Changes reviewed:**
  - `src/context-providers.js` — ContextManager + 4 built-in providers (Static, Time, Polling, Computed)
  - `test/context-providers.test.js` — 13 tests (12 original + 1 added)
- **Review Notes:**
  - Strengths: Excellent pluggable architecture, TTL caching with stale fallback, ComputedProvider for derived values
  - Fix: Added `shutdown()` to ContextManager — stops all polling providers and clears cache (prevents timer leaks)
  - Added 1 test for shutdown behavior
  - Added `test:context` script and wired into `test:all`
- **Result:** 185 tests passing across 22 test files

### ✅ Composer + HITL + Marketplace + Tenancy (Kiro → Claude)
- **Date:** 2026-03-02
- **Branch:** main (direct push)
- **Reviewer:** Claude
- **Status:** APPROVED with 3 fixes applied
- **Changes reviewed:**
  - `src/composer.js` — Multi-pattern workflow builder (sequential/parallel/fallback)
  - `src/hitl.js` — Human-in-the-loop approval gates with timeout
  - `src/marketplace.js` — Agent publishing, discovery, rating, installation
  - `src/tenancy.js` — Multi-tenant isolation with resource quotas
  - `test/composer.test.js` — 11 tests (9 original + 2 added)
  - `test/hitl.test.js` — 8 tests (7 original + 1 added)
  - `test/marketplace.test.js` — 9 tests (8 original + 1 added)
  - `test/tenancy.test.js` — 9 tests (no changes needed)
- **Review Notes:**
  - Strengths: Clean APIs, good test coverage, proper error handling, nice `recordUsage()` release-function pattern in tenancy
  - Bug 1 (composer): `run()` always called `sequential()` regardless of template intent. No way to define a template with a different pattern. Fixed: `define()` now accepts a `pattern` parameter ('sequential'|'parallel'|'fallback'), `run()` dispatches accordingly.
  - Bug 2 (hitl): No `shutdown()` method — pending gates keep timers alive, preventing clean process exit. Fixed: Added `shutdown()` that resolves all pending as rejected and clears timers.
  - Bug 3 (marketplace): `install()` without version used Map insertion order to pick "latest" — fails if versions published out of order (e.g., `2.0.0` then `1.5.0` patch). Fixed: Added `_latestVersion()` with numeric semver sort.
  - Tenancy: Clean, no bugs found.
  - Added 4 test scripts (`test:composer`, `test:hitl`, `test:marketplace`, `test:tenancy`) and wired into `test:all`
- **Result:** 172 tests passing across 21 test files

### ✅ Multi-Machine Agents (Kiro → Claude)
- **Date:** 2026-03-02
- **Branch:** main (direct push)
- **Reviewer:** Claude
- **Status:** APPROVED with fixes applied
- **Changes reviewed:**
  - `src/remote-agent-runner.js` — Remote runner for any machine
  - `src/agents/remote-agent.js` — Proxy agent for orchestrator
  - `test/remote-agent.test.js` — 6 tests (mock-based)
  - `examples/multi-machine-demo.js` — Multi-machine demo
- **Review Notes:**
  - Strengths: Clean minimal design, good use of existing RedisBus.request() pattern, standard agent interface, proper error propagation
  - Bug 1: CLI arg parser only handled `--key=value`, not `--key value`. Fixed with proper two-form parser.
  - Bug 2: Heartbeat used remote machine's `Date.now()` instead of local receipt time — clock drift vulnerability. Fixed to use `Date.now()` at receipt.
  - Bug 3: Test "starts and sends heartbeat" never called `runner.start()`. Rewrote to actually test the method.
  - Added: Latency tracking (`agent.latency` getter) from heartbeat timestamps
  - Added: 2 new tests — stale heartbeat detection, latency tracking (8 total)
  - Added: `test:remote` script and remote-agent.test.js to `test:all` chain
  - Missing from brief: Per-machine latency reporting in `/api/agents` endpoint (deferred)
- **Result:** 135 tests passing across 17 test files

### ✅ Redis Bus (Kiro → Claude)
- **Date:** 2026-03-02
- **Branch:** main (direct push)
- **Reviewer:** Claude
- **Status:** APPROVED with fixes applied
- **Changes reviewed:**
  - `src/redis-bus.js` — Redis pub/sub drop-in for MessageBus
  - `test/redis-bus.test.js` — 6 tests (mock-based)
  - `examples/redis-bus-demo.js` — Cross-machine demo
- **Review Notes:**
  - Strengths: Clean 100-line implementation, proper namespace isolation, good mock-based tests, matches MessageBus API
  - Bug found: `request()` used `_sub.once('message')` which fires for ANY message, not just the response channel. Fixed with named handler + channel filter.
  - Missing feature: Self-exclusion (original MessageBus filters `fromAgent`). Added.
  - Added 2 new tests for self-exclusion (8 total)
  - Wired into server.js (activates when `REDIS_URL` env is set)
  - Added to test:all chain
- **Result:** 127 tests passing across 16 test files

### ✅ Orchestrator Integration (Claude → Kiro)
- **Date:** 2026-03-02
- **Branch:** main (direct push)
- **Reviewer:** Kiro
- **Status:** ✅ APPROVED with merge
- **Changes:** 
  - Added workflow execution
  - Saga pattern integration
  - Comprehensive tests (8/8)
- **Review Notes:**
  - Strengths: Workflow support, testing, saga pattern
  - Issues: Lost composability, missing optimizer
  - Resolution: Merged best of both versions
  - Result: All tests passing, solid foundation maintained
- **Documentation:** See ORCHESTRATOR_MERGE.md

---

## How to Use

### Request Review
```bash
# Add your request here
## [Your Name] - [Feature Name]
Branch: feature/your-branch
Description: What you built
Tests: X/X passing
Ready for review: [date]
```

### Provide Review
```bash
# Update the entry with your review
Status: ✅ APPROVED / ⚠️ NEEDS CHANGES / 🔄 IN REVIEW
Comments: [Your detailed feedback]
Reviewed by: [Your name]
Date: [Review date]
```

### After Merge
```bash
# Move to "Completed Reviews" section
```

---

**See AI_COLLABORATION_PROTOCOL.md for full process**
