import { SupplementLog, getAllSupplements, getSupplementLogs } from './supplements';
import { getCognitiveTestResults } from './cognitive-tests';
import { 
  maybeRefitLearningCurve,
  LearningCurveParams,
  expectedScore as computeExpectedScore
} from './learning-curves';
import {
  getEffectAtTime,
  findSubstanceByName,
  getSubstanceProfile,
  IntakeEvent,
  SubstanceProfile,
} from './pk-curves';

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
  learningCurveAdjusted: boolean;
  rawPercentChange?: number;
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

export type EffectSizeInterpretation = 'negligible' | 'small' | 'medium' | 'large';

export interface CohensD {
  d: number;
  ci95: [number, number];
  interpretation: EffectSizeInterpretation;
  treatmentN: number;
  baselineN: number;
}

export interface Phase {
  type: 'on' | 'off';
  start: number;
  end: number;
}

export interface TestResultWithTimestamp {
  timestamp: number;
  score: number;
}

export interface TestResultWithResidual extends TestResultWithTimestamp {
  sessionNumber: number;
  expectedScore: number;
  residual: number;
}

export interface PKCorrelationResult {
  correlation: number;
  slope: number;
  pValue: number;
  ci95: [number, number];
  n: number;
}

export interface PKAnalysis extends PKCorrelationResult {
  profileUsed: string;
}

export interface SupplementEffectAnalysis {
  supplementId: number;
  supplementName: string;
  testType: TestType;
  cohensD: CohensD | null;
  cohensDResidual: CohensD | null;
  phases: Phase[];
  treatmentScores: number[];
  baselineScores: number[];
  treatmentResiduals: number[];
  baselineResiduals: number[];
  testResults: TestResultWithTimestamp[];
  testResultsWithResiduals: TestResultWithResidual[];
  percentChange: number;
  percentChangeResidual: number;
  sampleSize: number;
  confidence: ConfidenceLevel;
  learningCurveParams: LearningCurveParams | null;
  pkAnalysis?: PKAnalysis;
  analysisMethod: 'binary' | 'pk_informed';
}

export interface SupplementPKSummary {
  supplementId: number;
  supplementName: string;
  testType: TestType;
  pkAnalysis: PKAnalysis;
  interpretation: PKCorrelationInterpretation;
}

export interface InsightsSummary {
  topFindings: CorrelationResult[];
  bySupplementCorrelations: Map<number, CorrelationResult[]>;
  byTestCorrelations: Map<TestType, CorrelationResult[]>;
  stackInsights: StackCorrelation[];
  doseResponses: DoseResponseResult[];
  baselines: BaselineData[];
  dataQuality: DataQuality;
  learningCurves: Map<TestType, LearningCurveParams>;
  pkInsights: SupplementPKSummary[];
}

const TIMING_WINDOWS: { window: TimingWindow; minHours: number; maxHours: number }[] = [
  { window: '0-2h', minHours: 0, maxHours: 2 },
  { window: '2-4h', minHours: 2, maxHours: 4 },
  { window: '4-8h', minHours: 4, maxHours: 8 },
  { window: '8-24h', minHours: 8, maxHours: 24 },
];

const MIN_SAMPLE_SIZE_LOW = 3;
const MIN_SAMPLE_SIZE_MEDIUM = 7;
const MIN_SAMPLE_SIZE_HIGH = 15;

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

function calculateMean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function calculatePooledStandardDeviation(group1: number[], group2: number[]): number {
  const n1 = group1.length;
  const n2 = group2.length;
  
  if (n1 < 2 || n2 < 2) return 0;
  
  const mean1 = calculateMean(group1);
  const mean2 = calculateMean(group2);
  
  const ss1 = group1.reduce((sum, val) => sum + Math.pow(val - mean1, 2), 0);
  const ss2 = group2.reduce((sum, val) => sum + Math.pow(val - mean2, 2), 0);
  
  const pooledVariance = (ss1 + ss2) / (n1 + n2 - 2);
  return Math.sqrt(pooledVariance);
}

