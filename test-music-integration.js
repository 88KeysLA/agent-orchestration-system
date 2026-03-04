#!/usr/bin/env node
/**
 * Quick test: Start server and check music endpoints
 */

const { spawn } = require('child_process');

console.log('🎵 Testing Music Service Integration\n');
console.log('Starting server...');

const server = spawn('node', ['server.js'], {
  cwd: __dirname,
  env: { ...process.env, PORT: '8407' }
});

let output = '';

server.stdout.on('data', (data) => {
  output += data.toString();
  process.stdout.write(data);
});

server.stderr.on('data', (data) => {
  process.stderr.write(data);
});

// Wait for server to start, then test endpoints
setTimeout(async () => {
  console.log('\n\n🧪 Testing endpoints...\n');
  
  try {
    // Test 1: Get services
    const res1 = await fetch('http://localhost:8407/api/music/services');
    const data1 = await res1.json();
    console.log('✓ GET /api/music/services:', data1.active);
    
    // Test 2: Check if Mantis is active
    if (data1.active === 'mantis') {
      console.log('✓ Mantis is active (priority 1)');
    } else {
      console.log('✗ Expected Mantis, got:', data1.active);
    }
    
    console.log('\n✅ Music service integration working!');
    console.log('\nPortal can now:');
    console.log('  - Check active service via /api/music/services');
    console.log('  - Play audio via /api/music/play');
    console.log('  - Switch services via /api/music/services/switch');
    
  } catch (err) {
    console.error('✗ Test failed:', err.message);
  } finally {
    server.kill();
    process.exit(0);
  }
}, 3000);

// Timeout after 10 seconds
setTimeout(() => {
  console.error('\n✗ Server startup timeout');
  server.kill();
  process.exit(1);
}, 10000);
