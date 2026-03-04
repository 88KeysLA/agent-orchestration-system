/**
 * Music Service Configuration Tests
 */

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

console.log('Running Music Service Configuration Tests...\n');

// Reset state
musicConfig.activeService = null;
Object.keys(musicConfig.services).forEach(key => {
  musicConfig.services[key].enabled = false;
});

test('Initial state has no active service', () => {
  assert(musicConfig.activeService === null, 'Should have no active service');
  assert(musicConfig.getAvailableServices().length === 0, 'Should have no available services');
});

test('Can enable Amazon Music', () => {
  musicConfig.enableService('amazonMusic');
  assert(musicConfig.services.amazonMusic.enabled === true, 'Amazon Music should be enabled');
  assert(musicConfig.activeService === 'amazonMusic', 'Should auto-set as active');
});

test('Can check capabilities', () => {
  assert(musicConfig.hasCapability('playback') === true, 'Should have playback');
  assert(musicConfig.hasCapability('search') === true, 'Should have search');
  assert(musicConfig.hasCapability('invalid') === false, 'Should not have invalid capability');
});

test('Can enable Mantis', () => {
  musicConfig.enableService('mantis');
  assert(musicConfig.services.mantis.enabled === true, 'Mantis should be enabled');
  assert(musicConfig.getAvailableServices().length === 2, 'Should have 2 services');
});

test('Can switch active service', () => {
  musicConfig.setActiveService('mantis');
  assert(musicConfig.activeService === 'mantis', 'Should switch to Mantis');
  assert(musicConfig.getActiveService().name === 'Mantis', 'Should get Mantis config');
});

test('Cannot enable unknown service', () => {
  try {
    musicConfig.enableService('unknown');
    throw new Error('Should have thrown');
  } catch (err) {
    assert(err.message.includes('Unknown service'), 'Should throw unknown service error');
  }
});

test('Cannot switch to disabled service', () => {
  try {
    musicConfig.setActiveService('spotify');
    throw new Error('Should have thrown');
  } catch (err) {
    assert(err.message.includes('not enabled'), 'Should throw not enabled error');
  }
});

test('Adapter returns service info', () => {
  musicConfig.setActiveService('amazonMusic');
  const adapter = new MusicPlaybackAdapter(null);
  const info = adapter.getServiceInfo();
  assert(info.active === 'amazonMusic', 'Should show active service');
  assert(info.service.name === 'Amazon Music', 'Should show service name');
  assert(info.available.length === 2, 'Should show available services');
});

test('Adapter requires MCP client for playback', async () => {
  const adapter = new MusicPlaybackAdapter(null);
  try {
    await adapter.play('test-id');
    throw new Error('Should have thrown');
  } catch (err) {
    assert(err.message.includes('MCP client'), 'Should require MCP client');
  }
});

test('Adapter requires MCP client for search', async () => {
  const adapter = new MusicPlaybackAdapter(null);
  try {
    await adapter.search('test query');
    throw new Error('Should have thrown');
  } catch (err) {
    assert(err.message.includes('MCP client'), 'Should require MCP client');
  }
});

test('Services sorted by priority', () => {
  const available = musicConfig.getAvailableServices();
  assert(available[0].name === 'Mantis', 'Mantis should be first (priority 1)');
  assert(available[1].name === 'Amazon Music', 'Amazon Music should be second (priority 2)');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
