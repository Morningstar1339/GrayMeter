import { SupplementLog, getAllSupplements, getSupplementLogs, getSupplementLogsWithDetails, SupplementLogWithDetails, Supplement } from './supplements';
import { getCognitiveTestResults } from './cognitive-tests';
import { withDatabase, asyncStorageGet, openDatabase, isDatabaseInitialized } from './database';

export type TestType = 'reflexes' | 'memory' | 'judgment' | 'rock_dodger' | 'pattern_matcher' | 'tile_puzzle' | 'n_back' | 'stroop';
export type TimingWindow = '0-2h' | '2-4h' | '4-8h' | '8-24h';
export type ConfidenceLevel = 'low' | 'medium' | 'high';

export interface CorrelationResult {
  supplementId: number;
  supplementName: string;
  testType: TestType;
  timingWindow: TimingWindow;
  percentChange: number;
  sampleSize: number;
  confidence: ConfidenceLevel;
  baselineScore: number;
  windowScore: number;
}

export interface StackCorrelation {
  supplementIds: number[];
  supplementNames: string[];
  testType: TestType;
  percentChange: number;
  comparedToIndividual: number;
  sampleSize: number;
  confidence: ConfidenceLevel;
}

export interface DoseResponseResult {
  supplementId: number;
  supplementName: string;
  testType: TestType;
  lowDoseAvg: number;
  medDoseAvg: number;
  highDoseAvg: number;
  lowDoseSampleSize: number;
  medDoseSampleSize: number;
  highDoseSampleSize: number;
  trend: 'positive' | 'negative' | 'neutral' | 'insufficient_data';
  percentChangeHighVsLow: number;
}

export interface BaselineData {
  testType: TestType;
  baselineScore: number;
  sampleSize: number;
  standardDeviation: number;
}

export interface DataQuality {
  totalSupplementLogs: number;
  totalTestResults: number;
  trackingDays: number;
  uniqueSupplements: number;
  uniqueTestTypes: number;
  sufficientData: boolean;
  recommendations: string[];
}

export interface SupplementSummaryItem {
  supplementId: number;
  supplementName: string;
  totalLogs: number;
  totalDosage: number;
  dosageUnit: string;
  lastTaken: number; // timestamp
}

export interface TestSummaryItem {
  testType: TestType;
  totalResults: number;
  averageScore: number;
  bestScore: number;
  lastTaken: number; // timestamp
}

export interface InsightsSummary {
  topFindings: CorrelationResult[];
  bySupplementCorrelations: Map<number, CorrelationResult[]>;
  byTestCorrelations: Map<TestType, CorrelationResult[]>;
  stackInsights: StackCorrelation[];
  doseResponses: DoseResponseResult[];
  baselines: BaselineData[];
  dataQuality: DataQuality;
  supplementSummaries: SupplementSummaryItem[];
  testSummaries: TestSummaryItem[];
}

const TIMING_WINDOWS: { window: TimingWindow; minHours: number; maxHours: number }[] = [
  { window: '0-2h', minHours: 0, maxHours: 2 },
  { window: '2-4h', minHours: 2, maxHours: 4 },
  { window: '4-8h', minHours: 4, maxHours: 8 },
  { window: '8-24h', minHours: 8, maxHours: 24 },
];

const MIN_SAMPLE_SIZE_LOW = 1;
const MIN_SAMPLE_SIZE_MEDIUM = 5;
const MIN_SAMPLE_SIZE_HIGH = 12;

function calculateStandardDeviation(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
  const avgSquaredDiff = squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(avgSquaredDiff);
}

function getConfidenceLevel(sampleSize: number): ConfidenceLevel {
  if (sampleSize >= MIN_SAMPLE_SIZE_HIGH) return 'high';
  if (sampleSize >= MIN_SAMPLE_SIZE_MEDIUM) return 'medium';
  return 'low';
}

