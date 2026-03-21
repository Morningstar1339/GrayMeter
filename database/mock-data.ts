import { withDatabase, isDatabaseInitialized } from './database';
import { addSupplement, logSupplement } from './supplements';
import { saveCognitiveTestResult } from './cognitive-tests';
import { addActivity, logActivity } from './activities';
// Note: Using withDatabase directly for sleep/daily-review to set custom timestamps

const TEST_DATA_MARKER = '[Test]';

export interface MockDataStatus {
  isSeeded: boolean;
  supplementCount: number;
  logCount: number;
  testResultCount: number;
  activityCount: number;
  activityLogCount: number;
  sleepLogCount: number;
  dailyReviewCount: number;
}

export const checkMockDataStatus = async (): Promise<MockDataStatus> => {
  if (!isDatabaseInitialized()) {
    return { 
      isSeeded: false, 
      supplementCount: 0, 
      logCount: 0, 
      testResultCount: 0,
      activityCount: 0,
      activityLogCount: 0,
      sleepLogCount: 0,
      dailyReviewCount: 0
    };
  }

  return await withDatabase(async (db) => {
    const testSupplement = await db.getFirstAsync(
      `SELECT id FROM supplements WHERE name LIKE ?`,
      [`%${TEST_DATA_MARKER}%`]
    );

    const supplementCount = (await db.getFirstAsync(
      `SELECT COUNT(*) as count FROM supplements WHERE name LIKE ?`,
      [`%${TEST_DATA_MARKER}%`]
    ) as any)?.count || 0;

    const logCount = (await db.getFirstAsync(
      `SELECT COUNT(*) as count FROM supplement_logs sl 
       JOIN supplements s ON sl.supplement_id = s.id 
       WHERE s.name LIKE ?`,
      [`%${TEST_DATA_MARKER}%`]
    ) as any)?.count || 0;

    const testResultCount = (await db.getFirstAsync(
      `SELECT COUNT(*) as count FROM cognitive_test_results 
       WHERE raw_data LIKE ?`,
      [`%"isTestData":true%`]
    ) as any)?.count || 0;

    const activityCount = (await db.getFirstAsync(
      `SELECT COUNT(*) as count FROM activities WHERE name LIKE ?`,
      [`%${TEST_DATA_MARKER}%`]
    ) as any)?.count || 0;

    const activityLogCount = (await db.getFirstAsync(
      `SELECT COUNT(*) as count FROM activity_logs al
       JOIN activities a ON al.activity_id = a.id
       WHERE a.name LIKE ?`,
      [`%${TEST_DATA_MARKER}%`]
    ) as any)?.count || 0;

    // Sleep logs and daily reviews use notes field for test marker
    const sleepLogCount = (await db.getFirstAsync(
      `SELECT COUNT(*) as count FROM sleep_logs 
       WHERE id IN (SELECT id FROM sleep_logs ORDER BY logged_at DESC LIMIT 100)`
    ) as any)?.count || 0;

    const dailyReviewCount = (await db.getFirstAsync(
      `SELECT COUNT(*) as count FROM daily_reviews 
       WHERE wellness LIKE ?`,
      [`%${TEST_DATA_MARKER}%`]
    ) as any)?.count || 0;

    return {
      isSeeded: testSupplement !== null,
      supplementCount,
      logCount,
      testResultCount,
      activityCount,
      activityLogCount,
      sleepLogCount,
      dailyReviewCount
    };
  }, 'checkMockDataStatus');
};

