import { openDatabase } from './database';

export interface ImportResult {
  success: boolean;
  tableName: string;
  totalRows: number;
  imported: number;
  skipped: number;
  errors: string[];
}

export interface ImportOptions {
  duplicateHandling: 'skip' | 'overwrite' | 'append';
  // For logs, match on timestamp; for reference tables, match on name/id
}

// Parse CSV string into array of objects
export const parseCsv = (csvContent: string): { headers: string[]; rows: Record<string, string>[] } => {
  const lines = csvContent.trim().split('\n');
  if (lines.length < 1) {
    return { headers: [], rows: [] };
  }

  const headers = parseCsvLine(lines[0]);
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);
    if (values.length === headers.length) {
      const row: Record<string, string> = {};
      headers.forEach((header, index) => {
        row[header] = values[index];
      });
      rows.push(row);
    }
  }

  return { headers, rows };
};

// Parse a single CSV line, handling quoted fields
const parseCsvLine = (line: string): string[] => {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];
    
    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        // Escaped quote
        current += '"';
        i++;
      } else if (char === '"') {
        // End of quoted field
        inQuotes = false;
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
  }
  
  result.push(current.trim());
  return result;
};

// Detect table type from CSV headers
export const detectTableType = (headers: string[]): string | null => {
  const headerSet = new Set(headers.map(h => h.toLowerCase()));
  
  // Check for specific header combinations to identify table type
  if (headerSet.has('supplement_name') && headerSet.has('dosage') && headerSet.has('timestamp')) {
    return 'supplement_logs';
  }
  if (headerSet.has('test_type') && headerSet.has('score') && headerSet.has('timestamp')) {
    return 'cognitive_test_results';
  }
  if (headerSet.has('sleep_start') && headerSet.has('sleep_end') && headerSet.has('duration_seconds')) {
    return 'sleep_logs';
  }
  if (headerSet.has('activity_name') && headerSet.has('value') && headerSet.has('timestamp')) {
    return 'activity_logs';
  }
  if (headerSet.has('body_region') && headerSet.has('severity') && headerSet.has('timestamp')) {
    return 'symptom_logs';
  }
  if (headerSet.has('social_did') && headerSet.has('productivity_did') && headerSet.has('wellness')) {
    return 'daily_reviews';
  }
  if (headerSet.has('default_dosage') && headerSet.has('dosage_unit') && headerSet.has('name')) {
    return 'supplements';
  }
  if (headerSet.has('time') && headerSet.has('days') && headerSet.has('enabled') && headerSet.has('supplement_id')) {
    return 'schedules';
  }
  
  return null;
};

// Get preview of import data
export const getImportPreview = (csvContent: string): {
  tableName: string | null;
  headers: string[];
  sampleRows: Record<string, string>[];
  totalRows: number;
} => {
  const { headers, rows } = parseCsv(csvContent);
  const tableName = detectTableType(headers);
  
  return {
    tableName,
    headers,
    sampleRows: rows.slice(0, 5), // First 5 rows as preview
    totalRows: rows.length
  };
};

