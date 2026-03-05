#!/usr/bin/env node
/**
 * Test Mantis Audio Integration
 * Verifies that Mantis streaming works with the audio portal
 */

const MantisAudioClient = require('./src/mantis-audio-client');
const musicServiceConfig = require('./src/music-service-config');

async function testMantisIntegration() {
  console.log('🎵 Testing Mantis Audio Integration\n');

  // 1. Check configuration
  console.log('1. Checking music service configuration...');
  const mantisConfig = musicServiceConfig.services.mantis;
  console.log(`   ✓ Mantis enabled: ${mantisConfig.enabled}`);
  console.log(`   ✓ Priority: ${mantisConfig.priority}`);
  console.log(`   ✓ Endpoint: ${mantisConfig.endpoint}`);
  console.log(`   ✓ Audio quality: ${mantisConfig.audioQuality.codec.toUpperCase()} @ ${mantisConfig.audioQuality.bitrate}kbps\n`);

  // 2. Test Mantis client
  console.log('2. Testing Mantis client connection...');
  const client = new MantisAudioClient(mantisConfig.endpoint);
  
  try {
    const status = await client.getStatus();
    console.log(`   ✓ Connected to Mantis`);
    console.log(`   ✓ Status:`, status);
  } catch (err) {
    console.log(`   ✗ Connection failed: ${err.message}`);
    console.log(`   → Make sure Mantis is running at ${mantisConfig.endpoint}`);
    return;
  }

  // 3. Test audio quality settings
  console.log('\n3. Testing audio quality configuration...');
  try {
    const quality = musicServiceConfig.getAudioQuality('mantis');
    console.log(`   ✓ Current quality:`, quality);

    // Try setting higher quality
    musicServiceConfig.setAudioQuality('mantis', {
      codec: 'flac',
      bitrate: 9216,  // 24-bit/192kHz
      spatialAudio: true
    });
    const newQuality = musicServiceConfig.getAudioQuality('mantis');
    console.log(`   ✓ Updated quality:`, newQuality);
  } catch (err) {
    console.log(`   ✗ Quality config failed: ${err.message}`);
  }

  // 4. Test streaming endpoint
  console.log('\n4. Testing streaming endpoint availability...');
  try {
    const testTrackId = 'test-track-123';
    const streamUrl = `${mantisConfig.endpoint}/api/music/stream/${testTrackId}`;
    console.log(`   → Testing: ${streamUrl}`);
    
    const response = await fetch(streamUrl, { 
      method: 'HEAD',
      signal: AbortSignal.timeout(5000)
    });
    
    if (response.ok) {
      console.log(`   ✓ Streaming endpoint accessible`);
    } else {
      console.log(`   ⚠ Endpoint returned ${response.status} (may need track ID)`);
    }
  } catch (err) {
    console.log(`   ⚠ Endpoint test failed: ${err.message}`);
  }

  console.log('\n✅ Mantis integration test complete!');
  console.log('\nNext steps:');
  console.log('  1. Start the portal server');
  console.log('  2. Open the jukebox module');
  console.log('  3. Create a session - audio will stream via Mantis in FLAC');
  console.log('  4. Check browser console for "Loading from mantis (FLAC)" messages');
}

testMantisIntegration().catch(console.error);
