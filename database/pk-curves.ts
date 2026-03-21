import { withDatabase, asyncStorageGet, asyncStorageSet } from './database';

export type CurveType = 'bateman' | 'linear' | 'withdrawal' | 'periodic';

export type SubstanceCategory = 
  | 'untested' 
  | 'food_grade' 
  | 'otc' 
  | 'prescription' 
  | 'schedule_v' 
  | 'schedule_iv' 
  | 'schedule_iii' 
  | 'schedule_ii' 
  | 'schedule_i';

export type ToleranceProfile = 'none' | 'low' | 'mild' | 'moderate' | 'high' | 'significant';

export interface BatemanParams {
  ka: number;
  ke: number;
  magnitude: number;
}

export interface LinearParams {
  onset: number;
  rate: number;
  magnitude: number;
}

export interface WithdrawalParams {
  peak_day: number;
  resolution_days: number;
  magnitude: number;
}

export interface PeriodicParams {
  period_days: number;
  phase_offset: number;
  amplitude: number;
  baseline?: number;
}

export type CurveParamsUnion = BatemanParams | LinearParams | WithdrawalParams | PeriodicParams;

export interface CurveConfig {
  type: CurveType;
  params: CurveParamsUnion;
  label?: string;
}

export interface SubstanceProfile {
  id: string;
  names: string[];
  category: SubstanceCategory;
  curves: CurveConfig[];
  toleranceProfile?: ToleranceProfile;
  withdrawalProfile?: CurveConfig;
  confidenceTier: 1 | 2 | 3 | 4;
  citations?: string[];
  createdAt: number;
  updatedAt: number;
}

export interface ActivityProfile {
  id: string;
  name: string;
  description: string;
  curves: CurveConfig[];
  createdAt: number;
  updatedAt: number;
}

export interface IntakeEvent {
  timestamp: Date | number;
  dose?: number;
}

export interface EffectPoint {
  time: number;
  effect: number;
}

function evaluateBateman(params: BatemanParams, t: number): number {
  if (t < 0) return 0;
  
  const { ka, ke, magnitude } = params;
  
  if (Math.abs(ka - ke) < 0.001) {
    return magnitude * ka * t * Math.exp(-ka * t);
  }
  
  const effect = magnitude * (Math.exp(-ke * t) - Math.exp(-ka * t)) / (ka - ke);
  return Math.max(0, effect);
}

function evaluateLinear(params: LinearParams, t: number): number {
  const { onset, rate, magnitude } = params;
  
  if (t < onset) return 0;
  
  const effectiveT = t - onset;
  const effect = magnitude - rate * effectiveT;
  return Math.max(0, effect);
}

function evaluateWithdrawal(params: WithdrawalParams, t: number): number {
  if (t < 0) return 0;
  
  const { peak_day, resolution_days, magnitude } = params;
  
  const tDays = t / 24;
  
  if (tDays > peak_day + resolution_days * 3) return 0;
  
  const normalizedT = tDays / peak_day;
  const effect = magnitude * normalizedT * Math.exp(1 - normalizedT);
  
  if (tDays > peak_day) {
    const decay = Math.exp(-(tDays - peak_day) / resolution_days);
    return Math.max(0, effect * decay);
  }
  
  return Math.max(0, effect);
}

function evaluatePeriodic(params: PeriodicParams, t: number): number {
  const { period_days, phase_offset, amplitude, baseline = 0 } = params;
  
  const periodHours = period_days * 24;
  const phaseOffsetHours = phase_offset * 24;
  
  const effect = baseline + amplitude * Math.cos(
    2 * Math.PI * (t - phaseOffsetHours) / periodHours
  );
  
  return effect;
}

export function evaluateCurve(curve: CurveConfig, t: number): number {
  switch (curve.type) {
    case 'bateman':
      return evaluateBateman(curve.params as BatemanParams, t);
    case 'linear':
      return evaluateLinear(curve.params as LinearParams, t);
    case 'withdrawal':
      return evaluateWithdrawal(curve.params as WithdrawalParams, t);
    case 'periodic':
      return evaluatePeriodic(curve.params as PeriodicParams, t);
    default:
      return 0;
  }
}

