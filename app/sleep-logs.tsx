import React, { useState, useMemo, useCallback } from 'react';
import { StyleSheet, TouchableOpacity, View, SectionList, Alert, Modal, Platform } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { SleepLog, getSleepLogs, deleteSleepLog, formatDuration, updateSleepLog } from '@/database/sleep';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useRouter, useFocusEffect } from 'expo-router';
import { Swipeable } from 'react-native-gesture-handler';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useHierarchicalBack } from '@/hooks/use-hierarchical-back';
import { SleepPrompt } from '@/components/sleep-prompt';

type ViewMode = 'log' | 'history';

interface LogSection {
  title: string;
  data: SleepLog[];
}

const formatDateHeader = (timestamp: number): string => {
  const date = new Date(timestamp * 1000);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const logDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  
  if (logDate.getTime() === today.getTime()) return 'Today';
  if (logDate.getTime() === yesterday.getTime()) return 'Yesterday';
  
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const formatTime = (timestamp: number): string => {
  const date = new Date(timestamp * 1000);
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
};

export default function SleepLogsScreen() {
  const [viewMode, setViewMode] = useState<ViewMode>('log');
  const [sleepLogs, setSleepLogs] = useState<SleepLog[]>([]);
  const [showSleepPrompt, setShowSleepPrompt] = useState(false);
  const [editingLog, setEditingLog] = useState<SleepLog | null>(null);
  const [editSleepStart, setEditSleepStart] = useState(new Date());
  const [editSleepEnd, setEditSleepEnd] = useState(new Date());
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [pickerMode, setPickerMode] = useState<'date' | 'time'>('date');
  const [pendingStartDate, setPendingStartDate] = useState<Date | null>(null);
  const [pendingEndDate, setPendingEndDate] = useState<Date | null>(null);
  const tintColor = useThemeColor({}, 'tint');
  const router = useRouter();
  
  useHierarchicalBack('sleep-logs');

  const loadHistory = useCallback(async () => {
    try {
      const logs = await getSleepLogs();
      setSleepLogs(logs);
    } catch (error) {
      console.error('Failed to load sleep history:', error);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (viewMode === 'history') {
        loadHistory();
      }
    }, [loadHistory, viewMode])
  );

  const handleDeleteLog = useCallback(async (logId: number) => {
    Alert.alert(
      'Delete Entry',
      'Are you sure you want to delete this sleep log?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteSleepLog(logId);
              setSleepLogs(prev => prev.filter(log => log.id !== logId));
            } catch (error) {
              console.error('Failed to delete log:', error);
              Alert.alert('Error', 'Failed to delete sleep log');
            }
          }
        }
      ]
    );
  }, []);

  const handleEditLog = useCallback((log: SleepLog) => {
    if (log.didnt_sleep) {
      Alert.alert('Cannot Edit', 'This entry indicates no sleep was logged.');
      return;
    }
    setEditingLog(log);
    setEditSleepStart(new Date((log.sleep_start || 0) * 1000));
    setEditSleepEnd(new Date((log.sleep_end || 0) * 1000));
    setPendingStartDate(null);
    setPendingEndDate(null);
  }, []);

  const handleSaveEdit = useCallback(async () => {
    if (!editingLog) return;
    
    const startTimestamp = Math.floor(editSleepStart.getTime() / 1000);
    const endTimestamp = Math.floor(editSleepEnd.getTime() / 1000);
    
    if (endTimestamp <= startTimestamp) {
      Alert.alert('Invalid Times', 'Wake time must be after sleep time.');
      return;
    }
    
    try {
      await updateSleepLog(editingLog.id, startTimestamp, endTimestamp);
      setSleepLogs(prev => prev.map(log => 
        log.id === editingLog.id 
          ? { ...log, sleep_start: startTimestamp, sleep_end: endTimestamp, duration_seconds: endTimestamp - startTimestamp, manually_edited: true }
          : log
      ));
      setEditingLog(null);
    } catch (error) {
      console.error('Failed to update log:', error);
      Alert.alert('Error', 'Failed to update sleep log');
    }
  }, [editingLog, editSleepStart, editSleepEnd]);

  const handleStartDateChange = useCallback((event: any, date?: Date) => {
    if (Platform.OS === 'android') {
      setShowStartPicker(false);
      if (event.type === 'set' && date) {
        if (pickerMode === 'date') {
          setPendingStartDate(date);
          setPickerMode('time');
          setTimeout(() => setShowStartPicker(true), 100);
        } else {
          const finalDate = new Date(pendingStartDate || editSleepStart);
          finalDate.setHours(date.getHours(), date.getMinutes());
          setEditSleepStart(finalDate);
          setPendingStartDate(null);
          setPickerMode('date');
        }
      } else {
        setPendingStartDate(null);
        setPickerMode('date');
      }
    } else if (date) {
      setEditSleepStart(date);
    }
  }, [pickerMode, pendingStartDate, editSleepStart]);

  const handleEndDateChange = useCallback((event: any, date?: Date) => {
    if (Platform.OS === 'android') {
      setShowEndPicker(false);
      if (event.type === 'set' && date) {
        if (pickerMode === 'date') {
          setPendingEndDate(date);
          setPickerMode('time');
          setTimeout(() => setShowEndPicker(true), 100);
        } else {
          const finalDate = new Date(pendingEndDate || editSleepEnd);
          finalDate.setHours(date.getHours(), date.getMinutes());
          setEditSleepEnd(finalDate);
          setPendingEndDate(null);
          setPickerMode('date');
        }
      } else {
        setPendingEndDate(null);
        setPickerMode('date');
      }
    } else if (date) {
      setEditSleepEnd(date);
    }
  }, [pickerMode, pendingEndDate, editSleepEnd]);

  const historySections = useMemo((): LogSection[] => {
    const grouped: Record<string, SleepLog[]> = {};
    sleepLogs.forEach(log => {
      const header = formatDateHeader(log.logged_at);
      if (!grouped[header]) grouped[header] = [];
      grouped[header].push(log);
    });
    return Object.entries(grouped).map(([title, data]) => ({ title, data }));
  }, [sleepLogs]);

  const handleViewModeChange = useCallback((mode: ViewMode) => {
    setViewMode(mode);
    if (mode === 'history') {
      loadHistory();
    }
  }, [loadHistory]);

  const handleLogSleep = useCallback(() => {
    setShowSleepPrompt(true);
  }, []);

  const handleSleepPromptClose = useCallback(() => {
    setShowSleepPrompt(false);
    if (viewMode === 'history') {
      loadHistory();
    }
  }, [viewMode, loadHistory]);

  const renderHistoryItem = useCallback(({ item }: { item: SleepLog }) => {
    const renderRightActions = () => (
      <TouchableOpacity
        style={styles.deleteAction}
        onPress={() => handleDeleteLog(item.id)}
      >
        <Ionicons name="trash-outline" size={24} color="white" />
      </TouchableOpacity>
    );

    return (
      <Swipeable renderRightActions={renderRightActions}>
        <View style={styles.historyItem}>
          <View style={[styles.historyIconContainer, { backgroundColor: item.didnt_sleep ? '#8E8E93' : tintColor }]}>
            <Ionicons name={item.didnt_sleep ? 'close-circle-outline' : 'moon-outline'} size={20} color="white" />
          </View>
          <View style={styles.historyTextContainer}>
            {item.didnt_sleep ? (
              <>
                <ThemedText style={styles.historyName}>Didn't Sleep</ThemedText>
                <ThemedText style={styles.historyTime}>Logged at {formatTime(item.logged_at)}</ThemedText>
              </>
            ) : (
              <>
                <ThemedText style={styles.historyName}>
                  {item.duration_seconds ? formatDuration(item.duration_seconds) : 'Unknown duration'}
                </ThemedText>
                <ThemedText style={styles.historyTime}>
                  {item.sleep_start ? formatTime(item.sleep_start) : '?'} - {item.sleep_end ? formatTime(item.sleep_end) : '?'}
                </ThemedText>
              </>
            )}
          </View>
          {item.manually_edited && (
            <Ionicons name="pencil" size={14} color="#8E8E93" style={styles.editedIcon} />
          )}
          {!item.didnt_sleep && (
            <TouchableOpacity onPress={() => handleEditLog(item)} style={styles.editButton}>
              <Ionicons name="create-outline" size={20} color={tintColor} />
            </TouchableOpacity>
          )}
        </View>
      </Swipeable>
    );
  }, [handleDeleteLog, handleEditLog, tintColor]);

  const renderSectionHeader = useCallback(({ section }: { section: LogSection }) => (
    <ThemedView style={styles.sectionHeader}>
      <ThemedText style={styles.sectionHeaderText}>{section.title}</ThemedText>
    </ThemedView>
  ), []);

  const renderEmptyHistory = useCallback(() => (
    <View style={styles.emptyContainer}>
      <Ionicons name="moon-outline" size={64} color="#8E8E93" />
      <ThemedText style={styles.emptyText}>No sleep logs yet</ThemedText>
      <ThemedText style={styles.emptySubtext}>Tap "Log Sleep" to record your sleep</ThemedText>
    </View>
  ), []);

  const renderLogView = useCallback(() => (
    <View style={styles.logViewContainer}>
      <Ionicons name="moon-outline" size={80} color={tintColor} style={styles.logIcon} />
      <ThemedText type="title" style={styles.logTitle}>Track Your Sleep</ThemedText>
      <ThemedText style={styles.logDescription}>
        Logging your sleep helps track how rest affects your cognitive performance and well-being.
      </ThemedText>
      
      <TouchableOpacity
        style={[styles.logButton, { backgroundColor: tintColor }]}
        onPress={handleLogSleep}
      >
        <Ionicons name="bed-outline" size={24} color="white" style={styles.buttonIcon} />
        <ThemedText style={styles.logButtonText}>Log Sleep Now</ThemedText>
      </TouchableOpacity>

      <View style={styles.infoBox}>
        <View style={styles.infoRow}>
          <Ionicons name="time-outline" size={18} color={tintColor} />
          <ThemedText style={styles.infoText}>
            You'll be prompted automatically every 24 hours
          </ThemedText>
        </View>
        <View style={styles.infoRow}>
          <Ionicons name="analytics-outline" size={18} color={tintColor} />
          <ThemedText style={styles.infoText}>
            View your sleep history in the History tab
          </ThemedText>
        </View>
      </View>
    </View>
  ), [tintColor, handleLogSleep]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemedView style={styles.container} safeArea>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="chevron-back" size={28} color={tintColor} />
          </TouchableOpacity>
          <ThemedText type="title" style={styles.title}>
            Sleep
          </ThemedText>
          <View style={styles.headerPlaceholder} />
        </View>

        <View style={styles.toggleContainer}>
          <TouchableOpacity
            style={[styles.toggleButton, viewMode === 'log' && { backgroundColor: tintColor }]}
            onPress={() => handleViewModeChange('log')}
          >
            <ThemedText style={[styles.toggleText, viewMode === 'log' && styles.toggleTextActive]}>
              Log
            </ThemedText>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleButton, viewMode === 'history' && { backgroundColor: tintColor }]}
            onPress={() => handleViewModeChange('history')}
          >
            <ThemedText style={[styles.toggleText, viewMode === 'history' && styles.toggleTextActive]}>
              History
            </ThemedText>
          </TouchableOpacity>
        </View>

        {viewMode === 'log' ? (
          renderLogView()
        ) : (
          <SectionList
            sections={historySections}
            renderItem={renderHistoryItem}
            renderSectionHeader={renderSectionHeader}
            keyExtractor={(item) => item.id.toString()}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.historyScrollContent}
            style={styles.scrollView}
            ListEmptyComponent={renderEmptyHistory}
            stickySectionHeadersEnabled={true}
          />
        )}

        <SleepPrompt
          visible={showSleepPrompt}
          onClose={handleSleepPromptClose}
          isOverdueReminder={false}
        />

        <Modal visible={editingLog !== null} transparent animationType="fade">
          <View style={styles.modalOverlay} pointerEvents="box-none">
            <View style={styles.modalContent}>
              <ThemedText type="subtitle" style={styles.modalTitle}>Edit Sleep Log</ThemedText>
              
              <View style={styles.editRow}>
                <ThemedText style={styles.editLabel}>Sleep Time:</ThemedText>
                <TouchableOpacity 
                  style={[styles.timeButton, { borderColor: tintColor }]} 
                  onPress={() => { setPickerMode('date'); setShowStartPicker(true); }}
                >
                  <ThemedText style={styles.timeButtonText}>
                    {editSleepStart.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                  </ThemedText>
                </TouchableOpacity>
              </View>
              
              <View style={styles.editRow}>
                <ThemedText style={styles.editLabel}>Wake Time:</ThemedText>
                <TouchableOpacity 
                  style={[styles.timeButton, { borderColor: tintColor }]} 
                  onPress={() => { setPickerMode('date'); setShowEndPicker(true); }}
                >
                  <ThemedText style={styles.timeButtonText}>
                    {editSleepEnd.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                  </ThemedText>
                </TouchableOpacity>
              </View>

              {Platform.OS === 'ios' && showStartPicker && (
                <DateTimePicker
                  value={editSleepStart}
                  mode="datetime"
                  display="spinner"
                  onChange={handleStartDateChange}
                />
              )}
              {Platform.OS === 'ios' && showEndPicker && (
                <DateTimePicker
                  value={editSleepEnd}
                  mode="datetime"
                  display="spinner"
                  onChange={handleEndDateChange}
                />
              )}
              
              <View style={styles.modalButtons}>
                <TouchableOpacity 
                  style={styles.cancelButton} 
                  onPress={() => setEditingLog(null)}
                >
                  <ThemedText style={styles.cancelButtonText}>Cancel</ThemedText>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.saveButton, { backgroundColor: tintColor }]} 
                  onPress={handleSaveEdit}
                >
                  <ThemedText style={styles.saveButtonText}>Save</ThemedText>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {Platform.OS === 'android' && showStartPicker && (
          <DateTimePicker
            value={pendingStartDate || editSleepStart}
            mode={pickerMode}
            display="default"
            onChange={handleStartDateChange}
          />
        )}
        {Platform.OS === 'android' && showEndPicker && (
          <DateTimePicker
            value={pendingEndDate || editSleepEnd}
            mode={pickerMode}
            display="default"
            onChange={handleEndDateChange}
          />
        )}
      </ThemedView>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
    marginBottom: 12,
  },
  backButton: {
    padding: 4,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    flex: 1,
    marginLeft: 8,
  },
  headerPlaceholder: {
    width: 32,
  },
  toggleContainer: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginBottom: 16,
    backgroundColor: '#E0E0E0',
    borderRadius: 8,
    padding: 4,
  },
  toggleButton: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 6,
  },
  toggleText: {
    fontSize: 14,
    fontWeight: '600',
  },
  toggleTextActive: {
    color: 'white',
  },
  scrollView: {
    flex: 1,
    paddingHorizontal: 20,
  },
  historyScrollContent: {
    paddingBottom: 100,
    flexGrow: 1,
  },
  historyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    backgroundColor: 'transparent',
  },
  historyIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  historyTextContainer: {
    flex: 1,
  },
  historyName: {
    fontSize: 16,
    fontWeight: '500',
  },
  historyTime: {
    fontSize: 13,
    color: '#8E8E93',
    marginTop: 2,
  },
  editedIcon: {
    marginLeft: 8,
  },
  editButton: {
    padding: 8,
    marginLeft: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 24,
    textAlign: 'center',
  },
  editRow: {
    marginBottom: 20,
  },
  editLabel: {
    fontSize: 14,
    marginBottom: 8,
    opacity: 0.7,
  },
  timeButton: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  timeButtonText: {
    fontSize: 16,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 24,
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: '#E0E0E0',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  saveButton: {
    flex: 1,
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  saveButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  sectionHeader: {
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  sectionHeaderText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8E8E93',
    textTransform: 'uppercase',
  },
  deleteAction: {
    backgroundColor: '#FF3B30',
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
    color: '#8E8E93',
  },
  emptySubtext: {
    fontSize: 14,
    color: '#8E8E93',
    marginTop: 8,
  },
  logViewContainer: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 30,
    paddingTop: 40,
  },
  logIcon: {
    marginBottom: 20,
  },
  logTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 12,
    textAlign: 'center',
  },
  logDescription: {
    fontSize: 15,
    textAlign: 'center',
    opacity: 0.7,
    marginBottom: 32,
    lineHeight: 22,
  },
  logButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    marginBottom: 32,
    width: '100%',
  },
  logButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '600',
  },
  buttonIcon: {
    marginRight: 10,
  },
  infoBox: {
    width: '100%',
    borderWidth: 1,
    borderColor: 'rgba(128, 128, 128, 0.3)',
    borderRadius: 12,
    padding: 16,
    backgroundColor: 'rgba(128, 128, 128, 0.05)',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
    gap: 10,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    opacity: 0.8,
  },
});
