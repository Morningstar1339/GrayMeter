import { withDatabase, isDatabaseInitialized } from './database';

export interface Supplement {
  id: number;
  name: string;
  default_dosage: number;
  dosage_unit: string;
  icon_id?: string;
  color?: string;
  schedule_enabled: boolean;
  study_enabled: boolean;
  substance_profile_id?: string;
}

export interface SupplementLog {
  id: number;
  supplement_id: number;
  timestamp: number;
  dosage: number;
  notes?: string;
}

export interface Exclusion {
  id: number;
  supplement_id: number;
  exclusion_type: 'time_window' | 'dosage_limit';
  parameters: string; // JSON string
}

export interface StudyProtocol {
  id: number;
  supplement_id?: number;
  test_type: 'reflexes' | 'memory' | 'judgment';
  interval_minutes: number;
  duration_minutes: number;
  schedule_type: 'event_based' | 'daily_schedule';
  parameters?: string; // JSON string
}

export interface TimeWindowParams {
  start_time: string; // HH:MM format
  end_time: string; // HH:MM format
}

export interface DosageLimitParams {
  max_dosage: number;
  time_window_hours: number;
}

export const getAllSupplements = async (): Promise<Supplement[]> => {
  console.log('[getAllSupplements] Starting...');
  if (!isDatabaseInitialized()) {
    console.log('[getAllSupplements] ERROR: Database not initialized');
    throw new Error('Database not initialized. Please wait for app to load completely.');
  }
  
  return await withDatabase(async (db) => {
    console.log('[getAllSupplements] Querying database...');
    const result = await db.getAllAsync('SELECT * FROM supplements ORDER BY name');
    console.log('[getAllSupplements] Raw result count:', result.length);
    if (result.length > 0) {
      console.log('[getAllSupplements] First result:', JSON.stringify(result[0]));
    }
    const mapped = result.map((row: any) => ({
      ...row,
      schedule_enabled: Boolean(row.schedule_enabled),
      study_enabled: Boolean(row.study_enabled)
    })) as Supplement[];
    console.log('[getAllSupplements] Returning', mapped.length, 'supplements');
    return mapped;
  }, 'get all supplements');
};

export const checkSupplementExists = async (name: string): Promise<boolean> => {
  if (!isDatabaseInitialized()) {
    throw new Error('Database not initialized. Please wait for app to load completely.');
  }
  
  if (!name || name.trim().length === 0) {
    throw new Error('Supplement name cannot be empty');
  }
  
  return await withDatabase(async (db) => {
    const result = await db.getFirstAsync('SELECT id FROM supplements WHERE LOWER(name) = LOWER(?)', [name.trim()]);
    return result !== null;
  }, 'check supplement exists');
};

export const addSupplement = async (supplement: Omit<Supplement, 'id'>): Promise<number> => {
  if (!isDatabaseInitialized()) {
    throw new Error('Database not initialized. Please wait for app to load completely.');
  }
  
  // Input validation
  if (!supplement.name || supplement.name.trim().length === 0) {
    throw new Error('Supplement name cannot be empty');
  }
  
  if (supplement.default_dosage <= 0) {
    throw new Error('Default dosage must be greater than 0');
  }
  
  if (!supplement.dosage_unit || supplement.dosage_unit.trim().length === 0) {
    throw new Error('Dosage unit cannot be empty');
  }
  
  // Validate color format if provided
  if (supplement.color && !/^#[0-9A-Fa-f]{6}$/.test(supplement.color)) {
    throw new Error('Color must be in hex format (e.g., #007AFF)');
  }
  
  return await withDatabase(async (db) => {
    try {
      // Check if supplement already exists
      const existing = await db.getFirstAsync('SELECT id FROM supplements WHERE LOWER(name) = LOWER(?)', [supplement.name.trim()]);
      if (existing) {
        throw new Error(`A supplement named "${supplement.name}" already exists`);
      }
      
      const result = await db.runAsync(
        'INSERT INTO supplements (name, default_dosage, dosage_unit, icon_id, color, schedule_enabled, study_enabled, substance_profile_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [
          supplement.name.trim(),
          supplement.default_dosage,
          supplement.dosage_unit.trim(),
          supplement.icon_id || null,
          supplement.color || '#007AFF',
          supplement.schedule_enabled ? 1 : 0,
          supplement.study_enabled ? 1 : 0,
          supplement.substance_profile_id || null
        ]
      );
      
      if (!result.lastInsertRowId) {
        throw new Error('Failed to add supplement: No ID returned');
      }
      
      return result.lastInsertRowId;
    } catch (error) {
      if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
        throw new Error(`A supplement named "${supplement.name}" already exists`);
      }
      throw error;
    }
  }, 'add supplement');
};