function calculatePercentChange(baseline: number, current: number): number {
  if (baseline === 0) return current > 0 ? 100 : 0;
  return ((current - baseline) / baseline) * 100;
}

export async function calculateBaselines(): Promise<BaselineData[]> {
  const allTestResults = await safeGetCognitiveTestResults();
  const allSupplementLogs = await safeGetSupplementLogs();
  
  const testTypes: TestType[] = ['reflexes', 'memory', 'judgment', 'rock_dodger', 'pattern_matcher', 'tile_puzzle', 'n_back', 'stroop'];
  const baselines: BaselineData[] = [];
  
  for (const testType of testTypes) {
    const testResults = allTestResults.filter(r => r.test_type === testType);
    
    if (testResults.length === 0) continue;
    
    const baselineResults = testResults.filter(result => {
      const testTimestamp = result.timestamp;
      const dayStart = testTimestamp - (testTimestamp % 86400);
      const dayEnd = dayStart + 86400;
      
      const supplementsThatDay = allSupplementLogs.filter(
        log => log.timestamp >= dayStart && log.timestamp < dayEnd
      );
      
      return supplementsThatDay.length === 0;
    });
    
    let scores: number[];
    let sampleSize: number;
    
    if (baselineResults.length >= MIN_SAMPLE_SIZE_LOW) {
      scores = baselineResults.map(r => r.score);
      sampleSize = baselineResults.length;
    } else {
      scores = testResults.map(r => r.score);
      sampleSize = testResults.length;
    }
    
    if (scores.length > 0) {
      const baselineScore = scores.reduce((a, b) => a + b, 0) / scores.length;
      const standardDeviation = calculateStandardDeviation(scores);
      
      baselines.push({
        testType,
        baselineScore,
        sampleSize,
        standardDeviation,
      });
    }
  }
  
  return baselines;
}

export async function analyzeTimingWindows(): Promise<CorrelationResult[]> {
  const supplements = await safeGetAllSupplements();
  const allTestResults = await safeGetCognitiveTestResults();
  const allSupplementLogs = await safeGetSupplementLogs();
  const baselines = await calculateBaselines();

  const correlations: CorrelationResult[] = [];

  for (const supplement of supplements) {
    const supplementLogs = allSupplementLogs.filter(log => log.supplement_id === supplement.id);

    if (supplementLogs.length === 0) continue;

    const testTypes: TestType[] = ['reflexes', 'memory', 'judgment', 'rock_dodger', 'pattern_matcher', 'tile_puzzle', 'n_back', 'stroop'];

    for (const testType of testTypes) {
      const baseline = baselines.find(b => b.testType === testType);
      if (!baseline) continue;

      const testResults = allTestResults.filter(r => r.test_type === testType);

      for (const timingWindow of TIMING_WINDOWS) {
        const matchingScores: number[] = [];
        
        for (const log of supplementLogs) {
          const windowStart = log.timestamp + (timingWindow.minHours * 3600);
          const windowEnd = log.timestamp + (timingWindow.maxHours * 3600);
          
          const testsInWindow = testResults.filter(
            test => test.timestamp >= windowStart && test.timestamp < windowEnd
          );
          
          matchingScores.push(...testsInWindow.map(t => t.score));
        }
        
        if (matchingScores.length >= MIN_SAMPLE_SIZE_LOW) {
          const windowAvg = matchingScores.reduce((a, b) => a + b, 0) / matchingScores.length;
          const percentChange = calculatePercentChange(baseline.baselineScore, windowAvg);
          
          correlations.push({
            supplementId: supplement.id,
            supplementName: supplement.name,
            testType,
            timingWindow: timingWindow.window,
            percentChange,
            sampleSize: matchingScores.length,
            confidence: getConfidenceLevel(matchingScores.length),
            baselineScore: baseline.baselineScore,
            windowScore: windowAvg,
          });
        }
      }
    }
  }
  
  return correlations;
}

