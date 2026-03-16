import { openDatabase } from './database';

export interface ExportOptions {
  startDate?: Date;
  endDate?: Date;
  tables?: string[];
}

// Convert Unix timestamp to readable date string
const formatTimestamp = (timestamp: number): string => {
  const date = new Date(timestamp * 1000);
  return date.toISOString().replace('T', ' ').slice(0, 19);
};

// Convert Unix timestamp to readable date only
const formatDate = (timestamp: number): string => {
  const date = new Date(timestamp * 1000);
  return date.toISOString().slice(0, 10);
};

// Escape CSV field values
const escapeCsvField = (value: any): string => {
  if (value === null || value === undefined) return '';
  
  const stringValue = String(value);
  
  // If the value contains comma, quote, or newline, wrap in quotes and escape quotes
  if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  
  return stringValue;
};

// Convert array of objects to CSV string
const arrayToCsv = (data: any[], headers: string[]): string => {
  const csvHeaders = headers.join(',');
  const csvRows = data.map(row => 
    headers.map(header => escapeCsvField(row[header])).join(',')
  );
  
  return [csvHeaders, ...csvRows].join('\n');
};

// Export supplements table
export const exportSupplements = async (): Promise<string> => {
  const db = await openDatabase();
  const supplements = await db.getAllAsync('SELECT * FROM supplements ORDER BY name');
  
  const headers = ['id', 'name', 'default_dosage', 'dosage_unit', 'icon_id', 'color', 'schedule_enabled', 'study_enabled'];
  return arrayToCsv(supplements, headers);
};

// Export supplement logs with readable timestamps
export const exportSupplementLogs = async (options?: ExportOptions): Promise<string> => {
  const db = await openDatabase();
  
  let query = `
    SELECT 
      sl.id,
      s.name as supplement_name,
      sl.supplement_id,
      sl.timestamp,
      sl.dosage,
      sl.notes
    FROM supplement_logs sl
    JOIN supplements s ON sl.supplement_id = s.id
  `;
  
  const params: any[] = [];
  
  if (options?.startDate || options?.endDate) {
    const conditions = [];
    if (options.startDate) {
      conditions.push('sl.timestamp >= ?');
      params.push(Math.floor(options.startDate.getTime() / 1000));
    }
    if (options.endDate) {
      conditions.push('sl.timestamp <= ?');
      params.push(Math.floor(options.endDate.getTime() / 1000));
    }
    query += ' WHERE ' + conditions.join(' AND ');
  }
  
  query += ' ORDER BY sl.timestamp DESC';
  
  const logs = await db.getAllAsync(query, params);
  
  // Convert timestamps to readable format
  const formattedLogs = logs.map((log: any) => ({
    ...log,
    timestamp_readable: formatTimestamp(log.timestamp),
    date: formatDate(log.timestamp)
  }));
  
  const headers = ['id', 'supplement_name', 'supplement_id', 'timestamp', 'timestamp_readable', 'date', 'dosage', 'notes'];
  return arrayToCsv(formattedLogs, headers);
};

// Export symptoms table
export const exportSymptoms = async (): Promise<string> => {
  const db = await openDatabase();
  const symptoms = await db.getAllAsync('SELECT * FROM symptoms ORDER BY body_region, description');
  
  // Convert last_used timestamp
  const formattedSymptoms = symptoms.map((symptom: any) => ({
    ...symptom,
    last_used_readable: formatTimestamp(symptom.last_used)
  }));
  
  const headers = ['id', 'body_region', 'description', 'last_used', 'last_used_readable'];
  return arrayToCsv(formattedSymptoms, headers);
};

