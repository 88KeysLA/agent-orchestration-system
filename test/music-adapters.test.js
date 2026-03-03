/**
 * Music Platform Adapter Tests
 * Tests for Spotify, Apple Music, Amazon, and UnifiedMusicService
 * Uses mocked fetch — no API keys or network needed
 */
const { SpotifyAdapter } = require('../src/music/spotify-adapter');
const { AppleMusicAdapter } = require('../src/music/apple-music-adapter');
const { AmazonAdapter } = require('../src/music/amazon-adapter');
const { UnifiedMusicService } = require('../src/music/music-service');

let passed = 0;
let failed = 0;
const originalFetch = global.fetch;
const originalEnv = { ...process.env };

function test(name, fn) {
  return fn().then(() => {
    console.log(`\u2705 ${name}`);
    passed++;
  }).catch(err => {
    console.log(`\u274c ${name}: ${err.message}`);
    failed++;
  }).finally(() => {
    global.fetch = originalFetch;
    // Restore env vars after each test
    delete process.env.SPOTIFY_CLIENT_ID;
    delete process.env.SPOTIFY_CLIENT_SECRET;
    delete process.env.APPLE_MUSIC_KEY_ID;
    delete process.env.APPLE_MUSIC_TEAM_ID;
    delete process.env.APPLE_MUSIC_PRIVATE_KEY;
  });
}

function mockFetch(responseBody, status = 200) {
  global.fetch = async (url, opts) => ({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: async () => responseBody,
    text: async () => JSON.stringify(responseBody),
  });
}

// Generate a test ES256 key pair for Apple Music JWT tests
const crypto = require('crypto');
const testKeyPair = crypto.generateKeyPairSync('ec', {
  namedCurve: 'prime256v1',
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});

// =============================================================================
// Spotify Tests
// =============================================================================

async function testSpotifyUnavailableWithoutEnv() {
  const adapter = new SpotifyAdapter();
  if (adapter.isAvailable()) throw new Error('Should be unavailable without env vars');
}

async function testSpotifyAvailableWithEnv() {
  process.env.SPOTIFY_CLIENT_ID = 'test-id';
  process.env.SPOTIFY_CLIENT_SECRET = 'test-secret';
  const adapter = new SpotifyAdapter();
  if (!adapter.isAvailable()) throw new Error('Should be available with env vars set');
}

async function testSpotifyTokenRefresh() {
  process.env.SPOTIFY_CLIENT_ID = 'test-id';
  process.env.SPOTIFY_CLIENT_SECRET = 'test-secret';

  let tokenRequestCount = 0;
  global.fetch = async (url, opts) => {
    if (url.includes('accounts.spotify.com')) {
      tokenRequestCount++;
      return {
        ok: true, status: 200,
        json: async () => ({ access_token: 'mock-token-abc', expires_in: 3600 }),
        text: async () => '{}',
      };
    }
    // Search endpoint
    return {
      ok: true, status: 200,
      json: async () => ({ tracks: { items: [] } }),
      text: async () => '{}',
    };
  };

  const adapter = new SpotifyAdapter();
  await adapter.search('test query');
  await adapter.search('test query 2');

  // Token should be cached — only one token request
  if (tokenRequestCount !== 1) {
    throw new Error(`Expected 1 token request, got ${tokenRequestCount}`);
  }
  if (adapter._accessToken !== 'mock-token-abc') {
    throw new Error(`Token not cached: ${adapter._accessToken}`);
  }
}

