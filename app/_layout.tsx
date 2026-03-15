import React, { useEffect, useState, useCallback } from 'react';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { View, Text, ActivityIndicator, StyleSheet, TouchableOpacity, Alert, AppState as RNAppState, LogBox } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import 'react-native-reanimated';

LogBox.ignoreAllLogs();

import { useColorScheme } from '@/hooks/use-color-scheme';
import { initializeDatabase, resetDatabaseState, initializeDatabaseWithRetry, checkDatabaseHealth, getDatabase } from '@/database/database';
import { SleepPrompt } from '@/components/sleep-prompt';
import { shouldPromptForSleep, isOverdueForSleepLog, isMorningWithoutSleepLog } from '@/database/sleep';
import { addNotificationResponseListener, scheduleSleepReminder, requestNotificationPermissions } from '@/database/notifications';

export const unstable_settings = {
  anchor: '(tabs)',
};

type AppState = 'loading' | 'ready' | 'error';

// Detect if running in production standalone build
const isStandaloneBuild = () => {
  return Constants.executionEnvironment === 'standalone';
};

// Keep splash screen visible initially
SplashScreen.preventAutoHideAsync().catch((error) => {
  console.warn('Failed to prevent auto hide splash screen:', error);
});

// Database connection keep-alive interval
let keepAliveInterval: ReturnType<typeof setInterval> | null = null;

// Start periodic connection refresh every 5 minutes
const startDatabaseKeepAlive = () => {
  // Clear any existing interval
  if (keepAliveInterval) {
    clearInterval(keepAliveInterval);
  }
  
  keepAliveInterval = setInterval(() => {
    try {
      const db = getDatabase();
      if (db) {
        // AsyncStorage doesn't need keep-alive, but we'll check health
        console.log('[KEEPALIVE] AsyncStorage connection status checked');
      }
    } catch (error) {
      console.log('[KEEPALIVE] Connection check failed:', error);
    }
  }, 5 * 60 * 1000); // Every 5 minutes
  
  console.log('✅ Database keep-alive started (5 minute intervals)');
};