function interpretEffectSize(d: number): EffectSizeInterpretation {
  const absD = Math.abs(d);
  if (absD < 0.2) return 'negligible';
  if (absD < 0.5) return 'small';
  if (absD < 0.8) return 'medium';
  return 'large';
}

export type PKCorrelationInterpretation = 'negligible' | 'small' | 'moderate' | 'strong';

export function interpretPKCorrelation(r: number): PKCorrelationInterpretation {
  const abs = Math.abs(r);
  if (abs < 0.1) return 'negligible';
  if (abs < 0.3) return 'small';
  if (abs < 0.5) return 'moderate';
  return 'strong';
}

const MIN_PK_SAMPLE_SIZE = 10;

export async function getEffectMagnitudeAtTest(
  supplementName: string,
  testTimestamp: number,
  allSupplementLogs: SupplementLog[],
  lookbackHours: number = 72,
  linkedProfileId?: string
): Promise<{ magnitude: number; profileId: string } | null> {
  // First try to use the directly linked profile ID
  let profile: SubstanceProfile | null = null;
  
  if (linkedProfileId) {
    profile = await getSubstanceProfile(linkedProfileId);
  }
  
  // Fall back to name matching if no linked profile or profile not found
  if (!profile) {
    profile = await findSubstanceByName(supplementName);
  }
  
  if (!profile) return null;
  
  const lookbackSeconds = lookbackHours * 3600;
  const testTimestampMs = testTimestamp * 1000;
  const lookbackStartMs = (testTimestamp - lookbackSeconds) * 1000;
  
  const relevantLogs = allSupplementLogs.filter(log => {
    const logMs = log.timestamp * 1000;
    return logMs >= lookbackStartMs && logMs <= testTimestampMs;
  });
  
  if (relevantLogs.length === 0) return { magnitude: 0, profileId: profile.id };
  
  const intakeEvents: IntakeEvent[] = relevantLogs.map(log => ({
    timestamp: log.timestamp * 1000,
    dose: log.dosage,
  }));
  
  const magnitude = getEffectAtTime(profile.curves, intakeEvents, testTimestampMs);
  
  return { magnitude, profileId: profile.id };
}

export function calculatePKCorrelation(
  testResults: { score: number; effectMagnitude: number }[]
): PKCorrelationResult | null {
  const n = testResults.length;
  if (n < MIN_PK_SAMPLE_SIZE) return null;
  
  const scores = testResults.map(r => r.score);
  const magnitudes = testResults.map(r => r.effectMagnitude);
  
  const meanScore = calculateMean(scores);
  const meanMag = calculateMean(magnitudes);
  
  let sumXY = 0;
  let sumX2 = 0;
  let sumY2 = 0;
  
  for (let i = 0; i < n; i++) {
    const dx = magnitudes[i] - meanMag;
    const dy = scores[i] - meanScore;
    sumXY += dx * dy;
    sumX2 += dx * dx;
    sumY2 += dy * dy;
  }
  
  if (sumX2 === 0 || sumY2 === 0) {
    return {
      correlation: 0,
      slope: 0,
      pValue: 1,
      ci95: [0, 0],
      n,
    };
  }
  
  const correlation = sumXY / Math.sqrt(sumX2 * sumY2);
  const slope = sumXY / sumX2;
  
  const t = correlation * Math.sqrt((n - 2) / (1 - correlation * correlation));
  const df = n - 2;
  const pValue = 2 * (1 - tCDF(Math.abs(t), df));
  
  const zr = 0.5 * Math.log((1 + correlation) / (1 - correlation));
  const zSE = 1 / Math.sqrt(n - 3);
  const zLower = zr - 1.96 * zSE;
  const zUpper = zr + 1.96 * zSE;
  const ci95Lower = (Math.exp(2 * zLower) - 1) / (Math.exp(2 * zLower) + 1);
  const ci95Upper = (Math.exp(2 * zUpper) - 1) / (Math.exp(2 * zUpper) + 1);
  
  return {
    correlation,
    slope,
    pValue,
    ci95: [ci95Lower, ci95Upper],
    n,
  };
}

function tCDF(t: number, df: number): number {
  const x = df / (df + t * t);
  return 1 - 0.5 * incompleteBeta(x, df / 2, 0.5);
}

