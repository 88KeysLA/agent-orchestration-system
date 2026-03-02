# Agent Stack Fixes

## 1. music-rca: Conversation History Error

### Issue
Agent failed with "conversation history error" during testing.

### Root Cause Analysis
Likely causes:
1. Context window overflow
2. Malformed message format
3. Missing conversation state
4. Tool response parsing error

### Fix Strategy
```javascript
// Add to music-rca configuration
{
  "maxContextLength": 100000,
  "contextManagement": "sliding_window",
  "errorRecovery": {
    "onContextOverflow": "summarize_and_continue",
    "onParseError": "retry_with_cleanup",
    "maxRetries": 3
  }
}
```

### Testing
```bash
# Test with various scenarios
kiro-cli chat --agent music-rca
> "Investigate 500 errors in playlist API"

# Test with long context
kiro-cli chat --agent music-rca --context-file large-logs.txt
> "Analyze these logs"

# Test error recovery
kiro-cli chat --agent music-rca --simulate-error
```

---

## 2. kiro_planner: Remove References

### Issue
Agent not found, but referenced in documentation.

### Action Items
1. Remove from AGENT_TESTING_RESULTS.md
2. Remove from agent selection automation
3. Update all workflow documentation
4. Add deprecation notice

### Files to Update
```bash
# Search for references
grep -r "kiro_planner" /Users/mattser/aip-leadership-dashboard/

# Files to update:
- AGENT_TESTING_RESULTS.md
- AGENT_SELECTION_AUTOMATION.md
- meta-agent-router.js
- Any workflow documentation
```

### Replacement Guide
```
Old: kiro_planner
New: prreddy-planner (for implementation plans)
     music-planner (for PM-style plans)
```

---

## 3. AWS Authentication Setup

### Issue
Many Music agents require AWS authentication but setup not documented.

### Required Setup

#### For Music Agents
```bash
# 1. Install AWS CLI
brew install awscli

# 2. Configure credentials
aws configure
# AWS Access Key ID: [your-key]
# AWS Secret Access Key: [your-secret]
# Default region: us-east-1

# 3. For Amazon internal tools (mwinit)
mwinit -o

# 4. For Tessitura (music-catalog)
ada credentials update --account=052380404757 --role=tessitura-read-only

# 5. Verify access
aws sts get-caller-identity
```

#### Agent-Specific Requirements

**music-logs**
```bash
# Requires CloudWatch access
aws logs describe-log-groups --region us-east-1
```

**music-rca**
```bash
# Requires CloudWatch + X-Ray access
aws xray get-service-graph --start-time $(date -u -d '1 hour ago' +%s) --end-time $(date -u +%s)
```

**music-catalog**
```bash
# Requires Tessitura Lambda access
ada credentials update --account=052380404757 --role=tessitura-read-only
```

**music-spec**
```bash
# Requires Spec Studio access
mwinit -o
brazil ws use --package MusicSpecStudio
```

**music-flow**
```bash
# Requires customer account creation access
mwinit -o
# Additional permissions may be required
```

### Documentation
Create `AWS_SETUP_GUIDE.md`:
```markdown
# AWS Setup for Music Agents

## Prerequisites
- AWS CLI installed
- Amazon internal network access (for mwinit)
- Appropriate IAM permissions

## Setup Steps
[detailed steps above]

## Troubleshooting
[common issues and solutions]

## Agent Requirements Matrix
| Agent | AWS CLI | mwinit | Tessitura | Spec Studio |
|-------|---------|--------|-----------|-------------|
| music-logs | ✅ | ❌ | ❌ | ❌ |
| music-rca | ✅ | ❌ | ❌ | ❌ |
| music-catalog | ✅ | ✅ | ✅ | ❌ |
| music-spec | ✅ | ✅ | ❌ | ✅ |
| music-flow | ✅ | ✅ | ❌ | ❌ |
```

---

## 4. Agent Configuration Validation

### Issue
No validation that agents are properly configured before use.

### Solution
Add configuration validator.

