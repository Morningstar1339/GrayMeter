import { withDatabase, asyncStorageGet, asyncStorageSet } from './database';
import { getCognitiveTestResults, CognitiveTestResult } from './cognitive-tests';
import { TestType } from './correlation-analysis';

export interface LearningCurveParams {
  testType: TestType;
  ceiling: number;
  floor: number;
  lambda: number;
  rSquared: number;
  lastUpdated: number;
  nSessions: number;
}

export interface SessionScore {
  sessionNumber: number;
  score: number;
  timestamp: number;
}

export interface LearningCurveAdjustedResult extends CognitiveTestResult {
  sessionNumber: number;
  expectedScore: number;
  residual: number;
}

const MIN_SESSIONS_FOR_FIT = 5;
const LEARNING_CURVES_KEY = 'learning_curves';

export function expectedScore(
  sessionNumber: number,
  ceiling: number,
  floor: number,
  lambda: number
): number {
  return ceiling - (ceiling - floor) * Math.exp(-lambda * sessionNumber);
}

export function computeResidual(
  actualScore: number,
  sessionNumber: number,
  params: LearningCurveParams
): number {
  const expected = expectedScore(sessionNumber, params.ceiling, params.floor, params.lambda);
  return actualScore - expected;
}

function fitLearningCurveParams(sessions: SessionScore[]): {
  ceiling: number;
  floor: number;
  lambda: number;
  rSquared: number;
} | null {
  if (sessions.length < MIN_SESSIONS_FOR_FIT) {
    return null;
  }

  const scores = sessions.map(s => s.score);
  const n = sessions.length;
  
  const initialFloor = Math.min(...scores.slice(0, Math.min(3, n)));
  const recentScores = scores.slice(-Math.min(5, Math.floor(n / 2)));
  const initialCeiling = Math.max(...recentScores) * 1.05;
  
  let bestParams = { ceiling: initialCeiling, floor: initialFloor, lambda: 0.3 };
  let bestSSE = Infinity;
  
  const ceilingRange = [initialCeiling * 0.9, initialCeiling, initialCeiling * 1.1, initialCeiling * 1.2];
  const floorRange = [initialFloor * 0.8, initialFloor, initialFloor * 1.2];
  const lambdaRange = [0.05, 0.1, 0.2, 0.3, 0.5, 0.7, 1.0];
  
  for (const ceiling of ceilingRange) {
    for (const floor of floorRange) {
      if (floor >= ceiling) continue;
      
      for (const lambda of lambdaRange) {
        let sse = 0;
        for (const session of sessions) {
          const predicted = expectedScore(session.sessionNumber, ceiling, floor, lambda);
          sse += Math.pow(session.score - predicted, 2);
        }
        
        if (sse < bestSSE) {
          bestSSE = sse;
          bestParams = { ceiling, floor, lambda };
        }
      }
    }
  }
  
  for (let iteration = 0; iteration < 20; iteration++) {
    const step = Math.pow(0.7, iteration);
    
    for (const cDelta of [-step * 5, 0, step * 5]) {
      for (const fDelta of [-step * 3, 0, step * 3]) {
        for (const lDelta of [-step * 0.1, 0, step * 0.1]) {
          const testCeiling = bestParams.ceiling + cDelta;
          const testFloor = bestParams.floor + fDelta;
          const testLambda = Math.max(0.01, bestParams.lambda + lDelta);
          
          if (testFloor >= testCeiling) continue;
          
          let sse = 0;
          for (const session of sessions) {
            const predicted = expectedScore(session.sessionNumber, testCeiling, testFloor, testLambda);
            sse += Math.pow(session.score - predicted, 2);
          }
          
          if (sse < bestSSE) {
            bestSSE = sse;
            bestParams = { ceiling: testCeiling, floor: testFloor, lambda: testLambda };
          }
        }
      }
    }
  }
  
  const meanScore = scores.reduce((a, b) => a + b, 0) / n;
  const ssTot = scores.reduce((sum, s) => sum + Math.pow(s - meanScore, 2), 0);
  const rSquared = ssTot > 0 ? 1 - (bestSSE / ssTot) : 0;
  
  return {
    ceiling: bestParams.ceiling,
    floor: bestParams.floor,
    lambda: bestParams.lambda,
    rSquared: Math.max(0, Math.min(1, rSquared))
  };
}

export async function fitLearningCurve(testType: TestType): Promise<LearningCurveParams | null> {
  const allResults = await getCognitiveTestResults(testType as any);
  
  if (allResults.length < MIN_SESSIONS_FOR_FIT) {
    return null;
  }
  
  const sortedResults = [...allResults].sort((a, b) => a.timestamp - b.timestamp);
  
  const sessions: SessionScore[] = sortedResults.map((result, index) => ({
    sessionNumber: index + 1,
    score: result.score,
    timestamp: result.timestamp
  }));
  
  const fitResult = fitLearningCurveParams(sessions);
  
  if (!fitResult) {
    return null;
  }
  
  const params: LearningCurveParams = {
    testType,
    ceiling: fitResult.ceiling,
    floor: fitResult.floor,
    lambda: fitResult.lambda,
    rSquared: fitResult.rSquared,
    lastUpdated: Math.floor(Date.now() / 1000),
    nSessions: sessions.length
  };
  
  await saveLearningCurve(params);
  
  return params;
}