function incompleteBeta(x: number, a: number, b: number): number {
  if (x === 0) return 0;
  if (x === 1) return 1;
  
  const lnBeta = lnGamma(a) + lnGamma(b) - lnGamma(a + b);
  const front = Math.exp(Math.log(x) * a + Math.log(1 - x) * b - lnBeta) / a;
  
  let sum = 1;
  let term = 1;
  for (let n = 0; n < 200; n++) {
    term *= (a + n) * x / (a + b + n);
    sum += term / (a + n + 1);
    if (Math.abs(term) < 1e-10) break;
  }
  
  return front * a * sum;
}

function lnGamma(z: number): number {
  const c = [
    76.18009172947146, -86.50532032941677, 24.01409824083091,
    -1.231739572450155, 0.001208650973866179, -0.000005395239384953
  ];
  
  let x = z;
  let y = z;
  let tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  
  for (let j = 0; j < 6; j++) {
    y += 1;
    ser += c[j] / y;
  }
  
  return -tmp + Math.log(2.5066282746310005 * ser / x);
}

function calculateCohensD95CI(d: number, n1: number, n2: number): [number, number] {
  const se = Math.sqrt((n1 + n2) / (n1 * n2) + (d * d) / (2 * (n1 + n2)));
  const criticalValue = 1.96;
  const lowerBound = d - criticalValue * se;
  const upperBound = d + criticalValue * se;
  return [lowerBound, upperBound];
}

export function calculateCohensD(treatmentScores: number[], baselineScores: number[]): CohensD | null {
  const n1 = treatmentScores.length;
  const n2 = baselineScores.length;
  
  if (n1 < 2 || n2 < 2) {
    return null;
  }
  
  const mean1 = calculateMean(treatmentScores);
  const mean2 = calculateMean(baselineScores);
  const pooledSD = calculatePooledStandardDeviation(treatmentScores, baselineScores);
  
  if (pooledSD === 0) {
    return {
      d: 0,
      ci95: [0, 0],
      interpretation: 'negligible',
      treatmentN: n1,
      baselineN: n2
    };
  }
  
  const d = (mean1 - mean2) / pooledSD;
  const ci95 = calculateCohensD95CI(d, n1, n2);
  
  return {
    d,
    ci95,
    interpretation: interpretEffectSize(d),
    treatmentN: n1,
    baselineN: n2
  };
}

export function identifyPhases(
  supplementLogs: SupplementLog[],
  supplementId: number,
  startDate: number,
  endDate: number
): Phase[] {
  const phases: Phase[] = [];
  const DAY_SECONDS = 86400;
  
  const relevantLogs = supplementLogs
    .filter(log => log.supplement_id === supplementId && log.timestamp >= startDate && log.timestamp <= endDate)
    .sort((a, b) => a.timestamp - b.timestamp);
  
  if (relevantLogs.length === 0) {
    phases.push({ type: 'off', start: startDate, end: endDate });
    return phases;
  }
  
  const logDays = new Set<number>();
  for (const log of relevantLogs) {
    const dayStart = log.timestamp - (log.timestamp % DAY_SECONDS);
    logDays.add(dayStart);
  }
  
  let currentDay = startDate - (startDate % DAY_SECONDS);
  const lastDay = endDate - (endDate % DAY_SECONDS);
  
  let currentPhase: Phase | null = null;
  
  while (currentDay <= lastDay) {
    const isOnDay = logDays.has(currentDay);
    const phaseType: 'on' | 'off' = isOnDay ? 'on' : 'off';
    
    if (!currentPhase) {
      currentPhase = { type: phaseType, start: currentDay, end: currentDay + DAY_SECONDS };
    } else if (currentPhase.type === phaseType) {
      currentPhase.end = currentDay + DAY_SECONDS;
    } else {
      phases.push(currentPhase);
      currentPhase = { type: phaseType, start: currentDay, end: currentDay + DAY_SECONDS };
    }
    
    currentDay += DAY_SECONDS;
  }
  
  if (currentPhase) {
    phases.push(currentPhase);
  }
  
  return phases;
}