export const clearMockData = async (): Promise<void> => {
  if (!isDatabaseInitialized()) {
    throw new Error('Database not initialized');
  }

  await withDatabase(async (db) => {
    // Clear test supplements and their logs
    const testSupplements = await db.getAllAsync(
      `SELECT id FROM supplements WHERE name LIKE ?`,
      [`%${TEST_DATA_MARKER}%`]
    ) as any[];

    const testSupplementIds = testSupplements.map((s: any) => s.id);

    if (testSupplementIds.length > 0) {
      const placeholders = testSupplementIds.map(() => '?').join(',');
      await db.runAsync(
        `DELETE FROM supplement_logs WHERE supplement_id IN (${placeholders})`,
        testSupplementIds
      );
      await db.runAsync(
        `DELETE FROM supplements WHERE id IN (${placeholders})`,
        testSupplementIds
      );
    }

    // Clear test cognitive results
    await db.runAsync(
      `DELETE FROM cognitive_test_results WHERE raw_data LIKE ?`,
      [`%"isTestData":true%`]
    );

    // Clear test activities and their logs
    const testActivities = await db.getAllAsync(
      `SELECT id FROM activities WHERE name LIKE ?`,
      [`%${TEST_DATA_MARKER}%`]
    ) as any[];

    const testActivityIds = testActivities.map((a: any) => a.id);

    if (testActivityIds.length > 0) {
      const placeholders = testActivityIds.map(() => '?').join(',');
      await db.runAsync(
        `DELETE FROM activity_logs WHERE activity_id IN (${placeholders})`,
        testActivityIds
      );
      await db.runAsync(
        `DELETE FROM activities WHERE id IN (${placeholders})`,
        testActivityIds
      );
    }

    // Clear test daily reviews (marked in wellness field)
    await db.runAsync(
      `DELETE FROM daily_reviews WHERE wellness LIKE ?`,
      [`%${TEST_DATA_MARKER}%`]
    );

    // Clear test sleep logs (marked with specific duration pattern)
    // We'll use a marker in the manually_edited field: test data uses timestamp range
    // Actually, let's be more careful here - we'll clear sleep logs that fall within the test period
    // For now, don't auto-clear sleep logs to avoid accidentally deleting real data
  }, 'clearMockData');
};

export const clearAllData = async (): Promise<void> => {
  if (!isDatabaseInitialized()) {
    throw new Error('Database not initialized');
  }

  await withDatabase(async (db) => {
    await db.runAsync('DELETE FROM supplement_logs');
    await db.runAsync('DELETE FROM supplements');
    await db.runAsync('DELETE FROM cognitive_test_results');
    await db.runAsync('DELETE FROM activity_logs');
    await db.runAsync('DELETE FROM activities');
    await db.runAsync('DELETE FROM sleep_logs');
    await db.runAsync('DELETE FROM symptom_logs');
    await db.runAsync('DELETE FROM symptoms');
    await db.runAsync('DELETE FROM scheduled_tests');
    await db.runAsync('DELETE FROM study_protocols');
    await db.runAsync('DELETE FROM notification_records');
    await db.runAsync('DELETE FROM daily_reviews');
  }, 'clearAllData');
};

