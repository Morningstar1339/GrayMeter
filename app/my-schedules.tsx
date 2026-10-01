import React, { useState, useCallback } from 'react';
import { StyleSheet, ScrollView, TouchableOpacity, View, TextInput, Alert, Switch, KeyboardAvoidingView, Platform } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { ScheduleWithSupplement, getSchedulesWithSupplements, formatScheduleDays, formatTime12Hour, initializeSchedulesTable, addSchedule, updateSchedule, deleteSchedule, toggleScheduleEnabled, DayOfWeek } from '@/database/schedules';
import { getAllSupplements, Supplement } from '@/database/supplements';
import { getAllActivities, Activity } from '@/database/activities';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useHierarchicalBack } from '@/hooks/use-hierarchical-back';
import { scheduleSupplementReminders, scheduleActivityReminders, scheduleDailyReviewReminders } from '@/services/reminder-scheduler';

type TabType = 'supplements' | 'cognitive' | 'activities' | 'sleep' | 'daily_review';

const TABS: { key: TabType; label: string; icon: string }[] = [
  { key: 'supplements', label: 'Supplements', icon: 'medical-outline' },
  { key: 'cognitive', label: 'Tests', icon: 'flash-outline' },
  { key: 'activities', label: 'Activities', icon: 'fitness-outline' },
  { key: 'sleep', label: 'Sleep', icon: 'moon-outline' },
  { key: 'daily_review', label: 'Review', icon: 'journal-outline' },
];

const TEST_TYPES = [
  { id: 'all', name: 'All Tests', icon: 'apps-outline' },
  { id: 'reflexes', name: 'Reflexes', icon: 'flash-outline' },
  { id: 'memory', name: 'Memory', icon: 'grid-outline' },
  { id: 'connections', name: 'Route Planner', icon: 'git-network-outline' },
  { id: 'rock-dodger', name: 'Coordination', icon: 'shield-outline' },
  { id: 'questionnaire', name: 'Mood', icon: 'happy-outline' },
  { id: 'pattern-matcher', name: 'Pattern', icon: 'shapes-outline' },
  { id: 'tile-puzzle', name: 'Planning', icon: 'apps-outline' },
  { id: 'stroop', name: 'Coherence', icon: 'color-palette-outline' },
  { id: 'n-back', name: 'N-Back', icon: 'layers-outline' },
];

const TEST_TYPE_LABELS: Record<string, string> = {
  all: 'All Tests',
  reflexes: 'Reflexes',
  memory: 'Memory',
  connections: 'Route Planner',
  'rock-dodger': 'Coordination',
  questionnaire: 'Mood',
  'pattern-matcher': 'Deduction',
  'tile-puzzle': 'Planning',
  stroop: 'Coherence',
  'n-back': 'N-Back',
};