export async function analyzeSupplementEffects(
  supplementId: number,
  testType: TestType,
  startDate?: number,
  endDate?: number
): Promise<SupplementEffectAnalysis | null> {
  const supplements = await getAllSupplements();
  const supplement = supplements.find(s => s.id === supplementId);
  
  if (!supplement) return null;
  
  const allTestResults = await getCognitiveTestResults();
  const allSupplementLogs = await getSupplementLogs();
  
  const effectiveStart = startDate ?? Math.min(
    ...allTestResults.map(r => r.timestamp),
    ...allSupplementLogs.map(l => l.timestamp)
  );
  const effectiveEnd = endDate ?? Math.floor(Date.now() / 1000);
  
  const testResults = allTestResults.filter(
    r => r.test_type === testType && r.timestamp >= effectiveStart && r.timestamp <= effectiveEnd
  );
  
  if (testResults.length === 0) return null;
  
  const learningCurveParams = await maybeRefitLearningCurve(testType);
  
  const sortedAllResults = [...allTestResults]
    .filter(r => r.test_type === testType)
    .sort((a, b) => a.timestamp - b.timestamp);
  
  const sessionNumberMap = new Map<number, number>();
  sortedAllResults.forEach((r, idx) => {
    sessionNumberMap.set(r.id, idx + 1);
  });
  
  const phases = identifyPhases(allSupplementLogs, supplementId, effectiveStart, effectiveEnd);
  
  const onPhaseDays = new Set<number>();
  for (const phase of phases) {
    if (phase.type === 'on') {
      let day = phase.start;
      while (day < phase.end) {
        onPhaseDays.add(day);
        day += 86400;
      }
    }
  }
  
  const treatmentScores: number[] = [];
  const baselineScores: number[] = [];
  const treatmentResiduals: number[] = [];
  const baselineResiduals: number[] = [];
  const allTestResultsWithTimestamp: TestResultWithTimestamp[] = [];
  const allTestResultsWithResiduals: TestResultWithResidual[] = [];
  
  const pkDataPoints: { score: number; effectMagnitude: number; residual: number }[] = [];
  let pkProfileId: string | null = null;
  
  const supplementLogsForSupplement = allSupplementLogs.filter(
    log => log.supplement_id === supplementId
  );
  
  for (const result of testResults) {
    const resultDay = result.timestamp - (result.timestamp % 86400);
    const sessionNum = sessionNumberMap.get(result.id) || 1;
    
    let expectedScoreVal = result.score;
    let residual = 0;
    
    if (learningCurveParams) {
      expectedScoreVal = computeExpectedScore(
        sessionNum,
        learningCurveParams.ceiling,
        learningCurveParams.floor,
        learningCurveParams.lambda
      );
      residual = result.score - expectedScoreVal;
    }
    
    allTestResultsWithTimestamp.push({ timestamp: result.timestamp, score: result.score });
    allTestResultsWithResiduals.push({
      timestamp: result.timestamp,
      score: result.score,
      sessionNumber: sessionNum,
      expectedScore: expectedScoreVal,
      residual
    });
    
    if (onPhaseDays.has(resultDay)) {
      treatmentScores.push(result.score);
      treatmentResiduals.push(residual);
    } else {
      baselineScores.push(result.score);
      baselineResiduals.push(residual);
    }
    
    const effectResult = await getEffectMagnitudeAtTest(
      supplement.name,
      result.timestamp,
      supplementLogsForSupplement,
      72, // lookbackHours
      supplement.substance_profile_id // use linked profile if available
    );
    
    if (effectResult !== null) {
      pkProfileId = effectResult.profileId;
      const scoreToUse = learningCurveParams ? residual : result.score;
      pkDataPoints.push({
        score: scoreToUse,
        effectMagnitude: effectResult.magnitude,
        residual,
      });
    }
  }
  
  allTestResultsWithTimestamp.sort((a, b) => a.timestamp - b.timestamp);
  allTestResultsWithResiduals.sort((a, b) => a.timestamp - b.timestamp);
  
  const cohensD = calculateCohensD(treatmentScores, baselineScores);
  const cohensDResidual = learningCurveParams 
    ? calculateCohensD(treatmentResiduals, baselineResiduals)
    : null;
  
  const treatmentMean = calculateMean(treatmentScores);
  const baselineMean = calculateMean(baselineScores);
  const percentChange = calculatePercentChange(baselineMean, treatmentMean);
  
  const treatmentResidualMean = calculateMean(treatmentResiduals);
  const baselineResidualMean = calculateMean(baselineResiduals);
  const percentChangeResidual = learningCurveParams 
    ? treatmentResidualMean - baselineResidualMean
    : 0;
  
  const totalSamples = treatmentScores.length + baselineScores.length;
  
  let pkAnalysis: PKAnalysis | undefined;
  let analysisMethod: 'binary' | 'pk_informed' = 'binary';
  
  if (pkProfileId !== null && pkDataPoints.length >= MIN_PK_SAMPLE_SIZE) {
    const pkCorrelation = calculatePKCorrelation(pkDataPoints);
    if (pkCorrelation !== null) {
      pkAnalysis = {
        ...pkCorrelation,
        profileUsed: pkProfileId,
      };
      analysisMethod = 'pk_informed';
    }
  }
  
  return {
    supplementId,
    supplementName: supplement.name,
    testType,
    cohensD,
    cohensDResidual,
    phases,
    treatmentScores,
    baselineScores,
    treatmentResiduals,
    baselineResiduals,
    testResults: allTestResultsWithTimestamp,
    testResultsWithResiduals: allTestResultsWithResiduals,
    percentChange,
    percentChangeResidual,
    sampleSize: totalSamples,
    confidence: getConfidenceLevel(Math.min(treatmentScores.length, baselineScores.length)),
    learningCurveParams,
    pkAnalysis,
    analysisMethod,
  };
}

