import { withDatabase, isDatabaseInitialized } from './database';
import { cancelNotificationsByRelatedId } from './notifications';

export interface Schedule {
  id: number;
  schedule_type: 'supplement' | 'cognitive_test' | 'activity' | 'sleep' | 'daily_review' | 'questionnaire';
  supplement_id?: number;
  activity_id?: number;
  test_type?: string;
  time: string;
  days: string;
  start_date?: number;
  enabled: boolean;
  created_at: number;
}

export type DayOfWeek = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export const initializeSchedulesTable = async (): Promise<void> => {
  try {
    await withDatabase(
      async (db) => {
        await db.execAsync(`
          CREATE TABLE IF NOT EXISTS schedules (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            schedule_type TEXT NOT NULL CHECK (schedule_type IN ('supplement', 'cognitive_test', 'activity', 'sleep', 'daily_review', 'questionnaire')),
            supplement_id INTEGER,
            activity_id INTEGER,
            test_type TEXT,
            time TEXT NOT NULL,
            days TEXT NOT NULL,
            start_date INTEGER,
            enabled INTEGER DEFAULT 1,
            created_at INTEGER DEFAULT (strftime('%s', 'now')),
            FOREIGN KEY (supplement_id) REFERENCES supplements(id) ON DELETE CASCADE,
            FOREIGN KEY (activity_id) REFERENCES activities(id) ON DELETE CASCADE
          );
          
          CREATE INDEX IF NOT EXISTS idx_schedules_supplement_id ON schedules (supplement_id);
          CREATE INDEX IF NOT EXISTS idx_schedules_activity_id ON schedules (activity_id);
          CREATE INDEX IF NOT EXISTS idx_schedules_type ON schedules (schedule_type);
          CREATE INDEX IF NOT EXISTS idx_schedules_enabled ON schedules (enabled);
        `);
        
        try {
          await db.execAsync(`ALTER TABLE schedules ADD COLUMN start_date INTEGER;`);
        } catch (e) {
        }
      },
      'initializeSchedulesTable',
      async () => {
        console.log('Fallback mode - schedules table already available');
      }
    );
  } catch (error) {
    console.error('Failed to initialize schedules table:', error);
  }
};

export const getSupplementSchedules = async (supplementId: number): Promise<Schedule[]> => {
  if (!isDatabaseInitialized()) {
    throw new Error('Database not initialized. Please wait for app to load completely.');
  }

  if (!supplementId || supplementId <= 0) {
    throw new Error('Invalid supplement ID');
  }

  return await withDatabase(async (db) => {
    const result = await db.getAllAsync(
      'SELECT * FROM schedules WHERE supplement_id = ? AND schedule_type = ? ORDER BY time',
      [supplementId, 'supplement']
    );
    return result.map((row: any) => ({
      ...row,
      enabled: Boolean(row.enabled)
    })) as Schedule[];
  }, 'get supplement schedules');
};

export const getCognitiveTestSchedules = async (): Promise<Schedule[]> => {
  if (!isDatabaseInitialized()) {
    throw new Error('Database not initialized. Please wait for app to load completely.');
  }

  return await withDatabase(async (db) => {
    const result = await db.getAllAsync(
      'SELECT * FROM schedules WHERE schedule_type = ? ORDER BY time',
      ['cognitive_test']
    );
    return result.map((row: any) => ({
      ...row,
      enabled: Boolean(row.enabled)
    })) as Schedule[];
  }, 'get cognitive test schedules');
};

export const getActivitySchedules = async (activityId?: number): Promise<Schedule[]> => {
  if (!isDatabaseInitialized()) {
    throw new Error('Database not initialized. Please wait for app to load completely.');
  }

  return await withDatabase(async (db) => {
    let query = 'SELECT * FROM schedules WHERE schedule_type = ?';
    const params: any[] = ['activity'];
    
    if (activityId) {
      query += ' AND activity_id = ?';
      params.push(activityId);
    }
    
    query += ' ORDER BY time';
    
    const result = await db.getAllAsync(query, params);
    return result.map((row: any) => ({
      ...row,
      enabled: Boolean(row.enabled)
    })) as Schedule[];
  }, 'get activity schedules');
};