export function evaluateStack(curves: CurveConfig[], t: number): number {
  return curves.reduce((sum, curve) => sum + evaluateCurve(curve, t), 0);
}

export function getEffectAtTime(
  substanceProfile: CurveConfig[],
  intakeEvents: IntakeEvent[],
  targetTime: Date | number
): number {
  const targetMs = typeof targetTime === 'number' ? targetTime : targetTime.getTime();
  
  let totalEffect = 0;
  
  for (const event of intakeEvents) {
    const eventMs = typeof event.timestamp === 'number' 
      ? event.timestamp 
      : event.timestamp.getTime();
    
    const hoursElapsed = (targetMs - eventMs) / (1000 * 60 * 60);
    
    if (hoursElapsed < 0) continue;
    
    const doseMultiplier = event.dose ?? 1;
    
    for (const curve of substanceProfile) {
      const curveEffect = evaluateCurve(curve, hoursElapsed);
      totalEffect += curveEffect * doseMultiplier;
    }
  }
  
  return totalEffect;
}

export function getEffectCurve(
  substanceProfile: CurveConfig[],
  intakeEvents: IntakeEvent[],
  startTime: Date | number,
  endTime: Date | number,
  resolution: number = 60
): EffectPoint[] {
  const startMs = typeof startTime === 'number' ? startTime : startTime.getTime();
  const endMs = typeof endTime === 'number' ? endTime : endTime.getTime();
  
  const points: EffectPoint[] = [];
  const stepMs = resolution * 60 * 1000;
  
  for (let timeMs = startMs; timeMs <= endMs; timeMs += stepMs) {
    const effect = getEffectAtTime(substanceProfile, intakeEvents, timeMs);
    points.push({
      time: timeMs,
      effect,
    });
  }
  
  return points;
}

export function findPeakEffect(
  substanceProfile: CurveConfig[],
  intakeEvents: IntakeEvent[],
  searchWindowHours: number = 24
): { time: number; effect: number } {
  if (intakeEvents.length === 0) {
    return { time: 0, effect: 0 };
  }
  
  const firstEventMs = Math.min(
    ...intakeEvents.map(e => 
      typeof e.timestamp === 'number' ? e.timestamp : e.timestamp.getTime()
    )
  );
  
  const endMs = firstEventMs + searchWindowHours * 60 * 60 * 1000;
  
  const curve = getEffectCurve(substanceProfile, intakeEvents, firstEventMs, endMs, 5);
  
  let peak = { time: 0, effect: 0 };
  for (const point of curve) {
    if (point.effect > peak.effect) {
      peak = point;
    }
  }
  
  return peak;
}

export function getTimeToEffect(
  substanceProfile: CurveConfig[],
  targetEffectPercent: number = 0.5,
  searchHours: number = 24
): { onset: number; peak: number; offset: number } | null {
  const mockEvent: IntakeEvent = { timestamp: 0, dose: 1 };
  const curve = getEffectCurve(substanceProfile, [mockEvent], 0, searchHours * 60 * 60 * 1000, 1);
  
  if (curve.length === 0) return null;
  
  const maxEffect = Math.max(...curve.map(p => p.effect));
  if (maxEffect === 0) return null;
  
  const threshold = maxEffect * targetEffectPercent;
  
  let onset = -1;
  let peak = 0;
  let peakTime = 0;
  let offset = -1;
  
  for (const point of curve) {
    if (onset === -1 && point.effect >= threshold) {
      onset = point.time / (60 * 60 * 1000);
    }
    if (point.effect > peak) {
      peak = point.effect;
      peakTime = point.time / (60 * 60 * 1000);
    }
    if (onset !== -1 && offset === -1 && point.effect < threshold && point.time > peakTime * 60 * 60 * 1000) {
      offset = point.time / (60 * 60 * 1000);
    }
  }
  
  return {
    onset: onset === -1 ? 0 : onset,
    peak: peakTime,
    offset: offset === -1 ? searchHours : offset,
  };
}

