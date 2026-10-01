/**
 * Test script to verify export functionality with mock data
 * Run with: npx ts-node --transpile-only scripts/test-export.ts
 */

import { seedMockData, clearMockData, checkMockDataStatus } from '../database/mock-data';
import {
  exportSupplements,
  exportSupplementLogs,
  exportCognitiveTestResults,
  exportSleepLogs,
  exportActivityLogs,
  exportDailyReviews,
  exportSchedules,
  exportAllData,
  getExportStats
} from '../database/export';
import { initializeDatabaseWithRetry } from '../database/database';

interface TestResult {
  table: string;
  success: boolean;
  rowCount: number;
  csvPreview: string;
  error?: string;
}

async function testExport(): Promise<void> {
  console.log('='.repeat(60));
  console.log('NEUROSYNC EXPORT TEST');
  console.log('='.repeat(60));
  console.log('');

  // Step 1: Initialize database
  console.log('[1/5] Initializing database...');
  const initResult = await initializeDatabaseWithRetry(3, 1000);
  if (!initResult.success) {
    console.error('❌ Database initialization failed:', initResult.error);
    process.exit(1);
  }
  console.log('✅ Database initialized');
  console.log('');

  // Step 2: Check current state and clear any existing mock data
  console.log('[2/5] Checking current mock data status...');
  const beforeStatus = await checkMockDataStatus();
  console.log('   Before seeding:', JSON.stringify(beforeStatus, null, 2));
  
  if (beforeStatus.isSeeded) {
    console.log('   Clearing existing mock data...');
    await clearMockData();
  }
  console.log('');

  // Step 3: Seed mock data
  console.log('[3/5] Seeding mock data...');
  const seedResult = await seedMockData();
  console.log('✅ Mock data seeded:');
  console.log(`   - Supplements: ${seedResult.supplements}`);
  console.log(`   - Supplement logs: ${seedResult.logs}`);
  console.log(`   - Cognitive tests: ${seedResult.tests}`);
  console.log(`   - Activities: ${seedResult.activities}`);
  console.log(`   - Activity logs: ${seedResult.activityLogs}`);
  console.log(`   - Sleep logs: ${seedResult.sleepLogs}`);
  console.log(`   - Daily reviews: ${seedResult.dailyReviews}`);
  console.log('');

  // Step 4: Get export stats
  console.log('[4/5] Getting export stats...');
  const stats = await getExportStats();
  console.log('   Database record counts:');
  for (const [table, count] of Object.entries(stats)) {
    console.log(`   - ${table}: ${count}`);
  }
  console.log('');

  // Step 5: Test each export function
  console.log('[5/5] Testing export functions...');
  console.log('');

  const results: TestResult[] = [];

  // Test supplements export
  results.push(await testSingleExport('supplements', exportSupplements));
  
  // Test supplement_logs export
  results.push(await testSingleExport('supplement_logs', exportSupplementLogs));
  
  // Test cognitive_test_results export
  results.push(await testSingleExport('cognitive_test_results', exportCognitiveTestResults));
  
  // Test sleep_logs export
  results.push(await testSingleExport('sleep_logs', exportSleepLogs));
  
  // Test activity_logs export
  results.push(await testSingleExport('activity_logs', exportActivityLogs));
  
  // Test daily_reviews export
  results.push(await testSingleExport('daily_reviews', exportDailyReviews));
  
  // Test schedules export
  results.push(await testSingleExport('schedules', exportSchedules));

  // Summary
  console.log('');
  console.log('='.repeat(60));
  console.log('RESULTS SUMMARY');
  console.log('='.repeat(60));
  
  const passed = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  
  console.log('');
  for (const result of results) {
    const status = result.success ? '✅' : '❌';
    const rowInfo = result.success ? `(${result.rowCount} rows)` : `ERROR: ${result.error}`;
    console.log(`${status} ${result.table}: ${rowInfo}`);
  }
  
  console.log('');
  console.log(`Total: ${passed} passed, ${failed} failed`);
  console.log('');

  // Test exportAllData
  console.log('Testing exportAllData()...');
  try {
    const allData = await exportAllData();
    const tableCount = Object.keys(allData).length;
    console.log(`✅ exportAllData returned ${tableCount} tables`);
    
    for (const [table, csv] of Object.entries(allData)) {
      const lines = csv.split('\n').length - 1; // -1 for header
      console.log(`   - ${table}: ${lines} data rows`);
    }
  } catch (error) {
    console.error('❌ exportAllData failed:', error);
  }

  console.log('');
  console.log('='.repeat(60));
  console.log('TEST COMPLETE');
  console.log('='.repeat(60));

  // Exit with appropriate code
  process.exit(failed > 0 ? 1 : 0);
}

async function testSingleExport(
  tableName: string,
  exportFn: () => Promise<string>
): Promise<TestResult> {
  console.log(`Testing ${tableName}...`);
  
  try {
    const csv = await exportFn();
    const lines = csv.split('\n');
    const rowCount = lines.length - 1; // Subtract header row
    
    // Get first few lines as preview
    const preview = lines.slice(0, Math.min(3, lines.length)).join('\n');
    
    console.log(`   ✅ Generated ${rowCount} rows`);
    console.log(`   Header: ${lines[0].substring(0, 80)}${lines[0].length > 80 ? '...' : ''}`);
    
    return {
      table: tableName,
      success: true,
      rowCount,
      csvPreview: preview
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.log(`   ❌ Failed: ${errorMsg}`);
    
    return {
      table: tableName,
      success: false,
      rowCount: 0,
      csvPreview: '',
      error: errorMsg
    };
  }
}

// Run the test
testExport().catch(error => {
  console.error('Test script failed:', error);
  process.exit(1);
});
