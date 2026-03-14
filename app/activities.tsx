import React, { useState, useMemo, useCallback } from 'react';
import { StyleSheet, FlatList, TouchableOpacity, View, SectionList, Alert } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { getAllActivities, Activity, getActivityLogsWithDetails, deleteActivityLog, ActivityLogWithDetails } from '@/database/activities';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useRouter, useFocusEffect } from 'expo-router';
import { Swipeable } from 'react-native-gesture-handler';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useHierarchicalBack } from '@/hooks/use-hierarchical-back';

const ITEM_HEIGHT = 72;

const getContrastingTextColor = (backgroundColor: string): string => {
  const hex = backgroundColor.replace('#', '');
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? '#000000' : '#FFFFFF';
};

type ViewMode = 'log' | 'history';

interface LogSection {
  title: string;
  data: ActivityLogWithDetails[];
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

export default function ActivitiesScreen() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>('log');
  const [logHistory, setLogHistory] = useState<ActivityLogWithDetails[]>([]);
  const tintColor = useThemeColor({}, 'tint');
  const router = useRouter();
  
  useHierarchicalBack('activities');

  const loadActivities = useCallback(async () => {
    try {
      const data = await getAllActivities();
      setActivities(data);
    } catch (error) {
      console.error('Failed to load activities:', error);
    }
  }, []);

