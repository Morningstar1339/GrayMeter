import { withDatabase, getFallbackData, addFallbackData, getDatabase, checkDatabaseHealth, asyncStorageGet, asyncStorageAdd } from './database';

export interface CognitiveTestResult {
  id: number;
  test_type: 'reflexes' | 'memory' | 'judgment' | 'rock_dodger' | 'pattern_matcher' | 'tile_puzzle' | 'n_back' | 'stroop' | 'questionnaire';
  timestamp: number;
  score: number;
  accuracy: number;
  speed: number;
  raw_data?: string;
  completion_time?: number;
  study_id?: number;
  supplement_log_id?: number;
}

export const saveCognitiveTestResult = async (
  testType: 'reflexes' | 'memory' | 'judgment' | 'rock_dodger' | 'pattern_matcher' | 'tile_puzzle' | 'n_back' | 'stroop' | 'questionnaire',
  score: number,
  rawData?: any,
  completionTime?: number,
  studyId?: number,
  supplementLogId?: number,
  accuracy?: number,
  speed?: number
): Promise<number> => {
  const timestamp = Math.floor(Date.now() / 1000);
  const operationId = `save-${testType}-${timestamp}`;
  
  console.log(`🔄 [${operationId}] SAVE TEST RESULT: Starting save operation for ${testType} test`);
  console.log(`🔄 [${operationId}] Test data: score=${score}, completionTime=${completionTime}, studyId=${studyId}, supplementLogId=${supplementLogId}`);
  
  try {
    // Pre-save validation: Check database health
    console.log(`🔄 [${operationId}] STEP 1: Checking database health...`);
    const healthCheck = checkDatabaseHealth();
    console.log(`🔄 [${operationId}] Database health: healthy=${healthCheck.healthy}, issues=${healthCheck.issues.length}`);
    
    if (!healthCheck.healthy) {
      console.log(`❌ [${operationId}] STEP 1 FAILED: Database unhealthy - ${healthCheck.issues.join(', ')}`);
      throw new Error(`Database health check failed: ${healthCheck.issues.join(', ')}`);
    }
    console.log(`✅ [${operationId}] STEP 1 COMPLETE: Database health check passed`);
    
    // Pre-save validation: Get database instance
    console.log(`🔄 [${operationId}] STEP 2: Getting database instance...`);
    const db = getDatabase();
    if (!db) {
      console.log(`❌ [${operationId}] STEP 2 FAILED: Database instance is null`);
      throw new Error('Database instance not available');
    }
    console.log(`✅ [${operationId}] STEP 2 COMPLETE: Database instance obtained`);
    
    // Validate input data
    console.log(`🔄 [${operationId}] STEP 3: Validating input data...`);
    
    const validTestTypes = ['reflexes', 'memory', 'judgment', 'rock_dodger', 'pattern_matcher', 'tile_puzzle', 'n_back', 'stroop', 'questionnaire'];
    if (!validTestTypes.includes(testType)) {
      throw new Error(`Invalid test type: ${testType} (must be one of: ${validTestTypes.join(', ')})`);
    }
    
    if (typeof score !== 'number' || isNaN(score)) {
      throw new Error(`Invalid score: ${score} (must be a number)`);
    }
    if (score < 0) {
      throw new Error(`Invalid score: ${score} (must be non-negative)`);
    }
    
    if (accuracy !== undefined) {
      if (typeof accuracy !== 'number' || isNaN(accuracy)) {
        throw new Error(`Invalid accuracy: ${accuracy} (must be a number)`);
      }
      if (accuracy < 0 || accuracy > 100) {
        throw new Error(`Invalid accuracy: ${accuracy} (must be between 0 and 100)`);
      }
    }
    
    if (speed !== undefined) {
      if (typeof speed !== 'number' || isNaN(speed)) {
        throw new Error(`Invalid speed: ${speed} (must be a number)`);
      }
      if (speed < 0) {
        throw new Error(`Invalid speed: ${speed} (must be non-negative)`);
      }
    }
    
    if (completionTime !== undefined && (typeof completionTime !== 'number' || isNaN(completionTime) || completionTime <= 0)) {
      throw new Error(`Invalid completion time: ${completionTime} (must be a positive number)`);
    }
    
    if (studyId !== undefined && (typeof studyId !== 'number' || !Number.isInteger(studyId) || studyId <= 0)) {
      throw new Error(`Invalid study ID: ${studyId} (must be a positive integer)`);
    }
    
    if (supplementLogId !== undefined && (typeof supplementLogId !== 'number' || !Number.isInteger(supplementLogId) || supplementLogId <= 0)) {
      throw new Error(`Invalid supplement log ID: ${supplementLogId} (must be a positive integer)`);
    }
    
    console.log(`✅ [${operationId}] STEP 3 COMPLETE: Input data validation passed`);
    
    // Prepare data for insertion
    console.log(`🔄 [${operationId}] STEP 4: Preparing data for insertion...`);
    const insertData = {
      test_type: testType,
      timestamp,
      score,
      accuracy: accuracy ?? (rawData?.accuracy ?? 0),
      speed: speed ?? (rawData?.speed ?? completionTime ?? 0),
      raw_data: rawData ? JSON.stringify(rawData) : null,
      completion_time: completionTime || null,
      study_id: studyId || null,
      supplement_log_id: supplementLogId || null
    };
    console.log(`🔄 [${operationId}] Insert data prepared:`, insertData);
    console.log(`✅ [${operationId}] STEP 4 COMPLETE: Data preparation complete`);
    
    return await withDatabase(
      async () => {
        console.log(`🔄 [${operationId}] STEP 5: Executing AsyncStorage insert...`);
        try {
          const insertId = await asyncStorageAdd('cognitive_test_results', insertData);
          
          console.log(`✅ [${operationId}] STEP 5 COMPLETE: AsyncStorage insert successful - ID: ${insertId}`);
          console.log(`🎉 [${operationId}] SAVE TEST RESULT: SUCCESS - ${testType} test result saved with ID ${insertId}`);
          
          return insertId;
        } catch (dbError) {
          console.log(`❌ [${operationId}] STEP 5 FAILED: AsyncStorage insert error:`, dbError);
          console.log(`❌ [${operationId}] Error details:`);
          console.log(`   - Error name: ${dbError instanceof Error ? dbError.name : 'Unknown'}`);
          console.log(`   - Error message: ${dbError instanceof Error ? dbError.message : String(dbError)}`);
          console.log(`   - Error stack: ${dbError instanceof Error ? dbError.stack : 'No stack trace'}`);
          console.log(`   - Test type: ${testType}`);
          console.log(`   - Score: ${score}`);
          console.log(`   - Raw data length: ${rawData ? JSON.stringify(rawData).length : 0} characters`);
          console.log(`   - Completion time: ${completionTime}`);
          console.log(`   - Study ID: ${studyId}`);
          console.log(`   - Supplement log ID: ${supplementLogId}`);
          
          throw new Error(`AsyncStorage insert failed: ${dbError instanceof Error ? dbError.message : String(dbError)}`);
        }
      },
      `saveCognitiveTestResult-${testType}`,
      async () => {
        console.log(`🔄 [${operationId}] FALLBACK: Using fallback mode...`);
        try {
          const fallbackId = addFallbackData('cognitive_test_results', insertData);
          console.log(`✅ [${operationId}] FALLBACK SUCCESS: Saved to fallback with ID ${fallbackId}`);
          return fallbackId;
        } catch (fallbackError) {
          console.log(`❌ [${operationId}] FALLBACK FAILED:`, fallbackError);
          throw new Error(`Both database and fallback save failed: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`);
        }
      }
    );
    
  } catch (error) {
    console.log(`❌ [${operationId}] SAVE TEST RESULT: CRITICAL FAILURE`);
    console.log(`❌ [${operationId}] Error details:`);
    console.log(`   - Error name: ${error instanceof Error ? error.name : 'Unknown'}`);
    console.log(`   - Error message: ${error instanceof Error ? error.message : String(error)}`);
    console.log(`   - Error stack: ${error instanceof Error ? error.stack : 'No stack trace'}`);
    console.log(`   - Test type: ${testType}`);
    console.log(`   - Score: ${score}`);
    console.log(`   - Timestamp: ${timestamp}`);
    console.log(`   - Raw data: ${rawData ? JSON.stringify(rawData).substring(0, 200) + '...' : 'null'}`);
    
    // Re-throw with enhanced error message
    throw new Error(`Failed to save ${testType} test result (score: ${score}): ${error instanceof Error ? error.message : String(error)}`);
  }
};