// Import supplement logs
const importSupplementLogs = async (
  rows: Record<string, string>[],
  options: ImportOptions
): Promise<ImportResult> => {
  const db = await openDatabase();
  const result: ImportResult = {
    success: true,
    tableName: 'supplement_logs',
    totalRows: rows.length,
    imported: 0,
    skipped: 0,
    errors: []
  };

  // Get existing supplements by name for lookup
  const supplements = await db.getAllAsync('SELECT id, name FROM supplements');
  const supplementMap = new Map<string, number>();
  (supplements as any[]).forEach(s => supplementMap.set(s.name.toLowerCase(), s.id));

  for (const row of rows) {
    try {
      // Find supplement by name
      const supplementName = row.supplement_name?.toLowerCase();
      let supplementId = supplementMap.get(supplementName);
      
      // If supplement doesn't exist, create it
      if (!supplementId && row.supplement_name) {
        const insertResult = await db.runAsync(
          'INSERT INTO supplements (name, default_dosage, dosage_unit) VALUES (?, ?, ?)',
          [row.supplement_name, parseFloat(row.dosage) || 0, 'mg']
        );
        supplementId = insertResult.lastInsertRowId;
        supplementMap.set(supplementName, supplementId);
      }

      if (!supplementId) {
        result.errors.push(`Row skipped: no supplement name provided`);
        result.skipped++;
        continue;
      }

      // Parse timestamp - handle both Unix timestamp and readable format
      let timestamp: number;
      if (row.timestamp && !isNaN(Number(row.timestamp))) {
        timestamp = Number(row.timestamp);
      } else if (row.timestamp_readable) {
        timestamp = Math.floor(new Date(row.timestamp_readable).getTime() / 1000);
      } else {
        result.errors.push(`Row skipped: invalid timestamp`);
        result.skipped++;
        continue;
      }

      // Check for duplicates
      if (options.duplicateHandling !== 'append') {
        const existing = await db.getAllAsync(
          'SELECT id FROM supplement_logs WHERE supplement_id = ? AND timestamp = ?',
          [supplementId, timestamp]
        );
        
        if ((existing as any[]).length > 0) {
          if (options.duplicateHandling === 'skip') {
            result.skipped++;
            continue;
          } else if (options.duplicateHandling === 'overwrite') {
            await db.runAsync(
              'UPDATE supplement_logs SET dosage = ?, notes = ? WHERE supplement_id = ? AND timestamp = ?',
              [parseFloat(row.dosage) || 0, row.notes || null, supplementId, timestamp]
            );
            result.imported++;
            continue;
          }
        }
      }

      // Insert new record
      await db.runAsync(
        'INSERT INTO supplement_logs (supplement_id, timestamp, dosage, notes) VALUES (?, ?, ?, ?)',
        [supplementId, timestamp, parseFloat(row.dosage) || 0, row.notes || null]
      );
      result.imported++;
    } catch (error: any) {
      result.errors.push(`Error importing row: ${error.message}`);
    }
  }

  return result;
};

// Import cognitive test results
const importCognitiveTestResults = async (
  rows: Record<string, string>[],
  options: ImportOptions
): Promise<ImportResult> => {
  const db = await openDatabase();
  const result: ImportResult = {
    success: true,
    tableName: 'cognitive_test_results',
    totalRows: rows.length,
    imported: 0,
    skipped: 0,
    errors: []
  };

  for (const row of rows) {
    try {
      // Parse timestamp
      let timestamp: number;
      if (row.timestamp && !isNaN(Number(row.timestamp))) {
        timestamp = Number(row.timestamp);
      } else if (row.timestamp_readable) {
        timestamp = Math.floor(new Date(row.timestamp_readable).getTime() / 1000);
      } else {
        result.errors.push(`Row skipped: invalid timestamp`);
        result.skipped++;
        continue;
      }

      const testType = row.test_type;
      if (!testType) {
        result.errors.push(`Row skipped: no test_type provided`);
        result.skipped++;
        continue;
      }

      // Check for duplicates based on test_type and timestamp
      if (options.duplicateHandling !== 'append') {
        const existing = await db.getAllAsync(
          'SELECT id FROM cognitive_test_results WHERE test_type = ? AND timestamp = ?',
          [testType, timestamp]
        );
        
        if ((existing as any[]).length > 0) {
          if (options.duplicateHandling === 'skip') {
            result.skipped++;
            continue;
          } else if (options.duplicateHandling === 'overwrite') {
            await db.runAsync(
              'UPDATE cognitive_test_results SET score = ?, raw_data = ? WHERE test_type = ? AND timestamp = ?',
              [parseFloat(row.score) || 0, row.raw_data || null, testType, timestamp]
            );
            result.imported++;
            continue;
          }
        }
      }

      // Insert new record
      await db.runAsync(
        'INSERT INTO cognitive_test_results (test_type, timestamp, score, raw_data, study_id, supplement_log_id) VALUES (?, ?, ?, ?, ?, ?)',
        [
          testType,
          timestamp,
          parseFloat(row.score) || 0,
          row.raw_data || null,
          row.study_id ? parseInt(row.study_id) : null,
          row.supplement_log_id ? parseInt(row.supplement_log_id) : null
        ]
      );
      result.imported++;
    } catch (error: any) {
      result.errors.push(`Error importing row: ${error.message}`);
    }
  }

  return result;
};