export async function saveLearningCurve(params: LearningCurveParams): Promise<void> {
  return await withDatabase(
    async (db) => {
      await db.runAsync(
        `INSERT OR REPLACE INTO user_learning_curves 
         (test_type, ceiling, floor, lambda, r_squared, last_updated, n_sessions)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [params.testType, params.ceiling, params.floor, params.lambda, 
         params.rSquared, params.lastUpdated, params.nSessions]
      );
    },
    'saveLearningCurve',
    async () => {
      const curves = await asyncStorageGet(LEARNING_CURVES_KEY);
      const existing = curves.findIndex((c: any) => c.testType === params.testType);
      if (existing >= 0) {
        curves[existing] = params;
      } else {
        curves.push(params);
      }
      await asyncStorageSet(LEARNING_CURVES_KEY, curves);
    }
  );
}

export async function getLearningCurve(testType: TestType): Promise<LearningCurveParams | null> {
  return await withDatabase(
    async (db) => {
      const result = await db.getFirstAsync(
        'SELECT * FROM user_learning_curves WHERE test_type = ?',
        [testType]
      );
      if (!result) return null;
      const row = result as any;
      return {
        testType: row.test_type,
        ceiling: row.ceiling,
        floor: row.floor,
        lambda: row.lambda,
        rSquared: row.r_squared,
        lastUpdated: row.last_updated,
        nSessions: row.n_sessions
      };
    },
    'getLearningCurve',
    async () => {
      const curves = await asyncStorageGet(LEARNING_CURVES_KEY);
      const found = curves.find((c: any) => c.testType === testType);
      return found || null;
    }
  );
}

export async function getAllLearningCurves(): Promise<LearningCurveParams[]> {
  return await withDatabase(
    async (db) => {
      const results = await db.getAllAsync('SELECT * FROM user_learning_curves');
      return results.map((row: any) => ({
        testType: row.test_type,
        ceiling: row.ceiling,
        floor: row.floor,
        lambda: row.lambda,
        rSquared: row.r_squared,
        lastUpdated: row.last_updated,
        nSessions: row.n_sessions
      }));
    },
    'getAllLearningCurves',
    async () => {
      return await asyncStorageGet(LEARNING_CURVES_KEY);
    }
  );
}

export async function getExpectedScoreForSession(
  testType: TestType,
  sessionNumber: number
): Promise<number | null> {
  const params = await getLearningCurve(testType);
  if (!params) return null;
  return expectedScore(sessionNumber, params.ceiling, params.floor, params.lambda);
}

export async function getSessionNumber(testType: TestType): Promise<number> {
  const results = await getCognitiveTestResults(testType as any);
  return results.length + 1;
}

export async function getLearningCurveAdjustedResults(
  testType: TestType
): Promise<LearningCurveAdjustedResult[]> {
  const results = await getCognitiveTestResults(testType as any);
  const params = await getLearningCurve(testType);
  
  if (!params || results.length < MIN_SESSIONS_FOR_FIT) {
    return results.map((r, index) => ({
      ...r,
      sessionNumber: index + 1,
      expectedScore: r.score,
      residual: 0
    }));
  }
  
  const sortedResults = [...results].sort((a, b) => a.timestamp - b.timestamp);
  
  return sortedResults.map((result, index) => {
    const sessionNum = index + 1;
    const expected = expectedScore(sessionNum, params.ceiling, params.floor, params.lambda);
    return {
      ...result,
      sessionNumber: sessionNum,
      expectedScore: expected,
      residual: result.score - expected
    };
  });
}

export async function updateAllLearningCurves(): Promise<Map<TestType, LearningCurveParams | null>> {
  const testTypes: TestType[] = [
    'reflexes', 'memory', 'judgment', 'rock_dodger', 
    'pattern_matcher', 'tile_puzzle', 'n_back', 'stroop'
  ];
  
  const results = new Map<TestType, LearningCurveParams | null>();
  
  for (const testType of testTypes) {
    const params = await fitLearningCurve(testType);
    results.set(testType, params);
  }
  
  return results;
}

export async function shouldRefitLearningCurve(testType: TestType): Promise<boolean> {
  const params = await getLearningCurve(testType);
  if (!params) return true;
  
  const currentResults = await getCognitiveTestResults(testType as any);
  const newSessions = currentResults.length - params.nSessions;
  
  if (newSessions >= 5) return true;
  
  const daysSinceUpdate = (Date.now() / 1000 - params.lastUpdated) / 86400;
  if (daysSinceUpdate >= 7 && newSessions >= 2) return true;
  
  return false;
}

export async function maybeRefitLearningCurve(testType: TestType): Promise<LearningCurveParams | null> {
  const shouldRefit = await shouldRefitLearningCurve(testType);
  if (shouldRefit) {
    return await fitLearningCurve(testType);
  }
  return await getLearningCurve(testType);
}

export function getLearningCurveInterpretation(params: LearningCurveParams): {
  quality: 'poor' | 'fair' | 'good' | 'excellent';
  description: string;
  improvementPotential: number;
} {
  const quality = params.rSquared >= 0.8 ? 'excellent' :
                  params.rSquared >= 0.6 ? 'good' :
                  params.rSquared >= 0.4 ? 'fair' : 'poor';
  
  const improvementPotential = ((params.ceiling - params.floor) / params.floor) * 100;
  
  const sessionsTo90Percent = params.lambda > 0 ? 
    Math.ceil(-Math.log(0.1) / params.lambda) : 0;
  
  let description = '';
  if (quality === 'excellent' || quality === 'good') {
    description = `Your ${params.testType} performance follows a clear learning curve. `;
    description += `You started around ${params.floor.toFixed(0)} and are approaching a ceiling of ${params.ceiling.toFixed(0)}. `;
    description += `Expected to reach 90% of potential in ~${sessionsTo90Percent} sessions.`;
  } else {
    description = `Learning pattern for ${params.testType} is variable. `;
    description += `More sessions needed for reliable predictions.`;
  }
  
  return { quality, description, improvementPotential };
}
