/**
 * Web-compatible shim for expo-sqlite
 * 
 * Provides an in-memory mock of the SQLite interface so GrayMeter
 * can render and navigate on web. Data doesn't persist across refreshes.
 * 
 * Methods shimmed: openDatabaseAsync, openDatabaseSync,
 * SQLiteProvider, useSQLiteContext
 */

// In-memory storage for basic table simulation
const _tables = {};

const createMockDatabase = () => ({
  execAsync: async (sql) => {
    // Silently accept CREATE TABLE, ALTER TABLE, PRAGMA, CREATE INDEX, etc.
    // These are schema operations that don't need to work on web
    return;
  },
  getFirstAsync: async (sql, ...params) => {
    // Return null for all single-row queries
    // This makes the app render empty states rather than crash
    return null;
  },
  getAllAsync: async (sql, ...params) => {
    // Return empty arrays for all multi-row queries
    // This makes lists/tables render as empty rather than crash
    return [];
  },
  runAsync: async (sql, ...params) => {
    // Accept INSERT/UPDATE/DELETE silently
    return { changes: 0, lastInsertRowId: 0 };
  },
  // Sync variants
  execSync: (sql) => {},
  getFirstSync: (sql, ...params) => null,
  getAllSync: (sql, ...params) => [],
  runSync: (sql, ...params) => ({ changes: 0, lastInsertRowId: 0 }),
  // Transaction support
  withTransactionAsync: async (fn) => {
    try { await fn(); } catch (e) { /* swallow transaction errors on web */ }
  },
  withTransactionSync: (fn) => {
    try { fn(); } catch (e) { /* swallow transaction errors on web */ }
  },
  // Statement support
  prepareSync: (sql) => ({
    executeSync: (...args) => ({ rows: { _array: [] } }),
    executeAsync: (...args) => Promise.resolve({ rows: { _array: [] } }),
    finalizeSync: () => {},
    finalizeAsync: () => Promise.resolve(),
  }),
  prepareAsync: async (sql) => ({
    executeSync: (...args) => ({ rows: { _array: [] } }),
    executeAsync: (...args) => Promise.resolve({ rows: { _array: [] } }),
    finalizeSync: () => {},
    finalizeAsync: () => Promise.resolve(),
  }),
  // Close
  closeAsync: async () => {},
  closeSync: () => {},
  // Properties
  isInTransactionAsync: async () => false,
  isInTransactionSync: () => false,
});

// Named exports matching expo-sqlite API
export const openDatabaseAsync = async (name) => createMockDatabase();
export const openDatabaseSync = (name) => createMockDatabase();

// React component exports
export const SQLiteProvider = ({ children, databaseName, onInit, ...props }) => {
  // Just render children — database init is a no-op on web
  return children;
};

export const useSQLiteContext = () => createMockDatabase();

// Default export for `import * as SQLite from 'expo-sqlite'`
export default {
  openDatabaseAsync,
  openDatabaseSync,
  SQLiteProvider,
  useSQLiteContext,
};