// Import sleep logs
const importSleepLogs = async (
  rows: Record<string, string>[],
  options: ImportOptions
): Promise<ImportResult> => {
  const db = await openDatabase();
  const result: ImportResult = {
    success: true,
    tableName: 'sleep_logs',
    totalRows: rows.length,
    imported: 0,
    skipped: 0,
    errors: []
  };

  for (const row of rows) {
    try {
      // Parse timestamps
      let sleepStart: number;
      let sleepEnd: number;

      if (row.sleep_start && !isNaN(Number(row.sleep_start))) {
        sleepStart = Number(row.sleep_start);
      } else if (row.sleep_start_readable) {
        sleepStart = Math.floor(new Date(row.sleep_start_readable).getTime() / 1000);
      } else {
        result.errors.push(`Row skipped: invalid sleep_start`);
        result.skipped++;
        continue;
      }

      if (row.sleep_end && !isNaN(Number(row.sleep_end))) {
        sleepEnd = Number(row.sleep_end);
      } else if (row.sleep_end_readable) {
        sleepEnd = Math.floor(new Date(row.sleep_end_readable).getTime() / 1000);
      } else {
        result.errors.push(`Row skipped: invalid sleep_end`);
        result.skipped++;
        continue;
      }

      const durationSeconds = row.duration_seconds 
        ? parseInt(row.duration_seconds) 
        : sleepEnd - sleepStart;

      // Check for duplicates
      if (options.duplicateHandling !== 'append') {
        const existing = await db.getAllAsync(
          'SELECT id FROM sleep_logs WHERE sleep_start = ?',
          [sleepStart]
        );
        
        if ((existing as any[]).length > 0) {
          if (options.duplicateHandling === 'skip') {
            result.skipped++;
            continue;
          } else if (options.duplicateHandling === 'overwrite') {
            await db.runAsync(
              'UPDATE sleep_logs SET sleep_end = ?, duration_seconds = ?, manually_edited = ? WHERE sleep_start = ?',
              [sleepEnd, durationSeconds, row.manually_edited === '1' ? 1 : 0, sleepStart]
            );
            result.imported++;
            continue;
          }
        }
      }

      await db.runAsync(
        'INSERT INTO sleep_logs (sleep_start, sleep_end, duration_seconds, manually_edited) VALUES (?, ?, ?, ?)',
        [sleepStart, sleepEnd, durationSeconds, row.manually_edited === '1' ? 1 : 0]
      );
      result.imported++;
    } catch (error: any) {
      result.errors.push(`Error importing row: ${error.message}`);
    }
  }

  return result;
};

