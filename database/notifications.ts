import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform, Alert } from 'react-native';
import { withDatabase, getFallbackData, isFallbackMode } from './database';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export interface NotificationRecord {
  id: number;
  notification_id: string;
  type: 'supplement_reminder' | 'study_protocol' | 'sleep_reminder' | 'activity_reminder' | 'daily_review_reminder';
  related_id: number;
  scheduled_time: number;
  title: string;
  body: string;
  data?: string;
  created_at: number;
  cancelled: boolean;
}

export interface NotificationSettings {
  notifications_enabled: boolean;
  supplement_reminders_enabled: boolean;
  study_notifications_enabled: boolean;
  sleep_reminders_enabled: boolean;
  sleep_reminder_type: 'time_based' | 'duration_based';
  sleep_reminder_time?: string;
  sleep_reminder_hours?: number;
  bedtime_reminder_enabled: boolean;
  bedtime_reminder_time?: string;
}

const SLEEP_REMINDER_IDENTIFIER = 'sleep-reminder';
const BEDTIME_REMINDER_IDENTIFIER = 'bedtime-reminder';
const TWENTY_FOUR_HOURS_SECONDS = 24 * 60 * 60;

export const restoreScheduledNotifications = async (): Promise<number> => {
  console.log('[NOTIF RESTORE] Checking for notifications to restore...');
  
  try {
    const currentlyScheduled = await Notifications.getAllScheduledNotificationsAsync();
    const scheduledIds = new Set(currentlyScheduled.map(n => n.identifier));
    
    console.log(`[NOTIF RESTORE] Currently ${currentlyScheduled.length} notifications in system`);
    
    const pendingRecords = await getPendingNotifications();
    let restoredCount = 0;
    
    for (const record of pendingRecords) {
      if (scheduledIds.has(record.notification_id)) {
        continue;
      }
      
      const now = Math.floor(Date.now() / 1000);
      if (record.scheduled_time <= now) {
        continue;
      }
      
      try {
        const data = record.data ? JSON.parse(record.data) : {};
        const triggerDate = new Date(record.scheduled_time * 1000);
        
        await Notifications.scheduleNotificationAsync({
          content: {
            title: record.title,
            body: record.body,
            data: { type: record.type, relatedId: record.related_id, ...data },
            sound: true,
            ...(Platform.OS === 'android' && { channelId: 'default' }),
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: triggerDate,
          },
          identifier: record.notification_id,
        });
        
        restoredCount++;
        const minutesUntil = Math.round((record.scheduled_time - now) / 60);
        console.log(`[NOTIF RESTORE] Restored: ${record.title} (in ${minutesUntil} min)`);
      } catch (err) {
        console.error(`[NOTIF RESTORE] Failed to restore ${record.notification_id}:`, err);
      }
    }
    
    console.log(`[NOTIF RESTORE] Restored ${restoredCount} notifications`);
    return restoredCount;
  } catch (error) {
    console.error('[NOTIF RESTORE] Failed:', error);
    return 0;
  }
};

export const initializeNotificationsTable = async (): Promise<void> => {
  try {
    if (isFallbackMode()) {
      console.log('Fallback mode - notification tables already initialized');
      return;
    }
    
    await withDatabase(
      async (db) => {
        await db.execAsync(`
          CREATE TABLE IF NOT EXISTS notification_records (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            notification_id TEXT NOT NULL,
            type TEXT NOT NULL CHECK (type IN ('supplement_reminder', 'study_protocol', 'sleep_reminder', 'activity_reminder', 'daily_review_reminder')),
            related_id INTEGER NOT NULL,
            scheduled_time INTEGER NOT NULL,
            title TEXT NOT NULL,
            body TEXT NOT NULL,
            data TEXT,
            created_at INTEGER NOT NULL,
            cancelled INTEGER DEFAULT 0
          );
          
          CREATE TABLE IF NOT EXISTS notification_settings (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            notifications_enabled INTEGER DEFAULT 1,
            supplement_reminders_enabled INTEGER DEFAULT 1,
            study_notifications_enabled INTEGER DEFAULT 1,
            sleep_reminders_enabled INTEGER DEFAULT 1,
            sleep_reminder_type TEXT DEFAULT 'duration_based',
            sleep_reminder_time TEXT,
            sleep_reminder_hours INTEGER DEFAULT 24,
            bedtime_reminder_enabled INTEGER DEFAULT 0,
            bedtime_reminder_time TEXT DEFAULT '22:00'
          );
          
          CREATE INDEX IF NOT EXISTS idx_notification_records_type ON notification_records (type);
          CREATE INDEX IF NOT EXISTS idx_notification_records_scheduled_time ON notification_records (scheduled_time);
          CREATE INDEX IF NOT EXISTS idx_notification_records_cancelled ON notification_records (cancelled);
        `);
        
        await db.execAsync(`INSERT OR IGNORE INTO notification_settings (id) VALUES (1);`);
      },
      'initializeNotificationsTable',
      async () => {
        console.log('Fallback mode - notification tables already available');
      }
    );
  } catch (error) {
    console.error('Failed to initialize notifications table:', error);
  }
};

