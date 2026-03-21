import React from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Polyline, Line } from 'react-native-svg';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';
import { useThemeColor } from '@/hooks/use-theme-color';
import { DimensionKey } from '@/database/cognitive-dimensions';
import { Ionicons } from '@expo/vector-icons';

interface SparklineData {
  values: number[];
  timestamps: number[];
}

interface Props {
  dimensionKey: DimensionKey;
  label: string;
  data: SparklineData;
  currentPercentile: number;
  trend: 'above_baseline' | 'baseline' | 'below_baseline';
  isSubjective?: boolean;
}

const SPARKLINE_WIDTH = 80;
const SPARKLINE_HEIGHT = 24;

const DIMENSION_ICONS: Record<DimensionKey, keyof typeof Ionicons.glyphMap> = {
  quickness: 'flash',
  memory: 'hardware-chip',
  focus: 'eye',
  impulse_control: 'hand-left',
  agility: 'shuffle',
  pattern_recognition: 'grid',
  mood: 'happy',
};

export function DimensionSparkline({ 
  dimensionKey, 
  label, 
  data, 
  currentPercentile, 
  trend,
  isSubjective = false 
}: Props) {
  const tintColor = useThemeColor({}, 'tint');
  const textColor = useThemeColor({}, 'text');
  
  const trendColor = trend === 'above_baseline' ? '#34C759' :
                     trend === 'below_baseline' ? '#FF3B30' :
                     '#8E8E93';
  
  const trendIcon = trend === 'above_baseline' ? 'trending-up' :
                    trend === 'below_baseline' ? 'trending-down' :
                    'remove';
  
  const renderSparkline = () => {
    if (data.values.length < 2) {
      return (
        <View style={[styles.sparklinePlaceholder, { borderColor: textColor + '20' }]}>
          <ThemedText style={styles.noDataText}>--</ThemedText>
        </View>
      );
    }
    
    const minVal = Math.min(...data.values);
    const maxVal = Math.max(...data.values);
    const range = maxVal - minVal || 1;
    
    const points = data.values.map((val, i) => {
      const x = (i / (data.values.length - 1)) * SPARKLINE_WIDTH;
      const y = SPARKLINE_HEIGHT - ((val - minVal) / range) * SPARKLINE_HEIGHT;
      return `${x},${y}`;
    }).join(' ');
    
    const midY = SPARKLINE_HEIGHT / 2;
    
    return (
      <Svg width={SPARKLINE_WIDTH} height={SPARKLINE_HEIGHT}>
        <Line
          x1={0}
          y1={midY}
          x2={SPARKLINE_WIDTH}
          y2={midY}
          stroke={textColor}
          strokeOpacity={0.2}
          strokeWidth={1}
          strokeDasharray="2,2"
        />
        <Polyline
          points={points}
          fill="none"
          stroke={tintColor}
          strokeWidth={1.5}
        />
      </Svg>
    );
  };
  
  return (
    <ThemedView style={styles.container}>
      <View style={styles.iconContainer}>
        <Ionicons 
          name={DIMENSION_ICONS[dimensionKey]} 
          size={18} 
          color={isSubjective ? '#FF9500' : tintColor} 
        />
      </View>
      
      <View style={styles.labelContainer}>
        <ThemedText style={styles.label}>{label}</ThemedText>
        {isSubjective && (
          <ThemedText style={styles.subjectiveTag}>subjective</ThemedText>
        )}
      </View>
      
      <View style={styles.sparklineContainer}>
        {renderSparkline()}
      </View>
      
      <View style={styles.valueContainer}>
        <ThemedText style={[styles.value, { color: tintColor }]}>
          {currentPercentile > 0 ? `${currentPercentile.toFixed(0)}%` : '--'}
        </ThemedText>
        <Ionicons name={trendIcon as any} size={14} color={trendColor} />
      </View>
    </ThemedView>
  );
}

interface AllSparklinesProps {
  data: Map<DimensionKey, SparklineData>;
  scores: {
    [key in DimensionKey]: {
      percentile: number;
      trend: 'above_baseline' | 'baseline' | 'below_baseline';
      label: string;
      isSubjective: boolean;
    };
  };
}

export function DimensionSparklines({ data, scores }: AllSparklinesProps) {
  const dimensions: DimensionKey[] = [
    'quickness', 'memory', 'focus', 'impulse_control', 
    'agility', 'pattern_recognition', 'mood'
  ];
  
  return (
    <View style={styles.allContainer}>
      {dimensions.map(key => (
        <DimensionSparkline
          key={key}
          dimensionKey={key}
          label={scores[key].label}
          data={data.get(key) || { values: [], timestamps: [] }}
          currentPercentile={scores[key].percentile}
          trend={scores[key].trend}
          isSubjective={scores[key].isSubjective}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 6,
  },
  allContainer: {
    gap: 4,
  },
  iconContainer: {
    width: 28,
    alignItems: 'center',
  },
  labelContainer: {
    flex: 1,
    marginLeft: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
  },
  subjectiveTag: {
    fontSize: 10,
    opacity: 0.5,
    fontStyle: 'italic',
  },
  sparklineContainer: {
    width: SPARKLINE_WIDTH,
    height: SPARKLINE_HEIGHT,
    marginHorizontal: 12,
  },
  sparklinePlaceholder: {
    width: SPARKLINE_WIDTH,
    height: SPARKLINE_HEIGHT,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noDataText: {
    fontSize: 10,
    opacity: 0.4,
  },
  valueContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minWidth: 50,
    justifyContent: 'flex-end',
  },
  value: {
    fontSize: 14,
    fontWeight: '600',
  },
});
