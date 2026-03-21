import React, { useState, useEffect } from 'react';
import { StyleSheet, TouchableOpacity, View, Modal, Platform } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { ThemedText } from '@/components/themed-text';
import { useThemeColor } from '@/hooks/use-theme-color';
import { Ionicons } from '@expo/vector-icons';
import { logSleep, logDidntSleep, markSleepPromptShown, formatDuration } from '@/database/sleep';
import { rescheduleSleepReminder } from '@/database/notifications';

interface SleepPromptProps {
  visible: boolean;
  onClose: () => void;
  isOverdueReminder?: boolean;
}

export function SleepPrompt({ visible, onClose, isOverdueReminder = false }: SleepPromptProps) {
  const tintColor = useThemeColor({}, 'tint');
  const backgroundColor = useThemeColor({}, 'background');
  
  const [step, setStep] = useState<'options' | 'sleep-time' | 'wake-time' | 'confirm' | 'success'>('options');
  const [loggedDuration, setLoggedDuration] = useState<number>(0);
  const [sleepTime, setSleepTime] = useState<Date>(getDefaultSleepTime());
  const [wakeTime, setWakeTime] = useState<Date>(new Date());
  const [showPicker, setShowPicker] = useState(false);
  const [pickerMode, setPickerMode] = useState<'date' | 'time'>('time');
  const [currentPicker, setCurrentPicker] = useState<'sleep' | 'wake'>('sleep');
  const [androidTempDate, setAndroidTempDate] = useState<Date>(new Date());
  const [isLogging, setIsLogging] = useState(false);

  function getDefaultSleepTime(): Date {
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(22, 0, 0, 0);
    return yesterday;
  }

  function getDefaultWakeTime(): Date {
    const now = new Date();
    const today = new Date(now);
    today.setHours(7, 0, 0, 0);
    return today;
  }

  useEffect(() => {
    if (visible) {
      setStep(isOverdueReminder ? 'options' : 'sleep-time');
      setSleepTime(getDefaultSleepTime());
      setWakeTime(getDefaultWakeTime());
    }
  }, [visible, isOverdueReminder]);

  const handleSkip = async () => {
    try {
      await markSleepPromptShown();
      await rescheduleSleepReminder();
    } catch (error) {
      console.error('Failed to mark sleep prompt shown:', error);
    } finally {
      onClose();
    }
  };

  const handleDontWantToLog = async () => {
    try {
      await markSleepPromptShown();
      await rescheduleSleepReminder();
    } catch (error) {
      console.error('Failed to mark sleep prompt shown:', error);
    } finally {
      onClose();
    }
  };

  const handleDidntSleep = async () => {
    setIsLogging(true);
    try {
      await logDidntSleep();
      await markSleepPromptShown();
      await rescheduleSleepReminder();
      onClose();
    } catch (error) {
      console.error('Failed to log no sleep:', error);
    } finally {
      setIsLogging(false);
    }
  };

  const handleLogSleep = () => {
    setStep('sleep-time');
  };

  const handleSleepTimeSet = () => {
    setStep('wake-time');
  };

  const handleWakeTimeSet = () => {
    setStep('confirm');
  };

  const handleConfirmSleep = async () => {
    setIsLogging(true);
    try {
      const sleepTimestamp = Math.floor(sleepTime.getTime() / 1000);
      const wakeTimestamp = Math.floor(wakeTime.getTime() / 1000);
      await logSleep(sleepTimestamp, wakeTimestamp);
      await markSleepPromptShown();
      await rescheduleSleepReminder();
      setLoggedDuration(wakeTimestamp - sleepTimestamp);
      setStep('success');
    } catch (error) {
      console.error('Failed to log sleep:', error);
    } finally {
      setIsLogging(false);
    }
  };

  const handleSuccessDone = () => {
    onClose();
  };

  const openPicker = (picker: 'sleep' | 'wake') => {
    setCurrentPicker(picker);
    if (Platform.OS === 'android') {
      setAndroidTempDate(picker === 'sleep' ? sleepTime : wakeTime);
      setPickerMode('date');
    }
    setShowPicker(true);
  };

  const handlePickerChange = (_event: any, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      if (_event.type === 'dismissed') {
        setShowPicker(false);
        return;
      }
      if (pickerMode === 'date' && selectedDate) {
        setAndroidTempDate(selectedDate);
        setPickerMode('time');
      } else if (pickerMode === 'time' && selectedDate) {
        const combinedDate = new Date(
          androidTempDate.getFullYear(),
          androidTempDate.getMonth(),
          androidTempDate.getDate(),
          selectedDate.getHours(),
          selectedDate.getMinutes()
        );
        if (currentPicker === 'sleep') {
          setSleepTime(combinedDate);
        } else {
          setWakeTime(combinedDate);
        }
        setShowPicker(false);
      }
    } else if (selectedDate) {
      if (currentPicker === 'sleep') {
        setSleepTime(selectedDate);
      } else {
        setWakeTime(selectedDate);
      }
    }
  };

  const handleIOSPickerDone = () => {
    setShowPicker(false);
  };

  const getDuration = (): number => {
    const sleepTimestamp = Math.floor(sleepTime.getTime() / 1000);
    const wakeTimestamp = Math.floor(wakeTime.getTime() / 1000);
    return wakeTimestamp - sleepTimestamp;
  };

  const formatTime = (date: Date): string => {
    return date.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true 
    });
  };

  const formatDate = (date: Date): string => {
    return date.toLocaleDateString('en-US', { 
      weekday: 'short',
      month: 'short', 
      day: 'numeric' 
    });
  };

  const renderOptionsStep = () => (
    <View style={styles.content}>
      <Ionicons name="moon-outline" size={60} color={tintColor} style={styles.icon} />
      <ThemedText type="title" style={styles.title}>
        {isOverdueReminder ? 'Sleep Reminder' : 'Log Your Sleep'}
      </ThemedText>
      <ThemedText style={styles.description}>
        {isOverdueReminder 
          ? "It's been over 24 hours since your last sleep log. Good sleep data helps track your well-being!"
          : 'Track your sleep to better understand how it affects your cognitive performance.'}
      </ThemedText>

      <TouchableOpacity
        style={[styles.primaryButton, { backgroundColor: tintColor }]}
        onPress={handleLogSleep}
        accessibilityRole="button"
        accessibilityLabel="Log sleep now"
        testID="btn-log-sleep-now"
      >
        <Ionicons name="bed-outline" size={20} color="white" style={styles.buttonIcon} />
        <ThemedText style={styles.primaryButtonText}>Log Sleep Now</ThemedText>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.secondaryButton}
        onPress={handleDontWantToLog}
        accessibilityRole="button"
        accessibilityLabel="Skip sleep logging"
        testID="btn-skip-sleep"
      >
        <ThemedText style={[styles.secondaryButtonText, { color: tintColor }]}>
          {isOverdueReminder ? "I don't want to log" : 'Skip for now'}
        </ThemedText>
      </TouchableOpacity>

      {isOverdueReminder && (
        <TouchableOpacity
          style={styles.tertiaryButton}
          onPress={handleDidntSleep}
          accessibilityRole="button"
          accessibilityLabel="I didn't sleep"
          testID="btn-didnt-sleep"
        >
          <ThemedText style={styles.tertiaryButtonText}>
            I didn't sleep in this time
          </ThemedText>
        </TouchableOpacity>
      )}

      {!isOverdueReminder && (
        <TouchableOpacity
          style={styles.tertiaryButton}
          onPress={handleSkip}
          accessibilityRole="button"
          accessibilityLabel="Don't ask again today"
          testID="btn-dont-ask-today"
        >
          <ThemedText style={styles.tertiaryButtonText}>
            Don't ask again today
          </ThemedText>
        </TouchableOpacity>
      )}
    </View>
  );

  const renderSleepTimeStep = () => (
    <View style={styles.content}>
      <Ionicons name="moon-outline" size={50} color={tintColor} style={styles.icon} />
      <ThemedText type="title" style={styles.title}>When did you go to sleep?</ThemedText>

      <TouchableOpacity
        style={[styles.timeButton, { borderColor: tintColor }]}
        onPress={() => openPicker('sleep')}
        accessibilityRole="button"
        accessibilityLabel="Set sleep time"
        testID="btn-sleep-time-picker"
      >
        <View>
          <ThemedText style={styles.timeLabel}>Sleep Time</ThemedText>
          <ThemedText style={[styles.timeValue, { color: tintColor }]}>
            {formatTime(sleepTime)}
          </ThemedText>
          <ThemedText style={styles.dateValue}>{formatDate(sleepTime)}</ThemedText>
        </View>
        <Ionicons name="chevron-forward" size={24} color={tintColor} />
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.primaryButton, { backgroundColor: tintColor }]}
        onPress={handleSleepTimeSet}
        accessibilityRole="button"
        accessibilityLabel="Continue"
        testID="btn-sleep-time-continue"
      >
        <ThemedText style={styles.primaryButtonText}>Continue</ThemedText>
      </TouchableOpacity>

      <TouchableOpacity style={styles.backButton} onPress={isOverdueReminder ? () => setStep('options') : onClose} accessibilityRole="button" accessibilityLabel="Go back" testID="btn-sleep-time-back">
        <ThemedText style={styles.backButtonText}>{isOverdueReminder ? 'Back' : 'Cancel'}</ThemedText>
      </TouchableOpacity>
    </View>
  );

  const renderWakeTimeStep = () => (
    <View style={styles.content}>
      <Ionicons name="sunny-outline" size={50} color={tintColor} style={styles.icon} />
      <ThemedText type="title" style={styles.title}>When did you wake up?</ThemedText>

      <TouchableOpacity
        style={[styles.timeButton, { borderColor: tintColor }]}
        onPress={() => openPicker('wake')}
        accessibilityRole="button"
        accessibilityLabel="Set wake time"
        testID="btn-wake-time-picker"
      >
        <View>
          <ThemedText style={styles.timeLabel}>Wake Time</ThemedText>
          <ThemedText style={[styles.timeValue, { color: tintColor }]}>
            {formatTime(wakeTime)}
          </ThemedText>
          <ThemedText style={styles.dateValue}>{formatDate(wakeTime)}</ThemedText>
        </View>
        <Ionicons name="chevron-forward" size={24} color={tintColor} />
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.primaryButton, { backgroundColor: tintColor }]}
        onPress={handleWakeTimeSet}
        accessibilityRole="button"
        accessibilityLabel="Continue"
        testID="btn-wake-time-continue"
      >
        <ThemedText style={styles.primaryButtonText}>Continue</ThemedText>
      </TouchableOpacity>

      <TouchableOpacity style={styles.backButton} onPress={() => setStep('sleep-time')} accessibilityRole="button" accessibilityLabel="Go back" testID="btn-wake-time-back">
        <ThemedText style={styles.backButtonText}>Back</ThemedText>
      </TouchableOpacity>
    </View>
  );

  const renderConfirmStep = () => {
    const duration = getDuration();
    const isValidDuration = duration > 0 && duration < 24 * 60 * 60;

    return (
      <View style={styles.content}>
        <Ionicons name="checkmark-circle-outline" size={50} color={tintColor} style={styles.icon} />
        <ThemedText type="title" style={styles.title}>Confirm Sleep Log</ThemedText>

        <View style={styles.summaryContainer}>
          <View style={styles.summaryRow}>
            <Ionicons name="moon-outline" size={20} color={tintColor} />
            <ThemedText style={styles.summaryLabel}>Went to sleep:</ThemedText>
            <ThemedText style={styles.summaryValue}>
              {formatTime(sleepTime)} ({formatDate(sleepTime)})
            </ThemedText>
          </View>
          <View style={styles.summaryRow}>
            <Ionicons name="sunny-outline" size={20} color={tintColor} />
            <ThemedText style={styles.summaryLabel}>Woke up:</ThemedText>
            <ThemedText style={styles.summaryValue}>
              {formatTime(wakeTime)} ({formatDate(wakeTime)})
            </ThemedText>
          </View>
          <View style={[styles.summaryRow, styles.durationRow]}>
            <Ionicons name="time-outline" size={20} color={tintColor} />
            <ThemedText style={styles.summaryLabel}>Duration:</ThemedText>
            <ThemedText style={[styles.summaryValue, styles.durationValue, { color: tintColor }]}>
              {isValidDuration ? formatDuration(duration) : 'Invalid'}
            </ThemedText>
          </View>
        </View>

        {!isValidDuration && (
          <ThemedText style={styles.errorText}>
            Please check your times - wake time must be after sleep time.
          </ThemedText>
        )}

        <TouchableOpacity
          style={[
            styles.primaryButton,
            { backgroundColor: tintColor },
            (!isValidDuration || isLogging) && styles.disabledButton
          ]}
          onPress={handleConfirmSleep}
          disabled={!isValidDuration || isLogging}
          accessibilityRole="button"
          accessibilityLabel="Save sleep log"
          testID="btn-confirm-sleep"
        >
          <ThemedText style={styles.primaryButtonText}>
            {isLogging ? 'Saving...' : 'Save Sleep Log'}
          </ThemedText>
        </TouchableOpacity>

        <TouchableOpacity style={styles.backButton} onPress={() => setStep('wake-time')} accessibilityRole="button" accessibilityLabel="Go back" testID="btn-confirm-back">
          <ThemedText style={styles.backButtonText}>Back</ThemedText>
        </TouchableOpacity>
      </View>
    );
  };

  const renderSuccessStep = () => (
    <View style={styles.content}>
      <View style={styles.successIconContainer}>
        <Ionicons name="checkmark-circle" size={70} color="#34C759" />
      </View>
      <ThemedText type="title" style={styles.successTitle}>Sleep Logged</ThemedText>
      <ThemedText style={styles.successDescription}>
        {formatDuration(loggedDuration)} of sleep has been recorded
      </ThemedText>

      <TouchableOpacity
        style={[styles.primaryButton, { backgroundColor: tintColor }]}
        onPress={handleSuccessDone}
        accessibilityRole="button"
        accessibilityLabel="Done"
        testID="btn-sleep-done"
      >
        <ThemedText style={styles.primaryButtonText}>Done</ThemedText>
      </TouchableOpacity>
    </View>
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType={Platform.OS === 'web' ? 'none' : 'fade'}
      onRequestClose={handleSkip}
    >
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <TouchableOpacity style={styles.closeButton} onPress={handleSkip} testID="modal-dismiss-btn" accessibilityLabel="Dismiss" accessibilityRole="button">
            <Ionicons name="close" size={22} color="#8B939A" />
          </TouchableOpacity>
          {step === 'options' && renderOptionsStep()}
          {step === 'sleep-time' && renderSleepTimeStep()}
          {step === 'wake-time' && renderWakeTimeStep()}
          {step === 'confirm' && renderConfirmStep()}
          {step === 'success' && renderSuccessStep()}
        </View>
      </View>

      {showPicker && Platform.OS === 'android' && (
        <DateTimePicker
          value={pickerMode === 'date' ? androidTempDate : (currentPicker === 'sleep' ? sleepTime : wakeTime)}
          mode={pickerMode}
          is24Hour={false}
          display="default"
          onChange={handlePickerChange}
          maximumDate={new Date()}
        />
      )}

      {showPicker && Platform.OS === 'ios' && (
        <Modal transparent animationType="slide">
          <View style={styles.iosPickerOverlay}>
            <View style={[styles.iosPickerContainer, { backgroundColor }]}>
              <View style={styles.iosPickerHeader}>
                <TouchableOpacity onPress={() => setShowPicker(false)} accessibilityRole="button" accessibilityLabel="Cancel time picker" testID="btn-picker-cancel">
                  <ThemedText style={styles.iosPickerCancel}>Cancel</ThemedText>
                </TouchableOpacity>
                <ThemedText style={styles.iosPickerTitle}>
                  {currentPicker === 'sleep' ? 'Sleep Time' : 'Wake Time'}
                </ThemedText>
                <TouchableOpacity onPress={handleIOSPickerDone} accessibilityRole="button" accessibilityLabel="Confirm time selection" testID="btn-picker-done">
                  <ThemedText style={[styles.iosPickerDone, { color: tintColor }]}>Done</ThemedText>
                </TouchableOpacity>
              </View>
              <DateTimePicker
                value={currentPicker === 'sleep' ? sleepTime : wakeTime}
                mode="datetime"
                display="spinner"
                onChange={handlePickerChange}
                maximumDate={new Date()}
                style={styles.iosPicker}
              />
            </View>
          </View>
        </Modal>
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modal: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 8,
    padding: 24,
    paddingTop: 40,
    backgroundColor: '#0D1B2E',
    borderWidth: 1,
    borderColor: '#1a2a4a',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 10,
  },
  closeButton: {
    position: 'absolute',
    top: 12,
    right: 12,
    padding: 4,
    zIndex: 10,
  },
  content: {
    alignItems: 'center',
  },
  icon: {
    marginBottom: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 12,
  },
  description: {
    fontSize: 15,
    textAlign: 'center',
    opacity: 0.7,
    marginBottom: 24,
    lineHeight: 22,
  },
  primaryButton: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    marginBottom: 12,
  },
  primaryButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonIcon: {
    marginRight: 8,
  },
  secondaryButton: {
    width: '100%',
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 8,
  },
  secondaryButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
  tertiaryButton: {
    paddingVertical: 8,
  },
  tertiaryButtonText: {
    fontSize: 14,
    opacity: 0.6,
  },
  timeButton: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 12,
    borderWidth: 2,
    marginBottom: 24,
  },
  timeLabel: {
    fontSize: 13,
    opacity: 0.6,
    marginBottom: 4,
  },
  timeValue: {
    fontSize: 24,
    fontWeight: '700',
  },
  dateValue: {
    fontSize: 13,
    opacity: 0.7,
    marginTop: 2,
  },
  backButton: {
    paddingVertical: 8,
    marginTop: 8,
  },
  backButtonText: {
    fontSize: 15,
    opacity: 0.6,
  },
  summaryContainer: {
    width: '100%',
    backgroundColor: 'rgba(128, 128, 128, 0.1)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  summaryLabel: {
    fontSize: 14,
    opacity: 0.7,
    flex: 1,
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: '500',
  },
  durationRow: {
    marginBottom: 0,
    marginTop: 4,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(128, 128, 128, 0.2)',
  },
  durationValue: {
    fontSize: 18,
    fontWeight: '700',
  },
  errorText: {
    fontSize: 13,
    color: '#FF3B30',
    textAlign: 'center',
    marginBottom: 16,
  },
  disabledButton: {
    opacity: 0.5,
  },
  successIconContainer: {
    marginBottom: 16,
  },
  successTitle: {
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
  },
  successDescription: {
    fontSize: 16,
    textAlign: 'center',
    opacity: 0.7,
    marginBottom: 24,
  },
  iosPickerOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  iosPickerContainer: {
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    backgroundColor: '#0D1B2E',
    borderTopWidth: 1,
    borderColor: '#1a2a4a',
  },
  iosPickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(128, 128, 128, 0.2)',
  },
  iosPickerTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  iosPickerCancel: {
    fontSize: 16,
    opacity: 0.7,
  },
  iosPickerDone: {
    fontSize: 16,
    fontWeight: '600',
  },
  iosPicker: {
    height: 200,
  },
});