const SUBSTANCE_PROFILES_KEY = 'substance_profiles';
const ACTIVITY_PROFILES_KEY = 'activity_profiles';

export async function saveSubstanceProfile(profile: SubstanceProfile): Promise<void> {
  return await withDatabase(
    async (db) => {
      await db.runAsync(
        `INSERT OR REPLACE INTO substance_profiles 
         (id, names, category, curves, tolerance_profile, withdrawal_profile, confidence_tier, citations, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          profile.id,
          JSON.stringify(profile.names),
          profile.category,
          JSON.stringify(profile.curves),
          profile.toleranceProfile || null,
          profile.withdrawalProfile ? JSON.stringify(profile.withdrawalProfile) : null,
          profile.confidenceTier,
          profile.citations ? JSON.stringify(profile.citations) : null,
          profile.createdAt,
          profile.updatedAt,
        ]
      );
    },
    'saveSubstanceProfile',
    async () => {
      const profiles = await asyncStorageGet(SUBSTANCE_PROFILES_KEY);
      const existingIdx = profiles.findIndex((p: any) => p.id === profile.id);
      if (existingIdx >= 0) {
        profiles[existingIdx] = profile;
      } else {
        profiles.push(profile);
      }
      await asyncStorageSet(SUBSTANCE_PROFILES_KEY, profiles);
    }
  );
}

export async function getSubstanceProfile(id: string): Promise<SubstanceProfile | null> {
  return await withDatabase(
    async (db) => {
      const result = await db.getFirstAsync(
        'SELECT * FROM substance_profiles WHERE id = ?',
        [id]
      );
      if (!result) return null;
      return parseSubstanceProfileRow(result);
    },
    'getSubstanceProfile',
    async () => {
      const profiles = await asyncStorageGet(SUBSTANCE_PROFILES_KEY);
      return profiles.find((p: any) => p.id === id) || null;
    }
  );
}

export async function findSubstanceByName(name: string): Promise<SubstanceProfile | null> {
  const nameLower = name.toLowerCase().trim();
  
  // Don't search for very short strings
  if (nameLower.length < 3) return null;
  
  return await withDatabase(
    async (db) => {
      const results = await db.getAllAsync('SELECT * FROM substance_profiles');
      
      // First try exact match
      for (const row of results) {
        const profile = parseSubstanceProfileRow(row);
        if (profile.names.some(n => n.toLowerCase() === nameLower)) {
          return profile;
        }
      }
      
      // Then try partial match (starts with)
      for (const row of results) {
        const profile = parseSubstanceProfileRow(row);
        if (profile.names.some(n => n.toLowerCase().startsWith(nameLower))) {
          return profile;
        }
      }
      
      // Finally try contains match
      for (const row of results) {
        const profile = parseSubstanceProfileRow(row);
        if (profile.names.some(n => n.toLowerCase().includes(nameLower))) {
          return profile;
        }
      }
      
      return null;
    },
    'findSubstanceByName',
    async () => {
      const profiles = await asyncStorageGet(SUBSTANCE_PROFILES_KEY);
      
      // Exact match
      let match = profiles.find((p: any) => 
        p.names?.some((n: string) => n.toLowerCase() === nameLower)
      );
      if (match) return match;
      
      // Starts with
      match = profiles.find((p: any) => 
        p.names?.some((n: string) => n.toLowerCase().startsWith(nameLower))
      );
      if (match) return match;
      
      // Contains
      match = profiles.find((p: any) => 
        p.names?.some((n: string) => n.toLowerCase().includes(nameLower))
      );
      return match || null;
    }
  );
}

export async function getAllSubstanceProfiles(): Promise<SubstanceProfile[]> {
  return await withDatabase(
    async (db) => {
      const results = await db.getAllAsync('SELECT * FROM substance_profiles ORDER BY id');
      return results.map(parseSubstanceProfileRow);
    },
    'getAllSubstanceProfiles',
    async () => {
      return await asyncStorageGet(SUBSTANCE_PROFILES_KEY);
    }
  );
}

function parseSubstanceProfileRow(row: any): SubstanceProfile {
  return {
    id: row.id,
    names: JSON.parse(row.names),
    category: row.category,
    curves: JSON.parse(row.curves),
    toleranceProfile: row.tolerance_profile || undefined,
    withdrawalProfile: row.withdrawal_profile ? JSON.parse(row.withdrawal_profile) : undefined,
    confidenceTier: row.confidence_tier,
    citations: row.citations ? JSON.parse(row.citations) : undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function saveActivityProfile(profile: ActivityProfile): Promise<void> {
  return await withDatabase(
    async (db) => {
      await db.runAsync(
        `INSERT OR REPLACE INTO activity_profiles 
         (id, name, description, curves, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          profile.id,
          profile.name,
          profile.description,
          JSON.stringify(profile.curves),
          profile.createdAt,
          profile.updatedAt,
        ]
      );
    },
    'saveActivityProfile',
    async () => {
      const profiles = await asyncStorageGet(ACTIVITY_PROFILES_KEY);
      const existingIdx = profiles.findIndex((p: any) => p.id === profile.id);
      if (existingIdx >= 0) {
        profiles[existingIdx] = profile;
      } else {
        profiles.push(profile);
      }
      await asyncStorageSet(ACTIVITY_PROFILES_KEY, profiles);
    }
  );
}