### Implementation
```javascript
// agent-validator.js
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

class AgentValidator {
  async validateAgent(agentName) {
    const requirements = this.getRequirements(agentName);
    const results = {
      agent: agentName,
      valid: true,
      checks: []
    };
    
    for (const req of requirements) {
      const check = await this.checkRequirement(req);
      results.checks.push(check);
      if (!check.passed) {
        results.valid = false;
      }
    }
    
    return results;
  }
  
  getRequirements(agentName) {
    const requirements = {
      'music-logs': ['aws-cli', 'cloudwatch-access'],
      'music-rca': ['aws-cli', 'cloudwatch-access', 'xray-access'],
      'music-catalog': ['aws-cli', 'mwinit', 'tessitura-access'],
      'music-spec': ['aws-cli', 'mwinit', 'spec-studio'],
      'music-flow': ['aws-cli', 'mwinit']
    };
    
    return requirements[agentName] || [];
  }
  
  async checkRequirement(requirement) {
    const checks = {
      'aws-cli': async () => {
        try {
          await execPromise('aws --version');
          return { passed: true, message: 'AWS CLI installed' };
        } catch (error) {
          return { passed: false, message: 'AWS CLI not installed', fix: 'brew install awscli' };
        }
      },
      'cloudwatch-access': async () => {
        try {
          await execPromise('aws logs describe-log-groups --max-items 1');
          return { passed: true, message: 'CloudWatch access verified' };
        } catch (error) {
          return { passed: false, message: 'No CloudWatch access', fix: 'Configure AWS credentials' };
        }
      },
      'mwinit': async () => {
        try {
          await execPromise('which mwinit');
          return { passed: true, message: 'mwinit available' };
        } catch (error) {
          return { passed: false, message: 'mwinit not found', fix: 'Install Amazon internal tools' };
        }
      }
    };
    
    const check = checks[requirement];
    if (!check) {
      return { requirement, passed: true, message: 'Unknown requirement' };
    }
    
    const result = await check();
    return { requirement, ...result };
  }
}

// CLI
if (require.main === module) {
  const agentName = process.argv[2];
  
  if (!agentName) {
    console.log('Usage: node agent-validator.js <agent-name>');
    process.exit(1);
  }
  
  const validator = new AgentValidator();
  validator.validateAgent(agentName).then(results => {
    console.log(`\\n🔍 Validating ${results.agent}\\n`);
    
    results.checks.forEach(check => {
      const icon = check.passed ? '✅' : '❌';
      console.log(`${icon} ${check.requirement}: ${check.message}`);
      if (!check.passed && check.fix) {
        console.log(`   Fix: ${check.fix}`);
      }
    });
    
    console.log(`\\n${results.valid ? '✅ Agent ready to use' : '❌ Agent not ready - fix issues above'}\\n`);
    process.exit(results.valid ? 0 : 1);
  });
}

module.exports = AgentValidator;
```

### Usage
```bash
# Validate agent before use
node agent-validator.js music-catalog

# Output:
🔍 Validating music-catalog

✅ aws-cli: AWS CLI installed
✅ mwinit: mwinit available
❌ tessitura-access: No Tessitura access
   Fix: ada credentials update --account=052380404757 --role=tessitura-read-only

❌ Agent not ready - fix issues above
```

---

## 5. Error Handling Improvements

### Issue
Agents fail without helpful error messages.

### Solution
Add structured error handling.

### Implementation
```javascript
// error-handler.js
class AgentError extends Error {
  constructor(agent, errorType, message, fix) {
    super(message);
    this.agent = agent;
    this.errorType = errorType;
    this.fix = fix;
  }
  
  toString() {
    return `
❌ ${this.agent} Error: ${this.errorType}

Message: ${this.message}

Fix: ${this.fix}

Need help? Run: kiro-cli help ${this.agent}
    `.trim();
  }
}

// Common error types
const ErrorTypes = {
  AUTH_REQUIRED: 'Authentication Required',
  MISSING_TOOL: 'Missing Tool',
  INVALID_INPUT: 'Invalid Input',
  CONTEXT_OVERFLOW: 'Context Overflow',
  TIMEOUT: 'Timeout',
  UNKNOWN: 'Unknown Error'
};

// Error recovery strategies
const RecoveryStrategies = {
  AUTH_REQUIRED: 'Run authentication setup',
  MISSING_TOOL: 'Install required tool',
  INVALID_INPUT: 'Check input format',
  CONTEXT_OVERFLOW: 'Reduce context size',
  TIMEOUT: 'Retry with smaller scope',
  UNKNOWN: 'Check logs for details'
};

module.exports = { AgentError, ErrorTypes, RecoveryStrategies };
```

---

## Testing Plan

### 1. music-rca Fix
```bash
# Test basic functionality
kiro-cli chat --agent music-rca
> "Investigate API errors"

# Test with large context
kiro-cli chat --agent music-rca --context-file large-logs.txt

# Test error recovery
# (simulate various error conditions)
```

### 2. kiro_planner Removal
```bash
# Verify no references remain
grep -r "kiro_planner" /Users/mattser/aip-leadership-dashboard/
# Should return no results

# Test replacement agents
kiro-cli chat --agent prreddy-planner
kiro-cli chat --agent music-planner
```

### 3. AWS Setup
```bash
# Test each Music agent
for agent in music-logs music-rca music-catalog music-spec music-flow; do
  echo "Testing $agent..."
  node agent-validator.js $agent
done
```

### 4. Error Handling
```bash
# Test error messages
kiro-cli chat --agent music-catalog  # Without auth
# Should show helpful error with fix

kiro-cli chat --agent music-spec  # Without mwinit
# Should show helpful error with fix
```

---

## Rollout Plan

### Week 1: Critical Fixes
- [ ] Fix music-rca conversation history error
- [ ] Remove kiro_planner references
- [ ] Create AWS setup documentation

### Week 2: Validation & Error Handling
- [ ] Implement agent validator
- [ ] Add structured error handling
- [ ] Test all Music agents

### Week 3: Documentation & Training
- [ ] Update all documentation
- [ ] Create troubleshooting guide
- [ ] Train team on new setup
