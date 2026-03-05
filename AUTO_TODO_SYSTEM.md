# Auto-TODO System - Idle Time Task Execution

## Concept
Use distributed CPU downtime to automatically work through TODO lists without manual intervention.

## Architecture

```
Idle Monitor → Task Queue → Worker Pool → Execute → Report Results
     ↓              ↓            ↓           ↓          ↓
  CPU < 30%    Prioritize   9 cores    Run task   Update TODO
  Load < 2.0   by impact    available   w/ agent   Mark complete
```

## Components

### 1. Idle Monitor (`src/idle-monitor.js`)
**Detects system downtime:**
- CPU usage < 30%
- Load average < 2.0
- No active user sessions
- Time window: 2am-6am or user-defined

### 2. Task Queue (`src/auto-todo-queue.js`)
**Prioritizes tasks:**
- Parse MASTER_TODO.md and project TODOs
- Score by: impact, dependencies, estimated time
- Filter: automatable tasks only (no human decisions)
- Queue: high priority first

### 3. Task Executor (`src/auto-executor.js`)
**Runs tasks autonomously:**
- Research tasks → web search + summarize
- Code tasks → generate + test + commit
- Documentation → write + review
- Analysis → run + report

### 4. Result Reporter (`src/auto-reporter.js`)
**Documents outcomes:**
- Update TODO with results
- Commit changes to git
- Generate summary report
- Notify on completion

## Task Types (Automatable)

### ✓ Can Auto-Execute
- **Research** - "Research vector databases"
  - Web search, compare options, create summary
- **Documentation** - "Write API reference"
  - Extract from code, generate docs, commit
- **Testing** - "Add unit tests for X"
  - Generate tests, run, commit if passing
- **Code generation** - "Implement embedding service"
  - Generate boilerplate, basic implementation
- **Analysis** - "Review performance metrics"
  - Collect data, analyze, create report
- **Backup** - "Run backup script"
  - Execute, verify, report status

### ✗ Cannot Auto-Execute (Need Human)
- Design decisions
- Architecture choices
- User preference questions
- Production deployments
- Security-sensitive changes

## Configuration

### Auto-TODO Config (`auto-todo.config.js`)
```javascript
module.exports = {
  enabled: true,
  
  // When to run
  schedule: {
    idleThreshold: 0.3,      // CPU < 30%
    loadThreshold: 2.0,       // Load < 2.0
    quietHours: ['02:00', '06:00'],  // 2am-6am
    checkInterval: 300000     // Check every 5 min
  },
  
  // What to run
  tasks: {
    maxConcurrent: 3,         // Max parallel tasks
    maxDuration: 3600000,     // 1 hour max per task
    autoCommit: true,         // Auto-commit results
    requireReview: true       // Flag for human review
  },
  
  // Safety limits
  limits: {
    maxFilesChanged: 10,      // Max files per task
    maxLinesChanged: 500,     // Max LOC per task
    noProductionChanges: true // Never touch production
  }
}
```

## Implementation Plan

### Phase 1: Monitoring (Week 1)
- [ ] Build idle monitor
- [ ] Parse TODO files
- [ ] Score and prioritize tasks
- [ ] Test detection logic

### Phase 2: Execution (Week 2)
- [ ] Implement task executor
- [ ] Add safety checks
- [ ] Test with simple tasks (research, docs)
- [ ] Add rollback capability

### Phase 3: Reporting (Week 3)
- [ ] Build result reporter
- [ ] Git integration
- [ ] Notification system
- [ ] Dashboard for monitoring

### Phase 4: Production (Week 4)
- [ ] Deploy to mech mac
- [ ] Monitor first runs
- [ ] Tune thresholds
- [ ] Expand task types

## Example Auto-Execution

### Task: "Research vector databases"
```
1. Idle detected (CPU 15%, Load 0.8, 3:00am)
2. Queue task (priority: high, estimated: 30min)
3. Execute:
   - Web search: Redis, Qdrant, Chroma, Weaviate
   - Compare features, performance, integration
   - Generate comparison table
   - Write summary document
4. Commit: "Auto-research: Vector database comparison"
5. Update TODO: Mark complete, add link to doc
6. Report: "Completed research task in 18 minutes"
```

### Task: "Add unit tests for auth.js"
```
1. Idle detected
2. Queue task (priority: medium, estimated: 45min)
3. Execute:
   - Analyze auth.js functions
   - Generate test cases
   - Write test/auth-auto.test.js
   - Run tests (all pass)
4. Commit: "Auto-test: Add auth.js unit tests"
5. Update TODO: Mark complete
6. Report: "Added 12 tests, 100% coverage"
```

## Safety Features

### Pre-execution Checks
- Verify git clean state
- Check no production env vars
- Confirm file permissions
- Validate task scope

### During Execution
- Monitor resource usage
- Enforce time limits
- Track file changes
- Log all actions

### Post-execution
- Run tests before commit
- Create review branch (not main)
- Flag for human review
- Rollback on failure

## Monitoring Dashboard

### Real-time View
```
Auto-TODO Status
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Status: IDLE (waiting for downtime)
Next check: 4 minutes

Completed Today: 3 tasks
  ✓ Research vector databases (18 min)
  ✓ Write API docs (32 min)
  ✓ Add unit tests (41 min)

Queued: 4 tasks
  1. Implement embedding service (est. 2h)
  2. Redis persistence setup (est. 45m)
  3. Update backup strategy (est. 30m)
  4. Performance analysis (est. 1h)

System:
  CPU: 15% | Load: 0.8 | Time: 03:15am
```

## Benefits

### Productivity
- Work continues 24/7
- Utilize idle resources
- Reduce backlog automatically

### Efficiency
- 9-core parallel execution
- No context switching
- Consistent quality

### Cost
- Free compute (already owned)
- No cloud costs
- Maximize hardware ROI

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Bad code generated | Review branch + tests required |
| System instability | Resource limits + monitoring |
| Wrong decisions | Only automatable tasks |
| Security issues | No production access |
| Data loss | Git + backups |

## Next Steps

1. Add to MASTER_TODO.md
2. Create auto-todo.config.js
3. Implement idle monitor
4. Test with research tasks
5. Expand to code generation

---

**Status:** Design complete, ready for implementation
**Estimated effort:** 4 weeks
**ROI:** High (24/7 productivity with existing hardware)