export const requestNotificationPermissions = async (): Promise<boolean> => {
  try {
    if (!Device.isDevice) {
      console.log('Notifications require a physical device');
      return false;
    }

    let existingStatus: string = 'undetermined';
    try {
      const result = await Notifications.getPermissionsAsync();
      existingStatus = result.status;
    } catch (permError) {
      console.log('Failed to get notification permissions:', permError);
      return false;
    }
    
    let finalStatus = existingStatus;
    
    if (existingStatus !== 'granted') {
      try {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      } catch (reqError) {
        console.log('Failed to request notification permissions:', reqError);
        return false;
      }
    }
    
    if (finalStatus !== 'granted') {
      console.log('Notification permissions not granted');
      return false;
    }

    if (Platform.OS === 'android') {
      try {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'Default',
          importance: Notifications.AndroidImportance.HIGH,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#007AFF',
        });
      } catch (channelError) {
        console.log('Failed to create default notification channel:', channelError);
      }

      try {
        await Notifications.setNotificationChannelAsync('sleep-reminders', {
          name: 'Sleep Reminders',
          description: 'Reminders to log your sleep',
          importance: Notifications.AndroidImportance.DEFAULT,
          vibrationPattern: [0, 250],
        });
      } catch (channelError) {
        console.log('Failed to create sleep-reminders notification channel:', channelError);
      }
    }

    return true;
  } catch (error) {
    console.error('Error requesting notification permissions:', error);
    return false;
  }
};

export const getNotificationSettings = async (): Promise<NotificationSettings> => {
  try {
    return await withDatabase(
      async (db) => {
        const result = await db.getFirstAsync('SELECT * FROM notification_settings WHERE id = 1');
        
        if (!result) {
          return {
            notifications_enabled: true,
            supplement_reminders_enabled: true,
            study_notifications_enabled: true,
            sleep_reminders_enabled: true,
            sleep_reminder_type: 'duration_based',
            sleep_reminder_hours: 24,
            bedtime_reminder_enabled: false,
            bedtime_reminder_time: '22:00'
          };
        }
        
        return {
          notifications_enabled: Boolean((result as any).notifications_enabled),
          supplement_reminders_enabled: Boolean((result as any).supplement_reminders_enabled),
          study_notifications_enabled: Boolean((result as any).study_notifications_enabled),
          sleep_reminders_enabled: Boolean((result as any).sleep_reminders_enabled),
          sleep_reminder_type: (result as any).sleep_reminder_type || 'duration_based',
          sleep_reminder_time: (result as any).sleep_reminder_time,
          sleep_reminder_hours: (result as any).sleep_reminder_hours || 24,
          bedtime_reminder_enabled: Boolean((result as any).bedtime_reminder_enabled),
          bedtime_reminder_time: (result as any).bedtime_reminder_time || '22:00'
        };
      },
      'getNotificationSettings',
      async () => {
        const settings = getFallbackData('notification_settings');
        const setting = settings.find((s: any) => s.id === 1);
        
        if (!setting) {
          return {
            notifications_enabled: true,
            supplement_reminders_enabled: true,
            study_notifications_enabled: true,
            sleep_reminders_enabled: true,
            sleep_reminder_type: 'duration_based',
            sleep_reminder_hours: 24,
            bedtime_reminder_enabled: false,
            bedtime_reminder_time: '22:00'
          };
        }
        
        return {
          notifications_enabled: Boolean(setting.notifications_enabled),
          supplement_reminders_enabled: Boolean(setting.supplement_reminders_enabled),
          study_notifications_enabled: Boolean(setting.study_notifications_enabled),
          sleep_reminders_enabled: Boolean(setting.sleep_reminders_enabled),
          sleep_reminder_type: setting.sleep_reminder_type || 'duration_based',
          sleep_reminder_time: setting.sleep_reminder_time,
          sleep_reminder_hours: setting.sleep_reminder_hours || 24,
          bedtime_reminder_enabled: Boolean(setting.bedtime_reminder_enabled),
          bedtime_reminder_time: setting.bedtime_reminder_time || '22:00'
        };
      }
    );
  } catch (error) {
    console.error('Failed to get notification settings:', error);
    return {
      notifications_enabled: true,
      supplement_reminders_enabled: true,
      study_notifications_enabled: true,
      sleep_reminders_enabled: true,
      sleep_reminder_type: 'duration_based',
      sleep_reminder_hours: 24,
      bedtime_reminder_enabled: false,
      bedtime_reminder_time: '22:00'
    };
  }
};