// Stop keep-alive when component unmounts
const stopDatabaseKeepAlive = () => {
  if (keepAliveInterval) {
    clearInterval(keepAliveInterval);
    keepAliveInterval = null;
    console.log('🛑 Database keep-alive stopped');
  }
};

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [appState, setAppState] = useState<AppState>('loading');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [retryCount, setRetryCount] = useState(0);
  const [showSleepPrompt, setShowSleepPrompt] = useState(false);
  const [isOverdueReminder, setIsOverdueReminder] = useState(false);

  /**
   * Main app initialization routine.
   * Wrapped in useCallback so we can safely put it in useEffect deps.
   */
  const initializeApp = useCallback(async () => {
    console.log('🚀 [INIT] Starting app initialization...');
    console.log(`🚀 [INIT] Build type: ${isStandaloneBuild() ? 'STANDALONE' : 'DEVELOPMENT'}`);
    
    try {
      setAppState('loading');
      setErrorMessage('');

      if (isStandaloneBuild()) {
        // PRODUCTION BUILD: Use synchronous blocking initialization
        console.log('🏭 [INIT] Production build detected - using synchronous initialization');
        await initializeProductionBuild(retryCount);
      } else {
        // DEVELOPMENT BUILD: Use existing async initialization
        console.log('🔧 [INIT] Development build detected - using async initialization');
        await initializeDevelopmentBuild();
      }

      console.log('✅ [INIT] App initialization completed successfully');
      setAppState('ready');

    } catch (error) {
      console.error('❌ [INIT] App initialization failed:', error);
      setErrorMessage(error instanceof Error ? error.message : 'Unknown initialization error');
      setAppState('error');
      
    } finally {
      // Always hide splash screen when initialization is complete (success or error)
      try {
        await SplashScreen.hideAsync();
        console.log('✅ [INIT] Splash screen hidden');
      } catch (splashError) {
        console.warn('⚠️ [INIT] Failed to hide splash screen:', splashError);
      }
    }
  }, [retryCount]);

  // Kick off initialization once, and whenever initializeApp reference changes
  useEffect(() => {
    initializeApp();
  }, [initializeApp]);

  // React lifecycle logging
  useEffect(() => {
    console.log('🟢 APP MOUNTED');
    return () => {
      console.log('🔴 APP UNMOUNTING');
      stopDatabaseKeepAlive(); // Clean up keep-alive interval
    };
  }, []);

  // App state change logging
  useEffect(() => {
    const subscription = RNAppState.addEventListener('change', (nextAppState) => {
      console.log('🔄 APP STATE CHANGED:', nextAppState);
      // Check database state when app state changes
      console.log('DB status after state change:', checkDatabaseHealth());
    });
    
    return () => subscription.remove();
  }, []);

  // Memory pressure logging
  useEffect(() => {
    const subscription = RNAppState.addEventListener('memoryWarning', () => {
      console.log('⚠️ MEMORY WARNING RECEIVED');
      console.log('DB status during memory warning:', checkDatabaseHealth());
    });
    return () => subscription.remove();
  }, []);

  // Request notification permissions and check for sleep prompt when app becomes ready
  useEffect(() => {
    if (appState !== 'ready') return;
    
    const initializeNotificationsAndSleep = async () => {
      try {
        const hasPermission = await requestNotificationPermissions();
        console.log('Notification permissions:', hasPermission ? 'granted' : 'denied');
        
        const isMorningNoLog = await isMorningWithoutSleepLog();
        const shouldPrompt = await shouldPromptForSleep();
        
        if (isMorningNoLog || shouldPrompt) {
          const overdue = await isOverdueForSleepLog();
          setIsOverdueReminder(overdue || isMorningNoLog);
          setTimeout(() => setShowSleepPrompt(true), 500);
        }
        
        await scheduleSleepReminder();
      } catch (error) {
        console.error('Failed to initialize notifications:', error);
      }
    };
    
    initializeNotificationsAndSleep();
  }, [appState]);

  // Handle notification responses (when user taps a notification)
  useEffect(() => {
    const subscription = addNotificationResponseListener((response) => {
      const data = response.notification.request.content.data;
      if (data?.type === 'sleep_reminder' || data?.action === 'open_sleep_prompt') {
        setIsOverdueReminder(true);
        setShowSleepPrompt(true);
      }
    });

    return () => subscription.remove();
  }, []);

  const handleRetry = async () => {
    const newRetryCount = retryCount + 1;
    setRetryCount(newRetryCount);
    
    console.log(`RootLayout: Retry attempt ${newRetryCount}`);
    
    // Reset database state before retrying
    resetDatabaseState();
    
    // Wait a bit before retrying
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    await initializeApp();
  };

  const handleResetDatabase = () => {
    Alert.alert(
      'Reset Database',
      'This will clear all app data and restart the app. Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            try {
              console.log('🔄 [RESET] Starting database reset...');
              
              // Clear error logs from AsyncStorage
              try {
                const keys = await AsyncStorage.getAllKeys();
                const errorLogKeys = keys.filter(key => key.startsWith('db_init_error_'));
                if (errorLogKeys.length > 0) {
                  await AsyncStorage.multiRemove(errorLogKeys);
                  console.log(`🔄 [RESET] Cleared ${errorLogKeys.length} error logs`);
                }
              } catch (storageError) {
                console.warn('⚠️ [RESET] Failed to clear error logs:', storageError);
              }
              
              // Reset database state
              resetDatabaseState();
              setRetryCount(0);
              setErrorMessage('');
              
              console.log('🔄 [RESET] Restarting app initialization...');
              await initializeApp();
            } catch (error) {
              console.error('❌ [RESET] Failed to reset database:', error);
              setErrorMessage(error instanceof Error ? error.message : 'Reset failed');
            }
          }
        }
      ]
    );
  };

  // Loading screen
  if (appState === 'loading') {
    return (
      <SafeAreaProvider>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>Initializing NeuroSync...</Text>
          <Text style={styles.subText}>Setting up database</Text>
        </View>
      </SafeAreaProvider>
    );
  }

  // Error screen
  if (appState === 'error') {
    const buildType = isStandaloneBuild() ? 'production' : 'development';
    
    return (
      <SafeAreaProvider>
        <View style={styles.centerContainer}>
          <Text style={styles.errorTitle}>Database Initialization Failed</Text>
          <Text style={styles.errorMessage}>{errorMessage}</Text>
          
          <Text style={styles.buildTypeText}>
            Build: {buildType} | Retries: {retryCount}
          </Text>
          
          <View style={styles.buttonContainer}>
            <TouchableOpacity style={styles.retryButton} onPress={handleRetry}>
              <Text style={styles.buttonText}>
                Retry {retryCount > 0 && `(${retryCount})`}
              </Text>
            </TouchableOpacity>
            
            {retryCount >= 2 && (
              <TouchableOpacity style={styles.resetButton} onPress={handleResetDatabase}>
                <Text style={styles.buttonText}>Reset Database</Text>
              </TouchableOpacity>
            )}
          </View>
          
          <Text style={styles.helpText}>
            {isStandaloneBuild() 
              ? 'If this persists, try clearing app data or reinstalling the app.'
              : 'If this persists, try restarting Expo Go or clearing the cache.'
            }
          </Text>
        </View>
      </SafeAreaProvider>
    );
  }

  // Main app (database is ready)
  return (
    <SafeAreaProvider>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="supplements" options={{ headerShown: false }} />
          <Stack.Screen name="add-supplement" options={{ headerShown: false }} />
          <Stack.Screen name="edit-supplement" options={{ headerShown: false }} />
          <Stack.Screen name="log-supplement" options={{ headerShown: false }} />
          <Stack.Screen name="supplement-details" options={{ headerShown: false }} />
          {/* DISABLED FOR V1 - Re-enable for Mk II */}
          {/* <Stack.Screen name="body-diagram" options={{ headerShown: false }} /> */}
          {/* <Stack.Screen name="symptom-selection" options={{ headerShown: false }} /> */}
          {/* <Stack.Screen name="symptom-logging" options={{ headerShown: false }} /> */}
          <Stack.Screen name="cognitive-tests" options={{ headerShown: false }} />
          <Stack.Screen name="tests/reflexes" options={{ headerShown: false }} />
          <Stack.Screen name="tests/memory" options={{ headerShown: false }} />
          <Stack.Screen name="tests/connections" options={{ headerShown: false }} />
          <Stack.Screen name="tests/rock-dodger" options={{ headerShown: false }} />
          <Stack.Screen name="tests/pattern-matcher" options={{ headerShown: false }} />
          <Stack.Screen name="tests/tile-puzzle" options={{ headerShown: false }} />
          <Stack.Screen name="tests/n-back" options={{ headerShown: false }} />
          <Stack.Screen name="tests/questionnaire" options={{ headerShown: false }} />
          <Stack.Screen name="tests/stroop" options={{ headerShown: false }} />
          <Stack.Screen name="tests/all-nine" options={{ headerShown: false }} />
          <Stack.Screen name="cognitive-test-reminders" options={{ headerShown: false }} />
          <Stack.Screen name="my-schedules" options={{ headerShown: false }} />
          <Stack.Screen name="export" options={{ headerShown: false }} />
          <Stack.Screen name="help" options={{ headerShown: false }} />
          <Stack.Screen name="insights" options={{ headerShown: false }} />
          <Stack.Screen name="supplement-reminders" options={{ headerShown: false }} />
          <Stack.Screen name="settings" options={{ headerShown: false }} />
          <Stack.Screen name="database-debug" options={{ headerShown: false }} />
          <Stack.Screen name="invariant-test" options={{ headerShown: false }} />
          <Stack.Screen name="activities" options={{ headerShown: false }} />
          <Stack.Screen name="add-activity" options={{ headerShown: false }} />
          <Stack.Screen name="edit-activity" options={{ headerShown: false }} />
          <Stack.Screen name="log-activity" options={{ headerShown: false }} />
          <Stack.Screen name="sleep-logs" options={{ headerShown: false }} />
          <Stack.Screen name="daily-review" options={{ headerShown: false }} />
          <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
        </Stack>
        <StatusBar style="auto" />
        <SleepPrompt
          visible={showSleepPrompt}
          onClose={() => setShowSleepPrompt(false)}
          isOverdueReminder={isOverdueReminder}
        />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

/**
 * Production initialization – pure helper outside the component.
 * Takes retryCount as an arg so it doesn't close over component state.
 */
async function initializeProductionBuild(retryCount: number) {
  console.log('🏭 [PROD-INIT] Starting production initialization with blocking approach...');
  
  // Timeout for database initialization (10 seconds)
  const INIT_TIMEOUT = 10000;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  
  try {
    await new Promise((resolve, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error('Database initialization timed out after 10 seconds'));
      }, INIT_TIMEOUT);

      try {
        // Synchronous database initialization
        console.log('🏭 [PROD-INIT] Step 1: Synchronous database initialization...');
        initializeDatabase();
        
        // Verify database health immediately after init
        console.log('🏭 [PROD-INIT] Step 2: Database health check...');
        const health = checkDatabaseHealth();
        if (!health.healthy) {
          throw new Error(`Database health check failed: ${health.issues.join(', ')}`);
        }
        
        console.log('✅ [PROD-INIT] Database initialization and health check passed');
        resolve(true);
      } catch (error) {
        reject(error);
      }
    });

    // Start periodic database connection refresh
    console.log('🏭 [PROD-INIT] Step 3: Starting database connection keep-alive...');
    startDatabaseKeepAlive();
    
    console.log('✅ [PROD-INIT] Production initialization completed successfully');
    
  } catch (error) {
    console.error('❌ [PROD-INIT] Production initialization failed:', error);
    
    // Write error to persistent storage for debugging
    await writeInitializationError(error, retryCount);
    
    throw error;
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

/**
 * Development initialization – pure helper outside the component.
 */
async function initializeDevelopmentBuild() {
  console.log('🔧 [DEV-INIT] Starting development initialization with async approach...');
  
  try {
    // Step 1: Initialize database with retry logic (existing async approach)
    console.log('🔧 [DEV-INIT] Initializing database with retry logic...');
    const dbResult = await initializeDatabaseWithRetry(3);
    
    if (!dbResult.success) {
      throw new Error(`Database initialization failed after ${dbResult.attempts} attempts: ${dbResult.error}`);
    }
    
    console.log(`🔧 [DEV-INIT] Database initialized successfully on attempt ${dbResult.attempts}`);

    // Step 2: Start periodic database connection refresh
    console.log('🔧 [DEV-INIT] Starting database connection keep-alive...');
    startDatabaseKeepAlive();
    
    console.log('✅ [DEV-INIT] Development initialization completed successfully');
    
  } catch (error) {
    console.error('❌ [DEV-INIT] Development initialization failed:', error);
    throw error;
  }
}

/**
 * Error logging helper – outside component, takes retryCount explicitly.
 */
async function writeInitializationError(error: any, retryCount: number) {
  try {
    console.log('📝 [ERROR-LOG] Writing initialization error to persistent storage...');
    
    const errorLog = {
      timestamp: new Date().toISOString(),
      buildType: isStandaloneBuild() ? 'standalone' : 'development',
      executionEnvironment: Constants.executionEnvironment,
      platform: Constants.platform,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      health: checkDatabaseHealth(),
      retryCount,
      appVersion: Constants.expoConfig?.version || 'unknown',
      runtimeVersion: Constants.expoConfig?.runtimeVersion || 'unknown'
    };

    // Write to persistent storage
    const errorLogKey = `db_init_error_${Date.now()}`;
    await AsyncStorage.setItem(errorLogKey, JSON.stringify(errorLog));
    
    // Keep only the last 10 error logs to prevent storage bloat
    await cleanupOldErrorLogs();
    
    console.error('📝 [ERROR-LOG] Error written to AsyncStorage with key:', errorLogKey);
    console.error('📝 [ERROR-LOG] Error details:', JSON.stringify(errorLog, null, 2));
  } catch (logError) {
    console.error('❌ [ERROR-LOG] Failed to write error log to AsyncStorage:', logError);
    // Fallback to console-only logging
    console.error('📝 [ERROR-LOG-FALLBACK] Initialization error details:', {
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
  }
}

/**
 * Clean up old error logs – pure helper.
 */
async function cleanupOldErrorLogs() {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const errorLogKeys = keys
      .filter(key => key.startsWith('db_init_error_'))
      .sort()
      .reverse(); // Most recent first

    // Keep only the last 10 error logs
    if (errorLogKeys.length > 10) {
      const keysToDelete = errorLogKeys.slice(10);
      await AsyncStorage.multiRemove(keysToDelete);
      console.log(`📝 [ERROR-LOG] Cleaned up ${keysToDelete.length} old error logs`);
    }
  } catch (cleanupError) {
    console.warn('⚠️ [ERROR-LOG] Failed to cleanup old error logs:', cleanupError);
  }
}

const styles = StyleSheet.create({
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#ffffff',
  },
  loadingText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000000',
    marginTop: 16,
    textAlign: 'center',
  },
  subText: {
    fontSize: 14,
    color: '#666666',
    marginTop: 8,
    textAlign: 'center',
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FF3B30',
    marginBottom: 16,
    textAlign: 'center',
  },
  errorMessage: {
    fontSize: 14,
    color: '#666666',
    textAlign: 'center',
    marginBottom: 16,
    paddingHorizontal: 20,
  },
  buildTypeText: {
    fontSize: 12,
    color: '#999999',
    textAlign: 'center',
    marginBottom: 24,
    fontFamily: 'monospace',
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
    justifyContent: 'center',
  },
  retryButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  resetButton: {
    backgroundColor: '#FF3B30',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  helpText: {
    fontSize: 12,
    color: '#999999',
    textAlign: 'center',
    marginTop: 16,
  },
});