export const getCognitiveTestResults = async (
  testType?: 'reflexes' | 'memory' | 'judgment' | 'rock_dodger' | 'pattern_matcher' | 'tile_puzzle' | 'n_back' | 'stroop' | 'questionnaire',
  limit?: number
): Promise<CognitiveTestResult[]> => {
  return await withDatabase(
    async (db) => {
      // Read from SQLite first, then merge with AsyncStorage data
      let query = 'SELECT * FROM cognitive_test_results';
      const params: any[] = [];

      if (testType) {
        query += ' WHERE test_type = ?';
        params.push(testType);
      }

      query += ' ORDER BY timestamp DESC';

      if (limit) {
        query += ' LIMIT ?';
        params.push(limit);
      }

      let sqliteResults: any[] = [];
      try {
        sqliteResults = await db.getAllAsync(query, params);
      } catch (e) {
        // Table might not exist yet
      }

      // Also check AsyncStorage for any results saved there
      let asyncResults = await asyncStorageGet('cognitive_test_results');
      if (testType) {
        asyncResults = asyncResults.filter((result: any) => result.test_type === testType);
      }
      asyncResults.sort((a: any, b: any) => b.timestamp - a.timestamp);
      if (limit) {
        asyncResults = asyncResults.slice(0, limit);
      }

      // Merge: use SQLite results as base, add any AsyncStorage results not already present
      const sqliteIds = new Set(sqliteResults.map((r: any) => r.id));
      const merged = [...sqliteResults];
      for (const asyncResult of asyncResults) {
        if (!sqliteIds.has(asyncResult.id)) {
          merged.push(asyncResult);
        }
      }

      // Sort merged results
      merged.sort((a: any, b: any) => b.timestamp - a.timestamp);
      const finalResults = limit ? merged.slice(0, limit) : merged;

      return finalResults.map((row: any) => ({
        ...row,
        raw_data: typeof row.raw_data === 'string' ? JSON.parse(row.raw_data) : row.raw_data
      })) as CognitiveTestResult[];
    },
    'getCognitiveTestResults',
    async () => {
      // Fallback mode - try AsyncStorage then in-memory fallback
      let results = await asyncStorageGet('cognitive_test_results');

      if (results.length === 0) {
        results = getFallbackData('cognitive_test_results');
      }

      if (testType) {
        results = results.filter((result: any) => result.test_type === testType);
      }

      results.sort((a: any, b: any) => b.timestamp - a.timestamp);

      if (limit) {
        results = results.slice(0, limit);
      }
      
      return results.map((row: any) => ({
        ...row,
        raw_data: typeof row.raw_data === 'string' ? JSON.parse(row.raw_data) : row.raw_data
      })) as CognitiveTestResult[];
    }
  );
};

