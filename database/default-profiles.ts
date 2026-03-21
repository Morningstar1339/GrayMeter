import { SubstanceProfile } from './pk-curves';

// Default "General Supplement" profile for unknown substances
// Uses a conservative, generic pharmacokinetic model based on typical supplement absorption
export const GENERAL_SUPPLEMENT_PROFILE: SubstanceProfile = {
  id: 'general_supplement',
  names: ['General Supplement', 'Unknown Supplement', 'Generic'],
  category: 'food_grade',
  curves: [
    {
      type: 'bateman',
      params: {
        ka: 0.5,    // Moderate absorption rate (2h to peak)
        ke: 0.125,  // ~5.5h half-life (conservative)
        magnitude: 1
      },
      label: 'General absorption profile'
    }
  ],
  confidenceTier: 4, // Lowest confidence - theoretical
  citations: ['Generic supplement profile - theoretical approximation'],
  createdAt: Date.now(),
  updatedAt: Date.now()
};

// Enhanced confidence indicators for UX
export function getConfidenceIndicator(profile: SubstanceProfile | null): {
  level: 'high' | 'low';
  icon: string;
  color: string;
  label: string;
  description: string;
} {
  if (!profile || profile.id === 'general_supplement') {
    return {
      level: 'low',
      icon: 'help-circle',
      color: '#8E8E93',
      label: 'General estimate',
      description: 'Using generic supplement profile'
    };
  }
  
  // High confidence for tier 1-2 profiles
  if (profile.confidenceTier <= 2) {
    return {
      level: 'high',
      icon: 'checkmark-circle',
      color: '#34C759',
      label: 'Matched profile',
      description: `Based on ${profile.names[0]} research data`
    };
  }
  
  // Lower confidence for tier 3-4
  return {
    level: 'low',
    icon: 'information-circle',
    color: '#FF9500',
    label: 'Approximate match',
    description: `Limited data for ${profile.names[0]}`
  };
}

// Helper to get user-friendly profile name
export function getFriendlyProfileName(profile: SubstanceProfile | null): string {
  if (!profile) return 'No profile';
  if (profile.id === 'general_supplement') return 'General supplement';
  return profile.names[0];
}

// Auto-assign profile with fallback logic
export async function autoAssignProfile(supplementName: string): Promise<SubstanceProfile> {
  const { findSubstanceByName } = await import('./pk-curves');
  
  // Try to find a matching profile
  const match = await findSubstanceByName(supplementName);
  
  if (match) {
    return match;
  }
  
  // Fallback to general profile
  return GENERAL_SUPPLEMENT_PROFILE;
}