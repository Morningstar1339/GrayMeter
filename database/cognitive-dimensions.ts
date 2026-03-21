import { withDatabase, asyncStorageGet, asyncStorageSet } from './database';
import { getCognitiveTestResults, CognitiveTestResult } from './cognitive-tests';
import { getLearningCurve, expectedScore } from './learning-curves';
import { TestType } from './correlation-analysis';

export type DimensionKey = 
  | 'quickness' 
  | 'memory' 
  | 'focus' 
  | 'impulse_control' 
  | 'agility' 
  | 'pattern_recognition' 
  | 'mood';

export type TrendDirection = 'above_baseline' | 'baseline' | 'below_baseline';

export interface DimensionScore {
  key: DimensionKey;
  label: string;
  zScore: number;
  percentile: number;
  pctOfBest: number;
  trend: TrendDirection;
  contributingTests: number;
  isSubjective: boolean;
}

export interface DimensionScores {
  quickness: DimensionScore;
  memory: DimensionScore;
  focus: DimensionScore;
  impulse_control: DimensionScore;
  agility: DimensionScore;
  pattern_recognition: DimensionScore;
  mood: DimensionScore;
  timestamp: number;
  hasData: boolean;
}

export interface UserTestStats {
  testType: string;
  metric: string;
  mean: number;
  sd: number;
  minVal: number;
  maxVal: number;
  nSamples: number;
  lastUpdated: number;
}

export interface TestMetricValue {
  testType: TestType;
  metric: 'score' | 'accuracy' | 'speed';
  value: number;
  timestamp: number;
  sessionNumber?: number;
}

interface DimensionConfig {
  key: DimensionKey;
  label: string;
  contributions: {
    testType: TestType | 'connections';
    metric: 'score' | 'accuracy' | 'speed';
    weight: number;
    invertForSpeed?: boolean;
  }[];
  isSubjective: boolean;
}

const DIMENSION_CONFIGS: DimensionConfig[] = [
  {
    key: 'quickness',
    label: 'Processing Speed',
    contributions: [
      { testType: 'reflexes', metric: 'score', weight: 0.4 },
      { testType: 'stroop', metric: 'speed', weight: 0.2, invertForSpeed: true },
      { testType: 'n_back', metric: 'speed', weight: 0.2, invertForSpeed: true },
      { testType: 'pattern_matcher', metric: 'speed', weight: 0.2, invertForSpeed: true },
    ],
    isSubjective: false,
  },
  {
    key: 'memory',
    label: 'Working Memory',
    contributions: [
      { testType: 'n_back', metric: 'accuracy', weight: 0.5 },
      { testType: 'memory', metric: 'score', weight: 0.5 },
    ],
    isSubjective: false,
  },
  {
    key: 'focus',
    label: 'Sustained Attention',
    contributions: [
      { testType: 'rock_dodger', metric: 'score', weight: 0.5 },
      { testType: 'n_back', metric: 'accuracy', weight: 0.5 },
    ],
    isSubjective: false,
  },
  {
    key: 'impulse_control',
    label: 'Inhibitory Control',
    contributions: [
      { testType: 'stroop', metric: 'accuracy', weight: 1.0 },
    ],
    isSubjective: false,
  },
  {
    key: 'agility',
    label: 'Cognitive Flexibility',
    contributions: [
      { testType: 'connections' as any, metric: 'score', weight: 0.6 },
      { testType: 'stroop', metric: 'accuracy', weight: 0.4 },
    ],
    isSubjective: false,
  },
  {
    key: 'pattern_recognition',
    label: 'Spatial/Visual',
    contributions: [
      { testType: 'pattern_matcher', metric: 'score', weight: 0.5 },
      { testType: 'tile_puzzle', metric: 'score', weight: 0.5 },
    ],
    isSubjective: false,
  },
  {
    key: 'mood',
    label: 'Subjective State',
    contributions: [
      { testType: 'questionnaire' as any, metric: 'score', weight: 1.0 },
    ],
    isSubjective: true,
  },
];

const USER_TEST_STATS_KEY = 'user_test_stats';
const TREND_THRESHOLD = 0.5;

function normalCdf(z: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = z < 0 ? -1 : 1;
  z = Math.abs(z) / Math.sqrt(2);

  const t = 1.0 / (1.0 + p * z);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-z * z);

  return 0.5 * (1.0 + sign * y);
}