export async function analyzeDoseResponse(): Promise<DoseResponseResult[]> {
  const supplements = await safeGetAllSupplements();
  const allTestResults = await safeGetCognitiveTestResults();
  const allSupplementLogs = await safeGetSupplementLogs();
  
  const results: DoseResponseResult[] = [];
  
  for (const supplement of supplements) {
    const supplementLogs = allSupplementLogs.filter(log => log.supplement_id === supplement.id);
    
    if (supplementLogs.length < 6) continue;
    
    const doses = supplementLogs.map(log => log.dosage).sort((a, b) => a - b);
    const p33 = doses[Math.floor(doses.length / 3)];
    const p66 = doses[Math.floor((doses.length * 2) / 3)];
    
    const lowDoseLogs = supplementLogs.filter(log => log.dosage <= p33);
    const medDoseLogs = supplementLogs.filter(log => log.dosage > p33 && log.dosage <= p66);
    const highDoseLogs = supplementLogs.filter(log => log.dosage > p66);
    
    const testTypes: TestType[] = ['reflexes', 'memory', 'judgment', 'rock_dodger', 'pattern_matcher', 'tile_puzzle', 'n_back', 'stroop'];
    
    for (const testType of testTypes) {
      const testResults = allTestResults.filter(r => r.test_type === testType);
      
      const getScoresAfterDose = (logs: SupplementLog[]): number[] => {
        const scores: number[] = [];
        for (const log of logs) {
          const windowStart = log.timestamp;
          const windowEnd = log.timestamp + (8 * 3600);
          
          const testsInWindow = testResults.filter(
            test => test.timestamp >= windowStart && test.timestamp < windowEnd
          );
          
          scores.push(...testsInWindow.map(t => t.score));
        }
        return scores;
      };
      
      const lowScores = getScoresAfterDose(lowDoseLogs);
      const medScores = getScoresAfterDose(medDoseLogs);
      const highScores = getScoresAfterDose(highDoseLogs);
      
      const lowAvg = lowScores.length > 0 ? lowScores.reduce((a, b) => a + b, 0) / lowScores.length : 0;
      const medAvg = medScores.length > 0 ? medScores.reduce((a, b) => a + b, 0) / medScores.length : 0;
      const highAvg = highScores.length > 0 ? highScores.reduce((a, b) => a + b, 0) / highScores.length : 0;
      
      const totalSamples = lowScores.length + medScores.length + highScores.length;
      if (totalSamples < MIN_SAMPLE_SIZE_LOW) continue;
      
      let trend: 'positive' | 'negative' | 'neutral' | 'insufficient_data' = 'insufficient_data';
      
      if (lowScores.length >= 2 && highScores.length >= 2) {
        const percentChangeHighVsLow = calculatePercentChange(lowAvg, highAvg);
        
        if (percentChangeHighVsLow > 5) {
          trend = 'positive';
        } else if (percentChangeHighVsLow < -5) {
          trend = 'negative';
        } else {
          trend = 'neutral';
        }
        
        results.push({
          supplementId: supplement.id,
          supplementName: supplement.name,
          testType,
          lowDoseAvg: lowAvg,
          medDoseAvg: medAvg,
          highDoseAvg: highAvg,
          lowDoseSampleSize: lowScores.length,
          medDoseSampleSize: medScores.length,
          highDoseSampleSize: highScores.length,
          trend,
          percentChangeHighVsLow,
        });
      }
    }
  }
  
  return results;
}

