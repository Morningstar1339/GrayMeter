import React, { useEffect, useState } from 'react';
import { StyleSheet, TouchableOpacity, ScrollView, Dimensions, View, RefreshControl, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useRouter } from 'expo-router';
import { useThemeColor } from '@/hooks/use-theme-color';
import { isDatabaseInitialized } from '@/database/database';
import { getTodaysDashboardStats, getTodaysSupplementSummary, formatTestType, shouldShowSameAsYesterday, logSameAsYesterday, type DashboardStats } from '@/utils/dashboard-data';
import { useFocusEffect } from '@react-navigation/native';

export default function HomeScreen() {
  const router = useRouter();
  const tintColor = useThemeColor({}, 'tint');
  const backgroundColor = useThemeColor({}, 'background');
  const textColor = useThemeColor({}, 'text');
  const iconColor = useThemeColor({}, 'icon');

  const [dashboardStats, setDashboardStats] = useState<DashboardStats | null>(null);
  const [todaysSupplements, setTodaysSupplements] = useState<Array<{name: string, dosage: number, unit: string}>>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showSameAsYesterday, setShowSameAsYesterday] = useState(false);

  const loadDashboardData = async () => {
    try {
      if (!isDatabaseInitialized()) {
        console.warn('HomeScreen: Database not ready');
        return;
      }
      const [stats, supplements, shouldShowRepeat] = await Promise.all([
        getTodaysDashboardStats(),
        getTodaysSupplementSummary(),
        shouldShowSameAsYesterday()
      ]);
      setDashboardStats(stats);
      setTodaysSupplements(supplements);
      setShowSameAsYesterday(shouldShowRepeat);
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    }
  };

  const onRefresh = async () => {
    setIsRefreshing(true);
    await loadDashboardData();
    setIsRefreshing(false);
  };

  useEffect(() => {
    loadDashboardData();
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      loadDashboardData();
    }, [])
  );

  const handleLogSupplement = () => {
    router.push('/supplements');
  };

  // DISABLED FOR V1 - Re-enable for Mk II
  // const handleLogSymptom = () => {
  //   router.push('/body-diagram');
  // };

  const handleCognitiveTest = () => {
    router.push('/cognitive-tests');
  };

  const handleActivities = () => {
    router.push('/activities');
  };

  const handleLogSleep = () => {
    router.push('/sleep-logs');
  };

  const handleSchedules = () => {
    router.push('/my-schedules');
  };

  const handleExport = () => {
    router.push('/export');
  };

  const handleInsights = () => {
    router.push('/insights');
  };

  const handleHelp = () => {
    router.push('/help');
  };

  const handleDailyReview = () => {
    router.push('/daily-review');
  };

  const handleSameAsYesterday = async () => {
    try {
      const result = await logSameAsYesterday();
      if (result.success) {
        Alert.alert(
          'Success!',
          `Logged ${result.count} supplement${result.count > 1 ? 's' : ''} from yesterday.`,
          [{ text: 'OK', onPress: loadDashboardData }]
        );
      } else {
        Alert.alert('Error', 'No supplements from yesterday found or failed to log.');
      }
    } catch (error) {
      console.error('Failed to repeat yesterday:', error);
      Alert.alert('Error', 'Failed to repeat yesterday\'s supplements.');
    }
  };

  return (
    <ThemedView style={styles.container} safeArea>
      <ScrollView 
        contentContainerStyle={styles.scrollContent} 
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={tintColor} />}
      >
        {/* Header */}
        <ThemedView style={styles.header}>
          <ThemedText type="title" style={styles.appTitle}>GrayMeter</ThemedText>
          <ThemedText style={[styles.subtitle, { color: iconColor }]}>Track fast. Analyze deep.</ThemedText>
        </ThemedView>

        {/* Today's Summary Dashboard */}
        <ThemedView darkColor="#1A2540" lightColor="#F0F4F8" style={[styles.dashboardContainer, { borderColor: iconColor + '40' }]}>
          <ThemedText style={[styles.sectionTitle, { color: iconColor }]}>TODAY</ThemedText>
          
          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <ThemedText style={[styles.statNumber, { color: tintColor }]}>
                {dashboardStats?.todaysSupplements || 0}
              </ThemedText>
              <ThemedText style={[styles.statLabel, { color: iconColor }]}>Supplements</ThemedText>
            </View>
            
            <View style={styles.statCard}>
              <ThemedText style={[styles.statNumber, { color: tintColor }]}>
                {dashboardStats?.todaysTests || 0}
              </ThemedText>
              <ThemedText style={[styles.statLabel, { color: iconColor }]}>Tests</ThemedText>
            </View>
            
            <View style={styles.statCard}>
              <ThemedText style={[styles.statNumber, { color: dashboardStats?.currentStreak && dashboardStats.currentStreak > 0 ? '#22C55E' : iconColor }]}>
                {dashboardStats?.currentStreak || 0}
              </ThemedText>
              <ThemedText style={[styles.statLabel, { color: iconColor }]}>Day Streak</ThemedText>
            </View>
          </View>

          {/* Recent Test Performance */}
          {dashboardStats?.lastTestScore && (
            <View style={[styles.performanceCard, { borderColor: iconColor + '20' }]}>
              <View style={styles.performanceHeader}>
                <Ionicons name="pulse-outline" size={16} color={iconColor} />
                <ThemedText style={[styles.performanceTitle, { color: iconColor }]}>
                  Latest: {formatTestType(dashboardStats.lastTestType || '')}
                </ThemedText>
              </View>
              <ThemedText style={[styles.performanceScore, { color: textColor }]}>
                Score: {dashboardStats.lastTestScore}
                {dashboardStats.weeklyTestAverage && (
                  <ThemedText style={[styles.performanceAvg, { color: iconColor }]}>
                    {' '}(7-day avg: {dashboardStats.weeklyTestAverage.toFixed(0)})
                  </ThemedText>
                )}
              </ThemedText>
            </View>
          )}

          {/* Today's Supplements */}
          {todaysSupplements.length > 0 && (
            <View style={styles.supplementsList}>
              <ThemedText style={[styles.supplementsTitle, { color: iconColor }]}>Today's Log:</ThemedText>
              {todaysSupplements.map((supp, idx) => (
                <ThemedText key={idx} style={[styles.supplementItem, { color: textColor }]}>
                  • {supp.name} {supp.dosage}{supp.unit}
                </ThemedText>
              ))}
            </View>
          )}
        </ThemedView>

        {/* Same as Yesterday Quick-Log */}
        {showSameAsYesterday && (
          <TouchableOpacity
            style={[styles.sameAsYesterdayButton, { backgroundColor: tintColor + '20', borderColor: tintColor }]}
            onPress={handleSameAsYesterday}
            accessibilityRole="button"
            accessibilityLabel="Repeat yesterday's supplements"
            testID="btn-repeat-yesterday"
          >
            <Ionicons name="repeat-outline" size={18} color={tintColor} />
            <ThemedText style={[styles.sameAsYesterdayText, { color: tintColor }]}>
              Repeat Yesterday's Supplements
            </ThemedText>
          </TouchableOpacity>
        )}

        {/* Primary Actions */}
        <View style={styles.primaryActions}>
          <TouchableOpacity style={[styles.primaryButton, { backgroundColor: tintColor }]} onPress={handleLogSupplement} accessibilityRole="button" accessibilityLabel="Log supplement" testID="btn-log-supplement">
            <Ionicons name="add-circle" size={24} color="white" />
            <ThemedText style={styles.primaryButtonText}>Log Supplement</ThemedText>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.primaryButton, { backgroundColor: tintColor }]} onPress={handleCognitiveTest} accessibilityRole="button" accessibilityLabel="Take cognitive test" testID="btn-take-test">
            <Ionicons name="flash" size={24} color="white" />
            <ThemedText style={styles.primaryButtonText}>Take Test</ThemedText>
          </TouchableOpacity>
        </View>

        {/* Secondary Actions Grid */}
        <View style={styles.secondaryGrid}>
          <TouchableOpacity style={[styles.secondaryButton, { backgroundColor: iconColor + '10', borderColor: iconColor + '20' }]} onPress={handleActivities} accessibilityRole="button" accessibilityLabel="Activities" testID="btn-activities">
            <Ionicons name="fitness" size={20} color={iconColor} />
            <ThemedText style={[styles.secondaryButtonText, { color: textColor }]}>Activities</ThemedText>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.secondaryButton, { backgroundColor: iconColor + '10', borderColor: iconColor + '20' }]} onPress={handleLogSleep} accessibilityRole="button" accessibilityLabel="Sleep" testID="btn-sleep">
            <Ionicons name="moon" size={20} color={iconColor} />
            <ThemedText style={[styles.secondaryButtonText, { color: textColor }]}>Sleep</ThemedText>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.secondaryButton, { backgroundColor: iconColor + '10', borderColor: iconColor + '20' }]} onPress={handleDailyReview} accessibilityRole="button" accessibilityLabel="Daily review" testID="btn-review">
            <Ionicons name="list" size={20} color={iconColor} />
            <ThemedText style={[styles.secondaryButtonText, { color: textColor }]}>Review</ThemedText>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.secondaryButton, { backgroundColor: iconColor + '10', borderColor: iconColor + '20' }]} onPress={handleInsights} accessibilityRole="button" accessibilityLabel="Analytics" testID="btn-analytics">
            <Ionicons name="analytics" size={20} color={iconColor} />
            <ThemedText style={[styles.secondaryButtonText, { color: textColor }]}>Analytics</ThemedText>
          </TouchableOpacity>
        </View>

        {/* Utility Actions */}
        <View style={styles.utilityActions}>
          <TouchableOpacity style={styles.utilityButton} onPress={handleSchedules} accessibilityRole="button" accessibilityLabel="Schedules" testID="btn-schedules">
            <Ionicons name="calendar-outline" size={18} color={iconColor} />
            <ThemedText style={[styles.utilityButtonText, { color: iconColor }]}>Schedules</ThemedText>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.utilityButton} onPress={handleExport} accessibilityRole="button" accessibilityLabel="Export" testID="btn-export">
            <Ionicons name="download-outline" size={18} color={iconColor} />
            <ThemedText style={[styles.utilityButtonText, { color: iconColor }]}>Export</ThemedText>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.utilityButton} onPress={handleHelp} accessibilityRole="button" accessibilityLabel="Help" testID="btn-help">
            <Ionicons name="help-circle-outline" size={18} color={iconColor} />
            <ThemedText style={[styles.utilityButtonText, { color: iconColor }]}>Help</ThemedText>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const { height: screenHeight } = Dimensions.get('window');

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    padding: 20,
    paddingBottom: 40,
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  appTitle: {
    fontSize: 26,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 14,
    fontWeight: '500',
    marginTop: 2,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  dashboardContainer: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 16,
  },
  statCard: {
    alignItems: 'center',
    flex: 1,
  },
  statNumber: {
    fontSize: 28,
    fontWeight: '700',
    lineHeight: 32,
    fontFamily: 'monospace',
  },
  statLabel: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
    textTransform: 'uppercase',
  },
  performanceCard: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  performanceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  performanceTitle: {
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 6,
  },
  performanceScore: {
    fontSize: 16,
    fontWeight: '600',
  },
  performanceAvg: {
    fontSize: 14,
    fontWeight: '400',
  },
  supplementsList: {
    marginTop: 8,
  },
  supplementsTitle: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 6,
  },
  supplementItem: {
    fontSize: 14,
    marginBottom: 2,
    marginLeft: 8,
  },
  primaryActions: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 24,
  },
  primaryButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    paddingHorizontal: 20,
    borderRadius: 12,
    gap: 8,
  },
  primaryButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 24,
  },
  secondaryButton: {
    width: '47%',
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    gap: 8,
  },
  secondaryButtonText: {
    fontSize: 14,
    fontWeight: '500',
  },
  utilityActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 20,
  },
  utilityButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    gap: 4,
  },
  utilityButtonText: {
    fontSize: 12,
    fontWeight: '500',
  },
  sameAsYesterdayButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 20,
    gap: 8,
  },
  sameAsYesterdayText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