  const loadHistory = useCallback(async () => {
    try {
      const logs = await getActivityLogsWithDetails();
      setLogHistory(logs);
    } catch (error) {
      console.error('Failed to load history:', error);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadActivities();
      if (viewMode === 'history') {
        loadHistory();
      }
    }, [loadActivities, loadHistory, viewMode])
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
              await deleteActivityLog(logId);
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
    const grouped: Record<string, ActivityLogWithDetails[]> = {};
    logHistory.forEach(log => {
      const header = formatDateHeader(log.timestamp);
      if (!grouped[header]) grouped[header] = [];
      grouped[header].push(log);
    });
    return Object.entries(grouped).map(([title, data]) => ({ title, data }));
  }, [logHistory]);

  const handleActivityPress = useCallback(
    (activity: Activity) => {
      router.push({
        pathname: '/log-activity',
        params: {
          id: activity.id.toString(),
          name: activity.name,
          default_value: activity.default_value.toString(),
          unit: activity.unit,
          icon_id: activity.icon_id || 'fitness',
          color: activity.color || '#007AFF',
        },
      });
    },
    [router]
  );

  const handleAddActivity = useCallback(() => {
    router.push('/add-activity');
  }, [router]);

  const handleEditActivity = useCallback(
    (activity: Activity, event?: any) => {
      if (event) {
        event.stopPropagation();
      }
      router.push({
        pathname: '/edit-activity',
        params: {
          id: activity.id.toString(),
          name: activity.name,
          default_value: activity.default_value.toString(),
          unit: activity.unit,
          icon_id: activity.icon_id || 'fitness',
          color: activity.color || '#007AFF',
        },
      });
    },
    [router]
  );

  const getActivityIcon = (iconId?: string) => {
    return iconId || 'fitness';
  };

  const renderActivity = useCallback(
    ({ item: activity }: { item: Activity }) => {
      const itemBackgroundColor = activity.color || '#007AFF';
      const textColor = getContrastingTextColor(itemBackgroundColor);

      return (
        <TouchableOpacity
          style={[styles.activityButton, { backgroundColor: itemBackgroundColor }]}
          onPress={() => handleActivityPress(activity)}
        >
          <View style={styles.activityContent}>
            <View style={styles.leftSection}>
              <Ionicons
                name={getActivityIcon(activity.icon_id) as any}
                size={24}
                color={textColor}
                style={styles.activityIcon}
              />
              <View style={styles.textSection}>
                <ThemedText
                  type="subtitle"
                  style={[styles.activityName, { color: textColor }]}
                  numberOfLines={1}
                  ellipsizeMode="tail"
                >
                  {activity.name}
                </ThemedText>
                <ThemedText style={[styles.valueText, { color: textColor, opacity: 0.8 }]}>
                  {activity.default_value} {activity.unit}
                </ThemedText>
              </View>
            </View>

            <View style={styles.rightSection}>
              <TouchableOpacity
                style={styles.editButton}
                onPress={(event) => handleEditActivity(activity, event)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="pencil-outline" size={16} color={textColor} />
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      );
    },
    [handleActivityPress, handleEditActivity]
  );

  const renderAddButton = useCallback(
    () => (
      <TouchableOpacity style={styles.addButton} onPress={handleAddActivity}>
        <Ionicons name="add" size={32} color={tintColor} />
        <ThemedText style={[styles.addButtonText, { color: tintColor }]}>Add Activity</ThemedText>
      </TouchableOpacity>
    ),
    [handleAddActivity, tintColor]
  );

  const renderEmptyActivities = useCallback(() => (
    <View style={styles.emptyContainer}>
      <Ionicons name="list-outline" size={64} color="#8E8E93" />
      <ThemedText style={styles.emptyText}>No activities yet</ThemedText>
      <ThemedText style={styles.emptySubtext}>Tap "Add Activity" below to create one</ThemedText>
    </View>
  ), []);

  const keyExtractor = useCallback((item: Activity) => item.id.toString(), []);

  const listData = useMemo(() => [...activities], [activities]);

  const renderHistoryItem = useCallback(({ item }: { item: ActivityLogWithDetails }) => {
    const renderRightActions = () => (
      <TouchableOpacity
        style={styles.deleteAction}
        onPress={() => handleDeleteLog(item.id)}
      >
        <Ionicons name="trash-outline" size={24} color="white" />
      </TouchableOpacity>
    );

    return (
      <Swipeable renderRightActions={renderRightActions}>
        <View style={styles.historyItem}>
          <View style={[styles.historyIconContainer, { backgroundColor: item.color || '#007AFF' }]}>
            <Ionicons name={(item.icon_id || 'fitness') as any} size={20} color="white" />
          </View>
          <View style={styles.historyTextContainer}>
            <ThemedText style={styles.historyName}>
              {item.activity_name} - {item.value} {item.unit}
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
      <ThemedText style={styles.emptyText}>No activities logged yet</ThemedText>
      <ThemedText style={styles.emptySubtext}>Tap an activity to log it</ThemedText>
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
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="chevron-back" size={28} color={tintColor} />
          </TouchableOpacity>
          <ThemedText type="title" style={styles.title}>
            Activities
          </ThemedText>
          <View style={styles.headerPlaceholder} />
        </View>

        <View style={styles.toggleContainer}>
          <TouchableOpacity
            style={[styles.toggleButton, viewMode === 'log' && { backgroundColor: tintColor }]}
            onPress={() => handleViewModeChange('log')}
          >
            <ThemedText style={[styles.toggleText, viewMode === 'log' && styles.toggleTextActive]}>
              Log
            </ThemedText>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleButton, viewMode === 'history' && { backgroundColor: tintColor }]}
            onPress={() => handleViewModeChange('history')}
          >
            <ThemedText style={[styles.toggleText, viewMode === 'history' && styles.toggleTextActive]}>
              History
            </ThemedText>
          </TouchableOpacity>
        </View>

        {viewMode === 'log' ? (
          <FlatList
            data={listData}
            renderItem={renderActivity}
            keyExtractor={keyExtractor}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
            style={styles.scrollView}
            initialNumToRender={10}
            maxToRenderPerBatch={10}
            windowSize={21}
            removeClippedSubviews={true}
            ListEmptyComponent={renderEmptyActivities}
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
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
    marginBottom: 12,
  },
  backButton: {
    padding: 4,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    flex: 1,
    marginLeft: 8,
  },
  headerPlaceholder: {
    width: 32,
  },
  scrollView: {
    flex: 1,
    paddingHorizontal: 20,
  },
  scrollContent: {
    paddingBottom: 100,
  },
  activityButton: {
    borderRadius: 12,
    marginBottom: 12,
    paddingVertical: 16,
    paddingHorizontal: 16,
    minHeight: 80,
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  activityContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  leftSection: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  activityIcon: {
    marginRight: 12,
  },
  textSection: {
    flex: 1,
  },
  activityName: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 4,
  },
  valueText: {
    fontSize: 14,
    color: '#8E8E93',
  },
  rightSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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
  toggleContainer: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginBottom: 20,
    borderRadius: 12,
    backgroundColor: 'rgba(128, 128, 128, 0.1)',
    padding: 4,
  },
  toggleButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  toggleText: {
    fontSize: 15,
    fontWeight: '600',
  },
  toggleTextActive: {
    color: 'white',
  },
  historyScrollContent: {
    paddingBottom: 100,
  },
  historyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 4,
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
    marginBottom: 2,
  },
  historyTime: {
    fontSize: 13,
    color: '#8E8E93',
  },
  sectionHeader: {
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  sectionHeaderText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#8E8E93',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
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
  deleteAction: {
    backgroundColor: '#FF3B30',
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
    height: '100%',
  },
});