function computeZScore(value: number, mean: number, sd: number): number {
  if (sd === 0 || sd < 0.001) return 0;
  return (value - mean) / sd;
}

function determineTrend(zScore: number): TrendDirection {
  if (zScore > TREND_THRESHOLD) return 'above_baseline';
  if (zScore < -TREND_THRESHOLD) return 'below_baseline';
  return 'baseline';
}

export async function getUserTestStats(testType: string, metric: string): Promise<UserTestStats | null> {
  return await withDatabase(
    async (db) => {
      const result = await db.getFirstAsync(
        'SELECT * FROM user_test_stats WHERE test_type = ? AND metric = ?',
        [testType, metric]
      );
      if (!result) return null;
      const row = result as any;
      return {
        testType: row.test_type,
        metric: row.metric,
        mean: row.mean,
        sd: row.sd,
        minVal: row.min_val,
        maxVal: row.max_val,
        nSamples: row.n_samples,
        lastUpdated: row.last_updated,
      };
    },
    'getUserTestStats',
    async () => {
      const allStats = await asyncStorageGet(USER_TEST_STATS_KEY);
      const found = allStats.find((s: any) => s.testType === testType && s.metric === metric);
      return found || null;
    }
  );
}

export async function getAllUserTestStats(): Promise<UserTestStats[]> {
  return await withDatabase(
    async (db) => {
      const results = await db.getAllAsync('SELECT * FROM user_test_stats');
      return results.map((row: any) => ({
        testType: row.test_type,
        metric: row.metric,
        mean: row.mean,
        sd: row.sd,
        minVal: row.min_val,
        maxVal: row.max_val,
        nSamples: row.n_samples,
        lastUpdated: row.last_updated,
      }));
    },
    'getAllUserTestStats',
    async () => {
      return await asyncStorageGet(USER_TEST_STATS_KEY);
    }
  );
}

export async function updateUserTestStats(
  testType: string,
  metric: string,
  newValue: number
): Promise<UserTestStats> {
  const existing = await getUserTestStats(testType, metric);
  const now = Math.floor(Date.now() / 1000);
  
  let updatedStats: UserTestStats;
  
  if (!existing) {
    updatedStats = {
      testType,
      metric,
      mean: newValue,
      sd: 0,
      minVal: newValue,
      maxVal: newValue,
      nSamples: 1,
      lastUpdated: now,
    };
  } else {
    const n = existing.nSamples;
    const oldMean = existing.mean;
    const oldSd = existing.sd;
    
    const newN = n + 1;
    const newMean = oldMean + (newValue - oldMean) / newN;
    
    const oldVariance = oldSd * oldSd;
    const newVariance = ((n - 1) * oldVariance + (newValue - oldMean) * (newValue - newMean)) / Math.max(1, newN - 1);
    const newSd = Math.sqrt(Math.max(0, newVariance));
    
    updatedStats = {
      testType,
      metric,
      mean: newMean,
      sd: newSd,
      minVal: Math.min(existing.minVal, newValue),
      maxVal: Math.max(existing.maxVal, newValue),
      nSamples: newN,
      lastUpdated: now,
    };
  }
  
  await saveUserTestStats(updatedStats);
  return updatedStats;
}

