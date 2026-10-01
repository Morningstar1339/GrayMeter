import React, { useState, useEffect } from 'react';
import { StyleSheet, TouchableOpacity, ScrollView, Alert, KeyboardAvoidingView, Platform, Dimensions, StatusBar, Switch, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { sendDelayedTestNotification, getNotificationDebugInfo, listScheduledNotifications, getNotificationSettings, updateNotificationSettings, scheduleBedtimeReminder, cancelBedtimeReminder } from '@/database/notifications';
import { seedMockData, clearAllData, clearMockData, checkMockDataStatus, MockDataStatus } from '@/database/mock-data';
import { exportUserData, importUserData } from '@/database/backup';
import { importSubstanceProfiles, getAllSubstanceProfiles } from '@/database/pk-curves';
import { VALIDATED_SUBSTANCES } from '@/database/substance-data';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';

const { height: screenHeight } = Dimensions.get('window');
const isSmallScreen = screenHeight < 700;
const isVerySmallScreen = screenHeight < 600;

interface SleepSettings {
  bedtimeHour: number; // 1-12
  bedtimeMinute: number; // 0, 5, 10, 15, etc.
  bedtimeAmPm: 'AM' | 'PM';
}

const SETTINGS_KEY = 'sleep_settings';

const defaultSettings: SleepSettings = {
  bedtimeHour: 10,
  bedtimeMinute: 0,
  bedtimeAmPm: 'PM',
};

export default function SettingsScreen() {
  const router = useRouter();
  const [settings, setSettings] = useState<SleepSettings>(defaultSettings);
  const [loading, setLoading] = useState(true);
  const [bedtimeReminderEnabled, setBedtimeReminderEnabled] = useState(false);
  const [mockDataStatus, setMockDataStatus] = useState<MockDataStatus | null>(null);
  const [devOptionsVisible, setDevOptionsVisible] = useState(false);
  const [seedingData, setSeedingData] = useState(false);
  const [clearingData, setClearingData] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importingSubstances, setImportingSubstances] = useState(false);

  useEffect(() => {
    loadSettings();
    loadBedtimeReminderSetting();
    refreshMockDataStatus();
  }, []);

  const refreshMockDataStatus = async () => {
    try {
      const status = await checkMockDataStatus();
      setMockDataStatus(status);
    } catch (error) {
      console.error('Error checking mock data status:', error);
    }
  };

  const handleSeedData = async () => {
    Alert.alert(
      'Seed Test Data',
      'This will add test supplements, logs, and cognitive test results for the past 45 days. Existing test data will be replaced.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Seed Data',
          onPress: async () => {
            setSeedingData(true);
            try {
              const result = await seedMockData();
              await refreshMockDataStatus();
              Alert.alert(
                'Test Data Seeded',
                `Added:\n• ${result.supplements} test supplements\n• ${result.logs} supplement logs\n• ${result.tests} cognitive test results\n\nGo to Insights to see the analysis.`
              );
            } catch (error) {
              Alert.alert('Error', `Failed to seed data: ${error}`);
            } finally {
              setSeedingData(false);
            }
          }
        }
      ]
    );
  };

  const handleClearTestData = async () => {
    Alert.alert(
      'Clear Test Data',
      'This will remove all test data (supplements and results marked with [Test]). Your real data will not be affected.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear Test Data',
          style: 'destructive',
          onPress: async () => {
            setClearingData(true);
            try {
              await clearMockData();
              await refreshMockDataStatus();
              Alert.alert('Test Data Cleared', 'All test data has been removed.');
            } catch (error) {
              Alert.alert('Error', `Failed to clear test data: ${error}`);
            } finally {
              setClearingData(false);
            }
          }
        }
      ]
    );
  };

  const handleClearAllData = async () => {
    Alert.alert(
      'Clear ALL Data',
      'WARNING: This will permanently delete ALL your data including supplements, logs, test results, sleep logs, and activities. This cannot be undone!',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Everything',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Are you absolutely sure?',
              'All your tracking data will be lost forever.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Yes, Delete All',
                  style: 'destructive',
                  onPress: async () => {
                    setClearingData(true);
                    try {
                      await clearAllData();
                      await refreshMockDataStatus();
                      Alert.alert('All Data Cleared', 'Your database has been reset.');
                    } catch (error) {
                      Alert.alert('Error', `Failed to clear data: ${error}`);
                    } finally {
                      setClearingData(false);
                    }
                  }
                }
              ]
            );
          }
        }
      ]
    );
  };

  const handleExportData = async () => {
    setExporting(true);
    try {
      const jsonData = await exportUserData();
      const filename = `graymeter-backup-${new Date().toISOString().slice(0, 10)}.json`;
      const docDir = (FileSystem as any).documentDirectory ?? (FileSystem as any).cacheDirectory ?? '';
      const fileUri = docDir + filename;
      
      await FileSystem.writeAsStringAsync(fileUri, jsonData);
      
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'application/json',
          dialogTitle: 'Export GrayMeter Backup'
        });
      } else {
        Alert.alert('Export Complete', `Backup saved to: ${fileUri}`);
      }
    } catch (error) {
      Alert.alert('Export Failed', `${error}`);
    } finally {
      setExporting(false);
    }
  };

  const handleImportSubstanceDatabase = async () => {
    setImportingSubstances(true);
    try {
      const result = await importSubstanceProfiles(VALIDATED_SUBSTANCES);
      const allProfiles = await getAllSubstanceProfiles();
      
      console.log('=== Substance Database Import Complete ===');
      console.log(`Total substances in database: ${allProfiles.length}`);
      
      const caffeine = allProfiles.find(p => p.names.some(n => n.toLowerCase() === 'caffeine'));
      if (caffeine) {
        console.log('Spot check - Caffeine:', {
          category: caffeine.category,
          curves: caffeine.curves,
          confidenceTier: caffeine.confidenceTier
        });
      }
      
      Alert.alert(
        'Substance Database Imported',
        `Inserted: ${result.inserted}\n` +
        `Updated: ${result.updated}\n` +
        `Skipped: ${result.skipped}\n` +
        `Errors: ${result.errors.length}\n\n` +
        `Total substances: ${allProfiles.length}`
      );
    } catch (error) {
      console.error('Import error:', error);
      Alert.alert('Import Failed', `${error}`);
    } finally {
      setImportingSubstances(false);
    }
  };

  const handleImportData = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/json',
        copyToCacheDirectory: true
      });
      
      if (result.canceled || !result.assets || result.assets.length === 0) {
        return;
      }
      
      const file = result.assets[0];
      if (!file.uri) {
        Alert.alert('Error', 'Could not access file');
        return;
      }

      Alert.alert(
        'Import Backup',
        `Import data from "${file.name}"?\n\nThis will replace all your existing data (except test data). This cannot be undone.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Import',
            style: 'destructive',
            onPress: async () => {
              setImporting(true);
              try {
                const jsonString = await FileSystem.readAsStringAsync(file.uri);
                const importResult = await importUserData(jsonString);
                
                if (importResult.success && importResult.stats) {
                  const stats = importResult.stats;
                  Alert.alert(
                    'Import Successful',
                    `Imported:\n` +
                    `• ${stats.supplements} supplements\n` +
                    `• ${stats.supplementLogs} supplement logs\n` +
                    `• ${stats.cognitiveTestResults} test results\n` +
                    `• ${stats.sleepLogs} sleep logs\n` +
                    `• ${stats.activities} activities\n` +
                    `• ${stats.activityLogs} activity logs`
                  );
                  await refreshMockDataStatus();
                } else {
                  Alert.alert('Import Failed', importResult.error || 'Unknown error');
                }
              } catch (error) {
                Alert.alert('Import Failed', `${error}`);
              } finally {
                setImporting(false);
              }
            }
          }
        ]
      );
    } catch (error) {
      Alert.alert('Error', `Could not open file picker: ${error}`);
    }
  };

  const loadBedtimeReminderSetting = async () => {
    try {
      const notifSettings = await getNotificationSettings();
      setBedtimeReminderEnabled(notifSettings.bedtime_reminder_enabled);
    } catch (error) {
      console.error('Error loading bedtime reminder setting:', error);
    }
  };

  const toggleBedtimeReminder = async (enabled: boolean) => {
    try {
      setBedtimeReminderEnabled(enabled);
      
      const hour24 = settings.bedtimeAmPm === 'PM' && settings.bedtimeHour !== 12
        ? settings.bedtimeHour + 12
        : settings.bedtimeAmPm === 'AM' && settings.bedtimeHour === 12
        ? 0
        : settings.bedtimeHour;
      const timeString = `${hour24.toString().padStart(2, '0')}:${settings.bedtimeMinute.toString().padStart(2, '0')}`;
      
      await updateNotificationSettings({
        bedtime_reminder_enabled: enabled,
        bedtime_reminder_time: timeString
      });
      
      if (enabled) {
        await scheduleBedtimeReminder();
        Alert.alert('Reminder Set', `You'll receive a bedtime reminder at ${formatBedtime()} daily.`);
      } else {
        await cancelBedtimeReminder();
      }
    } catch (error) {
      console.error('Error toggling bedtime reminder:', error);
      setBedtimeReminderEnabled(!enabled);
      Alert.alert('Error', 'Failed to update reminder setting.');
    }
  };

  const loadSettings = async () => {
    try {
      const saved = await AsyncStorage.getItem(SETTINGS_KEY);
      if (saved) {
        setSettings({ ...defaultSettings, ...JSON.parse(saved) });
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async (newSettings: SleepSettings) => {
    try {
      await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(newSettings));
      setSettings(newSettings);
      
      if (bedtimeReminderEnabled) {
        const hour24 = newSettings.bedtimeAmPm === 'PM' && newSettings.bedtimeHour !== 12
          ? newSettings.bedtimeHour + 12
          : newSettings.bedtimeAmPm === 'AM' && newSettings.bedtimeHour === 12
          ? 0
          : newSettings.bedtimeHour;
        const timeString = `${hour24.toString().padStart(2, '0')}:${newSettings.bedtimeMinute.toString().padStart(2, '0')}`;
        
        await updateNotificationSettings({ bedtime_reminder_time: timeString });
        await scheduleBedtimeReminder();
      }
      
      Alert.alert('Settings Saved', 'Your bedtime has been updated.');
    } catch (error) {
      console.error('Error saving settings:', error);
      Alert.alert('Error', 'Failed to save settings. Please try again.');
    }
  };

  const formatBedtime = (): string => {
    return `${settings.bedtimeHour}:${settings.bedtimeMinute.toString().padStart(2, '0')} ${settings.bedtimeAmPm}`;
  };

  // Generate hour options (1-12)
  const hourOptions = Array.from({ length: 12 }, (_, i) => i + 1);
  
  // Generate minute options (0, 5, 10, 15, ..., 55)
  const minuteOptions = Array.from({ length: 12 }, (_, i) => i * 5);

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ThemedView style={styles.loadingContainer}>
          <ThemedText>Loading...</ThemedText>
        </ThemedView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor="#0B1426" />
      <KeyboardAvoidingView 
        style={styles.keyboardAvoidingView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : StatusBar.currentHeight || 0}
      >
        <ThemedView style={styles.innerContainer}>
          {/* Fixed Header */}
          <ThemedView style={styles.header}>
            <ThemedText type="title" style={styles.title}>Sleep Settings</ThemedText>
            <ThemedText style={styles.subtitle}>
              Set your normal bedtime for automatic sleep detection
            </ThemedText>
          </ThemedView>

          {/* Scrollable Content */}
          <ScrollView 
            style={styles.scrollView} 
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            bounces={false}
            nestedScrollEnabled={true}
            keyboardShouldPersistTaps="handled"
          >
            <ThemedView style={styles.section}>
              <ThemedText style={styles.sectionTitle}>Normal Bedtime</ThemedText>
              <ThemedText style={styles.currentValue}>{formatBedtime()}</ThemedText>
              
              <ThemedView style={styles.timeSelector}>
                {/* Hour Dropdown */}
                <ThemedView style={styles.dropdownContainer}>
                  <ThemedText style={styles.dropdownLabel}>Hour</ThemedText>
                  <ScrollView 
                    style={styles.dropdown}
                    contentContainerStyle={styles.dropdownContent}
                    showsVerticalScrollIndicator={true}
                    nestedScrollEnabled={true}
                    bounces={false}
                    keyboardShouldPersistTaps="handled"
                  >
                    {hourOptions.map((hour) => (
                      <TouchableOpacity
                        key={hour}
                        style={[
                          styles.dropdownOption,
                          settings.bedtimeHour === hour && styles.dropdownOptionSelected
                        ]}
                        onPress={() => setSettings({...settings, bedtimeHour: hour})}
                        accessibilityRole="button"
                        accessibilityLabel={`Select hour ${hour}`}
                        testID={`btn-settings-hour-${hour}`}
                      >
                        <ThemedText style={[
                          styles.dropdownOptionText,
                          settings.bedtimeHour === hour && styles.dropdownOptionTextSelected
                        ]}>
                          {hour}
                        </ThemedText>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </ThemedView>

                {/* Minute Dropdown */}
                <ThemedView style={styles.dropdownContainer}>
                  <ThemedText style={styles.dropdownLabel}>Minute</ThemedText>
                  <ScrollView 
                    style={styles.dropdown}
                    contentContainerStyle={styles.dropdownContent}
                    showsVerticalScrollIndicator={true}
                    nestedScrollEnabled={true}
                    bounces={false}
                    keyboardShouldPersistTaps="handled"
                  >
                    {minuteOptions.map((minute) => (
                      <TouchableOpacity
                        key={minute}
                        style={[
                          styles.dropdownOption,
                          settings.bedtimeMinute === minute && styles.dropdownOptionSelected
                        ]}
                        onPress={() => setSettings({...settings, bedtimeMinute: minute})}
                        accessibilityRole="button"
                        accessibilityLabel={`Select minute ${minute.toString().padStart(2, '0')}`}
                        testID={`btn-settings-minute-${minute}`}
                      >
                        <ThemedText style={[
                          styles.dropdownOptionText,
                          settings.bedtimeMinute === minute && styles.dropdownOptionTextSelected
                        ]}>
                          {minute.toString().padStart(2, '0')}
                        </ThemedText>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </ThemedView>

                {/* AM/PM Toggle */}
                <ThemedView style={styles.dropdownContainer}>
                  <ThemedText style={styles.dropdownLabel}>Period</ThemedText>
                  <ThemedView style={styles.ampmToggle}>
                    <TouchableOpacity
                      style={[
                        styles.ampmButton,
                        settings.bedtimeAmPm === 'AM' && styles.ampmButtonSelected
                      ]}
                      onPress={() => setSettings({...settings, bedtimeAmPm: 'AM'})}
                      accessibilityRole="button"
                      accessibilityLabel="Select AM"
                      testID="btn-settings-am"
                    >
                      <ThemedText style={[
                        styles.ampmText,
                        settings.bedtimeAmPm === 'AM' && styles.ampmTextSelected
                      ]}>
                        AM
                      </ThemedText>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.ampmButton,
                        settings.bedtimeAmPm === 'PM' && styles.ampmButtonSelected
                      ]}
                      onPress={() => setSettings({...settings, bedtimeAmPm: 'PM'})}
                      accessibilityRole="button"
                      accessibilityLabel="Select PM"
                      testID="btn-settings-pm"
                    >
                      <ThemedText style={[
                        styles.ampmText,
                        settings.bedtimeAmPm === 'PM' && styles.ampmTextSelected
                      ]}>
                        PM
                      </ThemedText>
                    </TouchableOpacity>
                  </ThemedView>
                </ThemedView>
              </ThemedView>
            </ThemedView>

            <ThemedView style={styles.reminderSection}>
              <View style={styles.reminderRow}>
                <View style={styles.reminderTextContainer}>
                  <ThemedText style={styles.reminderTitle}>Bedtime Reminder</ThemedText>
                  <ThemedText style={styles.reminderSubtitle}>
                    Get notified at your bedtime to log sleep tomorrow
                  </ThemedText>
                </View>
                <Switch
                  value={bedtimeReminderEnabled}
                  onValueChange={toggleBedtimeReminder}
                  trackColor={{ false: '#D1D1D6', true: '#34C759' }}
                  thumbColor="#FFFFFF"
                />
              </View>
            </ThemedView>

            <ThemedView style={styles.infoSection}>
              <ThemedText style={styles.infoTitle}>How It Works</ThemedText>
              <ThemedText style={styles.infoText}>
                • Enable the reminder above to get a daily notification at your bedtime
              </ThemedText>
              <ThemedText style={styles.infoText}>
                • When you wake up, open the app to log your sleep
              </ThemedText>
              <ThemedText style={styles.infoText}>
                • Consistent logging helps identify sleep-cognition patterns
              </ThemedText>
            </ThemedView>

            {/* Notification Debug Section */}
            <ThemedView style={styles.notifDebugSection}>
              <ThemedText style={styles.notifDebugTitle}>Notification Debug</ThemedText>
              
              <TouchableOpacity
                style={styles.notifTestButton}
                onPress={async () => {
                  const result = await sendDelayedTestNotification(10);
                  Alert.alert(
                    result.success ? 'Test Scheduled' : 'Failed',
                    result.message
                  );
                }}
                accessibilityRole="button"
                accessibilityLabel="Test notification in 10 seconds"
                testID="btn-settings-test-notification"
              >
                <ThemedText style={styles.notifTestButtonText}>Test Notification (10s)</ThemedText>
                <ThemedText style={styles.notifTestButtonSubtext}>Sends a notification in 10 seconds</ThemedText>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.notifTestButton, { marginTop: 8, backgroundColor: '#5856D6' }]}
                accessibilityRole="button"
                accessibilityLabel="Show notification debug info"
                testID="btn-settings-debug-info"
                onPress={async () => {
                  try {
                    const info = await getNotificationDebugInfo();
                    const scheduled = await listScheduledNotifications();
                    
                    const channelInfo = info.channels.length > 0 
                      ? info.channels.map(c => `${c.name} (${c.id}): importance ${c.importance}`).join('\n')
                      : 'No channels (iOS)';
                    
                    const scheduledInfo = scheduled.length > 0
                      ? scheduled.slice(0, 5).map(n => `• ${n.title}`).join('\n')
                      : 'None';
                    
                    Alert.alert(
                      'Notification Status',
                      `Permission: ${info.permissionStatus}\n` +
                      `Platform: ${info.platform}\n` +
                      `Is Device: ${info.isDevice}\n` +
                      `Scheduled: ${info.scheduledCount}\n\n` +
                      `Channels:\n${channelInfo}\n\n` +
                      `Settings:\n` +
                      `• Enabled: ${info.settings.notifications_enabled}\n` +
                      `• Supplements: ${info.settings.supplement_reminders_enabled}\n` +
                      `• Sleep: ${info.settings.sleep_reminders_enabled}\n\n` +
                      `Scheduled Notifications:\n${scheduledInfo}`
                    );
                  } catch (error) {
                    Alert.alert('Error', String(error));
                  }
                }}
              >
                <ThemedText style={styles.notifTestButtonText}>Show Debug Info</ThemedText>
                <ThemedText style={styles.notifTestButtonSubtext}>Permissions, channels, scheduled</ThemedText>
              </TouchableOpacity>
            </ThemedView>

            {/* Developer Tools Section */}
            <ThemedView style={styles.debugSection}>
              <TouchableOpacity
                style={styles.debugTitleRow}
                onLongPress={() => setDevOptionsVisible(!devOptionsVisible)}
                delayLongPress={1000}
              >
                <ThemedText style={styles.debugTitle}>Developer Tools</ThemedText>
                {mockDataStatus?.isSeeded && (
                  <View style={styles.testDataBadge}>
                    <ThemedText style={styles.testDataBadgeText}>Test Data Active</ThemedText>
                  </View>
                )}
              </TouchableOpacity>

              {mockDataStatus?.isSeeded && (
                <View style={styles.testDataInfo}>
                  <ThemedText style={styles.testDataInfoText}>
                    {mockDataStatus.supplementCount} test supplements, {mockDataStatus.logCount} logs, {mockDataStatus.testResultCount} test results
                  </ThemedText>
                </View>
              )}

              <TouchableOpacity
                style={[styles.seedButton, seedingData && styles.buttonDisabled]}
                onPress={handleSeedData}
                disabled={seedingData || clearingData}
                accessibilityRole="button"
                accessibilityLabel="Seed test data"
                testID="btn-settings-seed-data"
              >
                <ThemedText style={styles.seedButtonText}>
                  {seedingData ? 'Seeding...' : 'Seed Test Data'}
                </ThemedText>
                <ThemedText style={styles.seedButtonSubtext}>
                  Add 45 days of sample data for testing
                </ThemedText>
              </TouchableOpacity>

              {mockDataStatus?.isSeeded && (
                <TouchableOpacity
                  style={[styles.clearTestButton, { marginTop: 8 }, clearingData && styles.buttonDisabled]}
                  onPress={handleClearTestData}
                  disabled={seedingData || clearingData}
                  accessibilityRole="button"
                  accessibilityLabel="Clear test data only"
                  testID="btn-settings-clear-test-data"
                >
                  <ThemedText style={styles.clearTestButtonText}>
                    {clearingData ? 'Clearing...' : 'Clear Test Data Only'}
                  </ThemedText>
                  <ThemedText style={styles.clearTestButtonSubtext}>
                    Remove [Test] data, keep real data
                  </ThemedText>
                </TouchableOpacity>
              )}

              {devOptionsVisible && (
                <>
                  <TouchableOpacity
                    style={[styles.dangerButton, { marginTop: 8 }, clearingData && styles.buttonDisabled]}
                    onPress={handleClearAllData}
                    disabled={seedingData || clearingData}
                    accessibilityRole="button"
                    accessibilityLabel="Clear all data"
                    testID="btn-settings-clear-all-data"
                  >
                    <ThemedText style={styles.dangerButtonText}>Clear ALL Data</ThemedText>
                    <ThemedText style={styles.dangerButtonSubtext}>
                      Reset entire database (destructive!)
                    </ThemedText>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.debugButton, { marginTop: 8 }]}
                    onPress={() => router.push('/database-debug')}
                    accessibilityRole="button"
                    accessibilityLabel="Database debug"
                    testID="btn-settings-database-debug"
                  >
                    <ThemedText style={styles.debugButtonText}>Database Debug</ThemedText>
                    <ThemedText style={styles.debugButtonSubtext}>Diagnose database issues</ThemedText>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.debugButton, { marginTop: 8 }]}
                    onPress={() => router.push('/invariant-test' as any)}
                    accessibilityRole="button"
                    accessibilityLabel="Invariant tests"
                    testID="btn-settings-invariant-tests"
                  >
                    <ThemedText style={styles.debugButtonText}>Invariant Tests</ThemedText>
                    <ThemedText style={styles.debugButtonSubtext}>Test database sanity checks</ThemedText>
                  </TouchableOpacity>
                </>
              )}

              <TouchableOpacity
                style={[styles.seedButton, { marginTop: 16, backgroundColor: '#5856D6' }, importingSubstances && styles.buttonDisabled]}
                onPress={handleImportSubstanceDatabase}
                disabled={importingSubstances}
                accessibilityRole="button"
                accessibilityLabel="Import substance database"
                testID="btn-settings-import-substances"
              >
                <ThemedText style={styles.seedButtonText}>
                  {importingSubstances ? 'Importing...' : 'Import Substance Database'}
                </ThemedText>
                <ThemedText style={styles.seedButtonSubtext}>
                  Load 29 validated substance profiles with PK curves
                </ThemedText>
              </TouchableOpacity>

              <View style={styles.backupSection}>
                <ThemedText style={styles.backupSectionTitle}>Backup & Restore</ThemedText>
                <View style={styles.backupButtonRow}>
                  <TouchableOpacity
                    style={[styles.backupButton, exporting && styles.buttonDisabled]}
                    onPress={handleExportData}
                    disabled={exporting || importing}
                    accessibilityRole="button"
                    accessibilityLabel="Export data"
                    testID="btn-settings-export-data"
                  >
                    <ThemedText style={styles.backupButtonText}>
                      {exporting ? 'Exporting...' : 'Export Data'}
                    </ThemedText>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.backupButton, styles.importButton, importing && styles.buttonDisabled]}
                    onPress={handleImportData}
                    disabled={exporting || importing}
                    accessibilityRole="button"
                    accessibilityLabel="Import data"
                    testID="btn-settings-import-data"
                  >
                    <ThemedText style={styles.backupButtonText}>
                      {importing ? 'Importing...' : 'Import Data'}
                    </ThemedText>
                  </TouchableOpacity>
                </View>
                <ThemedText style={styles.backupHint}>
                  Export creates a JSON backup. Test data is excluded.
                </ThemedText>
              </View>

              <ThemedText style={styles.devHint}>
                {devOptionsVisible ? 'Long-press title to hide advanced options' : 'Long-press title for more options'}
              </ThemedText>
            </ThemedView>

            {/* Spacer to ensure buttons don't overlap content */}
            <ThemedView style={styles.bottomSpacer} />
          </ScrollView>

          {/* Fixed Bottom Buttons */}
          <ThemedView style={styles.buttonContainer}>
            <TouchableOpacity
              style={styles.saveButton}
              onPress={() => saveSettings(settings)}
              accessibilityRole="button"
              accessibilityLabel="Save bedtime"
              testID="btn-settings-save"
            >
              <ThemedText style={styles.saveButtonText}>Save Bedtime</ThemedText>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.backButton}
              onPress={() => router.back()}
              accessibilityRole="button"
              accessibilityLabel="Go back"
              testID="btn-settings-back"
            >
              <ThemedText style={styles.backButtonText}>Back</ThemedText>
            </TouchableOpacity>
          </ThemedView>
        </ThemedView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B1426',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  keyboardAvoidingView: {
    flex: 1,
  },
  innerContainer: {
    flex: 1,
    paddingHorizontal: isVerySmallScreen ? 16 : 20,
  },
  header: {
    alignItems: 'center',
    paddingTop: isVerySmallScreen ? 16 : 20,
    paddingBottom: isVerySmallScreen ? 16 : 20,
    borderBottomWidth: 1,
    borderBottomColor: '#1E2D45',
    marginBottom: isVerySmallScreen ? 16 : 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
    opacity: 0.7,
    paddingHorizontal: 20,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 20,
    flexGrow: 1,
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 16,
    textAlign: 'center',
  },
  currentValue: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 30,
    color: '#00D4FF',
    textAlign: 'center',
  },
  timeSelector: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: isVerySmallScreen ? 6 : isSmallScreen ? 8 : 12,
    minHeight: isVerySmallScreen ? 200 : isSmallScreen ? 220 : 250,
    marginBottom: 20,
    paddingHorizontal: 4,
  },
  dropdownContainer: {
    flex: 1,
    alignItems: 'center',
  },
  dropdownLabel: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 12,
    textAlign: 'center',
  },
  dropdown: {
    backgroundColor: '#1A2540',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2A3550',
    height: isVerySmallScreen ? 140 : isSmallScreen ? 160 : 180,
    width: '100%',
    maxHeight: isVerySmallScreen ? 140 : isSmallScreen ? 160 : 180,
    elevation: Platform.OS === 'android' ? 2 : 0,
    shadowColor: Platform.OS === 'ios' ? '#000' : undefined,
    shadowOffset: Platform.OS === 'ios' ? { width: 0, height: 1 } : undefined,
    shadowOpacity: Platform.OS === 'ios' ? 0.1 : undefined,
    shadowRadius: Platform.OS === 'ios' ? 2 : undefined,
  },
  dropdownContent: {
    paddingVertical: 4,
  },
  dropdownOption: {
    paddingVertical: isVerySmallScreen ? 10 : 12,
    paddingHorizontal: isVerySmallScreen ? 12 : 16,
    borderRadius: 6,
    marginVertical: 1,
    marginHorizontal: 4,
    alignItems: 'center',
    minHeight: isVerySmallScreen ? 40 : 44,
  },
  dropdownOptionSelected: {
    backgroundColor: '#00D4FF',
  },
  dropdownOptionText: {
    fontSize: 16,
    color: '#E4E6EA',
  },
  dropdownOptionTextSelected: {
    color: 'white',
    fontWeight: '600',
  },
  ampmToggle: {
    flexDirection: 'row',
    backgroundColor: '#1A2540',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2A3550',
    padding: 4,
    width: '100%',
    height: isVerySmallScreen ? 60 : 80,
    elevation: Platform.OS === 'android' ? 2 : 0,
    shadowColor: Platform.OS === 'ios' ? '#000' : undefined,
    shadowOffset: Platform.OS === 'ios' ? { width: 0, height: 1 } : undefined,
    shadowOpacity: Platform.OS === 'ios' ? 0.1 : undefined,
    shadowRadius: Platform.OS === 'ios' ? 2 : undefined,
  },
  ampmButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
    marginHorizontal: 2,
  },
  ampmButtonSelected: {
    backgroundColor: '#00D4FF',
  },
  ampmText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#E4E6EA',
  },
  ampmTextSelected: {
    color: 'white',
    fontWeight: '600',
  },
  reminderSection: {
    backgroundColor: 'rgba(34, 197, 94, 0.08)',
    padding: 16,
    borderRadius: 12,
    marginTop: 20,
    borderWidth: 1,
    borderColor: '#22C55E',
  },
  reminderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  reminderTextContainer: {
    flex: 1,
    marginRight: 12,
  },
  reminderTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#22C55E',
    marginBottom: 4,
  },
  reminderSubtitle: {
    fontSize: 13,
    color: '#4ADE80',
    lineHeight: 18,
  },
  infoSection: {
    backgroundColor: '#1A2540',
    padding: 20,
    borderRadius: 12,
    marginTop: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#2A3550',
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
    color: '#E4E6EA',
    textAlign: 'center',
  },
  infoText: {
    fontSize: 14,
    marginBottom: 8,
    color: '#8B939A',
    lineHeight: 20,
  },
  notifDebugSection: {
    backgroundColor: 'rgba(0, 212, 255, 0.06)',
    padding: 20,
    borderRadius: 12,
    marginTop: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#00D4FF',
  },
  notifDebugTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
    color: '#00D4FF',
    textAlign: 'center',
  },
  notifTestButton: {
    backgroundColor: '#00D4FF',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  notifTestButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 2,
  },
  notifTestButtonSubtext: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.8)',
  },
  debugSection: {
    backgroundColor: 'rgba(255, 193, 7, 0.06)',
    padding: 20,
    borderRadius: 12,
    marginTop: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#FFC107',
  },
  debugTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    gap: 8,
  },
  debugTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFC107',
    textAlign: 'center',
  },
  testDataBadge: {
    backgroundColor: '#34C759',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  testDataBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  testDataInfo: {
    backgroundColor: 'rgba(52, 199, 89, 0.1)',
    padding: 8,
    borderRadius: 6,
    marginBottom: 12,
  },
  testDataInfoText: {
    fontSize: 12,
    color: '#4ADE80',
    textAlign: 'center',
  },
  seedButton: {
    backgroundColor: '#34C759',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  seedButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 2,
  },
  seedButtonSubtext: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.8)',
  },
  clearTestButton: {
    backgroundColor: '#FF9500',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  clearTestButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 2,
  },
  clearTestButtonSubtext: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.8)',
  },
  dangerButton: {
    backgroundColor: '#FF3B30',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  dangerButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 2,
  },
  dangerButtonSubtext: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.8)',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  devHint: {
    fontSize: 11,
    color: '#8B939A',
    textAlign: 'center',
    marginTop: 12,
    fontStyle: 'italic',
  },
  backupSection: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.1)',
  },
  backupSectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFC107',
    textAlign: 'center',
    marginBottom: 12,
  },
  backupButtonRow: {
    flexDirection: 'row',
    gap: 8,
  },
  backupButton: {
    flex: 1,
    backgroundColor: '#00D4FF',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  importButton: {
    backgroundColor: '#5856D6',
  },
  backupButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  backupHint: {
    fontSize: 11,
    color: '#8B939A',
    textAlign: 'center',
    marginTop: 8,
  },
  debugButton: {
    backgroundColor: '#FFC107',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  debugButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1C2432',
    marginBottom: 2,
  },
  debugButtonSubtext: {
    fontSize: 12,
    color: '#4A5568',
  },
  bottomSpacer: {
    height: isVerySmallScreen ? 80 : isSmallScreen ? 100 : 120,
  },
  buttonContainer: {
    position: 'absolute',
    bottom: 0,
    left: isVerySmallScreen ? 16 : 20,
    right: isVerySmallScreen ? 16 : 20,
    paddingTop: 16,
    paddingBottom: Platform.OS === 'ios' ? 20 : 16,
    backgroundColor: '#0B1426',
    borderTopWidth: 1,
    borderTopColor: '#1E2D45',
    gap: isVerySmallScreen ? 8 : 12,
    elevation: Platform.OS === 'android' ? 4 : 0,
    shadowColor: Platform.OS === 'ios' ? '#000' : undefined,
    shadowOffset: Platform.OS === 'ios' ? { width: 0, height: -2 } : undefined,
    shadowOpacity: Platform.OS === 'ios' ? 0.1 : undefined,
    shadowRadius: Platform.OS === 'ios' ? 4 : undefined,
  },
  saveButton: {
    backgroundColor: '#00D4FF',
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  saveButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '600',
  },
  backButton: {
    backgroundColor: '#8E8E93',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  backButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '500',
  },
});