export const getSleepSchedules = async (): Promise<Schedule[]> => {
  if (!isDatabaseInitialized()) {
    throw new Error('Database not initialized. Please wait for app to load completely.');
  }

  return await withDatabase(async (db) => {
    const result = await db.getAllAsync(
      'SELECT * FROM schedules WHERE schedule_type = ? ORDER BY time',
      ['sleep']
    );
    return result.map((row: any) => ({
      ...row,
      enabled: Boolean(row.enabled)
    })) as Schedule[];
  }, 'get sleep schedules');
};

export const getDailyReviewSchedules = async (): Promise<Schedule[]> => {
  if (!isDatabaseInitialized()) {
    throw new Error('Database not initialized. Please wait for app to load completely.');
  }

  return await withDatabase(async (db) => {
    const result = await db.getAllAsync(
      'SELECT * FROM schedules WHERE schedule_type = ? ORDER BY time',
      ['daily_review']
    );
    return result.map((row: any) => ({
      ...row,
      enabled: Boolean(row.enabled)
    })) as Schedule[];
  }, 'get daily review schedules');
};

export const getQuestionnaireSchedules = async (): Promise<Schedule[]> => {
  if (!isDatabaseInitialized()) {
    throw new Error('Database not initialized. Please wait for app to load completely.');
  }

  return await withDatabase(async (db) => {
    const result = await db.getAllAsync(
      'SELECT * FROM schedules WHERE schedule_type = ? ORDER BY time',
      ['questionnaire']
    );
    return result.map((row: any) => ({
      ...row,
      enabled: Boolean(row.enabled)
    })) as Schedule[];
  }, 'get questionnaire schedules');
};

export const getAllSchedules = async (): Promise<Schedule[]> => {
  if (!isDatabaseInitialized()) {
    throw new Error('Database not initialized. Please wait for app to load completely.');
  }

  return await withDatabase(async (db) => {
    const result = await db.getAllAsync('SELECT * FROM schedules ORDER BY time');
    return result.map((row: any) => ({
      ...row,
      enabled: Boolean(row.enabled)
    })) as Schedule[];
  }, 'get all schedules');
};

export const addSchedule = async (schedule: Omit<Schedule, 'id' | 'created_at'>): Promise<number> => {
  console.log('[addSchedule] Starting with:', JSON.stringify(schedule, null, 2));
  
  if (!isDatabaseInitialized()) {
    console.log('[addSchedule] ERROR: Database not initialized');
    throw new Error('Database not initialized. Please wait for app to load completely.');
  }

  if (!schedule.time || !/^\d{2}:\d{2}$/.test(schedule.time)) {
    console.log('[addSchedule] ERROR: Invalid time format:', schedule.time);
    throw new Error('Time must be in HH:MM format');
  }

  if (!schedule.days) {
    console.log('[addSchedule] ERROR: Days not specified');
    throw new Error('Days must be specified');
  }

  try {
    const parsed = JSON.parse(schedule.days);
    if (Array.isArray(parsed)) {
      if (parsed.length === 0) {
        throw new Error('Days array must not be empty');
      }
    } else if (typeof parsed === 'object' && parsed !== null) {
      if (!('interval' in parsed) || typeof parsed.interval !== 'number' || parsed.interval < 1) {
        throw new Error('Interval must be a positive number');
      }
    } else {
      throw new Error('Days must be an array or interval object');
    }
  } catch (e) {
    if (e instanceof SyntaxError) {
      console.log('[addSchedule] ERROR: Invalid JSON in days:', schedule.days);
      throw new Error('Days must be valid JSON');
    }
    throw e;
  }

  return await withDatabase(async (db) => {
    console.log('[addSchedule] Inserting into database...');
    console.log('[addSchedule] Values:', {
      schedule_type: schedule.schedule_type,
      supplement_id: schedule.supplement_id || null,
      activity_id: schedule.activity_id || null,
      test_type: schedule.test_type || null,
      time: schedule.time,
      days: schedule.days,
      start_date: schedule.start_date || null,
      enabled: schedule.enabled ? 1 : 0
    });
    
    const result = await db.runAsync(
      'INSERT INTO schedules (schedule_type, supplement_id, activity_id, test_type, time, days, start_date, enabled) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [
        schedule.schedule_type,
        schedule.supplement_id || null,
        schedule.activity_id || null,
        schedule.test_type || null,
        schedule.time,
        schedule.days,
        schedule.start_date || null,
        schedule.enabled ? 1 : 0
      ]
    );
    console.log('[addSchedule] SUCCESS: Inserted with ID:', result.lastInsertRowId);
    return result.lastInsertRowId;
  }, 'add schedule');
};