async function saveUserTestStats(stats: UserTestStats): Promise<void> {
  return await withDatabase(
    async (db) => {
      await db.runAsync(
        `INSERT OR REPLACE INTO user_test_stats 
         (test_type, metric, mean, sd, min_val, max_val, n_samples, last_updated)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [stats.testType, stats.metric, stats.mean, stats.sd, 
         stats.minVal, stats.maxVal, stats.nSamples, stats.lastUpdated]
      );
    },
    'saveUserTestStats',
    async () => {
      const allStats = await asyncStorageGet(USER_TEST_STATS_KEY);
      const existingIdx = allStats.findIndex(
        (s: any) => s.testType === stats.testType && s.metric === stats.metric
      );
      if (existingIdx >= 0) {
        allStats[existingIdx] = stats;
      } else {
        allStats.push(stats);
      }
      await asyncStorageSet(USER_TEST_STATS_KEY, allStats);
    }
  );
}

export async function updateStatsFromTestResult(result: CognitiveTestResult): Promise<void> {
  const testType = result.test_type;
  
  await updateUserTestStats(testType, 'score', result.score);
  
  if (result.accuracy !== undefined && result.accuracy > 0) {
    await updateUserTestStats(testType, 'accuracy', result.accuracy);
  }
  
  if (result.speed !== undefined && result.speed > 0) {
    await updateUserTestStats(testType, 'speed', result.speed);
  }
}

export async function rebuildAllStats(): Promise<void> {
  const allResults = await getCognitiveTestResults();
  
  const statsByTypeMetric = new Map<string, number[]>();
  
  for (const result of allResults) {
    const scoreKey = `${result.test_type}:score`;
    if (!statsByTypeMetric.has(scoreKey)) statsByTypeMetric.set(scoreKey, []);
    statsByTypeMetric.get(scoreKey)!.push(result.score);
    
    if (result.accuracy !== undefined && result.accuracy > 0) {
      const accKey = `${result.test_type}:accuracy`;
      if (!statsByTypeMetric.has(accKey)) statsByTypeMetric.set(accKey, []);
      statsByTypeMetric.get(accKey)!.push(result.accuracy);
    }
    
    if (result.speed !== undefined && result.speed > 0) {
      const speedKey = `${result.test_type}:speed`;
      if (!statsByTypeMetric.has(speedKey)) statsByTypeMetric.set(speedKey, []);
      statsByTypeMetric.get(speedKey)!.push(result.speed);
    }
  }
  
  const now = Math.floor(Date.now() / 1000);
  
  for (const [key, values] of statsByTypeMetric) {
    const [testType, metric] = key.split(':');
    const n = values.length;
    const mean = values.reduce((a, b) => a + b, 0) / n;
    const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / Math.max(1, n - 1);
    const sd = Math.sqrt(Math.max(0, variance));
    
    const stats: UserTestStats = {
      testType,
      metric,
      mean,
      sd,
      minVal: Math.min(...values),
      maxVal: Math.max(...values),
      nSamples: n,
      lastUpdated: now,
    };
    
    await saveUserTestStats(stats);
  }
}

async function getLatestTestMetrics(
  testType: TestType,
  metric: 'score' | 'accuracy' | 'speed',
  windowSeconds: number = 86400
): Promise<TestMetricValue | null> {
  const results = await getCognitiveTestResults(testType as any, 10);
  
  if (results.length === 0) return null;
  
  const now = Math.floor(Date.now() / 1000);
  const recentResults = results.filter(r => now - r.timestamp < windowSeconds);
  
  const targetResult = recentResults.length > 0 ? recentResults[0] : results[0];
  
  let value: number;
  switch (metric) {
    case 'score':
      value = targetResult.score;
      break;
    case 'accuracy':
      value = targetResult.accuracy ?? targetResult.score;
      break;
    case 'speed':
      value = targetResult.speed ?? 0;
      break;
  }
  
  if (value === 0 && metric !== 'score') return null;
  
  const allTypeResults = await getCognitiveTestResults(testType as any);
  const sortedByTime = [...allTypeResults].sort((a, b) => a.timestamp - b.timestamp);
  const sessionNumber = sortedByTime.findIndex(r => r.id === targetResult.id) + 1;
  
  return {
    testType,
    metric,
    value,
    timestamp: targetResult.timestamp,
    sessionNumber,
  };
}

async function computeDimensionScore(
  config: DimensionConfig,
  allStats: Map<string, UserTestStats>
): Promise<DimensionScore> {
  let weightedZSum = 0;
  let totalWeight = 0;
  let contributingTests = 0;
  let maxPctOfBest = 0;
  
  for (const contrib of config.contributions) {
    const testType = contrib.testType as TestType;
    const metric = contrib.metric;
    const statsKey = `${testType}:${metric}`;
    const stats = allStats.get(statsKey);
    
    if (!stats || stats.nSamples < 2) continue;
    
    const latestMetric = await getLatestTestMetrics(testType, metric);
    if (!latestMetric) continue;
    
    let value = latestMetric.value;
    
    const learningCurve = await getLearningCurve(testType);
    if (learningCurve && latestMetric.sessionNumber) {
      const expected = expectedScore(
        latestMetric.sessionNumber,
        learningCurve.ceiling,
        learningCurve.floor,
        learningCurve.lambda
      );
      value = latestMetric.value - expected + stats.mean;
    }
    
    let zScore = computeZScore(value, stats.mean, stats.sd);
    
    if (contrib.invertForSpeed) {
      zScore = -zScore;
    }
    
    weightedZSum += zScore * contrib.weight;
    totalWeight += contrib.weight;
    contributingTests++;
    
    if (stats.maxVal > 0) {
      const pctOfBest = (latestMetric.value / stats.maxVal) * 100;
      maxPctOfBest = Math.max(maxPctOfBest, pctOfBest);
    }
  }
  
  const finalZScore = totalWeight > 0 ? weightedZSum / totalWeight : 0;
  const percentile = normalCdf(finalZScore) * 100;
  const trend = determineTrend(finalZScore);
  
  return {
    key: config.key,
    label: config.label,
    zScore: finalZScore,
    percentile,
    pctOfBest: Math.min(100, maxPctOfBest),
    trend,
    contributingTests,
    isSubjective: config.isSubjective,
  };
}

export async function computeDimensions(): Promise<DimensionScores> {
  const allStatsArray = await getAllUserTestStats();
  const allStats = new Map<string, UserTestStats>();
  for (const stat of allStatsArray) {
    allStats.set(`${stat.testType}:${stat.metric}`, stat);
  }
  
  const dimensionPromises = DIMENSION_CONFIGS.map(config => 
    computeDimensionScore(config, allStats)
  );
  
  const scores = await Promise.all(dimensionPromises);
  
  const result: DimensionScores = {
    quickness: scores.find(s => s.key === 'quickness')!,
    memory: scores.find(s => s.key === 'memory')!,
    focus: scores.find(s => s.key === 'focus')!,
    impulse_control: scores.find(s => s.key === 'impulse_control')!,
    agility: scores.find(s => s.key === 'agility')!,
    pattern_recognition: scores.find(s => s.key === 'pattern_recognition')!,
    mood: scores.find(s => s.key === 'mood')!,
    timestamp: Math.floor(Date.now() / 1000),
    hasData: scores.some(s => s.contributingTests > 0),
  };
  
  return result;
}

export async function computeDimensionsForTimeRange(
  _startTimestamp: number,
  _endTimestamp: number
): Promise<DimensionScores> {
  return computeDimensions();
}

export function getDimensionSummary(scores: DimensionScores): string {
  if (!scores.hasData) {
    return 'Complete some cognitive tests to see your dimension scores.';
  }
  
  const performanceDims = [
    scores.quickness,
    scores.memory,
    scores.focus,
    scores.impulse_control,
    scores.agility,
    scores.pattern_recognition,
  ].filter(d => d.contributingTests > 0);
  
  if (performanceDims.length === 0) {
    return 'More test data needed for a complete cognitive profile.';
  }
  
  const sorted = [...performanceDims].sort((a, b) => b.percentile - a.percentile);
  const strongest = sorted[0];
  const weakest = sorted[sorted.length - 1];
  
  const aboveBaseline = performanceDims.filter(d => d.trend === 'above_baseline');
  const belowBaseline = performanceDims.filter(d => d.trend === 'below_baseline');
  
  let summary = `Your strongest area is ${strongest.label} (${strongest.percentile.toFixed(0)}th percentile). `;
  
  if (weakest.key !== strongest.key) {
    summary += `${weakest.label} shows room for improvement. `;
  }
  
  if (aboveBaseline.length > 0) {
    summary += `You're performing above your baseline in ${aboveBaseline.map(d => d.label).join(', ')}. `;
  }
  
  if (belowBaseline.length > 0) {
    summary += `${belowBaseline.map(d => d.label).join(', ')} ${belowBaseline.length === 1 ? 'is' : 'are'} below your usual level.`;
  }
  
  return summary.trim();
}

export function formatDimensionForDisplay(score: DimensionScore): {
  label: string;
  value: string;
  color: string;
  icon: string;
} {
  const color = score.percentile >= 60 ? '#34C759' :
                score.percentile >= 40 ? '#FF9500' :
                '#FF3B30';
  
  const icons: Record<DimensionKey, string> = {
    quickness: 'flash',
    memory: 'hardware-chip',
    focus: 'eye',
    impulse_control: 'hand-left',
    agility: 'shuffle',
    pattern_recognition: 'grid',
    mood: 'happy',
  };
  
  return {
    label: score.label,
    value: score.contributingTests > 0 ? `${score.percentile.toFixed(0)}%` : '--',
    color,
    icon: icons[score.key],
  };
}

export function getDimensionConfigs(): DimensionConfig[] {
  return DIMENSION_CONFIGS;
}

export { DIMENSION_CONFIGS };