async function testSpotifySearchMapsTracksCorrectly() {
  process.env.SPOTIFY_CLIENT_ID = 'test-id';
  process.env.SPOTIFY_CLIENT_SECRET = 'test-secret';

  global.fetch = async (url, opts) => {
    if (url.includes('accounts.spotify.com')) {
      return {
        ok: true, status: 200,
        json: async () => ({ access_token: 'tok', expires_in: 3600 }),
        text: async () => '{}',
      };
    }
    return {
      ok: true, status: 200,
      json: async () => ({
        tracks: {
          items: [{
            id: 'sp-track-1',
            name: 'Bohemian Rhapsody',
            artists: [{ name: 'Queen' }],
            album: {
              name: 'A Night at the Opera',
              images: [{ url: 'https://img.spotify.com/cover.jpg' }],
            },
            duration_ms: 354000,
            uri: 'spotify:track:sp-track-1',
          }],
        },
        albums: { items: [] },
        playlists: { items: [] },
      }),
      text: async () => '{}',
    };
  };

  const adapter = new SpotifyAdapter();
  const results = await adapter.search('bohemian rhapsody');

  if (results.length !== 1) throw new Error(`Expected 1 result, got ${results.length}`);
  const item = results[0];
  if (item.title !== 'Bohemian Rhapsody') throw new Error(`Wrong title: ${item.title}`);
  if (item.artist !== 'Queen') throw new Error(`Wrong artist: ${item.artist}`);
  if (item.album !== 'A Night at the Opera') throw new Error(`Wrong album: ${item.album}`);
  if (item.service !== 'spotify') throw new Error(`Wrong service: ${item.service}`);
  if (item.type !== 'track') throw new Error(`Wrong type: ${item.type}`);
  if (item.duration !== 354) throw new Error(`Wrong duration: ${item.duration}`);
  if (item.uri !== 'spotify:track:sp-track-1') throw new Error(`Wrong uri: ${item.uri}`);
  if (!item.playable) throw new Error('Should be playable');
}

async function testSpotifySearchHandlesApiError() {
  process.env.SPOTIFY_CLIENT_ID = 'test-id';
  process.env.SPOTIFY_CLIENT_SECRET = 'test-secret';

  global.fetch = async (url, opts) => {
    if (url.includes('accounts.spotify.com')) {
      return {
        ok: true, status: 200,
        json: async () => ({ access_token: 'tok', expires_in: 3600 }),
        text: async () => '{}',
      };
    }
    return {
      ok: false, status: 429,
      json: async () => ({}),
      text: async () => 'Rate limited',
    };
  };

  const adapter = new SpotifyAdapter();
  try {
    await adapter.search('test');
    throw new Error('Should have thrown on API error');
  } catch (err) {
    if (!err.message.includes('search failed')) {
      throw new Error(`Unexpected error message: ${err.message}`);
    }
  }
}

async function testSpotifyGetPlaybackInfo() {
  process.env.SPOTIFY_CLIENT_ID = 'test-id';
  process.env.SPOTIFY_CLIENT_SECRET = 'test-secret';

  global.fetch = async (url, opts) => {
    if (url.includes('accounts.spotify.com')) {
      return {
        ok: true, status: 200,
        json: async () => ({ access_token: 'tok', expires_in: 3600 }),
        text: async () => '{}',
      };
    }
    return {
      ok: true, status: 200,
      json: async () => ({
        name: 'Test Track',
        artists: [{ name: 'Test Artist' }],
        album: { name: 'Test Album', images: [{ url: 'https://img.test/art.jpg' }] },
        duration_ms: 180000,
      }),
      text: async () => '{}',
    };
  };

  const adapter = new SpotifyAdapter();
  const info = await adapter.getPlaybackInfo('abc123');
  if (info.contentType !== 'music') throw new Error(`Wrong contentType: ${info.contentType}`);
  if (info.contentId !== 'spotify:track:abc123') throw new Error(`Wrong contentId: ${info.contentId}`);
  if (info.metadata.title !== 'Test Track') throw new Error(`Wrong metadata title: ${info.metadata.title}`);
}

// =============================================================================
// Apple Music Tests
// =============================================================================

async function testAppleMusicUnavailableWithoutEnv() {
  const adapter = new AppleMusicAdapter();
  if (adapter.isAvailable()) throw new Error('Should be unavailable without env vars');
}

