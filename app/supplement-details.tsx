import React, { useState, useCallback } from 'react';
import { StyleSheet, TouchableOpacity, View, FlatList } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { getSupplementLogs, SupplementLog, getSupplementExclusions, Exclusion, Supplement } from '@/database/supplements';
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

export default function SupplementDetailsScreen() {
  const [logs, setLogs] = useState<SupplementLog[]>([]);
  const [exclusions, setExclusions] = useState<Exclusion[]>([]);
  const router = useRouter();
  const params = useLocalSearchParams();
  const tintColor = useThemeColor({}, 'tint');

  useHierarchicalBack('supplement-details');

  const supplement: Supplement = {
    id: Number(params.id) || 0,
    name: (params.name as string) || 'Unknown',
    default_dosage: Number(params.default_dosage) || 0,
    dosage_unit: (params.dosage_unit as string) || 'mg',
    icon_id: (params.icon_id as string) || 'medical',
    color: (params.color as string) || '#007AFF',
    schedule_enabled: params.schedule_enabled === 'true',
    study_enabled: params.study_enabled === 'true',
  };

  const bgColor = supplement.color || '#007AFF';
  const textColor = getContrastingTextColor(bgColor);

  useFocusEffect(
    useCallback(() => {
      const loadData = async () => {
        try {
          const [logsData, exclusionsData] = await Promise.all([
            getSupplementLogs(supplement.id, 20),
            getSupplementExclusions(supplement.id),
          ]);
          setLogs(logsData);
          setExclusions(exclusionsData);
        } catch (error) {
          console.error('Failed to load supplement details:', error);
        }
      };
      loadData();
    }, [supplement.id])
  );

  const handleLogDose = () => {
    router.push({
      pathname: '/log-supplement',
      params: {
        id: supplement.id.toString(),
        name: supplement.name,
        default_dosage: supplement.default_dosage.toString(),
        dosage_unit: supplement.dosage_unit,
        icon_id: supplement.icon_id || 'medical',
        color: supplement.color || '#007AFF',
        schedule_enabled: supplement.schedule_enabled.toString(),
        study_enabled: supplement.study_enabled.toString(),
      },
    });
  };

  const handleEdit = () => {
    router.push({
      pathname: '/edit-supplement',
      params: {
        id: supplement.id.toString(),
        name: supplement.name,
        default_dosage: supplement.default_dosage.toString(),
        dosage_unit: supplement.dosage_unit,
        icon_id: supplement.icon_id || 'medical',
        color: supplement.color || '#007AFF',
        schedule_enabled: supplement.schedule_enabled.toString(),
        study_enabled: supplement.study_enabled.toString(),
      },
    });
  };

  const renderLogItem = ({ item }: { item: SupplementLog }) => (
    <View style={styles.logItem}>
      <View style={styles.logDot} />
      <View style={styles.logContent}>
        <ThemedText style={styles.logDosage}>
          {item.dosage} {supplement.dosage_unit}
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

  const timeExclusions = exclusions.filter((e) => e.exclusion_type === 'time_window');
  const dosageExclusions = exclusions.filter((e) => e.exclusion_type === 'dosage_limit');

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
              <ThemedText type="title" style={styles.headerTitle}>
                Details
              </ThemedText>
              <TouchableOpacity
                style={styles.editHeaderButton}
                onPress={handleEdit}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="pencil-outline" size={22} color={tintColor} />
              </TouchableOpacity>
            </View>

            {/* Supplement Card */}
            <View style={[styles.heroCard, { backgroundColor: bgColor }]}>
              <Ionicons name={(supplement.icon_id || 'medical') as any} size={48} color={textColor} />
              <ThemedText style={[styles.heroName, { color: textColor }]}>{supplement.name}</ThemedText>
              <ThemedText style={[styles.heroDosage, { color: textColor, opacity: 0.85 }]}>
                {supplement.default_dosage} {supplement.dosage_unit}
              </ThemedText>

              <View style={styles.badgeRow}>
                {supplement.schedule_enabled && (
                  <View style={[styles.badge, { backgroundColor: 'rgba(255,255,255,0.25)' }]}>
                    <Ionicons name="time-outline" size={14} color={textColor} />
                    <ThemedText style={[styles.badgeText, { color: textColor }]}>Scheduled</ThemedText>
                  </View>
                )}
                {supplement.study_enabled && (
                  <View style={[styles.badge, { backgroundColor: 'rgba(255,255,255,0.25)' }]}>
                    <Ionicons name="analytics-outline" size={14} color={textColor} />
                    <ThemedText style={[styles.badgeText, { color: textColor }]}>Study</ThemedText>
                  </View>
                )}
              </View>
            </View>

            {/* Log Dose Button */}
            <TouchableOpacity style={[styles.logButton, { backgroundColor: tintColor }]} onPress={handleLogDose}>
              <Ionicons name="add-circle-outline" size={22} color="white" />
              <ThemedText style={styles.logButtonText}>Log Dose</ThemedText>
            </TouchableOpacity>

            {/* Exclusions / Warnings */}
            {(timeExclusions.length > 0 || dosageExclusions.length > 0) && (
              <View style={styles.section}>
                <ThemedText style={styles.sectionTitle}>Restrictions</ThemedText>
                {timeExclusions.map((ex) => {
                  const p = JSON.parse(ex.parameters);
                  return (
                    <View key={ex.id} style={styles.restrictionItem}>
                      <Ionicons name="time-outline" size={18} color="#FF9500" />
                      <ThemedText style={styles.restrictionText}>
                        Time window: {p.start_time} - {p.end_time}
                      </ThemedText>
                    </View>
                  );
                })}
                {dosageExclusions.map((ex) => {
                  const p = JSON.parse(ex.parameters);
                  return (
                    <View key={ex.id} style={styles.restrictionItem}>
                      <Ionicons name="warning-outline" size={18} color="#FF9500" />
                      <ThemedText style={styles.restrictionText}>
                        Max {p.max_dosage} {supplement.dosage_unit} per {p.time_window_hours}h
                      </ThemedText>
                    </View>
                  );
                })}
              </View>
            )}

            {/* Recent Logs header */}
            <View style={styles.section}>
              <ThemedText style={styles.sectionTitle}>Recent Logs</ThemedText>
            </View>

            {logs.length === 0 && (
              <View style={styles.emptyLogs}>
                <Ionicons name="document-text-outline" size={40} color="#8E8E93" />
                <ThemedText style={styles.emptyText}>No doses logged yet</ThemedText>
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
  heroDosage: {
    fontSize: 18,
    marginTop: 4,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 16,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
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
  restrictionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(255, 149, 0, 0.08)',
    borderRadius: 8,
  },
  restrictionText: {
    fontSize: 14,
    flex: 1,
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
  logDosage: {
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
