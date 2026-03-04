/**
 * Mantis Integration Test
 * Tests Mantis audio client and music service integration
 */

const MantisAudioClient = require('../src/mantis-audio-client');
const musicConfig = require('../src/music-service-config');
const MusicPlaybackAdapter = require('../src/music-playback-adapter');

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

console.log('Running Mantis Integration Tests...\n');

// Test 1: Mantis has priority 1
test('Mantis has priority 1', () => {
  assert(musicConfig.services.mantis.priority === 1, 'Mantis should be priority 1');
  assert(musicConfig.services.amazonMusic.priority === 2, 'Amazon Music should be priority 2');
});

// Test 2: Mantis capabilities
test('Mantis has correct capabilities', () => {
  const caps = musicConfig.services.mantis.capabilities;
  assert(caps.includes('playback'), 'Should have playback');
  assert(caps.includes('audio_control'), 'Should have audio_control');
  assert(caps.includes('local_audio'), 'Should have local_audio');
});

// Test 3: Mantis is first when both enabled
test('Mantis is first in available services', () => {
  musicConfig.enableService('mantis');
  musicConfig.enableService('amazonMusic');
  const available = musicConfig.getAvailableServices();
  assert(available[0].name === 'Mantis', 'Mantis should be first');
  assert(available[1].name === 'Amazon Music', 'Amazon Music should be second');
});

// Test 4: Mantis auto-selected as active
test('Mantis auto-selected when enabled first', () => {
  // Reset
  musicConfig.activeService = null;
  Object.keys(musicConfig.services).forEach(k => {
    musicConfig.services[k].enabled = false;
  });
  
  musicConfig.enableService('mantis');
  assert(musicConfig.activeService === 'mantis', 'Mantis should be active');
});

// Test 5: MantisAudioClient structure
test('MantisAudioClient has required methods', () => {
  const client = new MantisAudioClient();
  assert(typeof client.play === 'function', 'Should have play method');
  assert(typeof client.pause === 'function', 'Should have pause method');
  assert(typeof client.stop === 'function', 'Should have stop method');
  assert(typeof client.setVolume === 'function', 'Should have setVolume method');
  assert(typeof client.getStatus === 'function', 'Should have getStatus method');
});

// Test 6: Adapter uses Mantis when active
test('Adapter recognizes Mantis as active service', () => {
  musicConfig.setActiveService('mantis');
  const adapter = new MusicPlaybackAdapter(null);
  const info = adapter.getServiceInfo();
  assert(info.active === 'mantis', 'Active service should be Mantis');
  assert(info.service.name === 'Mantis', 'Service name should be Mantis');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
