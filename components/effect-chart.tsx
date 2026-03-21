import React, { useMemo } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import Svg, { Line, Rect, Circle, Text as SvgText, G, Path } from 'react-native-svg';
import { ThemedText } from './themed-text';
import { useThemeColor } from '@/hooks/use-theme-color';

interface TestResult {
  timestamp: number;
  score: number;
}

interface Phase {
  type: 'on' | 'off';
  start: number;
  end: number;
}

interface EffectChartProps {
  testResults: TestResult[];
  phases: Phase[];
  supplementName: string;
  testType: string;
  baselineMean?: number;
  width?: number;
  height?: number;
}

const PADDING = { top: 20, right: 20, bottom: 40, left: 50 };

export function EffectChart({
  testResults,
  phases,
  supplementName,
  testType,
  baselineMean,
  width: propWidth,
  height = 220,
}: EffectChartProps) {
  const screenWidth = Dimensions.get('window').width;
  const width = propWidth ?? screenWidth - 32;
  
  const textColor = useThemeColor({}, 'text');
  const tintColor = useThemeColor({}, 'tint');
  
  const chartWidth = width - PADDING.left - PADDING.right;
  const chartHeight = height - PADDING.top - PADDING.bottom;

  const sortedResults = useMemo(() => 
    [...testResults].sort((a, b) => a.timestamp - b.timestamp),
    [testResults]
  );

  const { minTime, maxTime, minScore, maxScore, yTicks, xTicks } = useMemo(() => {
    if (sortedResults.length === 0) {
      const now = Math.floor(Date.now() / 1000);
      return {
        minTime: now - 86400 * 7,
        maxTime: now,
        minScore: 0,
        maxScore: 100,
        yTicks: [0, 25, 50, 75, 100],
        xTicks: [],
      };
    }

    const timestamps = sortedResults.map(r => r.timestamp);
    const scores = sortedResults.map(r => r.score);
    
    const tMin = Math.min(...timestamps);
    const tMax = Math.max(...timestamps);
    const sMin = Math.min(...scores, baselineMean ?? Infinity);
    const sMax = Math.max(...scores, baselineMean ?? -Infinity);
    
    const scoreRange = sMax - sMin || 1;
    const scorePadding = scoreRange * 0.1;
    const adjustedMin = Math.max(0, Math.floor(sMin - scorePadding));
    const adjustedMax = Math.ceil(sMax + scorePadding);
    
    const yTickCount = 5;
    const yStep = (adjustedMax - adjustedMin) / (yTickCount - 1);
    const yTicksArr = Array.from({ length: yTickCount }, (_, i) => 
      Math.round(adjustedMin + i * yStep)
    );

    const timeRange = tMax - tMin || 86400;
    const dayCount = Math.ceil(timeRange / 86400);
    const xTickInterval = Math.max(1, Math.ceil(dayCount / 6));
    const xTicksArr: number[] = [];
    
    let tickTime = tMin - (tMin % 86400);
    while (tickTime <= tMax + 86400) {
      if (tickTime >= tMin) {
        xTicksArr.push(tickTime);
      }
      tickTime += 86400 * xTickInterval;
    }

    return {
      minTime: tMin,
      maxTime: tMax,
      minScore: adjustedMin,
      maxScore: adjustedMax,
      yTicks: yTicksArr,
      xTicks: xTicksArr,
    };
  }, [sortedResults, baselineMean]);

  const timeToX = (timestamp: number): number => {
    const timeRange = maxTime - minTime || 1;
    return PADDING.left + ((timestamp - minTime) / timeRange) * chartWidth;
  };

  const scoreToY = (score: number): number => {
    const scoreRange = maxScore - minScore || 1;
    return PADDING.top + chartHeight - ((score - minScore) / scoreRange) * chartHeight;
  };

  const formatDate = (timestamp: number): string => {
    const date = new Date(timestamp * 1000);
    return `${date.getMonth() + 1}/${date.getDate()}`;
  };

  const linePath = useMemo(() => {
    if (sortedResults.length < 2) return '';
    
    return sortedResults.map((result, i) => {
      const x = timeToX(result.timestamp);
      const y = scoreToY(result.score);
      return i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`;
    }).join(' ');
  }, [sortedResults, minTime, maxTime, minScore, maxScore, chartWidth, chartHeight]);

  const phaseRects = useMemo(() => {
    return phases
      .filter(phase => phase.type === 'on')
      .map((phase, i) => {
        const x1 = Math.max(PADDING.left, timeToX(phase.start));
        const x2 = Math.min(PADDING.left + chartWidth, timeToX(phase.end));
        
        if (x2 <= x1) return null;
        
        return (
          <Rect
            key={`phase-${i}`}
            x={x1}
            y={PADDING.top}
            width={x2 - x1}
            height={chartHeight}
            fill="rgba(52, 199, 89, 0.15)"
          />
        );
      })
      .filter(Boolean);
  }, [phases, minTime, maxTime, chartWidth, chartHeight]);

  if (sortedResults.length === 0) {
    return (
      <View style={[styles.container, { width, height }]}>
        <ThemedText style={styles.title}>
          {supplementName} → {testType}
        </ThemedText>
        <View style={styles.emptyState}>
          <ThemedText style={styles.emptyText}>No data available</ThemedText>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { width }]}>
      <ThemedText style={styles.title}>
        {supplementName} → {testType}
      </ThemedText>
      
      <Svg width={width} height={height}>
        {phaseRects}

        {yTicks.map((tick, i) => (
          <G key={`y-tick-${i}`}>
            <Line
              x1={PADDING.left}
              y1={scoreToY(tick)}
              x2={PADDING.left + chartWidth}
              y2={scoreToY(tick)}
              stroke={textColor}
              strokeOpacity={0.1}
              strokeWidth={1}
            />
            <SvgText
              x={PADDING.left - 8}
              y={scoreToY(tick) + 4}
              fontSize={10}
              fill={textColor}
              textAnchor="end"
              opacity={0.6}
            >
              {tick}
            </SvgText>
          </G>
        ))}

        {xTicks.map((tick, i) => (
          <G key={`x-tick-${i}`}>
            <Line
              x1={timeToX(tick)}
              y1={PADDING.top}
              x2={timeToX(tick)}
              y2={PADDING.top + chartHeight}
              stroke={textColor}
              strokeOpacity={0.1}
              strokeWidth={1}
            />
            <SvgText
              x={timeToX(tick)}
              y={PADDING.top + chartHeight + 16}
              fontSize={10}
              fill={textColor}
              textAnchor="middle"
              opacity={0.6}
            >
              {formatDate(tick)}
            </SvgText>
          </G>
        ))}

        <Line
          x1={PADDING.left}
          y1={PADDING.top}
          x2={PADDING.left}
          y2={PADDING.top + chartHeight}
          stroke={textColor}
          strokeOpacity={0.3}
          strokeWidth={1}
        />
        <Line
          x1={PADDING.left}
          y1={PADDING.top + chartHeight}
          x2={PADDING.left + chartWidth}
          y2={PADDING.top + chartHeight}
          stroke={textColor}
          strokeOpacity={0.3}
          strokeWidth={1}
        />

        {baselineMean !== undefined && (
          <Line
            x1={PADDING.left}
            y1={scoreToY(baselineMean)}
            x2={PADDING.left + chartWidth}
            y2={scoreToY(baselineMean)}
            stroke="#FF9500"
            strokeWidth={1.5}
            strokeDasharray="4,4"
          />
        )}

        {linePath && (
          <Path
            d={linePath}
            stroke={tintColor}
            strokeWidth={2}
            fill="none"
          />
        )}

        {sortedResults.map((result, i) => (
          <Circle
            key={`point-${i}`}
            cx={timeToX(result.timestamp)}
            cy={scoreToY(result.score)}
            r={4}
            fill={tintColor}
          />
        ))}
      </Svg>

      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendColor, { backgroundColor: 'rgba(52, 199, 89, 0.3)' }]} />
          <ThemedText style={styles.legendText}>On supplement</ThemedText>
        </View>
        {baselineMean !== undefined && (
          <View style={styles.legendItem}>
            <View style={[styles.legendLine, { backgroundColor: '#FF9500' }]} />
            <ThemedText style={styles.legendText}>Baseline mean ({baselineMean.toFixed(1)})</ThemedText>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 8,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptyState: {
    height: 180,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    opacity: 0.5,
  },
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 16,
    marginTop: 8,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendColor: {
    width: 12,
    height: 12,
    borderRadius: 2,
  },
  legendLine: {
    width: 16,
    height: 2,
  },
  legendText: {
    fontSize: 11,
    opacity: 0.7,
  },
});