// Import activity logs
const importActivityLogs = async (
  rows: Record<string, string>[],
  options: ImportOptions
): Promise<ImportResult> => {
  const db = await openDatabase();
  const result: ImportResult = {
    success: true,
    tableName: 'activity_logs',
    totalRows: rows.length,
    imported: 0,
    skipped: 0,
    errors: []
  };

  // Get existing activities by name
  const activities = await db.getAllAsync('SELECT id, name FROM activities');
  const activityMap = new Map<string, number>();
  (activities as any[]).forEach(a => activityMap.set(a.name.toLowerCase(), a.id));

  for (const row of rows) {
    try {
      const activityName = row.activity_name?.toLowerCase();
      let activityId = activityMap.get(activityName);

      // Create activity if it doesn't exist
      if (!activityId && row.activity_name) {
        const insertResult = await db.runAsync(
          'INSERT INTO activities (name, unit) VALUES (?, ?)',
          [row.activity_name, row.unit || 'units']
        );
        activityId = insertResult.lastInsertRowId;
        activityMap.set(activityName, activityId);
      }

      if (!activityId) {
        result.errors.push(`Row skipped: no activity name provided`);
        result.skipped++;
        continue;
      }

      let timestamp: number;
      if (row.timestamp && !isNaN(Number(row.timestamp))) {
        timestamp = Number(row.timestamp);
      } else if (row.timestamp_readable) {
        timestamp = Math.floor(new Date(row.timestamp_readable).getTime() / 1000);
      } else {
        result.errors.push(`Row skipped: invalid timestamp`);
        result.skipped++;
        continue;
      }

      if (options.duplicateHandling !== 'append') {
        const existing = await db.getAllAsync(
          'SELECT id FROM activity_logs WHERE activity_id = ? AND timestamp = ?',
          [activityId, timestamp]
        );
        
        if ((existing as any[]).length > 0) {
          if (options.duplicateHandling === 'skip') {
            result.skipped++;
            continue;
          } else if (options.duplicateHandling === 'overwrite') {
            await db.runAsync(
              'UPDATE activity_logs SET value = ?, notes = ? WHERE activity_id = ? AND timestamp = ?',
              [parseFloat(row.value) || 0, row.notes || null, activityId, timestamp]
            );
            result.imported++;
            continue;
          }
        }
      }

      await db.runAsync(
        'INSERT INTO activity_logs (activity_id, timestamp, value, notes) VALUES (?, ?, ?, ?)',
        [activityId, timestamp, parseFloat(row.value) || 0, row.notes || null]
      );
      result.imported++;
    } catch (error: any) {
      result.errors.push(`Error importing row: ${error.message}`);
    }
  }

  return result;
};