export const updateSupplement = async (supplement: Supplement): Promise<void> => {
  if (!isDatabaseInitialized()) {
    throw new Error('Database not initialized. Please wait for app to load completely.');
  }
  
  // Input validation
  if (!supplement.id || supplement.id <= 0) {
    throw new Error('Invalid supplement ID');
  }
  
  if (!supplement.name || supplement.name.trim().length === 0) {
    throw new Error('Supplement name cannot be empty');
  }
  
  if (supplement.default_dosage <= 0) {
    throw new Error('Default dosage must be greater than 0');
  }
  
  if (!supplement.dosage_unit || supplement.dosage_unit.trim().length === 0) {
    throw new Error('Dosage unit cannot be empty');
  }
  
  return await withDatabase(async (db) => {
    // Verify supplement exists
    const existing = await db.getFirstAsync('SELECT id FROM supplements WHERE id = ?', [supplement.id]);
    if (!existing) {
      throw new Error('Supplement not found');
    }
    
    const result = await db.runAsync(
      'UPDATE supplements SET name = ?, default_dosage = ?, dosage_unit = ?, icon_id = ?, color = ?, schedule_enabled = ?, study_enabled = ?, substance_profile_id = ? WHERE id = ?',
      [
        supplement.name.trim(),
        supplement.default_dosage,
        supplement.dosage_unit.trim(),
        supplement.icon_id || null,
        supplement.color || '#007AFF',
        supplement.schedule_enabled ? 1 : 0,
        supplement.study_enabled ? 1 : 0,
        supplement.substance_profile_id || null,
        supplement.id
      ]
    );
    
    if (result.changes === 0) {
      throw new Error('No supplement was updated');
    }
  }, 'update supplement');
};

export const logSupplement = async (supplementId: number, dosage: number, notes?: string, timestamp?: number): Promise<number> => {
  if (!isDatabaseInitialized()) {
    throw new Error('Database not initialized. Please wait for app to load completely.');
  }
  
  // Input validation
  if (!supplementId || supplementId <= 0) {
    throw new Error('Invalid supplement ID');
  }
  
  if (dosage <= 0) {
    throw new Error('Dosage must be greater than 0');
  }
  
  // Validate notes length if provided
  if (notes && notes.length > 1000) {
    throw new Error('Notes must be less than 1000 characters');
  }
  
  return await withDatabase(async (db) => {
    // Verify supplement exists
    const supplement = await db.getFirstAsync('SELECT id FROM supplements WHERE id = ?', [supplementId]);
    if (!supplement) {
      throw new Error('Supplement not found');
    }
    
    const finalTimestamp = timestamp || Math.floor(Date.now() / 1000); // Unix timestamp in seconds
    
    const result = await db.runAsync(
      'INSERT INTO supplement_logs (supplement_id, timestamp, dosage, notes) VALUES (?, ?, ?, ?)',
      [supplementId, finalTimestamp, dosage, notes?.trim() || null]
    );
    
    if (!result.lastInsertRowId) {
      throw new Error('Failed to save supplement log: No ID returned');
    }
    
    return result.lastInsertRowId;
  }, 'log supplement');
};

export const getSupplementLogs = async (supplementId?: number, limit?: number): Promise<SupplementLog[]> => {
  if (!isDatabaseInitialized()) {
    throw new Error('Database not initialized. Please wait for app to load completely.');
  }
  
  return await withDatabase(async (db) => {
    let query = 'SELECT * FROM supplement_logs';
    const params: any[] = [];
    
    if (supplementId) {
      // Validate supplementId
      if (supplementId <= 0) {
        throw new Error('Invalid supplement ID');
      }
      query += ' WHERE supplement_id = ?';
      params.push(supplementId);
    }
    
    query += ' ORDER BY timestamp DESC';
    
    if (limit) {
      if (limit <= 0) {
        throw new Error('Limit must be greater than 0');
      }
      query += ' LIMIT ?';
      params.push(limit);
    }
    
    const result = await db.getAllAsync(query, params);
    return result as SupplementLog[];
  }, 'get supplement logs');
};

export interface SupplementLogWithDetails extends SupplementLog {
  supplement_name: string;
  dosage_unit: string;
  icon_id?: string;
  color?: string;
}

