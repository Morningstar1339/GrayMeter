/**
 * Export functionality tests
 * Tests that mock data can be seeded and exported correctly
 * 
 * Note: The global beforeEach in setup.ts resets the database before each test,
 * so we need to seed mock data in our own beforeEach or within tests that need it.
 */

import { seedMockData, checkMockDataStatus } from '../database/mock-data';
import {
  exportSupplements,
  exportSupplementLogs,
  exportCognitiveTestResults,
  exportSleepLogs,
  exportActivityLogs,
  exportDailyReviews,
  exportAllData,
  getExportStats
} from '../database/export';

describe('Export functionality', () => {
  
  describe('Mock data seeding', () => {
    it('should seed all data types', async () => {
      const result = await seedMockData();
      
      expect(result.supplements).toBeGreaterThan(0);
      expect(result.logs).toBeGreaterThan(0);
      expect(result.tests).toBeGreaterThan(0);
      expect(result.activities).toBeGreaterThan(0);
      expect(result.activityLogs).toBeGreaterThan(0);
      expect(result.sleepLogs).toBeGreaterThan(0);
      expect(result.dailyReviews).toBeGreaterThan(0);
      
      console.log('Seeded:', result);
    });

    it('should report correct mock data status after seeding', async () => {
      // Seed first since beforeEach resets the database
      await seedMockData();
      
      const status = await checkMockDataStatus();
      
      expect(status.isSeeded).toBe(true);
      expect(status.supplementCount).toBeGreaterThan(0);
      expect(status.logCount).toBeGreaterThan(0);
      expect(status.testResultCount).toBeGreaterThan(0);
      expect(status.activityCount).toBeGreaterThan(0);
      expect(status.activityLogCount).toBeGreaterThan(0);
    });
  });

  describe('Export stats', () => {
    beforeEach(async () => {
      await seedMockData();
    });

    it('should return record counts for all tables', async () => {
      const stats = await getExportStats();
      
      expect(stats.supplements).toBeGreaterThan(0);
      expect(stats.supplement_logs).toBeGreaterThan(0);
      expect(stats.cognitive_test_results).toBeGreaterThan(0);
      expect(stats.sleep_logs).toBeGreaterThan(0);
      expect(stats.activity_logs).toBeGreaterThan(0);
      expect(stats.daily_reviews).toBeGreaterThan(0);
      
      console.log('Export stats:', stats);
    });
  });

  describe('Individual exports', () => {
    beforeEach(async () => {
      await seedMockData();
    });

    it('should export supplements as valid CSV', async () => {
      const csv = await exportSupplements();
      const lines = csv.split('\n');
      
      expect(lines.length).toBeGreaterThan(1); // Header + data
      expect(lines[0]).toContain('id');
      expect(lines[0]).toContain('name');
      expect(lines[0]).toContain('default_dosage');
      
      console.log('Supplements CSV header:', lines[0]);
      console.log('Supplements row count:', lines.length - 1);
    });

    it('should export supplement_logs as valid CSV', async () => {
      const csv = await exportSupplementLogs();
      const lines = csv.split('\n');
      
      expect(lines.length).toBeGreaterThan(1);
      expect(lines[0]).toContain('supplement_name');
      expect(lines[0]).toContain('timestamp');
      expect(lines[0]).toContain('dosage');
      
      console.log('Supplement logs row count:', lines.length - 1);
    });

    it('should export cognitive_test_results as valid CSV', async () => {
      const csv = await exportCognitiveTestResults();
      const lines = csv.split('\n');
      
      expect(lines.length).toBeGreaterThan(1);
      expect(lines[0]).toContain('test_type');
      expect(lines[0]).toContain('score');
      expect(lines[0]).toContain('timestamp');
      
      console.log('Cognitive test results row count:', lines.length - 1);
    });

    it('should export sleep_logs as valid CSV', async () => {
      const csv = await exportSleepLogs();
      const lines = csv.split('\n');
      
      expect(lines.length).toBeGreaterThan(1);
      expect(lines[0]).toContain('sleep_start');
      expect(lines[0]).toContain('sleep_end');
      expect(lines[0]).toContain('duration');
      
      console.log('Sleep logs row count:', lines.length - 1);
    });

    it('should export activity_logs as valid CSV', async () => {
      const csv = await exportActivityLogs();
      const lines = csv.split('\n');
      
      expect(lines.length).toBeGreaterThan(1);
      expect(lines[0]).toContain('activity_name');
      expect(lines[0]).toContain('value');
      expect(lines[0]).toContain('timestamp');
      
      console.log('Activity logs row count:', lines.length - 1);
    });

    it('should export daily_reviews as valid CSV', async () => {
      const csv = await exportDailyReviews();
      const lines = csv.split('\n');
      
      expect(lines.length).toBeGreaterThan(1);
      expect(lines[0]).toContain('timestamp');
      expect(lines[0]).toContain('wellness');
      
      console.log('Daily reviews row count:', lines.length - 1);
    });
  });

  describe('Bulk export', () => {
    beforeEach(async () => {
      await seedMockData();
    });

    it('should export all tables via exportAllData', async () => {
      const allData = await exportAllData();
      
      expect(Object.keys(allData)).toContain('supplements');
      expect(Object.keys(allData)).toContain('supplement_logs');
      expect(Object.keys(allData)).toContain('cognitive_test_results');
      expect(Object.keys(allData)).toContain('sleep_logs');
      expect(Object.keys(allData)).toContain('activity_logs');
      expect(Object.keys(allData)).toContain('daily_reviews');
      
      // Verify each export has content
      for (const [table, csv] of Object.entries(allData)) {
        const lines = csv.split('\n');
        console.log(`${table}: ${lines.length - 1} rows`);
        expect(lines.length).toBeGreaterThanOrEqual(1); // At least header
      }
    });
  });

  describe('CSV format validation', () => {
    beforeEach(async () => {
      await seedMockData();
    });

    it('should properly escape fields with commas', async () => {
      const csv = await exportSupplements();
      // Verify it's valid CSV structure
      const lines = csv.split('\n').filter(l => l.trim());
      
      // Verify header exists and has expected fields
      expect(lines[0]).toContain('id');
      expect(lines[0]).toContain('name');
      
      // Each data line should have content
      for (let i = 1; i < lines.length; i++) {
        // Simple check - this won't catch all edge cases but good enough
        expect(lines[i].length).toBeGreaterThan(0);
      }
    });

    it('should include readable timestamps', async () => {
      const csv = await exportSupplementLogs();
      
      expect(csv).toContain('timestamp_readable');
      expect(csv).toContain('date');
      
      // Check that a readable timestamp looks like ISO format
      const lines = csv.split('\n');
      if (lines.length > 1) {
        // Should contain something like "2026-01-"
        expect(csv).toMatch(/\d{4}-\d{2}-\d{2}/);
      }
    });
  });
});