// Import daily reviews
const importDailyReviews = async (
  rows: Record<string, string>[],
  options: ImportOptions
): Promise<ImportResult> => {
  const db = await openDatabase();
  const result: ImportResult = {
    success: true,
    tableName: 'daily_reviews',
    totalRows: rows.length,
    imported: 0,
    skipped: 0,
    errors: []
  };

  for (const row of rows) {
    try {
      let timestamp: number;
      if (row.timestamp && !isNaN(Number(row.timestamp))) {
        timestamp = Number(row.timestamp);
      } else if (row.timestamp_readable) {
        timestamp = Math.floor(new Date(row.timestamp_readable).getTime() / 1000);
      } else {
        result.errors.push(`Row skipped: invalid timestamp`);
        result.skipped++;
        continue;
      }

      if (options.duplicateHandling !== 'append') {
        const existing = await db.getAllAsync(
          'SELECT id FROM daily_reviews WHERE timestamp = ?',
          [timestamp]
        );
        
        if ((existing as any[]).length > 0) {
          if (options.duplicateHandling === 'skip') {
            result.skipped++;
            continue;
          } else if (options.duplicateHandling === 'overwrite') {
            await db.runAsync(
              `UPDATE daily_reviews SET 
                social_did = ?, social_wished = ?, social_ratings = ?,
                productivity_did = ?, productivity_wished = ?, productivity_ratings = ?,
                wellness = ?, news_types = ?
              WHERE timestamp = ?`,
              [
                row.social_did || null,
                row.social_wished || null,
                row.social_ratings || null,
                row.productivity_did || null,
                row.productivity_wished || null,
                row.productivity_ratings || null,
                row.wellness || null,
                row.news_types || null,
                timestamp
              ]
            );
            result.imported++;
            continue;
          }
        }
      }

      await db.runAsync(
        `INSERT INTO daily_reviews (
          timestamp, social_did, social_wished, social_ratings,
          productivity_did, productivity_wished, productivity_ratings,
          wellness, news_types
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          timestamp,
          row.social_did || null,
          row.social_wished || null,
          row.social_ratings || null,
          row.productivity_did || null,
          row.productivity_wished || null,
          row.productivity_ratings || null,
          row.wellness || null,
          row.news_types || null
        ]
      );
      result.imported++;
    } catch (error: any) {
      result.errors.push(`Error importing row: ${error.message}`);
    }
  }

  return result;
};

// Import supplements (reference table)
const importSupplements = async (
  rows: Record<string, string>[],
  options: ImportOptions
): Promise<ImportResult> => {
  const db = await openDatabase();
  const result: ImportResult = {
    success: true,
    tableName: 'supplements',
    totalRows: rows.length,
    imported: 0,
    skipped: 0,
    errors: []
  };

  for (const row of rows) {
    try {
      const name = row.name;
      if (!name) {
        result.errors.push(`Row skipped: no name provided`);
        result.skipped++;
        continue;
      }

      if (options.duplicateHandling !== 'append') {
        const existing = await db.getAllAsync(
          'SELECT id FROM supplements WHERE LOWER(name) = LOWER(?)',
          [name]
        );
        
        if ((existing as any[]).length > 0) {
          if (options.duplicateHandling === 'skip') {
            result.skipped++;
            continue;
          } else if (options.duplicateHandling === 'overwrite') {
            await db.runAsync(
              `UPDATE supplements SET 
                default_dosage = ?, dosage_unit = ?, icon_id = ?, color = ?,
                schedule_enabled = ?, study_enabled = ?
              WHERE LOWER(name) = LOWER(?)`,
              [
                parseFloat(row.default_dosage) || 0,
                row.dosage_unit || 'mg',
                row.icon_id || null,
                row.color || null,
                row.schedule_enabled === '1' ? 1 : 0,
                row.study_enabled === '1' ? 1 : 0,
                name
              ]
            );
            result.imported++;
            continue;
          }
        }
      }

      await db.runAsync(
        `INSERT INTO supplements (name, default_dosage, dosage_unit, icon_id, color, schedule_enabled, study_enabled)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          name,
          parseFloat(row.default_dosage) || 0,
          row.dosage_unit || 'mg',
          row.icon_id || null,
          row.color || null,
          row.schedule_enabled === '1' ? 1 : 0,
          row.study_enabled === '1' ? 1 : 0
        ]
      );
      result.imported++;
    } catch (error: any) {
      result.errors.push(`Error importing row: ${error.message}`);
    }
  }

  return result;
};

// Main import function
export const importCsvData = async (
  csvContent: string,
  options: ImportOptions = { duplicateHandling: 'skip' }
): Promise<ImportResult> => {
  const { headers, rows } = parseCsv(csvContent);
  const tableName = detectTableType(headers);

  if (!tableName) {
    return {
      success: false,
      tableName: 'unknown',
      totalRows: rows.length,
      imported: 0,
      skipped: rows.length,
      errors: ['Could not detect table type from CSV headers. Ensure the CSV was exported from GrayMeter.']
    };
  }

  switch (tableName) {
    case 'supplement_logs':
      return importSupplementLogs(rows, options);
    case 'cognitive_test_results':
      return importCognitiveTestResults(rows, options);
    case 'sleep_logs':
      return importSleepLogs(rows, options);
    case 'activity_logs':
      return importActivityLogs(rows, options);
    case 'daily_reviews':
      return importDailyReviews(rows, options);
    case 'supplements':
      return importSupplements(rows, options);
    default:
      return {
        success: false,
        tableName,
        totalRows: rows.length,
        imported: 0,
        skipped: rows.length,
        errors: [`Import not yet supported for table: ${tableName}`]
      };
  }
};