// Export symptom logs with readable timestamps
export const exportSymptomLogs = async (options?: ExportOptions): Promise<string> => {
  const db = await openDatabase();
  
  let query = `
    SELECT 
      sl.id,
      s.body_region,
      s.description as symptom_description,
      sl.symptom_id,
      sl.timestamp,
      sl.severity,
      sl.notes
    FROM symptom_logs sl
    JOIN symptoms s ON sl.symptom_id = s.id
  `;
  
  const params: any[] = [];
  
  if (options?.startDate || options?.endDate) {
    const conditions = [];
    if (options.startDate) {
      conditions.push('sl.timestamp >= ?');
      params.push(Math.floor(options.startDate.getTime() / 1000));
    }
    if (options.endDate) {
      conditions.push('sl.timestamp <= ?');
      params.push(Math.floor(options.endDate.getTime() / 1000));
    }
    query += ' WHERE ' + conditions.join(' AND ');
  }
  
  query += ' ORDER BY sl.timestamp DESC';
  
  const logs = await db.getAllAsync(query, params);
  
  // Convert timestamps to readable format
  const formattedLogs = logs.map((log: any) => ({
    ...log,
    timestamp_readable: formatTimestamp(log.timestamp),
    date: formatDate(log.timestamp)
  }));
  
  const headers = ['id', 'body_region', 'symptom_description', 'symptom_id', 'timestamp', 'timestamp_readable', 'date', 'severity', 'notes'];
  return arrayToCsv(formattedLogs, headers);
};

// Export cognitive test results with readable timestamps
export const exportCognitiveTestResults = async (options?: ExportOptions): Promise<string> => {
  const db = await openDatabase();
  
  let query = `
    SELECT 
      ctr.id,
      ctr.test_type,
      ctr.timestamp,
      ctr.score,
      ctr.accuracy,
      ctr.speed,
      ctr.raw_data,
      ctr.study_id,
      ctr.supplement_log_id,
      sp.supplement_id,
      s.name as supplement_name
    FROM cognitive_test_results ctr
    LEFT JOIN study_protocols sp ON ctr.study_id = sp.id
    LEFT JOIN supplements s ON sp.supplement_id = s.id
  `;
  
  const params: any[] = [];
  
  if (options?.startDate || options?.endDate) {
    const conditions = [];
    if (options.startDate) {
      conditions.push('ctr.timestamp >= ?');
      params.push(Math.floor(options.startDate.getTime() / 1000));
    }
    if (options.endDate) {
      conditions.push('ctr.timestamp <= ?');
      params.push(Math.floor(options.endDate.getTime() / 1000));
    }
    query += ' WHERE ' + conditions.join(' AND ');
  }
  
  query += ' ORDER BY ctr.timestamp DESC';
  
  const results = await db.getAllAsync(query, params);
  
  // Convert timestamps to readable format
  const formattedResults = results.map((result: any) => ({
    ...result,
    timestamp_readable: formatTimestamp(result.timestamp),
    date: formatDate(result.timestamp)
  }));
  
  const headers = ['id', 'test_type', 'timestamp', 'timestamp_readable', 'date', 'score', 'raw_data', 'study_id', 'supplement_log_id', 'supplement_id', 'supplement_name'];
  return arrayToCsv(formattedResults, headers);
};

// Export sleep logs with readable timestamps
export const exportSleepLogs = async (options?: ExportOptions): Promise<string> => {
  const db = await openDatabase();
  
  let query = 'SELECT * FROM sleep_logs';
  const params: any[] = [];
  
  if (options?.startDate || options?.endDate) {
    const conditions = [];
    if (options.startDate) {
      conditions.push('sleep_start >= ?');
      params.push(Math.floor(options.startDate.getTime() / 1000));
    }
    if (options.endDate) {
      conditions.push('sleep_end <= ?');
      params.push(Math.floor(options.endDate.getTime() / 1000));
    }
    query += ' WHERE ' + conditions.join(' AND ');
  }
  
  query += ' ORDER BY sleep_start DESC';
  
  const logs = await db.getAllAsync(query, params);
  
  // Convert timestamps to readable format
  const formattedLogs = logs.map((log: any) => ({
    ...log,
    sleep_start_readable: formatTimestamp(log.sleep_start),
    sleep_end_readable: formatTimestamp(log.sleep_end),
    sleep_date: formatDate(log.sleep_start),
    duration_hours: (log.duration_seconds / 3600).toFixed(2)
  }));
  
  const headers = ['id', 'sleep_start', 'sleep_start_readable', 'sleep_end', 'sleep_end_readable', 'sleep_date', 'duration_seconds', 'duration_hours', 'manually_edited'];
  return arrayToCsv(formattedLogs, headers);
};

