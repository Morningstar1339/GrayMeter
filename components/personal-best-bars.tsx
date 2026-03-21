import React from 'react';
import { View, StyleSheet } from 'react-native';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';
import { useThemeColor } from '@/hooks/use-theme-color';
import { DimensionScores, DimensionKey } from '@/database/cognitive-dimensions';
import { Ionicons } from '@expo/vector-icons';

interface Props {
  scores: DimensionScores;
  showMood?: boolean;
}

const DIMENSION_ORDER: { key: DimensionKey; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'quickness', label: 'Processing Speed', icon: 'flash' },
  { key: 'memory', label: 'Working Memory', icon: 'hardware-chip' },
  { key: 'focus', label: 'Sustained Attention', icon: 'eye' },
  { key: 'impulse_control', label: 'Inhibitory Control', icon: 'hand-left' },
  { key: 'agility', label: 'Cognitive Flexibility', icon: 'shuffle' },
  { key: 'pattern_recognition', label: 'Spatial/Visual', icon: 'grid' },
];

interface BarProps {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  pctOfBest: number;
  percentile: number;
  trend: 'above_baseline' | 'baseline' | 'below_baseline';
  hasData: boolean;
  isSubjective?: boolean;
}

function PersonalBestBar({ label, icon, pctOfBest, percentile, trend, hasData, isSubjective }: BarProps) {
  const tintColor = useThemeColor({}, 'tint');
  const textColor = useThemeColor({}, 'text');
  
  const barColor = !hasData ? textColor + '20' :
                   pctOfBest >= 90 ? '#34C759' :
                   pctOfBest >= 70 ? tintColor :
                   pctOfBest >= 50 ? '#FF9500' :
                   '#FF3B30';
  
  const trendIcon = trend === 'above_baseline' ? 'caret-up' :
                    trend === 'below_baseline' ? 'caret-down' :
                    null;
  
  const trendColor = trend === 'above_baseline' ? '#34C759' :
                     trend === 'below_baseline' ? '#FF3B30' :
                     textColor;
  
  return (
    <View style={styles.barContainer}>
      <View style={styles.barHeader}>
        <View style={styles.labelRow}>
          <Ionicons 
            name={icon} 
            size={14} 
            color={isSubjective ? '#FF9500' : tintColor} 
          />
          <ThemedText style={styles.barLabel}>{label}</ThemedText>
          {isSubjective && (
            <ThemedText style={styles.subjectiveTag}>(subjective)</ThemedText>
          )}
        </View>
        <View style={styles.valueRow}>
          {hasData ? (
            <>
              <ThemedText style={[styles.percentValue, { color: barColor }]}>
                {pctOfBest.toFixed(0)}%
              </ThemedText>
              {trendIcon && (
                <Ionicons name={trendIcon} size={12} color={trendColor} />
              )}
            </>
          ) : (
            <ThemedText style={styles.noData}>--</ThemedText>
          )}
        </View>
      </View>
      
      <View style={styles.barTrack}>
        <View 
          style={[
            styles.barFill, 
            { 
              width: hasData ? `${Math.min(100, pctOfBest)}%` : '0%',
              backgroundColor: barColor,
            }
          ]} 
        />
        {hasData && pctOfBest >= 95 && (
          <View style={styles.peakIndicator}>
            <Ionicons name="star" size={10} color="#FFD700" />
          </View>
        )}
      </View>
      
      {hasData && (
        <ThemedText style={styles.percentileLabel}>
          {percentile.toFixed(0)}th percentile
        </ThemedText>
      )}
    </View>
  );
}

export function PersonalBestBars({ scores, showMood = false }: Props) {
  const textColor = useThemeColor({}, 'text');
  
  if (!scores.hasData) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.placeholder}>
          <Ionicons name="bar-chart-outline" size={32} color={textColor} style={{ opacity: 0.3 }} />
          <ThemedText style={styles.placeholderText}>
            Complete tests to track your personal bests
          </ThemedText>
        </View>
      </ThemedView>
    );
  }
  
  return (
    <ThemedView style={styles.container}>
      <View style={styles.headerRow}>
        <ThemedText style={styles.title}>% of Personal Best</ThemedText>
        <View style={styles.legend}>
          <View style={styles.legendItem}>
            <Ionicons name="star" size={10} color="#FFD700" />
            <ThemedText style={styles.legendText}>Near peak</ThemedText>
          </View>
        </View>
      </View>
      
      {DIMENSION_ORDER.map(dim => {
        const score = scores[dim.key];
        return (
          <PersonalBestBar
            key={dim.key}
            label={dim.label}
            icon={dim.icon}
            pctOfBest={score.pctOfBest}
            percentile={score.percentile}
            trend={score.trend}
            hasData={score.contributingTests > 0}
          />
        );
      })}
      
      {showMood && (
        <PersonalBestBar
          label="Subjective State"
          icon="happy"
          pctOfBest={scores.mood.pctOfBest}
          percentile={scores.mood.percentile}
          trend={scores.mood.trend}
          hasData={scores.mood.contributingTests > 0}
          isSubjective
        />
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    borderRadius: 12,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
  },
  legend: {
    flexDirection: 'row',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendText: {
    fontSize: 11,
    opacity: 0.6,
  },
  barContainer: {
    marginBottom: 14,
  },
  barHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  barLabel: {
    fontSize: 13,
    fontWeight: '500',
  },
  subjectiveTag: {
    fontSize: 10,
    opacity: 0.5,
    fontStyle: 'italic',
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  percentValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  noData: {
    fontSize: 14,
    opacity: 0.4,
  },
  barTrack: {
    height: 8,
    backgroundColor: 'rgba(128,128,128,0.15)',
    borderRadius: 4,
    overflow: 'hidden',
    position: 'relative',
  },
  barFill: {
    height: '100%',
    borderRadius: 4,
  },
  peakIndicator: {
    position: 'absolute',
    right: 4,
    top: -1,
  },
  percentileLabel: {
    fontSize: 10,
    opacity: 0.5,
    marginTop: 2,
  },
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
    gap: 12,
  },
  placeholderText: {
    textAlign: 'center',
    opacity: 0.5,
    fontSize: 14,
  },
});