export async function detectStacks(): Promise<StackCorrelation[]> {
  const supplements = await safeGetAllSupplements();
  const allTestResults = await safeGetCognitiveTestResults();
  const allSupplementLogs = await safeGetSupplementLogs();
  const baselines = await calculateBaselines();
  const individualCorrelations = await analyzeTimingWindows();
  
  const stackCorrelations: StackCorrelation[] = [];
  const STACK_WINDOW_HOURS = 2;
  
  const supplementLogsByTimestamp = new Map<number, SupplementLog[]>();
  for (const log of allSupplementLogs) {
    const hourBucket = Math.floor(log.timestamp / 3600);
    if (!supplementLogsByTimestamp.has(hourBucket)) {
      supplementLogsByTimestamp.set(hourBucket, []);
    }
    supplementLogsByTimestamp.get(hourBucket)!.push(log);
  }
  
  const stackOccurrences = new Map<string, { supplementIds: number[]; timestamps: number[] }>();
  
  for (const [hourBucket, logs] of supplementLogsByTimestamp) {
    const nearbyLogs: SupplementLog[] = [...logs];
    
    for (let i = 1; i <= STACK_WINDOW_HOURS; i++) {
      const nearbyBucket = supplementLogsByTimestamp.get(hourBucket + i);
      if (nearbyBucket) {
        nearbyLogs.push(...nearbyBucket);
      }
    }
    
    const uniqueSupplementIds = [...new Set(nearbyLogs.map(l => l.supplement_id))].sort((a, b) => a - b);
    
    if (uniqueSupplementIds.length >= 2) {
      for (let i = 0; i < uniqueSupplementIds.length - 1; i++) {
        for (let j = i + 1; j < uniqueSupplementIds.length; j++) {
          const stackKey = `${uniqueSupplementIds[i]}-${uniqueSupplementIds[j]}`;
          const stackTimestamp = Math.min(...nearbyLogs.map(l => l.timestamp));
          
          if (!stackOccurrences.has(stackKey)) {
            stackOccurrences.set(stackKey, {
              supplementIds: [uniqueSupplementIds[i], uniqueSupplementIds[j]],
              timestamps: [],
            });
          }
          
          const existing = stackOccurrences.get(stackKey)!;
          const lastTimestamp = existing.timestamps[existing.timestamps.length - 1] || 0;
          if (stackTimestamp - lastTimestamp > 3600 * 4) {
            existing.timestamps.push(stackTimestamp);
          }
        }
      }
    }
  }
  
  const testTypes: TestType[] = ['reflexes', 'memory', 'judgment', 'rock_dodger', 'pattern_matcher', 'tile_puzzle', 'n_back', 'stroop'];
  
  for (const [, stackData] of stackOccurrences) {
    if (stackData.timestamps.length < MIN_SAMPLE_SIZE_LOW) continue;
    
    const supplementNames = stackData.supplementIds.map(
      id => supplements.find(s => s.id === id)?.name || 'Unknown'
    );
    
    for (const testType of testTypes) {
      const baseline = baselines.find(b => b.testType === testType);
      if (!baseline) continue;
      
      const testResults = allTestResults.filter(r => r.test_type === testType);
      
      const stackScores: number[] = [];
      for (const stackTimestamp of stackData.timestamps) {
        const windowStart = stackTimestamp;
        const windowEnd = stackTimestamp + (8 * 3600);
        
        const testsInWindow = testResults.filter(
          test => test.timestamp >= windowStart && test.timestamp < windowEnd
        );
        
        stackScores.push(...testsInWindow.map(t => t.score));
      }
      
      if (stackScores.length < MIN_SAMPLE_SIZE_LOW) continue;
      
      const stackAvg = stackScores.reduce((a, b) => a + b, 0) / stackScores.length;
      const stackPercentChange = calculatePercentChange(baseline.baselineScore, stackAvg);
      
      const individualEffects = stackData.supplementIds.map(id => {
        const correlations = individualCorrelations.filter(
          c => c.supplementId === id && c.testType === testType && c.timingWindow === '0-2h'
        );
        return correlations.length > 0 ? correlations[0].percentChange : 0;
      });
      
      const avgIndividualEffect = individualEffects.reduce((a, b) => a + b, 0) / individualEffects.length;
      const comparedToIndividual = stackPercentChange - avgIndividualEffect;
      
      stackCorrelations.push({
        supplementIds: stackData.supplementIds,
        supplementNames,
        testType,
        percentChange: stackPercentChange,
        comparedToIndividual,
        sampleSize: stackScores.length,
        confidence: getConfidenceLevel(stackScores.length),
      });
    }
  }
  
  return stackCorrelations.sort((a, b) => Math.abs(b.comparedToIndividual) - Math.abs(a.comparedToIndividual));
}

