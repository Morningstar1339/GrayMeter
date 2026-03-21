import React, { useState, useEffect, useCallback } from 'react';
import { StyleSheet, ScrollView, TouchableOpacity, View, ActivityIndicator, RefreshControl } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { EffectChart } from '@/components/effect-chart';
import { UserSupplementCurves } from '@/components/user-supplement-curves';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useRouter } from 'expo-router';
import { useHierarchicalBack } from '@/hooks/use-hierarchical-back';
import {
  generateInsightsSummary,
  InsightsSummary,
  CorrelationResult,
  StackCorrelation,
  DoseResponseResult,
  DataQuality,
  TestType,
  SupplementEffectAnalysis,
  CohensD,
  formatPercentChange,
  formatConfidence,
  getTimingWindowLabel,
  getTestTypeLabel,
  analyzeSupplementEffects,
} from '@/database/correlation-analysis';

type ViewMode = 'summary' | 'by-supplement' | 'by-test' | 'stacks' | 'profiles';

export default function InsightsScreen() {
  useHierarchicalBack('insights');
  const router = useRouter();
  const tintColor = useThemeColor({}, 'tint');

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [insights, setInsights] = useState<InsightsSummary | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('summary');
  const [expandedSupplements, setExpandedSupplements] = useState<Set<number>>(new Set());
  const [expandedTests, setExpandedTests] = useState<Set<TestType>>(new Set());
  const [chartExpandedSupplements, setChartExpandedSupplements] = useState<Set<number>>(new Set());
  const [selectedTestTypes, setSelectedTestTypes] = useState<Map<number, TestType>>(new Map());
  const [chartData, setChartData] = useState<Map<string, SupplementEffectAnalysis>>(new Map());
  const [chartLoading, setChartLoading] = useState<Set<string>>(new Set());

  const loadInsights = useCallback(async () => {
    try {
      const summary = await generateInsightsSummary();
      setInsights(summary);
    } catch (error) {
      console.error('Failed to load insights:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadInsights();
  }, [loadInsights]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadInsights();
  }, [loadInsights]);

  const handleBack = () => {
    router.push('/');
  };

  const toggleSupplementExpanded = (supplementId: number) => {
    const newExpanded = new Set(expandedSupplements);
    if (newExpanded.has(supplementId)) {
      newExpanded.delete(supplementId);
    } else {
      newExpanded.add(supplementId);
    }
    setExpandedSupplements(newExpanded);
  };

  const toggleTestExpanded = (testType: TestType) => {
    const newExpanded = new Set(expandedTests);
    if (newExpanded.has(testType)) {
      newExpanded.delete(testType);
    } else {
      newExpanded.add(testType);
    }
    setExpandedTests(newExpanded);
  };

  const toggleChartExpanded = async (supplementId: number, availableTestTypes: TestType[]) => {
    const newExpanded = new Set(chartExpandedSupplements);
    if (newExpanded.has(supplementId)) {
      newExpanded.delete(supplementId);
      setChartExpandedSupplements(newExpanded);
    } else {
      newExpanded.add(supplementId);
      setChartExpandedSupplements(newExpanded);
      
      const currentTestType = selectedTestTypes.get(supplementId) || availableTestTypes[0];
      if (!selectedTestTypes.has(supplementId)) {
        setSelectedTestTypes(new Map(selectedTestTypes).set(supplementId, currentTestType));
      }
      
      await loadChartData(supplementId, currentTestType);
    }
  };

  const loadChartData = async (supplementId: number, testType: TestType) => {
    const cacheKey = `${supplementId}-${testType}`;
    
    if (chartData.has(cacheKey)) return;
    
    const newLoading = new Set(chartLoading);
    newLoading.add(cacheKey);
    setChartLoading(newLoading);
    
    try {
      const thirtyDaysAgo = Math.floor(Date.now() / 1000) - (30 * 24 * 60 * 60);
      const now = Math.floor(Date.now() / 1000);
      
      const analysis = await analyzeSupplementEffects(supplementId, testType, thirtyDaysAgo, now);
      
      if (analysis) {
        setChartData(new Map(chartData).set(cacheKey, analysis));
      }
    } catch (error) {
      console.error('Failed to load chart data:', error);
    } finally {
      const updatedLoading = new Set(chartLoading);
      updatedLoading.delete(cacheKey);
      setChartLoading(updatedLoading);
    }
  };

  const handleTestTypeChange = async (supplementId: number, testType: TestType) => {
    setSelectedTestTypes(new Map(selectedTestTypes).set(supplementId, testType));
    await loadChartData(supplementId, testType);
  };

  const formatEffectSize = (cohensD: CohensD): string => {
    const sign = cohensD.d >= 0 ? '+' : '';
    return `d = ${sign}${cohensD.d.toFixed(2)} (${cohensD.interpretation})`;
  };

  const formatCI = (cohensD: CohensD): string => {
    return `95% CI: [${cohensD.ci95[0].toFixed(2)}, ${cohensD.ci95[1].toFixed(2)}]`;
  };

  const getChangeColor = (percentChange: number): string => {
    if (percentChange > 5) return '#34C759';
    if (percentChange < -5) return '#FF3B30';
    return '#8E8E93';
  };

  const getConfidenceColor = (confidence: string): string => {
    switch (confidence) {
      case 'high': return '#34C759';
      case 'medium': return '#FF9500';
      case 'low': return '#8E8E93';
      default: return '#8E8E93';
    }
  };

  const renderDataQuality = (dataQuality: DataQuality) => (
    <View style={[styles.dataQualityCard, { borderColor: tintColor + '30' }]}>
      <View style={styles.dataQualityHeader}>
        <Ionicons name="analytics-outline" size={20} color={tintColor} />
        <ThemedText style={styles.dataQualityTitle}>Data Summary</ThemedText>
      </View>
      <ThemedText style={styles.dataQualityText}>
        Based on {dataQuality.totalSupplementLogs} supplement logs and {dataQuality.totalTestResults} test results over {dataQuality.trackingDays} days
      </ThemedText>
      {dataQuality.recommendations.length > 0 && (
        <View style={styles.recommendationsContainer}>
          {dataQuality.recommendations.map((rec, index) => (
            <View key={index} style={styles.recommendationItem}>
              <Ionicons name="bulb-outline" size={14} color="#FF9500" />
              <ThemedText style={styles.recommendationText}>{rec}</ThemedText>
            </View>
          ))}
        </View>
      )}
    </View>
  );

  const renderCorrelationCard = (correlation: CorrelationResult, showSupplement: boolean = true, showTest: boolean = true) => (
    <View key={`${correlation.supplementId}-${correlation.testType}-${correlation.timingWindow}`} style={[styles.correlationCard, { borderColor: tintColor + '20' }]}>
      <View style={styles.correlationHeader}>
        {showSupplement && (
          <ThemedText style={styles.correlationSupplement}>{correlation.supplementName}</ThemedText>
        )}
        {showTest && (
          <ThemedText style={styles.correlationTest}>{getTestTypeLabel(correlation.testType)}</ThemedText>
        )}
      </View>
      <View style={styles.correlationContent}>
        <View style={styles.correlationMetric}>
          <ThemedText style={[styles.percentChange, { color: getChangeColor(correlation.percentChange) }]}>
            {formatPercentChange(correlation.percentChange)}
          </ThemedText>
          <ThemedText style={styles.metricLabel}>vs baseline</ThemedText>
        </View>
        <View style={styles.correlationDetails}>
          <ThemedText style={styles.timingWindow}>{getTimingWindowLabel(correlation.timingWindow)}</ThemedText>
          <View style={styles.confidenceContainer}>
            <View style={[styles.confidenceDot, { backgroundColor: getConfidenceColor(correlation.confidence) }]} />
            <ThemedText style={styles.confidenceText}>{formatConfidence(correlation.confidence)}</ThemedText>
          </View>
          <ThemedText style={styles.sampleSize}>n={correlation.sampleSize}</ThemedText>
        </View>
      </View>
      <View style={styles.scoreComparison}>
        <ThemedText style={styles.scoreLabel}>Baseline: {correlation.baselineScore.toFixed(1)}</ThemedText>
        <ThemedText style={styles.scoreLabel}>Window: {correlation.windowScore.toFixed(1)}</ThemedText>
      </View>
    </View>
  );

  const renderStackCard = (stack: StackCorrelation) => (
    <View key={`${stack.supplementIds.join('-')}-${stack.testType}`} style={[styles.stackCard, { borderColor: tintColor + '20' }]}>
      <View style={styles.stackHeader}>
        <View style={styles.stackSupplements}>
          {stack.supplementNames.map((name, index) => (
            <View key={index} style={[styles.stackPill, { backgroundColor: tintColor + '20' }]}>
              <ThemedText style={[styles.stackPillText, { color: tintColor }]}>{name}</ThemedText>
            </View>
          ))}
        </View>
        <ThemedText style={styles.stackTest}>{getTestTypeLabel(stack.testType)}</ThemedText>
      </View>
      <View style={styles.stackContent}>
        <View style={styles.stackMetric}>
          <ThemedText style={[styles.percentChange, { color: getChangeColor(stack.percentChange) }]}>
            {formatPercentChange(stack.percentChange)}
          </ThemedText>
          <ThemedText style={styles.metricLabel}>combined effect</ThemedText>
        </View>
        <View style={styles.stackVsIndividual}>
          <ThemedText style={[styles.vsIndividualValue, { color: getChangeColor(stack.comparedToIndividual) }]}>
            {formatPercentChange(stack.comparedToIndividual)}
          </ThemedText>
          <ThemedText style={styles.vsIndividualLabel}>vs individual</ThemedText>
        </View>
      </View>
      <View style={styles.stackFooter}>
        <View style={[styles.confidenceDot, { backgroundColor: getConfidenceColor(stack.confidence) }]} />
        <ThemedText style={styles.confidenceText}>{formatConfidence(stack.confidence)}</ThemedText>
        <ThemedText style={styles.sampleSize}>n={stack.sampleSize}</ThemedText>
      </View>
    </View>
  );

  const renderDoseResponse = (doseResponse: DoseResponseResult) => (
    <View key={`${doseResponse.supplementId}-${doseResponse.testType}`} style={[styles.doseCard, { borderColor: tintColor + '20' }]}>
      <View style={styles.doseHeader}>
        <ThemedText style={styles.doseSupplement}>{doseResponse.supplementName}</ThemedText>
        <ThemedText style={styles.doseTest}>{getTestTypeLabel(doseResponse.testType)}</ThemedText>
      </View>
      <View style={styles.doseBars}>
        <View style={styles.doseBar}>
          <ThemedText style={styles.doseLabel}>Low</ThemedText>
          <View style={[styles.doseBarFill, { width: '33%', backgroundColor: '#8E8E93' }]} />
          <ThemedText style={styles.doseValue}>{doseResponse.lowDoseAvg.toFixed(1)} (n={doseResponse.lowDoseSampleSize})</ThemedText>
        </View>
        <View style={styles.doseBar}>
          <ThemedText style={styles.doseLabel}>Med</ThemedText>
          <View style={[styles.doseBarFill, { width: '50%', backgroundColor: '#FF9500' }]} />
          <ThemedText style={styles.doseValue}>{doseResponse.medDoseAvg.toFixed(1)} (n={doseResponse.medDoseSampleSize})</ThemedText>
        </View>
        <View style={styles.doseBar}>
          <ThemedText style={styles.doseLabel}>High</ThemedText>
          <View style={[styles.doseBarFill, { width: '66%', backgroundColor: tintColor }]} />
          <ThemedText style={styles.doseValue}>{doseResponse.highDoseAvg.toFixed(1)} (n={doseResponse.highDoseSampleSize})</ThemedText>
        </View>
      </View>
      <View style={styles.doseTrend}>
        <Ionicons 
          name={doseResponse.trend === 'positive' ? 'trending-up' : doseResponse.trend === 'negative' ? 'trending-down' : 'remove'} 
          size={16} 
          color={doseResponse.trend === 'positive' ? '#34C759' : doseResponse.trend === 'negative' ? '#FF3B30' : '#8E8E93'} 
        />
        <ThemedText style={[styles.doseTrendText, { color: doseResponse.trend === 'positive' ? '#34C759' : doseResponse.trend === 'negative' ? '#FF3B30' : '#8E8E93' }]}>
          {doseResponse.trend === 'positive' ? 'Higher doses improve scores' : 
           doseResponse.trend === 'negative' ? 'Higher doses reduce scores' : 
           doseResponse.trend === 'neutral' ? 'No clear dose relationship' : 'Insufficient data'}
        </ThemedText>
      </View>
    </View>
  );

  const renderEmptyState = () => {
    const dq = insights?.dataQuality;
    
    return (
      <View style={styles.emptyState}>
        <Ionicons name="analytics-outline" size={64} color="#8E8E93" />
        <ThemedText style={styles.emptyStateTitle}>Not Enough Data Yet</ThemedText>
        <ThemedText style={styles.emptyStateText}>
          Log supplements and complete cognitive tests to see patterns. Here's what's needed:
        </ThemedText>
        {dq && (
          <View style={{ marginVertical: 12, alignItems: 'flex-start', width: '100%', paddingHorizontal: 20 }}>
            <ThemedText style={[styles.emptyStateText, { fontSize: 13, marginBottom: 4 }]}>
              {dq.totalSupplementLogs >= 10 ? '✅' : '⬜'} Supplement logs: {dq.totalSupplementLogs}/10
            </ThemedText>
            <ThemedText style={[styles.emptyStateText, { fontSize: 13, marginBottom: 4 }]}>
              {dq.totalTestResults >= 10 ? '✅' : '⬜'} Cognitive tests: {dq.totalTestResults}/10
            </ThemedText>
            <ThemedText style={[styles.emptyStateText, { fontSize: 13, marginBottom: 4 }]}>
              {dq.trackingDays >= 7 ? '✅' : '⬜'} Tracking days: {dq.trackingDays}/7
            </ThemedText>
          </View>
        )}
        <View style={styles.emptyStateActions}>
          <TouchableOpacity
            style={[styles.emptyStateButton, { backgroundColor: tintColor }]}
            onPress={() => router.push('/supplements')}
            accessibilityRole="button"
            accessibilityLabel="Log Supplement"
            testID="btn-insights-log-supplement"
          >
            <ThemedText style={styles.emptyStateButtonText}>Log Supplement</ThemedText>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.emptyStateButton, { backgroundColor: tintColor }]}
            onPress={() => router.push('/cognitive-tests')}
            accessibilityRole="button"
            accessibilityLabel="Take Test"
            testID="btn-insights-take-test"
          >
            <ThemedText style={styles.emptyStateButtonText}>Take Test</ThemedText>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderChartSection = (supplementId: number, supplementName: string, availableTestTypes: TestType[]) => {
    const isChartExpanded = chartExpandedSupplements.has(supplementId);
    const currentTestType = selectedTestTypes.get(supplementId) || availableTestTypes[0];
    const cacheKey = `${supplementId}-${currentTestType}`;
    const isLoading = chartLoading.has(cacheKey);
    const analysis = chartData.get(cacheKey);

    return (
      <View style={styles.chartSection}>
        <TouchableOpacity
          style={[styles.chartToggle, { borderColor: tintColor + '30' }]}
          onPress={() => toggleChartExpanded(supplementId, availableTestTypes)}
          accessibilityRole="button"
          accessibilityLabel="Toggle effect analysis"
          testID={`btn-insights-chart-toggle-${supplementId}`}
        >
          <View style={styles.chartToggleLeft}>
            <Ionicons name="analytics" size={18} color={tintColor} />
            <ThemedText style={styles.chartToggleText}>Effect Analysis</ThemedText>
          </View>
          <Ionicons
            name={isChartExpanded ? 'chevron-up' : 'chevron-down'}
            size={20}
            color={tintColor}
          />
        </TouchableOpacity>

        {isChartExpanded && (
          <View style={[styles.chartContainer, { borderColor: tintColor + '20' }]}>
            <View style={styles.testTypeSelector}>
              <ThemedText style={styles.testTypeSelectorLabel}>Test Type:</ThemedText>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.testTypePills}>
                {availableTestTypes.map(testType => (
                  <TouchableOpacity
                    key={testType}
                    style={[
                      styles.testTypePill,
                      currentTestType === testType && { backgroundColor: tintColor }
                    ]}
                    onPress={() => handleTestTypeChange(supplementId, testType)}
                    accessibilityRole="button"
                    accessibilityLabel={`Select ${getTestTypeLabel(testType)} test type`}
                    testID={`btn-insights-test-type-${supplementId}-${testType}`}
                  >
                    <ThemedText
                      style={[
                        styles.testTypePillText,
                        currentTestType === testType && { color: 'white' }
                      ]}
                    >
                      {getTestTypeLabel(testType)}
                    </ThemedText>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {isLoading ? (
              <View style={styles.chartLoading}>
                <ActivityIndicator size="small" color={tintColor} />
                <ThemedText style={styles.chartLoadingText}>Loading analysis...</ThemedText>
              </View>
            ) : analysis ? (
              <>
                <EffectChart
                  testResults={analysis.testResults}
                  phases={analysis.phases}
                  supplementName={supplementName}
                  testType={getTestTypeLabel(analysis.testType)}
                  baselineMean={analysis.baselineScores.length > 0 
                    ? analysis.baselineScores.reduce((a, b) => a + b, 0) / analysis.baselineScores.length 
                    : undefined}
                />

                <View style={styles.effectStats}>
                  {analysis.cohensD ? (
                    <>
                      <View style={styles.effectStatRow}>
                        <ThemedText style={styles.effectStatLabel}>Effect Size:</ThemedText>
                        <ThemedText style={[
                          styles.effectStatValue,
                          { color: getChangeColor(analysis.cohensD.d * 20) }
                        ]}>
                          {formatEffectSize(analysis.cohensD)}
                        </ThemedText>
                      </View>
                      <View style={styles.effectStatRow}>
                        <ThemedText style={styles.effectStatLabel}>Confidence:</ThemedText>
                        <ThemedText style={styles.effectStatValue}>
                          {formatCI(analysis.cohensD)}
                        </ThemedText>
                      </View>
                      <View style={styles.effectStatRow}>
                        <ThemedText style={styles.effectStatLabel}>Samples:</ThemedText>
                        <ThemedText style={styles.effectStatValue}>
                          {analysis.cohensD.treatmentN} on days, {analysis.cohensD.baselineN} off days
                        </ThemedText>
                      </View>
                      <View style={styles.effectStatRow}>
                        <ThemedText style={styles.effectStatLabel}>Method:</ThemedText>
                        <ThemedText style={[
                          styles.effectStatValue,
                          analysis.analysisMethod === 'pk_informed' && { color: tintColor }
                        ]}>
                          {analysis.analysisMethod === 'pk_informed' ? '📊 PK-informed' : 'Binary (on/off)'}
                        </ThemedText>
                      </View>
                      {analysis.pkAnalysis && (
                        <View style={styles.effectStatRow}>
                          <ThemedText style={styles.effectStatLabel}>PK Correlation:</ThemedText>
                          <ThemedText style={[
                            styles.effectStatValue,
                            { color: getChangeColor(analysis.pkAnalysis.correlation * 50) }
                          ]}>
                            r={analysis.pkAnalysis.correlation.toFixed(3)} (p={analysis.pkAnalysis.pValue.toFixed(3)})
                          </ThemedText>
                        </View>
                      )}
                    </>
                  ) : (
                    <ThemedText style={styles.insufficientData}>
                      Insufficient data for effect size calculation (need 2+ samples in each condition)
                    </ThemedText>
                  )}
                </View>
              </>
            ) : (
              <View style={styles.chartLoading}>
                <ThemedText style={styles.chartLoadingText}>No data available for this test type</ThemedText>
              </View>
            )}
          </View>
        )}
      </View>
    );
  };

  const renderSummaryView = () => {
    if (!insights) return null;

    return (
      <>
        {renderDataQuality(insights.dataQuality)}

        {!insights.dataQuality.sufficientData ? (
          renderEmptyState()
        ) : (
          <>
            {insights.topFindings.length > 0 && (
              <View style={styles.section}>
                <ThemedText style={styles.sectionTitle}>Top Findings</ThemedText>
                {insights.topFindings.map(correlation => renderCorrelationCard(correlation))}
              </View>
            )}

            {insights.stackInsights.length > 0 && (
              <View style={styles.section}>
                <ThemedText style={styles.sectionTitle}>Stack Insights</ThemedText>
                <ThemedText style={styles.sectionDescription}>
                  Effects when supplements are taken together
                </ThemedText>
                {insights.stackInsights.slice(0, 3).map(stack => renderStackCard(stack))}
              </View>
            )}

            {insights.doseResponses.length > 0 && (
              <View style={styles.section}>
                <ThemedText style={styles.sectionTitle}>Dose-Response</ThemedText>
                <ThemedText style={styles.sectionDescription}>
                  How different doses affect your performance
                </ThemedText>
                {insights.doseResponses.slice(0, 3).map(dose => renderDoseResponse(dose))}
              </View>
            )}
          </>
        )}
      </>
    );
  };

  const renderBySupplementView = () => {
    if (!insights || !insights.dataQuality.sufficientData) {
      return renderEmptyState();
    }

    const supplementIds = Array.from(insights.bySupplementCorrelations.keys());

    if (supplementIds.length === 0) {
      return (
        <View style={styles.noDataContainer}>
          <ThemedText style={styles.noDataText}>No supplement correlations found yet</ThemedText>
        </View>
      );
    }

    return (
      <>
        {supplementIds.map(supplementId => {
          const correlations = insights.bySupplementCorrelations.get(supplementId) || [];
          if (correlations.length === 0) return null;

          const isExpanded = expandedSupplements.has(supplementId);
          const supplementName = correlations[0].supplementName;

          const availableTestTypes = [...new Set(correlations.map(c => c.testType))];

          return (
            <View key={supplementId} style={styles.expandableSection}>
              <TouchableOpacity
                style={[styles.expandableHeader, { borderColor: tintColor + '20' }]}
                onPress={() => toggleSupplementExpanded(supplementId)}
                accessibilityRole="button"
                accessibilityLabel={`Toggle ${supplementName} details`}
                testID={`btn-insights-expand-supplement-${supplementId}`}
              >
                <ThemedText style={styles.expandableTitle}>{supplementName}</ThemedText>
                <View style={styles.expandableInfo}>
                  <ThemedText style={styles.expandableCount}>{correlations.length} findings</ThemedText>
                  <Ionicons 
                    name={isExpanded ? 'chevron-up' : 'chevron-down'} 
                    size={20} 
                    color={tintColor} 
                  />
                </View>
              </TouchableOpacity>
              {isExpanded && (
                <View style={styles.expandableContent}>
                  {renderChartSection(supplementId, supplementName, availableTestTypes)}
                  {correlations.map(correlation => renderCorrelationCard(correlation, false, true))}
                </View>
              )}
            </View>
          );
        })}
      </>
    );
  };

  const renderByTestView = () => {
    if (!insights || !insights.dataQuality.sufficientData) {
      return renderEmptyState();
    }

    const testTypes = Array.from(insights.byTestCorrelations.keys());

    if (testTypes.length === 0) {
      return (
        <View style={styles.noDataContainer}>
          <ThemedText style={styles.noDataText}>No test correlations found yet</ThemedText>
        </View>
      );
    }

    return (
      <>
        {testTypes.map(testType => {
          const correlations = insights.byTestCorrelations.get(testType) || [];
          if (correlations.length === 0) return null;

          const isExpanded = expandedTests.has(testType);

          return (
            <View key={testType} style={styles.expandableSection}>
              <TouchableOpacity
                style={[styles.expandableHeader, { borderColor: tintColor + '20' }]}
                onPress={() => toggleTestExpanded(testType)}
                accessibilityRole="button"
                accessibilityLabel={`Toggle ${getTestTypeLabel(testType)} details`}
                testID={`btn-insights-expand-test-${testType}`}
              >
                <ThemedText style={styles.expandableTitle}>{getTestTypeLabel(testType)}</ThemedText>
                <View style={styles.expandableInfo}>
                  <ThemedText style={styles.expandableCount}>{correlations.length} findings</ThemedText>
                  <Ionicons 
                    name={isExpanded ? 'chevron-up' : 'chevron-down'} 
                    size={20} 
                    color={tintColor} 
                  />
                </View>
              </TouchableOpacity>
              {isExpanded && (
                <View style={styles.expandableContent}>
                  {correlations.map(correlation => renderCorrelationCard(correlation, true, false))}
                </View>
              )}
            </View>
          );
        })}
      </>
    );
  };

  const renderStacksView = () => {
    if (!insights || !insights.dataQuality.sufficientData) {
      return renderEmptyState();
    }

    if (insights.stackInsights.length === 0) {
      return (
        <View style={styles.noDataContainer}>
          <Ionicons name="layers-outline" size={48} color="#8E8E93" />
          <ThemedText style={styles.noDataText}>No stack patterns detected yet</ThemedText>
          <ThemedText style={styles.noDataSubtext}>
            Take supplements together more frequently to see combination effects
          </ThemedText>
        </View>
      );
    }

    return (
      <>
        {insights.stackInsights.map(stack => renderStackCard(stack))}
      </>
    );
  };

  const renderProfilesView = () => {
    return (
      <UserSupplementCurves
        onSupplementPress={(supplement) => {
          // Navigate to specific supplement analysis or do nothing for now
          console.log('Selected supplement for analysis:', supplement.name);
        }}
      />
    );
  };

  if (loading) {
    return (
      <ThemedView style={styles.container} safeArea>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={tintColor} />
          <ThemedText style={styles.loadingText}>Analyzing your data...</ThemedText>
        </View>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container} safeArea>
      <ThemedView style={styles.header}>
        <TouchableOpacity onPress={handleBack} style={styles.backButton} accessibilityRole="button" accessibilityLabel="Go home" testID="btn-insights-home">
          <Ionicons name="home-outline" size={24} color={tintColor} />
        </TouchableOpacity>
        <ThemedText type="title" style={styles.title}>Insights</ThemedText>
        <View style={styles.headerButtons}>
          <TouchableOpacity onPress={() => router.push('/priors')} style={styles.pkAnalysisButton} accessibilityRole="button" accessibilityLabel="PK Analysis" testID="btn-insights-pk-analysis">
            <Ionicons name="flask-outline" size={18} color={tintColor} />
            <ThemedText style={[styles.pkAnalysisButtonText, { color: tintColor }]}>
              PK Analysis
            </ThemedText>
          </TouchableOpacity>
          <TouchableOpacity onPress={onRefresh} style={styles.headerButton} accessibilityRole="button" accessibilityLabel="Refresh" testID="btn-insights-refresh">
            <Ionicons name="refresh" size={22} color={tintColor} />
          </TouchableOpacity>
        </View>
      </ThemedView>

      <View style={styles.tabContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabScroll}>
          <TouchableOpacity
            style={[styles.tab, viewMode === 'summary' && { backgroundColor: tintColor }]}
            onPress={() => setViewMode('summary')}
            accessibilityRole="button"
            accessibilityLabel="Summary tab"
            testID="btn-insights-tab-summary"
          >
            <ThemedText style={[styles.tabText, viewMode === 'summary' && { color: 'white' }]}>Summary</ThemedText>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, viewMode === 'by-supplement' && { backgroundColor: tintColor }]}
            onPress={() => setViewMode('by-supplement')}
            accessibilityRole="button"
            accessibilityLabel="By Supplement tab"
            testID="btn-insights-tab-by-supplement"
          >
            <ThemedText style={[styles.tabText, viewMode === 'by-supplement' && { color: 'white' }]}>By Supplement</ThemedText>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, viewMode === 'by-test' && { backgroundColor: tintColor }]}
            onPress={() => setViewMode('by-test')}
            accessibilityRole="button"
            accessibilityLabel="By Test tab"
            testID="btn-insights-tab-by-test"
          >
            <ThemedText style={[styles.tabText, viewMode === 'by-test' && { color: 'white' }]}>By Test</ThemedText>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, viewMode === 'stacks' && { backgroundColor: tintColor }]}
            onPress={() => setViewMode('stacks')}
            accessibilityRole="button"
            accessibilityLabel="Stacks tab"
            testID="btn-insights-tab-stacks"
          >
            <ThemedText style={[styles.tabText, viewMode === 'stacks' && { color: 'white' }]}>Stacks</ThemedText>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, viewMode === 'profiles' && { backgroundColor: tintColor }]}
            onPress={() => setViewMode('profiles')}
            accessibilityRole="button"
            accessibilityLabel="Profiles tab"
            testID="btn-insights-tab-profiles"
          >
            <ThemedText style={[styles.tabText, viewMode === 'profiles' && { color: 'white' }]}>Profiles</ThemedText>
          </TouchableOpacity>
        </ScrollView>
      </View>

      <ScrollView 
        style={styles.content} 
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={tintColor} />
        }
      >
        {viewMode === 'summary' && renderSummaryView()}
        {viewMode === 'by-supplement' && renderBySupplementView()}
        {viewMode === 'by-test' && renderByTestView()}
        {viewMode === 'stacks' && renderStacksView()}
        {viewMode === 'profiles' && renderProfilesView()}

        <View style={styles.disclaimer}>
          <Ionicons name="information-circle-outline" size={16} color="#8E8E93" />
          <ThemedText style={styles.disclaimerText}>
            Correlation does not imply causation. Individual results vary. This is not medical advice.
          </ThemedText>
        </View>
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
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 12,
    marginBottom: 20,
  },
  backButton: {
    padding: 8,
  },
  headerButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  headerButton: {
    padding: 8,
  },
  pkAnalysisButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: 'rgba(128,128,128,0.1)',
  },
  pkAnalysisButtonText: {
    fontSize: 12,
    fontWeight: '600',
  },
  refreshButton: {
    padding: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    opacity: 0.7,
  },
  tabContainer: {
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  tabScroll: {
    gap: 8,
  },
  tab: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: 'rgba(128, 128, 128, 0.1)',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  dataQualityCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  dataQualityHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  dataQualityTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  dataQualityText: {
    fontSize: 14,
    opacity: 0.7,
  },
  recommendationsContainer: {
    marginTop: 12,
    gap: 8,
  },
  recommendationItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  recommendationText: {
    flex: 1,
    fontSize: 13,
    opacity: 0.8,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  sectionDescription: {
    fontSize: 14,
    opacity: 0.6,
    marginBottom: 12,
  },
  correlationCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  correlationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  correlationSupplement: {
    fontSize: 16,
    fontWeight: '600',
  },
  correlationTest: {
    fontSize: 14,
    opacity: 0.7,
  },
  correlationContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  correlationMetric: {
    alignItems: 'flex-start',
  },
  percentChange: {
    fontSize: 28,
    fontWeight: 'bold',
  },
  metricLabel: {
    fontSize: 12,
    opacity: 0.6,
    marginTop: 2,
  },
  correlationDetails: {
    alignItems: 'flex-end',
  },
  timingWindow: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 4,
  },
  confidenceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 2,
  },
  confidenceDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  confidenceText: {
    fontSize: 12,
    opacity: 0.7,
  },
  sampleSize: {
    fontSize: 12,
    opacity: 0.5,
  },
  scoreComparison: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(128, 128, 128, 0.2)',
  },
  scoreLabel: {
    fontSize: 12,
    opacity: 0.6,
  },
  stackCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  stackHeader: {
    marginBottom: 12,
  },
  stackSupplements: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  stackPill: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
  },
  stackPillText: {
    fontSize: 13,
    fontWeight: '500',
  },
  stackTest: {
    fontSize: 14,
    opacity: 0.7,
  },
  stackContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  stackMetric: {
    alignItems: 'flex-start',
  },
  stackVsIndividual: {
    alignItems: 'flex-end',
  },
  vsIndividualValue: {
    fontSize: 18,
    fontWeight: '600',
  },
  vsIndividualLabel: {
    fontSize: 11,
    opacity: 0.6,
  },
  stackFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
  },
  doseCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  doseHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  doseSupplement: {
    fontSize: 16,
    fontWeight: '600',
  },
  doseTest: {
    fontSize: 14,
    opacity: 0.7,
  },
  doseBars: {
    gap: 8,
  },
  doseBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  doseLabel: {
    width: 40,
    fontSize: 12,
    opacity: 0.7,
  },
  doseBarFill: {
    height: 8,
    borderRadius: 4,
    minWidth: 20,
  },
  doseValue: {
    fontSize: 12,
    opacity: 0.7,
  },
  doseTrend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(128, 128, 128, 0.2)',
  },
  doseTrendText: {
    fontSize: 13,
    fontWeight: '500',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyStateTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginTop: 16,
  },
  emptyStateText: {
    fontSize: 14,
    opacity: 0.6,
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 20,
    lineHeight: 20,
  },
  emptyStateActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
  },
  emptyStateButton: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  emptyStateButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  expandableSection: {
    marginBottom: 12,
  },
  expandableHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderWidth: 1,
    borderRadius: 12,
  },
  expandableTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  expandableInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  expandableCount: {
    fontSize: 14,
    opacity: 0.6,
  },
  expandableContent: {
    marginTop: 8,
  },
  noDataContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  noDataText: {
    fontSize: 16,
    opacity: 0.6,
    marginTop: 12,
  },
  noDataSubtext: {
    fontSize: 14,
    opacity: 0.5,
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 40,
  },
  disclaimer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 16,
    marginTop: 20,
    marginBottom: 40,
    backgroundColor: 'rgba(128, 128, 128, 0.1)',
    borderRadius: 8,
  },
  disclaimerText: {
    flex: 1,
    fontSize: 12,
    opacity: 0.6,
    lineHeight: 18,
  },
  chartSection: {
    marginBottom: 16,
  },
  chartToggle: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderWidth: 1,
    borderRadius: 8,
    backgroundColor: 'rgba(128, 128, 128, 0.05)',
  },
  chartToggleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  chartToggleText: {
    fontSize: 14,
    fontWeight: '500',
  },
  chartContainer: {
    marginTop: 8,
    padding: 12,
    borderWidth: 1,
    borderRadius: 8,
  },
  testTypeSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  testTypeSelectorLabel: {
    fontSize: 13,
    opacity: 0.7,
    marginRight: 8,
  },
  testTypePills: {
    flexDirection: 'row',
  },
  testTypePill: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(128, 128, 128, 0.1)',
    marginRight: 6,
  },
  testTypePillText: {
    fontSize: 12,
    fontWeight: '500',
  },
  chartLoading: {
    height: 180,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  chartLoadingText: {
    fontSize: 13,
    opacity: 0.6,
  },
  effectStats: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(128, 128, 128, 0.2)',
  },
  effectStatRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  effectStatLabel: {
    fontSize: 13,
    opacity: 0.7,
  },
  effectStatValue: {
    fontSize: 13,
    fontWeight: '500',
  },
  insufficientData: {
    fontSize: 13,
    opacity: 0.6,
    fontStyle: 'italic',
    textAlign: 'center',
  },
});