# Agent Consolidation & Deprecation Plan

## Redundant Agents to Remove

### 1. prreddy-dev → DEPRECATED
**Reason:** Nearly identical to prreddy-coder, no meaningful differentiation
**Replacement:** Use `prreddy-coder` for module-focused development
**Migration:** All prreddy-dev workflows → prreddy-coder

### 2. kiro_planner → REMOVED
**Reason:** Agent not found, references should be removed
**Replacement:** Use `prreddy-planner` or `music-planner`
**Action:** Remove all references from documentation

## Primary Agent Recommendations

### Development
- **Primary:** `gpu-dev` - Fast, minimal, instruction-aware
- **Alternative:** `prreddy-coder` - When you need comprehensive error handling
- **Deprecated:** ~~prreddy-dev~~

### Writing
- **Interactive:** `prreddy-writer` - Asks questions first, custom content
- **Immediate:** `music-docs` - Produces immediately with Music context
- **Use Case Guide:**
  - Need custom format/tone → prreddy-writer
  - Music technical docs → music-docs
  - Wiki entries → gpu-wiki
  - Concise articles → gpu-writing

### Planning
- **Implementation:** `prreddy-planner` - Step-by-step for developers
- **Project Management:** `music-planner` - Time estimates for stakeholders
- **Architecture:** `eos` - System design and integration

## Consolidation Benefits

1. **Reduced Confusion:** Clear primary agent for each task type
2. **Better Performance:** Focus improvements on fewer agents
3. **Easier Maintenance:** Less duplication in prompts/configs
4. **Faster Selection:** Simpler decision tree

## Migration Guide

### For prreddy-dev Users
```bash
# Old
kiro-cli chat --agent prreddy-dev

# New
kiro-cli chat --agent prreddy-coder  # For comprehensive code
kiro-cli chat --agent gpu-dev        # For quick fixes
```

### For kiro_planner Users
```bash
# Old
kiro-cli chat --agent kiro_planner

# New
kiro-cli chat --agent prreddy-planner  # For implementation plans
kiro-cli chat --agent music-planner    # For PM-style plans
```

## Updated Agent Selection Quick Reference

**"I need to..."**
- **...fix a bug quickly** → gpu-dev
- **...write production code** → prreddy-coder
- **...write documentation** → prreddy-writer (custom) or music-docs (Music)
- **...create implementation plan** → prreddy-planner
- **...create PM plan with estimates** → music-planner
- **...design architecture** → eos

## Deprecation Timeline

- **Immediate:** Remove kiro_planner references
- **Week 1:** Update all documentation
- **Week 2:** Add deprecation warnings to prreddy-dev
- **Week 3:** Remove prreddy-dev from agent list
