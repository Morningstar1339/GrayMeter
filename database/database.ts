import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SQLite from 'expo-sqlite';
import { logDatabaseAccess } from '../utils/database-tracker';

const DATABASE_NAME = 'neurosync.db';

// Global state
let sqliteDb: SQLite.SQLiteDatabase | null = null;
let isDatabaseReady = false;
let isInitializing = false;
let fallbackMode = false;
let fallbackData: { [key: string]: any[] } = {};

// Logging helpers
const logError = (operation: string, error: any) => {
  const timestamp = new Date().toISOString();
  const errorMessage = error instanceof Error ? error.message : String(error);
  console.error(`[${timestamp}] DATABASE ERROR in ${operation}: ${errorMessage}`);
};

const logInfo = (operation: string, message: string) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [DB:${operation}] ${message}`);
};

// --- Basic status helpers ----------------------------------------------------

export const isDatabaseInitialized = () => {
  return isDatabaseReady && !!sqliteDb && !fallbackMode;
};

export const isFallbackMode = () => fallbackMode;

export const getDatabaseInstanceStatus = () => {
  return {
    hasInstance: !!sqliteDb,
    isReady: isDatabaseReady,
    isInitializing,
    isFallback: fallbackMode,
  };
};

/**
 * Lightweight, synchronous health snapshot used across the app.
 * We don't hit the real database here to keep it sync-friendly.
 */
export const checkDatabaseHealth = (): {
  healthy: boolean;
  issues: string[];
  details: {
    hasInstance: boolean;
    isReady: boolean;
    isFallback: boolean;
    connectionTest: boolean;
    tablesExist: boolean;
  };
} => {
  const status = getDatabaseInstanceStatus();
  const issues: string[] = [];

  if (!status.hasInstance) issues.push('No SQLite instance created');
  if (!status.isReady) issues.push('Database not marked ready');
  if (status.isFallback) issues.push('Database running in fallback (in-memory) mode');

  // For now we do not run a real test query here – we just reflect flags.
  const details = {
    hasInstance: status.hasInstance,
    isReady: status.isReady,
    isFallback: status.isFallback,
    connectionTest: status.hasInstance && status.isReady && !status.isFallback,
    tablesExist: status.hasInstance && status.isReady,
  };

  const healthy = issues.length === 0;

  logInfo(
    'checkDatabaseHealth',
    `Health check: healthy=${healthy}, hasInstance=${details.hasInstance}, isReady=${details.isReady}, isFallback=${details.isFallback}`,
  );

  return { healthy, issues, details };
};

// --- Core SQLite initialization ----------------------------------------------

/**
 * Actually open the SQLite database and perform any one-time setup.
 * This is always async; callers should use initializeDatabase* helpers or openDatabase().
 */
const openSQLiteDatabaseInternal = async (): Promise<SQLite.SQLiteDatabase> => {
  if (sqliteDb && isDatabaseReady && !fallbackMode) {
    return sqliteDb;
  }

  try {
    logInfo('openSQLiteDatabaseInternal', `Opening SQLite database "${DATABASE_NAME}"...`);
    const db = await SQLite.openDatabaseAsync(DATABASE_NAME);

    // Optional: enable WAL for better concurrency
    try {
      await db.execAsync(`PRAGMA journal_mode = WAL;`);
    } catch (pragmaError) {
      logError('openSQLiteDatabaseInternal', pragmaError);
    }

    // Run critical migrations FIRST before any table creation or queries
    try {
      await db.execAsync(`ALTER TABLE schedules ADD COLUMN activity_id INTEGER`);
      logInfo('openSQLiteDatabaseInternal', 'Added activity_id column to schedules');
    } catch (e) {
      // Column already exists or table doesn't exist yet - both OK
    }
    
    try {
      await db.execAsync(`ALTER TABLE notification_settings ADD COLUMN bedtime_reminder_enabled INTEGER DEFAULT 0`);
      logInfo('openSQLiteDatabaseInternal', 'Added bedtime_reminder_enabled column');
    } catch (e) {
      // Column already exists or table doesn't exist yet - both OK
    }
    
    try {
      await db.execAsync(`ALTER TABLE notification_settings ADD COLUMN bedtime_reminder_time TEXT DEFAULT '22:00'`);
      logInfo('openSQLiteDatabaseInternal', 'Added bedtime_reminder_time column');
    } catch (e) {
      // Column already exists or table doesn't exist yet - both OK
    }

    // Create all tables
    logInfo('openSQLiteDatabaseInternal', 'Creating database tables...');
    await createTables(db);

    sqliteDb = db;
    isDatabaseReady = true;
    fallbackMode = false;

    logDatabaseAccess('openSQLiteDatabaseInternal', null, db, 'database.ts', 'SQLite database opened');
    logInfo('openSQLiteDatabaseInternal', 'SQLite database initialized successfully');

    return db;
  } catch (error) {
    logError('openSQLiteDatabaseInternal', error);
    sqliteDb = null;
    isDatabaseReady = false;
    fallbackMode = true;
    throw error;
  }
};

const createTables = async (db: SQLite.SQLiteDatabase): Promise<void> => {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS supplements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      default_dosage REAL NOT NULL,
      dosage_unit TEXT NOT NULL,
      icon_id TEXT,
      color TEXT DEFAULT '#007AFF',
      schedule_enabled INTEGER DEFAULT 0,
      study_enabled INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS supplement_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      supplement_id INTEGER NOT NULL,
      timestamp INTEGER NOT NULL,
      dosage REAL NOT NULL,
      notes TEXT,
      FOREIGN KEY (supplement_id) REFERENCES supplements (id)
    );

    CREATE TABLE IF NOT EXISTS symptoms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      body_region TEXT NOT NULL,
      description TEXT NOT NULL,
      last_used INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS symptom_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symptom_id INTEGER NOT NULL,
      timestamp INTEGER NOT NULL,
      severity INTEGER NOT NULL,
      notes TEXT,
      FOREIGN KEY (symptom_id) REFERENCES symptoms (id)
    );

    CREATE TABLE IF NOT EXISTS cognitive_test_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      test_type TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      score REAL NOT NULL,
      accuracy REAL DEFAULT 0,
      speed REAL DEFAULT 0,
      raw_data TEXT,
      completion_time REAL,
      study_id INTEGER,
      supplement_log_id INTEGER
    );

    CREATE TABLE IF NOT EXISTS sleep_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sleep_start INTEGER,
      sleep_end INTEGER,
      duration_seconds INTEGER,
      manually_edited INTEGER DEFAULT 0,
      didnt_sleep INTEGER DEFAULT 0,
      logged_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    );

    CREATE TABLE IF NOT EXISTS exclusions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      supplement_id INTEGER NOT NULL,
      exclusion_type TEXT NOT NULL,
      parameters TEXT NOT NULL,
      FOREIGN KEY (supplement_id) REFERENCES supplements (id)
    );

    CREATE TABLE IF NOT EXISTS study_protocols (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      supplement_id INTEGER,
      test_type TEXT NOT NULL,
      interval_minutes INTEGER NOT NULL,
      duration_minutes INTEGER NOT NULL,
      schedule_type TEXT NOT NULL,
      parameters TEXT
    );

    CREATE TABLE IF NOT EXISTS scheduled_tests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      study_protocol_id INTEGER NOT NULL,
      supplement_log_id INTEGER,
      test_type TEXT NOT NULL,
      scheduled_time INTEGER NOT NULL,
      completed INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS notification_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      notification_id TEXT NOT NULL,
      type TEXT NOT NULL,
      related_id INTEGER NOT NULL,
      scheduled_time INTEGER NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      data TEXT,
      created_at INTEGER NOT NULL,
      cancelled INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS notification_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      notifications_enabled INTEGER DEFAULT 1,
      supplement_reminders_enabled INTEGER DEFAULT 1,
      study_notifications_enabled INTEGER DEFAULT 1,
      sleep_reminders_enabled INTEGER DEFAULT 1,
      sleep_reminder_type TEXT DEFAULT 'duration_based',
      sleep_reminder_time TEXT,
      sleep_reminder_hours INTEGER DEFAULT 16
    );

    CREATE TABLE IF NOT EXISTS schedules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      schedule_type TEXT NOT NULL CHECK (schedule_type IN ('supplement', 'cognitive_test', 'activity', 'sleep', 'daily_review', 'questionnaire')),
      supplement_id INTEGER,
      activity_id INTEGER,
      test_type TEXT,
      time TEXT NOT NULL,
      days TEXT NOT NULL,
      enabled INTEGER DEFAULT 1,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      FOREIGN KEY (supplement_id) REFERENCES supplements(id) ON DELETE CASCADE,
      FOREIGN KEY (activity_id) REFERENCES activities(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_schedules_supplement_id ON schedules (supplement_id);
    CREATE INDEX IF NOT EXISTS idx_schedules_activity_id ON schedules (activity_id);
    CREATE INDEX IF NOT EXISTS idx_schedules_type ON schedules (schedule_type);
    CREATE INDEX IF NOT EXISTS idx_schedules_enabled ON schedules (enabled);

    CREATE TABLE IF NOT EXISTS activities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      default_value REAL NOT NULL,
      unit TEXT NOT NULL,
      icon_id TEXT,
      color TEXT DEFAULT '#007AFF'
    );

    CREATE TABLE IF NOT EXISTS activity_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      activity_id INTEGER NOT NULL,
      timestamp INTEGER NOT NULL,
      value REAL NOT NULL,
      notes TEXT,
      FOREIGN KEY (activity_id) REFERENCES activities (id)
    );

    CREATE TABLE IF NOT EXISTS daily_reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp INTEGER NOT NULL,
      social_did TEXT NOT NULL DEFAULT '[]',
      social_wished TEXT NOT NULL DEFAULT '[]',
      social_ratings TEXT NOT NULL DEFAULT '{}',
      productivity_did TEXT NOT NULL DEFAULT '[]',
      productivity_wished TEXT NOT NULL DEFAULT '[]',
      productivity_ratings TEXT NOT NULL DEFAULT '{}',
      wellness TEXT,
      news_types TEXT NOT NULL DEFAULT '[]'
    );
  `);
  
  logInfo('createTables', 'All database tables created successfully');

  // Seed default activities if table is empty
  try {
    const activityCount = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM activities');
    if (activityCount && activityCount.count === 0) {
      await db.execAsync(`
        INSERT INTO activities (name, default_value, unit, icon_id, color) VALUES
          ('Walking', 30, 'minutes', 'walk', '#4CAF50'),
          ('Running', 30, 'minutes', 'fitness', '#FF5722'),
          ('Meditation', 15, 'minutes', 'leaf', '#9C27B0'),
          ('Reading', 30, 'minutes', 'book', '#2196F3'),
          ('Stretching', 15, 'minutes', 'barbell', '#FF9800'),
          ('Cycling', 30, 'minutes', 'bicycle', '#009688');
      `);
      logInfo('createTables', 'Seeded default activities');
    }
  } catch (e: any) {
    logInfo('createTables', 'Activities seed skipped: ' + e.message);
  }

  await runMigrations(db);
};

