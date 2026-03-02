# Agent Metrics and Learning System

## Overview
Track agent performance, learn from successes/failures, and continuously improve agent selection.

---

## Metrics to Track

### 1. Agent Performance
```json
{
  "agent": "gpu-dev",
  "metrics": {
    "totalInvocations": 1247,
    "successRate": 0.94,
    "averageCompletionTime": "15m",
    "userSatisfaction": 4.6,
    "commonTasks": [
      { "task": "bug fix", "count": 523, "successRate": 0.97 },
      { "task": "quick feature", "count": 412, "successRate": 0.91 }
    ],
    "failurePatterns": [
      { "pattern": "complex architecture", "count": 34 },
      { "pattern": "security requirements", "count": 21 }
    ]
  }
}
```

### 2. Workflow Performance
```json
{
  "pattern": "Research-Plan-Build-Document",
  "metrics": {
    "totalExecutions": 89,
    "successRate": 0.87,
    "averageTime": "2.3 days",
    "commonFailures": [
      { "step": "planning", "reason": "incomplete requirements", "count": 7 },
      { "step": "implementation", "reason": "technical complexity", "count": 5 }
    ]
  }
}
```

### 3. Bundle Performance
```json
{
  "bundle": "music-feature",
  "metrics": {
    "totalExecutions": 34,
    "successRate": 0.91,
    "averageTime": "2.1 days",
    "validationPassRate": 0.94,
    "securityIssuesFound": 12,
    "userSatisfaction": 4.7
  }
}
```

### 4. Task Type Analysis
```json
{
  "taskType": "bugFix",
  "metrics": {
    "totalTasks": 523,
    "averageResolutionTime": "45m",
    "recurrenceRate": 0.08,
    "mostSuccessfulAgent": "gpu-dev",
    "leastSuccessfulAgent": "prreddy-coder"
  }
}
```

---

## Data Collection

### Metric Collection Points

1. **Task Start**
   - Task description
   - Selected agent(s)
   - Estimated time
   - Mode (fast-track/thorough)

2. **Agent Execution**
   - Start time
   - End time
   - Output quality
   - Errors encountered

3. **Validation Gates**
   - Pass/fail
   - Issues found
   - Time to fix

4. **Task Completion**
   - Total time
   - User satisfaction
   - Post-deployment issues

