# Agent Stack Quick Reference Card

## 🚀 Quick Commands

```bash
# Intelligent agent selection
node meta-agent-router.js "your task"

# Pre-packaged workflows
kiro-cli bundle music-feature "task"
kiro-cli bundle security "task"
kiro-cli bundle incident "task"

# Validate agent setup
node agent-validator.js <agent-name>

# View metrics
kiro-cli metrics agent <agent-name>
kiro-cli metrics report
```

---

## 🎯 Agent Selection (30-Second Guide)

| I need to... | Use this agent |
|--------------|----------------|
| Fix bug NOW | `gpu-dev` |
| Debug issue | `prreddy-debugger` |
| Optimize performance | `prreddy-performance` |
| Design API | `prreddy-api-designer` |
| Migrate database | `prreddy-db-migration` |
| Build Music feature | `music-general` |
| Security audit | `prreddy-auditor` |
| Design architecture | `eos` |
| Write docs | `prreddy-writer` |
| Investigate incident | `music-logs` + `music-rca` |

---

## 📦 Pre-Packaged Bundles

| Bundle | Time | Use For |
|--------|------|---------|
| `music-feature` | 2-3 days | New Music features |
| `security` | 1 week | Security audits |
| `incident` | 2-4 hours | Production incidents |
| `performance` | 1-2 days | Performance optimization |
| `api-design` | 3-5 days | API design & implementation |
| `db-migration` | 2-3 days | Database migrations |
| `docs` | 1 day | Documentation sprints |

---

## ⚡ Fast-Track vs Thorough

### Fast-Track (Incidents)
- Skip planning
- Minimal validation
- Quick fixes
- Use: P0/P1 incidents

### Thorough (Features)
- Full planning
- Multiple validation gates
- Security checkpoints
- Use: New features, production releases

---

## ✅ Validation Gates

1. **After Planning** → `music-validator`
2. **After Implementation** → `prreddy-auditor`
3. **Before Deployment** → `music-validator`

---

## 🔧 New Capabilities

### Error Recovery (gpu-dev)
Automatically retries with fixes for common errors

### Implementation Validation (music-validator)
Validates code, not just claims

### Cost Estimation (eos)
Includes AWS cost estimates in architecture

### Auto-Fix (prreddy-auditor)
Generates fixes for security vulnerabilities

---

## 📊 Metrics

```bash
# Agent performance
kiro-cli metrics agent gpu-dev
# → Success: 94%, Time: 15m, Rating: 4.6/5

# Workflow performance
kiro-cli metrics workflow Research-Plan-Build-Document
# → Success: 87%, Time: 2.3 days

# Top performers
kiro-cli metrics report
```

---

## 🐛 Troubleshooting

### Agent not working?
```bash
node agent-validator.js <agent-name>
# Shows missing requirements and fixes
```

### Need AWS access?
```bash
# Install AWS CLI
brew install awscli

# Configure
aws configure

# For Music agents
mwinit -o
ada credentials update --account=052380404757 --role=tessitura-read-only
```

### Context overflow?
Use fast-track mode or reduce scope

---

## 📚 Documentation

- `AGENT_STACK_SUPERCHARGE.md` - Complete overview
- `AGENT_CONSOLIDATION_PLAN.md` - Agent changes
- `NEW_SPECIALIZED_AGENTS.md` - New agents
- `AGENT_WORKFLOW_MODES.md` - Fast-track vs thorough
- `DOMAIN_BUNDLES.md` - Pre-packaged workflows
- `METRICS_AND_LEARNING.md` - Metrics system
- `AGENT_ENHANCEMENTS.md` - Enhanced capabilities
- `AGENT_STACK_FIXES.md` - Bug fixes

---

## 🎓 Decision Tree

```
Is it urgent? → YES → Fast-track mode → gpu-dev
    ↓ NO
Is it Music-specific? → YES → music-* agents
    ↓ NO
Is it security-critical? → YES → Include prreddy-auditor
    ↓ NO
Is it complex? → YES → Thorough mode → Full workflow
    ↓ NO
Simple task → gpu-dev or prreddy-coder
```

---

## 💡 Pro Tips

1. **Let the router decide**: `node meta-agent-router.js "task"`
2. **Use bundles for common workflows**: `kiro-cli bundle <name> "task"`
3. **Validate before use**: `node agent-validator.js <agent>`
4. **Track metrics**: `kiro-cli metrics report`
5. **Check context**: Agents now share knowledge automatically

---

## 🚨 Anti-Patterns (Avoid These)

❌ Using prreddy-coder + prreddy-dev (redundant)
❌ Using gpu-dev for production code (too minimal)
❌ Skipping validation gates (quality issues)
❌ Using generic agents for Music work (missing context)
❌ Not checking agent setup (authentication failures)

---

## ✨ What's New

### Removed
- ❌ prreddy-dev (use prreddy-coder or gpu-dev)
- ❌ kiro_planner (use prreddy-planner or music-planner)

### Added
- ✅ prreddy-debugger (interactive debugging)
- ✅ prreddy-performance (performance optimization)
- ✅ prreddy-api-designer (API design)
- ✅ prreddy-db-migration (database migrations)

### Enhanced
- 🔧 gpu-dev (error recovery)
- 🔧 music-validator (implementation validation)
- 🔧 eos (cost estimation)
- 🔧 prreddy-auditor (auto-fix)

---

## 📞 Need Help?

```bash
# View agent help
kiro-cli help <agent-name>

# View bundle help
kiro-cli help bundle <bundle-name>

# View metrics help
kiro-cli help metrics
```

---

**Print this card and keep it handy!** 📋
