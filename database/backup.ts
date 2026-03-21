import { withDatabase, isDatabaseInitialized } from './database';

const TEST_DATA_MARKER = '[Test]';

export interface BackupData {
  version: number;
  exportedAt: string;
  supplements: SupplementBackup[];
  supplementLogs: SupplementLogBackup[];
  activities: ActivityBackup[];
  activityLogs: ActivityLogBackup[];
  cognitiveTestResults: CognitiveTestResultBackup[];
  sleepLogs: SleepLogBackup[];
  symptoms: SymptomBackup[];
  symptomLogs: SymptomLogBackup[];
  dailyReviews: DailyReviewBackup[];
}

interface SupplementBackup {
  name: string;
  default_dosage: number;
  dosage_unit: string;
  icon_id?: string;
  color?: string;
  schedule_enabled: boolean;
  study_enabled: boolean;
}

interface SupplementLogBackup {
  supplement_name: string;
  timestamp: number;
  dosage: number;
  notes?: string;
}

interface ActivityBackup {
  name: string;
  unit: string;
  default_value?: number;
  icon_id?: string;
  color?: string;}

interface ActivityLogBackup {
  activity_name: string;
  timestamp: number;
  value: number;
  notes?: string;
}

interface CognitiveTestResultBackup {
  test_type: string;
  timestamp: number;
  score: number;
  accuracy?: number;
  speed?: number;
  raw_data?: string;
  completion_time?: number;
}

interface SleepLogBackup {
  sleep_start: number;
  sleep_end: number;
  duration_seconds: number;
  manually_edited: boolean;
  didnt_sleep: boolean;
  logged_at: number;
}

interface SymptomBackup {
  body_region: string;
  description: string;
}

interface SymptomLogBackup {
  symptom_body_region: string;
  symptom_description: string;
  timestamp: number;
  severity: number;
  notes?: string;
}

interface DailyReviewBackup {
  timestamp: number;
  social_did?: string;
  social_wished?: string;
  social_ratings?: string;
  productivity_did?: string;
  productivity_wished?: string;
  productivity_ratings?: string;
  wellness?: string;
  news_types?: string;
}

export const exportUserData = async (): Promise<string> => {
  if (!isDatabaseInitialized()) {
    throw new Error('Database not initialized');
  }

  return await withDatabase(async (db) => {
    const supplements = await db.getAllAsync(
      `SELECT name, default_dosage, dosage_unit, icon_id, color, schedule_enabled, study_enabled 
       FROM supplements WHERE name NOT LIKE ?`,
      [`%${TEST_DATA_MARKER}%`]
    ) as SupplementBackup[];

    const supplementLogs = await db.getAllAsync(
      `SELECT s.name as supplement_name, sl.timestamp, sl.dosage, sl.notes
       FROM supplement_logs sl
       JOIN supplements s ON sl.supplement_id = s.id
       WHERE s.name NOT LIKE ?
       ORDER BY sl.timestamp`,
      [`%${TEST_DATA_MARKER}%`]
    ) as SupplementLogBackup[];

    const activities = await db.getAllAsync(
      `SELECT name, unit, icon_id, color FROM activities WHERE name NOT LIKE ?`,
      [`%${TEST_DATA_MARKER}%`]
    ) as ActivityBackup[];

    const activityLogs = await db.getAllAsync(
      `SELECT a.name as activity_name, al.timestamp, al.value, al.notes
       FROM activity_logs al
       JOIN activities a ON al.activity_id = a.id
       WHERE a.name NOT LIKE ?
       ORDER BY al.timestamp`,
      [`%${TEST_DATA_MARKER}%`]
    ) as ActivityLogBackup[];

    const cognitiveTestResults = await db.getAllAsync(
      `SELECT test_type, timestamp, score, accuracy, speed, raw_data, completion_time
       FROM cognitive_test_results
       WHERE raw_data NOT LIKE ?
       ORDER BY timestamp`,
      [`%"isTestData":true%`]
    ) as CognitiveTestResultBackup[];

    const sleepLogs = await db.getAllAsync(
      `SELECT sleep_start, sleep_end, duration_seconds, manually_edited, didnt_sleep, logged_at
       FROM sleep_logs ORDER BY sleep_start`
    ) as SleepLogBackup[];

    const symptoms = await db.getAllAsync(
      `SELECT body_region, description FROM symptoms WHERE description NOT LIKE ?`,
      [`%${TEST_DATA_MARKER}%`]
    ) as SymptomBackup[];

    const symptomLogs = await db.getAllAsync(
      `SELECT s.body_region as symptom_body_region, s.description as symptom_description, 
              sl.timestamp, sl.severity, sl.notes
       FROM symptom_logs sl
       JOIN symptoms s ON sl.symptom_id = s.id
       WHERE s.description NOT LIKE ?
       ORDER BY sl.timestamp`,
      [`%${TEST_DATA_MARKER}%`]
    ) as SymptomLogBackup[];

    const dailyReviews = await db.getAllAsync(
      `SELECT timestamp, social_did, social_wished, social_ratings, 
              productivity_did, productivity_wished, productivity_ratings, wellness, news_types
       FROM daily_reviews ORDER BY timestamp`
    ) as DailyReviewBackup[];

    const backup: BackupData = {
      version: 1,
      exportedAt: new Date().toISOString(),
      supplements: supplements.map(s => ({
        ...s,
        schedule_enabled: Boolean(s.schedule_enabled),
        study_enabled: Boolean(s.study_enabled)
      })),
      supplementLogs,
      activities,
      activityLogs,
      cognitiveTestResults,
      sleepLogs: sleepLogs.map(s => ({
        ...s,
        manually_edited: Boolean(s.manually_edited),
        didnt_sleep: Boolean(s.didnt_sleep)
      })),
      symptoms,
      symptomLogs,
      dailyReviews
    };

    return JSON.stringify(backup, null, 2);
  }, 'exportUserData');
};

