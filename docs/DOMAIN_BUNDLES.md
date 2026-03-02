# Pre-Packaged Domain Bundles

## Overview
One-command execution of complete workflows for common scenarios.

---

## 1. Music Feature Bundle

**Command:**
```bash
kiro-cli bundle music-feature "Build playlist recommendation feature"
```

**Workflow:**
```
1. music-researcher (understand context)
2. music-planner (create plan with estimates)
3. music-validator (validate plan)
4. music-general (implement backend)
5. music-frontend (implement UI)
6. music-qa (create test plan)
7. music-validator (validate implementation)
8. music-docs (document feature)
```

**Estimated Time:** 2-3 days
**Validation Gates:** 2 (after planning, after implementation)
**Security Gates:** 0 (add if needed)

**Configuration:**
```json
{
  "name": "music-feature",
  "description": "Complete Music feature development workflow",
  "mode": "thorough",
  "agents": [
    "music-researcher",
    "music-planner",
    "music-validator",
    "music-general",
    "music-frontend",
    "music-qa",
    "music-validator",
    "music-docs"
  ],
  "validationGates": [
    { "after": "music-planner", "agent": "music-validator" },
    { "after": "music-frontend", "agent": "music-validator" }
  ],
  "parallelSteps": [
    { "agents": ["music-general", "music-frontend"], "after": "music-validator" }
  ]
}
```

---

## 2. Security Bundle

**Command:**
```bash
kiro-cli bundle security "Audit authentication system"
```

**Workflow:**
```
1. prreddy-researcher (analyze current implementation)
2. prreddy-auditor (identify vulnerabilities)
3. music-validator (validate findings)
4. prreddy-planner (create remediation plan)
5. prreddy-auditor (review plan)
6. prreddy-coder (implement fixes)
7. prreddy-auditor (verify fixes)
8. music-qa (security testing)
9. music-validator (final validation)
10. prreddy-writer (security documentation)
```

**Estimated Time:** 1 week
**Validation Gates:** 2 (after findings, after fixes)
**Security Gates:** 3 (after plan, after implementation, final)

**Configuration:**
```json
{
  "name": "security",
  "description": "Complete security audit and remediation workflow",
  "mode": "thorough",
  "agents": [
    "prreddy-researcher",
    "prreddy-auditor",
    "music-validator",
    "prreddy-planner",
    "prreddy-auditor",
    "prreddy-coder",
    "prreddy-auditor",
    "music-qa",
    "music-validator",
    "prreddy-writer"
  ],
  "validationGates": [
    { "after": "prreddy-auditor", "agent": "music-validator" },
    { "after": "prreddy-coder", "agent": "music-validator" }
  ],
  "securityGates": [
    { "after": "prreddy-planner", "agent": "prreddy-auditor" },
    { "after": "prreddy-coder", "agent": "prreddy-auditor" },
    { "after": "music-qa", "agent": "prreddy-auditor" }
  ]
}
```

---

## 3. Incident Response Bundle

**Command:**
```bash
kiro-cli bundle incident "API returning 500 errors"
```

**Workflow:**
```
1. music-logs (gather logs and metrics)
2. music-rca (root cause analysis)
3. prreddy-researcher (analyze affected code)
4. music-validator (validate hypothesis)
5. gpu-dev (implement fix)
6. music-qa (verify fix)
7. music-validator (validate resolution)
8. music-docs (incident report)
```

**Estimated Time:** 2-4 hours
**Validation Gates:** 2 (after RCA, after fix)
**Security Gates:** 0 (fast-track mode)

**Configuration:**
```json
{
  "name": "incident",
  "description": "Fast incident response and resolution workflow",
  "mode": "fast-track",
  "agents": [
    "music-logs",
    "music-rca",
    "prreddy-researcher",
    "music-validator",
    "gpu-dev",
    "music-qa",
    "music-validator",
    "music-docs"
  ],
  "validationGates": [
    { "after": "music-rca", "agent": "music-validator" },
    { "after": "gpu-dev", "agent": "music-validator" }
  ],
  "parallelSteps": [
    { "agents": ["music-logs", "prreddy-researcher"], "after": "start" }
  ]
}
```

---

## 4. Performance Optimization Bundle

**Command:**
```bash
kiro-cli bundle performance "Optimize slow API endpoint"
```

