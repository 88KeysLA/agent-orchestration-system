# Agent Workflow Modes

## Fast-Track Mode

**When to Use:**
- P0/P1 incidents
- Production outages
- Critical bugs
- Time-sensitive hotfixes

**Characteristics:**
- Skip planning phase
- Minimal documentation
- Quick validation only
- Single agent when possible

**Example Workflows:**

### Bug Fix (Fast-Track)
```
1. gpu-dev (implement fix)
2. music-qa (smoke test)
```
**Time:** 30 minutes

### Incident Response (Fast-Track)
```
1. music-logs (identify issue)
2. gpu-dev (quick fix)
3. music-validator (verify)
```
**Time:** 1 hour

---

## Thorough Mode

**When to Use:**
- New features
- Architecture changes
- Security-critical work
- Production releases

**Characteristics:**
- Full planning phase
- Comprehensive documentation
- Multiple validation gates
- Security checkpoints

**Example Workflows:**

### Feature Development (Thorough)
```
1. music-researcher (analyze context)
   Validation: Review findings
2. music-planner (create plan)
   Validation: music-validator (validate assumptions)
3. music-general (implement)
   Validation: prreddy-auditor (security review)
4. music-docs (document)
   Validation: Review documentation
5. music-qa (test)
   Validation: music-validator (validate results)
```
**Time:** 2-3 days

### Security Feature (Thorough)
```
1. eos (design architecture)
   Validation: prreddy-auditor (design review)
2. prreddy-planner (implementation plan)
   Validation: music-validator (validate plan)
3. prreddy-coder (implement)
   Validation: prreddy-auditor (code review)
4. prreddy-coder (fix issues)
   Validation: prreddy-auditor (re-review)
5. music-qa (security testing)
   Validation: music-validator (validate security)
```
**Time:** 1 week

---

## Validation Gates

### After Planning
**Agent:** music-validator
**Purpose:** Validate assumptions and estimates
**Criteria:**
- Plan is achievable
- Dependencies identified
- Risks assessed
- Timeline realistic

### After Implementation
**Agent:** prreddy-auditor (security) or music-qa (functionality)
**Purpose:** Verify quality before deployment
**Criteria:**
- Code meets standards
- Security vulnerabilities addressed
- Tests pass
- Documentation complete

### Before Deployment
**Agent:** music-validator
**Purpose:** Final evidence-based review
**Criteria:**
- All requirements met
- Performance acceptable
- Security verified
- Rollback plan ready

---

## Security Checkpoints

### Design Phase
**Agent:** prreddy-auditor
**Review:** Architecture and design patterns
**Focus:**
- Authentication/authorization design
- Data flow security
- API security
- Encryption requirements

### Implementation Phase
**Agent:** prreddy-auditor
**Review:** Code and implementation
**Focus:**
- Input validation
- SQL injection prevention
- XSS prevention
- Secret management

### Pre-Deployment
**Agent:** prreddy-auditor
**Review:** Final security verification
**Focus:**
- Dependency vulnerabilities
- Configuration security
- Access controls
- Logging/monitoring

---

## Mode Selection Decision Tree

```
Is it P0/P1? → Fast-Track
  ↓ No
Is it security-critical? → Thorough
  ↓ No
Is it production release? → Thorough
  ↓ No
Is it complex (>3 days)? → Thorough
  ↓ No
Is it simple fix? → Fast-Track
  ↓ No
Default → Thorough
```

---

## Mode Comparison

| Aspect | Fast-Track | Thorough |
|--------|-----------|----------|
| **Planning** | Minimal | Comprehensive |
| **Validation** | Smoke test | Multiple gates |
| **Documentation** | Inline only | Full docs |
| **Security Review** | Post-deployment | Pre-deployment |
| **Time** | Hours | Days |
| **Risk** | Higher | Lower |
| **Best For** | Incidents | Features |

---

## Switching Modes Mid-Workflow

### Fast-Track → Thorough
**Trigger:** Issue more complex than expected
**Action:**
1. Pause fast-track workflow
2. Run prreddy-researcher to analyze
3. Switch to thorough mode
4. Continue with planning phase

### Thorough → Fast-Track
**Trigger:** Urgent production issue discovered
**Action:**
1. Save thorough workflow progress
2. Switch to fast-track for hotfix
3. Return to thorough workflow after fix

---

## Implementation

### CLI Flag
```bash
# Fast-track mode
kiro-cli chat --agent gpu-dev --mode fast-track

# Thorough mode (default)
kiro-cli chat --agent music-researcher --mode thorough
```

### Meta-Router Integration
```bash
# Auto-detect mode
node meta-agent-router.js "URGENT: API down"
# → Selects fast-track mode

node meta-agent-router.js "Build new feature"
# → Selects thorough mode
```

---

## Metrics to Track

### Fast-Track
- Time to resolution
- Incident recurrence rate
- Post-deployment issues

### Thorough
- Requirements coverage
- Security vulnerabilities found
- Post-deployment bugs
- Documentation completeness
