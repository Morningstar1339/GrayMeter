/**
 * Dashboard data utilities for home screen
 */

import { withDatabase } from '@/database/database';

export interface DashboardStats {
  todaysSupplements: number;
  todaysTests: number;
  currentStreak: number;
  lastTestScore: number | null;
  lastTestType: string | null;
  weeklyTestAverage: number | null;
  weeklyTestType: string | null;
}

/**
 * Get today's dashboard statistics
 */
export const getTodaysDashboardStats = async (): Promise<DashboardStats> => {
  return withDatabase(async (db) => {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() / 1000;
    const endOfDay = startOfDay + 24 * 60 * 60;

    // Count today's supplement logs
    const todaysSupplementsResult = db.prepare(`
      SELECT COUNT(*) as count 
      FROM supplement_logs 
      WHERE timestamp >= ? AND timestamp < ?
    `).get(startOfDay, endOfDay) as { count: number };
    
    // Count today's cognitive tests
    const todaysTestsResult = db.prepare(`
      SELECT COUNT(*) as count 
      FROM cognitive_test_results 
      WHERE timestamp >= ? AND timestamp < ?
    `).get(startOfDay, endOfDay) as { count: number };

    // Get current streak (consecutive days with at least one supplement logged)
    // Use single SQL query instead of O(n) while loop
    const streakResult = db.prepare(`
      WITH RECURSIVE date_series AS (
        -- Start from today
        SELECT 
          date(datetime(?, 'unixepoch')) as date,
          0 as day_offset
        UNION ALL
        -- Go backwards day by day
        SELECT 
          date(datetime(?, 'unixepoch'), '-' || (day_offset + 1) || ' days') as date,
          day_offset + 1
        FROM date_series
        WHERE day_offset < 365  -- Prevent infinite recursion
      ),
      daily_counts AS (
        SELECT 
          ds.date,
          ds.day_offset,
          COALESCE(COUNT(sl.id), 0) as supplement_count
        FROM date_series ds
        LEFT JOIN supplement_logs sl ON 
          date(datetime(sl.timestamp, 'unixepoch')) = ds.date
        GROUP BY ds.date, ds.day_offset
        ORDER BY ds.day_offset
      ),
      streak_calc AS (
        SELECT 
          day_offset,
          supplement_count,
          -- Mark where the streak breaks (first day with 0 supplements)
          CASE WHEN supplement_count = 0 THEN 1 ELSE 0 END as is_break
        FROM daily_counts
        ORDER BY day_offset
      )
      SELECT 
        COALESCE(MIN(day_offset) - 1, 0) as current_streak
      FROM streak_calc 
      WHERE is_break = 1
    `).get(now.getTime() / 1000, now.getTime() / 1000) as { current_streak: number };
    
    const currentStreak = Math.max(0, streakResult?.current_streak || 0);

    // Get most recent test score and type
    const lastTestResult = db.prepare(`
      SELECT score, test_type 
      FROM cognitive_test_results 
      ORDER BY timestamp DESC 
      LIMIT 1
    `).get() as { score: number; test_type: string } | undefined;

    // Get weekly test average for the SAME test type as the last test (last 7 days)
    const weekStart = (Date.now() / 1000) - (7 * 24 * 60 * 60);
    const weeklyAvgResult = lastTestResult?.test_type ? db.prepare(`
      SELECT AVG(score) as avg_score 
      FROM cognitive_test_results 
      WHERE timestamp >= ? AND test_type = ?
    `).get(weekStart, lastTestResult.test_type) as { avg_score: number | null } : null;

    return {
      todaysSupplements: todaysSupplementsResult.count,
      todaysTests: todaysTestsResult.count,
      currentStreak,
      lastTestScore: lastTestResult?.score || null,
      lastTestType: lastTestResult?.test_type || null,
      weeklyTestAverage: weeklyAvgResult?.avg_score || null,
      weeklyTestType: lastTestResult?.test_type || null,
    };
  });
};

/**
 * Get recent supplements taken today
 */