export const updateSchedule = async (schedule: Schedule): Promise<void> => {
  if (!isDatabaseInitialized()) {
    throw new Error('Database not initialized. Please wait for app to load completely.');
  }

  if (!schedule.id || schedule.id <= 0) {
    throw new Error('Invalid schedule ID');
  }

  return await withDatabase(async (db) => {
    await db.runAsync(
      'UPDATE schedules SET schedule_type = ?, supplement_id = ?, activity_id = ?, test_type = ?, time = ?, days = ?, start_date = ?, enabled = ? WHERE id = ?',
      [
        schedule.schedule_type,
        schedule.supplement_id || null,
        schedule.activity_id || null,
        schedule.test_type || null,
        schedule.time,
        schedule.days,
        schedule.start_date || null,
        schedule.enabled ? 1 : 0,
        schedule.id
      ]
    );
  }, 'update schedule');
};

export const toggleScheduleEnabled = async (scheduleId: number, enabled: boolean): Promise<void> => {
  if (!isDatabaseInitialized()) {
    throw new Error('Database not initialized. Please wait for app to load completely.');
  }

  if (!scheduleId || scheduleId <= 0) {
    throw new Error('Invalid schedule ID');
  }

  return await withDatabase(async (db) => {
    // If disabling, cancel associated notifications
    if (!enabled) {
      try {
        // Fetch the schedule first to get its type for notification cancellation
        const schedule = await db.getFirstAsync(
          'SELECT * FROM schedules WHERE id = ?', 
          [scheduleId]
        ) as Schedule | null;
        
        if (schedule) {
          // Cancel associated notifications based on schedule type
          let notificationType: 'supplement_reminder' | 'study_protocol' | 'activity_reminder' | 'sleep_reminder' | 'daily_review_reminder';
          
          switch (schedule.schedule_type) {
            case 'supplement':
              notificationType = 'supplement_reminder';
              break;
            case 'cognitive_test':
            case 'questionnaire':
              notificationType = 'study_protocol';
              break;
            case 'activity':
              notificationType = 'activity_reminder';
              break;
            case 'sleep':
              notificationType = 'sleep_reminder';
              break;
            case 'daily_review':
              notificationType = 'daily_review_reminder';
              break;
            default:
              console.log(`Unknown schedule type for notification cancellation: ${schedule.schedule_type}`);
              notificationType = 'supplement_reminder'; // Default fallback
          }
          
          await cancelNotificationsByRelatedId(notificationType, scheduleId);
          console.log(`Cancelled ${notificationType} notifications for disabled schedule ${scheduleId}`);
        }
      } catch (notificationError) {
        console.log('Failed to cancel notifications for disabled schedule:', notificationError);
        // Continue with the update even if notification cancellation fails
      }
    }
    
    // Update the schedule enabled status
    await db.runAsync(
      'UPDATE schedules SET enabled = ? WHERE id = ?',
      [enabled ? 1 : 0, scheduleId]
    );
  }, 'toggle schedule enabled');
};