async function ensureDatabase(): Promise<void> {
  if (!isDatabaseInitialized()) {
    try {
      await openDatabase();
    } catch (e) {
      console.warn('ensureDatabase: failed to open database:', e);
    }
  }
}

async function safeGetSupplementLogs(): Promise<SupplementLog[]> {
  await ensureDatabase();
  try {
    return await getSupplementLogs();
  } catch (error) {
    console.warn('Failed to get supplement logs via supplements.ts, trying direct DB:', error);
    try {
      return await withDatabase(
        async (db) => {
          const result = await db.getAllAsync('SELECT * FROM supplement_logs ORDER BY timestamp DESC');
          return result as SupplementLog[];
        },
        'safeGetSupplementLogs-direct',
        async () => [] as SupplementLog[],
      );
    } catch (directError) {
      console.warn('Direct DB query also failed:', directError);
      return [];
    }
  }
}

async function safeGetAllSupplements(): Promise<Supplement[]> {
  await ensureDatabase();
  try {
    return await getAllSupplements();
  } catch (error) {
    console.warn('Failed to get supplements via supplements.ts, trying direct DB:', error);
    try {
      return await withDatabase(
        async (db) => {
          const result = await db.getAllAsync('SELECT * FROM supplements ORDER BY name');
          return result.map((row: any) => ({
            ...row,
            schedule_enabled: Boolean(row.schedule_enabled),
            study_enabled: Boolean(row.study_enabled),
          })) as Supplement[];
        },
        'safeGetAllSupplements-direct',
        async () => [] as Supplement[],
      );
    } catch (directError) {
      console.warn('Direct DB query also failed:', directError);
      return [];
    }
  }
}

async function safeGetCognitiveTestResults(): Promise<Awaited<ReturnType<typeof getCognitiveTestResults>>> {
  await ensureDatabase();
  try {
    return await getCognitiveTestResults();
  } catch (error) {
    console.warn('Failed to get cognitive test results:', error);
    try {
      // Try AsyncStorage directly as fallback
      const results = await asyncStorageGet('cognitive_test_results');
      return results.map((row: any) => ({
        ...row,
        raw_data: typeof row.raw_data === 'string' ? JSON.parse(row.raw_data) : row.raw_data,
      }));
    } catch (asyncError) {
      console.warn('AsyncStorage fallback also failed:', asyncError);
      return [];
    }
  }
}

async function safeGetSupplementLogsWithDetails(): Promise<SupplementLogWithDetails[]> {
  try {
    return await getSupplementLogsWithDetails();
  } catch (error) {
    console.warn('Failed to get supplement logs with details, trying direct DB:', error);
    try {
      return await withDatabase(
        async (db) => {
          const result = await db.getAllAsync(`
            SELECT sl.id, sl.supplement_id, sl.timestamp, sl.dosage, sl.notes,
              s.name as supplement_name, s.dosage_unit, s.icon_id, s.color
            FROM supplement_logs sl
            JOIN supplements s ON sl.supplement_id = s.id
            ORDER BY sl.timestamp DESC
          `);
          return result as SupplementLogWithDetails[];
        },
        'safeGetSupplementLogsWithDetails-direct',
        async () => [] as SupplementLogWithDetails[],
      );
    } catch (directError) {
      console.warn('Direct DB query also failed:', directError);
      return [];
    }
  }
}