**Workflow:**
```
1. music-logs (gather performance metrics)
2. prreddy-performance (identify bottlenecks)
3. prreddy-researcher (analyze code)
4. music-validator (validate findings)
5. prreddy-planner (optimization plan)
6. prreddy-coder (implement optimizations)
7. music-qa (performance testing)
8. music-validator (validate improvements)
9. prreddy-writer (document optimizations)
```

**Estimated Time:** 1-2 days
**Validation Gates:** 2 (after analysis, after implementation)

**Configuration:**
```json
{
  "name": "performance",
  "description": "Performance analysis and optimization workflow",
  "mode": "thorough",
  "agents": [
    "music-logs",
    "prreddy-performance",
    "prreddy-researcher",
    "music-validator",
    "prreddy-planner",
    "prreddy-coder",
    "music-qa",
    "music-validator",
    "prreddy-writer"
  ],
  "validationGates": [
    { "after": "prreddy-performance", "agent": "music-validator" },
    { "after": "prreddy-coder", "agent": "music-validator" }
  ],
  "parallelSteps": [
    { "agents": ["music-logs", "prreddy-researcher"], "after": "start" }
  ]
}
```

---

## 5. API Design Bundle

**Command:**
```bash
kiro-cli bundle api-design "Design playlist management API"
```

**Workflow:**
```
1. music-researcher (understand requirements)
2. prreddy-api-designer (design API contract)
3. music-validator (validate design)
4. prreddy-auditor (security review)
5. music-general (implement backend)
6. music-frontend (implement client)
7. music-qa (API testing)
8. music-validator (validate implementation)
9. music-docs (API documentation)
```

**Estimated Time:** 3-5 days
**Validation Gates:** 2 (after design, after implementation)
**Security Gates:** 1 (after design)

**Configuration:**
```json
{
  "name": "api-design",
  "description": "Complete API design and implementation workflow",
  "mode": "thorough",
  "agents": [
    "music-researcher",
    "prreddy-api-designer",
    "music-validator",
    "prreddy-auditor",
    "music-general",
    "music-frontend",
    "music-qa",
    "music-validator",
    "music-docs"
  ],
  "validationGates": [
    { "after": "prreddy-api-designer", "agent": "music-validator" },
    { "after": "music-frontend", "agent": "music-validator" }
  ],
  "securityGates": [
    { "after": "prreddy-api-designer", "agent": "prreddy-auditor" }
  ],
  "parallelSteps": [
    { "agents": ["music-general", "music-frontend"], "after": "prreddy-auditor" }
  ]
}
```

---

## 6. Database Migration Bundle

**Command:**
```bash
kiro-cli bundle db-migration "Migrate users table to PostgreSQL"
```

**Workflow:**
```
1. prreddy-researcher (analyze current schema)
2. prreddy-db-migration (plan migration)
3. music-validator (validate plan)
4. prreddy-coder (implement migration scripts)
5. music-qa (test migration)
6. prreddy-db-migration (verify rollback)
7. music-validator (validate migration)
8. prreddy-writer (migration documentation)
```

**Estimated Time:** 2-3 days
**Validation Gates:** 2 (after plan, after implementation)

**Configuration:**
```json
{
  "name": "db-migration",
  "description": "Safe database migration workflow",
  "mode": "thorough",
  "agents": [
    "prreddy-researcher",
    "prreddy-db-migration",
    "music-validator",
    "prreddy-coder",
    "music-qa",
    "prreddy-db-migration",
    "music-validator",
    "prreddy-writer"
  ],
  "validationGates": [
    { "after": "prreddy-db-migration", "agent": "music-validator" },
    { "after": "music-qa", "agent": "music-validator" }
  ]
}
```

---

## 7. Documentation Sprint Bundle

**Command:**
```bash
kiro-cli bundle docs "Document authentication system"
```

**Workflow:**
```
1. prreddy-researcher (analyze code)
2. music-researcher (gather context)
3. prreddy-writer (technical docs)
4. gpu-wiki (wiki entries)
5. music-docs (Music-specific docs)
6. music-validator (validate documentation)
```

**Estimated Time:** 1 day
**Validation Gates:** 1 (final)