export const getSupplementLogsWithDetails = async (limit?: number): Promise<SupplementLogWithDetails[]> => {
  if (!isDatabaseInitialized()) {
    throw new Error('Database not initialized. Please wait for app to load completely.');
  }
  
  return await withDatabase(async (db) => {
    let query = `
      SELECT 
        sl.id, sl.supplement_id, sl.timestamp, sl.dosage, sl.notes,
        s.name as supplement_name, s.dosage_unit, s.icon_id, s.color
      FROM supplement_logs sl
      JOIN supplements s ON sl.supplement_id = s.id
      ORDER BY sl.timestamp DESC
    `;
    const params: any[] = [];
    
    if (limit && limit > 0) {
      query += ' LIMIT ?';
      params.push(limit);
    }
    
    const result = await db.getAllAsync(query, params);
    return result as SupplementLogWithDetails[];
  }, 'get supplement logs with details');
};

export const deleteSupplementLog = async (logId: number): Promise<void> => {
  if (!isDatabaseInitialized()) {
    throw new Error('Database not initialized. Please wait for app to load completely.');
  }
  
  if (!logId || logId <= 0) {
    throw new Error('Invalid log ID');
  }
  
  return await withDatabase(async (db) => {
    const result = await db.runAsync('DELETE FROM supplement_logs WHERE id = ?', [logId]);
    if (result.changes === 0) {
      throw new Error('Log entry not found');
    }
  }, 'delete supplement log');
};

// Exclusion Management Functions

export const getSupplementExclusions = async (supplementId: number): Promise<Exclusion[]> => {
  if (!isDatabaseInitialized()) {
    throw new Error('Database not initialized. Please wait for app to load completely.');
  }
  
  if (!supplementId || supplementId <= 0) {
    throw new Error('Invalid supplement ID');
  }
  
  return await withDatabase(async (db) => {
    const result = await db.getAllAsync('SELECT * FROM exclusions WHERE supplement_id = ?', [supplementId]);
    return result as Exclusion[];
  }, 'get supplement exclusions');
};

export const addExclusion = async (exclusion: Omit<Exclusion, 'id'>): Promise<number> => {
  return await withDatabase(async (db) => {
    const result = await db.runAsync(
      'INSERT INTO exclusions (supplement_id, exclusion_type, parameters) VALUES (?, ?, ?)',
      [exclusion.supplement_id, exclusion.exclusion_type, exclusion.parameters]
    );
    return result.lastInsertRowId;
  }, 'add exclusion');
};

export const updateExclusion = async (exclusion: Exclusion): Promise<void> => {
  return await withDatabase(async (db) => {
    await db.runAsync(
      'UPDATE exclusions SET exclusion_type = ?, parameters = ? WHERE id = ?',
      [exclusion.exclusion_type, exclusion.parameters, exclusion.id]
    );
  }, 'update exclusion');
};

export const deleteExclusion = async (exclusionId: number): Promise<void> => {
  return await withDatabase(async (db) => {
    await db.runAsync('DELETE FROM exclusions WHERE id = ?', [exclusionId]);
  }, 'delete exclusion');
};

export const checkTimeWindowExclusion = (params: TimeWindowParams): boolean => {
  const now = new Date();
  const currentTime = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');
  
  const startTime = params.start_time;
  const endTime = params.end_time;
  
  // Handle overnight exclusions (e.g., 22:00 to 06:00)
  if (startTime > endTime) {
    return currentTime >= startTime || currentTime <= endTime;
  } else {
    return currentTime >= startTime && currentTime <= endTime;
  }
};

export const checkDosageLimitExclusion = async (supplementId: number, params: DosageLimitParams, proposedDosage: number): Promise<boolean> => {
  if (!isDatabaseInitialized()) {
    throw new Error('Database not initialized. Please wait for app to load completely.');
  }
  
  if (!supplementId || supplementId <= 0) {
    throw new Error('Invalid supplement ID');
  }
  
  if (proposedDosage <= 0) {
    throw new Error('Proposed dosage must be greater than 0');
  }
  
  return await withDatabase(async (db) => {
    const cutoffTime = Math.floor(Date.now() / 1000) - (params.time_window_hours * 3600);
    
    const result = await db.getAllAsync(
      'SELECT SUM(dosage) as total_dosage FROM supplement_logs WHERE supplement_id = ? AND timestamp > ?',
      [supplementId, cutoffTime]
    );
    
    const currentTotal = (result[0] as any)?.total_dosage || 0;
    return (currentTotal + proposedDosage) > params.max_dosage;
  }, 'check dosage limit exclusion');
};