const runMigrations = async (db: SQLite.SQLiteDatabase): Promise<void> => {
  try {
    // Migration: Recreate schedules table with updated CHECK constraint for all schedule types
    const schedulesColumns = await db.getAllAsync<{ name: string }>(
      "PRAGMA table_info(schedules)"
    );
    const scheduleColumnNames = schedulesColumns.map((col: any) => col.name);
    
    // Check if we need to migrate: activity_id column missing means old schema
    if (schedulesColumns.length > 0 && !scheduleColumnNames.includes('activity_id')) {
      logInfo('runMigrations', 'Adding activity_id column to schedules table...');
      
      try {
        await db.execAsync('ALTER TABLE schedules ADD COLUMN activity_id INTEGER');
        await db.execAsync('CREATE INDEX IF NOT EXISTS idx_schedules_activity_id ON schedules (activity_id)');
        logInfo('runMigrations', 'Added activity_id column to schedules');
      } catch (e: any) {
        if (!e.message?.includes('duplicate column')) {
          logError('runMigrations', `Failed to add activity_id column: ${e.message}`);
        }
      }
    }
    
    // Migration: Add didnt_sleep column to sleep_logs if missing
    const sleepLogsColumns = await db.getAllAsync<{ name: string }>(
      "PRAGMA table_info(sleep_logs)"
    );
    const columnNames = sleepLogsColumns.map((col: any) => col.name);
    
    if (!columnNames.includes('didnt_sleep')) {
      try {
        await db.execAsync(`ALTER TABLE sleep_logs ADD COLUMN didnt_sleep INTEGER DEFAULT 0`);
        logInfo('runMigrations', 'Added didnt_sleep column to sleep_logs');
      } catch (e: any) {
        if (!e.message?.includes('duplicate column')) {
          logError('runMigrations', e);
        }
      }
    }
    
    if (!columnNames.includes('logged_at')) {
      try {
        await db.execAsync(`ALTER TABLE sleep_logs ADD COLUMN logged_at INTEGER`);
        logInfo('runMigrations', 'Added logged_at column to sleep_logs');
      } catch (e: any) {
        if (!e.message?.includes('duplicate column')) {
          logError('runMigrations', e);
        }
      }
    }
    
    // Migration: Add accuracy and speed columns to cognitive_test_results if missing
    const cogTestColumns = await db.getAllAsync<{ name: string }>(
      "PRAGMA table_info(cognitive_test_results)"
    );
    const cogColumnNames = cogTestColumns.map((col: any) => col.name);
    
    if (!cogColumnNames.includes('accuracy')) {
      try {
        await db.execAsync(`ALTER TABLE cognitive_test_results ADD COLUMN accuracy REAL DEFAULT 0`);
        logInfo('runMigrations', 'Added accuracy column to cognitive_test_results');
      } catch (e: any) {
        if (!e.message?.includes('duplicate column')) {
          logError('runMigrations', e);
        }
      }
    }
    
    if (!cogColumnNames.includes('speed')) {
      try {
        await db.execAsync(`ALTER TABLE cognitive_test_results ADD COLUMN speed REAL DEFAULT 0`);
        logInfo('runMigrations', 'Added speed column to cognitive_test_results');
      } catch (e: any) {
        if (!e.message?.includes('duplicate column')) {
          logError('runMigrations', e);
        }
      }
    }
    
    logInfo('runMigrations', 'Migrations completed successfully');
  } catch (error) {
    logError('runMigrations', error);
  }
};

