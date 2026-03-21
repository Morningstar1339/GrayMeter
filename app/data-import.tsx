import React, { useState } from 'react';
import { StyleSheet, TouchableOpacity, View, Alert, ScrollView, ActivityIndicator } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColor } from '@/hooks/use-theme-color';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { 
  importCsvData, 
  getImportPreview,
  ImportResult,
  ImportOptions
} from '@/database/data-import';
import { useHierarchicalBack } from '@/hooks/use-hierarchical-back';

type DuplicateHandling = 'skip' | 'overwrite' | 'append';

export default function ImportScreen() {
  useHierarchicalBack('data-import');
  const router = useRouter();
  const tintColor = useThemeColor({}, 'tint');
  const backgroundColor = useThemeColor({}, 'background');
  const cardBackground = useThemeColor({}, 'card');
  const textColor = useThemeColor({}, 'text');
  const subtleColor = useThemeColor({}, 'subtle');
  
  const [isLoading, setIsLoading] = useState(false);
  const [preview, setPreview] = useState<{
    tableName: string | null;
    headers: string[];
    sampleRows: Record<string, string>[];
    totalRows: number;
    fileContent: string;
  } | null>(null);
  const [duplicateHandling, setDuplicateHandling] = useState<DuplicateHandling>('skip');
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  const handleHomePress = () => {
    router.push('/');
  };

  const handleBack = () => {
    router.back();
  };

  const pickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', 'text/comma-separated-values', 'application/csv', '*/*'],
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        return;
      }

      const file = result.assets[0];
      
      // Check file extension
      if (!file.name.toLowerCase().endsWith('.csv')) {
        Alert.alert('Invalid File', 'Please select a CSV file.');
        return;
      }

      setIsLoading(true);
      setImportResult(null);

      // Read file content
      const fileContent = await FileSystem.readAsStringAsync(file.uri);
      
      // Get preview
      const previewData = getImportPreview(fileContent);
      
      setPreview({
        ...previewData,
        fileContent
      });

      if (!previewData.tableName) {
        Alert.alert(
          'Unknown Format',
          'Could not detect the data type from this CSV. Make sure it was exported from GrayMeter.'
        );
      }

      setIsLoading(false);
    } catch (error: any) {
      setIsLoading(false);
      console.error('Error picking file:', error);
      Alert.alert('Error', 'Failed to read the file: ' + error.message);
    }
  };

  const handleImport = async () => {
    if (!preview?.fileContent || !preview?.tableName) {
      Alert.alert('No Data', 'Please select a valid CSV file first.');
      return;
    }

    setIsLoading(true);

    try {
      const options: ImportOptions = { duplicateHandling };
      const result = await importCsvData(preview.fileContent, options);
      setImportResult(result);

      if (result.success && result.imported > 0) {
        Alert.alert(
          'Import Complete',
          `Successfully imported ${result.imported} of ${result.totalRows} records.\n` +
          (result.skipped > 0 ? `Skipped ${result.skipped} duplicates.` : '')
        );
      } else if (result.imported === 0 && result.skipped > 0) {
        Alert.alert(
          'No New Data',
          `All ${result.skipped} records already exist in the database.`
        );
      } else if (result.errors.length > 0) {
        Alert.alert(
          'Import Issues',
          `Imported ${result.imported} records with ${result.errors.length} errors.\n\n` +
          result.errors.slice(0, 3).join('\n')
        );
      }
    } catch (error: any) {
      console.error('Import error:', error);
      Alert.alert('Import Failed', error.message);
    }

    setIsLoading(false);
  };

  const clearPreview = () => {
    setPreview(null);
    setImportResult(null);
  };

  const getTableDisplayName = (tableName: string): string => {
    const names: Record<string, string> = {
      'supplement_logs': 'Supplement Logs',
      'cognitive_test_results': 'Cognitive Test Results',
      'sleep_logs': 'Sleep Logs',
      'activity_logs': 'Activity Logs',
      'daily_reviews': 'Daily Reviews',
      'supplements': 'Supplements',
      'schedules': 'Schedules',
    };
    return names[tableName] || tableName;
  };

  return (
    <ThemedView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack} style={styles.backButton} accessibilityRole="button" accessibilityLabel="Go back" testID="btn-import-back">
          <Ionicons name="arrow-back" size={24} color={tintColor} />
        </TouchableOpacity>
        <ThemedText style={styles.title}>Import Data</ThemedText>
        <TouchableOpacity onPress={handleHomePress} style={styles.homeButton} accessibilityRole="button" accessibilityLabel="Go home" testID="btn-import-home">
          <Ionicons name="home-outline" size={24} color={tintColor} />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        {/* Instructions */}
        <View style={[styles.card, { backgroundColor: cardBackground }]}>
          <ThemedText style={styles.cardTitle}>How to Import</ThemedText>
          <ThemedText style={[styles.cardText, { color: subtleColor }]}>
            1. Select a CSV file exported from GrayMeter{'\n'}
            2. Review the preview to confirm the data{'\n'}
            3. Choose how to handle duplicates{'\n'}
            4. Tap Import to add the data
          </ThemedText>
        </View>

        {/* File Picker */}
        <TouchableOpacity
          style={[styles.pickerButton, { borderColor: tintColor }]}
          onPress={pickFile}
          disabled={isLoading}
          accessibilityRole="button"
          accessibilityLabel="Select CSV file"
          testID="btn-pick-file"
        >
          <Ionicons name="document-outline" size={24} color={tintColor} />
          <ThemedText style={[styles.pickerText, { color: tintColor }]}>
            {preview ? 'Select Different File' : 'Select CSV File'}
          </ThemedText>
        </TouchableOpacity>

        {isLoading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={tintColor} />
            <ThemedText style={styles.loadingText}>Processing...</ThemedText>
          </View>
        )}

        {/* Preview */}
        {preview && !isLoading && (
          <View style={[styles.card, { backgroundColor: cardBackground }]}>
            <View style={styles.previewHeader}>
              <ThemedText style={styles.cardTitle}>Preview</ThemedText>
              <TouchableOpacity onPress={clearPreview} accessibilityRole="button" accessibilityLabel="Clear preview" testID="btn-clear-preview">
                <Ionicons name="close-circle" size={24} color={subtleColor} />
              </TouchableOpacity>
            </View>

            {preview.tableName ? (
              <>
                <View style={styles.detectedType}>
                  <Ionicons name="checkmark-circle" size={20} color="#4CAF50" />
                  <ThemedText style={styles.detectedTypeText}>
                    Detected: {getTableDisplayName(preview.tableName)}
                  </ThemedText>
                </View>

                <ThemedText style={[styles.statsText, { color: subtleColor }]}>
                  {preview.totalRows} records found
                </ThemedText>

                {/* Sample data preview */}
                <View style={styles.sampleContainer}>
                  <ThemedText style={[styles.sampleTitle, { color: subtleColor }]}>
                    Sample data (first {Math.min(preview.sampleRows.length, 3)} rows):
                  </ThemedText>
                  {preview.sampleRows.slice(0, 3).map((row, index) => (
                    <View key={index} style={styles.sampleRow}>
                      {Object.entries(row).slice(0, 3).map(([key, value]) => (
                        <ThemedText key={key} style={styles.sampleCell} numberOfLines={1}>
                          {key}: {value}
                        </ThemedText>
                      ))}
                    </View>
                  ))}
                </View>

                {/* Duplicate Handling Options */}
                <ThemedText style={[styles.optionLabel, { marginTop: 16 }]}>
                  When duplicates are found:
                </ThemedText>
                <View style={styles.optionsContainer}>
                  {(['skip', 'overwrite', 'append'] as DuplicateHandling[]).map((option) => (
                    <TouchableOpacity
                      key={option}
                      style={[
                        styles.optionButton,
                        { borderColor: duplicateHandling === option ? tintColor : subtleColor },
                        duplicateHandling === option && { backgroundColor: tintColor + '20' }
                      ]}
                      onPress={() => setDuplicateHandling(option)}
                      accessibilityRole="radio"
                      accessibilityLabel={`Duplicate handling: ${option}`}
                      testID={`btn-duplicate-${option}`}
                    >
                      <ThemedText style={[
                        styles.optionText,
                        duplicateHandling === option && { color: tintColor, fontWeight: '600' }
                      ]}>
                        {option === 'skip' ? 'Skip' : option === 'overwrite' ? 'Update' : 'Add New'}
                      </ThemedText>
                    </TouchableOpacity>
                  ))}
                </View>
                <ThemedText style={[styles.optionHint, { color: subtleColor }]}>
                  {duplicateHandling === 'skip' && 'Existing records will be kept unchanged'}
                  {duplicateHandling === 'overwrite' && 'Existing records will be updated with imported values'}
                  {duplicateHandling === 'append' && 'All records will be added (may create duplicates)'}
                </ThemedText>

                {/* Import Button */}
                <TouchableOpacity
                  style={[styles.importButton, { backgroundColor: tintColor }]}
                  onPress={handleImport}
                  disabled={isLoading}
                  accessibilityRole="button"
                  accessibilityLabel="Import records"
                  testID="btn-import-confirm"
                >
                  <Ionicons name="cloud-upload-outline" size={24} color="#fff" />
                  <ThemedText style={styles.importButtonText}>
                    Import {preview.totalRows} Records
                  </ThemedText>
                </TouchableOpacity>
              </>
            ) : (
              <View style={styles.errorContainer}>
                <Ionicons name="warning" size={24} color="#FF9800" />
                <ThemedText style={styles.errorText}>
                  Could not detect data type. Please ensure this CSV was exported from GrayMeter.
                </ThemedText>
              </View>
            )}
          </View>
        )}

        {/* Import Result */}
        {importResult && (
          <View style={[styles.card, { backgroundColor: cardBackground }]}>
            <ThemedText style={styles.cardTitle}>Import Result</ThemedText>
            <View style={styles.resultRow}>
              <ThemedText style={styles.resultLabel}>Table:</ThemedText>
              <ThemedText style={styles.resultValue}>
                {getTableDisplayName(importResult.tableName)}
              </ThemedText>
            </View>
            <View style={styles.resultRow}>
              <ThemedText style={styles.resultLabel}>Imported:</ThemedText>
              <ThemedText style={[styles.resultValue, { color: '#4CAF50' }]}>
                {importResult.imported}
              </ThemedText>
            </View>
            <View style={styles.resultRow}>
              <ThemedText style={styles.resultLabel}>Skipped:</ThemedText>
              <ThemedText style={[styles.resultValue, { color: '#FF9800' }]}>
                {importResult.skipped}
              </ThemedText>
            </View>
            {importResult.errors.length > 0 && (
              <View style={styles.errorsContainer}>
                <ThemedText style={[styles.resultLabel, { color: '#F44336' }]}>
                  Errors ({importResult.errors.length}):
                </ThemedText>
                {importResult.errors.slice(0, 5).map((error, index) => (
                  <ThemedText key={index} style={styles.errorItem}>
                    • {error}
                  </ThemedText>
                ))}
              </View>
            )}
          </View>
        )}
      </ScrollView>
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
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 60,
    paddingBottom: 16,
  },
  backButton: {
    padding: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  homeButton: {
    padding: 8,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 40,
  },
  card: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  cardText: {
    fontSize: 14,
    lineHeight: 22,
  },
  pickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderStyle: 'dashed',
    marginBottom: 16,
    gap: 8,
  },
  pickerText: {
    fontSize: 16,
    fontWeight: '600',
  },
  loadingContainer: {
    alignItems: 'center',
    padding: 24,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
  },
  previewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  detectedType: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  detectedTypeText: {
    fontSize: 16,
    fontWeight: '500',
  },
  statsText: {
    fontSize: 14,
    marginBottom: 12,
  },
  sampleContainer: {
    backgroundColor: 'rgba(0,0,0,0.05)',
    borderRadius: 8,
    padding: 12,
  },
  sampleTitle: {
    fontSize: 12,
    marginBottom: 8,
  },
  sampleRow: {
    marginBottom: 8,
  },
  sampleCell: {
    fontSize: 12,
  },
  optionLabel: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 8,
  },
  optionsContainer: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  optionButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
  },
  optionText: {
    fontSize: 14,
  },
  optionHint: {
    fontSize: 12,
    fontStyle: 'italic',
  },
  importButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    marginTop: 16,
    gap: 8,
  },
  importButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    backgroundColor: 'rgba(255, 152, 0, 0.1)',
    borderRadius: 8,
  },
  errorText: {
    flex: 1,
    fontSize: 14,
  },
  resultRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  resultLabel: {
    fontSize: 14,
  },
  resultValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  errorsContainer: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.1)',
  },
  errorItem: {
    fontSize: 12,
    color: '#F44336',
    marginTop: 4,
  },
});
