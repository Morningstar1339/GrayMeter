import React, { useState, useMemo, useCallback } from 'react';
import { StyleSheet, FlatList, TouchableOpacity, View, SectionList, Alert } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { getAllSupplements, Supplement, getSupplementExclusions, isExclusionActive, getSupplementLogsWithDetails, deleteSupplementLog, SupplementLogWithDetails } from '@/database/supplements';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useRouter, useFocusEffect } from 'expo-router';
import { Swipeable } from 'react-native-gesture-handler';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useHierarchicalBack } from '@/hooks/use-hierarchical-back';

const ITEM_HEIGHT = 72; // row height used in getItemLayout

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

type ViewMode = 'log' | 'history';

interface LogSection {
  title: string;
  data: SupplementLogWithDetails[];
}

const formatDateHeader = (timestamp: number): string => {
  const date = new Date(timestamp * 1000);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const logDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  
  if (logDate.getTime() === today.getTime()) return 'Today';
  if (logDate.getTime() === yesterday.getTime()) return 'Yesterday';
  
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const formatTime = (timestamp: number): string => {
  const date = new Date(timestamp * 1000);
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
};

export default function SupplementsScreen() {
  const [supplements, setSupplements] = useState<Supplement[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>('log');
  const [logHistory, setLogHistory] = useState<SupplementLogWithDetails[]>([]);
  const [exclusionStatuses, setExclusionStatuses] = useState<
    Record<number, { hasTimeExclusion: boolean; hasActiveTimeExclusion: boolean; hasDosageWarning: boolean }>
  >({});
  const tintColor = useThemeColor({}, 'tint');
  const router = useRouter();
  
  useHierarchicalBack('supplements');

  const loadExclusionStatuses = useCallback(async (supplementsList: Supplement[]) => {
    try {
      // Use Promise.all for parallel processing instead of sequential loop
      const statusPromises = supplementsList.map(async (supplement) => {
        const exclusions = await getSupplementExclusions(supplement.id);
        const hasTimeExclusion = exclusions.some((e) => e.exclusion_type === 'time_window');

        // Check if any time exclusion is currently active
        const exclusionCheck = await isExclusionActive(supplement.id, supplement.default_dosage);
        const hasActiveTimeExclusion = exclusionCheck.active && exclusionCheck.type === 'time_window';

        // Check for potential dosage warnings
        const hasDosageWarning = exclusionCheck.active && exclusionCheck.type === 'dosage_limit';

        return {
          id: supplement.id,
          status: {
            hasTimeExclusion,
            hasActiveTimeExclusion,
            hasDosageWarning,
          },
        };
      });

      const results = await Promise.all(statusPromises);

      const statuses: Record<number, { hasTimeExclusion: boolean; hasActiveTimeExclusion: boolean; hasDosageWarning: boolean }> = {};
      results.forEach((result) => {
        statuses[result.id] = result.status;
      });

      setExclusionStatuses(statuses);
    } catch (error) {
      console.error('Failed to load exclusion statuses:', error);
    }
  }, []);

  const loadSupplements = useCallback(async () => {
    try {
      const data = await getAllSupplements();
      setSupplements(data);

      // Load exclusion statuses asynchronously for better performance
      loadExclusionStatuses(data);
    } catch (error) {
      console.error('Failed to load supplements:', error);
    }
  }, [loadExclusionStatuses]);

  const loadHistory = useCallback(async () => {
    try {
      const logs = await getSupplementLogsWithDetails();
      setLogHistory(logs);
    } catch (error) {
      console.error('Failed to load history:', error);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadSupplements();
      if (viewMode === 'history') {
        loadHistory();
      }
    }, [loadSupplements, loadHistory, viewMode])
  );

  const handleDeleteLog = useCallback(async (logId: number) => {
    Alert.alert(
      'Delete Entry',
      'Are you sure you want to delete this log entry?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteSupplementLog(logId);
              setLogHistory(prev => prev.filter(log => log.id !== logId));
            } catch (error) {
              console.error('Failed to delete log:', error);
              Alert.alert('Error', 'Failed to delete log entry');
            }
          }
        }
      ]
    );
  }, []);

  const historySections = useMemo((): LogSection[] => {
    const grouped: Record<string, SupplementLogWithDetails[]> = {};
    logHistory.forEach(log => {
      const header = formatDateHeader(log.timestamp);
      if (!grouped[header]) grouped[header] = [];
      grouped[header].push(log);
    });
    return Object.entries(grouped).map(([title, data]) => ({ title, data }));
  }, [logHistory]);

  const handleSupplementPress = useCallback(
    (supplement: Supplement) => {
      router.push({
        pathname: '/log-supplement',
        params: {
          id: supplement.id.toString(),
          name: supplement.name,
          default_dosage: supplement.default_dosage.toString(),
          dosage_unit: supplement.dosage_unit,
          icon_id: supplement.icon_id || 'medical',
          color: supplement.color || '#00D4FF',
          schedule_enabled: supplement.schedule_enabled.toString(),
          study_enabled: supplement.study_enabled.toString(),
        },
      });
    },
    [router]
  );

  const handleAddSupplement = useCallback(() => {
    router.push('/add-supplement');
  }, [router]);

  const handleHomePress = useCallback(() => {
    router.push('/');
  }, [router]);

  const handleEditSupplement = useCallback(
    (supplement: Supplement, event?: any) => {
      if (event) {
        event.stopPropagation();
      }
      router.push({
        pathname: '/edit-supplement',
        params: {
          id: supplement.id.toString(),
          name: supplement.name,
          default_dosage: supplement.default_dosage.toString(),
          dosage_unit: supplement.dosage_unit,
          icon_id: supplement.icon_id || 'medical',
          color: supplement.color || '#00D4FF',
          schedule_enabled: supplement.schedule_enabled.toString(),
          study_enabled: supplement.study_enabled.toString(),
          substance_profile_id: supplement.substance_profile_id || '',
        },
      });
    },
    [router]
  );

  const getClockIconColor = useCallback(
    (supplement: Supplement) => {
      const status = exclusionStatuses[supplement.id];

      // Red if time exclusion is currently active
      if (status?.hasActiveTimeExclusion) {
        return '#FF3B30';
      }

      // Default scheduling color
      return supplement.schedule_enabled ? '#00D4FF' : '#8E8E93';
    },
    [exclusionStatuses]
  );

  const getSupplementIcon = (iconId?: string) => {
    // Default to pill icon if no icon specified
    return iconId || 'medical';
  };

  const renderSupplement = useCallback(
    ({ item: supplement }: { item: Supplement }) => {
      const itemBackgroundColor = supplement.color || '#00D4FF';
      const textColor = getContrastingTextColor(itemBackgroundColor);

      return (
        <TouchableOpacity
          style={[styles.supplementButton, { backgroundColor: itemBackgroundColor }]}
          onPress={() => handleSupplementPress(supplement)}
          accessibilityRole="button"
          accessibilityLabel={`Log ${supplement.name}`}
          testID={`btn-supplement-${supplement.id}`}
        >
          <View style={styles.supplementContent}>
            <View style={styles.leftSection}>
              <Ionicons
                name={getSupplementIcon(supplement.icon_id) as any}
                size={24}
                color={textColor}
                style={styles.supplementIcon}
              />
              <View style={styles.textSection}>
                <ThemedText
                  type="subtitle"
                  style={[styles.supplementName, { color: textColor }]}
                  numberOfLines={1}
                  ellipsizeMode="tail"
                >
                  {supplement.name}
                </ThemedText>
                <ThemedText style={[styles.dosageText, { color: textColor, opacity: 0.8 }]}>
                  {supplement.default_dosage} {supplement.dosage_unit}
                </ThemedText>
              </View>
            </View>

            <View style={styles.rightSection}>
              <Ionicons
                name="time-outline"
                size={20}
                color={getClockIconColor(supplement)}
                style={styles.clockIcon}
              />
              {exclusionStatuses[supplement.id]?.hasDosageWarning && (
                <Ionicons name="warning" size={18} color="#FF9500" style={styles.warningIcon} />
              )}
              {supplement.study_enabled && (
                <Ionicons name="analytics-outline" size={16} color={textColor} style={styles.studyIcon} />
              )}
              <TouchableOpacity
                style={styles.editButton}
                onPress={(event) => handleEditSupplement(supplement, event)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityRole="button"
                accessibilityLabel={`Edit ${supplement.name}`}
                testID={`btn-edit-supplement-${supplement.id}`}
              >
                <Ionicons name="pencil-outline" size={16} color={textColor} />
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      );
    },
    [exclusionStatuses, getClockIconColor, handleEditSupplement, handleSupplementPress]
  );

  const renderAddButton = useCallback(
    () => (
      <TouchableOpacity style={styles.addButton} onPress={handleAddSupplement} accessibilityRole="button" accessibilityLabel="Add supplement" testID="btn-add-supplement">
        <Ionicons name="add" size={32} color={tintColor} />
        <ThemedText style={[styles.addButtonText, { color: tintColor }]}>Add Supplement</ThemedText>
      </TouchableOpacity>
    ),
    [handleAddSupplement, tintColor]
  );

  const keyExtractor = useCallback((item: Supplement) => item.id.toString(), []);

  const listData = useMemo(() => [...supplements], [supplements]);

  const renderHistoryItem = useCallback(({ item }: { item: SupplementLogWithDetails }) => {
    const renderRightActions = () => (
      <TouchableOpacity
        style={styles.deleteAction}
        onPress={() => handleDeleteLog(item.id)}
        accessibilityRole="button"
        accessibilityLabel="Delete log entry"
        testID={`btn-delete-supplement-log-${item.id}`}
      >
        <Ionicons name="trash-outline" size={24} color="white" />
      </TouchableOpacity>
    );

    return (
      <Swipeable renderRightActions={renderRightActions}>
        <View style={styles.historyItem}>
          <View style={[styles.historyIconContainer, { backgroundColor: item.color || '#00D4FF' }]}>
            <Ionicons name={(item.icon_id || 'medical') as any} size={20} color="white" />
          </View>
          <View style={styles.historyTextContainer}>
            <ThemedText style={styles.historyName}>
              {item.supplement_name} - {item.dosage} {item.dosage_unit}
            </ThemedText>
            <ThemedText style={styles.historyTime}>{formatTime(item.timestamp)}</ThemedText>
          </View>
        </View>
      </Swipeable>
    );
  }, [handleDeleteLog]);

  const renderSectionHeader = useCallback(({ section }: { section: LogSection }) => (
    <ThemedView style={styles.sectionHeader}>
      <ThemedText style={styles.sectionHeaderText}>{section.title}</ThemedText>
    </ThemedView>
  ), []);

  const renderEmptyHistory = useCallback(() => (
    <View style={styles.emptyContainer}>
      <Ionicons name="time-outline" size={64} color="#8E8E93" />
      <ThemedText style={styles.emptyText}>No supplements logged yet</ThemedText>
      <ThemedText style={styles.emptySubtext}>Tap a supplement to log a dose</ThemedText>
    </View>
  ), []);

  const handleViewModeChange = useCallback((mode: ViewMode) => {
    setViewMode(mode);
    if (mode === 'history') {
      loadHistory();
    }
  }, [loadHistory]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemedView style={styles.container} safeArea>
        <ThemedView style={styles.header}>
          <TouchableOpacity
            style={styles.homeButton}
            onPress={handleHomePress}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel="Go home"
            testID="btn-supplements-home"
          >
            <Ionicons name="home-outline" size={24} color={tintColor} />
          </TouchableOpacity>
          <ThemedText type="title" style={styles.title}>
            Supplements
          </ThemedText>
          <View style={styles.headerPlaceholder} />
        </ThemedView>

        <View style={styles.toggleContainer}>
          <TouchableOpacity
            style={[styles.toggleButton, viewMode === 'log' && { backgroundColor: tintColor }]}
            onPress={() => handleViewModeChange('log')}
            accessibilityRole="button"
            accessibilityLabel="Show log view"
            testID="btn-supplements-log-tab"
          >
            <ThemedText style={[styles.toggleText, viewMode === 'log' && styles.toggleTextActive]}>
              Log
            </ThemedText>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleButton, viewMode === 'history' && { backgroundColor: tintColor }]}
            onPress={() => handleViewModeChange('history')}
            accessibilityRole="button"
            accessibilityLabel="Show history view"
            testID="btn-supplements-history-tab"
          >
            <ThemedText style={[styles.toggleText, viewMode === 'history' && styles.toggleTextActive]}>
              History
            </ThemedText>
          </TouchableOpacity>
        </View>

        {viewMode === 'log' ? (
          <FlatList
            data={listData}
            renderItem={renderSupplement}
            keyExtractor={keyExtractor}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
            style={styles.scrollView}
            initialNumToRender={10}
            maxToRenderPerBatch={10}
            windowSize={21}
            removeClippedSubviews={true}
            ListFooterComponent={renderAddButton}
            getItemLayout={(data, index) => {
              void data;
              return {
                length: ITEM_HEIGHT,
                offset: ITEM_HEIGHT * index,
                index,
              };
            }}
          />
        ) : (
          <SectionList
            sections={historySections}
            renderItem={renderHistoryItem}
            renderSectionHeader={renderSectionHeader}
            keyExtractor={(item) => item.id.toString()}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.historyScrollContent}
            style={styles.scrollView}
            ListEmptyComponent={renderEmptyHistory}
            stickySectionHeadersEnabled={true}
          />
        )}
      </ThemedView>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 12,
    marginBottom: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    flex: 1,
    textAlign: 'center',
  },
  homeButton: {
    padding: 8,
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerPlaceholder: {
    width: 40,
    height: 40,
  },
  scrollView: {
    flex: 1,
    paddingHorizontal: 20,
  },
  scrollContent: {
    paddingBottom: 100,
  },
  supplementButton: {
    borderRadius: 12,
    marginBottom: 12,
    paddingVertical: 16,
    paddingHorizontal: 16,
    minHeight: 80,
    width: '100%',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  supplementContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  leftSection: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  supplementIcon: {
    marginRight: 12,
  },
  textSection: {
    flex: 1,
  },
  supplementName: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 4,
  },
  dosageText: {
    fontSize: 14,
    color: '#8E8E93',
  },
  rightSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  clockIcon: {
    marginRight: 4,
  },
  studyIcon: {
    marginRight: 4,
  },
  warningIcon: {
    marginRight: 4,
  },
  editButton: {
    padding: 4,
    minHeight: 44,
    minWidth: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButton: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: '#E0E0E0',
    borderStyle: 'dashed',
    borderRadius: 12,
    paddingVertical: 20,
    marginTop: 20,
    minHeight: 80,
  },
  addButtonText: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 8,
  },
  fab: {
    position: 'absolute',
    bottom: 30,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 4.65,
  },
  toggleContainer: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginBottom: 16,
    backgroundColor: '#E0E0E0',
    borderRadius: 8,
    padding: 4,
  },
  toggleButton: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 6,
  },
  toggleText: {
    fontSize: 14,
    fontWeight: '600',
  },
  toggleTextActive: {
    color: 'white',
  },
  historyScrollContent: {
    paddingBottom: 100,
    flexGrow: 1,
  },
  historyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    backgroundColor: 'transparent',
  },
  historyIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  historyTextContainer: {
    flex: 1,
  },
  historyName: {
    fontSize: 16,
    fontWeight: '500',
  },
  historyTime: {
    fontSize: 13,
    color: '#8E8E93',
    marginTop: 2,
  },
  sectionHeader: {
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  sectionHeaderText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8E8E93',
    textTransform: 'uppercase',
  },
  deleteAction: {
    backgroundColor: '#FF3B30',
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
    color: '#8E8E93',
  },
  emptySubtext: {
    fontSize: 14,
    color: '#8E8E93',
    marginTop: 8,
  },
});
