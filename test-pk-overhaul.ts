// Test script for the PK profile system overhaul
// Run this to verify the new functionality works as expected

import { autoAssignProfile, getConfidenceIndicator, getFriendlyProfileName, GENERAL_SUPPLEMENT_PROFILE } from './database/default-profiles';
import { findSubstanceByName } from './database/pk-curves';

async function testPKProfileSystem() {
  console.log('🧪 Testing PK Profile System Overhaul...\n');

  // Test 1: Auto-assignment for known substances
  console.log('Test 1: Auto-assignment for known substances');
  const knownSubstances = ['caffeine', 'melatonin', 'creatine', 'modafinil'];
  
  for (const name of knownSubstances) {
    try {
      const profile = await autoAssignProfile(name);
      const confidence = getConfidenceIndicator(profile);
      console.log(`  ✓ ${name} → ${getFriendlyProfileName(profile)} (${confidence.label})`);
    } catch (error) {
      console.log(`  ❌ ${name} failed: ${error}`);
    }
  }

  // Test 2: Auto-assignment for unknown substances
  console.log('\nTest 2: Auto-assignment for unknown substances');
  const unknownSubstances = ['magic_potion', 'unicorn_tears', 'dragon_blood'];
  
  for (const name of unknownSubstances) {
    try {
      const profile = await autoAssignProfile(name);
      const confidence = getConfidenceIndicator(profile);
      console.log(`  ✓ ${name} → ${getFriendlyProfileName(profile)} (${confidence.label})`);
    } catch (error) {
      console.log(`  ❌ ${name} failed: ${error}`);
    }
  }

  // Test 3: Fuzzy matching
  console.log('\nTest 3: Fuzzy matching');
  const fuzzyNames = ['coffee', 'caffeine anhydrous', 'green tea extract', 'rhodiola'];
  
  for (const name of fuzzyNames) {
    try {
      const directMatch = await findSubstanceByName(name);
      const profile = await autoAssignProfile(name);
      const confidence = getConfidenceIndicator(profile);
      
      if (directMatch) {
        console.log(`  ✓ ${name} → ${getFriendlyProfileName(profile)} (direct match, ${confidence.label})`);
      } else {
        console.log(`  ✓ ${name} → ${getFriendlyProfileName(profile)} (fallback, ${confidence.label})`);
      }
    } catch (error) {
      console.log(`  ❌ ${name} failed: ${error}`);
    }
  }

  // Test 4: Confidence indicators
  console.log('\nTest 4: Confidence indicators');
  const testProfiles = [
    await autoAssignProfile('caffeine'),
    await autoAssignProfile('unknown_substance'),
    await autoAssignProfile('phenibut') // Lower confidence substance
  ];

  for (const profile of testProfiles) {
    const confidence = getConfidenceIndicator(profile);
    console.log(`  ${getFriendlyProfileName(profile)}: ${confidence.level} confidence (${confidence.icon}, ${confidence.color})`);
    console.log(`    Description: ${confidence.description}`);
  }

  // Test 5: General supplement profile
  console.log('\nTest 5: General supplement profile');
  console.log(`  ID: ${GENERAL_SUPPLEMENT_PROFILE.id}`);
  console.log(`  Names: ${GENERAL_SUPPLEMENT_PROFILE.names.join(', ')}`);
  console.log(`  Confidence tier: ${GENERAL_SUPPLEMENT_PROFILE.confidenceTier}`);
  console.log(`  Curves: ${GENERAL_SUPPLEMENT_PROFILE.curves.length}`);
  console.log(`  First curve: ${GENERAL_SUPPLEMENT_PROFILE.curves[0].type} with ka=${GENERAL_SUPPLEMENT_PROFILE.curves[0].params.ka}, ke=${GENERAL_SUPPLEMENT_PROFILE.curves[0].params.ke}`);

  console.log('\n✅ PK Profile System tests completed!');
}

// Export for use in other scripts
export { testPKProfileSystem };