### metrics-collector.js
```javascript
const fs = require('fs');
const path = require('path');

class MetricsCollector {
  constructor() {
    this.metricsPath = path.join(process.env.HOME, '.kiro', 'metrics');
    this.ensureMetricsDir();
  }

  ensureMetricsDir() {
    if (!fs.existsSync(this.metricsPath)) {
      fs.mkdirSync(this.metricsPath, { recursive: true });
    }
  }

  recordTaskStart(taskId, taskDescription, agents, mode) {
    const record = {
      taskId,
      taskDescription,
      agents,
      mode,
      startTime: new Date().toISOString(),
      status: 'in_progress'
    };
    
    this.saveRecord('tasks', taskId, record);
  }

  recordAgentExecution(taskId, agent, startTime, endTime, success, output) {
    const record = {
      taskId,
      agent,
      startTime,
      endTime,
      duration: (new Date(endTime) - new Date(startTime)) / 1000,
      success,
      outputLength: output?.length || 0
    };
    
    this.appendRecord('agent-executions', record);
    this.updateAgentMetrics(agent, success, record.duration);
  }

  recordValidation(taskId, agent, target, result, issues) {
    const record = {
      taskId,
      agent,
      target,
      result,
      issuesFound: issues.length,
      timestamp: new Date().toISOString()
    };
    
    this.appendRecord('validations', record);
  }

  recordTaskCompletion(taskId, success, userSatisfaction, postDeploymentIssues) {
    const task = this.loadRecord('tasks', taskId);
    task.endTime = new Date().toISOString();
    task.duration = (new Date(task.endTime) - new Date(task.startTime)) / 1000;
    task.success = success;
    task.userSatisfaction = userSatisfaction;
    task.postDeploymentIssues = postDeploymentIssues;
    task.status = 'completed';
    
    this.saveRecord('tasks', taskId, task);
    this.updateWorkflowMetrics(task);
  }

  updateAgentMetrics(agent, success, duration) {
    const metricsFile = path.join(this.metricsPath, 'agent-metrics.json');
    let metrics = {};
    
    if (fs.existsSync(metricsFile)) {
      metrics = JSON.parse(fs.readFileSync(metricsFile, 'utf8'));
    }
    
    if (!metrics[agent]) {
      metrics[agent] = {
        totalInvocations: 0,
        successCount: 0,
        totalDuration: 0,
        satisfactionSum: 0,
        satisfactionCount: 0
      };
    }
    
    metrics[agent].totalInvocations++;
    if (success) metrics[agent].successCount++;
    metrics[agent].totalDuration += duration;
    
    fs.writeFileSync(metricsFile, JSON.stringify(metrics, null, 2));
  }

  updateWorkflowMetrics(task) {
    // Implementation for workflow metrics
  }

  saveRecord(type, id, record) {
    const filePath = path.join(this.metricsPath, type, `${id}.json`);
    const dir = path.dirname(filePath);
    
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    fs.writeFileSync(filePath, JSON.stringify(record, null, 2));
  }

  loadRecord(type, id) {
    const filePath = path.join(this.metricsPath, type, `${id}.json`);
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
    return null;
  }

  appendRecord(type, record) {
    const filePath = path.join(this.metricsPath, `${type}.jsonl`);
    fs.appendFileSync(filePath, JSON.stringify(record) + '\\n');
  }

  getAgentMetrics(agent) {
    const metricsFile = path.join(this.metricsPath, 'agent-metrics.json');
    if (fs.existsSync(metricsFile)) {
      const metrics = JSON.parse(fs.readFileSync(metricsFile, 'utf8'));
      return metrics[agent] || null;
    }
    return null;
  }

  generateReport() {
    const metricsFile = path.join(this.metricsPath, 'agent-metrics.json');
    if (!fs.existsSync(metricsFile)) {
      return { error: 'No metrics available' };
    }
    
    const metrics = JSON.parse(fs.readFileSync(metricsFile, 'utf8'));
    
    const report = {
      agents: {},
      topPerformers: [],
      needsImprovement: []
    };
    
    for (const [agent, data] of Object.entries(metrics)) {
      const successRate = data.successCount / data.totalInvocations;
      const avgDuration = data.totalDuration / data.totalInvocations;
      const avgSatisfaction = data.satisfactionCount > 0 
        ? data.satisfactionSum / data.satisfactionCount 
        : 0;
      
      report.agents[agent] = {
        invocations: data.totalInvocations,
        successRate: successRate.toFixed(2),
        avgDuration: `${Math.round(avgDuration)}s`,
        avgSatisfaction: avgSatisfaction.toFixed(1)
      };
      
      if (successRate >= 0.9 && avgSatisfaction >= 4.5) {
        report.topPerformers.push(agent);
      } else if (successRate < 0.7 || avgSatisfaction < 3.5) {
        report.needsImprovement.push(agent);
      }
    }
    
    return report;
  }
}

module.exports = MetricsCollector;
```

---

## Learning System

### Pattern Recognition

