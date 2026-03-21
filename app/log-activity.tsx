import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { StyleSheet, TouchableOpacity, Alert, View, Modal, TextInput, Platform, KeyboardAvoidingView, ScrollView, TouchableWithoutFeedback, Keyboard } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { logActivity, Activity } from '@/database/activities';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useHierarchicalBack } from '@/hooks/use-hierarchical-back';

export default function LogActivityScreen() {
  const [isLogged, setIsLogged] = useState(false);
  const [isLogging, setIsLogging] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [editTimestamp, setEditTimestamp] = useState(new Date());
  const [showDateTimePicker, setShowDateTimePicker] = useState(false);
  const [pendingPickerOpen, setPendingPickerOpen] = useState(false);
  const [tempTimestamp, setTempTimestamp] = useState(new Date());
  const [androidPickerMode, setAndroidPickerMode] = useState<'date' | 'time' | null>(null);
  const [androidTempDate, setAndroidTempDate] = useState(new Date());
  
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  const router = useRouter();
  const params = useLocalSearchParams();
  const tintColor = useThemeColor({}, 'tint');
  
  useHierarchicalBack('log-activity');

  const hasValidParams =
    !!params &&
    !!params.id &&
    !!params.name &&
    !!params.default_value &&
    !!params.unit;

  const activity: Activity = useMemo(() => ({
    id: Number(params.id) || 0,
    name: (params.name as string) || 'Unknown',
    default_value: Number(params.default_value) || 0,
    unit: (params.unit as string) || 'unit',
    icon_id: (params.icon_id as string) || 'fitness',
    color: (params.color as string) || '#00D4FF'
  }), [params.id, params.name, params.default_value, params.unit, params.icon_id, params.color]);

  const logActivityEntry = useCallback(async (customValue?: number, customTimestamp?: Date) => {
    if (isLogged || isLogging) return;
    
    const valueToUse = customValue || activity.default_value;
    
    if (!activity || !activity.id || valueToUse <= 0) {
      Alert.alert('Error', 'Invalid activity data. Please try again.');
      router.back();
      return;
    }
    
    setIsLogging(true);
    try {
      const timestampSeconds = customTimestamp ? Math.floor(customTimestamp.getTime() / 1000) : undefined;
      await logActivity(activity.id, valueToUse, undefined, timestampSeconds);
      
      setIsLogged(true);
      
      setTimeout(() => {
        router.back();
      }, 1500);
    } catch (error) {
      console.error('Failed to log activity:', error);
      Alert.alert('Error', 'Failed to log activity. Please try again.');
      router.back();
    } finally {
      setIsLogging(false);
    }
  }, [isLogged, isLogging, activity, router]);

  useEffect(() => {
    if (!hasValidParams) {
      Alert.alert('Error', 'Missing activity data. Please try again.');
      router.back();
    }
  }, [hasValidParams, router]);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  if (!hasValidParams) {
    return null;
  }

  const handleConfirmNow = () => {
    logActivityEntry();
  };

  const handleEdit = () => {
    setEditValue(activity.default_value.toString());
    setEditTimestamp(new Date());
    setShowEditModal(true);
  };

  const handleSaveEdit = async () => {
    const value = parseFloat(editValue);
    if (isNaN(value) || value <= 0) {
      Alert.alert('Error', 'Please enter a valid value');
      return;
    }
    
    if (editTimestamp.getTime() > Date.now()) {
      Alert.alert('Error', 'Cannot set a time in the future');
      return;
    }
    
    setShowEditModal(false);
    logActivityEntry(value, editTimestamp);
  };

  const handleDateTimeChange = (_event: any, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      if (_event.type === 'dismissed') {
        setAndroidPickerMode(null);
        setShowEditModal(true);
        return;
      }
      if (androidPickerMode === 'date' && selectedDate) {
        setAndroidTempDate(selectedDate);
        setAndroidPickerMode('time');
      } else if (androidPickerMode === 'time' && selectedDate) {
        const combinedDate = new Date(
          androidTempDate.getFullYear(),
          androidTempDate.getMonth(),
          androidTempDate.getDate(),
          selectedDate.getHours(),
          selectedDate.getMinutes()
        );
        const maxTime = new Date();
        const finalDate = combinedDate.getTime() > maxTime.getTime() ? maxTime : combinedDate;
        setEditTimestamp(finalDate);
        setAndroidPickerMode(null);
        setShowEditModal(true);
      }
    } else if (selectedDate) {
      const maxTime = new Date();
      const finalDate = selectedDate.getTime() > maxTime.getTime() ? maxTime : selectedDate;
      setTempTimestamp(finalDate);
    }
  };

  const handleOpenDatePicker = () => {
    setTempTimestamp(editTimestamp);
    setShowEditModal(false);
    if (Platform.OS === 'android') {
      setAndroidTempDate(editTimestamp);
      setAndroidPickerMode('date');
    } else {
      setPendingPickerOpen(true);
    }
  };

  const handleConfirmDateTime = () => {
    setEditTimestamp(tempTimestamp);
    setShowDateTimePicker(false);
    setShowEditModal(true);
  };

  const handleCancelDateTime = () => {
    setShowDateTimePicker(false);
    setShowEditModal(true);
  };

  useEffect(() => {
    if (pendingPickerOpen && !showEditModal) {
      setPendingPickerOpen(false);
      setShowDateTimePicker(true);
    }
  }, [pendingPickerOpen, showEditModal]);

  const handleCancel = () => {
    router.back();
  };

  if (isLogged) {
    return (
      <ThemedView style={styles.container} safeArea>
        <View style={styles.successContent}>
          <Ionicons name="checkmark-circle" size={80} color="#34C759" />
          <ThemedText style={styles.successText}>
            {activity?.name || 'Activity'} has been logged.
          </ThemedText>
        </View>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <View style={styles.centeredContent}>
        <View style={styles.activityInfo}>
          <Ionicons
            name={(activity?.icon_id || 'fitness') as any}
            size={60}
            color={activity?.color || tintColor}
            style={styles.activityIcon}
          />
          <ThemedText type="title" style={styles.activityName}>
            {activity?.name || 'Unknown Activity'}
          </ThemedText>
          <ThemedText style={styles.valueText}>
            {activity?.default_value || 0} {activity?.unit || 'unit'}
          </ThemedText>
        </View>

        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={[styles.confirmButton, { backgroundColor: tintColor }]}
            onPress={handleConfirmNow}
            disabled={isLogging}
            accessibilityRole="button"
            accessibilityLabel="Confirm activity log"
            testID="btn-log-activity-confirm"
          >
            <ThemedText style={styles.confirmButtonText}>
              {isLogging ? 'Logging...' : 'Confirm'}
            </ThemedText>
          </TouchableOpacity>

          <View style={styles.secondaryButtons}>
            <TouchableOpacity style={styles.secondaryButton} onPress={handleEdit} accessibilityRole="button" accessibilityLabel="Edit activity" testID="btn-log-activity-edit">
              <Ionicons name="pencil" size={20} color="#8E8E93" />
              <ThemedText style={styles.secondaryButtonText}>Edit</ThemedText>
            </TouchableOpacity>

            <TouchableOpacity style={styles.secondaryButton} onPress={handleCancel} accessibilityRole="button" accessibilityLabel="Cancel" testID="btn-log-activity-cancel">
              <Ionicons name="close" size={20} color="#8E8E93" />
              <ThemedText style={styles.secondaryButtonText}>Cancel</ThemedText>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <Modal
        visible={showEditModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowEditModal(false)}
      >
        <KeyboardAvoidingView 
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <ThemedView style={styles.modalContent}>
              <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setShowEditModal(false)} accessibilityRole="button" accessibilityLabel="Cancel edit" testID="btn-modal-cancel">
                <ThemedText style={styles.modalHeaderCancel}>Cancel</ThemedText>
              </TouchableOpacity>
              <ThemedText style={styles.modalTitle}>Edit Entry</ThemedText>
              <TouchableOpacity onPress={handleSaveEdit} accessibilityRole="button" accessibilityLabel="Save edit" testID="btn-modal-save">
                <ThemedText style={[styles.modalHeaderSave, { color: tintColor }]}>Save</ThemedText>
              </TouchableOpacity>
            </View>
            
            <ScrollView style={styles.modalScrollContent} keyboardShouldPersistTaps="handled">
              <View style={styles.editSection}>
                <ThemedText style={styles.editLabel}>Value</ThemedText>
                <View style={styles.valueInputContainer}>
                  <TextInput
                    style={styles.valueInput}
                    value={editValue}
                    onChangeText={setEditValue}
                    placeholder="0"
                    keyboardType="numeric"
                    placeholderTextColor="#999"
                    accessibilityLabel="Activity value"
                    testID="input-activity-value"
                  />
                  <ThemedText style={styles.valueUnit}>{activity?.unit || 'unit'}</ThemedText>
                </View>
              </View>

              <View style={styles.editSection}>
                <ThemedText style={styles.editLabel}>Timestamp</ThemedText>
                <TouchableOpacity
                  style={styles.timestampButton}
                  onPress={handleOpenDatePicker}
                  accessibilityRole="button"
                  accessibilityLabel="Select date and time"
                  testID="btn-timestamp-picker"
                >
                  <ThemedText style={styles.timestampText}>
                    {editTimestamp.toLocaleString()}
                  </ThemedText>
                  <Ionicons name="calendar" size={20} color="#8E8E93" />
                </TouchableOpacity>
                <ThemedText style={styles.editNote}>
                  Tap to adjust when you did this activity
                </ThemedText>
              </View>
            </ScrollView>
            </ThemedView>
          </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
      </Modal>

      {showDateTimePicker && Platform.OS === 'ios' && (
        <Modal
          visible={true}
          animationType="slide"
          transparent
          onRequestClose={handleCancelDateTime}
        >
          <View style={styles.pickerModalOverlay}>
            <View style={styles.pickerModalContent}>
              <View style={styles.pickerHeader}>
                <TouchableOpacity onPress={handleCancelDateTime} accessibilityRole="button" accessibilityLabel="Cancel date picker" testID="btn-picker-cancel">
                  <ThemedText style={styles.pickerCancelText}>Cancel</ThemedText>
                </TouchableOpacity>
                <ThemedText style={styles.pickerTitle}>Select Date & Time</ThemedText>
                <TouchableOpacity onPress={handleConfirmDateTime} accessibilityRole="button" accessibilityLabel="Confirm date and time" testID="btn-picker-done">
                  <ThemedText style={[styles.pickerDoneText, { color: tintColor }]}>Done</ThemedText>
                </TouchableOpacity>
              </View>
              <DateTimePicker
                value={tempTimestamp}
                mode="datetime"
                display="spinner"
                onChange={handleDateTimeChange}
                maximumDate={new Date()}
                style={styles.picker}
              />
            </View>
          </View>
        </Modal>
      )}
      {Platform.OS === 'android' && androidPickerMode === 'date' && (
        <DateTimePicker
          value={androidTempDate}
          mode="date"
          display="default"
          onChange={handleDateTimeChange}
          maximumDate={new Date()}
        />
      )}
      {Platform.OS === 'android' && androidPickerMode === 'time' && (
        <DateTimePicker
          value={androidTempDate}
          mode="time"
          display="default"
          onChange={handleDateTimeChange}
        />
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centeredContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  successContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    paddingBottom: 100,
  },
  activityInfo: {
    alignItems: 'center',
    marginBottom: 60,
  },
  activityIcon: {
    marginBottom: 16,
  },
  activityName: {
    fontSize: 32,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 8,
  },
  valueText: {
    fontSize: 18,
    color: '#8E8E93',
    textAlign: 'center',
  },
  buttonContainer: {
    width: '100%',
    alignItems: 'center',
  },
  confirmButton: {
    paddingVertical: 16,
    paddingHorizontal: 40,
    borderRadius: 12,
    marginBottom: 24,
    minWidth: 200,
    alignItems: 'center',
  },
  confirmButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '600',
  },
  secondaryButtons: {
    flexDirection: 'row',
    gap: 40,
  },
  secondaryButton: {
    alignItems: 'center',
    padding: 12,
  },
  secondaryButtonText: {
    fontSize: 14,
    color: '#8E8E93',
    marginTop: 4,
  },
  successText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#34C759',
    textAlign: 'center',
    marginTop: 20,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: 'white',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  modalHeaderCancel: {
    fontSize: 16,
    color: '#8E8E93',
  },
  modalHeaderSave: {
    fontSize: 16,
    fontWeight: '600',
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '600',
  },
  modalScrollContent: {
    padding: 24,
  },
  editSection: {
    marginBottom: 24,
  },
  editLabel: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  valueInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8F8F8',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    paddingHorizontal: 12,
  },
  valueInput: {
    flex: 1,
    fontSize: 16,
    padding: 12,
    color: '#000',
  },
  valueUnit: {
    fontSize: 16,
    color: '#8E8E93',
    marginLeft: 8,
  },
  editNote: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 8,
    textAlign: 'center',
  },
  timestampButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8F8F8',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  timestampText: {
    fontSize: 16,
    color: '#000',
    flex: 1,
  },
  pickerModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  pickerModalContent: {
    backgroundColor: 'white',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 20,
  },
  pickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  pickerTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  pickerCancelText: {
    fontSize: 16,
    color: '#8E8E93',
  },
  pickerDoneText: {
    fontSize: 16,
    fontWeight: '600',
  },
  picker: {
    height: 200,
  },
});
