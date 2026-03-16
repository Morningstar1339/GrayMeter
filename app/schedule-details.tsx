import React, { useState, useCallback } from 'react';
import { StyleSheet, TouchableOpacity, View, ScrollView, Alert, Switch } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { formatScheduleDays, formatTime12Hour, deleteSchedule, toggleScheduleEnabled } from '@/database/schedules';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useHierarchicalBack } from '@/hooks/use-hierarchical-back';

const TEST_TYPE_LABELS: Record<string, string> = {
  all: 'All Tests',
  reflexes: 'Reflexes',
  memory: 'Memory',
  connections: 'Connections',
  'rock-dodger': 'Rock Dodger',
  questionnaire: 'Mood',
  'pattern-matcher': 'Pattern Matcher',
  'tile-puzzle': '8-Tile Puzzle',
  stroop: 'Stroop',
  'n-back': 'N-Back',
};

export default function ScheduleDetailsScreen() {
  useHierarchicalBack('schedule-details');
  const router = useRouter();
  const params = useLocalSearchParams();
  const tintColor = useThemeColor({}, 'tint');

  const scheduleId = Number(params.id) || 0;
  const scheduleType = (params.schedule_type as string) || '';
  const time = (params.time as string) || '09:00';
  const days = (params.days as string) || '[]';
  const startDate = params.start_date ? Number(params.start_date) : undefined;
  const [enabled, setEnabled] = useState(params.enabled === 'true' || params.enabled === '1');
  const supplementName = (params.supplement_name as string) || undefined;
  const supplementIcon = (params.supplement_icon as string) || undefined;
  const supplementColor = (params.supplement_color as string) || undefined;
  const activityName = (params.activity_name as string) || undefined;
  const activityIcon = (params.activity_icon as string) || undefined;
  const activityColor = (params.activity_color as string) || undefined;
  const testType = (params.test_type as string) || undefined;

  const getTitle = (): string => {
    switch (scheduleType) {
      case 'supplement':
        return supplementName ? `${supplementName} Schedule` : 'Supplement Schedule';
      case 'cognitive_test':
      case 'questionnaire':
        return testType ? `${TEST_TYPE_LABELS[testType] || testType} Test Schedule` : 'Test Schedule';
      case 'activity':
        return activityName ? `${activityName} Schedule` : 'Activity Schedule';
      case 'sleep':
        return 'Sleep Schedule';
      case 'daily_review':
        return 'Daily Review Schedule';
      default:
        return 'Schedule Details';
    }
  };

  const getIcon = (): string => {
    switch (scheduleType) {
      case 'supplement':
        return supplementIcon || 'medical-outline';
      case 'cognitive_test':
      case 'questionnaire':
        return 'flash-outline';
      case 'activity':
        return activityIcon || 'fitness-outline';
      case 'sleep':
        return 'moon-outline';
      case 'daily_review':
        return 'journal-outline';
      default:
        return 'alarm-outline';
    }
  };

  const getColor = (): string => {
    switch (scheduleType) {
      case 'supplement':
        return supplementColor || tintColor;
      case 'activity':
        return activityColor || '#FF9500';
      case 'sleep':
        return '#5856D6';
      case 'daily_review':
        return '#34C759';
      default:
        return tintColor;
    }
  };

  const getTypeLabel = (): string => {
    switch (scheduleType) {
      case 'supplement': return 'Supplement Reminder';
      case 'cognitive_test': return 'Cognitive Test Reminder';
      case 'questionnaire': return 'Questionnaire Reminder';
      case 'activity': return 'Activity Reminder';
      case 'sleep': return 'Sleep Reminder';
      case 'daily_review': return 'Daily Review Reminder';
      default: return 'Reminder';
    }
  };

  const handleToggle = async (value: boolean) => {
    try {
      await toggleScheduleEnabled(scheduleId, value);
      setEnabled(value);
    } catch (error) {
      console.error('Failed to toggle schedule:', error);
    }
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete Schedule',
      'Are you sure you want to delete this schedule?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteSchedule(scheduleId);
              router.back();
            } catch (error) {
              console.error('Failed to delete schedule:', error);
            }
          },
        },
      ]
    );
  };

  const color = getColor();

  return (
    <ThemedView style={styles.container} safeArea>
      <ThemedView style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={tintColor} />
        </TouchableOpacity>
        <ThemedText type="title" style={styles.title}>{getTitle()}</ThemedText>
        <View style={{ width: 40 }} />
      </ThemedView>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.heroSection}>
          <View style={[styles.heroIcon, { backgroundColor: color }]}>
            <Ionicons name={getIcon() as any} size={36} color="white" />
          </View>
          <ThemedText style={styles.heroTitle}>{getTitle()}</ThemedText>
          <ThemedText style={styles.heroSubtitle}>{getTypeLabel()}</ThemedText>
        </View>

        <View style={[styles.card, { borderColor: tintColor + '20' }]}>
          <View style={styles.detailRow}>
            <Ionicons name="time-outline" size={20} color={tintColor} />
            <ThemedText style={styles.detailLabel}>Time</ThemedText>
            <ThemedText style={styles.detailValue}>{formatTime12Hour(time)}</ThemedText>
          </View>

          <View style={styles.divider} />

          <View style={styles.detailRow}>
            <Ionicons name="calendar-outline" size={20} color={tintColor} />
            <ThemedText style={styles.detailLabel}>Repeat</ThemedText>
            <ThemedText style={styles.detailValue}>{formatScheduleDays(days, startDate)}</ThemedText>
          </View>

          <View style={styles.divider} />

          <View style={styles.detailRow}>
            <Ionicons name="notifications-outline" size={20} color={tintColor} />
            <ThemedText style={styles.detailLabel}>Enabled</ThemedText>
            <Switch
              value={enabled}
              onValueChange={handleToggle}
              trackColor={{ false: '#E5E5E7', true: tintColor + '60' }}
              thumbColor={enabled ? tintColor : '#f4f3f4'}
            />
          </View>

          {scheduleType === 'supplement' && supplementName && (
            <>
              <View style={styles.divider} />
              <View style={styles.detailRow}>
                <Ionicons name="medical-outline" size={20} color={color} />
                <ThemedText style={styles.detailLabel}>Supplement</ThemedText>
                <ThemedText style={styles.detailValue}>{supplementName}</ThemedText>
              </View>
            </>
          )}

          {(scheduleType === 'cognitive_test' || scheduleType === 'questionnaire') && testType && (
            <>
              <View style={styles.divider} />
              <View style={styles.detailRow}>
                <Ionicons name="flash-outline" size={20} color={color} />
                <ThemedText style={styles.detailLabel}>Test</ThemedText>
                <ThemedText style={styles.detailValue}>{TEST_TYPE_LABELS[testType] || testType}</ThemedText>
              </View>
            </>
          )}

          {scheduleType === 'activity' && activityName && (
            <>
              <View style={styles.divider} />
              <View style={styles.detailRow}>
                <Ionicons name="fitness-outline" size={20} color={color} />
                <ThemedText style={styles.detailLabel}>Activity</ThemedText>
                <ThemedText style={styles.detailValue}>{activityName}</ThemedText>
              </View>
            </>
          )}
        </View>

        <TouchableOpacity style={styles.deleteButton} onPress={handleDelete}>
          <Ionicons name="trash-outline" size={20} color="#FF3B30" />
          <ThemedText style={styles.deleteButtonText}>Delete Schedule</ThemedText>
        </TouchableOpacity>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 12,
  },
  backButton: {
    padding: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  heroSection: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  heroIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 4,
    textAlign: 'center',
  },
  heroSubtitle: {
    fontSize: 14,
    opacity: 0.6,
  },
  card: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 12,
  },
  detailLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
  },
  detailValue: {
    fontSize: 15,
    opacity: 0.8,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(128, 128, 128, 0.15)',
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FF3B3030',
    gap: 8,
    marginBottom: 40,
  },
  deleteButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FF3B30',
  },
});
