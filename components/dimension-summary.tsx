import React from 'react';
import { View, StyleSheet } from 'react-native';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';
import { useThemeColor } from '@/hooks/use-theme-color';
import { DimensionScores, getDimensionSummary } from '@/database/cognitive-dimensions';
import { Ionicons } from '@expo/vector-icons';

interface Props {
  scores: DimensionScores;
  compact?: boolean;
}

export function DimensionSummary({ scores, compact = false }: Props) {
  const tintColor = useThemeColor({}, 'tint');
  const textColor = useThemeColor({}, 'text');
  
  if (!scores.hasData) {
    return (
      <ThemedView style={[styles.container, compact && styles.containerCompact]}>
        <View style={styles.iconRow}>
          <Ionicons name="analytics-outline" size={20} color={textColor} style={{ opacity: 0.5 }} />
        </View>
        <ThemedText style={styles.noDataText}>
          Complete cognitive tests to see your personalized insights
        </ThemedText>
      </ThemedView>
    );
  }
  
  const summary = getDimensionSummary(scores);
  
  const performanceDims = [
    scores.quickness,
    scores.memory,
    scores.focus,
    scores.impulse_control,
    scores.agility,
    scores.pattern_recognition,
  ].filter(d => d.contributingTests > 0);
  
  const avgPercentile = performanceDims.length > 0
    ? performanceDims.reduce((sum, d) => sum + d.percentile, 0) / performanceDims.length
    : 0;
  
  const overallTrend = avgPercentile >= 60 ? 'strong' :
                       avgPercentile >= 40 ? 'balanced' :
                       'developing';
  
  const trendColor = overallTrend === 'strong' ? '#34C759' :
                     overallTrend === 'developing' ? '#FF9500' :
                     tintColor;
  
  const trendIcon = overallTrend === 'strong' ? 'trending-up' :
                    overallTrend === 'developing' ? 'trending-down' :
                    'analytics';
  
  if (compact) {
    return (
      <ThemedView style={[styles.container, styles.containerCompact]}>
        <View style={styles.compactRow}>
          <View style={[styles.trendBadge, { backgroundColor: trendColor + '20' }]}>
            <Ionicons name={trendIcon as any} size={16} color={trendColor} />
            <ThemedText style={[styles.trendText, { color: trendColor }]}>
              {avgPercentile.toFixed(0)}%
            </ThemedText>
          </View>
          <ThemedText style={styles.compactSummary} numberOfLines={2}>
            {summary}
          </ThemedText>
        </View>
      </ThemedView>
    );
  }
  
  return (
    <ThemedView style={styles.container}>
      <View style={styles.headerRow}>
        <View style={[styles.trendBadge, { backgroundColor: trendColor + '20' }]}>
          <Ionicons name={trendIcon as any} size={18} color={trendColor} />
          <ThemedText style={[styles.trendLabel, { color: trendColor }]}>
            {overallTrend === 'strong' ? 'Performing Well' :
             overallTrend === 'developing' ? 'Room to Grow' :
             'Balanced'}
          </ThemedText>
        </View>
        <ThemedText style={[styles.avgScore, { color: tintColor }]}>
          {avgPercentile.toFixed(0)}%
        </ThemedText>
      </View>
      
      <ThemedText style={styles.summaryText}>{summary}</ThemedText>
      
      {scores.mood.contributingTests > 0 && (
        <View style={styles.moodSection}>
          <Ionicons name="happy-outline" size={16} color="#FF9500" />
          <ThemedText style={styles.moodText}>
            Subjective state: {scores.mood.percentile.toFixed(0)}th percentile
            {scores.mood.trend !== 'baseline' && (
              <ThemedText style={{ color: scores.mood.trend === 'above_baseline' ? '#34C759' : '#FF3B30' }}>
                {scores.mood.trend === 'above_baseline' ? ' (above usual)' : ' (below usual)'}
              </ThemedText>
            )}
          </ThemedText>
        </View>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    borderRadius: 12,
  },
  containerCompact: {
    padding: 12,
  },
  iconRow: {
    alignItems: 'center',
    marginBottom: 8,
  },
  noDataText: {
    textAlign: 'center',
    opacity: 0.6,
    fontSize: 14,
    lineHeight: 20,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  trendBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
  },
  trendLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  trendText: {
    fontSize: 14,
    fontWeight: '700',
  },
  avgScore: {
    fontSize: 24,
    fontWeight: '700',
  },
  summaryText: {
    fontSize: 14,
    lineHeight: 20,
    opacity: 0.8,
  },
  moodSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(128,128,128,0.2)',
  },
  moodText: {
    fontSize: 13,
    opacity: 0.7,
  },
  compactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  compactSummary: {
    flex: 1,
    fontSize: 13,
    opacity: 0.8,
    lineHeight: 18,
  },
});