export const importUserData = async (jsonString: string): Promise<{ success: boolean; error?: string; stats?: ImportStats }> => {
  if (!isDatabaseInitialized()) {
    return { success: false, error: 'Database not initialized' };
  }

  let backup: BackupData;
  try {
    backup = JSON.parse(jsonString);
  } catch {
    return { success: false, error: 'Invalid JSON format' };
  }

  if (!backup.version || !backup.exportedAt) {
    return { success: false, error: 'Invalid backup format: missing version or exportedAt' };
  }

  if (backup.version > 1) {
    return { success: false, error: `Backup version ${backup.version} is not supported. Please update the app.` };
  }

  const requiredFields = ['supplements', 'supplementLogs', 'cognitiveTestResults', 'sleepLogs'];
  for (const field of requiredFields) {
    if (!Array.isArray((backup as any)[field])) {
      return { success: false, error: `Invalid backup format: ${field} must be an array` };
    }
  }

  try {
    const stats = await withDatabase(async (db) => {
      await db.runAsync(
        `DELETE FROM supplement_logs WHERE supplement_id IN 
         (SELECT id FROM supplements WHERE name NOT LIKE ?)`,
        [`%${TEST_DATA_MARKER}%`]
      );
      await db.runAsync(
        `DELETE FROM supplements WHERE name NOT LIKE ?`,
        [`%${TEST_DATA_MARKER}%`]
      );

      await db.runAsync(
        `DELETE FROM activity_logs WHERE activity_id IN 
         (SELECT id FROM activities WHERE name NOT LIKE ?)`,
        [`%${TEST_DATA_MARKER}%`]
      );
      await db.runAsync(
        `DELETE FROM activities WHERE name NOT LIKE ?`,
        [`%${TEST_DATA_MARKER}%`]
      );

      await db.runAsync(
        `DELETE FROM cognitive_test_results WHERE raw_data NOT LIKE ?`,
        [`%"isTestData":true%`]
      );

      await db.runAsync('DELETE FROM sleep_logs');

      await db.runAsync(
        `DELETE FROM symptom_logs WHERE symptom_id IN 
         (SELECT id FROM symptoms WHERE description NOT LIKE ?)`,
        [`%${TEST_DATA_MARKER}%`]
      );
      await db.runAsync(
        `DELETE FROM symptoms WHERE description NOT LIKE ?`,
        [`%${TEST_DATA_MARKER}%`]
      );

      await db.runAsync('DELETE FROM daily_reviews');

      const importStats: ImportStats = {
        supplements: 0,
        supplementLogs: 0,
        activities: 0,
        activityLogs: 0,
        cognitiveTestResults: 0,
        sleepLogs: 0,
        symptoms: 0,
        symptomLogs: 0,
        dailyReviews: 0
      };

      const supplementIdMap = new Map<string, number>();
      for (const supp of backup.supplements || []) {
        const result = await db.runAsync(
          `INSERT INTO supplements (name, default_dosage, dosage_unit, icon_id, color, schedule_enabled, study_enabled)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [supp.name, supp.default_dosage, supp.dosage_unit, supp.icon_id || null, 
           supp.color || '#007AFF', supp.schedule_enabled ? 1 : 0, supp.study_enabled ? 1 : 0]
        );
        supplementIdMap.set(supp.name, result.lastInsertRowId);
        importStats.supplements++;
      }

      for (const log of backup.supplementLogs || []) {
        const suppId = supplementIdMap.get(log.supplement_name);
        if (suppId) {
          await db.runAsync(
            `INSERT INTO supplement_logs (supplement_id, timestamp, dosage, notes) VALUES (?, ?, ?, ?)`,
            [suppId, log.timestamp, log.dosage, log.notes || null]
          );
          importStats.supplementLogs++;
        }
      }

      const activityIdMap = new Map<string, number>();
      for (const act of backup.activities || []) {
        const result = await db.runAsync(
          `INSERT INTO activities (name, default_value, unit, icon_id, color) VALUES (?, ?, ?, ?, ?)`,
          [act.name, act.default_value ?? 0, act.unit, act.icon_id || null, act.color || '#007AFF']
        );
        activityIdMap.set(act.name, result.lastInsertRowId);
        importStats.activities++;
      }

      for (const log of backup.activityLogs || []) {
        const actId = activityIdMap.get(log.activity_name);
        if (actId) {
          await db.runAsync(
            `INSERT INTO activity_logs (activity_id, timestamp, value, notes) VALUES (?, ?, ?, ?)`,
            [actId, log.timestamp, log.value, log.notes || null]
          );
          importStats.activityLogs++;
        }
      }

      for (const result of backup.cognitiveTestResults || []) {
        await db.runAsync(
          `INSERT INTO cognitive_test_results (test_type, timestamp, score, accuracy, speed, raw_data, completion_time)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [result.test_type, result.timestamp, result.score, result.accuracy || null,
           result.speed || null, result.raw_data || null, result.completion_time || null]
        );
        importStats.cognitiveTestResults++;
      }

      for (const log of backup.sleepLogs || []) {
        await db.runAsync(
          `INSERT INTO sleep_logs (sleep_start, sleep_end, duration_seconds, manually_edited, didnt_sleep, logged_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [log.sleep_start, log.sleep_end, log.duration_seconds, 
           log.manually_edited ? 1 : 0, log.didnt_sleep ? 1 : 0, log.logged_at]
        );
        importStats.sleepLogs++;
      }

      const symptomIdMap = new Map<string, number>();
      for (const symptom of backup.symptoms || []) {
        const key = `${symptom.body_region}:${symptom.description}`;
        const result = await db.runAsync(
          `INSERT INTO symptoms (body_region, description, last_used) VALUES (?, ?, ?)`,
          [symptom.body_region, symptom.description, Math.floor(Date.now() / 1000)]
        );
        symptomIdMap.set(key, result.lastInsertRowId);
        importStats.symptoms++;
      }

      for (const log of backup.symptomLogs || []) {
        const key = `${log.symptom_body_region}:${log.symptom_description}`;
        const symptomId = symptomIdMap.get(key);
        if (symptomId) {
          await db.runAsync(
            `INSERT INTO symptom_logs (symptom_id, timestamp, severity, notes) VALUES (?, ?, ?, ?)`,
            [symptomId, log.timestamp, log.severity, log.notes || null]
          );
          importStats.symptomLogs++;
        }
      }

      for (const review of backup.dailyReviews || []) {
        await db.runAsync(
          `INSERT INTO daily_reviews (timestamp, social_did, social_wished, social_ratings, 
           productivity_did, productivity_wished, productivity_ratings, wellness, news_types)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [review.timestamp, review.social_did || '[]', review.social_wished || '[]',
           review.social_ratings || '{}', review.productivity_did || '[]', 
           review.productivity_wished || '[]', review.productivity_ratings || '{}',
           review.wellness || null, review.news_types || '[]']
        );
        importStats.dailyReviews++;
      }

      return importStats;
    }, 'importUserData');

    return { success: true, stats };
  } catch (error) {
    return { success: false, error: `Import failed: ${error}` };
  }
};

export interface ImportStats {
  supplements: number;
  supplementLogs: number;
  activities: number;
  activityLogs: number;
  cognitiveTestResults: number;
  sleepLogs: number;
  symptoms: number;
  symptomLogs: number;
  dailyReviews: number;
}