export async function calculateBaselines(): Promise<BaselineData[]> {
  const allTestResults = await getCognitiveTestResults();
  const allSupplementLogs = await getSupplementLogs();
  
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
  const supplements = await getAllSupplements();
  const allTestResults = await getCognitiveTestResults();
  const allSupplementLogs = await getSupplementLogs();
  const baselines = await calculateBaselines();
  
  const correlations: CorrelationResult[] = [];
  const testTypes: TestType[] = ['reflexes', 'memory', 'judgment', 'rock_dodger', 'pattern_matcher', 'tile_puzzle', 'n_back', 'stroop'];
  
  const learningCurvesMap = new Map<TestType, LearningCurveParams | null>();
  const sessionMaps = new Map<TestType, Map<number, number>>();
  
  for (const testType of testTypes) {
    const params = await maybeRefitLearningCurve(testType);
    learningCurvesMap.set(testType, params);
    
    const typeResults = allTestResults
      .filter(r => r.test_type === testType)
      .sort((a, b) => a.timestamp - b.timestamp);
    const sessionMap = new Map<number, number>();
    typeResults.forEach((r, idx) => sessionMap.set(r.id, idx + 1));
    sessionMaps.set(testType, sessionMap);
  }
  
  for (const supplement of supplements) {
    const supplementLogs = allSupplementLogs.filter(log => log.supplement_id === supplement.id);
    
    if (supplementLogs.length === 0) continue;
    
    for (const testType of testTypes) {
      const baseline = baselines.find(b => b.testType === testType);
      if (!baseline) continue;
      
      const testResults = allTestResults.filter(r => r.test_type === testType);
      const learningCurve = learningCurvesMap.get(testType);
      const sessionMap = sessionMaps.get(testType);
      
      for (const timingWindow of TIMING_WINDOWS) {
        const matchingScores: number[] = [];
        const matchingResiduals: number[] = [];
        
        for (const log of supplementLogs) {
          const windowStart = log.timestamp + (timingWindow.minHours * 3600);
          const windowEnd = log.timestamp + (timingWindow.maxHours * 3600);
          
          const testsInWindow = testResults.filter(
            test => test.timestamp >= windowStart && test.timestamp < windowEnd
          );
          
          for (const test of testsInWindow) {
            matchingScores.push(test.score);
            
            if (learningCurve && sessionMap) {
              const sessionNum = sessionMap.get(test.id) || 1;
              const expected = computeExpectedScore(
                sessionNum,
                learningCurve.ceiling,
                learningCurve.floor,
                learningCurve.lambda
              );
              matchingResiduals.push(test.score - expected);
            }
          }
        }
        
        if (matchingScores.length >= MIN_SAMPLE_SIZE_LOW) {
          const windowAvg = matchingScores.reduce((a, b) => a + b, 0) / matchingScores.length;
          const rawPercentChange = calculatePercentChange(baseline.baselineScore, windowAvg);
          
          let percentChange = rawPercentChange;
          let learningCurveAdjusted = false;
          
          if (learningCurve && matchingResiduals.length > 0) {
            const avgResidual = matchingResiduals.reduce((a, b) => a + b, 0) / matchingResiduals.length;
            percentChange = (avgResidual / baseline.baselineScore) * 100;
            learningCurveAdjusted = true;
          }
          
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
            learningCurveAdjusted,
            rawPercentChange: learningCurveAdjusted ? rawPercentChange : undefined,
          });
        }
      }
    }
  }
  
  return correlations;
}