// Export schedules
export const exportSchedules = async (): Promise<string> => {
  const db = await openDatabase();

  const schedules = await db.getAllAsync(`
    SELECT
      sch.id,
      sch.schedule_type,
      s.name as supplement_name,
      sch.supplement_id,
      a.name as activity_name,
      sch.activity_id,
      sch.test_type,
      sch.time,
      sch.days,
      sch.enabled,
      sch.created_at
    FROM schedules sch
    LEFT JOIN supplements s ON sch.supplement_id = s.id
    LEFT JOIN activities a ON sch.activity_id = a.id
    ORDER BY sch.schedule_type, sch.time
  `);

  const headers = ['id', 'schedule_type', 'supplement_name', 'supplement_id', 'activity_name', 'activity_id', 'test_type', 'time', 'days', 'enabled', 'created_at'];
  return arrayToCsv(schedules, headers);
};

// Export exclusions
export const exportExclusions = async (): Promise<string> => {
  const db = await openDatabase();
  
  const exclusions = await db.getAllAsync(`
    SELECT 
      e.id,
      s.name as supplement_name,
      e.supplement_id,
      e.exclusion_type,
      e.parameters
    FROM exclusions e
    JOIN supplements s ON e.supplement_id = s.id
    ORDER BY s.name, e.exclusion_type
  `);
  
  const headers = ['id', 'supplement_name', 'supplement_id', 'exclusion_type', 'parameters'];
  return arrayToCsv(exclusions, headers);
};

// Export activity logs with readable timestamps
export const exportActivityLogs = async (options?: ExportOptions): Promise<string> => {
  const db = await openDatabase();
  
  let query = `
    SELECT 
      al.id,
      a.name as activity_name,
      al.activity_id,
      al.timestamp,
      al.value,
      a.unit,
      al.notes
    FROM activity_logs al
    JOIN activities a ON al.activity_id = a.id
  `;
  
  const params: any[] = [];
  
  if (options?.startDate || options?.endDate) {
    const conditions = [];
    if (options.startDate) {
      conditions.push('al.timestamp >= ?');
      params.push(Math.floor(options.startDate.getTime() / 1000));
    }
    if (options.endDate) {
      conditions.push('al.timestamp <= ?');
      params.push(Math.floor(options.endDate.getTime() / 1000));
    }
    query += ' WHERE ' + conditions.join(' AND ');
  }
  
  query += ' ORDER BY al.timestamp DESC';
  
  const logs = await db.getAllAsync(query, params);
  
  const formattedLogs = logs.map((log: any) => ({
    ...log,
    timestamp_readable: formatTimestamp(log.timestamp),
    date: formatDate(log.timestamp)
  }));
  
  const headers = ['id', 'activity_name', 'activity_id', 'timestamp', 'timestamp_readable', 'date', 'value', 'unit', 'notes'];
  return arrayToCsv(formattedLogs, headers);
};

// Export daily reviews with readable timestamps
export const exportDailyReviews = async (options?: ExportOptions): Promise<string> => {
  const db = await openDatabase();
  
  let query = 'SELECT * FROM daily_reviews';
  const params: any[] = [];
  
  if (options?.startDate || options?.endDate) {
    const conditions = [];
    if (options.startDate) {
      conditions.push('timestamp >= ?');
      params.push(Math.floor(options.startDate.getTime() / 1000));
    }
    if (options.endDate) {
      conditions.push('timestamp <= ?');
      params.push(Math.floor(options.endDate.getTime() / 1000));
    }
    query += ' WHERE ' + conditions.join(' AND ');
  }
  
  query += ' ORDER BY timestamp DESC';
  
  const reviews = await db.getAllAsync(query, params);
  
  const formattedReviews = reviews.map((review: any) => ({
    ...review,
    timestamp_readable: formatTimestamp(review.timestamp),
    date: formatDate(review.timestamp)
  }));
  
  const headers = ['id', 'timestamp', 'timestamp_readable', 'date', 'social_did', 'social_wished', 'social_ratings', 'productivity_did', 'productivity_wished', 'productivity_ratings', 'wellness', 'news_types'];
  return arrayToCsv(formattedReviews, headers);
};

