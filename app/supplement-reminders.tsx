import React, { useState, useEffect, useCallback } from 'react';
import { StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, View, Switch, KeyboardAvoidingView, Platform } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Schedule, ScheduleWithSupplement, DayOfWeek, addSchedule, deleteSchedule, toggleScheduleEnabled, formatScheduleDays, formatTime12Hour, initializeSchedulesTable, getSchedulesWithSupplements } from '@/database/schedules';
import { getAllSupplements, Supplement } from '@/database/supplements';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';

const getContrastingTextColor = (backgroundColor: string): string => {
  const hex = backgroundColor.replace('#', '');
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? '#000000' : '#FFFFFF';
};

export default function SupplementRemindersScreen() {
  const router = useRouter();
  const tintColor = useThemeColor({}, 'tint');
  const textColor = useThemeColor({}, 'text');

  const [schedules, setSchedules] = useState<ScheduleWithSupplement[]>([]);
  const [supplements, setSupplements] = useState<Supplement[]>([]);
  const [showAddReminder, setShowAddReminder] = useState(false);
  const [selectedHour, setSelectedHour] = useState(9);
  const [selectedMinute, setSelectedMinute] = useState(0);
  const [selectedPeriod, setSelectedPeriod] = useState<'AM' | 'PM'>('AM');
  const [selectedTime, setSelectedTime] = useState(() => {
    const d = new Date();
    d.setHours(9, 0, 0, 0);
    return d;
  });
  const [newReminderDays, setNewReminderDays] = useState<DayOfWeek[]>(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);
  const [selectedSupplementId, setSelectedSupplementId] = useState<number | null>(null);
  const [scheduleMode, setScheduleMode] = useState<'days' | 'interval'>('days');
  const [intervalDays, setIntervalDays] = useState('7');
  const [startDate, setStartDate] = useState(new Date());
  const [showStartDatePicker, setShowStartDatePicker] = useState(false);

  const loadData = useCallback(async () => {
    try {
      await initializeSchedulesTable();
      const allSchedules = await getSchedulesWithSupplements();
      const supplementSchedules = allSchedules.filter(s => s.schedule_type === 'supplement');
      setSchedules(supplementSchedules);

      const allSupplements = await getAllSupplements();
      setSupplements(allSupplements);
      if (allSupplements.length > 0 && !selectedSupplementId) {
        setSelectedSupplementId(allSupplements[0].id);
      }
    } catch (error) {
      console.error('Failed to load data:', error);
    }
  }, [selectedSupplementId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleAddReminder = async () => {
    try {
      if (!selectedSupplementId) {
        Alert.alert('Error', 'Please select a supplement');
        return;
      }

      if (scheduleMode === 'days' && newReminderDays.length === 0) {
        Alert.alert('Error', 'Please select at least one day');
        return;
      }

      if (scheduleMode === 'interval' && (!intervalDays || Number(intervalDays) < 1)) {
        Alert.alert('Error', 'Please enter a valid interval (1 or more days)');
        return;
      }

      const daysValue = scheduleMode === 'interval' 
        ? JSON.stringify({ interval: Number(intervalDays) })
        : JSON.stringify(newReminderDays);

      const startDateTimestamp = scheduleMode === 'interval' 
        ? Math.floor(startDate.getTime() / 1000)
        : undefined;

      console.log('[REMINDER DEBUG] Adding schedule:', {
        schedule_type: 'supplement',
        supplement_id: selectedSupplementId,
        time: formatTime24(),
        days: daysValue,
        start_date: startDateTimestamp,
        startDateFormatted: startDate.toLocaleDateString()
      });

      const scheduleId = await addSchedule({
        schedule_type: 'supplement',
        supplement_id: selectedSupplementId,
        time: formatTime24(),
        days: daysValue,
        start_date: startDateTimestamp,
        enabled: true
      });

      console.log('[REMINDER DEBUG] Schedule added with ID:', scheduleId);

      const scheduledNotifications = await Notifications.getAllScheduledNotificationsAsync();
      console.log('[REMINDER DEBUG] Total scheduled notifications:', scheduledNotifications.length);
      console.log('[REMINDER DEBUG] Notification list:', scheduledNotifications.map(n => ({
        id: n.identifier.substring(0, 8),
        title: n.content.title,
        trigger: n.trigger
      })));

      setShowAddReminder(false);
      setSelectedHour(9);
      setSelectedMinute(0);
      setSelectedPeriod('AM');
      setNewReminderDays(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);
      setScheduleMode('days');
      setIntervalDays('7');
      setStartDate(new Date());
      loadData();
    } catch (error) {
      console.error('Failed to add reminder:', error);
      Alert.alert('Error', 'Failed to add reminder. Please try again.');
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
              Alert.alert('Error', 'Failed to delete reminder. Please try again.');
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
    if (newReminderDays.includes(day)) {
      setNewReminderDays(newReminderDays.filter(d => d !== day));
    } else {
      setNewReminderDays([...newReminderDays, day]);
    }
  };

  const setDayPreset = (preset: 'daily' | 'weekdays' | 'weekends') => {
    switch (preset) {
      case 'daily':
        setNewReminderDays(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);
        break;
      case 'weekdays':
        setNewReminderDays(['mon', 'tue', 'wed', 'thu', 'fri']);
        break;
      case 'weekends':
        setNewReminderDays(['sat', 'sun']);
        break;
    }
  };

  const handleBack = () => {
    router.back();
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

  const hours = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  const minutes = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

  return (
    <ThemedView style={styles.container} safeArea>
      <KeyboardAvoidingView 
        style={{ flex: 1 }} 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
      <ThemedView style={styles.header}>
        <TouchableOpacity onPress={handleBack} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={tintColor} />
        </TouchableOpacity>
        <ThemedText type="title" style={styles.title}>Supplement Reminders</ThemedText>
        <TouchableOpacity 
          style={[styles.addHeaderButton, { backgroundColor: tintColor }]}
          onPress={() => setShowAddReminder(true)}
        >
          <Ionicons name="add" size={20} color="white" />
        </TouchableOpacity>
      </ThemedView>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <ThemedText style={styles.description}>
          Set reminders to take your supplements at specific times. You'll receive notifications to help you stay on track.
        </ThemedText>

        <ThemedView style={styles.section}>
          <ThemedText style={styles.sectionTitle}>Active Reminders</ThemedText>
          
          {schedules.map((schedule) => (
            <View key={schedule.id} style={[styles.scheduleCard, { borderColor: tintColor + '20' }]}>
              <View style={styles.scheduleContent}>
                <View style={[styles.iconContainer, { backgroundColor: schedule.supplement_color || tintColor }]}>
                  <Ionicons
                    name={(schedule.supplement_icon || 'medical') as any}
                    size={20}
                    color={getContrastingTextColor(schedule.supplement_color || tintColor)}
                  />
                </View>
                <View style={styles.scheduleText}>
                  <ThemedText style={[styles.scheduleTime, !schedule.enabled && { opacity: 0.5 }]}>
                    {formatTime12Hour(schedule.time)}
                  </ThemedText>
                  <ThemedText style={[styles.supplementName, !schedule.enabled && { opacity: 0.5 }]}>
                    {schedule.supplement_name || 'Unknown Supplement'}
                  </ThemedText>
                  <ThemedText style={[styles.scheduleDays, !schedule.enabled && { opacity: 0.5 }]}>
                    {formatScheduleDays(schedule.days, schedule.start_date)}
                  </ThemedText>
                </View>
                <Switch
                  value={schedule.enabled}
                  onValueChange={(value) => handleToggleReminder(schedule.id, value)}
                  trackColor={{ false: '#E5E5E7', true: tintColor + '60' }}
                  thumbColor={schedule.enabled ? tintColor : '#f4f3f4'}
                  style={styles.scheduleSwitch}
                />
                <TouchableOpacity
                  style={styles.deleteButton}
                  onPress={() => handleDeleteReminder(schedule.id)}
                >
                  <Ionicons name="trash-outline" size={18} color="#FF3B30" />
                </TouchableOpacity>
              </View>
            </View>
          ))}

          {schedules.length === 0 && (
            <View style={styles.emptyState}>
              <Ionicons name="alarm-outline" size={48} color="#8E8E93" />
              <ThemedText style={styles.emptyStateText}>
                No reminders configured yet
              </ThemedText>
              <ThemedText style={styles.emptyStateSubtext}>
                Tap the + button to add your first reminder
              </ThemedText>
            </View>
          )}
        </ThemedView>

        {showAddReminder && (
          <ThemedView style={styles.addSection}>
            <ThemedText style={styles.addSectionTitle}>Add Reminder</ThemedText>
            
            {supplements.length === 0 ? (
              <View style={styles.noSupplementsWarning}>
                <Ionicons name="warning-outline" size={24} color="#FF9500" />
                <ThemedText style={styles.noSupplementsText}>
                  No supplements found. Add a supplement first.
                </ThemedText>
              </View>
            ) : (
              <>
                <ThemedText style={styles.inputLabel}>Supplement:</ThemedText>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.supplementScroll}>
                  <View style={styles.supplementSelector}>
                    {supplements.map((supplement) => (
                      <TouchableOpacity
                        key={supplement.id}
                        style={[
                          styles.supplementButton,
                          selectedSupplementId === supplement.id && { backgroundColor: (supplement.color || tintColor) + '20', borderColor: supplement.color || tintColor }
                        ]}
                        onPress={() => setSelectedSupplementId(supplement.id)}
                      >
                        <View style={[styles.supplementIconSmall, { backgroundColor: supplement.color || tintColor }]}>
                          <Ionicons
                            name={(supplement.icon_id || 'medical') as any}
                            size={16}
                            color={getContrastingTextColor(supplement.color || tintColor)}
                          />
                        </View>
                        <ThemedText style={[
                          styles.supplementButtonText,
                          selectedSupplementId === supplement.id && { color: supplement.color || tintColor }
                        ]}>
                          {supplement.name}
                        </ThemedText>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>

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
                    style={[
                      styles.scheduleModeButton,
                      scheduleMode === 'days' && { backgroundColor: tintColor + '20', borderColor: tintColor }
                    ]}
                    onPress={() => setScheduleMode('days')}
                  >
                    <ThemedText style={[
                      styles.scheduleModeButtonText,
                      scheduleMode === 'days' && { color: tintColor }
                    ]}>Specific Days</ThemedText>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.scheduleModeButton,
                      scheduleMode === 'interval' && { backgroundColor: tintColor + '20', borderColor: tintColor }
                    ]}
                    onPress={() => setScheduleMode('interval')}
                  >
                    <ThemedText style={[
                      styles.scheduleModeButtonText,
                      scheduleMode === 'interval' && { color: tintColor }
                    ]}>Every X Days</ThemedText>
                  </TouchableOpacity>
                </View>

                {scheduleMode === 'days' ? (
                  <>
                    <View style={styles.daySelector}>
                      {(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as DayOfWeek[]).map((day) => (
                        <TouchableOpacity
                          key={day}
                          style={[
                            styles.dayButton,
                            newReminderDays.includes(day) && { backgroundColor: tintColor, borderColor: tintColor }
                          ]}
                          onPress={() => toggleDay(day)}
                        >
                          <ThemedText style={[
                            styles.dayButtonText,
                            newReminderDays.includes(day) && { color: 'white' }
                          ]}>
                            {day.charAt(0).toUpperCase()}
                          </ThemedText>
                        </TouchableOpacity>
                      ))}
                    </View>

                    <View style={styles.presetButtons}>
                      <TouchableOpacity
                        style={[styles.presetButton, { borderColor: tintColor + '30' }]}
                        onPress={() => setDayPreset('daily')}
                      >
                        <ThemedText style={styles.presetButtonText}>Daily</ThemedText>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.presetButton, { borderColor: tintColor + '30' }]}
                        onPress={() => setDayPreset('weekdays')}
                      >
                        <ThemedText style={styles.presetButtonText}>Weekdays</ThemedText>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.presetButton, { borderColor: tintColor + '30' }]}
                        onPress={() => setDayPreset('weekends')}
                      >
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
                      />
                      <ThemedText style={styles.intervalUnit}>days</ThemedText>
                    </View>
                    
                    <ThemedText style={styles.inputLabel}>Starting from:</ThemedText>
                    <TouchableOpacity 
                      style={[styles.datePickerButton, { borderColor: tintColor + '30' }]}
                      onPress={() => setShowStartDatePicker(true)}
                    >
                      <Ionicons name="calendar-outline" size={20} color={tintColor} />
                      <ThemedText style={styles.datePickerButtonText}>
                        {startDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                      </ThemedText>
                    </TouchableOpacity>
                    
                    {showStartDatePicker && (
                      <DateTimePicker
                        value={startDate}
                        mode="date"
                        display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                        minimumDate={new Date()}
                        onChange={(event, selectedDate) => {
                          setShowStartDatePicker(Platform.OS === 'ios');
                          if (selectedDate) {
                            setStartDate(selectedDate);
                          }
                        }}
                      />
                    )}
                  </>
                )}

                <View style={styles.actionButtons}>
                  <TouchableOpacity
                    style={styles.cancelButton}
                    onPress={() => setShowAddReminder(false)}
                  >
                    <ThemedText style={styles.cancelButtonText}>Cancel</ThemedText>
                  </TouchableOpacity>
                  
                  <TouchableOpacity
                    style={[styles.addButton, { backgroundColor: tintColor }]}
                    onPress={handleAddReminder}
                  >
                    <ThemedText style={styles.addButtonText}>Add Reminder</ThemedText>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </ThemedView>
        )}
      </ScrollView>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 60,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  backButton: {
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
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  description: {
    fontSize: 14,
    opacity: 0.7,
    lineHeight: 20,
    marginBottom: 24,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
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
  scheduleTime: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 2,
  },
  supplementName: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 2,
  },
  scheduleDays: {
    fontSize: 12,
    opacity: 0.7,
  },
  scheduleSwitch: {
    marginRight: 12,
  },
  deleteButton: {
    padding: 4,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
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
  supplementScroll: {
    marginBottom: 16,
  },
  supplementSelector: {
    flexDirection: 'row',
    gap: 8,
  },
  supplementButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E5E7',
    gap: 8,
  },
  supplementIconSmall: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  supplementButtonText: {
    fontSize: 13,
    fontWeight: '500',
  },
  noSupplementsWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    backgroundColor: 'rgba(255, 149, 0, 0.1)',
    borderRadius: 8,
  },
  noSupplementsText: {
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
  datePickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 16,
  },
  datePickerButtonText: {
    fontSize: 15,
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