export const deleteSchedule = async (scheduleId: number): Promise<void> => {
  if (!isDatabaseInitialized()) {
    throw new Error('Database not initialized. Please wait for app to load completely.');
  }

  if (!scheduleId || scheduleId <= 0) {
    throw new Error('Invalid schedule ID');
  }

  return await withDatabase(async (db) => {
    // Fetch the schedule first to get its type for notification cancellation
    const schedule = await db.getFirstAsync(
      'SELECT * FROM schedules WHERE id = ?', 
      [scheduleId]
    ) as Schedule | null;
    
    if (schedule) {
      try {
        // Cancel associated notifications based on schedule type
        let notificationType: 'supplement_reminder' | 'study_protocol' | 'activity_reminder' | 'sleep_reminder' | 'daily_review_reminder';
        
        switch (schedule.schedule_type) {
          case 'supplement':
            notificationType = 'supplement_reminder';
            break;
          case 'cognitive_test':
          case 'questionnaire':
            notificationType = 'study_protocol';
            break;
          case 'activity':
            notificationType = 'activity_reminder';
            break;
          case 'sleep':
            notificationType = 'sleep_reminder';
            break;
          case 'daily_review':
            notificationType = 'daily_review_reminder';
            break;
          default:
            console.log(`Unknown schedule type for notification cancellation: ${schedule.schedule_type}`);
            notificationType = 'supplement_reminder'; // Default fallback
        }
        
        await cancelNotificationsByRelatedId(notificationType, scheduleId);
        console.log(`Cancelled ${notificationType} notifications for schedule ${scheduleId}`);
      } catch (notificationError) {
        console.log('Failed to cancel notifications for deleted schedule:', notificationError);
        // Continue with deletion even if notification cancellation fails
      }
    }
    
    // Delete the schedule record
    await db.runAsync('DELETE FROM schedules WHERE id = ?', [scheduleId]);
  }, 'delete schedule');
};

export const formatScheduleDays = (daysJson: string, startDate?: number): string => {
  try {
    const parsed = JSON.parse(daysJson);
    
    if (parsed && typeof parsed === 'object' && 'interval' in parsed) {
      const interval = parsed.interval;
      let intervalText = '';
      if (interval === 1) intervalText = 'Daily';
      else if (interval === 7) intervalText = 'Weekly';
      else if (interval === 14) intervalText = 'Every 2 weeks';
      else intervalText = `Every ${interval} days`;
      
      if (startDate) {
        const date = new Date(startDate * 1000);
        const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        return `${intervalText} from ${dateStr}`;
      }
      return intervalText;
    }
    
    const days: DayOfWeek[] = parsed;
    const dayNames: Record<DayOfWeek, string> = {
      mon: 'Mon',
      tue: 'Tue',
      wed: 'Wed',
      thu: 'Thu',
      fri: 'Fri',
      sat: 'Sat',
      sun: 'Sun'
    };
    
    if (days.length === 7) return 'Daily';
    if (days.length === 5 && !days.includes('sat') && !days.includes('sun')) return 'Weekdays';
    if (days.length === 2 && days.includes('sat') && days.includes('sun')) return 'Weekends';
    
    return days.map(d => dayNames[d]).join(', ');
  } catch {
    return 'Unknown';
  }
};

export const formatTime12Hour = (time24: string): string => {
  const [hours, minutes] = time24.split(':').map(Number);
  const period = hours >= 12 ? 'PM' : 'AM';
  const hours12 = hours % 12 || 12;
  return `${hours12}:${minutes.toString().padStart(2, '0')} ${period}`;
};

export interface ScheduleWithSupplement extends Schedule {
  supplement_name?: string;
  supplement_icon?: string;
  supplement_color?: string;
  activity_name?: string;
  activity_icon?: string;
  activity_color?: string;
}

export const getSchedulesWithSupplements = async (): Promise<ScheduleWithSupplement[]> => {
  if (!isDatabaseInitialized()) {
    throw new Error('Database not initialized. Please wait for app to load completely.');
  }

  return await withDatabase(async (db) => {
    const result = await db.getAllAsync(`
      SELECT 
        s.*,
        sup.name as supplement_name,
        sup.icon_id as supplement_icon,
        sup.color as supplement_color,
        act.name as activity_name,
        act.icon_id as activity_icon,
        act.color as activity_color
      FROM schedules s
      LEFT JOIN supplements sup ON s.supplement_id = sup.id
      LEFT JOIN activities act ON s.activity_id = act.id
      ORDER BY s.schedule_type, s.time
    `);
    return result.map((row: any) => ({
      ...row,
      enabled: Boolean(row.enabled)
    })) as ScheduleWithSupplement[];
  }, 'get schedules with supplements');
};