export const updateNotificationSettings = async (settings: Partial<NotificationSettings>): Promise<void> => {
  try {
    await withDatabase(
      async (db) => {
        const updateFields = [];
        const params = [];
        
        if (settings.notifications_enabled !== undefined) {
          updateFields.push('notifications_enabled = ?');
          params.push(settings.notifications_enabled ? 1 : 0);
        }
        
        if (settings.supplement_reminders_enabled !== undefined) {
          updateFields.push('supplement_reminders_enabled = ?');
          params.push(settings.supplement_reminders_enabled ? 1 : 0);
        }
        
        if (settings.study_notifications_enabled !== undefined) {
          updateFields.push('study_notifications_enabled = ?');
          params.push(settings.study_notifications_enabled ? 1 : 0);
        }
        
        if (settings.sleep_reminders_enabled !== undefined) {
          updateFields.push('sleep_reminders_enabled = ?');
          params.push(settings.sleep_reminders_enabled ? 1 : 0);
        }
        
        if (settings.sleep_reminder_type !== undefined) {
          updateFields.push('sleep_reminder_type = ?');
          params.push(settings.sleep_reminder_type);
        }
        
        if (settings.sleep_reminder_time !== undefined) {
          updateFields.push('sleep_reminder_time = ?');
          params.push(settings.sleep_reminder_time);
        }
        
        if (settings.sleep_reminder_hours !== undefined) {
          updateFields.push('sleep_reminder_hours = ?');
          params.push(settings.sleep_reminder_hours);
        }
        
        if (settings.bedtime_reminder_enabled !== undefined) {
          updateFields.push('bedtime_reminder_enabled = ?');
          params.push(settings.bedtime_reminder_enabled ? 1 : 0);
        }
        
        if (settings.bedtime_reminder_time !== undefined) {
          updateFields.push('bedtime_reminder_time = ?');
          params.push(settings.bedtime_reminder_time);
        }
        
        if (updateFields.length > 0) {
          await db.runAsync(
            `UPDATE notification_settings SET ${updateFields.join(', ')} WHERE id = 1`,
            params
          );
        }
      },
      'updateNotificationSettings',
      async () => {
        const settingsData = getFallbackData('notification_settings');
        const existingSettings = settingsData.find((s: any) => s.id === 1);
        
        if (existingSettings) {
          if (settings.notifications_enabled !== undefined) {
            existingSettings.notifications_enabled = settings.notifications_enabled ? 1 : 0;
          }
          if (settings.supplement_reminders_enabled !== undefined) {
            existingSettings.supplement_reminders_enabled = settings.supplement_reminders_enabled ? 1 : 0;
          }
          if (settings.study_notifications_enabled !== undefined) {
            existingSettings.study_notifications_enabled = settings.study_notifications_enabled ? 1 : 0;
          }
          if (settings.sleep_reminders_enabled !== undefined) {
            existingSettings.sleep_reminders_enabled = settings.sleep_reminders_enabled ? 1 : 0;
          }
          if (settings.sleep_reminder_type !== undefined) {
            existingSettings.sleep_reminder_type = settings.sleep_reminder_type;
          }
          if (settings.sleep_reminder_time !== undefined) {
            existingSettings.sleep_reminder_time = settings.sleep_reminder_time;
          }
          if (settings.sleep_reminder_hours !== undefined) {
            existingSettings.sleep_reminder_hours = settings.sleep_reminder_hours;
          }
          if (settings.bedtime_reminder_enabled !== undefined) {
            existingSettings.bedtime_reminder_enabled = settings.bedtime_reminder_enabled ? 1 : 0;
          }
          if (settings.bedtime_reminder_time !== undefined) {
            existingSettings.bedtime_reminder_time = settings.bedtime_reminder_time;
          }
        }
      }
    );
  } catch (error) {
    console.error('Failed to update notification settings:', error);
  }
};