// Export study protocols
export const exportStudyProtocols = async (): Promise<string> => {
  const db = await openDatabase();
  
  const protocols = await db.getAllAsync(`
    SELECT 
      sp.id,
      s.name as supplement_name,
      sp.supplement_id,
      sp.test_type,
      sp.interval_minutes,
      sp.duration_minutes,
      sp.schedule_type,
      sp.parameters
    FROM study_protocols sp
    LEFT JOIN supplements s ON sp.supplement_id = s.id
    ORDER BY s.name, sp.test_type
  `);
  
  const headers = ['id', 'supplement_name', 'supplement_id', 'test_type', 'interval_minutes', 'duration_minutes', 'schedule_type', 'parameters'];
  return arrayToCsv(protocols, headers);
};

// Export all data as a combined package
export const exportAllData = async (options?: ExportOptions): Promise<{[key: string]: string}> => {
  const exports: {[key: string]: string} = {};
  const tables = options?.tables;

  const shouldExport = (key: string) => !tables || tables.includes(key);

  // Reference tables
  if (shouldExport('supplements')) exports.supplements = await exportSupplements();
  if (shouldExport('schedules')) exports.schedules = await exportSchedules();

  // Time-based data with optional date filtering
  if (shouldExport('supplement_logs')) exports.supplement_logs = await exportSupplementLogs(options);
  if (shouldExport('cognitive_test_results')) exports.cognitive_test_results = await exportCognitiveTestResults(options);
  if (shouldExport('sleep_logs')) exports.sleep_logs = await exportSleepLogs(options);
  if (shouldExport('activity_logs')) exports.activity_logs = await exportActivityLogs(options);
  if (shouldExport('daily_reviews')) exports.daily_reviews = await exportDailyReviews(options);

  return exports;
};

// Get export statistics
export const getExportStats = async (): Promise<{[key: string]: number}> => {
  const db = await openDatabase();
  
  const stats: {[key: string]: number} = {};
  
  const tableQueries = [
    { name: 'supplements', query: 'SELECT COUNT(*) as count FROM supplements' },
    { name: 'supplement_logs', query: 'SELECT COUNT(*) as count FROM supplement_logs' },
    { name: 'symptoms', query: 'SELECT COUNT(*) as count FROM symptoms' },
    { name: 'symptom_logs', query: 'SELECT COUNT(*) as count FROM symptom_logs' },
    { name: 'cognitive_test_results', query: 'SELECT COUNT(*) as count FROM cognitive_test_results' },
    { name: 'sleep_logs', query: 'SELECT COUNT(*) as count FROM sleep_logs' },
    { name: 'activity_logs', query: 'SELECT COUNT(*) as count FROM activity_logs' },
    { name: 'daily_reviews', query: 'SELECT COUNT(*) as count FROM daily_reviews' },
    { name: 'schedules', query: 'SELECT COUNT(*) as count FROM schedules' },
    { name: 'exclusions', query: 'SELECT COUNT(*) as count FROM exclusions' },
    { name: 'study_protocols', query: 'SELECT COUNT(*) as count FROM study_protocols' }
  ];
  
  for (const tableQuery of tableQueries) {
    try {
      const result = await db.getAllAsync(tableQuery.query);
      stats[tableQuery.name] = (result[0] as any).count;
    } catch {
      stats[tableQuery.name] = 0;
    }
  }
  
  return stats;
};