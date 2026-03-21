import React, { useState, useEffect, useCallback, useRef } from 'react';
import { StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, View, KeyboardAvoidingView, Platform } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Supplement, Exclusion, DosageLimitParams, getSupplementExclusions, addExclusion, deleteExclusion, updateSupplementProfileId } from '@/database/supplements';
import { getAllSubstanceProfiles, findSubstanceByName, SubstanceProfile, getCurveDescription, formatCategory } from '@/database/pk-curves';
import { autoAssignProfile, getConfidenceIndicator, getFriendlyProfileName, GENERAL_SUPPLEMENT_PROFILE } from '@/database/default-profiles';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { openDatabase } from '@/database/database';
import { useHierarchicalBack } from '@/hooks/use-hierarchical-back';

const AVAILABLE_ICONS = [
  // Supplements & Medicine
  'medical', 'medkit', 'bandage', 'fitness', 'nutrition', 'flask',
  // Nature & Plants
  'leaf', 'flower', 'rose', 'flower-outline', 'water', 'water-outline',
  // Energy & Effects
  'flash', 'sunny', 'moon', 'bulb', 'sparkles', 'thunderstorm',
  // Body & Health
  'heart', 'body', 'eye', 'brain', 'pulse', 'shield',
  // Food & Drink
  'cafe', 'wine', 'beer', 'pizza', 'fish',
  // Wellness & Mood
  'happy', 'star', 'diamond', 'ribbon', 'trophy',
  // Misc
  'rocket', 'flame', 'snow', 'rainy', 'nuclear', 'ellipse',
];

const DEFAULT_COLORS = [
  // Blues (calming, water-soluble)
  '#007AFF', '#5AC8FA', '#45B7D1', '#5856D6',
  // Greens (natural, herbal)
  '#34C759', '#4ECDC4', '#96CEB4', '#2D8B56',
  // Reds & Oranges (stimulants, energy)
  '#FF3B30', '#FF9500', '#FF6B6B', '#E74C3C',
  // Purples (nootropics, adaptogens)
  '#AF52DE', '#DDA0DD', '#8E44AD', '#6C5CE7',
  // Yellows & Golds (vitamins, minerals)
  '#FFCC00', '#F7DC6F', '#FFEAA7', '#F39C12',
  // Neutrals & Pinks
  '#8E8E93', '#FF2D92', '#98D8C8', '#E17055',
];

const getContrastingTextColor = (backgroundColor: string): string => {
  // Remove # and convert to RGB
  const hex = backgroundColor.replace('#', '');
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);
  
  // Calculate luminance
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  
  // Return black for light backgrounds, white for dark backgrounds
  return luminance > 0.5 ? '#000000' : '#FFFFFF';
};

