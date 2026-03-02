#!/usr/bin/env node
/**
 * Event Store Demo - Time travel debugging
 */
const EventStore = require('../src/event-store');

console.log('🎬 Event Store Demo - Time Travel Debugging\n');

// Create event store
const store = new EventStore();

// Simulate a task lifecycle
console.log('📝 Task lifecycle:');
const e1 = store.append('task-1', 'TASK_CREATED', { name: 'Build event store', assignee: 'agent-1' });
console.log(`  ${new Date(e1.timestamp).toISOString()} - Task created`);

setTimeout(() => {
  const e2 = store.append('task-1', 'TASK_STARTED', { startedBy: 'agent-1' });
  console.log(`  ${new Date(e2.timestamp).toISOString()} - Task started`);
  
  setTimeout(() => {
    const e3 = store.append('task-1', 'TASK_COMPLETED', { completedBy: 'agent-1', result: 'success' });
    console.log(`  ${new Date(e3.timestamp).toISOString()} - Task completed`);
    
    // Replay to get final state
    console.log('\n🔄 Replaying events:');
    const reducer = (state, event) => {
      console.log(`  Processing: ${event.eventType}`);
      if (event.eventType === 'TASK_CREATED') return { ...state, ...event.data, status: 'created' };
      if (event.eventType === 'TASK_STARTED') return { ...state, status: 'started' };
      if (event.eventType === 'TASK_COMPLETED') return { ...state, status: 'completed', result: event.data.result };
      return state;
    };
    
    const finalState = store.replay('task-1', reducer, {});
    console.log('\n📊 Final state:', finalState);
    
    // Time travel to middle of execution
    console.log('\n⏰ Time travel to after task started:');
    const midState = store.getStateAt('task-1', e2.timestamp, reducer, {});
    console.log('  State at that time:', midState);
    
    // Subscribe to future events
    console.log('\n📡 Subscribing to future events:');
    store.subscribe('TASK_FAILED', (event) => {
      console.log(`  🚨 Task failed: ${event.data.reason}`);
    });
    
    store.append('task-2', 'TASK_FAILED', { reason: 'Timeout' });
    
    console.log('\n✅ Demo complete!');
  }, 100);
}, 100);