export const getTodaysSupplementSummary = async (): Promise<Array<{name: string, dosage: number, unit: string}>> => {
  return withDatabase(async (db) => {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() / 1000;
    const endOfDay = startOfDay + 24 * 60 * 60;

    const results = db.prepare(`
      SELECT s.name, sl.dosage, s.dosage_unit as unit
      FROM supplement_logs sl
      JOIN supplements s ON sl.supplement_id = s.id
      WHERE sl.timestamp >= ? AND sl.timestamp < ?
      ORDER BY sl.timestamp DESC
      LIMIT 5
    `).all(startOfDay, endOfDay) as Array<{name: string, dosage: number, unit: string}>;

    return results;
  });
};

/**
 * Check if user should see "Same as Yesterday" quick-log button
 * Returns true if user logged supplements yesterday but hasn't logged today
 */
export const shouldShowSameAsYesterday = async (): Promise<boolean> => {
  return withDatabase(async (db) => {
    const now = new Date();
    
    // Today's range
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() / 1000;
    const todayEnd = todayStart + 24 * 60 * 60;
    
    // Yesterday's range  
    const yesterdayStart = todayStart - 24 * 60 * 60;
    const yesterdayEnd = todayStart;
    
    // Check if user logged today
    const todayLogs = db.prepare(`
      SELECT COUNT(*) as count 
      FROM supplement_logs 
      WHERE timestamp >= ? AND timestamp < ?
    `).get(todayStart, todayEnd) as { count: number };
    
    if (todayLogs.count > 0) {
      return false; // Already logged today
    }
    
    // Check if user logged yesterday
    const yesterdayLogs = db.prepare(`
      SELECT COUNT(*) as count 
      FROM supplement_logs 
      WHERE timestamp >= ? AND timestamp < ?
    `).get(yesterdayStart, yesterdayEnd) as { count: number };
    
    return yesterdayLogs.count > 0;
  });
};

/**
 * Get yesterday's supplement logs for quick repeat functionality
 */
export const getYesterdaysSupplements = async (): Promise<Array<{supplement_id: number, dosage: number}>> => {
  return withDatabase(async (db) => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() / 1000;
    
    // Yesterday's range
    const yesterdayStart = todayStart - 24 * 60 * 60;
    const yesterdayEnd = todayStart;
    
    const results = db.prepare(`
      SELECT supplement_id, dosage
      FROM supplement_logs
      WHERE timestamp >= ? AND timestamp < ?
      ORDER BY timestamp DESC
    `).all(yesterdayStart, yesterdayEnd) as Array<{supplement_id: number, dosage: number}>;
    
    return results;
  });
};

/**
 * Log yesterday's supplements with today's timestamp
 */
export const logSameAsYesterday = async (): Promise<{ success: boolean; count: number }> => {
  return withDatabase(async (db) => {
    try {
      const yesterdaysSupplements = await getYesterdaysSupplements();
      
      if (yesterdaysSupplements.length === 0) {
        return { success: false, count: 0 };
      }
      
      const todayTimestamp = Date.now() / 1000;
      
      // Insert all of yesterday's supplements with today's timestamp
      const insertStmt = db.prepare(`
        INSERT INTO supplement_logs (supplement_id, dosage, timestamp, notes)
        VALUES (?, ?, ?, ?)
      `);
      
      let insertedCount = 0;
      
      for (const supp of yesterdaysSupplements) {
        insertStmt.run(supp.supplement_id, supp.dosage, todayTimestamp, 'Repeated from yesterday');
        insertedCount++;
      }
      
      return { success: true, count: insertedCount };
    } catch (error) {
      console.error('Failed to log same as yesterday:', error);
      return { success: false, count: 0 };
    }
  });
};

/**
 * Format test type for display
 */
export const formatTestType = (testType: string): string => {
  switch (testType) {
    case 'reflexes': return 'Reflexes';
    case 'memory': return 'Memory';
    case 'judgment': return 'Judgment';
    case 'rock_dodger': return 'Rock Dodger';
    case 'pattern_matcher': return 'Pattern Match';
    case 'tile_puzzle': return 'Tile Puzzle';
    case 'n_back': return 'N-Back';
    case 'stroop': return 'Stroop';
    case 'questionnaire': return 'Questionnaire';
    default: return testType;
  }
};