export default function EditSupplementScreen() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const tintColor = useThemeColor({}, 'tint');
  const textColor = useThemeColor({}, 'text');
  
  useHierarchicalBack('edit-supplement');

  const supplementId = Number(params.id);

  // Parse supplement data from params
  const originalSupplement: Supplement = {
    id: supplementId,
    name: params.name as string,
    default_dosage: Number(params.default_dosage),
    dosage_unit: params.dosage_unit as string,
    icon_id: params.icon_id as string,
    color: (params.color as string) || '#00D4FF',
    schedule_enabled: params.schedule_enabled === 'true',
    study_enabled: params.study_enabled === 'true',
    substance_profile_id: params.substance_profile_id as string || undefined
  };

  const [dosage, setDosage] = useState(originalSupplement.default_dosage.toString());
  const [selectedIcon, setSelectedIcon] = useState(originalSupplement.icon_id || 'medical');
  const [selectedColor, setSelectedColor] = useState(originalSupplement.color || '#00D4FF');
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Exclusion states
  const [exclusions, setExclusions] = useState<Exclusion[]>([]);
  const [showAddDosageLimit, setShowAddDosageLimit] = useState(false);
  const [newDosageLimitMaxStr, setNewDosageLimitMaxStr] = useState('');
  const [newDosageLimitHoursStr, setNewDosageLimitHoursStr] = useState('24');
  
  // PK Profile states
  const [availableProfiles, setAvailableProfiles] = useState<SubstanceProfile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(originalSupplement.substance_profile_id || null);
  const [autoAssignedProfile, setAutoAssignedProfile] = useState<SubstanceProfile | null>(null);
  const [currentProfile, setCurrentProfile] = useState<SubstanceProfile | null>(null);
  const [isAutoAssigned, setIsAutoAssigned] = useState(!originalSupplement.substance_profile_id);
  const [showProfilePicker, setShowProfilePicker] = useState(false);
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);

  const scrollViewRef = useRef<ScrollView>(null);

  useEffect(() => {
    loadExclusions();
    loadProfiles();
  }, []);
  
  // Load current profile on mount
  useEffect(() => {
    const loadCurrentProfile = async () => {
      if (originalSupplement.substance_profile_id) {
        try {
          const profiles = await getAllSubstanceProfiles();
          const profile = profiles.find(p => p.id === originalSupplement.substance_profile_id) || 
                         (originalSupplement.substance_profile_id === 'general_supplement' ? GENERAL_SUPPLEMENT_PROFILE : null);
          if (profile) {
            setCurrentProfile(profile);
          }
        } catch (error) {
          console.error('Failed to load current profile:', error);
        }
      } else {
        // Auto-assign profile for supplements without one
        handleAutoAssignment();
      }
    };
    
    loadCurrentProfile();
  }, []);

  const loadExclusions = async () => {
    try {
      const result = await getSupplementExclusions(supplementId);
      setExclusions(result);
    } catch (error) {
      console.error('Failed to load exclusions:', error);
    }
  };

  const loadProfiles = async () => {
    try {
      const profiles = await getAllSubstanceProfiles();
      setAvailableProfiles(profiles);
    } catch (error) {
      console.error('Failed to load substance profiles:', error);
    }
  };
  
  const handleAutoAssignment = async () => {
    if (!originalSupplement.name.trim()) {
      return;
    }
    
    setIsLoadingProfile(true);
    try {
      const assignedProfile = await autoAssignProfile(originalSupplement.name.trim());
      setAutoAssignedProfile(assignedProfile);
      
      // If supplement doesn't have a profile yet, use auto-assigned
      if (!originalSupplement.substance_profile_id) {
        setSelectedProfileId(assignedProfile.id);
        setCurrentProfile(assignedProfile);
      }
    } catch (error) {
      console.error('Failed to auto-assign profile:', error);
      const fallback = GENERAL_SUPPLEMENT_PROFILE;
      setAutoAssignedProfile(fallback);
      if (!originalSupplement.substance_profile_id) {
        setSelectedProfileId(fallback.id);
        setCurrentProfile(fallback);
      }
    } finally {
      setIsLoadingProfile(false);
    }
  };

  const handleSave = async () => {
    if (!dosage.trim() || isNaN(Number(dosage))) {
      Alert.alert('Error', 'Please enter a valid dosage amount');
      return;
    }

    setIsSubmitting(true);
    try {
      const db = await openDatabase();
      
      // Update basic supplement info
      await db.runAsync(
        'UPDATE supplements SET default_dosage = ?, icon_id = ?, color = ? WHERE id = ?',
        [Number(dosage), selectedIcon, selectedColor, supplementId]
      );
      
      // Update profile association if changed
      if (selectedProfileId !== originalSupplement.substance_profile_id) {
        await updateSupplementProfileId(supplementId, selectedProfileId);
      }

      router.back();
    } catch (error) {
      console.error('Failed to update supplement:', error);
      Alert.alert('Error', 'Failed to save changes. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    router.back();
  };

  const addDosageLimit = async () => {
    const maxDosage = Number(newDosageLimitMaxStr);
    const hours = Number(newDosageLimitHoursStr);
    
    if (isNaN(maxDosage) || maxDosage <= 0) {
      Alert.alert('Invalid Input', 'Please enter a valid maximum dosage');
      return;
    }
    
    if (isNaN(hours) || hours <= 0) {
      Alert.alert('Invalid Input', 'Please enter a valid time window in hours');
      return;
    }
    
    const newLimit: DosageLimitParams = {
      max_dosage: maxDosage,
      time_window_hours: hours
    };
    
    try {
      await addExclusion({
        supplement_id: supplementId,
        exclusion_type: 'dosage_limit',
        parameters: JSON.stringify(newLimit)
      });
      
      setShowAddDosageLimit(false);
      await loadExclusions(); // Refresh the list
    } catch (error) {
      console.error('Failed to add exclusion:', error);
      Alert.alert('Error', 'Failed to add dose limit. Please try again.');
    }
  };

  const removeDosageLimit = async (exclusion: Exclusion) => {
    try {
      await deleteExclusion(exclusion.id);
      await loadExclusions(); // Refresh the list
    } catch (error) {
      console.error('Failed to remove exclusion:', error);
      Alert.alert('Error', 'Failed to remove dose limit. Please try again.');
    }
  };

  const dosageLimitExclusions = exclusions.filter(ex => ex.exclusion_type === 'dosage_limit');

  // Determine which profile to display
  const displayProfile = currentProfile || autoAssignedProfile;
  
  return (
    <KeyboardAvoidingView 
      style={styles.container} 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView 
        ref={scrollViewRef}
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={handleCancel} accessibilityRole="button" accessibilityLabel="Cancel" testID="btn-edit-supplement-cancel">
            <Ionicons name="arrow-back" size={24} color={tintColor} />
          </TouchableOpacity>
          <ThemedText style={styles.headerTitle}>Edit Supplement</ThemedText>
          <TouchableOpacity
            onPress={handleSave}
            disabled={isSubmitting || !dosage.trim()}
            style={[
              styles.saveButton,
              !dosage.trim() && styles.saveButtonDisabled
            ]}
            accessibilityRole="button"
            accessibilityLabel="Save changes"
            testID="btn-edit-supplement-save"
          >
            <ThemedText style={[
              styles.saveButtonText,
              { color: !dosage.trim() ? textColor + '50' : tintColor }
            ]}>
              {isSubmitting ? 'Saving...' : 'Save'}
            </ThemedText>
          </TouchableOpacity>
        </View>

        {/* Supplement Name (read-only) */}
        <ThemedView style={styles.section}>
          <ThemedText style={styles.label}>Name</ThemedText>
          <View style={[styles.readOnlyInput, { borderColor: textColor + '20' }]}>
            <ThemedText style={styles.readOnlyText}>{originalSupplement.name}</ThemedText>
            <Ionicons name="lock-closed" size={16} color={textColor + '40'} />
          </View>
          <ThemedText style={styles.helpText}>
            Supplement name cannot be changed. Create a new supplement if needed.
          </ThemedText>
        </ThemedView>

        {/* Dosage */}
        <View style={styles.doubleSection}>
          <ThemedView style={[styles.section, styles.halfWidth]}>
            <ThemedText style={styles.label}>Dosage</ThemedText>
            <TextInput
              style={[styles.textInput, { color: textColor, borderColor: textColor + '30' }]}
              value={dosage}
              onChangeText={setDosage}
              placeholder="0"
              placeholderTextColor={textColor + '50'}
              keyboardType="numeric"
              accessibilityLabel="Default dosage"
              testID="input-edit-dosage"
            />
          </ThemedView>

          <ThemedView style={[styles.section, styles.halfWidth]}>
            <ThemedText style={styles.label}>Unit</ThemedText>
            <View style={[styles.readOnlyInput, { borderColor: textColor + '20' }]}>
              <ThemedText style={styles.readOnlyText}>{originalSupplement.dosage_unit}</ThemedText>
              <Ionicons name="lock-closed" size={16} color={textColor + '40'} />
            </View>
          </ThemedView>
        </View>

        {/* Appearance Customization */}
        <ThemedView style={styles.section}>
          <ThemedText style={styles.label}>Appearance</ThemedText>
          
          {/* Icon Selection */}
          <View style={styles.iconGrid}>
            {AVAILABLE_ICONS.map((icon) => (
              <TouchableOpacity
                key={icon}
                style={[
                  styles.iconOption,
                  selectedIcon === icon && {
                    backgroundColor: tintColor,
                    transform: [{ scale: 1.1 }]
                  }
                ]}
                onPress={() => setSelectedIcon(icon)}
                accessibilityRole="button"
                accessibilityLabel={`Select ${icon} icon`}
                testID={`btn-edit-icon-${icon}`}
              >
                <Ionicons
                  name={icon as any}
                  size={20}
                  color={selectedIcon === icon ? 'white' : textColor}
                />
              </TouchableOpacity>
            ))}
          </View>

          {/* Color Selection */}
          <View style={styles.colorGrid}>
            {DEFAULT_COLORS.map((color) => (
              <TouchableOpacity
                key={color}
                style={[
                  styles.colorOption,
                  { backgroundColor: color },
                  selectedColor === color && styles.selectedColorOption
                ]}
                onPress={() => setSelectedColor(color)}
                accessibilityRole="button"
                accessibilityLabel={`Select color ${color}`}
                testID={`btn-edit-color-${color.replace('#','')}`}
              />
            ))}
          </View>

          {/* Preview */}
          <View style={[styles.previewCard, { backgroundColor: selectedColor }]}>
            <View style={styles.previewContent}>
              <Ionicons
                name={selectedIcon as any}
                size={24}
                color={getContrastingTextColor(selectedColor)}
                style={styles.previewIcon}
              />
              <View style={styles.previewText}>
                <ThemedText style={[styles.previewName, { color: getContrastingTextColor(selectedColor) }]}>
                  {originalSupplement.name}
                </ThemedText>
                <ThemedText style={[styles.previewDosage, { color: getContrastingTextColor(selectedColor), opacity: 0.8 }]}>
                  {dosage || '0'} {originalSupplement.dosage_unit}
                </ThemedText>
              </View>
            </View>
          </View>
        </ThemedView>

        {/* Effect Profile Section - Clean UX */}
        <ThemedView style={styles.section}>
          <View style={styles.sectionHeaderClean}>
            <ThemedText style={styles.label}>Effect Timeline</ThemedText>
            <ThemedText style={styles.labelSubtext}>
              How this affects your performance over time
            </ThemedText>
          </View>
          
          {/* Profile Assignment Card */}
          {isLoadingProfile ? (
            <View style={styles.profileCard}>
              <View style={styles.profileLoadingState}>
                <View style={[styles.loadingSpinner, { borderTopColor: tintColor }]} />
                <ThemedText style={styles.profileLoadingText}>
                  Loading profile...
                </ThemedText>
              </View>
            </View>
          ) : displayProfile ? (
            <View style={styles.profileCard}>
              <View style={styles.profileRowContainer}>
                <View style={styles.profileMainInfo}>
                  <View style={styles.profileIcon}>
                    <Ionicons 
                      name={getConfidenceIndicator(displayProfile).icon as any} 
                      size={24} 
                      color={getConfidenceIndicator(displayProfile).color} 
                    />
                  </View>
                  <View style={styles.profileDetails}>
                    <View style={styles.profileTitleRow}>
                      <ThemedText style={styles.profileTitle}>
                        {getConfidenceIndicator(displayProfile).level === 'high' ? (
                          <>
                            <ThemedText style={[styles.profileTitle, { color: '#34C759' }]}>✓ Matched: </ThemedText>
                            {getFriendlyProfileName(displayProfile)} profile
                          </>
                        ) : (
                          getFriendlyProfileName(displayProfile) + ' profile'
                        )}
                      </ThemedText>
                    </View>
                    <ThemedText style={styles.profileSubtitle}>
                      {getConfidenceIndicator(displayProfile).description}
                    </ThemedText>
                    {originalSupplement.substance_profile_id && (
                      <ThemedText style={[styles.profileSubtitle, { fontStyle: 'italic', marginTop: 2 }]}>
                        Currently assigned
                      </ThemedText>
                    )}
                  </View>
                </View>
                
                <TouchableOpacity
                  style={styles.changeButton}
                  onPress={() => setShowProfilePicker(true)}
                  accessibilityRole="button"
                  accessibilityLabel="Change effect profile"
                  testID="btn-edit-change-profile"
                >
                  <ThemedText style={[styles.changeButtonText, { color: tintColor }]}>
                    Change
                  </ThemedText>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={styles.profileCard}>
              <View style={styles.profileEmptyState}>
                <Ionicons name="help-circle-outline" size={24} color={textColor + '40'} />
                <ThemedText style={styles.profileEmptyText}>
                  No profile assigned
                </ThemedText>
              </View>
            </View>
          )}

          {/* Profile Picker Modal */}
          {showProfilePicker && (
            <View style={styles.profilePickerOverlay}>
              <View style={styles.profilePickerModal}>
                <View style={styles.profilePickerHeader}>
                  <ThemedText style={styles.profilePickerTitle}>Choose Profile</ThemedText>
                  <TouchableOpacity onPress={() => setShowProfilePicker(false)} accessibilityRole="button" accessibilityLabel="Close profile picker" testID="btn-edit-close-profile-picker">
                    <Ionicons name="close" size={24} color={textColor} />
                  </TouchableOpacity>
                </View>
                
                <ScrollView style={styles.profilePickerContent} showsVerticalScrollIndicator={false}>
                  {/* Auto-assigned option */}
                  {autoAssignedProfile && (
                    <TouchableOpacity
                      style={[
                        styles.profilePickerOption,
                        (isAutoAssigned || selectedProfileId === autoAssignedProfile.id) && styles.profilePickerOptionSelected
                      ]}
                      onPress={() => {
                        setSelectedProfileId(autoAssignedProfile.id);
                        setCurrentProfile(autoAssignedProfile);
                        setIsAutoAssigned(true);
                        setShowProfilePicker(false);
                      }}
                      accessibilityRole="button"
                      testID={`btn-edit-profile-${autoAssignedProfile.id}`}
                    >
                      <View style={styles.profilePickerOptionContent}>
                        <Ionicons 
                          name={getConfidenceIndicator(autoAssignedProfile).icon as any} 
                          size={20} 
                          color={getConfidenceIndicator(autoAssignedProfile).color} 
                        />
                        <View style={styles.profilePickerOptionText}>
                          <ThemedText style={styles.profilePickerOptionName}>
                            {getFriendlyProfileName(autoAssignedProfile)} (auto-matched)
                          </ThemedText>
                          <ThemedText style={styles.profilePickerOptionMeta}>
                            {getConfidenceIndicator(autoAssignedProfile).description}
                          </ThemedText>
                        </View>
                      </View>
                      {(isAutoAssigned || selectedProfileId === autoAssignedProfile.id) && (
                        <Ionicons name="checkmark-circle" size={20} color={tintColor} />
                      )}
                    </TouchableOpacity>
                  )}
                  
                  {/* Divider */}
                  {autoAssignedProfile && (
                    <View style={styles.profilePickerDivider}>
                      <ThemedText style={styles.profilePickerDividerText}>Other options</ThemedText>
                    </View>
                  )}
                  
                  {/* All available profiles */}
                  {availableProfiles
                    .filter(p => p.id !== autoAssignedProfile?.id)
                    .concat([GENERAL_SUPPLEMENT_PROFILE])
                    .map((profile) => {
                      const confidence = getConfidenceIndicator(profile);
                      const isSelected = !isAutoAssigned && selectedProfileId === profile.id;
                      
                      return (
                        <TouchableOpacity
                          key={profile.id}
                          style={[
                            styles.profilePickerOption,
                            isSelected && styles.profilePickerOptionSelected
                          ]}
                          onPress={() => {
                            setSelectedProfileId(profile.id);
                            setCurrentProfile(profile);
                            setIsAutoAssigned(false);
                            setShowProfilePicker(false);
                          }}
                          accessibilityRole="button"
                          testID={`btn-edit-profile-${profile.id}`}
                        >
                          <View style={styles.profilePickerOptionContent}>
                            <Ionicons 
                              name={confidence.icon as any} 
                              size={20} 
                              color={confidence.color} 
                            />
                            <View style={styles.profilePickerOptionText}>
                              <ThemedText style={styles.profilePickerOptionName}>
                                {getFriendlyProfileName(profile)}
                              </ThemedText>
                              <ThemedText style={styles.profilePickerOptionMeta}>
                                {confidence.description}
                              </ThemedText>
                            </View>
                          </View>
                          {isSelected && (
                            <Ionicons name="checkmark-circle" size={20} color={tintColor} />
                          )}
                        </TouchableOpacity>
                      );
                    })}
                </ScrollView>
              </View>
            </View>
          )}
        </ThemedView>

        {/* Dose Limits */}
        <ThemedView style={styles.section}>
          <View style={styles.sectionHeader}>
            <ThemedText style={styles.label}>Dose Limits</ThemedText>
            <TouchableOpacity
              style={[styles.addButton, { backgroundColor: tintColor }]}
              onPress={() => {
                setShowAddDosageLimit(true);
                setNewDosageLimitMaxStr('');
                setNewDosageLimitHoursStr('24');
                setTimeout(() => {
                  scrollViewRef.current?.scrollToEnd({ animated: true });
                }, 100);
              }}
              accessibilityRole="button"
              accessibilityLabel="Add dose limit"
              testID="btn-edit-add-dose-limit"
            >
              <Ionicons name="add" size={20} color="white" />
            </TouchableOpacity>
          </View>
          
          {dosageLimitExclusions.map((exclusion) => {
            const params: DosageLimitParams = JSON.parse(exclusion.parameters);
            return (
              <View key={exclusion.id} style={[styles.exclusionCard, { borderColor: tintColor + '20' }]}>
                <View style={styles.exclusionInfo}>
                  <Ionicons name="warning-outline" size={20} color="#FF9500" />
                  <View style={styles.exclusionDetails}>
                    <ThemedText style={styles.exclusionTitle}>
                      Max {params.max_dosage} {originalSupplement.dosage_unit} per {params.time_window_hours}h
                    </ThemedText>
                    <ThemedText style={styles.exclusionDescription}>
                      Safety limit to prevent overconsumption
                    </ThemedText>
                  </View>
                </View>
                <TouchableOpacity
                  onPress={() => removeDosageLimit(exclusion)}
                  style={styles.exclusionRemove}
                  accessibilityRole="button"
                  accessibilityLabel="Remove dose limit"
                  testID={`btn-edit-remove-dose-limit-${dosageLimitExclusions.indexOf(exclusion)}`}
                >
                  <Ionicons name="close-circle" size={20} color="#FF3B30" />
                </TouchableOpacity>
              </View>
            );
          })}
          
          {showAddDosageLimit && (
            <View style={styles.addExclusionForm}>
              <ThemedText style={styles.addExclusionTitle}>Add Dose Limit</ThemedText>
              
              <View style={styles.addExclusionInputs}>
                <View style={styles.addExclusionInputGroup}>
                  <ThemedText style={styles.addExclusionLabel}>Max Amount</ThemedText>
                  <TextInput
                    style={[styles.addExclusionInput, { color: textColor, borderColor: textColor + '30' }]}
                    value={newDosageLimitMaxStr}
                    onChangeText={setNewDosageLimitMaxStr}
                    keyboardType="numeric"
                    placeholder="100"
                    placeholderTextColor={textColor + '50'}
                    accessibilityLabel="Maximum dosage amount"
                    testID="input-edit-dose-limit-max"
                  />
                </View>
                
                <View style={styles.addExclusionInputGroup}>
                  <ThemedText style={styles.addExclusionLabel}>Time Window (hours)</ThemedText>
                  <TextInput
                    style={[styles.addExclusionInput, { color: textColor, borderColor: textColor + '30' }]}
                    value={newDosageLimitHoursStr}
                    onChangeText={setNewDosageLimitHoursStr}
                    keyboardType="numeric"
                    placeholder="24"
                    placeholderTextColor={textColor + '50'}
                    accessibilityLabel="Time window in hours"
                    testID="input-edit-dose-limit-hours"
                  />
                </View>
              </View>
              
              <View style={styles.addExclusionButtons}>
                <TouchableOpacity
                  style={[styles.addExclusionButton, styles.addExclusionButtonCancel]}
                  onPress={() => setShowAddDosageLimit(false)}
                  accessibilityRole="button"
                  testID="btn-edit-cancel-dose-limit"
                >
                  <ThemedText style={styles.addExclusionButtonCancelText}>Cancel</ThemedText>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.addExclusionButton, { backgroundColor: tintColor }]}
                  onPress={addDosageLimit}
                  accessibilityRole="button"
                  testID="btn-edit-confirm-dose-limit"
                >
                  <ThemedText style={styles.addExclusionButtonSaveText}>Add Limit</ThemedText>
                </TouchableOpacity>
              </View>
            </View>
          )}
          
          {dosageLimitExclusions.length === 0 && !showAddDosageLimit && (
            <ThemedText style={styles.noExclusionsText}>
              No dose limits set. Add one to prevent overconsumption.
            </ThemedText>
          )}
        </ThemedView>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
    paddingTop: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  saveButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  section: {
    marginBottom: 24,
    padding: 16,
    borderRadius: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionHeaderClean: {
    marginBottom: 16,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  labelSubtext: {
    fontSize: 14,
    opacity: 0.6,
    marginTop: 2,
  },
  textInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    fontSize: 16,
  },
  readOnlyInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(128,128,128,0.05)',
  },
  readOnlyText: {
    fontSize: 16,
    opacity: 0.7,
  },
  helpText: {
    fontSize: 12,
    opacity: 0.6,
    marginTop: 6,
  },
  doubleSection: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  halfWidth: {
    flex: 1,
    marginBottom: 0,
  },
  iconGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  iconOption: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(128,128,128,0.3)',
  },
  colorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  colorOption: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  selectedColorOption: {
    borderColor: 'white',
    transform: [{ scale: 1.1 }],
  },
  previewCard: {
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
  },
  previewContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  previewIcon: {
    marginRight: 12,
  },
  previewText: {
    flex: 1,
  },
  previewName: {
    fontSize: 16,
    fontWeight: '600',
  },
  previewDosage: {
    fontSize: 14,
    marginTop: 2,
  },
  
  // Profile Section - Clean UX (same as add-supplement)
  profileCard: {
    borderWidth: 1,
    borderColor: 'rgba(128,128,128,0.2)',
    borderRadius: 12,
    padding: 16,
    backgroundColor: 'rgba(128,128,128,0.05)',
  },
  profileLoadingState: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  loadingSpinner: {
    width: 20,
    height: 20,
    borderWidth: 2,
    borderRadius: 10,
    borderColor: 'rgba(128,128,128,0.3)',
    borderTopColor: '#00D4FF',
  },
  profileLoadingText: {
    fontSize: 15,
    opacity: 0.7,
  },
  profileRowContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  profileMainInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  profileIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(128,128,128,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  profileDetails: {
    flex: 1,
  },
  profileTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  profileTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  profileSubtitle: {
    fontSize: 13,
    opacity: 0.7,
  },
  changeButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: 'rgba(128,128,128,0.1)',
    alignSelf: 'flex-start',
  },
  changeButtonText: {
    fontSize: 13,
    fontWeight: '500',
  },
  profileEmptyState: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    justifyContent: 'center',
    paddingVertical: 8,
  },
  profileEmptyText: {
    fontSize: 15,
    opacity: 0.5,
  },
  
  // Profile Picker Modal (same as add-supplement)
  profilePickerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    zIndex: 1000,
    justifyContent: 'center',
    alignItems: 'center',
  },
  profilePickerModal: {
    backgroundColor: 'white',
    borderRadius: 16,
    maxHeight: '80%',
    width: '90%',
    maxWidth: 400,
  },
  profilePickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(128,128,128,0.2)',
  },
  profilePickerTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  profilePickerContent: {
    maxHeight: 400,
  },
  profilePickerOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(128,128,128,0.1)',
  },
  profilePickerOptionSelected: {
    backgroundColor: 'rgba(0,122,255,0.08)',
  },
  profilePickerOptionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  profilePickerOptionText: {
    marginLeft: 12,
    flex: 1,
  },
  profilePickerOptionName: {
    fontSize: 15,
    fontWeight: '500',
    marginBottom: 2,
  },
  profilePickerOptionMeta: {
    fontSize: 13,
    opacity: 0.6,
  },
  profilePickerDivider: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: 'rgba(128,128,128,0.05)',
  },
  profilePickerDividerText: {
    fontSize: 13,
    opacity: 0.6,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // Existing dose limit styles
  addButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  exclusionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderWidth: 1,
    borderRadius: 8,
    marginBottom: 8,
  },
  exclusionInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  exclusionDetails: {
    marginLeft: 10,
    flex: 1,
  },
  exclusionTitle: {
    fontSize: 14,
    fontWeight: '500',
  },
  exclusionDescription: {
    fontSize: 12,
    opacity: 0.6,
    marginTop: 1,
  },
  exclusionRemove: {
    padding: 4,
  },
  addExclusionForm: {
    borderWidth: 1,
    borderColor: 'rgba(128,128,128,0.3)',
    borderRadius: 8,
    padding: 16,
    marginTop: 8,
  },
  addExclusionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  addExclusionInputs: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  addExclusionInputGroup: {
    flex: 1,
  },
  addExclusionLabel: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 6,
  },
  addExclusionInput: {
    borderWidth: 1,
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    fontSize: 14,
  },
  addExclusionButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  addExclusionButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 6,
    alignItems: 'center',
  },
  addExclusionButtonCancel: {
    backgroundColor: 'rgba(128,128,128,0.2)',
  },
  addExclusionButtonCancelText: {
    fontSize: 14,
    fontWeight: '500',
  },
  addExclusionButtonSaveText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '500',
  },
  noExclusionsText: {
    fontSize: 14,
    opacity: 0.5,
    textAlign: 'center',
    fontStyle: 'italic',
    paddingVertical: 16,
  },
});