export const isExclusionActive = async (supplementId: number, proposedDosage: number): Promise<{active: boolean, type?: string, reason?: string}> => {
  const exclusions = await getSupplementExclusions(supplementId);
  
  for (const exclusion of exclusions) {
    if (exclusion.exclusion_type === 'time_window') {
      const params: TimeWindowParams = JSON.parse(exclusion.parameters);
      if (checkTimeWindowExclusion(params)) {
        return {
          active: true,
          type: 'time_window',
          reason: `Cannot take between ${params.start_time} and ${params.end_time}`
        };
      }
    } else if (exclusion.exclusion_type === 'dosage_limit') {
      const params: DosageLimitParams = JSON.parse(exclusion.parameters);
      const exceeds = await checkDosageLimitExclusion(supplementId, params, proposedDosage);
      if (exceeds) {
        return {
          active: true,
          type: 'dosage_limit',
          reason: `Would exceed ${params.max_dosage}mg limit in ${params.time_window_hours} hours`
        };
      }
    }
  }
  
  return { active: false };
};

// Study Protocol Management Functions

export const getSupplementStudyProtocols = async (supplementId: number): Promise<StudyProtocol[]> => {
  return await withDatabase(async (db) => {
    const result = await db.getAllAsync('SELECT * FROM study_protocols WHERE supplement_id = ?', [supplementId]);
    return result as StudyProtocol[];
  }, 'get supplement study protocols');
};

export const getAllStudyProtocols = async (): Promise<StudyProtocol[]> => {
  return await withDatabase(async (db) => {
    const result = await db.getAllAsync('SELECT * FROM study_protocols ORDER BY id');
    return result as StudyProtocol[];
  }, 'get all study protocols');
};

export const addStudyProtocol = async (protocol: Omit<StudyProtocol, 'id'>): Promise<number> => {
  return await withDatabase(async (db) => {
    const result = await db.runAsync(
      'INSERT INTO study_protocols (supplement_id, test_type, interval_minutes, duration_minutes, schedule_type, parameters) VALUES (?, ?, ?, ?, ?, ?)',
      [protocol.supplement_id || null, protocol.test_type, protocol.interval_minutes, protocol.duration_minutes, protocol.schedule_type, protocol.parameters || null]
    );
    return result.lastInsertRowId;
  }, 'add study protocol');
};

export const updateStudyProtocol = async (protocol: StudyProtocol): Promise<void> => {
  return await withDatabase(async (db) => {
    await db.runAsync(
      'UPDATE study_protocols SET supplement_id = ?, test_type = ?, interval_minutes = ?, duration_minutes = ?, schedule_type = ?, parameters = ? WHERE id = ?',
      [protocol.supplement_id || null, protocol.test_type, protocol.interval_minutes, protocol.duration_minutes, protocol.schedule_type, protocol.parameters || null, protocol.id]
    );
  }, 'update study protocol');
};

export const deleteStudyProtocol = async (protocolId: number): Promise<void> => {
  return await withDatabase(async (db) => {
    await db.runAsync('DELETE FROM study_protocols WHERE id = ?', [protocolId]);
  }, 'delete study protocol');
};

// Get a single supplement by ID
export const getSupplementById = async (supplementId: number): Promise<Supplement | null> => {
  if (!isDatabaseInitialized()) {
    throw new Error('Database not initialized. Please wait for app to load completely.');
  }
  
  return await withDatabase(async (db) => {
    const result = await db.getFirstAsync('SELECT * FROM supplements WHERE id = ?', [supplementId]);
    if (!result) return null;
    return {
      ...result,
      schedule_enabled: Boolean((result as any).schedule_enabled),
      study_enabled: Boolean((result as any).study_enabled)
    } as Supplement;
  }, 'get supplement by id');
};

// Update just the substance profile ID for a supplement
export const updateSupplementProfileId = async (supplementId: number, profileId: string | null): Promise<void> => {
  if (!isDatabaseInitialized()) {
    throw new Error('Database not initialized. Please wait for app to load completely.');
  }
  
  return await withDatabase(async (db) => {
    const result = await db.runAsync(
      'UPDATE supplements SET substance_profile_id = ? WHERE id = ?',
      [profileId, supplementId]
    );
    
    if (result.changes === 0) {
      throw new Error('Supplement not found');
    }
  }, 'update supplement profile id');
};