export const scheduleSleepReminder = async (): Promise<string | null> => {
  try {
    const settings = await getNotificationSettings();
    
    if (!settings.notifications_enabled || !settings.sleep_reminders_enabled) {
      console.log('Sleep reminders are disabled');
      return null;
    }

    const hasPermission = await requestNotificationPermissions();
    if (!hasPermission) {
      console.log('No notification permissions for sleep reminder');
      return null;
    }

    await cancelSleepReminder();

    const triggerDate = new Date(Date.now() + TWENTY_FOUR_HOURS_SECONDS * 1000);

    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Log your sleep',
        body: "Don't forget to log your sleep for accurate tracking",
        data: { type: 'sleep_reminder', action: 'open_sleep_prompt' },
        sound: true,
        ...(Platform.OS === 'android' && { channelId: 'sleep-reminders' }),
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: triggerDate,
      },
      identifier: SLEEP_REMINDER_IDENTIFIER,
    });

    console.log(`Sleep reminder scheduled for ${triggerDate.toLocaleString()}`);

    await saveNotificationRecord(
      notificationId,
      'sleep_reminder',
      0,
      Math.floor(Date.now() / 1000) + triggerSeconds,
      'Log your sleep',
      "Don't forget to log your sleep for accurate tracking"
    );

    return notificationId;
  } catch (error) {
    console.error('Failed to schedule sleep reminder:', error);
    return null;
  }
};

export const cancelSleepReminder = async (): Promise<void> => {
  try {
    try {
      await Notifications.cancelScheduledNotificationAsync(SLEEP_REMINDER_IDENTIFIER);
      console.log('Sleep reminder cancelled');
    } catch (cancelError) {
      console.log('Failed to cancel sleep reminder notification (may not exist):', cancelError);
    }

    await withDatabase(
      async (db) => {
        await db.runAsync(
          "UPDATE notification_records SET cancelled = 1 WHERE type = 'sleep_reminder' AND cancelled = 0",
          []
        );
      },
      'cancelSleepReminder',
      async () => {}
    );
  } catch (error) {
    console.error('Failed to cancel sleep reminder:', error);
  }
};

export const rescheduleSleepReminder = async (): Promise<string | null> => {
  await cancelSleepReminder();
  return await scheduleSleepReminder();
};

