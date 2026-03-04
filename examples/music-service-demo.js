/**
 * Music Service Configuration Demo
 * Shows how to configure and switch between music streaming services
 */

const musicConfig = require('../src/music-service-config');
const MusicPlaybackAdapter = require('../src/music-playback-adapter');

console.log('🎵 Music Service Configuration Demo\n');

// 1. Show initial state
console.log('1. Initial state:');
console.log('   Active service:', musicConfig.activeService || 'none');
console.log('   Available services:', musicConfig.getAvailableServices().length);
console.log();

// 2. Enable Amazon Music
console.log('2. Enabling Amazon Music...');
musicConfig.enableService('amazonMusic');
console.log('   Active service:', musicConfig.activeService);
console.log('   Has playback capability:', musicConfig.hasCapability('playback'));
console.log('   Has search capability:', musicConfig.hasCapability('search'));
console.log();

// 3. Enable Mantis
console.log('3. Enabling Mantis...');
musicConfig.enableService('mantis');
console.log('   Available services:', musicConfig.getAvailableServices().map(s => s.name).join(', '));
console.log();

// 4. Switch to Mantis
console.log('4. Switching to Mantis...');
musicConfig.setActiveService('mantis');
console.log('   Active service:', musicConfig.activeService);
console.log('   Service info:', musicConfig.getActiveService().name);
console.log();

// 5. Switch back to Amazon Music
console.log('5. Switching back to Amazon Music...');
musicConfig.setActiveService('amazonMusic');
console.log('   Active service:', musicConfig.activeService);
console.log();

// 6. Show adapter usage (without actual MCP client)
console.log('6. Music Playback Adapter usage:');
const adapter = new MusicPlaybackAdapter(null);
console.log('   Service info:', JSON.stringify(adapter.getServiceInfo(), null, 2));
console.log();

console.log('✅ Demo complete!');
console.log('\nTo use with actual playback:');
console.log('  1. Configure MCP client with Amazon Music or Mantis');
console.log('  2. Create adapter: const adapter = new MusicPlaybackAdapter(mcpClient)');
console.log('  3. Play content: await adapter.play(contentId, { contentType: "track" })');
console.log('  4. Search: await adapter.search("Beatles", { types: ["artist"] })');
