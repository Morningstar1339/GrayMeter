import React, { useState, useEffect } from 'react';
import { 
  StyleSheet, 
  ScrollView, 
  TouchableOpacity, 
  View, 
  TextInput,
  Modal,
  Alert,
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MiniCurveGraph } from '@/components/mini-curve-graph';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { 
  SubstanceProfile,
  ActivityProfile,
  SubstanceCategory,
  getAllSubstanceProfiles,
  getAllActivityProfiles,
  seedDefaultActivityProfiles,
  formatCategory,
  getCurveDescription,
  getConfidenceTierLabel,
} from '@/database/pk-curves';
import { GENERAL_SUPPLEMENT_PROFILE, getConfidenceIndicator, getFriendlyProfileName } from '@/database/default-profiles';
import { 
  getAllSupplements,
  getSupplementLogs,
  Supplement,
} from '@/database/supplements';

interface CategoryWarning {
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  message: string | null;
}

function getCategoryWarning(category: SubstanceCategory): CategoryWarning {
  switch (category) {
    case 'food_grade':
      return { icon: 'checkmark-circle', color: '#34C759', message: null };
    case 'otc':
      return { 
        icon: 'information-circle', 
        color: '#00D4FF',
        message: 'Adhere to recommended dosage and directions.' 
      };
    case 'untested':
      return { 
        icon: 'warning', 
        color: '#FF9500', 
        message: 'Not approved for human consumption. Consult a medical professional.' 
      };
    case 'prescription':
      return { 
        icon: 'warning', 
        color: '#FF9500', 
        message: 'Prescription only. Use without prescription is strongly discouraged.' 
      };
    case 'schedule_v':
    case 'schedule_iv':
      return { 
        icon: 'warning', 
        color: '#FF9500', 
        message: `${formatCategory(category)}. Use without prescription is strongly discouraged.` 
      };
    case 'schedule_iii':
    case 'schedule_ii':
      return { 
        icon: 'close-circle', 
        color: '#FF6B00', 
        message: `${formatCategory(category)}. Use without prescription is strongly discouraged.` 
      };
    case 'schedule_i':
      return { 
        icon: 'ban', 
        color: '#FF3B30', 
        message: 'Schedule I. Any use is strongly discouraged.' 
      };
    default:
      return { icon: 'help-circle', color: '#8E8E93', message: null };
  }
}

function fuzzyMatch(query: string, target: string): boolean {
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  
  if (t.includes(q)) return true;
  
  let qi = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) qi++;
  }
  return qi === q.length;
}