export async function getActivityProfile(id: string): Promise<ActivityProfile | null> {
  return await withDatabase(
    async (db) => {
      const result = await db.getFirstAsync(
        'SELECT * FROM activity_profiles WHERE id = ?',
        [id]
      );
      if (!result) return null;
      return parseActivityProfileRow(result);
    },
    'getActivityProfile',
    async () => {
      const profiles = await asyncStorageGet(ACTIVITY_PROFILES_KEY);
      return profiles.find((p: any) => p.id === id) || null;
    }
  );
}

export async function getAllActivityProfiles(): Promise<ActivityProfile[]> {
  return await withDatabase(
    async (db) => {
      const results = await db.getAllAsync('SELECT * FROM activity_profiles ORDER BY name');
      return results.map(parseActivityProfileRow);
    },
    'getAllActivityProfiles',
    async () => {
      return await asyncStorageGet(ACTIVITY_PROFILES_KEY);
    }
  );
}

function parseActivityProfileRow(row: any): ActivityProfile {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    curves: JSON.parse(row.curves),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const DEFAULT_ACTIVITY_PROFILES: ActivityProfile[] = [
  {
    id: 'aerobic_exercise',
    name: 'Aerobic Exercise',
    description: 'Cardiovascular exercise such as running, cycling, or swimming. Provides rapid cognitive and mood benefits that peak around 30 minutes post-exercise and gradually decline over 4+ hours. Effects include increased BDNF, improved blood flow to the brain, and elevated endorphins.',
    curves: [
      {
        type: 'bateman',
        params: { ka: 2, ke: 0.25, magnitude: 1 } as BatemanParams,
        label: 'Acute cognitive boost',
      },
    ],
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: 'weight_training',
    name: 'Weight Training',
    description: 'Resistance training and strength exercises. Has two distinct effect phases: an immediate energy and focus boost, followed by a delayed inflammatory response (DOMS) that can affect cognitive function 24-48 hours later. The delayed effect represents the recovery period.',
    curves: [
      {
        type: 'bateman',
        params: { ka: 4, ke: 0.2, magnitude: 0.7 } as BatemanParams,
        label: 'Immediate effect',
      },
      {
        type: 'bateman',
        params: { ka: 0.04, ke: 0.02, magnitude: -0.5 } as BatemanParams,
        label: 'DOMS/Recovery period',
      },
    ],
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: 'meditation',
    name: 'Meditation',
    description: 'Mindfulness meditation, focused attention, or contemplative practices. Provides rapid calming effects with quick onset (peaks within 15-30 minutes) and moderate duration (~2 hours). Regular practice may compound benefits over time.',
    curves: [
      {
        type: 'bateman',
        params: { ka: 6, ke: 0.5, magnitude: 1 } as BatemanParams,
        label: 'Calming effect',
      },
    ],
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: 'cold_exposure',
    name: 'Cold Exposure',
    description: 'Cold showers, ice baths, or cold water immersion. Triggers a rapid norepinephrine release with quick onset and moderate duration. Can enhance alertness, mood, and stress resilience.',
    curves: [
      {
        type: 'bateman',
        params: { ka: 10, ke: 0.4, magnitude: 1.2 } as BatemanParams,
        label: 'Alertness boost',
      },
    ],
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: 'sleep',
    name: 'Sleep',
    description: 'Natural sleep cycle effects on cognitive performance. Quality sleep provides cognitive benefits that peak upon waking and gradually decline throughout the day, following circadian patterns.',
    curves: [
      {
        type: 'linear',
        params: { onset: 0, rate: 0.04, magnitude: 1 } as LinearParams,
        label: 'Wakefulness decay',
      },
    ],
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: 'male_hormone_cycle',
    name: 'Male Hormone Cycle',
    description: 'Testosterone follows a weekly pattern in males, with levels typically peaking after approximately 7 days of abstinence from ejaculation, then gradually returning to baseline over the following 1-2 weeks. This models the hormonal rebound effect.',
    curves: [
      {
        type: 'withdrawal',
        params: { peak_day: 7, resolution_days: 14, magnitude: 1 } as WithdrawalParams,
        label: 'Testosterone rebound',
      },
    ],
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: 'female_hormone_cycle',
    name: 'Female Hormone Cycle',
    description: 'The menstrual cycle is approximately 28 days, with hormonal fluctuations affecting mood, energy, and cognitive function. Estrogen and progesterone follow predictable patterns that can influence cognitive test performance throughout the cycle.',
    curves: [
      {
        type: 'periodic',
        params: { period_days: 28, phase_offset: 0, amplitude: 1, baseline: 0 } as PeriodicParams,
        label: 'Hormonal cycle',
      },
    ],
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: 'circadian_rhythm',
    name: 'Circadian Rhythm',
    description: 'The natural 24-hour cycle of alertness and cognitive performance. Performance typically peaks in late morning and has a secondary peak in early evening, with a natural dip in early afternoon (post-lunch dip).',
    curves: [
      {
        type: 'periodic',
        params: { period_days: 1, phase_offset: 0.4, amplitude: 0.3, baseline: 0.7 } as PeriodicParams,
        label: 'Daily alertness cycle',
      },
    ],
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: 'weekly_pattern',
    name: 'Weekly Pattern',
    description: 'Many people experience predictable weekly patterns in mood and cognitive performance, often with lower energy on Mondays and higher energy mid-week. This models the typical work-week effect.',
    curves: [
      {
        type: 'periodic',
        params: { period_days: 7, phase_offset: 2.5, amplitude: 0.2, baseline: 0 } as PeriodicParams,
        label: 'Weekly rhythm',
      },
    ],
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: 'caffeine_withdrawal',
    name: 'Caffeine Withdrawal',
    description: 'When ceasing regular caffeine use, withdrawal symptoms typically peak 1-2 days after the last dose and resolve over 5-9 days. Symptoms include headache, fatigue, and decreased cognitive performance.',
    curves: [
      {
        type: 'withdrawal',
        params: { peak_day: 1.5, resolution_days: 5, magnitude: -0.8 } as WithdrawalParams,
        label: 'Withdrawal symptoms',
      },
    ],
    createdAt: 0,
    updatedAt: 0,
  },
];

export async function seedDefaultActivityProfiles(): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  
  for (const profile of DEFAULT_ACTIVITY_PROFILES) {
    const existing = await getActivityProfile(profile.id);
    if (!existing) {
      await saveActivityProfile({
        ...profile,
        createdAt: now,
        updatedAt: now,
      });
    }
  }
}