export const scheduleBedtimeReminder = async (): Promise<string | null> => {
  try {
    const settings = await getNotificationSettings();
    
    if (!settings.notifications_enabled || !settings.bedtime_reminder_enabled) {
      console.log('Bedtime reminders are disabled');
      return null;
    }

    if (!settings.bedtime_reminder_time) {
      console.log('No bedtime reminder time set');
      return null;
    }

    const hasPermission = await requestNotificationPermissions();
    if (!hasPermission) {
      console.log('No notification permissions for bedtime reminder');
      return null;
    }

    await cancelBedtimeReminder();

    const [hours, minutes] = settings.bedtime_reminder_time.split(':').map(Number);
    
    const now = new Date();
    const targetTime = new Date();
    targetTime.setHours(hours, minutes, 0, 0);
    
    if (targetTime <= now) {
      targetTime.setDate(targetTime.getDate() + 1);
    }
    
    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Time for bed!',
        body: "Don't forget to log your sleep tomorrow morning.",
        data: { type: 'bedtime_reminder', action: 'open_sleep_prompt' },
        sound: true,
        ...(Platform.OS === 'android' && { channelId: 'sleep-reminders' }),
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: targetTime,
      },
      identifier: BEDTIME_REMINDER_IDENTIFIER,
    });

    console.log(`Bedtime reminder scheduled for ${targetTime.toLocaleTimeString()} (in ${Math.round(triggerSeconds / 60)} minutes)`);

    await saveNotificationRecord(
      notificationId,
      'sleep_reminder',
      0,
      Math.floor(targetTime.getTime() / 1000),
      'Time for bed!',
      "Don't forget to log your sleep tomorrow morning."
    );

    return notificationId;
  } catch (error) {
    console.error('Failed to schedule bedtime reminder:', error);
    return null;
  }
};

export const cancelBedtimeReminder = async (): Promise<void> => {
  try {
    try {
      await Notifications.cancelScheduledNotificationAsync(BEDTIME_REMINDER_IDENTIFIER);
      console.log('Bedtime reminder cancelled');
    } catch (cancelError) {
      console.log('Failed to cancel bedtime reminder notification (may not exist):', cancelError);
    }
  } catch (error) {
    console.error('Failed to cancel bedtime reminder:', error);
  }
};

export const rescheduleBedtimeReminder = async (): Promise<string | null> => {
  await cancelBedtimeReminder();
  return await scheduleBedtimeReminder();
};

export const scheduleNotification = async (
  type: NotificationRecord['type'],
  relatedId: number,
  scheduledTime: number,
  title: string,
  body: string,
  data?: any
): Promise<string | null> => {
  console.log('[NOTIF DEBUG] scheduleNotification called:', { type, relatedId, scheduledTime, title });
  
  try {
    const settings = await getNotificationSettings();
    console.log('[NOTIF DEBUG] Settings:', JSON.stringify(settings));
    
    if (!settings.notifications_enabled) {
      console.log('[NOTIF DEBUG] BLOCKED: Notifications are disabled in settings');
      return null;
    }

    if (type === 'supplement_reminder' && !settings.supplement_reminders_enabled) {
      console.log('[NOTIF DEBUG] BLOCKED: Supplement reminders are disabled');
      return null;
    }

    if (type === 'study_protocol' && !settings.study_notifications_enabled) {
      console.log('[NOTIF DEBUG] BLOCKED: Study notifications are disabled');
      return null;
    }

    const hasPermission = await requestNotificationPermissions();
    console.log('[NOTIF DEBUG] Permission result:', hasPermission);
    if (!hasPermission) {
      console.log('[NOTIF DEBUG] BLOCKED: No permission');
      Alert.alert('Notification Debug', 'BLOCKED: No notification permission granted');
      return null;
    }

    const now = Math.floor(Date.now() / 1000);
    const triggerSeconds = scheduledTime - now;
    console.log('[NOTIF DEBUG] Timing:', { now, scheduledTime, triggerSeconds, triggerMinutes: triggerSeconds / 60 });

    if (triggerSeconds <= 0) {
      console.log('[NOTIF DEBUG] BLOCKED: Scheduled time is in the past');
      Alert.alert('Notification Debug', `BLOCKED: Scheduled time is in the past (${triggerSeconds}s ago)`);
      return null;
    }

    const triggerDate = new Date(scheduledTime * 1000);
    const trigger = {
      type: Notifications.SchedulableTriggerInputTypes.DATE as const,
      date: triggerDate,
    };
    
    const content = {
      title,
      body,
      data: { type, relatedId, ...data },
      sound: true,
      ...(Platform.OS === 'android' && { channelId: 'default' }),
    };
    
    console.log('[NOTIF DEBUG] Scheduling with trigger:', JSON.stringify(trigger));
    console.log('[NOTIF DEBUG] Content:', JSON.stringify(content));

    let notificationId: string;
    try {
      notificationId = await Notifications.scheduleNotificationAsync({
        content,
        trigger,
      });
      console.log('[NOTIF DEBUG] scheduleNotificationAsync returned ID:', notificationId);
    } catch (scheduleError: any) {
      console.error('[NOTIF DEBUG] scheduleNotificationAsync THREW:', scheduleError);
      Alert.alert('Notification Schedule Error', `scheduleNotificationAsync threw: ${scheduleError?.message || scheduleError}`);
      return null;
    }

    const scheduledList = await Notifications.getAllScheduledNotificationsAsync();
    console.log('[NOTIF DEBUG] After scheduling, total scheduled notifications:', scheduledList.length);
    const justScheduled = scheduledList.find(n => n.identifier === notificationId);
    if (justScheduled) {
      console.log('[NOTIF DEBUG] VERIFIED: Notification found in scheduled list');
      console.log('[NOTIF DEBUG] Trigger details:', JSON.stringify(justScheduled.trigger));
    } else {
      console.log('[NOTIF DEBUG] WARNING: Notification NOT found in scheduled list!');
      Alert.alert('Notification Debug', `WARNING: Notification ${notificationId} was returned but NOT found in getAllScheduledNotificationsAsync()`);
    }
    
    const scheduledDate = new Date(scheduledTime * 1000);
    console.log(`[NOTIF DEBUG] Notification "${title}" scheduled for ${scheduledDate.toLocaleString()} (in ${Math.round(triggerSeconds / 60)} minutes)`);

    await saveNotificationRecord(notificationId, type, relatedId, scheduledTime, title, body, data);

    return notificationId;
  } catch (error: any) {
    console.error('[NOTIF DEBUG] FAILED to schedule notification:', error);
    Alert.alert('Notification Error', `Failed to schedule: ${error?.message || error}`);
    return null;
  }
};