export async function analyzeDoseResponse(): Promise<DoseResponseResult[]> {
  const supplements = await getAllSupplements();
  const allTestResults = await getCognitiveTestResults();
  const allSupplementLogs = await getSupplementLogs();
  
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
  const supplements = await getAllSupplements();
  const allTestResults = await getCognitiveTestResults();
  const allSupplementLogs = await getSupplementLogs();
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

export async function assessDataQuality(): Promise<DataQuality> {
  const allSupplementLogs = await getSupplementLogs();
  const allTestResults = await getCognitiveTestResults();
  
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
  const baselines = await calculateBaselines();
  
  let correlations: CorrelationResult[] = [];
  let stackInsights: StackCorrelation[] = [];
  let doseResponses: DoseResponseResult[] = [];
  
  const testTypes: TestType[] = ['reflexes', 'memory', 'judgment', 'rock_dodger', 'pattern_matcher', 'tile_puzzle', 'n_back', 'stroop'];
  const learningCurves = new Map<TestType, LearningCurveParams>();
  
  for (const testType of testTypes) {
    const params = await maybeRefitLearningCurve(testType);
    if (params) {
      learningCurves.set(testType, params);
    }
  }
  
  const pkInsights: SupplementPKSummary[] = [];
  
  if (dataQuality.sufficientData) {
    correlations = await analyzeTimingWindows();
    stackInsights = await detectStacks();
    doseResponses = await analyzeDoseResponse();
    
    const supplements = await getAllSupplements();
    for (const supplement of supplements) {
      for (const testType of testTypes) {
        const analysis = await analyzeSupplementEffects(supplement.id, testType);
        if (analysis?.pkAnalysis && analysis.analysisMethod === 'pk_informed') {
          pkInsights.push({
            supplementId: supplement.id,
            supplementName: supplement.name,
            testType,
            pkAnalysis: analysis.pkAnalysis,
            interpretation: interpretPKCorrelation(analysis.pkAnalysis.correlation),
          });
        }
      }
    }
  }
  
  const topFindings = [...correlations]
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
    learningCurves,
    pkInsights,
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
    case 'judgment': return 'Route Planner';
    case 'rock_dodger': return 'Coordination';
    case 'pattern_matcher': return 'Deduction';
    case 'tile_puzzle': return 'Planning';
    case 'n_back': return 'N-Back';
    case 'stroop': return 'Coherence';
    default: return testType;
  }
}

export function formatPKCorrelation(r: number): string {
  const sign = r >= 0 ? '+' : '';
  return `${sign}${r.toFixed(3)}`;
}

export function formatPKAnalysisSummary(analysis: PKAnalysis): string {
  const interpretation = interpretPKCorrelation(analysis.correlation);
  const direction = analysis.correlation >= 0 ? 'positive' : 'negative';
  return `${interpretation} ${direction} correlation (r=${formatPKCorrelation(analysis.correlation)}, p=${analysis.pValue.toFixed(3)}, n=${analysis.n})`;
}

export function getAnalysisMethodLabel(method: 'binary' | 'pk_informed'): string {
  return method === 'pk_informed' ? 'PK-adjusted' : 'Binary (on/off)';
}