async function testAppleMusicJWTStructure() {
  process.env.APPLE_MUSIC_KEY_ID = 'TESTKEY123';
  process.env.APPLE_MUSIC_TEAM_ID = 'TESTTEAM456';
  process.env.APPLE_MUSIC_PRIVATE_KEY = testKeyPair.privateKey;

  const adapter = new AppleMusicAdapter();
  const token = adapter._generateToken();

  const parts = token.split('.');
  if (parts.length !== 3) throw new Error(`JWT should have 3 parts, got ${parts.length}`);

  // Decode and verify header
  const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
  if (header.alg !== 'ES256') throw new Error(`Wrong algorithm: ${header.alg}`);
  if (header.kid !== 'TESTKEY123') throw new Error(`Wrong kid: ${header.kid}`);

  // Decode and verify payload
  const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
  if (payload.iss !== 'TESTTEAM456') throw new Error(`Wrong issuer: ${payload.iss}`);
  if (!payload.iat) throw new Error('Missing iat');
  if (!payload.exp) throw new Error('Missing exp');
  if (payload.exp <= payload.iat) throw new Error('exp should be after iat');
}

async function testAppleMusicSearchMapsSongs() {
  const adapter = new AppleMusicAdapter();
  // Test _mapSong directly (avoids needing network)
  const item = adapter._mapSong({
    id: 'am-song-1',
    attributes: {
      name: 'Come Together',
      artistName: 'The Beatles',
      albumName: 'Abbey Road',
      artwork: { url: 'https://example.com/{w}x{h}bb.jpg' },
      durationInMillis: 259000,
      url: 'https://music.apple.com/us/song/come-together/1',
    },
  });

  if (item.title !== 'Come Together') throw new Error(`Wrong title: ${item.title}`);
  if (item.artist !== 'The Beatles') throw new Error(`Wrong artist: ${item.artist}`);
  if (item.album !== 'Abbey Road') throw new Error(`Wrong album: ${item.album}`);
  if (item.service !== 'apple_music') throw new Error(`Wrong service: ${item.service}`);
  if (item.type !== 'track') throw new Error(`Wrong type: ${item.type}`);
  if (item.duration !== 259) throw new Error(`Wrong duration: ${item.duration}`);
  if (!item.playable) throw new Error('Should be playable');
}

async function testAppleMusicArtworkDimensions() {
  const adapter = new AppleMusicAdapter();
  const url = adapter._artworkUrl({ url: 'https://example.com/{w}x{h}bb.jpg' });
  if (url !== 'https://example.com/300x300bb.jpg') {
    throw new Error(`Artwork URL dimensions not replaced: ${url}`);
  }

  // Also test empty/missing artwork
  const empty = adapter._artworkUrl(null);
  if (empty !== '') throw new Error(`Empty artwork should return empty string: ${empty}`);
}

// =============================================================================
// Amazon Tests
// =============================================================================

const sampleCatalog = [
  { name: 'Chill Vibes Station', source_type: 'amazon_station', uri: 'FV:2/abc123', mood: 'relaxed', tags: ['chill', 'ambient'] },
  { name: 'Jazz Classics', source_type: 'amazon_playlist', uri: 'FV:2/jazz456', mood: 'sophisticated', tags: ['jazz', 'instrumental'] },
  { name: 'Workout Mix', source_type: 'amazon_playlist', uri: 'x-rincon:workout', mood: 'energetic', tags: ['exercise', 'upbeat'] },
  { name: 'Classical Focus', source_type: 'amazon_station', uri: 'FV:2/classical', mood: 'focused', tags: ['classical', 'study'] },
];

async function testAmazonAlwaysAvailable() {
  const adapter = new AmazonAdapter({ catalog: sampleCatalog });
  if (!adapter.isAvailable()) throw new Error('Amazon adapter should always be available');

  // Also available with empty catalog
  const empty = new AmazonAdapter();
  if (!empty.isAvailable()) throw new Error('Should be available even with no catalog');
}

async function testAmazonSearchByName() {
  const adapter = new AmazonAdapter({ catalog: sampleCatalog });
  const results = await adapter.search('jazz');
  if (results.length !== 1) throw new Error(`Expected 1 result, got ${results.length}`);
  if (results[0].title !== 'Jazz Classics') throw new Error(`Wrong title: ${results[0].title}`);
  if (results[0].service !== 'amazon') throw new Error(`Wrong service: ${results[0].service}`);
  if (results[0].type !== 'station') throw new Error(`Wrong type: ${results[0].type}`);

  // Case-insensitive
  const upper = await adapter.search('JAZZ');
  if (upper.length !== 1) throw new Error('Search should be case-insensitive');
}