export async function seedDefaultSubstanceProfiles(): Promise<void> {
  const { GENERAL_SUPPLEMENT_PROFILE } = await import('./default-profiles');
  
  const existing = await getSubstanceProfile(GENERAL_SUPPLEMENT_PROFILE.id);
  if (!existing) {
    await saveSubstanceProfile({
      ...GENERAL_SUPPLEMENT_PROFILE,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  }
  
  // Seed validated substances from built-in data
  try {
    const { VALIDATED_SUBSTANCES } = await import('./substance-data');
    const result = await importSubstanceProfiles(VALIDATED_SUBSTANCES);
    if (result.inserted > 0) {
      console.log(`Seeded ${result.inserted} validated substance profiles`);
    }
  } catch (error) {
    console.error('Failed to seed validated substances:', error);
  }
}

export function getCurveDescription(curve: CurveConfig): string {
  switch (curve.type) {
    case 'bateman': {
      const p = curve.params as BatemanParams;
      const tMax = Math.log(p.ka / p.ke) / (p.ka - p.ke);
      const peakHours = tMax.toFixed(1);
      const halfLife = (0.693 / p.ke).toFixed(1);
      return `Peak at ~${peakHours}h, half-life ~${halfLife}h`;
    }
    case 'linear': {
      const p = curve.params as LinearParams;
      const duration = (p.magnitude / p.rate).toFixed(1);
      return `Onset at ${p.onset}h, duration ~${duration}h`;
    }
    case 'withdrawal': {
      const p = curve.params as WithdrawalParams;
      return `Peaks at day ${p.peak_day}, resolves over ${p.resolution_days} days`;
    }
    case 'periodic': {
      const p = curve.params as PeriodicParams;
      return `${p.period_days}-day cycle, amplitude ${p.amplitude}`;
    }
    default:
      return 'Unknown curve type';
  }
}

export function formatCurveType(type: CurveType): string {
  switch (type) {
    case 'bateman': return 'Bateman (1st-order)';
    case 'linear': return 'Linear (0-order)';
    case 'withdrawal': return 'Withdrawal/Rebound';
    case 'periodic': return 'Periodic Cycle';
    default: return type;
  }
}

export function formatCategory(category: SubstanceCategory): string {
  switch (category) {
    case 'untested': return 'Untested';
    case 'food_grade': return 'Food Grade';
    case 'otc': return 'Over-the-Counter';
    case 'prescription': return 'Prescription';
    case 'schedule_v': return 'Schedule V';
    case 'schedule_iv': return 'Schedule IV';
    case 'schedule_iii': return 'Schedule III';
    case 'schedule_ii': return 'Schedule II';
    case 'schedule_i': return 'Schedule I';
    default: return category;
  }
}

export function getConfidenceTierLabel(tier: 1 | 2 | 3 | 4): string {
  switch (tier) {
    case 1: return 'High confidence (well-studied)';
    case 2: return 'Moderate confidence (some studies)';
    case 3: return 'Low confidence (limited data)';
    case 4: return 'Theoretical (extrapolated)';
    default: return 'Unknown';
  }
}

export async function updateSubstanceProfile(id: string, updates: Partial<SubstanceProfile>): Promise<void> {
  return await withDatabase(
    async (db) => {
      const setClauses: string[] = [];
      const values: any[] = [];
      
      if (updates.names !== undefined) {
        setClauses.push('names = ?');
        values.push(JSON.stringify(updates.names));
      }
      if (updates.category !== undefined) {
        setClauses.push('category = ?');
        values.push(updates.category);
      }
      if (updates.curves !== undefined) {
        setClauses.push('curves = ?');
        values.push(JSON.stringify(updates.curves));
      }
      if (updates.toleranceProfile !== undefined) {
        setClauses.push('tolerance_profile = ?');
        values.push(updates.toleranceProfile);
      }
      if (updates.withdrawalProfile !== undefined) {
        setClauses.push('withdrawal_profile = ?');
        values.push(updates.withdrawalProfile ? JSON.stringify(updates.withdrawalProfile) : null);
      }
      if (updates.confidenceTier !== undefined) {
        setClauses.push('confidence_tier = ?');
        values.push(updates.confidenceTier);
      }
      if (updates.citations !== undefined) {
        setClauses.push('citations = ?');
        values.push(updates.citations ? JSON.stringify(updates.citations) : null);
      }
      if (updates.updatedAt !== undefined) {
        setClauses.push('updated_at = ?');
        values.push(updates.updatedAt);
      }
      
      if (setClauses.length === 0) return;
      
      values.push(id);
      await db.runAsync(
        `UPDATE substance_profiles SET ${setClauses.join(', ')} WHERE id = ?`,
        values
      );
    },
    'updateSubstanceProfile',
    async () => {
      const profiles = await asyncStorageGet(SUBSTANCE_PROFILES_KEY);
      const idx = profiles.findIndex((p: any) => p.id === id);
      if (idx >= 0) {
        profiles[idx] = { ...profiles[idx], ...updates };
        await asyncStorageSet(SUBSTANCE_PROFILES_KEY, profiles);
      }
    }
  );
}

export interface ImportedSubstance {
  name: string;
  names: string[];
  category: string;
  bioavailability: number | null;
  tmax_hours: number | null;
  half_life_hours: number | null;
  elimination_type: string | null;
  tolerance_profile: string | null;
  withdrawal_profile: string | null;
  pk_model: string | null;
  pk_params: object | null;
  curves: Array<{type: string, params: object}>;
  citations: string[];
  confidence_tier: number;
}

export async function importSubstanceProfiles(substances: ImportedSubstance[]): Promise<{
  inserted: number;
  updated: number;
  skipped: number;
  errors: string[];
}> {
  const results = { inserted: 0, updated: 0, skipped: 0, errors: [] as string[] };
  
  for (const substance of substances) {
    try {
      const existing = await findSubstanceByName(substance.names[0]);
      
      if (existing) {
        if (substance.confidence_tier < existing.confidenceTier) {
          await updateSubstanceProfile(existing.id, {
            names: substance.names,
            category: substance.category as SubstanceCategory,
            curves: substance.curves as CurveConfig[],
            toleranceProfile: substance.tolerance_profile as ToleranceProfile || undefined,
            confidenceTier: substance.confidence_tier as 1 | 2 | 3 | 4,
            citations: substance.citations,
            updatedAt: Date.now()
          });
          results.updated++;
        } else {
          results.skipped++;
        }
      } else {
        const now = Date.now();
        await saveSubstanceProfile({
          id: substance.name.toLowerCase().replace(/[^a-z0-9]/g, '_'),
          names: substance.names,
          category: substance.category as SubstanceCategory,
          curves: substance.curves as CurveConfig[],
          toleranceProfile: substance.tolerance_profile as ToleranceProfile || undefined,
          confidenceTier: substance.confidence_tier as 1 | 2 | 3 | 4,
          citations: substance.citations,
          createdAt: now,
          updatedAt: now,
        });
        results.inserted++;
      }
    } catch (e: any) {
      results.errors.push(`${substance.name}: ${e.message}`);
    }
  }
  
  console.log('=== Substance Import Results ===');
  console.log(`Inserted: ${results.inserted}`);
  console.log(`Updated: ${results.updated}`);
  console.log(`Skipped: ${results.skipped}`);
  console.log(`Errors: ${results.errors.length}`);
  if (results.errors.length > 0) {
    console.log('Error details:', results.errors);
  }
  
  return results;
}
