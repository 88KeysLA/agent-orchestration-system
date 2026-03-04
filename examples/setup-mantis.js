#!/usr/bin/env node
/**
 * Quick Setup: Enable Mantis for Villa
 */

const musicConfig = require('../src/music-service-config');

console.log('🎵 Mantis Music Service Setup\n');

// Enable Mantis (priority 1)
musicConfig.enableService('mantis');
console.log('✅ Mantis enabled (priority 1)');

// Enable Amazon Music as fallback
musicConfig.enableService('amazonMusic');
console.log('✅ Amazon Music enabled (priority 2, fallback)');

// Show configuration
console.log('\n📊 Current Configuration:');
console.log(`   Active: ${musicConfig.activeService}`);
console.log(`   Available: ${musicConfig.getAvailableServices().map(s => s.name).join(', ')}`);

// Show capabilities
const mantis = musicConfig.getActiveService();
console.log('\n🎛️  Mantis Capabilities:');
mantis.capabilities.forEach(cap => console.log(`   - ${cap}`));

console.log('\n🚀 Ready to use!');
console.log('\nArchitecture:');
console.log('  Mobile (Mantis) → Villa Server → Audio System');
console.log('  No local server needed on mobile!');
console.log('\nNext steps:');
console.log('  1. Villa server handles audio at: http://192.168.0.60:8406');
console.log('  2. Use adapter: await adapter.play(url, { volume: 0.8 })');
console.log('  3. Commands route through Villa automatically');
console.log('\nMobile CPU stays cool - Villa does the work!');
