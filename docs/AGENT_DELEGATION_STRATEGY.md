# Agent Delegation Strategy

## Principle
**Always delegate to specialist agents when available.** Don't do work yourself that a specialist can do better.

## Available Specialist Agents

### Development & Code
- **prreddy-coder** - Writes code, runs tests, creates commits and code reviews
- **prreddy-researcher** - Finds files, traces code paths, documents how things work
- **prreddy-auditor** - Reviews code with embedded guidelines
- **music-frontend** - UI/UX implementation, React components, mobile interfaces
- **music-general** - Backend logic, general coding tasks, feature implementation

### Testing & QA
- **prreddy-ui-tester** - Validates web UIs using Playwright browser automation
- **music-qa** - Test plan creation, automation strategy, test code generation
- **music-validator** - Verifies findings, challenges assumptions, ensures evidence-based conclusions

### Planning & Documentation
- **prreddy-planner** - Creates detailed plans from requirements
- **music-planner** - Creates detailed work breakdowns, TODO lists, success criteria
- **music-docs** - Creates READMEs, guides, API docs, technical documentation
- **prreddy-writer** - Creates, edits, improves written content

### Operations & Debugging
- **music-logs** - CloudWatch logs, metrics, health checks
- **music-rca** - Investigates production incidents, analyzes system failures
- **music-fps-qa-oncall** - Handles production incidents, MCM notifications, escalations
- **music-utility** - SIM tickets, Jira issues, Pipeline checks, operational tools

### Project Management
- **prreddy-jira** - Manages tickets, creates issues, tracks work items
- **music-flow** - Account creation, user journeys, testing flows, customer lifecycle

### Research & Knowledge
- **music-researcher** - Searches team documentation, BRDs, test plans, tech designs
- **music-catalog** - Query 22M entities, 80M relationships, sonic embeddings
- **music-spec** - Code package analysis, dependency understanding

## Delegation Rules

### When to Delegate
1. **UI Testing** → Always use `prreddy-ui-tester`
2. **Code Writing** → Use `prreddy-coder` for implementation
3. **Code Review** → Use `prreddy-auditor` for quality checks
4. **Planning** → Use `prreddy-planner` or `music-planner` for work breakdown
5. **Documentation** → Use `music-docs` or `prreddy-writer`
6. **Debugging Production** → Use `music-rca` or `music-logs`
7. **Test Creation** → Use `music-qa` for test strategies
8. **Jira Management** → Use `prreddy-jira` for ticket operations

### When NOT to Delegate
- Simple file operations (read/write)
- Quick bash commands
- Direct API calls
- Simple grep/search operations
- When context is too large (>80K tokens)

## Implementation Pattern

```javascript
// Before doing work, check if specialist exists
if (task.type === 'ui-testing') {
  return delegateTo('prreddy-ui-tester', task);
}

if (task.type === 'code-writing') {
  return delegateTo('prreddy-coder', task);
}

if (task.type === 'planning') {
  return delegateTo('prreddy-planner', task);
}

// Only do work yourself if no specialist exists
return doWorkDirectly(task);
```

## Context Management

### To Enable Delegation
1. **Keep context lean** - Don't accumulate massive conversation history
2. **Checkpoint regularly** - Save state, start fresh sessions
3. **Use focused queries** - Give specialists specific, bounded tasks
4. **Parallel execution** - Invoke multiple specialists simultaneously when tasks are independent

### Checkpointing Strategy
- Every 50K tokens → Create checkpoint
- Before major task switches → Save and reload
- When delegation fails due to context → Checkpoint and retry in new session

## For This Project (AIP Dashboard)

### Current Task: UI Testing
**Should delegate to:** `prreddy-ui-tester`
**Why:** Specialist has Playwright automation, can test live URLs
**Blocker:** Context window too large (100K+ tokens)
**Solution:** Checkpoint now, start fresh, delegate

### Next Tasks
1. **Code improvements** → `prreddy-coder`
2. **Test creation** → `music-qa`
3. **Documentation** → `music-docs`
4. **Production monitoring** → `music-logs`

## Action Items

### Immediate
1. ✅ Create this delegation strategy document
2. ⏭️ Checkpoint current session
3. ⏭️ Start fresh session
4. ⏭️ Delegate UI testing to `prreddy-ui-tester`

### Ongoing
- Always check for specialist before doing work
- Suggest delegation when appropriate
- Checkpoint proactively to enable delegation
- Use parallel delegation for independent tasks

## Success Metrics
- % of tasks delegated to specialists (target: >70%)
- Context window usage (target: <80K tokens)
- Task completion quality (specialists should outperform general agent)
- Time to completion (parallel delegation should be faster)
