#!/usr/bin/env node

const MessageBus = require('../src/message-bus');

console.log('Testing MessageBus...\n');

let passed = 0;
let failed = 0;

// Test 1: Subscribe and publish
const bus = new MessageBus();
let received = false;

bus.subscribe('agent1', 'test', (msg) => {
  received = true;
  if (msg.data === 'hello') {
    console.log('✓ Test 1: Subscribe and publish');
    passed++;
  } else {
    console.log('✗ Test 1: Wrong message received');
    failed++;
  }
});

bus.publish('test', { data: 'hello' }, 'agent2');

// Test 2: Don't send to self
let selfReceived = false;
bus.subscribe('agent3', 'test2', () => {
  selfReceived = true;
});

bus.publish('test2', { data: 'test' }, 'agent3');

setTimeout(() => {
  if (!selfReceived) {
    console.log('✓ Test 2: Does not send to self');
    passed++;
  } else {
    console.log('✗ Test 2: Sent to self');
    failed++;
  }
  
  // Test 3: Request-response
  testRequestResponse();
}, 100);

async function testRequestResponse() {
  bus.subscribe('responder', 'request', (msg) => {
    bus.publish(msg.responseId, { result: 'ok' }, 'responder');
  });
  
  try {
    const result = await bus.request('request', { data: 'test' }, 'requester', 1000);
    if (result.result === 'ok') {
      console.log('✓ Test 3: Request-response');
      passed++;
    } else {
      console.log('✗ Test 3: Wrong response');
      failed++;
    }
  } catch (error) {
    console.log('✗ Test 3: Request failed');
    failed++;
  }
  
  printResults();
}

function printResults() {
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed === 0) {
    console.log('✅ All tests passed!\n');
    process.exit(0);
  } else {
    console.log('❌ Some tests failed\n');
    process.exit(1);
  }
}