/**
 * Public, synchronous-style initializer used by the app shell.
 * It kicks off async initialization but returns immediately.
 */
export const initializeDatabase = (): any => {
  if (isDatabaseReady && sqliteDb && !fallbackMode) {
    logInfo('initializeDatabase', 'Database already initialized');
    return sqliteDb;
  }

  if (isInitializing) {
    logInfo('initializeDatabase', 'Initialization already in progress');
    return sqliteDb;
  }

  isInitializing = true;

  const runInit = async () => {
    try {
      await openSQLiteDatabaseInternal();
    } catch (error) {
      // Switch to fallback mode on failure
      logError('initializeDatabase', error);
    } finally {
      isInitializing = false;
    }
  };

  void runInit();

  return sqliteDb;
};

/**
 * Retry wrapper for environments where we want to await initialization.
 */
export const initializeDatabaseWithRetry = async (
  maxRetries: number,
  delayMs: number = 500,
): Promise<{ success: boolean; error?: string; attempts: number }> => {
  let attempt = 0;
  let lastError: any = null;

  while (attempt < maxRetries) {
    attempt += 1;
    try {
      logInfo('initializeDatabaseWithRetry', `Attempt ${attempt} of ${maxRetries}`);
      await openSQLiteDatabaseInternal();
      return { success: true, attempts: attempt };
    } catch (error) {
      lastError = error;
      logError('initializeDatabaseWithRetry', error);
      if (attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  fallbackMode = true;
  return {
    success: false,
    error: lastError instanceof Error ? lastError.message : String(lastError),
    attempts: attempt,
  };
};

/**
 * Synchronous helper used in a few places that just kicks off initialization
 * and returns a status object.
 */
export const initializeDatabaseSafely = (): { success: boolean; error?: string } => {
  try {
    initializeDatabase();
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logError('initializeDatabaseSafely', error);
    return { success: false, error: message };
  }
};

// --- Getting a database instance & withDatabase wrapper -----------------------

/**
 * Low-level getter. May return null if DB failed and fallbackMode is true.
 */
export const getDatabase = (): SQLite.SQLiteDatabase | null => {
  logDatabaseAccess('getDatabase', sqliteDb, sqliteDb, 'database.ts', 'getDatabase called');

  if (fallbackMode) {
    logInfo('getDatabase', 'Fallback mode active, no SQLite DB available');
    return null;
  }

  if (!sqliteDb) {
    logInfo('getDatabase', 'No SQLite instance yet (did you call initializeDatabase?)');
    return null;
  }

  return sqliteDb;
};

/**
 * Main helper used across the codebase to run DB operations.
 * If fallbackMode is set and a fallbackOperation is provided, it will be used instead.
 */
export const withDatabase = async <T>(
  operation: (db: SQLite.SQLiteDatabase) => Promise<T>,
  operationName: string = 'database operation',
  fallbackOperation?: () => Promise<T>,
): Promise<T> => {
  const operationId = `${operationName}-${Date.now()}`;
  const timestamp = new Date().toISOString();

  logInfo(
    'withDatabase',
    `[${timestamp}] [${operationId}] Starting database operation: ${operationName}`,
  );

  try {
    if (fallbackMode && fallbackOperation) {
      logInfo('withDatabase', `[${operationId}] Using fallback mode for ${operationName}`);
      const result = await fallbackOperation();
      logInfo('withDatabase', `[${operationId}] ✅ Fallback operation completed successfully`);
      return result;
    }

    if (!sqliteDb || !isDatabaseReady) {
      if (fallbackOperation) {
        logError('withDatabase', `[${operationId}] DB not ready, using fallback`);
        const result = await fallbackOperation();
        logInfo('withDatabase', `[${operationId}] ✅ Fallback operation completed successfully`);
        return result;
      }
      throw new Error('Database is not initialized');
    }

    logDatabaseAccess('withDatabase:before', sqliteDb, sqliteDb, 'database.ts', operationName);
    const result = await operation(sqliteDb);
    logDatabaseAccess('withDatabase:after', sqliteDb, sqliteDb, 'database.ts', operationName);

    logInfo(
      'withDatabase',
      `[${operationId}] ✅ SQLite operation completed successfully: ${operationName}`,
    );
    return result;
  } catch (error) {
    logError('withDatabase', `[${operationId}] ❌ Operation failed: ${operationName}`);
    logError('withDatabase', error);

    if (fallbackOperation) {
      try {
        logInfo(
          'withDatabase',
          `[${operationId}] Database operation failed, attempting fallback for ${operationName}`,
        );
        const result = await fallbackOperation();
        logInfo('withDatabase', `[${operationId}] ✅ Fallback operation completed successfully`);
        return result;
      } catch (fallbackError) {
        logError(
          'withDatabase',
          `[${operationId}] ❌ Fallback operation also failed: ${String(fallbackError)}`,
        );
        throw new Error(
          `Both database and fallback operations failed: ${
            fallbackError instanceof Error ? fallbackError.message : 'Unknown error'
          }`,
        );
      }
    }

    throw error;
  }
};

// --- Reset & open helpers ----------------------------------------------------

/**
 * Called by some utilities that want a DB handle directly.
 * Always returns a SQLite database (or throws).
 */
export const openDatabase = async (): Promise<SQLite.SQLiteDatabase> => {
  try {
    if (sqliteDb && isDatabaseReady && !fallbackMode) {
      return sqliteDb;
    }
    const db = await openSQLiteDatabaseInternal();
    return db;
  } catch (error) {
    logError('openDatabase', error);
    throw error;
  }
};

// Reset database by clearing AsyncStorage + in-memory fallback.
// NOTE: This does NOT delete the SQLite file itself.
export const resetDatabase = async (): Promise<boolean> => {
  try {
    logInfo('resetDatabase', 'Starting database reset');

    const keys = await AsyncStorage.getAllKeys();

    const dbKeys = keys.filter(
      (key) =>
        key.startsWith('neurosync_') ||
        [
          'supplements',
          'supplement_logs',
          'symptoms',
          'symptom_logs',
          'cognitive_test_results',
          'sleep_logs',
          'performance_logs',
          'notification_settings',
          'notification_records',
          'study_protocols',
          'scheduled_tests',
        ].includes(key),
    );

    if (dbKeys.length > 0) {
      await AsyncStorage.multiRemove(dbKeys);
      logInfo('resetDatabase', `Cleared ${dbKeys.length} AsyncStorage keys`);
    }

    // Clear in-memory fallback
    fallbackData = {};
    resetDatabaseState();

    logInfo('resetDatabase', 'Database reset completed successfully');
    return true;
  } catch (error) {
    logError('resetDatabase', error);
    return false;
  }
};

export const resetDatabaseState = (): void => {
  logInfo('resetDatabaseState', 'Resetting database state flags and in-memory cache');
  sqliteDb = null;
  isDatabaseReady = false;
  isInitializing = false;
  fallbackMode = false;
  fallbackData = {};
};

// --- Fallback in-memory store ------------------------------------------------

export const getFallbackData = (table: string): any[] => {
  return fallbackData[table] || [];
};

export const addFallbackData = (table: string, data: any): number => {
  if (!fallbackData[table]) {
    fallbackData[table] = [];
  }
  const id = data.id ?? Date.now();
  const record = { ...data, id };
  fallbackData[table].push(record);
  return id;
};

export const updateFallbackData = (table: string, id: number, data: any): boolean => {
  const rows = fallbackData[table];
  if (!rows) return false;
  const index = rows.findIndex((row: any) => row.id === id);
  if (index === -1) return false;
  fallbackData[table][index] = { ...rows[index], ...data };
  return true;
};

export const deleteFallbackData = (table: string, id: number): boolean => {
  const rows = fallbackData[table];
  if (!rows) return false;
  const originalLength = rows.length;
  fallbackData[table] = rows.filter((row: any) => row.id !== id);
  return fallbackData[table].length !== originalLength;
};

// --- AsyncStorage helpers ----------------------------------------------------

export const asyncStorageGet = async (key: string): Promise<any[]> => {
  try {
    const value = await AsyncStorage.getItem(key);
    if (!value) return [];
    return JSON.parse(value);
  } catch (error) {
    logError('asyncStorageGet', error);
    return [];
  }
};

export const asyncStorageSet = async (key: string, data: any[]): Promise<void> => {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(data));
  } catch (error) {
    logError('asyncStorageSet', error);
  }
};

export const asyncStorageAdd = async (key: string, item: any): Promise<number> => {
  const current = await asyncStorageGet(key);
  const id = item.id ?? Date.now();
  current.push({ ...item, id });
  await asyncStorageSet(key, current);
  return id;
};

export const asyncStorageUpdate = async (
  key: string,
  id: number,
  updates: any,
): Promise<boolean> => {
  const current = await asyncStorageGet(key);
  const index = current.findIndex((row: any) => row.id === id);
  if (index === -1) return false;
  current[index] = { ...current[index], ...updates };
  await asyncStorageSet(key, current);
  return true;
};

export const asyncStorageDelete = async (key: string, id: number): Promise<boolean> => {
  const current = await asyncStorageGet(key);
  const filtered = current.filter((row: any) => row.id !== id);
  if (filtered.length === current.length) return false;
  await asyncStorageSet(key, filtered);
  return true;
};

// --- Status & diagnostics helpers --------------------------------------------

export const getDatabaseStatus = (): {
  ready: boolean;
  fallback: boolean;
  error?: string;
  diagnostic?: any;
} => {
  const diagnostic = getDatabaseInstanceStatus();

  if (fallbackMode) {
    return {
      ready: false,
      fallback: true,
      error:
        'Database failed to initialize - running in memory-only mode. Data will not persist.',
      diagnostic,
    };
  }

  if (isDatabaseInitialized()) {
    return {
      ready: true,
      fallback: false,
      diagnostic,
    };
  }

  return {
    ready: false,
    fallback: false,
    error: 'Database not initialized',
    diagnostic,
  };
};

// These are kept mostly for compatibility with previous AsyncStorage-centric design.
// They are used for debug UIs and diagnostics.

export const checkStoragePermissions = async (): Promise<{
  granted: boolean;
  reason?: string;
}> => {
  // AsyncStorage does not require explicit permissions on mobile;
  // we always report granted here.
  return {
    granted: true,
  };
};

export const getDatabasePath = (): string => {
  // expo-sqlite hides the real path; we expose a pseudo-path for display only.
  return `SQLite:${DATABASE_NAME}`;
};

export const checkDatabasePath = async (): Promise<{
  pathExists: boolean;
  fileExists: boolean;
  fileSize: number;
  isWritable: boolean;
  directoryExists: boolean;
  fullPath: string;
  error?: string;
}> => {
  try {
    // We cannot inspect the real filesystem path in a portable way with expo,
    // so we just return a best-effort diagnostic that the DB is logically available.
    const healthy = isDatabaseInitialized() && !fallbackMode;

    return {
      pathExists: healthy,
      fileExists: healthy,
      fileSize: 0,
      isWritable: healthy,
      directoryExists: true,
      fullPath: getDatabasePath(),
    };
  } catch (error) {
    logError('checkDatabasePath', error);
    return {
      pathExists: false,
      fileExists: false,
      fileSize: 0,
      isWritable: false,
      directoryExists: false,
      fullPath: getDatabasePath(),
      error: error instanceof Error ? error.message : String(error),
    };
  }
};
