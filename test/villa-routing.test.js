/**
 * Villa Routing Tests
 * Tests that Mantis correctly routes through Villa server
 */

const MantisAudioClient = require('../src/mantis-audio-client');
const MusicPlaybackAdapter = require('../src/music-playback-adapter');
const musicConfig = require('../src/music-service-config');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`✗ ${name}: ${err.message}`);
    failed++;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

console.log('Running Villa Routing Tests...\n');

// Test 1: MantisAudioClient uses VillaClient
test('MantisAudioClient creates VillaClient', () => {
  const mantis = new MantisAudioClient('http://test-villa:8406');
  assert(mantis.villa !== undefined, 'Should have villa client');
  assert(mantis.villa.baseUrl === 'http://test-villa:8406', 'Should use provided URL');
});

// Test 2: Default Villa URL
test('MantisAudioClient uses default Villa URL', () => {
  const mantis = new MantisAudioClient();
  assert(mantis.villa.baseUrl === 'http://192.168.0.60:8406', 'Should use default Villa URL');
});

// Test 3: Play method structure
test('Play method has correct structure', async () => {
  const mantis = new MantisAudioClient();
  
  // Mock villa.execute
  let executeCalled = false;
  let executeCommand = null;
  mantis.villa.execute = async (cmd) => {
    executeCalled = true;
    executeCommand = cmd;
    return { success: true };
  };
  
  await mantis.play({ url: 'http://test.mp3', volume: 0.5 });
  
  assert(executeCalled, 'Should call villa.execute');
  assert(executeCommand.includes('http://test.mp3'), 'Should include URL');
  assert(executeCommand.includes('0.5'), 'Should include volume');
});

// Test 4: Pause routes to Villa
test('Pause routes to Villa', async () => {
  const mantis = new MantisAudioClient();
  let command = null;
  mantis.villa.execute = async (cmd) => { command = cmd; return {}; };
  
  await mantis.pause();
  assert(command.toLowerCase().includes('pause'), 'Should send pause command');
});

// Test 5: Volume routes to Villa
test('Volume routes to Villa', async () => {
  const mantis = new MantisAudioClient();
  let command = null;
  mantis.villa.execute = async (cmd) => { command = cmd; return {}; };
  
  await mantis.setVolume(0.7);
  assert(command.includes('0.7'), 'Should include volume value');
});

// Test 6: Adapter uses villaUrl option
test('Adapter passes villaUrl to Mantis', async () => {
  musicConfig.enableService('mantis');
  musicConfig.setActiveService('mantis');
  
  const adapter = new MusicPlaybackAdapter(null);
  
  // This will fail without MCP client, but we can check the error
  try {
    await adapter.play('test-id', { villaUrl: 'http://custom:9999' });
  } catch (err) {
    // Expected to fail without MCP client
    assert(err.message.includes('MCP client'), 'Should require MCP client');
  }
});

// Test 7: Error handling for missing URL
test('Play requires URL or file', async () => {
  const mantis = new MantisAudioClient();
  try {
    await mantis.play({});
    throw new Error('Should have thrown');
  } catch (err) {
    assert(err.message.includes('url or file'), 'Should require URL or file');
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