export const getTestResultsOlderThan24Hours = async (
  testType?: 'reflexes' | 'memory' | 'judgment' | 'rock_dodger' | 'pattern_matcher' | 'tile_puzzle' | 'n_back' | 'questionnaire'
): Promise<CognitiveTestResult[]> => {
  const twentyFourHoursAgo = Math.floor(Date.now() / 1000) - (24 * 60 * 60);
  
  return await withDatabase(
    async () => {
      let results = await asyncStorageGet('cognitive_test_results');
      
      results = results.filter((result: any) => result.timestamp < twentyFourHoursAgo);
      
      if (testType) {
        results = results.filter((result: any) => result.test_type === testType);
      }
      
      results.sort((a: any, b: any) => b.timestamp - a.timestamp);
      
      return results.map((row: any) => ({
        ...row,
        raw_data: typeof row.raw_data === 'string' ? JSON.parse(row.raw_data) : row.raw_data
      })) as CognitiveTestResult[];
    },
    'getTestResultsOlderThan24Hours',
    async () => {
      // Fallback mode
      let results = getFallbackData('cognitive_test_results');
      
      results = results.filter((result: any) => result.timestamp < twentyFourHoursAgo);
      
      if (testType) {
        results = results.filter((result: any) => result.test_type === testType);
      }
      
      results.sort((a: any, b: any) => b.timestamp - a.timestamp);
      
      return results.map((row: any) => ({
        ...row,
        raw_data: typeof row.raw_data === 'string' ? JSON.parse(row.raw_data) : row.raw_data
      })) as CognitiveTestResult[];
    }
  );
};