```javascript
class PatternLearner {
  constructor(metricsCollector) {
    this.metrics = metricsCollector;
  }

  learnSuccessPatterns() {
    // Analyze successful tasks
    const successfulTasks = this.getSuccessfulTasks();
    
    const patterns = {
      agentCombinations: {},
      taskTypes: {},
      timeEstimates: {}
    };
    
    successfulTasks.forEach(task => {
      // Learn which agent combinations work well
      const key = task.agents.join('→');
      if (!patterns.agentCombinations[key]) {
        patterns.agentCombinations[key] = { count: 0, avgTime: 0, successRate: 0 };
      }
      patterns.agentCombinations[key].count++;
      
      // Learn time estimates
      const taskType = this.classifyTask(task.taskDescription);
      if (!patterns.timeEstimates[taskType]) {
        patterns.timeEstimates[taskType] = [];
      }
      patterns.timeEstimates[taskType].push(task.duration);
    });
    
    return patterns;
  }

  learnFailurePatterns() {
    // Analyze failed tasks
    const failedTasks = this.getFailedTasks();
    
    const patterns = {
      commonFailures: {},
      agentWeaknesses: {}
    };
    
    failedTasks.forEach(task => {
      // Identify common failure reasons
      const reason = this.identifyFailureReason(task);
      if (!patterns.commonFailures[reason]) {
        patterns.commonFailures[reason] = 0;
      }
      patterns.commonFailures[reason]++;
      
      // Identify agent weaknesses
      task.agents.forEach(agent => {
        if (!patterns.agentWeaknesses[agent]) {
          patterns.agentWeaknesses[agent] = [];
        }
        patterns.agentWeaknesses[agent].push(reason);
      });
    });
    
    return patterns;
  }

  recommendAgent(taskDescription) {
    const patterns = this.learnSuccessPatterns();
    const taskType = this.classifyTask(taskDescription);
    
    // Find most successful agent for this task type
    let bestAgent = null;
    let bestScore = 0;
    
    for (const [combination, data] of Object.entries(patterns.agentCombinations)) {
      const agents = combination.split('→');
      const score = data.successRate * data.count;
      
      if (score > bestScore) {
        bestScore = score;
        bestAgent = agents[0];
      }
    }
    
    return bestAgent;
  }
}
```

---

## Dashboard

### CLI Commands

```bash
# View agent metrics
kiro-cli metrics agent gpu-dev

# View workflow metrics
kiro-cli metrics workflow Research-Plan-Build-Document

# View bundle metrics
kiro-cli metrics bundle music-feature

# Generate report
kiro-cli metrics report

# Compare agents
kiro-cli metrics compare gpu-dev prreddy-coder

# View trends
kiro-cli metrics trends --last 30d
```

### Sample Output

```
🤖 Agent Metrics: gpu-dev

📊 Performance:
  Total Invocations: 1,247
  Success Rate: 94%
  Avg Completion Time: 15m
  User Satisfaction: 4.6/5.0

✅ Top Tasks:
  1. Bug fixes (523) - 97% success
  2. Quick features (412) - 91% success
  3. Hotfixes (189) - 95% success

❌ Failure Patterns:
  1. Complex architecture (34 failures)
  2. Security requirements (21 failures)
  3. Database migrations (15 failures)

💡 Recommendations:
  - Use for: Bug fixes, quick features, hotfixes
  - Avoid for: Complex architecture, security-critical work
  - Pair with: prreddy-auditor for security, eos for architecture
```

---

## Continuous Improvement

### Feedback Loop

1. **Collect Metrics** → Track every task
2. **Analyze Patterns** → Identify success/failure patterns
3. **Update Rules** → Adjust meta-router rules
4. **Test Changes** → A/B test new rules
5. **Measure Impact** → Compare before/after metrics

### Auto-Tuning

```javascript
class AutoTuner {
  constructor(metricsCollector, patternLearner) {
    this.metrics = metricsCollector;
    this.learner = patternLearner;
  }

  tune() {
    const successPatterns = this.learner.learnSuccessPatterns();
    const failurePatterns = this.learner.learnFailurePatterns();
    
    // Update agent selection rules
    const newRules = this.generateRules(successPatterns, failurePatterns);
    
    // Test new rules
    const testResults = this.testRules(newRules);
    
    // Apply if better
    if (testResults.improvement > 0.05) {
      this.applyRules(newRules);
      console.log(`✅ Applied new rules. Improvement: ${testResults.improvement * 100}%`);
    }
  }
}
```

---

## Next Steps

1. Implement MetricsCollector class
2. Integrate with meta-router and bundles
3. Create CLI commands
4. Build dashboard
5. Implement learning system
6. Set up auto-tuning
