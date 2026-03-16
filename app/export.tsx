import React, { useState, useEffect } from 'react';
import { StyleSheet, TouchableOpacity, View, Alert, ScrollView } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColor } from '@/hooks/use-theme-color';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import DateTimePicker from '@react-native-community/datetimepicker';
import { 
  exportAllData, 
  getExportStats,
  ExportOptions
} from '@/database/export';
import { useHierarchicalBack } from '@/hooks/use-hierarchical-back';

export default function ExportScreen() {
  useHierarchicalBack('export');
  const router = useRouter();
  const tintColor = useThemeColor({}, 'tint');
  const backgroundColor = useThemeColor({}, 'background');
  
  const [stats, setStats] = useState<{[key: string]: number}>({});
  const [isExporting, setIsExporting] = useState(false);
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [showStartDatePicker, setShowStartDatePicker] = useState(false);
  const [showEndDatePicker, setShowEndDatePicker] = useState(false);
  const [selectedTables, setSelectedTables] = useState<Set<string>>(new Set([
    'supplement_logs', 'cognitive_test_results'
  ]));

  const tableOptions = [
    { key: 'supplement_logs', label: 'Supplement Logs', description: 'All supplement intake records' },
    { key: 'cognitive_test_results', label: 'Cognitive Test Results', description: 'All test scores and data' },
    { key: 'sleep_logs', label: 'Sleep Logs', description: 'Sleep duration and timing records' },
    { key: 'activity_logs', label: 'Activity Logs', description: 'Activity tracking records' },
    { key: 'daily_reviews', label: 'Daily Reviews', description: 'Daily wellness and mood reviews' },
    { key: 'schedules', label: 'Schedules', description: 'Supplement reminder schedules' },
    { key: 'supplements', label: 'Supplements', description: 'List of all supplements' }
  ];

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const exportStats = await getExportStats();
      setStats(exportStats);
    } catch (error) {
      console.error('Failed to load export stats:', error);
    }
  };

  const handleHomePress = () => {
    router.push('/');
  };

  const toggleTable = (tableKey: string) => {
    const newSelected = new Set(selectedTables);
    if (newSelected.has(tableKey)) {
      newSelected.delete(tableKey);
    } else {
      newSelected.add(tableKey);
    }
    setSelectedTables(newSelected);
  };

  const formatDate = (date: Date): string => {
    return date.toISOString().slice(0, 10);
  };

  const writeAndShareFile = async (filename: string, content: string) => {
    try {
      const docDir =
	  (FileSystem as any).documentDirectory ??
	  (FileSystem as any).cacheDirectory ??
	  '';
	const fileUri = docDir + filename;
      await FileSystem.writeAsStringAsync(fileUri, content);
      
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri);
      } else {
        Alert.alert('Export Complete', `File saved to: ${fileUri}`);
      }
    } catch (error) {
      console.error('Failed to save file:', error);
      Alert.alert('Export Error', 'Failed to save the export file.');
    }
  };

  const exportSelectedTables = async () => {
    if (selectedTables.size === 0) {
      Alert.alert('No Tables Selected', 'Please select at least one table to export.');
      return;
    }

    setIsExporting(true);
    try {
      const options: ExportOptions = {};
      if (startDate) options.startDate = startDate;
      if (endDate) options.endDate = endDate;
      options.tables = Array.from(selectedTables);

      const allData = await exportAllData(options);
      const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
      
      if (selectedTables.size === 1) {
        const tableKey = Array.from(selectedTables)[0];
        const filename = `neurosync_${tableKey}_${timestamp}.csv`;
        await writeAndShareFile(filename, allData[tableKey]);
      } else {
        // Combine all tables into a single CSV with section headers
        const sections: string[] = [];
        for (const tableKey of selectedTables) {
          if (allData[tableKey]) {
            sections.push(`# Table: ${tableKey}`);
            sections.push(allData[tableKey]);
            sections.push('');
          }
        }
        const combinedCsv = sections.join('\n');
        const filename = `neurosync_export_${timestamp}.csv`;
        await writeAndShareFile(filename, combinedCsv);
      }
      
    } catch (error) {
      console.error('Export failed:', error);
      Alert.alert('Export Error', 'Failed to export data. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  const clearDateRange = () => {
    setStartDate(null);
    setEndDate(null);
  };

  const selectAllTables = () => {
    setSelectedTables(new Set(tableOptions.map(t => t.key)));
  };

  const selectNone = () => {
    setSelectedTables(new Set());
  };

  return (
    <ThemedView style={styles.container} safeArea>
      <ThemedView style={styles.header}>
        <TouchableOpacity
          style={styles.homeButton}
          onPress={handleHomePress}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="home-outline" size={24} color={tintColor} />
        </TouchableOpacity>
        <ThemedText type="title" style={styles.title}>{"Export Data"}</ThemedText>
        <View style={styles.headerPlaceholder} />
      </ThemedView>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Date Range Selection */}
        <ThemedView style={styles.section}>
          <ThemedText type="subtitle" style={styles.sectionTitle}>{"Date Range (Optional)"}</ThemedText>
          <ThemedText style={styles.sectionDescription}>
			  {"Leave empty to export all data, or set a range to filter time-based records."}
          </ThemedText>
          
          <View style={styles.dateRow}>
            <TouchableOpacity 
              style={[styles.dateButton, { borderColor: tintColor }]}
              onPress={() => setShowStartDatePicker(true)}
            >
              <ThemedText style={styles.dateButtonText}>
                {startDate ? formatDate(startDate) : 'Start Date'}
              </ThemedText>
              <Ionicons name="calendar-outline" size={20} color={tintColor} />
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[styles.dateButton, { borderColor: tintColor }]}
              onPress={() => setShowEndDatePicker(true)}
            >
              <ThemedText style={styles.dateButtonText}>
                {endDate ? formatDate(endDate) : 'End Date'}
              </ThemedText>
              <Ionicons name="calendar-outline" size={20} color={tintColor} />
            </TouchableOpacity>
          </View>
          
          {(startDate || endDate) && (
            <TouchableOpacity style={styles.clearButton} onPress={clearDateRange}>
              <ThemedText style={[styles.clearButtonText, { color: tintColor }]}>{"Clear Date Range"}</ThemedText>
            </TouchableOpacity>
          )}
        </ThemedView>

        {/* Table Selection */}
        <ThemedView style={styles.section}>
          <View style={styles.sectionHeader}>
            <ThemedText type="subtitle" style={styles.sectionTitle}>{"Tables to Export"}</ThemedText>
            <View style={styles.selectionButtons}>
              <TouchableOpacity onPress={selectAllTables}>
                <ThemedText style={[styles.selectionButtonText, { color: tintColor }]}>{"All"}</ThemedText>
              </TouchableOpacity>
              <TouchableOpacity onPress={selectNone}>
                <ThemedText style={[styles.selectionButtonText, { color: tintColor }]}>{"None"}</ThemedText>
              </TouchableOpacity>
            </View>
          </View>
          
          {tableOptions.map(table => (
            <TouchableOpacity
              key={table.key}
              style={[
                styles.tableOption,
                { borderColor: selectedTables.has(table.key) ? tintColor : '#8E8E93' }
              ]}
              onPress={() => toggleTable(table.key)}
            >
              <View style={styles.tableOptionContent}>
                <View style={styles.tableInfo}>
                  <ThemedText style={styles.tableLabel}>{table.label}</ThemedText>
                  <ThemedText style={styles.tableDescription}>{table.description}</ThemedText>
                  <ThemedText style={styles.tableCount}>
                    {stats[table.key] || 0} records
                  </ThemedText>
                </View>
                <Ionicons 
                  name={selectedTables.has(table.key) ? "checkbox" : "square-outline"} 
                  size={24} 
                  color={selectedTables.has(table.key) ? tintColor : '#8E8E93'} 
                />
              </View>
            </TouchableOpacity>
          ))}
        </ThemedView>

      </ScrollView>

      {/* Export button fixed at bottom, always visible */}
      <View style={styles.footerContainer}>
        <TouchableOpacity
          style={[
            styles.exportButton,
            { backgroundColor: tintColor },
            (isExporting || selectedTables.size === 0) && styles.disabledButton
          ]}
          onPress={exportSelectedTables}
          disabled={isExporting || selectedTables.size === 0}
        >
          <Ionicons name="download-outline" size={24} color={backgroundColor} />
          <ThemedText style={[styles.exportButtonText, { color: backgroundColor }]}>
            {isExporting ? 'Exporting...' : `Export Selected (${selectedTables.size})`}
          </ThemedText>
        </TouchableOpacity>
      </View>

      {/* Date Pickers */}
      {showStartDatePicker && (
        <DateTimePicker
          value={startDate || new Date()}
          mode="date"
          display="default"
          onChange={(event, selectedDate) => {
			  void event; 
            setShowStartDatePicker(false);
            if (selectedDate) {
              setStartDate(selectedDate);
            }
          }}
        />
      )}

      {showEndDatePicker && (
        <DateTimePicker
          value={endDate || new Date()}
          mode="date"
          display="default"
          onChange={(event, selectedDate) => {
			  void event;
            setShowEndDatePicker(false);
            if (selectedDate) {
              setEndDate(selectedDate);
            }
          }}
        />
      )}
    </ThemedView>
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
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  section: {
    marginBottom: 30,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 8,
  },
  sectionDescription: {
    fontSize: 14,
    opacity: 0.7,
    marginBottom: 15,
    lineHeight: 20,
  },
  dateRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  dateButton: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 15,
    paddingVertical: 12,
    borderWidth: 1,
    borderRadius: 8,
  },
  dateButtonText: {
    fontSize: 16,
  },
  clearButton: {
    alignSelf: 'flex-start',
    paddingVertical: 8,
  },
  clearButtonText: {
    fontSize: 14,
    fontWeight: '500',
  },
  selectionButtons: {
    flexDirection: 'row',
    gap: 15,
  },
  selectionButtonText: {
    fontSize: 14,
    fontWeight: '500',
  },
  tableOption: {
    borderWidth: 1,
    borderRadius: 8,
    marginBottom: 10,
    overflow: 'hidden',
  },
  tableOptionContent: {
    flexDirection: 'row',
    padding: 15,
    alignItems: 'center',
  },
  tableInfo: {
    flex: 1,
  },
  tableLabel: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  tableDescription: {
    fontSize: 14,
    opacity: 0.7,
    marginBottom: 4,
  },
  tableCount: {
    fontSize: 12,
    opacity: 0.6,
  },
  footerContainer: {
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  exportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    minHeight: 56,
    gap: 10,
  },
  disabledButton: {
    opacity: 0.5,
  },
  exportButtonText: {
    fontSize: 18,
    fontWeight: '600',
  },
});