**Configuration:**
```json
{
  "name": "docs",
  "description": "Comprehensive documentation workflow",
  "mode": "thorough",
  "agents": [
    "prreddy-researcher",
    "music-researcher",
    "prreddy-writer",
    "gpu-wiki",
    "music-docs",
    "music-validator"
  ],
  "validationGates": [
    { "after": "music-docs", "agent": "music-validator" }
  ],
  "parallelSteps": [
    { "agents": ["prreddy-researcher", "music-researcher"], "after": "start" },
    { "agents": ["prreddy-writer", "gpu-wiki", "music-docs"], "after": "music-researcher" }
  ]
}
```

---

## Implementation

### bundle-executor.js
```javascript
#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const ContextStore = require('./context-store');

const bundles = {
  'music-feature': require('./bundles/music-feature.json'),
  'security': require('./bundles/security.json'),
  'incident': require('./bundles/incident.json'),
  'performance': require('./bundles/performance.json'),
  'api-design': require('./bundles/api-design.json'),
  'db-migration': require('./bundles/db-migration.json'),
  'docs': require('./bundles/docs.json')
};

function executeBundle(bundleName, taskDescription) {
  const bundle = bundles[bundleName];
  if (!bundle) {
    console.error(`Bundle not found: ${bundleName}`);
    console.log('Available bundles:', Object.keys(bundles).join(', '));
    process.exit(1);
  }
  
  const taskId = `bundle-${Date.now()}`;
  const store = new ContextStore(taskId);
  
  console.log(`\\n🎯 Executing Bundle: ${bundle.name}`);
  console.log(`📋 Description: ${bundle.description}`);
  console.log(`⚡ Mode: ${bundle.mode}`);
  console.log(`📝 Task: "${taskDescription}"\\n`);
  
  console.log('Workflow Steps:');
  bundle.agents.forEach((agent, i) => {
    console.log(`  ${i + 1}. ${agent}`);
    
    // Check for validation gates
    const validationGate = bundle.validationGates?.find(g => g.after === agent);
    if (validationGate) {
      console.log(`     ✓ Validation: ${validationGate.agent}`);
    }
    
    // Check for security gates
    const securityGate = bundle.securityGates?.find(g => g.after === agent);
    if (securityGate) {
      console.log(`     🔒 Security: ${securityGate.agent}`);
    }
  });
  
  console.log('\\nTo execute:');
  bundle.agents.forEach((agent, i) => {
    console.log(`kiro-cli chat --agent ${agent} --task-id ${taskId}`);
  });
  
  console.log(`\\nContext stored at: ${store.storePath}`);
}

// CLI
if (require.main === module) {
  const bundleName = process.argv[2];
  const taskDescription = process.argv.slice(3).join(' ');
  
  if (!bundleName || !taskDescription) {
    console.log('Usage: node bundle-executor.js <bundle-name> "task description"');
    console.log('\\nAvailable bundles:');
    Object.entries(bundles).forEach(([name, bundle]) => {
      console.log(`  ${name}: ${bundle.description}`);
    });
    process.exit(1);
  }
  
  executeBundle(bundleName, taskDescription);
}

module.exports = { executeBundle, bundles };
```

---

## Usage Examples

### Music Feature
```bash
kiro-cli bundle music-feature "Build personalized playlist recommendations"
```

### Security Audit
```bash
kiro-cli bundle security "Audit authentication and authorization system"
```

### Incident Response
```bash
kiro-cli bundle incident "API returning 500 errors for playlist endpoints"
```

### Performance
```bash
kiro-cli bundle performance "Optimize slow search endpoint"
```

---

## Benefits

1. **One Command:** Execute complete workflows
2. **Best Practices:** Pre-configured validation and security gates
3. **Consistency:** Same workflow every time
4. **Time Savings:** No manual agent selection
5. **Context Preservation:** Automatic handoffs
6. **Metrics:** Track bundle success rates

---

## Customization

### Create Custom Bundle
```json
{
  "name": "my-custom-bundle",
  "description": "Custom workflow for my use case",
  "mode": "thorough",
  "agents": ["agent1", "agent2", "agent3"],
  "validationGates": [
    { "after": "agent1", "agent": "music-validator" }
  ]
}
```

### Override Bundle Settings
```bash
kiro-cli bundle music-feature "task" --mode fast-track --skip-validation
```