export async function assessDataQuality(): Promise<DataQuality> {
  const allSupplementLogs = await safeGetSupplementLogs();
  const allTestResults = await safeGetCognitiveTestResults();

  const uniqueSupplements = new Set(allSupplementLogs.map(l => l.supplement_id)).size;
  const uniqueTestTypes = new Set(allTestResults.map(r => r.test_type)).size;

  const allTimestamps = [
    ...allSupplementLogs.map(l => l.timestamp),
    ...allTestResults.map(r => r.timestamp),
  ];

  let trackingDays = 0;
  if (allTimestamps.length > 0) {
    const minTimestamp = Math.min(...allTimestamps);
    const maxTimestamp = Math.max(...allTimestamps);
    trackingDays = Math.ceil((maxTimestamp - minTimestamp) / 86400);
  }

  const recommendations: string[] = [];

  if (allSupplementLogs.length < 10) {
    recommendations.push('Log more supplement intake to improve analysis accuracy');
  }

  if (allTestResults.length < 10) {
    recommendations.push('Complete more cognitive tests to build your performance baseline');
  }

  if (trackingDays < 14) {
    recommendations.push('Continue tracking for at least 2 weeks for meaningful patterns');
  }

  if (uniqueTestTypes < 3) {
    recommendations.push('Try different test types to get a broader cognitive profile');
  }

  const sufficientData = allSupplementLogs.length >= 10 &&
                         allTestResults.length >= 10 &&
                         trackingDays >= 7;

  return {
    totalSupplementLogs: allSupplementLogs.length,
    totalTestResults: allTestResults.length,
    trackingDays,
    uniqueSupplements,
    uniqueTestTypes,
    sufficientData,
    recommendations,
  };
}