export const seedMockData = async (): Promise<{ 
  supplements: number; 
  logs: number; 
  tests: number;
  activities: number;
  activityLogs: number;
  sleepLogs: number;
  dailyReviews: number;
}> => {
  if (!isDatabaseInitialized()) {
    throw new Error('Database not initialized');
  }

  const status = await checkMockDataStatus();
  if (status.isSeeded) {
    await clearMockData();
  }

  const now = Math.floor(Date.now() / 1000);
  const daySeconds = 86400;

  // ===== SUPPLEMENTS =====
  const supplements = [
    { name: `Caffeine ${TEST_DATA_MARKER}`, default_dosage: 100, dosage_unit: 'mg', color: '#8B4513', schedule_enabled: false, study_enabled: true },
    { name: `L-Theanine ${TEST_DATA_MARKER}`, default_dosage: 200, dosage_unit: 'mg', color: '#228B22', schedule_enabled: false, study_enabled: true },
    { name: `Omega-3 ${TEST_DATA_MARKER}`, default_dosage: 1000, dosage_unit: 'mg', color: '#4169E1', schedule_enabled: false, study_enabled: false },
    { name: `Magnesium ${TEST_DATA_MARKER}`, default_dosage: 400, dosage_unit: 'mg', color: '#9370DB', schedule_enabled: false, study_enabled: false },
  ];

  const supplementIds: number[] = [];
  for (const supp of supplements) {
    const id = await addSupplement(supp);
    supplementIds.push(id);
  }

  // ===== ACTIVITIES =====
  const activities = [
    { name: `Exercise ${TEST_DATA_MARKER}`, default_value: 30, unit: 'minutes', color: '#FF6B6B' },
    { name: `Meditation ${TEST_DATA_MARKER}`, default_value: 15, unit: 'minutes', color: '#4ECDC4' },
    { name: `Reading ${TEST_DATA_MARKER}`, default_value: 30, unit: 'minutes', color: '#45B7D1' },
  ];

  const activityIds: number[] = [];
  for (const act of activities) {
    const id = await addActivity(act);
    activityIds.push(id);
  }

  let logCount = 0;
  let testCount = 0;
  let activityLogCount = 0;
  let sleepLogCount = 0;
  let dailyReviewCount = 0;

  for (let day = 45; day >= 0; day--) {
    const dayStart = now - (day * daySeconds);
    const morningTime = dayStart + (8 * 3600) + Math.floor(Math.random() * 3600);

    const takeCaffeine = day % 2 === 0;
    const takeTheanine = day % 2 === 0;
    const takeOmega = day % 3 !== 0;
    const takeMagnesium = day % 4 === 0;
    const didExercise = day % 3 === 0;
    const didMeditate = day % 2 === 1;
    const didRead = Math.random() > 0.4;

    // ===== SUPPLEMENT LOGS =====
    if (takeCaffeine) {
      const dose = 100 + Math.floor(Math.random() * 3) * 50;
      await logSupplement(supplementIds[0], dose, undefined, morningTime);
      logCount++;
    }

    if (takeTheanine) {
      await logSupplement(supplementIds[1], 200, undefined, morningTime + 300);
      logCount++;
    }

    if (takeOmega) {
      await logSupplement(supplementIds[2], 1000, undefined, morningTime + 600);
      logCount++;
    }

    if (takeMagnesium) {
      await logSupplement(supplementIds[3], 400, undefined, dayStart + (21 * 3600));
      logCount++;
    }

    // ===== ACTIVITY LOGS =====
    if (didExercise) {
      const duration = 20 + Math.floor(Math.random() * 40); // 20-60 minutes
      await logActivity(activityIds[0], duration, undefined, morningTime + 1800);
      activityLogCount++;
    }

    if (didMeditate) {
      const duration = 10 + Math.floor(Math.random() * 20); // 10-30 minutes
      await logActivity(activityIds[1], duration, undefined, morningTime - 1800);
      activityLogCount++;
    }

    if (didRead) {
      const duration = 15 + Math.floor(Math.random() * 45); // 15-60 minutes
      await logActivity(activityIds[2], duration, undefined, dayStart + (20 * 3600));
      activityLogCount++;
    }

    // ===== SLEEP LOGS =====
    // Log sleep for the previous night (so we don't log for future days)
    if (day < 45) {
      const sleepStart = dayStart - (7 * 3600) + Math.floor(Math.random() * 3600); // 11pm-midnight previous day
      const sleepDuration = (6 + Math.random() * 3) * 3600; // 6-9 hours
      const sleepEnd = sleepStart + sleepDuration;
      
      await withDatabase(async (db) => {
        await db.runAsync(
          `INSERT INTO sleep_logs (sleep_start, sleep_end, duration_seconds, manually_edited, didnt_sleep, logged_at) 
           VALUES (?, ?, ?, 0, 0, ?)`,
          [sleepStart, sleepEnd, Math.floor(sleepDuration), morningTime + 600]
        );
      }, 'seedMockSleepLog');
      sleepLogCount++;
    }

    // ===== DAILY REVIEWS =====
    // Add daily reviews for some days (evening reviews)
    if (Math.random() > 0.3) {
      const reviewTime = dayStart + (21 * 3600); // 9pm
      
      const socialOptions = ['called_family', 'texted_friends', 'social_event', 'video_call'];
      const productivityOptions = ['deep_work', 'meetings', 'email', 'planning', 'learning'];
      const newsOptions = ['none', 'headlines', 'deep_dive', 'social_media'];
      
      const socialDid = socialOptions.filter(() => Math.random() > 0.6);
      const socialWished = socialOptions.filter(() => Math.random() > 0.8);
      const productivityDid = productivityOptions.filter(() => Math.random() > 0.5);
      const productivityWished = productivityOptions.filter(() => Math.random() > 0.7);
      
      const socialRatings: Record<string, number> = {};
      socialDid.forEach(item => { socialRatings[item] = Math.floor(Math.random() * 5) + 1; });
      
      const productivityRatings: Record<string, number> = {};
      productivityDid.forEach(item => { productivityRatings[item] = Math.floor(Math.random() * 5) + 1; });
      
      const newsTypes = newsOptions.filter(() => Math.random() > 0.7);
      const wellnessScore = Math.floor(Math.random() * 5) + 1;
      
      await withDatabase(async (db) => {
        await db.runAsync(
          `INSERT INTO daily_reviews (timestamp, social_did, social_wished, social_ratings, 
           productivity_did, productivity_wished, productivity_ratings, wellness, news_types) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            reviewTime,
            JSON.stringify(socialDid),
            JSON.stringify(socialWished),
            JSON.stringify(socialRatings),
            JSON.stringify(productivityDid),
            JSON.stringify(productivityWished),
            JSON.stringify(productivityRatings),
            `${wellnessScore} ${TEST_DATA_MARKER}`,
            JSON.stringify(newsTypes)
          ]
        );
      }, 'seedMockDailyReview');
      dailyReviewCount++;
    }

    // ===== COGNITIVE TESTS =====
    const runTests = Math.random() > 0.3;
    if (runTests) {
      // Tests typically taken 2 hours after morning routine
      // (timestamp handled by saveCognitiveTestResult internally)

      const baseReflexScore = takeCaffeine ? 85 : 70;
      const reflexScore = baseReflexScore + Math.floor(Math.random() * 20) - 10;
      await saveCognitiveTestResult(
        'reflexes',
        Math.max(0, reflexScore),
        { isTestData: true, hits: Math.floor(reflexScore / 5), misses: Math.floor((100 - reflexScore) / 10) },
        10,
        undefined,
        undefined,
        Math.min(100, reflexScore + 5),
        1000 - reflexScore * 5
      );
      testCount++;

      const baseNBackScore = (takeCaffeine && takeTheanine) ? 82 : takeCaffeine ? 75 : 68;
      const nBackScore = baseNBackScore + Math.floor(Math.random() * 16) - 8;
      await saveCognitiveTestResult(
        'n_back',
        Math.max(0, Math.min(100, nBackScore)),
        { isTestData: true, correct: Math.floor(nBackScore / 5), incorrect: 20 - Math.floor(nBackScore / 5) },
        undefined,
        undefined,
        undefined,
        nBackScore,
        800 - nBackScore * 3
      );
      testCount++;

      if (Math.random() > 0.4) {
        const baseMemoryScore = takeOmega ? 78 : 72;
        const memoryScore = baseMemoryScore + Math.floor(Math.random() * 20) - 10;
        await saveCognitiveTestResult(
          'memory',
          Math.max(0, memoryScore),
          { isTestData: true, pairs: 9, mismatches: Math.floor((100 - memoryScore) / 8) },
          30 + Math.random() * 30,
          undefined,
          undefined,
          Math.min(100, memoryScore + 3),
          memoryScore * 0.8
        );
        testCount++;
      }

      if (Math.random() > 0.5) {
        const baseStroopScore = takeCaffeine ? 80 : 73;
        const stroopScore = baseStroopScore + Math.floor(Math.random() * 18) - 9;
        await saveCognitiveTestResult(
          'stroop',
          Math.max(0, stroopScore),
          { isTestData: true, congruent: 10, incongruent: 10 },
          undefined,
          undefined,
          undefined,
          stroopScore,
          1200 - stroopScore * 6
        );
        testCount++;
      }

      // Add judgment test occasionally
      if (Math.random() > 0.6) {
        const baseJudgmentScore = didMeditate ? 88 : 80;
        const judgmentScore = baseJudgmentScore + Math.floor(Math.random() * 15) - 7;
        await saveCognitiveTestResult(
          'judgment',
          Math.max(0, Math.min(100, judgmentScore)),
          { isTestData: true, optimalLength: 100, userLength: Math.floor(100 / (judgmentScore / 100)) },
          30,
          undefined,
          undefined,
          judgmentScore,
          judgmentScore * 0.9
        );
        testCount++;
      }
    }
  }

  return { 
    supplements: supplementIds.length, 
    logs: logCount, 
    tests: testCount,
    activities: activityIds.length,
    activityLogs: activityLogCount,
    sleepLogs: sleepLogCount,
    dailyReviews: dailyReviewCount
  };
};