const saveNotificationRecord = async (
  notificationId: string,
  type: NotificationRecord['type'],
  relatedId: number,
  scheduledTime: number,
  title: string,
  body: string,
  data?: any
): Promise<void> => {
  try {
    await withDatabase(
      async (db) => {
        await db.runAsync(
          `INSERT INTO notification_records (notification_id, type, related_id, scheduled_time, title, body, data, created_at, cancelled)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
          [notificationId, type, relatedId, scheduledTime, title, body, data ? JSON.stringify(data) : null, Math.floor(Date.now() / 1000)]
        );
      },
      'saveNotificationRecord',
      async () => {}
    );
  } catch (error) {
    console.error('Failed to save notification record:', error);
  }
};

export const cancelNotificationsByRelatedId = async (type: NotificationRecord['type'], relatedId: number): Promise<void> => {
  try {
    const records = await withDatabase(
      async (db) => {
        return await db.getAllAsync(
          'SELECT notification_id FROM notification_records WHERE type = ? AND related_id = ? AND cancelled = 0',
          [type, relatedId]
        );
      },
      'cancelNotificationsByRelatedId',
      async () => []
    );

    for (const record of records as any[]) {
      try {
        await Notifications.cancelScheduledNotificationAsync(record.notification_id);
      } catch (e) {
        console.log('Failed to cancel notification:', record.notification_id);
      }
    }

    await withDatabase(
      async (db) => {
        await db.runAsync(
          'UPDATE notification_records SET cancelled = 1 WHERE type = ? AND related_id = ? AND cancelled = 0',
          [type, relatedId]
        );
      },
      'cancelNotificationsByRelatedId-update',
      async () => {}
    );

    console.log(`Cancelled ${records.length} notifications for ${type} with relatedId ${relatedId}`);
  } catch (error) {
    console.error('Failed to cancel notifications by related id:', error);
  }
};

export const cancelAllNotifications = async (): Promise<void> => {
  try {
    try {
      await Notifications.cancelAllScheduledNotificationsAsync();
      console.log('All notifications cancelled');
    } catch (cancelError) {
      console.log('Failed to cancel all scheduled notifications:', cancelError);
    }
    
    await withDatabase(
      async (db) => {
        await db.runAsync('UPDATE notification_records SET cancelled = 1 WHERE cancelled = 0', []);
      },
      'cancelAllNotifications',
      async () => {}
    );
  } catch (error) {
    console.error('Failed to cancel all notifications:', error);
  }
};

export const getPendingNotifications = async (): Promise<NotificationRecord[]> => {
  try {
    return await withDatabase(
      async (db) => {
        const now = Math.floor(Date.now() / 1000);
        const result = await db.getAllAsync(
          'SELECT * FROM notification_records WHERE cancelled = 0 AND scheduled_time > ? ORDER BY scheduled_time ASC',
          [now]
        );
        return result as NotificationRecord[];
      },
      'getPendingNotifications',
      async () => []
    );
  } catch (error) {
    console.error('Failed to get pending notifications:', error);
    return [];
  }
};

export const cleanupOldNotificationRecords = async (): Promise<void> => {
  try {
    const sevenDaysAgo = Math.floor(Date.now() / 1000) - (7 * 24 * 60 * 60);
    
    await withDatabase(
      async (db) => {
        await db.runAsync(
          'DELETE FROM notification_records WHERE created_at < ? AND (cancelled = 1 OR scheduled_time < ?)',
          [sevenDaysAgo, sevenDaysAgo]
        );
        
        console.log('Cleaned up old notification records');
      },
      'cleanupOldNotificationRecords',
      async () => {
        const records = getFallbackData('notification_records');
        const filteredRecords = records.filter((record: any) => {
          return !(record.created_at < sevenDaysAgo && (record.cancelled || record.scheduled_time < sevenDaysAgo));
        });
        
        records.length = 0;
        records.push(...filteredRecords);
        
        console.log('Cleaned up old notification records (fallback mode)');
      }
    );
  } catch (error) {
    console.error('Failed to cleanup old notification records:', error);
  }
};

export const sendTestNotification = async (): Promise<void> => {
  console.log('[NOTIF DEBUG] sendTestNotification called (2 second delay)');
  try {
    const hasPermission = await requestNotificationPermissions();
    console.log('[NOTIF DEBUG] Test notification permission:', hasPermission);
    if (!hasPermission) {
      throw new Error('Notification permissions not granted');
    }

    const triggerDate = new Date(Date.now() + 2000);
    const trigger = {
      type: Notifications.SchedulableTriggerInputTypes.DATE as const,
      date: triggerDate,
    };
    
    console.log('[NOTIF DEBUG] Test notification trigger:', JSON.stringify(trigger));

    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Test Notification',
        body: 'This is a test notification from GrayMeter',
        sound: true,
        ...(Platform.OS === 'android' && { channelId: 'default' }),
      },
      trigger,
    });
    
    console.log('[NOTIF DEBUG] Test notification scheduled! ID:', notificationId);
  } catch (error) {
    console.error('[NOTIF DEBUG] Failed to send test notification:', error);
    throw error;
  }
};

export const sendDelayedTestNotification = async (delaySeconds: number = 10): Promise<{ success: boolean; message: string; notificationId?: string }> => {
  console.log(`[NOTIF DEBUG] sendDelayedTestNotification called (${delaySeconds} second delay)`);
  
  try {
    const permissionStatus = await Notifications.getPermissionsAsync();
    console.log('[NOTIF DEBUG] Current permission status:', JSON.stringify(permissionStatus));
    
    if (permissionStatus.status !== 'granted') {
      const requestResult = await Notifications.requestPermissionsAsync();
      console.log('[NOTIF DEBUG] Permission request result:', JSON.stringify(requestResult));
      
      if (requestResult.status !== 'granted') {
        return { 
          success: false, 
          message: `Permission denied. Status: ${requestResult.status}` 
        };
      }
    }

    if (Platform.OS === 'android') {
      const channels = await Notifications.getNotificationChannelsAsync();
      console.log('[NOTIF DEBUG] Android notification channels:', JSON.stringify(channels.map(c => ({ id: c.id, name: c.name, importance: c.importance }))));
    }

    const scheduledNotifications = await Notifications.getAllScheduledNotificationsAsync();
    console.log('[NOTIF DEBUG] Currently scheduled notifications:', scheduledNotifications.length);

    const fireTime = new Date(Date.now() + delaySeconds * 1000);
    const trigger = {
      type: Notifications.SchedulableTriggerInputTypes.DATE as const,
      date: fireTime,
    };
    
    console.log('[NOTIF DEBUG] Scheduling test for:', fireTime.toLocaleTimeString());

    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title: `Test (${delaySeconds}s delay)`,
        body: `Scheduled at ${new Date().toLocaleTimeString()}, should fire at ${fireTime.toLocaleTimeString()}`,
        sound: true,
        ...(Platform.OS === 'android' && { channelId: 'default' }),
      },
      trigger,
    });
    
    console.log('[NOTIF DEBUG] Test notification ID:', notificationId);
    
    const updatedScheduled = await Notifications.getAllScheduledNotificationsAsync();
    console.log('[NOTIF DEBUG] Scheduled notifications after:', updatedScheduled.length);
    
    return { 
      success: true, 
      message: `Notification scheduled for ${fireTime.toLocaleTimeString()} (ID: ${notificationId.substring(0, 8)}...)`,
      notificationId 
    };
  } catch (error) {
    console.error('[NOTIF DEBUG] sendDelayedTestNotification failed:', error);
    return { 
      success: false, 
      message: `Error: ${error instanceof Error ? error.message : String(error)}` 
    };
  }
};

export const getNotificationDebugInfo = async (): Promise<{
  permissionStatus: string;
  isDevice: boolean;
  platform: string;
  scheduledCount: number;
  channels: { id: string; name: string; importance: number }[];
  settings: NotificationSettings;
}> => {
  try {
    const permResult = await Notifications.getPermissionsAsync();
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    const settings = await getNotificationSettings();
    
    let channels: { id: string; name: string; importance: number }[] = [];
    if (Platform.OS === 'android') {
      const androidChannels = await Notifications.getNotificationChannelsAsync();
      channels = androidChannels.map(c => ({ 
        id: c.id, 
        name: c.name || 'Unknown', 
        importance: c.importance as number
      }));
    }
    
    return {
      permissionStatus: permResult.status,
      isDevice: Device.isDevice,
      platform: Platform.OS,
      scheduledCount: scheduled.length,
      channels,
      settings
    };
  } catch (error) {
    console.error('[NOTIF DEBUG] getNotificationDebugInfo failed:', error);
    throw error;
  }
};

export const listScheduledNotifications = async (): Promise<{ id: string; title: string; trigger: any }[]> => {
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    return scheduled.map(n => ({
      id: n.identifier,
      title: n.content.title || 'No title',
      trigger: n.trigger
    }));
  } catch (error) {
    console.error('[NOTIF DEBUG] listScheduledNotifications failed:', error);
    return [];
  }
};

export const getNotificationStats = async (): Promise<{
  pending: number;
  cancelled: number;
  total: number;
}> => {
  try {
    return await withDatabase(
      async (db) => {
        const now = Math.floor(Date.now() / 1000);
        
        const pendingResult = await db.getFirstAsync(
          'SELECT COUNT(*) as count FROM notification_records WHERE cancelled = 0 AND scheduled_time > ?',
          [now]
        ) as any;
        
        const cancelledResult = await db.getFirstAsync(
          'SELECT COUNT(*) as count FROM notification_records WHERE cancelled = 1'
        ) as any;
        
        const totalResult = await db.getFirstAsync(
          'SELECT COUNT(*) as count FROM notification_records'
        ) as any;
        
        return {
          pending: pendingResult?.count || 0,
          cancelled: cancelledResult?.count || 0,
          total: totalResult?.count || 0,
        };
      },
      'getNotificationStats',
      async () => ({ pending: 0, cancelled: 0, total: 0 })
    );
  } catch (error) {
    console.error('Failed to get notification stats:', error);
    return { pending: 0, cancelled: 0, total: 0 };
  }
};

export const addNotificationResponseListener = (
  callback: (response: Notifications.NotificationResponse) => void
): Notifications.EventSubscription => {
  return Notifications.addNotificationResponseReceivedListener(callback);
};

export const addNotificationReceivedListener = (
  callback: (notification: Notifications.Notification) => void
): Notifications.EventSubscription => {
  return Notifications.addNotificationReceivedListener(callback);
};
