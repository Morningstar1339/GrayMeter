import React, { useState, useEffect, useCallback } from 'react';
import { StyleSheet, ScrollView, TouchableOpacity, View, ActivityIndicator, RefreshControl } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
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
  SupplementSummaryItem,
  TestSummaryItem,
  formatPercentChange,
  formatConfidence,
  getTimingWindowLabel,
  getTestTypeLabel,
} from '@/database/correlation-analysis';

type ViewMode = 'summary' | 'by-supplement' | 'by-test' | 'stacks';

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
        Based on {dataQuality.totalSupplementLogs} supplement logs across {dataQuality.uniqueSupplements} supplement{dataQuality.uniqueSupplements !== 1 ? 's' : ''} and {dataQuality.totalTestResults} test results across {dataQuality.uniqueTestTypes} test type{dataQuality.uniqueTestTypes !== 1 ? 's' : ''} over {dataQuality.trackingDays} days
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
      {correlation.sampleSize < 3 && (
        <View style={[styles.preliminaryBadge, { backgroundColor: '#FF9500' + '20' }]}>
          <Ionicons name="time-outline" size={12} color="#FF9500" />
          <ThemedText style={styles.preliminaryText}>Preliminary — more data will improve accuracy</ThemedText>
        </View>
      )}
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
        <ThemedText style={styles.scoreLabel}>After supplement: {correlation.windowScore.toFixed(1)}</ThemedText>
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

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Ionicons name="analytics-outline" size={64} color="#8E8E93" />
      <ThemedText style={styles.emptyStateTitle}>Not Enough Data Yet</ThemedText>
      <ThemedText style={styles.emptyStateText}>
        Log more supplements and complete more cognitive tests to see patterns. We recommend at least 2 weeks of consistent tracking.
      </ThemedText>
      <View style={styles.emptyStateActions}>
        <TouchableOpacity 
          style={[styles.emptyStateButton, { backgroundColor: tintColor }]}
          onPress={() => router.push('/supplements')}
        >
          <ThemedText style={styles.emptyStateButtonText}>Log Supplement</ThemedText>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.emptyStateButton, { backgroundColor: tintColor }]}
          onPress={() => router.push('/cognitive-tests')}
        >
          <ThemedText style={styles.emptyStateButtonText}>Take Test</ThemedText>
        </TouchableOpacity>
      </View>
    </View>
  );

  const formatTimeAgo = (timestamp: number): string => {
    const now = Math.floor(Date.now() / 1000);
    const diff = now - timestamp;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  };

  const hasAnyInsights = (data: InsightsSummary): boolean => {
    return data.topFindings.length > 0 || data.stackInsights.length > 0 || data.doseResponses.length > 0;
  };

  const hasAnyData = (data: InsightsSummary): boolean => {
    return data.supplementSummaries.length > 0 || data.testSummaries.length > 0;
  };

  const renderSupplementSummaryCard = (item: SupplementSummaryItem) => (
    <View key={`supp-summary-${item.supplementId}`} style={[styles.correlationCard, { borderColor: tintColor + '20' }]}>
      <View style={styles.correlationHeader}>
        <ThemedText style={styles.correlationSupplement}>{item.supplementName}</ThemedText>
        {item.lastTaken > 0 && (
          <ThemedText style={styles.confidenceText}>{formatTimeAgo(item.lastTaken)}</ThemedText>
        )}
      </View>
      <View style={styles.correlationContent}>
        <View style={styles.correlationMetric}>
          <ThemedText style={[styles.percentChange, { color: tintColor, fontSize: 22 }]}>
            {item.totalLogs}
          </ThemedText>
          <ThemedText style={styles.metricLabel}>doses logged</ThemedText>
        </View>
        <View style={styles.correlationDetails}>
          {item.totalLogs > 0 ? (
            <ThemedText style={styles.timingWindow}>
              {item.totalDosage.toFixed(0)} {item.dosageUnit} total
            </ThemedText>
          ) : (
            <ThemedText style={[styles.timingWindow, { opacity: 0.5 }]}>
              No doses yet
            </ThemedText>
          )}
        </View>
      </View>
    </View>
  );

  const renderTestSummaryCard = (item: TestSummaryItem) => (
    <View key={`test-summary-${item.testType}`} style={[styles.correlationCard, { borderColor: tintColor + '20' }]}>
      <View style={styles.correlationHeader}>
        <ThemedText style={styles.correlationSupplement}>{getTestTypeLabel(item.testType)}</ThemedText>
        <ThemedText style={styles.confidenceText}>{formatTimeAgo(item.lastTaken)}</ThemedText>
      </View>
      <View style={styles.correlationContent}>
        <View style={styles.correlationMetric}>
          <ThemedText style={[styles.percentChange, { color: tintColor, fontSize: 22 }]}>
            {item.averageScore.toFixed(1)}
          </ThemedText>
          <ThemedText style={styles.metricLabel}>avg score ({item.totalResults} tests)</ThemedText>
        </View>
        <View style={styles.correlationDetails}>
          <ThemedText style={styles.timingWindow}>Best: {item.bestScore.toFixed(1)}</ThemedText>
        </View>
      </View>
    </View>
  );

  const renderSummaryView = () => {
    if (!insights) return null;

    return (
      <>
        {renderDataQuality(insights.dataQuality)}

        {hasAnyInsights(insights) ? (
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

            {insights.supplementSummaries.length > 0 && (
              <View style={styles.section}>
                <ThemedText style={styles.sectionTitle}>Supplement Activity</ThemedText>
                {insights.supplementSummaries.map(item => renderSupplementSummaryCard(item))}
              </View>
            )}

            {insights.testSummaries.length > 0 && (
              <View style={styles.section}>
                <ThemedText style={styles.sectionTitle}>Test Results</ThemedText>
                {insights.testSummaries.map(item => renderTestSummaryCard(item))}
              </View>
            )}
          </>
        ) : hasAnyData(insights) ? (
          <>
            {insights.supplementSummaries.length > 0 && (
              <View style={styles.section}>
                <ThemedText style={styles.sectionTitle}>Supplement Activity</ThemedText>
                {insights.supplementSummaries.map(item => renderSupplementSummaryCard(item))}
              </View>
            )}

            {insights.testSummaries.length > 0 && (
              <View style={styles.section}>
                <ThemedText style={styles.sectionTitle}>Test Results</ThemedText>
                {insights.testSummaries.map(item => renderTestSummaryCard(item))}
              </View>
            )}
          </>
        ) : (
          renderEmptyState()
        )}
      </>
    );
  };

  const renderBySupplementView = () => {
    if (!insights) return null;

    const supplementIds = Array.from(insights.bySupplementCorrelations.keys());
    const hasCorrelations = supplementIds.length > 0;
    const hasSupplements = insights.supplementSummaries.length > 0;

    return (
      <>
        {renderDataQuality(insights.dataQuality)}

        {hasSupplements ? (
          <>
            <View style={styles.section}>
              <ThemedText style={styles.sectionTitle}>Supplement Activity</ThemedText>
              {!hasCorrelations && (
                <ThemedText style={styles.sectionDescription}>
                  Take cognitive tests after supplements to see their effects
                </ThemedText>
              )}
              {insights.supplementSummaries.map(item => renderSupplementSummaryCard(item))}
            </View>

            {hasCorrelations && (
              <>
                <View style={styles.section}>
                  <ThemedText style={styles.sectionTitle}>Supplement-Test Correlations</ThemedText>
                </View>
                {supplementIds.map(supplementId => {
                  const correlations = insights.bySupplementCorrelations.get(supplementId) || [];
                  if (correlations.length === 0) return null;

                  const isExpanded = expandedSupplements.has(supplementId);
                  const supplementName = correlations[0].supplementName;
                  const bestCorrelation = correlations.reduce((best, c) =>
                    Math.abs(c.percentChange) > Math.abs(best.percentChange) ? c : best, correlations[0]);

                  return (
                    <View key={supplementId} style={styles.expandableSection}>
                      <TouchableOpacity
                        style={[styles.expandableHeader, { borderColor: tintColor + '20' }]}
                        onPress={() => toggleSupplementExpanded(supplementId)}
                      >
                        <View style={styles.expandableTitleContainer}>
                          <ThemedText style={styles.expandableTitle}>{supplementName}</ThemedText>
                          <ThemedText style={[styles.expandableBestChange, { color: getChangeColor(bestCorrelation.percentChange) }]}>
                            Best: {formatPercentChange(bestCorrelation.percentChange)}
                          </ThemedText>
                        </View>
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
                          {correlations.map(correlation => renderCorrelationCard(correlation, false, true))}
                          {insights.doseResponses
                            .filter(d => d.supplementId === supplementId)
                            .map(dose => renderDoseResponse(dose))}
                        </View>
                      )}
                    </View>
                  );
                })}
              </>
            )}
          </>
        ) : (
          <View style={styles.noDataContainer}>
            <Ionicons name="flask-outline" size={48} color="#8E8E93" />
            <ThemedText style={styles.noDataText}>No supplement insights yet</ThemedText>
            <ThemedText style={styles.noDataSubtext}>
              Log supplements and take cognitive tests within a few hours to see how they affect your performance
            </ThemedText>
            <TouchableOpacity
              style={[styles.emptyStateButton, { backgroundColor: tintColor, marginTop: 16 }]}
              onPress={() => router.push('/supplements')}
            >
              <ThemedText style={styles.emptyStateButtonText}>Log Supplement</ThemedText>
            </TouchableOpacity>
          </View>
        )}
      </>
    );
  };

  const renderByTestView = () => {
    if (!insights) return null;

    const testTypes = Array.from(insights.byTestCorrelations.keys());
    const hasCorrelations = testTypes.length > 0;

    return (
      <>
        {renderDataQuality(insights.dataQuality)}

        {insights.testSummaries.length > 0 && (
          <View style={styles.section}>
            <ThemedText style={styles.sectionTitle}>Test Results</ThemedText>
            {!hasCorrelations && (
              <ThemedText style={styles.sectionDescription}>
                Take supplements before tests to see their effects
              </ThemedText>
            )}
            {insights.testSummaries.map(item => renderTestSummaryCard(item))}
          </View>
        )}

        {!hasCorrelations && insights.testSummaries.length === 0 ? (
          <View style={styles.noDataContainer}>
            <Ionicons name="bar-chart-outline" size={48} color="#8E8E93" />
            <ThemedText style={styles.noDataText}>No test insights yet</ThemedText>
            <ThemedText style={styles.noDataSubtext}>
              Complete cognitive tests after taking supplements to see how they correlate
            </ThemedText>
            <TouchableOpacity
              style={[styles.emptyStateButton, { backgroundColor: tintColor, marginTop: 16 }]}
              onPress={() => router.push('/cognitive-tests')}
            >
              <ThemedText style={styles.emptyStateButtonText}>Take Test</ThemedText>
            </TouchableOpacity>
          </View>
        ) : hasCorrelations && (
          <View style={styles.section}>
            <ThemedText style={styles.sectionTitle}>Test-Supplement Correlations</ThemedText>
          </View>
        )}

        {hasCorrelations && (
          testTypes.map(testType => {
            const correlations = insights.byTestCorrelations.get(testType) || [];
            if (correlations.length === 0) return null;

            const isExpanded = expandedTests.has(testType);
            const baseline = insights.baselines.find(b => b.testType === testType);
            const bestCorrelation = correlations.reduce((best, c) =>
              Math.abs(c.percentChange) > Math.abs(best.percentChange) ? c : best, correlations[0]);

            return (
              <View key={testType} style={styles.expandableSection}>
                <TouchableOpacity
                  style={[styles.expandableHeader, { borderColor: tintColor + '20' }]}
                  onPress={() => toggleTestExpanded(testType)}
                >
                  <View style={styles.expandableTitleContainer}>
                    <ThemedText style={styles.expandableTitle}>{getTestTypeLabel(testType)}</ThemedText>
                    {baseline && (
                      <ThemedText style={styles.expandableBaseline}>
                        Baseline: {baseline.baselineScore.toFixed(1)} (n={baseline.sampleSize})
                      </ThemedText>
                    )}
                  </View>
                  <View style={styles.expandableInfo}>
                    <ThemedText style={[styles.expandableBestChange, { color: getChangeColor(bestCorrelation.percentChange) }]}>
                      {formatPercentChange(bestCorrelation.percentChange)}
                    </ThemedText>
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
          })
        )}
      </>
    );
  };

  const renderStacksView = () => {
    if (!insights) return null;

    const hasStacks = insights.stackInsights.length > 0;
    const hasSupplements = insights.supplementSummaries.length > 0;

    return (
      <>
        {renderDataQuality(insights.dataQuality)}

        {hasStacks ? (
          <>
            <View style={styles.section}>
              <ThemedText style={styles.sectionTitle}>Stack Analysis</ThemedText>
              <ThemedText style={styles.sectionDescription}>
                How supplement combinations compare to individual effects
              </ThemedText>
            </View>
            {insights.stackInsights.map(stack => renderStackCard(stack))}
          </>
        ) : hasSupplements ? (
          <View style={styles.section}>
            <ThemedText style={styles.sectionTitle}>Your Supplements</ThemedText>
            <ThemedText style={styles.sectionDescription}>
              Take multiple supplements within 2 hours and complete cognitive tests to see combination effects
            </ThemedText>
            {insights.supplementSummaries.map(item => renderSupplementSummaryCard(item))}
          </View>
        ) : (
          <View style={styles.noDataContainer}>
            <Ionicons name="layers-outline" size={48} color="#8E8E93" />
            <ThemedText style={styles.noDataText}>No stack patterns detected yet</ThemedText>
            <ThemedText style={styles.noDataSubtext}>
              Take multiple supplements within 2 hours and then complete cognitive tests to see combination effects
            </ThemedText>
            <TouchableOpacity
              style={[styles.emptyStateButton, { backgroundColor: tintColor, marginTop: 16 }]}
              onPress={() => router.push('/supplements')}
            >
              <ThemedText style={styles.emptyStateButtonText}>Log Supplements</ThemedText>
            </TouchableOpacity>
          </View>
        )}
      </>
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
        <TouchableOpacity onPress={handleBack} style={styles.backButton}>
          <Ionicons name="home-outline" size={24} color={tintColor} />
        </TouchableOpacity>
        <ThemedText type="title" style={styles.title}>Insights</ThemedText>
        <TouchableOpacity onPress={onRefresh} style={styles.refreshButton}>
          <Ionicons name="refresh" size={24} color={tintColor} />
        </TouchableOpacity>
      </ThemedView>

      <View style={styles.tabContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabScroll}>
          <TouchableOpacity 
            style={[styles.tab, viewMode === 'summary' && { backgroundColor: tintColor }]}
            onPress={() => setViewMode('summary')}
          >
            <ThemedText style={[styles.tabText, viewMode === 'summary' && { color: 'white' }]}>Summary</ThemedText>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.tab, viewMode === 'by-supplement' && { backgroundColor: tintColor }]}
            onPress={() => setViewMode('by-supplement')}
          >
            <ThemedText style={[styles.tabText, viewMode === 'by-supplement' && { color: 'white' }]}>By Supplement</ThemedText>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.tab, viewMode === 'by-test' && { backgroundColor: tintColor }]}
            onPress={() => setViewMode('by-test')}
          >
            <ThemedText style={[styles.tabText, viewMode === 'by-test' && { color: 'white' }]}>By Test</ThemedText>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.tab, viewMode === 'stacks' && { backgroundColor: tintColor }]}
            onPress={() => setViewMode('stacks')}
          >
            <ThemedText style={[styles.tabText, viewMode === 'stacks' && { color: 'white' }]}>Stacks</ThemedText>
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
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 20,
    backgroundColor: 'rgba(128, 128, 128, 0.1)',
    minHeight: 48,
    justifyContent: 'center' as const,
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
  expandableTitleContainer: {
    flex: 1,
    marginRight: 8,
  },
  expandableBestChange: {
    fontSize: 13,
    fontWeight: '600',
  },
  expandableBaseline: {
    fontSize: 12,
    opacity: 0.6,
    marginTop: 2,
  },
  preliminaryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    marginBottom: 8,
    alignSelf: 'flex-start',
  },
  preliminaryText: {
    fontSize: 11,
    color: '#FF9500',
    fontWeight: '500',
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
});