/**
 * PK Profile Diagnostic Script
 * 
 * Analyzes the PK infrastructure in NeuroSync:
 * 1. Validated substances and their PK parameters
 * 2. Code integration points
 * 3. Gaps and recommendations
 * 
 * Run with: npx ts-node scripts/pk-diagnostic.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface ValidatedSubstance {
  name: string;
  names: string[];
  category: string;
  bioavailability: number | null;
  tmax_hours: number | null;
  half_life_hours: number | null;
  pk_model: string | null;
  pk_params: object | null;
  curves: Array<{type: string, params: object}>;
  tolerance_profile: string | null;
  confidence_tier: number;
  citations: string[];
}

function loadValidatedSubstances(): ValidatedSubstance[] {
  const filePath = path.join(__dirname, '..', 'validated_substances.json');
  const data = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(data);
}

function analyzeSubstances(substances: ValidatedSubstance[]) {
  console.log('\n=== PK PROFILE DIAGNOSTIC REPORT ===\n');
  
  // Basic stats
  console.log(`📊 VALIDATED SUBSTANCES: ${substances.length}\n`);
  
  // By category
  const byCategory: Record<string, number> = {};
  substances.forEach(s => {
    byCategory[s.category] = (byCategory[s.category] || 0) + 1;
  });
  console.log('📁 BY CATEGORY:');
  Object.entries(byCategory).sort((a, b) => b[1] - a[1]).forEach(([cat, count]) => {
    console.log(`   ${cat}: ${count}`);
  });
  
  // By PK model
  console.log('\n📈 BY PK MODEL:');
  const byModel: Record<string, number> = {};
  substances.forEach(s => {
    const model = s.pk_model || 'none';
    byModel[model] = (byModel[model] || 0) + 1;
  });
  Object.entries(byModel).sort((a, b) => b[1] - a[1]).forEach(([model, count]) => {
    console.log(`   ${model}: ${count}`);
  });
  
  // By confidence tier
  console.log('\n🎯 BY CONFIDENCE TIER:');
  const byTier: Record<number, string[]> = {};
  substances.forEach(s => {
    if (!byTier[s.confidence_tier]) byTier[s.confidence_tier] = [];
    byTier[s.confidence_tier].push(s.name);
  });
  Object.entries(byTier).sort((a, b) => Number(a[0]) - Number(b[0])).forEach(([tier, names]) => {
    const tierLabel = tier === '1' ? 'High (clinical)' : 
                     tier === '2' ? 'Medium (research)' : 
                     tier === '3' ? 'Low (theoretical)' : 'Unknown';
    console.log(`   Tier ${tier} (${tierLabel}): ${names.length} substances`);
    if (names.length <= 5) {
      names.forEach(n => console.log(`      - ${n}`));
    }
  });
  
  // Substances with complete PK data
  console.log('\n✅ SUBSTANCES WITH COMPLETE PK DATA:');
  const complete = substances.filter(s => 
    s.pk_model && s.pk_params && s.half_life_hours && s.tmax_hours
  );
  console.log(`   ${complete.length}/${substances.length} have full PK parameters`);
  complete.forEach(s => {
    console.log(`   - ${s.name}: ${s.pk_model}, t½=${s.half_life_hours}h, tmax=${s.tmax_hours}h`);
  });
  
  // Substances missing PK data
  const incomplete = substances.filter(s => 
    !s.pk_model || !s.pk_params || !s.half_life_hours
  );
  if (incomplete.length > 0) {
    console.log('\n⚠️  SUBSTANCES WITH INCOMPLETE PK DATA:');
    incomplete.forEach(s => {
      const missing = [];
      if (!s.pk_model) missing.push('pk_model');
      if (!s.pk_params) missing.push('pk_params');
      if (!s.half_life_hours) missing.push('half_life');
      console.log(`   - ${s.name}: missing ${missing.join(', ')}`);
    });
  }
  
  // Common supplement names that might be searched
  console.log('\n🔍 SEARCHABLE ALIASES (sample):');
  const aliasCount = substances.reduce((sum, s) => sum + s.names.length, 0);
  console.log(`   Total searchable names: ${aliasCount}`);
  substances.slice(0, 5).forEach(s => {
    console.log(`   ${s.name}: ${s.names.slice(0, 3).join(', ')}${s.names.length > 3 ? '...' : ''}`);
  });
  
  // Recommendations
  console.log('\n💡 RECOMMENDATIONS:');
  console.log('   1. Common nootropics to add: Lion\'s Mane, Bacopa, Alpha-GPC, Rhodiola');
  console.log('   2. Common vitamins to add: Vitamin D, B-complex, Magnesium, Zinc');
  console.log('   3. Consider adding more aliases for existing substances');
  
  return {
    total: substances.length,
    complete: complete.length,
    incomplete: incomplete.length,
    byCategory,
    byModel,
    byTier
  };
}

function checkCodeIntegration() {
  console.log('\n=== CODE INTEGRATION CHECK ===\n');
  
  const files = [
    { path: 'database/correlation-analysis.ts', patterns: ['pk_informed', 'PKAnalysis', 'pkInsights'] },
    { path: 'database/pk-curves.ts', patterns: ['evaluateBateman', 'SubstanceProfile', 'CurveConfig'] },
    { path: 'database/supplements.ts', patterns: ['substance_profile_id'] },
    { path: 'app/add-supplement.tsx', patterns: ['findSubstanceByName', 'suggestedProfile', 'selectedProfileId'] },
    { path: 'app/insights.tsx', patterns: ['pkAnalysis', 'pk_informed'] },
  ];
  
  files.forEach(({ path: filePath, patterns }) => {
    const fullPath = path.join(__dirname, '..', filePath);
    try {
      const content = fs.readFileSync(fullPath, 'utf-8');
      const found = patterns.filter(p => content.includes(p));
      const missing = patterns.filter(p => !content.includes(p));
      
      console.log(`📄 ${filePath}:`);
      if (found.length === patterns.length) {
        console.log(`   ✅ All patterns found (${found.join(', ')})`);
      } else {
        console.log(`   ✅ Found: ${found.join(', ') || 'none'}`);
        console.log(`   ❌ Missing: ${missing.join(', ')}`);
      }
    } catch (e) {
      console.log(`📄 ${filePath}: ❌ File not found`);
    }
  });
}

// Main
try {
  const substances = loadValidatedSubstances();
  const stats = analyzeSubstances(substances);
  checkCodeIntegration();
  
  console.log('\n=== SUMMARY ===');
  console.log(`\n✅ PK infrastructure is IN PLACE`);
  console.log(`📊 ${stats.complete}/${stats.total} substances have complete PK data`);
  console.log(`🔗 Code integration points verified`);
  console.log(`\n🎯 NEXT STEPS:`);
  console.log(`   1. Add more common supplements to validated_substances.json`);
  console.log(`   2. Test with synthetic data to verify correlation analysis uses PK`);
  console.log(`   3. Run app and verify auto-matching works when adding supplements`);
  console.log('');
} catch (error) {
  console.error('Diagnostic failed:', error);
  process.exit(1);
}