async function testAmazonSearchByTagsAndMood() {
  const adapter = new AmazonAdapter({ catalog: sampleCatalog });

  // Match by tag
  const tagResults = await adapter.search('ambient');
  if (tagResults.length !== 1) throw new Error(`Expected 1 tag match, got ${tagResults.length}`);
  if (tagResults[0].title !== 'Chill Vibes Station') throw new Error(`Wrong tag match: ${tagResults[0].title}`);

  // Match by mood
  const moodResults = await adapter.search('energetic');
  if (moodResults.length !== 1) throw new Error(`Expected 1 mood match, got ${moodResults.length}`);
  if (moodResults[0].title !== 'Workout Mix') throw new Error(`Wrong mood match: ${moodResults[0].title}`);
}

async function testAmazonPlaybackInfoFavoriteUri() {
  const adapter = new AmazonAdapter({ catalog: sampleCatalog });
  const info = await adapter.getPlaybackInfo('0');
  if (info.contentType !== 'favorite_item_id') {
    throw new Error(`FV: URIs should return favorite_item_id, got: ${info.contentType}`);
  }
  if (info.contentId !== 'FV:2/abc123') throw new Error(`Wrong contentId: ${info.contentId}`);

  // Non-FV URI should be 'music'
  const nonFv = await adapter.getPlaybackInfo('2');
  if (nonFv.contentType !== 'music') {
    throw new Error(`Non-FV URIs should return music, got: ${nonFv.contentType}`);
  }
}

async function testAmazonEmptyCatalog() {
  const adapter = new AmazonAdapter({ catalog: [] });
  const results = await adapter.search('anything');
  if (results.length !== 0) throw new Error(`Empty catalog should return empty results, got ${results.length}`);
}

// =============================================================================
// UnifiedMusicService Tests
// =============================================================================

async function testRegisterAdapter() {
  const service = new UnifiedMusicService();
  const adapter = new AmazonAdapter({ catalog: sampleCatalog });
  service.registerAdapter(adapter);

  if (!service.adapters.has('amazon')) throw new Error('Adapter not registered');
  if (service.adapters.size !== 1) throw new Error(`Expected 1 adapter, got ${service.adapters.size}`);
}

async function testGetAvailableServices() {
  const service = new UnifiedMusicService();
  service.registerAdapter(new AmazonAdapter({ catalog: sampleCatalog }));
  service.registerAdapter(new SpotifyAdapter()); // unavailable (no env vars)

  const { services } = service.getAvailableServices();
  if (services.length !== 2) throw new Error(`Expected 2 services, got ${services.length}`);

  const amazon = services.find(s => s.name === 'amazon');
  if (!amazon) throw new Error('Amazon not listed');
  if (!amazon.available) throw new Error('Amazon should be available');
  if (amazon.type !== 'streaming') throw new Error(`Wrong type: ${amazon.type}`);

  const spotify = services.find(s => s.name === 'spotify');
  if (!spotify) throw new Error('Spotify not listed');
  if (spotify.available) throw new Error('Spotify should be unavailable');
}

async function testSearchAllFanout() {
  const service = new UnifiedMusicService();

  // Create two available adapters (Amazon with different catalogs)
  const adapter1 = new AmazonAdapter({
    catalog: [{ name: 'Jazz Station', source_type: 'amazon', uri: 'FV:2/j', mood: 'chill', tags: ['jazz'] }],
  });
  // Override name so they are distinct
  adapter1.name = 'amazon1';

  const adapter2 = new AmazonAdapter({
    catalog: [{ name: 'Jazz FM', source_type: 'amazon', uri: 'FV:2/jfm', mood: 'jazz', tags: ['radio'] }],
  });
  adapter2.name = 'amazon2';

  service.registerAdapter(adapter1);
  service.registerAdapter(adapter2);

  const { results, errors } = await service.searchAll('jazz');

  if (!results.amazon1 || results.amazon1.length !== 1) {
    throw new Error(`Expected 1 result from amazon1, got ${results.amazon1?.length}`);
  }
  if (!results.amazon2 || results.amazon2.length !== 1) {
    throw new Error(`Expected 1 result from amazon2, got ${results.amazon2?.length}`);
  }
  if (Object.keys(errors).length !== 0) {
    throw new Error(`Expected no errors, got ${JSON.stringify(errors)}`);
  }
}

