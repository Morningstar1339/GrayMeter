import React, { useState, useCallback } from 'react';
import { StyleSheet, TouchableOpacity, View, FlatList } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { getActivityLogs, ActivityLog, Activity } from '@/database/activities';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useHierarchicalBack } from '@/hooks/use-hierarchical-back';

const getContrastingTextColor = (backgroundColor: string): string => {
  const hex = backgroundColor.replace('#', '');
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? '#000000' : '#FFFFFF';
};

const formatTime = (timestamp: number): string => {
  const date = new Date(timestamp * 1000);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
};

export default function ActivityDetailsScreen() {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const router = useRouter();
  const params = useLocalSearchParams();
  const tintColor = useThemeColor({}, 'tint');

  useHierarchicalBack('activity-details');

  const activity: Activity = {
    id: Number(params.id) || 0,
    name: (params.name as string) || 'Unknown',
    default_value: Number(params.default_value) || 0,
    unit: (params.unit as string) || '',
    icon_id: (params.icon_id as string) || 'fitness',
    color: (params.color as string) || '#007AFF',
  };

  const bgColor = activity.color || '#007AFF';
  const textColor = getContrastingTextColor(bgColor);

  useFocusEffect(
    useCallback(() => {
      const loadData = async () => {
        try {
          const logsData = await getActivityLogs(activity.id, 20);
          setLogs(logsData);
        } catch (error) {
          console.error('Failed to load activity details:', error);
        }
      };
      loadData();
    }, [activity.id])
  );

  const handleLogActivity = () => {
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
  };

  const handleEdit = () => {
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
  };

  const renderLogItem = ({ item }: { item: ActivityLog }) => (
    <View style={styles.logItem}>
      <View style={styles.logDot} />
      <View style={styles.logContent}>
        <ThemedText style={styles.logValue}>
          {item.value} {activity.unit}
        </ThemedText>
        <ThemedText style={styles.logTime}>{formatTime(item.timestamp)}</ThemedText>
      </View>
      {item.notes ? (
        <ThemedText style={styles.logNotes} numberOfLines={1}>
          {item.notes}
        </ThemedText>
      ) : null}
    </View>
  );

  return (
    <ThemedView style={styles.container} safeArea>
      <FlatList
        data={logs}
        keyExtractor={(item) => item.id.toString()}
        renderItem={renderLogItem}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        ListHeaderComponent={
          <>
            {/* Header */}
            <View style={styles.header}>
              <TouchableOpacity
                style={styles.backButton}
                onPress={() => router.back()}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="arrow-back" size={24} color={tintColor} />
              </TouchableOpacity>
              <ThemedText type="title" style={styles.headerTitle} numberOfLines={1}>
                {activity.name}
              </ThemedText>
              <TouchableOpacity
                style={styles.editHeaderButton}
                onPress={handleEdit}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="pencil-outline" size={22} color={tintColor} />
              </TouchableOpacity>
            </View>

            {/* Activity Card */}
            <View style={[styles.heroCard, { backgroundColor: bgColor }]}>
              <Ionicons name={(activity.icon_id || 'fitness') as any} size={48} color={textColor} />
              <ThemedText style={[styles.heroName, { color: textColor }]}>{activity.name}</ThemedText>
              <ThemedText style={[styles.heroValue, { color: textColor, opacity: 0.85 }]}>
                {activity.default_value} {activity.unit}
              </ThemedText>
            </View>

            {/* Log Activity Button */}
            <TouchableOpacity style={[styles.logButton, { backgroundColor: tintColor }]} onPress={handleLogActivity}>
              <Ionicons name="add-circle-outline" size={22} color="white" />
              <ThemedText style={styles.logButtonText}>Log Activity</ThemedText>
            </TouchableOpacity>

            {/* Recent Logs header */}
            <View style={styles.section}>
              <ThemedText style={styles.sectionTitle}>Recent Logs</ThemedText>
            </View>

            {logs.length === 0 && (
              <View style={styles.emptyLogs}>
                <Ionicons name="document-text-outline" size={40} color="#8E8E93" />
                <ThemedText style={styles.emptyText}>No activity logged yet</ThemedText>
              </View>
            )}
          </>
        }
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 12,
  },
  backButton: {
    padding: 8,
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  editHeaderButton: {
    padding: 8,
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroCard: {
    marginHorizontal: 20,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 5,
  },
  heroName: {
    fontSize: 26,
    fontWeight: 'bold',
    marginTop: 12,
    textAlign: 'center',
  },
  heroValue: {
    fontSize: 18,
    marginTop: 4,
  },
  logButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 12,
    marginBottom: 24,
  },
  logButtonText: {
    color: 'white',
    fontSize: 17,
    fontWeight: '600',
  },
  section: {
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#8E8E93',
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  logItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  logDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#007AFF',
    marginRight: 12,
  },
  logContent: {
    flex: 1,
  },
  logValue: {
    fontSize: 15,
    fontWeight: '500',
  },
  logTime: {
    fontSize: 13,
    color: '#8E8E93',
    marginTop: 2,
  },
  logNotes: {
    fontSize: 12,
    color: '#8E8E93',
    maxWidth: 120,
  },
  emptyLogs: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  emptyText: {
    fontSize: 15,
    color: '#8E8E93',
    marginTop: 8,
  },
});
