import React, { useState, useEffect } from 'react';
import { View, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { MiniCurveGraph } from '@/components/mini-curve-graph';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColor } from '@/hooks/use-theme-color';
import { getSupplements, Supplement } from '@/database/supplements';
import { getSubstanceProfile, SubstanceProfile } from '@/database/pk-curves';
import { getFriendlyProfileName, getConfidenceIndicator } from '@/database/default-profiles';

interface SupplementWithProfile extends Supplement {
  profile?: SubstanceProfile;
}

interface Props {
  onSupplementPress?: (supplement: SupplementWithProfile) => void;
}

export function UserSupplementCurves({ onSupplementPress }: Props) {
  const [supplements, setSupplements] = useState<SupplementWithProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedSupplement, setExpandedSupplement] = useState<number | null>(null);
  const tintColor = useThemeColor({}, 'tint');

  useEffect(() => {
    loadUserSupplements();
  }, []);

  const loadUserSupplements = async () => {
    try {
      const userSupplements = await getSupplements();
      
      // Load profiles for each supplement
      const supplementsWithProfiles = await Promise.all(
        userSupplements.map(async (supplement) => {
          if (supplement.substance_profile_id) {
            try {
              const profile = await getSubstanceProfile(supplement.substance_profile_id);
              return { ...supplement, profile };
            } catch (error) {
              console.error(`Failed to load profile for ${supplement.name}:`, error);
              return supplement;
            }
          }
          return supplement;
        })
      );

      setSupplements(supplementsWithProfiles);
    } catch (error) {
      console.error('Failed to load user supplements:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleExpanded = (supplementId: number) => {
    setExpandedSupplement(expandedSupplement === supplementId ? null : supplementId);
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ThemedText style={styles.loadingText}>Loading your supplements...</ThemedText>
      </View>
    );
  }

  const supplementsWithProfiles = supplements.filter(s => s.profile);

  if (supplementsWithProfiles.length === 0) {
    return (
      <View style={styles.emptyState}>
        <Ionicons name="flask-outline" size={48} color="#8E8E93" />
        <ThemedText style={styles.emptyStateTitle}>No Effect Profiles Yet</ThemedText>
        <ThemedText style={styles.emptyStateText}>
          Add supplements with effect profiles to see pharmacokinetic curves here.
        </ThemedText>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <ThemedText style={styles.sectionTitle}>Your Supplement Profiles</ThemedText>
      <ThemedText style={styles.sectionSubtext}>
        Effect timelines for supplements you've logged
      </ThemedText>
      
      {supplementsWithProfiles.map((supplement) => {
        const isExpanded = expandedSupplement === supplement.id;
        const confidence = getConfidenceIndicator(supplement.profile);
        
        return (
          <View key={supplement.id} style={[styles.supplementCard, { borderColor: tintColor + '20' }]}>
            <TouchableOpacity
              style={styles.supplementHeader}
              onPress={() => toggleExpanded(supplement.id)}
              accessibilityRole="button"
              accessibilityLabel={`Toggle ${supplement.name} details`}
              testID={`btn-toggle-supplement-${supplement.id}`}
            >
              <View style={styles.supplementInfo}>
                <View style={[styles.iconContainer, { backgroundColor: supplement.color }]}>
                  <Ionicons
                    name={supplement.icon_id as any}
                    size={20}
                    color="white"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <ThemedText style={styles.supplementName}>{supplement.name}</ThemedText>
                  <View style={styles.profileInfo}>
                    <Ionicons
                      name={confidence.icon as any}
                      size={14}
                      color={confidence.color}
                    />
                    <ThemedText style={[styles.profileLabel, { color: confidence.color }]}>
                      {getFriendlyProfileName(supplement.profile)}
                    </ThemedText>
                  </View>
                </View>
              </View>
              
              <View style={styles.headerRight}>
                {supplement.profile && (
                  <MiniCurveGraph
                    curves={supplement.profile.curves}
                    width={80}
                    height={40}
                    showAxes={false}
                    showLabels={false}
                    color={supplement.color}
                  />
                )}
                <Ionicons
                  name={isExpanded ? 'chevron-up' : 'chevron-down'}
                  size={20}
                  color={tintColor}
                />
              </View>
            </TouchableOpacity>

            {isExpanded && supplement.profile && (
              <View style={styles.expandedContent}>
                <View style={styles.curveContainer}>
                  <MiniCurveGraph
                    curves={supplement.profile.curves}
                    width={280}
                    height={120}
                    showAxes={true}
                    showLabels={true}
                    color={supplement.color}
                  />
                </View>
                
                <View style={styles.profileDetails}>
                  <ThemedText style={styles.detailsTitle}>Profile Details</ThemedText>
                  {supplement.profile.curves.map((curve, idx) => (
                    <View key={idx} style={styles.curveDetail}>
                      <Ionicons name="trending-up" size={16} color={tintColor} />
                      <ThemedText style={styles.curveDetailText}>
                        {curve.label || curve.type}
                      </ThemedText>
                    </View>
                  ))}
                  
                  <View style={styles.confidenceContainer}>
                    <View style={[styles.confidenceBadge, { backgroundColor: confidence.color + '20' }]}>
                      <ThemedText style={[styles.confidenceText, { color: confidence.color }]}>
                        {confidence.label}
                      </ThemedText>
                    </View>
                  </View>
                  
                  {supplement.profile.toleranceProfile && (
                    <ThemedText style={styles.toleranceInfo}>
                      Tolerance: {supplement.profile.toleranceProfile}
                    </ThemedText>
                  )}
                </View>

                {onSupplementPress && (
                  <TouchableOpacity
                    style={[styles.actionButton, { backgroundColor: tintColor }]}
                    onPress={() => onSupplementPress(supplement)}
                    accessibilityRole="button"
                    accessibilityLabel={`View analytics for ${supplement.name}`}
                    testID={`btn-view-analytics-${supplement.id}`}
                  >
                    <ThemedText style={styles.actionButtonText}>View Analytics</ThemedText>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 14,
    opacity: 0.6,
  },
  emptyState: {
    alignItems: 'center',
    padding: 40,
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyStateText: {
    fontSize: 14,
    opacity: 0.6,
    textAlign: 'center',
    lineHeight: 20,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 4,
  },
  sectionSubtext: {
    fontSize: 14,
    opacity: 0.6,
    marginBottom: 20,
  },
  supplementCard: {
    borderWidth: 1,
    borderRadius: 12,
    marginBottom: 12,
    overflow: 'hidden',
  },
  supplementHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  supplementInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  supplementName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  profileInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  profileLabel: {
    fontSize: 13,
    fontWeight: '500',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  expandedContent: {
    padding: 16,
    paddingTop: 0,
    borderTopWidth: 1,
    borderTopColor: 'rgba(128, 128, 128, 0.2)',
  },
  curveContainer: {
    alignItems: 'center',
    marginBottom: 20,
    padding: 12,
    backgroundColor: 'rgba(128, 128, 128, 0.05)',
    borderRadius: 8,
  },
  profileDetails: {
    marginBottom: 16,
  },
  detailsTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  curveDetail: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  curveDetailText: {
    fontSize: 13,
    opacity: 0.8,
  },
  confidenceContainer: {
    marginTop: 8,
    marginBottom: 8,
  },
  confidenceBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  confidenceText: {
    fontSize: 12,
    fontWeight: '500',
  },
  toleranceInfo: {
    fontSize: 12,
    opacity: 0.6,
    fontStyle: 'italic',
  },
  actionButton: {
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  actionButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
});