export default function MySchedulesScreen() {
  useHierarchicalBack('my-schedules');
  const router = useRouter();
  const tintColor = useThemeColor({}, 'tint');
  const textColor = useThemeColor({}, 'text');

  const [activeTab, setActiveTab] = useState<TabType>('supplements');
  const [schedules, setSchedules] = useState<ScheduleWithSupplement[]>([]);
  const [supplements, setSupplements] = useState<Supplement[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  
  const [selectedHour, setSelectedHour] = useState(9);
  const [selectedMinute, setSelectedMinute] = useState(0);
  const [selectedPeriod, setSelectedPeriod] = useState<'AM' | 'PM'>('AM');
  const [selectedTime, setSelectedTime] = useState(() => {
    const d = new Date();
    d.setHours(9, 0, 0, 0);
    return d;
  });
  const [selectedDays, setSelectedDays] = useState<DayOfWeek[]>(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);
  const [scheduleMode, setScheduleMode] = useState<'days' | 'interval'>('days');
  const [intervalDays, setIntervalDays] = useState('7');
  const [selectedSupplementId, setSelectedSupplementId] = useState<number | null>(null);
  const [selectedActivityId, setSelectedActivityId] = useState<number | null>(null);
  const [selectedTestType, setSelectedTestType] = useState('all');
  const [editingScheduleId, setEditingScheduleId] = useState<number | null>(null);
  const [startDate, setStartDate] = useState<Date>(new Date());
  const [showStartDatePicker, setShowStartDatePicker] = useState(false);

  const loadData = useCallback(async () => {
    console.log('[MySchedules] loadData starting...');
    try {
      console.log('[MySchedules] Initializing schedules table...');
      await initializeSchedulesTable();
      console.log('[MySchedules] Schedules table initialized');
      
      console.log('[MySchedules] Fetching schedules...');
      const allSchedules = await getSchedulesWithSupplements();
      console.log('[MySchedules] Loaded schedules:', allSchedules.length, allSchedules.map(s => ({ id: s.id, type: s.schedule_type, name: s.supplement_name || s.activity_name || s.test_type })));
      setSchedules(allSchedules);

      console.log('[MySchedules] Fetching supplements...');
      try {
        const allSupplements = await getAllSupplements();
        console.log('[MySchedules] Loaded supplements:', allSupplements.length);
        console.log('[MySchedules] Supplements raw data:', JSON.stringify(allSupplements));
        if (allSupplements.length > 0) {
          console.log('[MySchedules] Supplement IDs:', allSupplements.map(s => ({ id: s.id, name: s.name })));
        } else {
          console.log('[MySchedules] WARNING: No supplements found - check if supplements table has data');
        }
        setSupplements(allSupplements);
        if (allSupplements.length > 0 && !selectedSupplementId) {
          console.log('[MySchedules] Auto-selecting first supplement:', allSupplements[0].id, allSupplements[0].name);
          setSelectedSupplementId(allSupplements[0].id);
        }
      } catch (suppError: any) {
        console.error('[MySchedules] Failed to fetch supplements:', suppError?.message);
      }

      console.log('[MySchedules] Fetching activities...');
      try {
        const allActivities = await getAllActivities();
        console.log('[MySchedules] Loaded activities:', allActivities.length);
        console.log('[MySchedules] Activities raw data:', JSON.stringify(allActivities));
        if (allActivities.length > 0) {
          console.log('[MySchedules] Activity IDs:', allActivities.map(a => ({ id: a.id, name: a.name })));
        } else {
          console.log('[MySchedules] WARNING: No activities found - check if activities table has data');
        }
        setActivities(allActivities);
        if (allActivities.length > 0 && !selectedActivityId) {
          console.log('[MySchedules] Auto-selecting first activity:', allActivities[0].id, allActivities[0].name);
          setSelectedActivityId(allActivities[0].id);
        }
      } catch (actError: any) {
        console.error('[MySchedules] Failed to fetch activities:', actError?.message);
      }
      
      console.log('[MySchedules] loadData completed successfully');
    } catch (error: any) {
      console.error('[MySchedules] Failed to load data:', error);
      console.error('[MySchedules] Error message:', error?.message);
      console.error('[MySchedules] Error stack:', error?.stack);
    }
  }, [selectedSupplementId, selectedActivityId]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const getFilteredSchedules = () => {
    switch (activeTab) {
      case 'supplements':
        return schedules.filter(s => s.schedule_type === 'supplement');
      case 'cognitive':
        return schedules.filter(s => s.schedule_type === 'cognitive_test' || s.schedule_type === 'questionnaire');
      case 'activities':
        return schedules.filter(s => s.schedule_type === 'activity');
      case 'sleep':
        return schedules.filter(s => s.schedule_type === 'sleep');
      case 'daily_review':
        return schedules.filter(s => s.schedule_type === 'daily_review');
      default:
        return [];
    }
  };

  const handleHomePress = () => {
    router.push('/');
  };

  const formatTime24 = (): string => {
    let hour24 = selectedHour;
    if (selectedPeriod === 'PM' && selectedHour !== 12) {
      hour24 = selectedHour + 12;
    } else if (selectedPeriod === 'AM' && selectedHour === 12) {
      hour24 = 0;
    }
    return `${hour24.toString().padStart(2, '0')}:${selectedMinute.toString().padStart(2, '0')}`;
  };

  const resetForm = () => {
    setSelectedHour(9);
    setSelectedMinute(0);
    setSelectedPeriod('AM');
    setSelectedDays(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);
    setScheduleMode('days');
    setIntervalDays('7');
    setSelectedTestType('all');
    setShowAddForm(false);
    setEditingScheduleId(null);
    setStartDate(new Date());
    setShowStartDatePicker(false);
  };

  const handleEditReminder = (schedule: ScheduleWithSupplement) => {
    const [hours, minutes] = schedule.time.split(':').map(Number);
    const hour12 = hours % 12 || 12;
    const period: 'AM' | 'PM' = hours >= 12 ? 'PM' : 'AM';
    
    setSelectedHour(hour12);
    setSelectedMinute(minutes);
    setSelectedPeriod(period);
    
    try {
      const parsed = JSON.parse(schedule.days);
      if (parsed && typeof parsed === 'object' && 'interval' in parsed) {
        setScheduleMode('interval');
        setIntervalDays(String(parsed.interval));
        setSelectedDays(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);
      } else if (Array.isArray(parsed)) {
        setScheduleMode('days');
        setSelectedDays(parsed as DayOfWeek[]);
        setIntervalDays('7');
      }
    } catch {
      setScheduleMode('days');
      setSelectedDays(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);
    }
    
    if (schedule.start_date) {
      setStartDate(new Date(schedule.start_date * 1000));
    } else {
      setStartDate(new Date());
    }
    
    if (schedule.supplement_id) {
      setSelectedSupplementId(schedule.supplement_id);
    }
    if (schedule.activity_id) {
      setSelectedActivityId(schedule.activity_id);
    }
    if (schedule.test_type) {
      setSelectedTestType(schedule.test_type);
    }
    
    setEditingScheduleId(schedule.id);
    setShowAddForm(true);
  };

  const handleAddReminder = async () => {
    console.log('[handleAddReminder] Starting for tab:', activeTab);
    try {
      if (scheduleMode === 'days' && selectedDays.length === 0) {
        Alert.alert('Error', 'Please select at least one day');
        return;
      }

      if (scheduleMode === 'interval' && (!intervalDays || Number(intervalDays) < 1)) {
        Alert.alert('Error', 'Please enter a valid interval');
        return;
      }

      const daysValue = scheduleMode === 'interval' 
        ? JSON.stringify({ interval: Number(intervalDays) })
        : JSON.stringify(selectedDays);

      let scheduleType: 'supplement' | 'cognitive_test' | 'activity' | 'sleep' | 'daily_review' | 'questionnaire';
      let supplementId: number | undefined;
      let activityId: number | undefined;
      let testType: string | undefined;

      switch (activeTab) {
        case 'supplements':
          if (!selectedSupplementId) {
            console.log('[handleAddReminder] No supplement selected');
            Alert.alert('Error', 'Please select a supplement');
            return;
          }
          scheduleType = 'supplement';
          supplementId = selectedSupplementId;
          console.log('[handleAddReminder] Supplement schedule, id:', supplementId);
          break;
        case 'cognitive':
          scheduleType = 'cognitive_test';
          testType = selectedTestType;
          console.log('[handleAddReminder] Cognitive test schedule, type:', testType);
          break;
        case 'activities':
          if (!selectedActivityId) {
            console.log('[handleAddReminder] No activity selected');
            Alert.alert('Error', 'Please select an activity');
            return;
          }
          scheduleType = 'activity';
          activityId = selectedActivityId;
          console.log('[handleAddReminder] Activity schedule, id:', activityId);
          break;
        case 'sleep':
          scheduleType = 'sleep';
          console.log('[handleAddReminder] Sleep schedule');
          break;
        case 'daily_review':
          scheduleType = 'daily_review';
          console.log('[handleAddReminder] Daily review schedule');
          break;
        default:
          console.log('[handleAddReminder] Unknown tab:', activeTab);
          return;
      }

      const startDateTimestamp = scheduleMode === 'interval' ? Math.floor(startDate.getTime() / 1000) : undefined;
      console.log('[handleAddReminder] Start date for interval mode:', scheduleMode === 'interval' ? startDate.toLocaleDateString() : 'N/A', 'timestamp:', startDateTimestamp);

      if (editingScheduleId) {
        const scheduleData = {
          id: editingScheduleId,
          schedule_type: scheduleType,
          supplement_id: supplementId,
          activity_id: activityId,
          test_type: testType,
          time: formatTime24(),
          days: daysValue,
          start_date: startDateTimestamp,
          enabled: true,
          created_at: 0
        };
        console.log('[handleAddReminder] Calling updateSchedule with:', JSON.stringify(scheduleData, null, 2));
        await updateSchedule(scheduleData);
        console.log('[handleAddReminder] Schedule updated successfully');
      } else {
        const scheduleData = {
          schedule_type: scheduleType,
          supplement_id: supplementId,
          activity_id: activityId,
          test_type: testType,
          time: formatTime24(),
          days: daysValue,
          start_date: startDateTimestamp,
          enabled: true
        };
        console.log('[handleAddReminder] Calling addSchedule with:', JSON.stringify(scheduleData, null, 2));
        const newId = await addSchedule(scheduleData);
        console.log('[handleAddReminder] Schedule added successfully, id:', newId);
      }

      console.log('[handleAddReminder] Now scheduling notifications...');
      try {
        if (scheduleType === 'supplement' && supplementId) {
          await scheduleSupplementReminders(supplementId);
          console.log('[handleAddReminder] Supplement notifications scheduled');
        } else if (scheduleType === 'activity' && activityId) {
          await scheduleActivityReminders(activityId);
          console.log('[handleAddReminder] Activity notifications scheduled');
        } else if (scheduleType === 'daily_review') {
          await scheduleDailyReviewReminders();
          console.log('[handleAddReminder] Daily review notifications scheduled');
        }
      } catch (notifError: any) {
        console.error('[handleAddReminder] Failed to schedule notifications:', notifError);
        Alert.alert('Warning', `Schedule saved but notifications may not work: ${notifError?.message || 'Unknown error'}`);
      }

      resetForm();
      loadData();
    } catch (error: any) {
      console.error('[handleAddReminder] Failed to save reminder:', error);
      console.error('[handleAddReminder] Error message:', error?.message);
      console.error('[handleAddReminder] Error stack:', error?.stack);
      Alert.alert('Error', `Failed to save reminder: ${error?.message || 'Unknown error'}`);
    }
  };

  const handleDeleteReminder = (scheduleId: number) => {
    Alert.alert(
      'Delete Reminder',
      'Are you sure you want to delete this reminder?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteSchedule(scheduleId);
              loadData();
            } catch (error) {
              console.error('Failed to delete reminder:', error);
            }
          }
        }
      ]
    );
  };

  const handleToggleReminder = async (scheduleId: number, enabled: boolean) => {
    try {
      await toggleScheduleEnabled(scheduleId, enabled);
      loadData();
    } catch (error) {
      console.error('Failed to toggle reminder:', error);
    }
  };

  const toggleDay = (day: DayOfWeek) => {
    if (selectedDays.includes(day)) {
      setSelectedDays(selectedDays.filter(d => d !== day));
    } else {
      setSelectedDays([...selectedDays, day]);
    }
  };

  const setDayPreset = (preset: 'daily' | 'weekdays' | 'weekends') => {
    switch (preset) {
      case 'daily':
        setSelectedDays(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);
        break;
      case 'weekdays':
        setSelectedDays(['mon', 'tue', 'wed', 'thu', 'fri']);
        break;
      case 'weekends':
        setSelectedDays(['sat', 'sun']);
        break;
    }
  };

  const hours = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  const minutes = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

  const filteredSchedules = getFilteredSchedules();

  const getScheduleIcon = (schedule: ScheduleWithSupplement): string => {
    switch (schedule.schedule_type) {
      case 'supplement':
        return schedule.supplement_icon || 'medical-outline';
      case 'cognitive_test':
      case 'questionnaire':
        const testType = TEST_TYPES.find(t => t.id === schedule.test_type);
        return testType?.icon || 'flash-outline';
      case 'activity':
        return schedule.activity_icon || 'fitness-outline';
      case 'sleep':
        return 'moon-outline';
      case 'daily_review':
        return 'journal-outline';
      default:
        return 'alarm-outline';
    }
  };

  const getScheduleName = (schedule: ScheduleWithSupplement): string => {
    switch (schedule.schedule_type) {
      case 'supplement':
        return schedule.supplement_name || 'Unknown Supplement';
      case 'cognitive_test':
      case 'questionnaire':
        return TEST_TYPE_LABELS[schedule.test_type || 'all'] || schedule.test_type || 'Cognitive Test';
      case 'activity':
        return schedule.activity_name || 'Activity';
      case 'sleep':
        return 'Sleep Log Reminder';
      case 'daily_review':
        return 'Daily Review';
      default:
        return 'Reminder';
    }
  };

  const getScheduleColor = (schedule: ScheduleWithSupplement): string => {
    switch (schedule.schedule_type) {
      case 'supplement':
        return schedule.supplement_color || tintColor;
      case 'activity':
        return schedule.activity_color || '#FF9500';
      case 'sleep':
        return '#5856D6';
      case 'daily_review':
        return '#34C759';
      default:
        return tintColor;
    }
  };

  const getEmptyStateConfig = () => {
    switch (activeTab) {
      case 'supplements':
        return { icon: 'medical-outline', text: 'No supplement reminders', subtext: 'Tap + to add reminders for your supplements' };
      case 'cognitive':
        return { icon: 'flash-outline', text: 'No test reminders', subtext: 'Tap + to schedule cognitive test reminders' };
      case 'activities':
        return { icon: 'fitness-outline', text: 'No activity reminders', subtext: 'Tap + to schedule activity logging reminders' };
      case 'sleep':
        return { icon: 'moon-outline', text: 'No sleep reminders', subtext: 'Tap + to add bedtime or wake-up reminders' };
      case 'daily_review':
        return { icon: 'journal-outline', text: 'No daily review reminders', subtext: 'Tap + to schedule daily review reminders' };
    }
  };

  const renderAddForm = () => {
    if (!showAddForm) return null;

    const noItems = (activeTab === 'supplements' && supplements.length === 0) ||
                   (activeTab === 'activities' && activities.length === 0);

    return (
      <ThemedView style={styles.addSection}>
        <ThemedText style={styles.addSectionTitle}>{editingScheduleId ? 'Edit Reminder' : 'Add Reminder'}</ThemedText>

        {activeTab === 'supplements' && (
          supplements.length === 0 ? (
            <View style={styles.noItemsWarning}>
              <Ionicons name="warning-outline" size={24} color="#FF9500" />
              <ThemedText style={styles.noItemsText}>
                No supplements found. Add supplements first from the home screen.
              </ThemedText>
            </View>
          ) : (
            <>
              <ThemedText style={styles.inputLabel}>Supplement:</ThemedText>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.itemScroll}>
                <View style={styles.itemSelector}>
                  {supplements.map((supplement) => (
                    <TouchableOpacity
                      key={supplement.id}
                      style={[
                        styles.itemButton,
                        selectedSupplementId === supplement.id && { backgroundColor: (supplement.color || tintColor) + '20', borderColor: supplement.color || tintColor }
                      ]}
                      onPress={() => setSelectedSupplementId(supplement.id)}
                      accessibilityRole="button"
                      accessibilityLabel={`Select ${supplement.name}`}
                      testID={`btn-schedules-supplement-${supplement.id}`}
                    >
                      <View style={[styles.itemIconSmall, { backgroundColor: supplement.color || tintColor }]}>
                        <Ionicons name={(supplement.icon_id || 'medical') as any} size={16} color="white" />
                      </View>
                      <ThemedText style={[styles.itemButtonText, selectedSupplementId === supplement.id && { color: supplement.color || tintColor }]}>
                        {supplement.name}
                      </ThemedText>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            </>
          )
        )}

        {activeTab === 'cognitive' && (
          <>
            <ThemedText style={styles.inputLabel}>Test Type:</ThemedText>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.itemScroll}>
              <View style={styles.itemSelector}>
                {TEST_TYPES.map((testType) => (
                  <TouchableOpacity
                    key={testType.id}
                    style={[
                      styles.itemButton,
                      selectedTestType === testType.id && { backgroundColor: tintColor + '20', borderColor: tintColor }
                    ]}
                    onPress={() => setSelectedTestType(testType.id)}
                    accessibilityRole="button"
                    accessibilityLabel={`Select ${testType.name}`}
                    testID={`btn-schedules-test-type-${testType.id}`}
                  >
                    <Ionicons name={testType.icon as any} size={18} color={selectedTestType === testType.id ? tintColor : '#8E8E93'} />
                    <ThemedText style={[styles.itemButtonText, selectedTestType === testType.id && { color: tintColor }]}>
                      {testType.name}
                    </ThemedText>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </>
        )}

        {activeTab === 'activities' && (
          activities.length === 0 ? (
            <View style={styles.noItemsWarning}>
              <Ionicons name="warning-outline" size={24} color="#FF9500" />
              <ThemedText style={styles.noItemsText}>
                No activities found. Add activities first from the home screen.
              </ThemedText>
            </View>
          ) : (
            <>
              <ThemedText style={styles.inputLabel}>Activity:</ThemedText>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.itemScroll}>
                <View style={styles.itemSelector}>
                  {activities.map((activity) => (
                    <TouchableOpacity
                      key={activity.id}
                      style={[
                        styles.itemButton,
                        selectedActivityId === activity.id && { backgroundColor: (activity.color || '#FF9500') + '20', borderColor: activity.color || '#FF9500' }
                      ]}
                      onPress={() => setSelectedActivityId(activity.id)}
                      accessibilityRole="button"
                      accessibilityLabel={`Select ${activity.name}`}
                      testID={`btn-schedules-activity-${activity.id}`}
                    >
                      <View style={[styles.itemIconSmall, { backgroundColor: activity.color || '#FF9500' }]}>
                        <Ionicons name={(activity.icon_id || 'fitness') as any} size={16} color="white" />
                      </View>
                      <ThemedText style={[styles.itemButtonText, selectedActivityId === activity.id && { color: activity.color || '#FF9500' }]}>
                        {activity.name}
                      </ThemedText>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            </>
          )
        )}

        {!noItems && (
          <>
            <ThemedText style={styles.inputLabel}>Time:</ThemedText>
            <View style={styles.nativeTimePickerContainer}>
              <DateTimePicker
                value={selectedTime}
                mode="time"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                minuteInterval={5}
                onChange={(event, date) => {
                  if (date) {
                    setSelectedTime(date);
                    const h = date.getHours();
                    const m = date.getMinutes();
                    setSelectedPeriod(h >= 12 ? 'PM' : 'AM');
                    setSelectedHour(h === 0 ? 12 : h > 12 ? h - 12 : h);
                    setSelectedMinute(m);
                  }
                }}
                style={{ height: 150 }}
              />
            </View>

            <ThemedText style={styles.inputLabel}>Repeat:</ThemedText>
            <View style={styles.scheduleModeSelector}>
              <TouchableOpacity
                style={[styles.scheduleModeButton, scheduleMode === 'days' && { backgroundColor: tintColor + '20', borderColor: tintColor }]}
                onPress={() => setScheduleMode('days')}
                accessibilityRole="button"
                accessibilityLabel="Specific days mode"
                testID="btn-schedules-mode-days"
              >
                <ThemedText style={[styles.scheduleModeButtonText, scheduleMode === 'days' && { color: tintColor }]}>Specific Days</ThemedText>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.scheduleModeButton, scheduleMode === 'interval' && { backgroundColor: tintColor + '20', borderColor: tintColor }]}
                onPress={() => setScheduleMode('interval')}
                accessibilityRole="button"
                accessibilityLabel="Every X days mode"
                testID="btn-schedules-mode-interval"
              >
                <ThemedText style={[styles.scheduleModeButtonText, scheduleMode === 'interval' && { color: tintColor }]}>Every X Days</ThemedText>
              </TouchableOpacity>
            </View>

            {scheduleMode === 'days' ? (
              <>
                <View style={styles.daySelector}>
                  {(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as DayOfWeek[]).map((day) => (
                    <TouchableOpacity
                      key={day}
                      style={[styles.dayButton, selectedDays.includes(day) && { backgroundColor: tintColor, borderColor: tintColor }]}
                      onPress={() => toggleDay(day)}
                      accessibilityRole="button"
                      accessibilityLabel={`Toggle ${day}`}
                      testID={`btn-schedules-day-${day}`}
                    >
                      <ThemedText style={[styles.dayButtonText, selectedDays.includes(day) && { color: 'white' }]}>
                        {day.charAt(0).toUpperCase()}
                      </ThemedText>
                    </TouchableOpacity>
                  ))}
                </View>
                <View style={styles.presetButtons}>
                  <TouchableOpacity style={[styles.presetButton, { borderColor: tintColor + '30' }]} onPress={() => setDayPreset('daily')} accessibilityRole="button" accessibilityLabel="Daily preset" testID="btn-schedules-preset-daily">
                    <ThemedText style={styles.presetButtonText}>Daily</ThemedText>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.presetButton, { borderColor: tintColor + '30' }]} onPress={() => setDayPreset('weekdays')} accessibilityRole="button" accessibilityLabel="Weekdays preset" testID="btn-schedules-preset-weekdays">
                    <ThemedText style={styles.presetButtonText}>Weekdays</ThemedText>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.presetButton, { borderColor: tintColor + '30' }]} onPress={() => setDayPreset('weekends')} accessibilityRole="button" accessibilityLabel="Weekends preset" testID="btn-schedules-preset-weekends">
                    <ThemedText style={styles.presetButtonText}>Weekends</ThemedText>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <>
                <View style={styles.intervalInputGroup}>
                  <ThemedText style={styles.intervalLabel}>Repeat every:</ThemedText>
                  <TextInput
                    style={[styles.intervalInput, { borderColor: tintColor + '30', color: textColor }]}
                    value={intervalDays}
                    onChangeText={setIntervalDays}
                    placeholder="7"
                    placeholderTextColor="#8E8E93"
                    keyboardType="numeric"
                    accessibilityLabel="Interval in days"
                    testID="input-schedules-interval"
                  />
                  <ThemedText style={styles.intervalUnit}>days</ThemedText>
                </View>
                <View style={styles.startDateGroup}>
                  <ThemedText style={styles.intervalLabel}>Starting from:</ThemedText>
                  <TouchableOpacity
                    style={[styles.startDateButton, { borderColor: tintColor + '30' }]}
                    onPress={() => setShowStartDatePicker(true)}
                    accessibilityRole="button"
                    accessibilityLabel="Select start date"
                    testID="btn-schedules-start-date"
                  >
                    <ThemedText style={styles.startDateText}>
                      {startDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                    </ThemedText>
                    <Ionicons name="calendar-outline" size={18} color={tintColor} />
                  </TouchableOpacity>
                </View>
              </>
            )}

            <View style={styles.actionButtons}>
              <TouchableOpacity style={styles.cancelButton} onPress={resetForm} accessibilityRole="button" accessibilityLabel="Cancel" testID="btn-schedules-cancel">
                <ThemedText style={styles.cancelButtonText}>Cancel</ThemedText>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.addButton, { backgroundColor: tintColor }]} onPress={handleAddReminder} accessibilityRole="button" accessibilityLabel={editingScheduleId ? 'Save changes' : 'Add reminder'} testID="btn-schedules-save">
                <ThemedText style={styles.addButtonText}>{editingScheduleId ? 'Save Changes' : 'Add Reminder'}</ThemedText>
              </TouchableOpacity>
            </View>
          </>
        )}

        {noItems && (
          <TouchableOpacity style={styles.cancelButton} onPress={resetForm} accessibilityRole="button" accessibilityLabel="Cancel" testID="btn-schedules-cancel-no-items">
            <ThemedText style={styles.cancelButtonText}>Cancel</ThemedText>
          </TouchableOpacity>
        )}
      </ThemedView>
    );
  };

  const emptyState = getEmptyStateConfig();

  return (
    <ThemedView style={styles.container} safeArea>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ThemedView style={styles.header}>
          <TouchableOpacity onPress={handleHomePress} style={styles.homeButton} accessibilityRole="button" accessibilityLabel="Go home" testID="btn-schedules-home">
            <Ionicons name="home-outline" size={24} color={tintColor} />
          </TouchableOpacity>
          <ThemedText type="title" style={styles.title}>My Schedules</ThemedText>
          <TouchableOpacity
            style={[styles.addHeaderButton, { backgroundColor: tintColor }]}
            onPress={() => setShowAddForm(true)}
            accessibilityRole="button"
            accessibilityLabel="Add schedule"
            testID="btn-schedules-add"
          >
            <Ionicons name="add" size={20} color="white" />
          </TouchableOpacity>
        </ThemedView>

        <View style={styles.tabContainer}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabScroll}>
            {TABS.map((tab) => (
              <TouchableOpacity
                key={tab.key}
                style={[styles.tab, activeTab === tab.key && { backgroundColor: tintColor }]}
                onPress={() => { setActiveTab(tab.key); setShowAddForm(false); }}
                accessibilityRole="button"
                accessibilityLabel={`${tab.label} tab`}
                testID={`btn-schedules-tab-${tab.key}`}
              >
                <Ionicons name={tab.icon as any} size={16} color={activeTab === tab.key ? 'white' : tintColor} />
                <ThemedText style={[styles.tabText, activeTab === tab.key && { color: 'white' }]}>{tab.label}</ThemedText>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {renderAddForm()}

          {filteredSchedules.length === 0 && !showAddForm ? (
            <View style={styles.emptyState}>
              <Ionicons name={emptyState.icon as any} size={48} color="#8E8E93" />
              <ThemedText style={styles.emptyStateText}>{emptyState.text}</ThemedText>
              <ThemedText style={styles.emptyStateSubtext}>{emptyState.subtext}</ThemedText>
            </View>
          ) : (
            filteredSchedules.map((schedule) => (
              <View key={schedule.id} style={[styles.scheduleCard, { borderColor: tintColor + '20' }]}>
                <View style={styles.scheduleContent}>
                  <View style={[styles.iconContainer, { backgroundColor: getScheduleColor(schedule) }]}>
                    <Ionicons name={getScheduleIcon(schedule) as any} size={20} color="white" />
                  </View>
                  <View style={styles.scheduleText}>
                    <ThemedText style={[styles.scheduleName, !schedule.enabled && { opacity: 0.5 }]}>
                      {getScheduleName(schedule)}
                    </ThemedText>
                    <ThemedText style={[styles.scheduleTime, !schedule.enabled && { opacity: 0.5 }]}>
                      {formatTime12Hour(schedule.time)} — {formatScheduleDays(schedule.days)}
                    </ThemedText>
                  </View>
                  <Switch
                    value={schedule.enabled}
                    onValueChange={(value) => handleToggleReminder(schedule.id, value)}
                    trackColor={{ false: '#E5E5E7', true: tintColor + '60' }}
                    thumbColor={schedule.enabled ? tintColor : '#f4f3f4'}
                    style={styles.scheduleSwitch}
                  />
                  <TouchableOpacity style={styles.editButton} onPress={() => handleEditReminder(schedule)} accessibilityRole="button" accessibilityLabel={`Edit ${getScheduleName(schedule)} schedule`} testID={`btn-schedules-edit-${schedule.id}`}>
                    <Ionicons name="pencil-outline" size={18} color={tintColor} />
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.deleteButton} onPress={() => handleDeleteReminder(schedule.id)} accessibilityRole="button" accessibilityLabel={`Delete ${getScheduleName(schedule)} schedule`} testID={`btn-schedules-delete-${schedule.id}`}>
                    <Ionicons name="trash-outline" size={18} color="#FF3B30" />
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </ScrollView>
      </KeyboardAvoidingView>
      
      {showStartDatePicker && (
        Platform.OS === 'ios' ? (
          <View style={styles.datePickerOverlay}>
            <View style={styles.datePickerContainer}>
              <View style={styles.datePickerHeader}>
                <TouchableOpacity onPress={() => setShowStartDatePicker(false)} accessibilityRole="button" accessibilityLabel="Cancel date picker" testID="btn-schedules-date-cancel">
                  <ThemedText style={styles.datePickerCancel}>Cancel</ThemedText>
                </TouchableOpacity>
                <ThemedText style={styles.datePickerTitle}>Start Date</ThemedText>
                <TouchableOpacity onPress={() => setShowStartDatePicker(false)} accessibilityRole="button" accessibilityLabel="Confirm date" testID="btn-schedules-date-done">
                  <ThemedText style={[styles.datePickerDone, { color: tintColor }]}>Done</ThemedText>
                </TouchableOpacity>
              </View>
              <DateTimePicker
                value={startDate}
                mode="date"
                display="spinner"
                minimumDate={new Date()}
                onChange={(event, date) => {
                  if (date) setStartDate(date);
                }}
              />
            </View>
          </View>
        ) : (
          <DateTimePicker
            value={startDate}
            mode="date"
            display="default"
            minimumDate={new Date()}
            onChange={(event, date) => {
              setShowStartDatePicker(false);
              if (event.type === 'set' && date) setStartDate(date);
            }}
          />
        )
      )}
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
  homeButton: {
    padding: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  addHeaderButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabContainer: {
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  tabScroll: {
    gap: 8,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: 'rgba(128, 128, 128, 0.1)',
    gap: 6,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  scheduleCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  scheduleContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  scheduleText: {
    flex: 1,
  },
  scheduleName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  scheduleTime: {
    fontSize: 14,
    opacity: 0.7,
  },
  scheduleSwitch: {
    marginRight: 8,
  },
  editButton: {
    padding: 4,
    marginRight: 8,
  },
  deleteButton: {
    padding: 4,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyStateText: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 16,
    opacity: 0.6,
  },
  emptyStateSubtext: {
    fontSize: 14,
    marginTop: 8,
    opacity: 0.5,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  addSection: {
    marginBottom: 24,
    padding: 16,
    borderRadius: 12,
    backgroundColor: 'rgba(128, 128, 128, 0.1)',
  },
  addSectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  itemScroll: {
    marginBottom: 16,
  },
  itemSelector: {
    flexDirection: 'row',
    gap: 8,
  },
  itemButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E5E7',
    gap: 8,
  },
  itemIconSmall: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemButtonText: {
    fontSize: 13,
    fontWeight: '500',
  },
  noItemsWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    backgroundColor: 'rgba(255, 149, 0, 0.1)',
    borderRadius: 8,
    marginBottom: 16,
  },
  noItemsText: {
    flex: 1,
    fontSize: 14,
  },
  timePickerContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  nativeTimePickerContainer: {
    alignItems: 'center',
    marginBottom: 16,
  },
  timePickerColumn: {
    flex: 1,
  },
  timePickerLabel: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 8,
    opacity: 0.7,
  },
  timePickerScroll: {
    height: 120,
    borderWidth: 1,
    borderColor: '#E5E5E7',
    borderRadius: 8,
  },
  timePickerItem: {
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  timePickerItemText: {
    fontSize: 16,
  },
  periodColumn: {
    width: 60,
  },
  periodButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E5E5E7',
    borderRadius: 8,
    marginBottom: 4,
  },
  periodButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  scheduleModeSelector: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  scheduleModeButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E5E7',
    alignItems: 'center',
  },
  scheduleModeButtonText: {
    fontSize: 13,
    fontWeight: '500',
  },
  daySelector: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  dayButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E5E5E7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  presetButtons: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  presetButton: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: 'center',
  },
  presetButtonText: {
    fontSize: 12,
    fontWeight: '500',
  },
  intervalInputGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  intervalLabel: {
    fontSize: 14,
    fontWeight: '500',
  },
  intervalInput: {
    width: 60,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    fontSize: 16,
    textAlign: 'center',
  },
  intervalUnit: {
    fontSize: 14,
    opacity: 0.7,
  },
  startDateGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 12,
  },
  startDateButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  startDateText: {
    fontSize: 16,
  },
  datePickerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'flex-end',
  },
  datePickerContainer: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  datePickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(128, 128, 128, 0.2)',
  },
  datePickerTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  datePickerCancel: {
    fontSize: 16,
    opacity: 0.7,
  },
  datePickerDone: {
    fontSize: 16,
    fontWeight: '600',
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E5E7',
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#8E8E93',
  },
  addButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  addButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },
});
