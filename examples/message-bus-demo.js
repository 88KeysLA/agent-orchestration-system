#!/usr/bin/env node

const MessageBus = require('../src/message-bus');

console.log('🚀 Agent Message Bus Demo\n');

const bus = new MessageBus();

// Agent 1: Validator
bus.subscribe('validator', 'validate', (msg) => {
  console.log('📝 Validator received code:', msg.code);
  
  const valid = !msg.code.includes('eval'); // Simple validation
  const result = { valid, code: msg.code };
  
  console.log(`✓ Validation result: ${valid ? 'PASS' : 'FAIL'}\n`);
  
  bus.publish(msg.responseId, result, 'validator');
});

// Agent 2: Coder
async function coder() {
  console.log('💻 Coder: Writing code...');
  
  try {
    const result = await bus.request(
      'validate',
      { code: 'console.log("Hello World")' },
      'coder',
      2000
    );
    
    console.log('💻 Coder: Received validation:', result);
    
    if (result.valid) {
      console.log('✅ Code approved! Deploying...\n');
    } else {
      console.log('❌ Code rejected! Fixing...\n');
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

// Run demo
coder();

console.log('✨ Demo complete! Agents communicated successfully.\n');
