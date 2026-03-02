#!/usr/bin/env node
// Example: Using multiple Claude instances as specialized agents

const ClaudeOrchestrator = require('../src/claude-orchestrator');

async function main() {
  // Check for API key
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log('❌ Please set ANTHROPIC_API_KEY environment variable');
    console.log('   export ANTHROPIC_API_KEY=your-key-here');
    process.exit(1);
  }
  
  console.log('🚀 Claude Multi-Agent Orchestration Demo\n');
  
  const orchestrator = new ClaudeOrchestrator(process.env.ANTHROPIC_API_KEY);
  
  // Register specialized Claude agents
  orchestrator.registerAgent('gpu-dev', `
You are gpu-dev, a fast minimal coder.
Write only essential code, no boilerplate.
Keep implementations under 50 lines.
Focus on speed and simplicity.
  `.trim());
  
  orchestrator.registerAgent('prreddy-coder', `
You are prreddy-coder, a quality-focused developer.
Write production-ready code with error handling.
Include comprehensive validation and edge cases.
Focus on maintainability and robustness.
  `.trim());
  
  orchestrator.registerAgent('prreddy-auditor', `
You are prreddy-auditor, a security expert.
Review code for vulnerabilities and security issues.
Provide actionable recommendations with severity levels.
Focus on security best practices.
  `.trim());
  
  console.log('\n📋 Running tasks...\n');
  
  // Task 1: Quick coding task
  const result1 = await orchestrator.executeTask(
    'Write a JavaScript function to validate email addresses',
    'quick-coding'
  );
  console.log('Result preview:', result1.result.substring(0, 100) + '...\n');
  
  // Task 2: Quality coding task
  const result2 = await orchestrator.executeTask(
    'Write a robust function to parse and validate JSON with error handling',
    'quality-coding'
  );
  console.log('Result preview:', result2.result.substring(0, 100) + '...\n');
  
  // Task 3: Security review
  const result3 = await orchestrator.executeTask(
    'Review this code for security issues: function login(user, pass) { return db.query("SELECT * FROM users WHERE user=\'" + user + "\' AND pass=\'" + pass + "\'"); }',
    'security-review'
  );
  console.log('Result preview:', result3.result.substring(0, 100) + '...\n');
  
  // Show learning stats
  console.log('\n📊 RL Learning Stats:');
  const stats = orchestrator.getStats();
  Object.entries(stats).forEach(([key, data]) => {
    console.log(`  ${key}: Q=${data.qValue.toFixed(2)}, count=${data.count}`);
  });
  
  console.log('\n✅ Demo complete!\n');
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