export default function PriorsScreen() {
  const router = useRouter();
  const tintColor = useThemeColor({}, 'tint');
  const textColor = useThemeColor({}, 'text');
  
  const [searchQuery, setSearchQuery] = useState('');
  const [substances, setSubstances] = useState<SubstanceProfile[]>([]);
  const [activities, setActivities] = useState<ActivityProfile[]>([]);
  const [supplements, setSupplements] = useState<Supplement[]>([]);
  const [loggedSupplementIds, setLoggedSupplementIds] = useState<Set<number>>(new Set());
  const [selectedSubstance, setSelectedSubstance] = useState<SubstanceProfile | null>(null);
  const [selectedActivity, setSelectedActivity] = useState<ActivityProfile | null>(null);
  const [showSubstanceModal, setShowSubstanceModal] = useState(false);
  const [showActivityModal, setShowActivityModal] = useState(false);
  const [enabledActivities, setEnabledActivities] = useState<Set<string>>(new Set());
  
  useEffect(() => {
    loadData();
  }, []);
  
  const loadData = async () => {
    try {
      await seedDefaultActivityProfiles();
      const [subs, acts, supps] = await Promise.all([
        getAllSubstanceProfiles(),
        getAllActivityProfiles(),
        getAllSupplements(),
      ]);
      
      setSubstances(subs);
      setActivities(acts);
      setSupplements(supps);
      
      // Get supplements that have been logged at least once
      const loggedIds = new Set<number>();
      for (const supp of supps) {
        try {
          const logs = await getSupplementLogs(supp.id, 1); // Just get 1 log to check if any exist
          if (logs.length > 0) {
            loggedIds.add(supp.id);
          }
        } catch (error) {
          // Continue if there's an error getting logs for this supplement
          console.log(`Could not get logs for supplement ${supp.id}:`, error);
        }
      }
      setLoggedSupplementIds(loggedIds);
    } catch (error) {
      console.error('Failed to load priors data:', error);
    }
  };
  
  // Get substances linked to user's supplements (show if supplement exists, even without logs)
  const linkedSubstances = substances.filter(sub => {
    return supplements.some(supp => 
      supp.substance_profile_id === sub.id
    );
  });
  
  // Get supplements using general/fallback profile (show if supplement exists, even without logs)
  const generalProfileSupplements = supplements.filter(supp => 
    !supp.substance_profile_id || supp.substance_profile_id === 'general_supplement'
  );
  
  const filteredSubstances = substances.filter(sub => {
    if (!searchQuery.trim()) return false;
    return sub.names.some(name => fuzzyMatch(searchQuery, name));
  });
  
  const getMatchedName = (sub: SubstanceProfile): string => {
    const match = sub.names.find(name => fuzzyMatch(searchQuery, name));
    return match || sub.names[0];
  };
  
  const getLinkedSupplementNames = (substanceId: string): string[] => {
    return supplements
      .filter(supp => supp.substance_profile_id === substanceId && loggedSupplementIds.has(supp.id))
      .map(supp => supp.name);
  };
  
  const handleViewSubstance = (sub: SubstanceProfile) => {
    setSelectedSubstance(sub);
    setShowSubstanceModal(true);
  };
  
  const handleViewActivity = (act: ActivityProfile) => {
    setSelectedActivity(act);
    setShowActivityModal(true);
  };
  
  const toggleActivity = (actId: string) => {
    setEnabledActivities(prev => {
      const next = new Set(prev);
      if (next.has(actId)) {
        next.delete(actId);
      } else {
        next.add(actId);
      }
      return next;
    });
  };
  
  const handleAddCustomSubstance = () => {
    Alert.alert(
      'Custom Substance',
      'Custom substance curve builder coming soon. For now, substances will use default pharmacokinetic assumptions.',
      [{ text: 'OK' }]
    );
  };
  
  const handleAddCustomActivity = () => {
    Alert.alert(
      'Custom Activity',
      'Custom activity curve builder coming soon.',
      [{ text: 'OK' }]
    );
  };
  
  return (
    <ThemedView style={styles.container} safeArea>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          testID="btn-priors-back"
        >
          <Ionicons name="arrow-back" size={24} color={tintColor} />
        </TouchableOpacity>
        <ThemedText style={styles.title}>Pharmacokinetic Analysis</ThemedText>
      </View>
      
      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <ThemedView style={styles.infoCard}>
          <Ionicons name="analytics" size={24} color={tintColor} />
          <ThemedText style={styles.infoText}>
            Pharmacokinetic analysis shows how substances you've logged affect your 
            performance over time. The curves are automatically enabled for supplements 
            you're tracking.
          </ThemedText>
        </ThemedView>
        
        <View style={styles.section}>
          <ThemedText style={styles.sectionTitle}>Your Active Substance Profiles</ThemedText>
          
          {linkedSubstances.length === 0 && generalProfileSupplements.length === 0 ? (
            <ThemedView style={styles.emptyStateCard}>
              <Ionicons name="flask-outline" size={48} color={textColor + '40'} />
              <ThemedText style={styles.emptyStateTitle}>
                Log supplements to see pharmacokinetic analysis
              </ThemedText>
              <ThemedText style={styles.emptyStateDescription}>
                When you log supplements, their pharmacokinetic profiles will automatically 
                appear here to help analyze how they affect your performance over time.
              </ThemedText>
              <TouchableOpacity
                style={[styles.logSupplementButton, { backgroundColor: tintColor }]}
                onPress={() => router.push('/supplements')}
                accessibilityRole="button"
                accessibilityLabel="Log a supplement"
                testID="btn-priors-log-supplement"
              >
                <Ionicons name="add-circle" size={20} color="#fff" />
                <ThemedText style={styles.logSupplementButtonText}>
                  Log a Supplement
                </ThemedText>
              </TouchableOpacity>
            </ThemedView>
          ) : (
            <>
              {/* Matched substance profiles */}
              {
            linkedSubstances.map(sub => {
              const warning = getCategoryWarning(sub.category);
              const linkedSupplements = getLinkedSupplementNames(sub.id);
              
              return (
                <ThemedView key={sub.id} style={styles.substanceCard}>
                  <View style={styles.substanceHeader}>
                    <View style={styles.substanceInfo}>
                      <ThemedText style={styles.substanceName}>
                        {sub.names[0]}
                      </ThemedText>
                      <ThemedText style={styles.linkedSupplements}>
                        Linked to: {linkedSupplements.join(', ')}
                      </ThemedText>
                      <View style={[styles.categoryBadge, { backgroundColor: warning.color + '20' }]}>
                        <Ionicons name={warning.icon} size={12} color={warning.color} />
                        <ThemedText style={[styles.categoryText, { color: warning.color }]}>
                          {formatCategory(sub.category)}
                        </ThemedText>
                        <View style={[styles.activeBadge, { backgroundColor: tintColor + '20' }]}>
                          <Ionicons name="checkmark-circle" size={12} color={tintColor} />
                          <ThemedText style={[styles.activeText, { color: tintColor }]}>
                            Active
                          </ThemedText>
                        </View>
                      </View>
                    </View>
                    <MiniCurveGraph curves={sub.curves} width={100} height={50} />
                  </View>
                  
                  {warning.message && (
                    <View style={[styles.warningBox, { backgroundColor: warning.color + '15' }]}>
                      <Ionicons name={warning.icon} size={14} color={warning.color} />
                      <ThemedText style={[styles.warningText, { color: warning.color }]}>
                        {warning.message}
                      </ThemedText>
                    </View>
                  )}
                  
                  <View style={styles.substanceActions}>
                    <TouchableOpacity
                      style={[styles.viewButton, { borderColor: tintColor }]}
                      onPress={() => handleViewSubstance(sub)}
                      accessibilityRole="button"
                      accessibilityLabel={`View ${sub.names[0]} profile details`}
                      testID={`btn-priors-view-${sub.id}`}
                    >
                      <ThemedText style={[styles.viewButtonText, { color: tintColor }]}>
                        View Profile Details
                      </ThemedText>
                    </TouchableOpacity>
                  </View>
                </ThemedView>
              );
            })}

            {/* General profile supplements */}
            {generalProfileSupplements.map(supp => (
              <ThemedView key={supp.id} style={styles.substanceCard}>
                <View style={styles.substanceHeader}>
                  <View style={styles.substanceInfo}>
                    <ThemedText style={styles.substanceName}>
                      {supp.name}
                    </ThemedText>
                    <ThemedText style={styles.linkedSupplements}>
                      Profile: General Supplement (estimated)
                    </ThemedText>
                    <View style={styles.badgeRow}>
                      <View style={[styles.categoryBadge, { backgroundColor: '#8E8E93' + '20' }]}>
                        <Ionicons name="help-circle" size={12} color="#8E8E93" />
                        <ThemedText style={[styles.categoryText, { color: '#8E8E93' }]}>
                          No specific match
                        </ThemedText>
                      </View>
                      <View style={[styles.activeBadge, { backgroundColor: tintColor + '20' }]}>
                        <Ionicons name="checkmark-circle" size={12} color={tintColor} />
                        <ThemedText style={[styles.activeText, { color: tintColor }]}>
                          Active
                        </ThemedText>
                      </View>
                    </View>
                  </View>
                  <MiniCurveGraph curves={GENERAL_SUPPLEMENT_PROFILE.curves} width={100} height={50} />
                </View>
                
                <View style={styles.substanceActions}>
                  <TouchableOpacity
                    style={[styles.viewButton, { borderColor: tintColor }]}
                    onPress={() => handleViewSubstance(GENERAL_SUPPLEMENT_PROFILE)}
                    accessibilityRole="button"
                    accessibilityLabel="View general supplement profile details"
                    testID="btn-priors-view-general-profile"
                  >
                    <ThemedText style={[styles.viewButtonText, { color: tintColor }]}>
                      View Profile Details
                    </ThemedText>
                  </TouchableOpacity>
                </View>
              </ThemedView>
            ))}
            </>
          )}
        </View>
        
        <View style={styles.section}>
          <ThemedText style={styles.sectionTitle}>Browse All Substances</ThemedText>
          <ThemedText style={styles.sectionDescription}>
            Search to explore the substance database and link profiles to your supplements.
          </ThemedText>
          
          <View style={[styles.searchContainer, { borderColor: textColor + '30' }]}>
            <Ionicons name="search" size={18} color={textColor + '60'} />
            <TextInput
              style={[styles.searchInput, { color: textColor }]}
              placeholder="Search substances..."
              placeholderTextColor={textColor + '50'}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCapitalize="none"
              autoCorrect={false}
              accessibilityLabel="Search substances"
              testID="input-priors-search"
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')} accessibilityRole="button" accessibilityLabel="Clear search" testID="btn-priors-clear-search">
                <Ionicons name="close-circle" size={18} color={textColor + '60'} />
              </TouchableOpacity>
            )}
          </View>
          
          {searchQuery.trim().length > 0 && (
            <View style={styles.searchResults}>
              {filteredSubstances.length === 0 ? (
                <ThemedView style={styles.noResults}>
                  <ThemedText style={styles.noResultsText}>
                    No substances found for "{searchQuery}"
                  </ThemedText>
                  <TouchableOpacity
                    style={[styles.addCustomButton, { borderColor: tintColor }]}
                    onPress={handleAddCustomSubstance}
                    accessibilityRole="button"
                    accessibilityLabel="Add custom substance"
                    testID="btn-priors-add-custom-substance"
                  >
                    <Ionicons name="add" size={18} color={tintColor} />
                    <ThemedText style={[styles.addCustomText, { color: tintColor }]}>
                      Add Custom Substance
                    </ThemedText>
                  </TouchableOpacity>
                </ThemedView>
              ) : (
                filteredSubstances.map(sub => {
                  const warning = getCategoryWarning(sub.category);
                  const matchedName = getMatchedName(sub);
                  const linkedSupplements = getLinkedSupplementNames(sub.id);
                  const isLinked = linkedSupplements.length > 0;
                  
                  return (
                    <ThemedView key={sub.id} style={styles.substanceCard}>
                      <View style={styles.substanceHeader}>
                        <View style={styles.substanceInfo}>
                          <ThemedText style={styles.substanceName}>
                            {matchedName}
                          </ThemedText>
                          {isLinked && (
                            <ThemedText style={styles.linkedSupplements}>
                              Linked to: {linkedSupplements.join(', ')}
                            </ThemedText>
                          )}
                          <View style={styles.badgeRow}>
                            <View style={[styles.categoryBadge, { backgroundColor: warning.color + '20' }]}>
                              <Ionicons name={warning.icon} size={12} color={warning.color} />
                              <ThemedText style={[styles.categoryText, { color: warning.color }]}>
                                {formatCategory(sub.category)}
                              </ThemedText>
                            </View>
                            {isLinked && (
                              <View style={[styles.activeBadge, { backgroundColor: tintColor + '20' }]}>
                                <Ionicons name="checkmark-circle" size={12} color={tintColor} />
                                <ThemedText style={[styles.activeText, { color: tintColor }]}>
                                  Active
                                </ThemedText>
                              </View>
                            )}
                          </View>
                        </View>
                        <MiniCurveGraph curves={sub.curves} width={100} height={50} />
                      </View>
                      
                      {warning.message && (
                        <View style={[styles.warningBox, { backgroundColor: warning.color + '15' }]}>
                          <Ionicons name={warning.icon} size={14} color={warning.color} />
                          <ThemedText style={[styles.warningText, { color: warning.color }]}>
                            {warning.message}
                          </ThemedText>
                        </View>
                      )}
                      
                      <View style={styles.substanceActions}>
                        <TouchableOpacity
                          style={[styles.viewButton, { borderColor: tintColor }]}
                          onPress={() => handleViewSubstance(sub)}
                          accessibilityRole="button"
                          accessibilityLabel={`View ${matchedName} profile`}
                          testID={`btn-priors-search-view-${sub.id}`}
                        >
                          <ThemedText style={[styles.viewButtonText, { color: tintColor }]}>
                            View Profile
                          </ThemedText>
                        </TouchableOpacity>
                      </View>
                    </ThemedView>
                  );
                })
              )}
            </View>
          )}
          
          {searchQuery.trim().length === 0 && (
            <ThemedText style={styles.hintText}>
              Search for a substance to view its pharmacokinetic profile
            </ThemedText>
          )}
        </View>
        
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <ThemedText style={styles.sectionTitle}>Activities</ThemedText>
            <TouchableOpacity
              style={[styles.addButton, { backgroundColor: tintColor + '15' }]}
              onPress={handleAddCustomActivity}
              accessibilityRole="button"
              accessibilityLabel="Add custom activity"
              testID="btn-priors-add-custom-activity"
            >
              <Ionicons name="add" size={18} color={tintColor} />
            </TouchableOpacity>
          </View>
          
          {activities.map(act => {
            const isEnabled = enabledActivities.has(act.id);
            
            return (
              <ThemedView key={act.id} style={styles.activityCard}>
                <TouchableOpacity
                  style={styles.activityMain}
                  onPress={() => handleViewActivity(act)}
                  accessibilityRole="button"
                  accessibilityLabel={`View ${act.name} details`}
                  testID={`btn-priors-activity-${act.id}`}
                >
                  <View style={styles.activityInfo}>
                    <View style={styles.activityHeader}>
                      <ThemedText style={styles.activityName}>{act.name}</ThemedText>
                      <TouchableOpacity
                        onPress={() => handleViewActivity(act)}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        accessibilityRole="button"
                        accessibilityLabel={`${act.name} info`}
                        testID={`btn-priors-activity-info-${act.id}`}
                      >
                        <Ionicons name="information-circle-outline" size={18} color={textColor + '60'} />
                      </TouchableOpacity>
                    </View>
                    <ThemedText style={styles.activityDescription} numberOfLines={2}>
                      {act.description}
                    </ThemedText>
                  </View>
                  <MiniCurveGraph curves={act.curves} width={80} height={45} showLabels={false} />
                </TouchableOpacity>
                
                <TouchableOpacity
                  style={[
                    styles.toggleButton,
                    isEnabled && { backgroundColor: tintColor }
                  ]}
                  onPress={() => toggleActivity(act.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`${isEnabled ? 'Disable' : 'Enable'} ${act.name}`}
                  testID={`btn-priors-toggle-${act.id}`}
                >
                  <Ionicons 
                    name={isEnabled ? 'checkmark' : 'add'} 
                    size={16} 
                    color={isEnabled ? '#fff' : tintColor} 
                  />
                  <ThemedText style={[
                    styles.toggleText,
                    isEnabled && { color: '#fff' }
                  ]}>
                    {isEnabled ? 'Enabled' : 'Enable'}
                  </ThemedText>
                </TouchableOpacity>
              </ThemedView>
            );
          })}
        </View>
      </ScrollView>
      
      <Modal
        visible={showSubstanceModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowSubstanceModal(false)}
      >
        <ThemedView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <ThemedText style={styles.modalTitle}>
              {selectedSubstance?.names[0]}
            </ThemedText>
            <TouchableOpacity onPress={() => setShowSubstanceModal(false)} accessibilityRole="button" accessibilityLabel="Close substance modal" testID="btn-priors-close-substance-modal">
              <Ionicons name="close" size={24} color={textColor} />
            </TouchableOpacity>
          </View>
          
          {selectedSubstance && (
            <ScrollView style={styles.modalContent}>
              <View style={styles.modalSection}>
                <ThemedText style={styles.modalSectionTitle}>Effect Curve</ThemedText>
                <View style={styles.largeGraph}>
                  <MiniCurveGraph 
                    curves={selectedSubstance.curves} 
                    width={300} 
                    height={150} 
                  />
                </View>
              </View>
              
              <View style={styles.modalSection}>
                <ThemedText style={styles.modalSectionTitle}>Category</ThemedText>
                {(() => {
                  const warning = getCategoryWarning(selectedSubstance.category);
                  return (
                    <>
                      <View style={[styles.categoryBadgeLarge, { backgroundColor: warning.color + '20' }]}>
                        <Ionicons name={warning.icon} size={16} color={warning.color} />
                        <ThemedText style={[styles.categoryTextLarge, { color: warning.color }]}>
                          {formatCategory(selectedSubstance.category)}
                        </ThemedText>
                      </View>
                      {warning.message && (
                        <ThemedText style={styles.modalWarning}>{warning.message}</ThemedText>
                      )}
                    </>
                  );
                })()}
              </View>
              
              {getLinkedSupplementNames(selectedSubstance.id).length > 0 && (
                <View style={styles.modalSection}>
                  <ThemedText style={styles.modalSectionTitle}>Linked Supplements</ThemedText>
                  <ThemedText style={styles.modalText}>
                    This profile is automatically active because you've logged: {getLinkedSupplementNames(selectedSubstance.id).join(', ')}
                  </ThemedText>
                </View>
              )}
              
              <View style={styles.modalSection}>
                <ThemedText style={styles.modalSectionTitle}>Curve Details</ThemedText>
                {selectedSubstance.curves.map((curve, idx) => (
                  <View key={idx} style={styles.curveDetail}>
                    <ThemedText style={styles.curveLabel}>
                      {curve.label || `Curve ${idx + 1}`}
                    </ThemedText>
                    <ThemedText style={styles.curveDescription}>
                      {getCurveDescription(curve)}
                    </ThemedText>
                  </View>
                ))}
              </View>
              
              {selectedSubstance.toleranceProfile && (
                <View style={styles.modalSection}>
                  <ThemedText style={styles.modalSectionTitle}>Tolerance</ThemedText>
                  <ThemedText style={styles.modalText}>
                    {selectedSubstance.toleranceProfile.charAt(0).toUpperCase() + 
                     selectedSubstance.toleranceProfile.slice(1)}
                  </ThemedText>
                </View>
              )}
              
              <View style={styles.modalSection}>
                <ThemedText style={styles.modalSectionTitle}>Data Quality</ThemedText>
                <ThemedText style={styles.modalText}>
                  {getConfidenceTierLabel(selectedSubstance.confidenceTier)}
                </ThemedText>
              </View>
              
              {selectedSubstance.names.length > 1 && (
                <View style={styles.modalSection}>
                  <ThemedText style={styles.modalSectionTitle}>Also Known As</ThemedText>
                  <ThemedText style={styles.modalText}>
                    {selectedSubstance.names.slice(1).join(', ')}
                  </ThemedText>
                </View>
              )}
            </ScrollView>
          )}
        </ThemedView>
      </Modal>
      
      <Modal
        visible={showActivityModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowActivityModal(false)}
      >
        <ThemedView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <ThemedText style={styles.modalTitle}>
              {selectedActivity?.name}
            </ThemedText>
            <TouchableOpacity onPress={() => setShowActivityModal(false)} accessibilityRole="button" accessibilityLabel="Close activity modal" testID="btn-priors-close-activity-modal">
              <Ionicons name="close" size={24} color={textColor} />
            </TouchableOpacity>
          </View>
          
          {selectedActivity && (
            <ScrollView style={styles.modalContent}>
              <View style={styles.modalSection}>
                <ThemedText style={styles.modalSectionTitle}>Effect Curve</ThemedText>
                <View style={styles.largeGraph}>
                  <MiniCurveGraph 
                    curves={selectedActivity.curves} 
                    width={300} 
                    height={150} 
                  />
                </View>
              </View>
              
              <View style={styles.modalSection}>
                <ThemedText style={styles.modalSectionTitle}>Description</ThemedText>
                <ThemedText style={styles.modalDescription}>
                  {selectedActivity.description}
                </ThemedText>
              </View>
              
              <View style={styles.modalSection}>
                <ThemedText style={styles.modalSectionTitle}>Curve Details</ThemedText>
                {selectedActivity.curves.map((curve, idx) => (
                  <View key={idx} style={styles.curveDetail}>
                    <ThemedText style={styles.curveLabel}>
                      {curve.label || `Curve ${idx + 1}`}
                    </ThemedText>
                    <ThemedText style={styles.curveDescription}>
                      {getCurveDescription(curve)}
                    </ThemedText>
                  </View>
                ))}
              </View>
              
              <TouchableOpacity
                style={[styles.enableButton, { backgroundColor: tintColor }]}
                onPress={() => {
                  toggleActivity(selectedActivity.id);
                  setShowActivityModal(false);
                }}
                accessibilityRole="button"
                accessibilityLabel={`${enabledActivities.has(selectedActivity.id) ? 'Disable' : 'Enable'} for tracking`}
                testID="btn-priors-toggle-tracking"
              >
                <ThemedText style={styles.enableButtonText}>
                  {enabledActivities.has(selectedActivity.id) ? 'Disable' : 'Enable'} for Tracking
                </ThemedText>
              </TouchableOpacity>
            </ScrollView>
          )}
        </ThemedView>
      </Modal>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  backButton: {
    padding: 4,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  infoCard: {
    flexDirection: 'row',
    padding: 16,
    borderRadius: 12,
    gap: 12,
    marginBottom: 24,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    opacity: 0.8,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
  },
  sectionDescription: {
    fontSize: 14,
    opacity: 0.6,
    marginBottom: 12,
  },
  addButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyStateCard: {
    padding: 24,
    borderRadius: 12,
    alignItems: 'center',
    gap: 12,
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
  },
  emptyStateDescription: {
    fontSize: 14,
    opacity: 0.7,
    textAlign: 'center',
    lineHeight: 20,
  },
  logSupplementButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    marginTop: 8,
  },
  logSupplementButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
  },
  searchResults: {
    marginTop: 12,
  },
  noResults: {
    padding: 20,
    alignItems: 'center',
    gap: 16,
  },
  noResultsText: {
    opacity: 0.6,
    textAlign: 'center',
  },
  addCustomButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderRadius: 8,
  },
  addCustomText: {
    fontSize: 14,
    fontWeight: '500',
  },
  hintText: {
    marginTop: 12,
    opacity: 0.5,
    fontSize: 14,
    textAlign: 'center',
  },
  substanceCard: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  substanceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  substanceInfo: {
    flex: 1,
    gap: 8,
  },
  substanceName: {
    fontSize: 16,
    fontWeight: '600',
  },
  linkedSupplements: {
    fontSize: 13,
    opacity: 0.7,
    fontStyle: 'italic',
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  categoryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  categoryText: {
    fontSize: 11,
    fontWeight: '600',
  },
  activeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  activeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  warningBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 10,
    borderRadius: 8,
    marginTop: 12,
  },
  warningText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 16,
  },
  substanceActions: {
    marginTop: 12,
  },
  viewButton: {
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderRadius: 8,
  },
  viewButtonText: {
    fontSize: 13,
    fontWeight: '500',
  },
  activityCard: {
    padding: 14,
    borderRadius: 12,
    marginBottom: 10,
  },
  activityMain: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  activityInfo: {
    flex: 1,
    marginRight: 12,
  },
  activityHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  activityName: {
    fontSize: 15,
    fontWeight: '600',
  },
  activityDescription: {
    fontSize: 12,
    opacity: 0.6,
    marginTop: 4,
    lineHeight: 16,
  },
  toggleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    marginTop: 10,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  toggleText: {
    fontSize: 12,
    fontWeight: '500',
  },
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(128,128,128,0.2)',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  modalContent: {
    flex: 1,
    padding: 16,
  },
  modalSection: {
    marginBottom: 24,
  },
  modalSectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    opacity: 0.6,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  largeGraph: {
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    backgroundColor: 'rgba(128,128,128,0.1)',
  },
  categoryBadgeLarge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  categoryTextLarge: {
    fontSize: 14,
    fontWeight: '600',
  },
  modalWarning: {
    marginTop: 8,
    fontSize: 13,
    opacity: 0.7,
    lineHeight: 18,
  },
  curveDetail: {
    marginBottom: 12,
    padding: 12,
    borderRadius: 8,
    backgroundColor: 'rgba(128,128,128,0.1)',
  },
  curveLabel: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 4,
  },
  curveDescription: {
    fontSize: 13,
    opacity: 0.7,
  },
  modalText: {
    fontSize: 15,
    lineHeight: 22,
  },
  modalDescription: {
    fontSize: 15,
    lineHeight: 22,
    opacity: 0.8,
  },
  enableButton: {
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 8,
  },
  enableButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});