export async function generateInsightsSummary(): Promise<InsightsSummary> {
  const dataQuality = await assessDataQuality();
  let baselines: BaselineData[] = [];
  try { baselines = await calculateBaselines(); } catch (e) { console.warn('Failed to calculate baselines:', e); }
  const supplements = await safeGetAllSupplements();
  const allSupplementLogs = await safeGetSupplementLogs();
  const allTestResults = await safeGetCognitiveTestResults();

  let correlations: CorrelationResult[] = [];
  let stackInsights: StackCorrelation[] = [];
  let doseResponses: DoseResponseResult[] = [];

  // Always run analysis if there's any data, even below the "sufficient" threshold
  if (allSupplementLogs.length > 0 && allTestResults.length > 0) {
    try { correlations = await analyzeTimingWindows(); } catch (e) { console.warn('Failed to analyze timing windows:', e); }
    try { stackInsights = await detectStacks(); } catch (e) { console.warn('Failed to detect stacks:', e); }
    try { doseResponses = await analyzeDoseResponse(); } catch (e) { console.warn('Failed to analyze dose response:', e); }
  }

  // Build basic supplement summaries (always shown even without correlations)
  let supplementSummaries: SupplementSummaryItem[] = [];
  if (supplements.length > 0) {
    for (const supplement of supplements) {
      const logs = allSupplementLogs.filter(l => l.supplement_id === supplement.id);
      const totalDosage = logs.reduce((sum, l) => sum + l.dosage, 0);
      const lastTaken = logs.length > 0 ? Math.max(...logs.map(l => l.timestamp)) : 0;
      supplementSummaries.push({
        supplementId: supplement.id,
        supplementName: supplement.name,
        totalLogs: logs.length,
        totalDosage,
        dosageUnit: supplement.dosage_unit,
        lastTaken,
      });
    }
  }

  // Fallback: if supplements table returned empty but logs exist, build summaries from joined log data
  if (supplementSummaries.length === 0 && (allSupplementLogs.length > 0 || dataQuality.totalSupplementLogs > 0)) {
    const logsWithDetails = await safeGetSupplementLogsWithDetails();
    const supplementMap = new Map<number, SupplementSummaryItem>();
    for (const log of logsWithDetails) {
      if (!supplementMap.has(log.supplement_id)) {
        supplementMap.set(log.supplement_id, {
          supplementId: log.supplement_id,
          supplementName: log.supplement_name,
          totalLogs: 0,
          totalDosage: 0,
          dosageUnit: log.dosage_unit,
          lastTaken: 0,
        });
      }
      const item = supplementMap.get(log.supplement_id)!;
      item.totalLogs++;
      item.totalDosage += log.dosage;
      item.lastTaken = Math.max(item.lastTaken, log.timestamp);
    }
    supplementSummaries = Array.from(supplementMap.values());
  }
  supplementSummaries.sort((a, b) => b.lastTaken - a.lastTaken);

  // Build basic test summaries (always shown even without correlations)
  const testSummaries: TestSummaryItem[] = [];
  const testTypes: TestType[] = ['reflexes', 'memory', 'judgment', 'rock_dodger', 'pattern_matcher', 'tile_puzzle', 'n_back', 'stroop'];
  for (const testType of testTypes) {
    const results = allTestResults.filter(r => r.test_type === testType);
    if (results.length === 0) continue;
    const scores = results.map(r => r.score);
    const averageScore = scores.reduce((a, b) => a + b, 0) / scores.length;
    const bestScore = Math.max(...scores);
    const lastTaken = Math.max(...results.map(r => r.timestamp));
    testSummaries.push({
      testType,
      totalResults: results.length,
      averageScore,
      bestScore,
      lastTaken,
    });
  }
  testSummaries.sort((a, b) => b.lastTaken - a.lastTaken);

  // Show all correlations as top findings when data is limited; filter only with larger datasets
  const topFindings = correlations.length <= 5
    ? [...correlations].sort((a, b) => Math.abs(b.percentChange) - Math.abs(a.percentChange))
    : [...correlations]
        .filter(c => c.confidence !== 'low' || Math.abs(c.percentChange) > 15)
        .sort((a, b) => Math.abs(b.percentChange) - Math.abs(a.percentChange))
        .slice(0, 5);

  const bySupplementCorrelations = new Map<number, CorrelationResult[]>();
  for (const correlation of correlations) {
    if (!bySupplementCorrelations.has(correlation.supplementId)) {
      bySupplementCorrelations.set(correlation.supplementId, []);
    }
    bySupplementCorrelations.get(correlation.supplementId)!.push(correlation);
  }

  const byTestCorrelations = new Map<TestType, CorrelationResult[]>();
  for (const correlation of correlations) {
    if (!byTestCorrelations.has(correlation.testType)) {
      byTestCorrelations.set(correlation.testType, []);
    }
    byTestCorrelations.get(correlation.testType)!.push(correlation);
  }

  return {
    topFindings,
    bySupplementCorrelations,
    byTestCorrelations,
    stackInsights,
    doseResponses,
    baselines,
    dataQuality,
    supplementSummaries,
    testSummaries,
  };
}

export function formatPercentChange(percentChange: number): string {
  const sign = percentChange >= 0 ? '+' : '';
  return `${sign}${percentChange.toFixed(1)}%`;
}

export function formatConfidence(confidence: ConfidenceLevel): string {
  switch (confidence) {
    case 'high': return 'High confidence';
    case 'medium': return 'Medium confidence';
    case 'low': return 'Low confidence';
  }
}

export function getTimingWindowLabel(window: TimingWindow): string {
  switch (window) {
    case '0-2h': return '0-2 hours';
    case '2-4h': return '2-4 hours';
    case '4-8h': return '4-8 hours';
    case '8-24h': return '8-24 hours';
  }
}

export function getTestTypeLabel(testType: TestType): string {
  switch (testType) {
    case 'reflexes': return 'Reflexes';
    case 'memory': return 'Memory';
    case 'judgment': return 'Judgment';
    case 'rock_dodger': return 'Rock Dodger';
    case 'pattern_matcher': return 'Pattern Matcher';
    case 'tile_puzzle': return 'Tile Puzzle';
    case 'n_back': return 'N-Back';
    case 'stroop': return 'Stroop';
  }
}
