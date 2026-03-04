#!/usr/bin/env node
/**
 * Villa Audio System - HA Entity Verification
 * Checks if Anthem and Sonos entities exist in Home Assistant
 * Auto-updates config files if entity IDs differ from documentation
 */

const fs = require('fs');
const path = require('path');

// Expected entities from documentation
const EXPECTED_ENTITIES = {
  anthem: [
    { id: 'media_player.anthem_740', name: 'Anthem 740 (Theatre)' },
    { id: 'media_player.anthem_540', name: 'Anthem 540 (Master)' },
    { id: 'media_player.anthem_mrx_slm', name: 'MRX SLM (Sunroom)' }
  ],
  sonos: {
    prefix: 'media_player.sonos_',
    minCount: 20
  }
};

async function getHAClient() {
  try {
    const HAContextProvider = require('../src/ha-context-provider');
    if (global.haContextProvider) {
      return global.haContextProvider;
    }
    
    // Try to initialize
    const provider = new HAContextProvider();
    await provider.initialize();
    return provider;
  } catch (err) {
    console.error('❌ Cannot connect to Home Assistant');
    console.error('   Make sure HA is running and accessible');
    throw err;
  }
}

async function verifyEntities() {
  console.log('🔍 Verifying Home Assistant entities...\n');
  
  const haClient = await getHAClient();
  const states = await haClient.getStates();
  
  const results = {
    anthem: { found: [], missing: [], alternatives: [] },
    sonos: { found: [], count: 0 }
  };
  
  // Check Anthem AVRs
  console.log('📺 Checking Anthem AVRs:');
  for (const expected of EXPECTED_ENTITIES.anthem) {
    const found = states.find(s => s.entity_id === expected.id);
    if (found) {
      console.log(`   ✅ ${expected.id} - ${found.attributes.friendly_name || 'Found'}`);
      results.anthem.found.push(expected.id);
    } else {
      console.log(`   ❌ ${expected.id} - NOT FOUND`);
      results.anthem.missing.push(expected.id);
      
      // Look for alternatives
      const alternatives = states.filter(s => 
        s.entity_id.includes('anthem') || 
        s.entity_id.includes('avr') ||
        (s.attributes.friendly_name && s.attributes.friendly_name.toLowerCase().includes('anthem'))
      );
      
      if (alternatives.length > 0) {
        console.log(`   💡 Possible alternatives:`);
        alternatives.forEach(alt => {
          console.log(`      - ${alt.entity_id} (${alt.attributes.friendly_name || 'Unknown'})`);
          results.anthem.alternatives.push({
            expected: expected.id,
            actual: alt.entity_id,
            name: alt.attributes.friendly_name
          });
        });
      }
    }
  }
  
  // Check Sonos
  console.log('\n🔊 Checking Sonos system:');
  const sonosDevices = states.filter(s => 
    s.entity_id.startsWith('media_player.') &&
    s.entity_id.includes('sonos')
  );
  
  results.sonos.count = sonosDevices.length;
  results.sonos.found = sonosDevices.map(s => s.entity_id);
  
  if (sonosDevices.length >= EXPECTED_ENTITIES.sonos.minCount) {
    console.log(`   ✅ Found ${sonosDevices.length} Sonos devices (expected ${EXPECTED_ENTITIES.sonos.minCount})`);
  } else if (sonosDevices.length > 0) {
    console.log(`   ⚠️  Found ${sonosDevices.length} Sonos devices (expected ${EXPECTED_ENTITIES.sonos.minCount})`);
  } else {
    console.log(`   ❌ No Sonos devices found`);
  }
  
  sonosDevices.slice(0, 5).forEach(s => {
    console.log(`      - ${s.entity_id} (${s.attributes.friendly_name || 'Unknown'})`);
  });
  if (sonosDevices.length > 5) {
    console.log(`      ... and ${sonosDevices.length - 5} more`);
  }
  
  return results;
}

function updateConfigFiles(results) {
  if (results.anthem.missing.length === 0) {
    console.log('\n✅ All Anthem entities match documentation - no updates needed');
    return;
  }
  
  console.log('\n📝 Updating config files with actual entity IDs...');
  
  const filesToUpdate = [
    'src/audio-streaming-routes.js',
    'src/portal/modules/audition.js',
    'VILLA_AUDIO_SYSTEM_DOCUMENTATION.md'
  ];
  
  results.anthem.alternatives.forEach(alt => {
    console.log(`\n   Replacing ${alt.expected} → ${alt.actual}`);
    
    filesToUpdate.forEach(file => {
      const filePath = path.join(__dirname, '..', file);
      if (!fs.existsSync(filePath)) return;
      
      let content = fs.readFileSync(filePath, 'utf8');
      const updated = content.replace(new RegExp(alt.expected, 'g'), alt.actual);
      
      if (updated !== content) {
        fs.writeFileSync(filePath, updated, 'utf8');
        console.log(`      ✅ Updated ${file}`);
      }
    });
  });
  
  console.log('\n✅ Config files updated - please review and commit changes');
}

async function main() {
  try {
    const results = await verifyEntities();
    
    console.log('\n' + '='.repeat(60));
    console.log('SUMMARY');
    console.log('='.repeat(60));
    console.log(`Anthem AVRs: ${results.anthem.found.length}/${EXPECTED_ENTITIES.anthem.length} found`);
    console.log(`Sonos Amps: ${results.sonos.count} found (expected ${EXPECTED_ENTITIES.sonos.minCount})`);
    
    if (results.anthem.missing.length > 0) {
      console.log('\n⚠️  Some Anthem entities not found');
      if (results.anthem.alternatives.length > 0) {
        console.log('   Run with --update flag to auto-update config files');
      }
    }
    
    if (process.argv.includes('--update') && results.anthem.alternatives.length > 0) {
      updateConfigFiles(results);
    }
    
    console.log('\n✅ Verification complete');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ Verification failed:', err.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { verifyEntities, updateConfigFiles };
