import React from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import Svg, { Polygon, Line, Circle, Text as SvgText, G } from 'react-native-svg';
import { ThemedText } from './themed-text';
import { useThemeColor } from '@/hooks/use-theme-color';
import { DimensionScores, DimensionKey } from '@/database/cognitive-dimensions';

const { width: screenWidth } = Dimensions.get('window');
const CHART_SIZE = Math.min(screenWidth - 60, 300);
const CENTER = CHART_SIZE / 2;
const RADIUS = CHART_SIZE / 2 - 40;

interface Props {
  scores: DimensionScores;
  showMood?: boolean;
}

const DIMENSION_ORDER: DimensionKey[] = [
  'quickness',
  'memory', 
  'focus',
  'impulse_control',
  'agility',
  'pattern_recognition',
];

const DIMENSION_LABELS: Record<DimensionKey, string> = {
  quickness: 'Speed',
  memory: 'Memory',
  focus: 'Focus',
  impulse_control: 'Control',
  agility: 'Agility',
  pattern_recognition: 'Pattern',
  mood: 'Mood',
};

export function DimensionRadarChart({ scores, showMood = false }: Props) {
  const tintColor = useThemeColor({}, 'tint');
  const textColor = useThemeColor({}, 'text');
  
  const dimensions = showMood 
    ? [...DIMENSION_ORDER, 'mood' as DimensionKey]
    : DIMENSION_ORDER;
  
  const numAxes = dimensions.length;
  const angleStep = (2 * Math.PI) / numAxes;
  
  const getPoint = (index: number, value: number): { x: number; y: number } => {
    const angle = index * angleStep - Math.PI / 2;
    const r = (value / 100) * RADIUS;
    return {
      x: CENTER + r * Math.cos(angle),
      y: CENTER + r * Math.sin(angle),
    };
  };
  
  const axisLines = dimensions.map((_, i) => {
    const end = getPoint(i, 100);
    return (
      <Line
        key={`axis-${i}`}
        x1={CENTER}
        y1={CENTER}
        x2={end.x}
        y2={end.y}
        stroke={textColor}
        strokeOpacity={0.2}
        strokeWidth={1}
      />
    );
  });
  
  const gridLevels = [25, 50, 75, 100];
  const gridPolygons = gridLevels.map((level) => {
    const points = dimensions.map((_, i) => getPoint(i, level));
    const pointsString = points.map(p => `${p.x},${p.y}`).join(' ');
    return (
      <Polygon
        key={`grid-${level}`}
        points={pointsString}
        fill="none"
        stroke={textColor}
        strokeOpacity={0.1}
        strokeWidth={1}
      />
    );
  });
  
  const dataPoints = dimensions.map((key, i) => {
    const score = scores[key];
    return getPoint(i, score.contributingTests > 0 ? score.percentile : 0);
  });
  const dataPointsString = dataPoints.map(p => `${p.x},${p.y}`).join(' ');
  
  const labels = dimensions.map((key, i) => {
    const point = getPoint(i, 115);
    const score = scores[key];
    const label = DIMENSION_LABELS[key];
    
    return (
      <G key={`label-${key}`}>
        <SvgText
          x={point.x}
          y={point.y}
          fill={textColor}
          fontSize={11}
          fontWeight="500"
          textAnchor="middle"
          alignmentBaseline="middle"
        >
          {label}
        </SvgText>
        {score.contributingTests > 0 && (
          <SvgText
            x={point.x}
            y={point.y + 12}
            fill={tintColor}
            fontSize={10}
            fontWeight="600"
            textAnchor="middle"
            alignmentBaseline="middle"
          >
            {score.percentile.toFixed(0)}%
          </SvgText>
        )}
      </G>
    );
  });
  
  const dots = dataPoints.map((point, i) => {
    const key = dimensions[i];
    const score = scores[key];
    if (score.contributingTests === 0) return null;
    
    return (
      <Circle
        key={`dot-${key}`}
        cx={point.x}
        cy={point.y}
        r={4}
        fill={tintColor}
      />
    );
  });
  
  if (!scores.hasData) {
    return (
      <View style={styles.container}>
        <View style={[styles.placeholder, { borderColor: textColor + '20' }]}>
          <ThemedText style={styles.placeholderText}>
            Complete cognitive tests to see your dimension scores
          </ThemedText>
        </View>
      </View>
    );
  }
  
  return (
    <View style={styles.container}>
      <Svg width={CHART_SIZE} height={CHART_SIZE}>
        {gridPolygons}
        {axisLines}
        <Polygon
          points={dataPointsString}
          fill={tintColor}
          fillOpacity={0.2}
          stroke={tintColor}
          strokeWidth={2}
        />
        {dots}
        {labels}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 10,
  },
  placeholder: {
    width: CHART_SIZE,
    height: CHART_SIZE,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  placeholderText: {
    textAlign: 'center',
    opacity: 0.6,
    fontSize: 14,
  },
});