async function testSearchAllHandlesFailures() {
  const service = new UnifiedMusicService();

  // Good adapter
  service.registerAdapter(new AmazonAdapter({
    catalog: [{ name: 'Test Track', source_type: 'amazon', uri: 'FV:2/t', mood: '', tags: ['test'] }],
  }));

  // Bad adapter that always throws
  const badAdapter = new AmazonAdapter({ catalog: [] });
  badAdapter.name = 'broken_service';
  badAdapter.isAvailable = () => true;
  badAdapter.search = async () => { throw new Error('Service down'); };
  service.registerAdapter(badAdapter);

  const { results, errors } = await service.searchAll('test');

  // Good adapter should still return results
  if (!results.amazon || results.amazon.length !== 1) {
    throw new Error(`Amazon should still return results despite broken_service failure`);
  }
  // searchAll uses Promise.allSettled so it should not throw
}

async function testSearchSpecificService() {
  const service = new UnifiedMusicService();
  service.registerAdapter(new AmazonAdapter({
    catalog: [{ name: 'Lo-Fi Beats', source_type: 'amazon', uri: 'FV:2/lofi', mood: 'chill', tags: ['lofi'] }],
  }));

  const { service: svcName, results } = await service.search('amazon', 'lofi');
  if (svcName !== 'amazon') throw new Error(`Wrong service name: ${svcName}`);
  if (results.length !== 1) throw new Error(`Expected 1 result, got ${results.length}`);
  if (results[0].title !== 'Lo-Fi Beats') throw new Error(`Wrong title: ${results[0].title}`);
}

// =============================================================================
// Run all tests
// =============================================================================

(async () => {
  console.log('Testing Music Platform Adapters...\n');

  // Spotify
  await test('Spotify: isAvailable false without env vars', testSpotifyUnavailableWithoutEnv);
  await test('Spotify: isAvailable true with env vars', testSpotifyAvailableWithEnv);
  await test('Spotify: token refresh — cached after first request', testSpotifyTokenRefresh);
  await test('Spotify: search maps tracks to MusicItem format', testSpotifySearchMapsTracksCorrectly);
  await test('Spotify: search handles API errors gracefully', testSpotifySearchHandlesApiError);
  await test('Spotify: getPlaybackInfo returns correct content type', testSpotifyGetPlaybackInfo);

  // Apple Music
  await test('Apple Music: isAvailable false without env vars', testAppleMusicUnavailableWithoutEnv);
  await test('Apple Music: JWT has valid 3-part structure', testAppleMusicJWTStructure);
  await test('Apple Music: _mapSong produces correct MusicItem', testAppleMusicSearchMapsSongs);
  await test('Apple Music: artwork URL dimensions replaced', testAppleMusicArtworkDimensions);

  // Amazon
  await test('Amazon: isAvailable always true', testAmazonAlwaysAvailable);
  await test('Amazon: search matches by name (case-insensitive)', testAmazonSearchByName);
  await test('Amazon: search matches by tags and mood', testAmazonSearchByTagsAndMood);
  await test('Amazon: getPlaybackInfo returns favorite_item_id for FV: URIs', testAmazonPlaybackInfoFavoriteUri);
  await test('Amazon: empty catalog returns empty results', testAmazonEmptyCatalog);

  // UnifiedMusicService
  await test('UnifiedMusicService: registerAdapter adds adapter', testRegisterAdapter);
  await test('UnifiedMusicService: getAvailableServices lists all adapters', testGetAvailableServices);
  await test('UnifiedMusicService: searchAll fans out to all adapters', testSearchAllFanout);
  await test('UnifiedMusicService: searchAll handles adapter failures', testSearchAllHandlesFailures);
  await test('UnifiedMusicService: search with specific service name', testSearchSpecificService);

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed === 0) {
    console.log('\u2705 All music adapter tests passed!\n');
    process.exit(0);
  } else {
    console.log('\u274c Some tests failed\n');
    process.exit(1);
  }
})();
