import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Path, Line, Text as SvgText } from 'react-native-svg';
import { useThemeColor } from '@/hooks/use-theme-color';
import { 
  CurveConfig, 
  evaluateStack,
  BatemanParams,
  LinearParams,
  WithdrawalParams,
  PeriodicParams,
} from '@/database/pk-curves';

interface Props {
  curves: CurveConfig[];
  width?: number;
  height?: number;
  showAxes?: boolean;
  showLabels?: boolean;
  color?: string;
}

export function MiniCurveGraph({ 
  curves, 
  width = 150, 
  height = 80,
  showAxes = true,
  showLabels = true,
  color,
}: Props) {
  const tintColor = useThemeColor({}, 'tint');
  const textColor = useThemeColor({}, 'text');
  const lineColor = color || tintColor;
  
  const { path, maxTime, timeUnit } = useMemo(() => {
    if (curves.length === 0) {
      return { path: '', maxTime: 24, timeUnit: 'hours', maxEffect: 1 };
    }
    
    let estimatedMaxTime = 24;
    let unit = 'hours';
    
    for (const curve of curves) {
      switch (curve.type) {
        case 'bateman': {
          const p = curve.params as BatemanParams;
          const halfLife = 0.693 / p.ke;
          estimatedMaxTime = Math.max(estimatedMaxTime, halfLife * 5);
          break;
        }
        case 'linear': {
          const p = curve.params as LinearParams;
          const duration = p.magnitude / p.rate + p.onset;
          estimatedMaxTime = Math.max(estimatedMaxTime, duration * 1.2);
          break;
        }
        case 'withdrawal': {
          const p = curve.params as WithdrawalParams;
          estimatedMaxTime = (p.peak_day + p.resolution_days * 2) * 24;
          unit = 'days';
          break;
        }
        case 'periodic': {
          const p = curve.params as PeriodicParams;
          estimatedMaxTime = p.period_days * 24 * 1.5;
          unit = 'days';
          break;
        }
      }
    }
    
    const padding = { left: 25, right: 10, top: 10, bottom: 20 };
    const graphWidth = width - padding.left - padding.right;
    const graphHeight = height - padding.top - padding.bottom;
    
    const numPoints = 100;
    const timeStep = estimatedMaxTime / numPoints;
    
    const points: { t: number; effect: number }[] = [];
    let maxEff = 0;
    
    for (let i = 0; i <= numPoints; i++) {
      const t = i * timeStep;
      const effect = evaluateStack(curves, t);
      points.push({ t, effect });
      maxEff = Math.max(maxEff, Math.abs(effect));
    }
    
    if (maxEff === 0) maxEff = 1;
    
    const pathParts: string[] = [];
    points.forEach((point, i) => {
      const x = padding.left + (point.t / estimatedMaxTime) * graphWidth;
      const normalizedEffect = (point.effect / maxEff + 1) / 2;
      const y = padding.top + (1 - normalizedEffect) * graphHeight;
      
      if (i === 0) {
        pathParts.push(`M ${x} ${y}`);
      } else {
        pathParts.push(`L ${x} ${y}`);
      }
    });
    
    return { 
      path: pathParts.join(' '), 
      maxTime: estimatedMaxTime, 
      timeUnit: unit,
      maxEffect: maxEff,
    };
  }, [curves, width, height]);
  
  const padding = { left: 25, right: 10, top: 10, bottom: 20 };
  const graphWidth = width - padding.left - padding.right;
  const graphHeight = height - padding.top - padding.bottom;
  const baselineY = padding.top + graphHeight / 2;
  
  const timeLabels = useMemo(() => {
    const displayTime = timeUnit === 'days' ? maxTime / 24 : maxTime;
    const mid = displayTime / 2;
    return {
      start: '0',
      mid: mid.toFixed(0),
      end: displayTime.toFixed(0),
      unit: timeUnit === 'days' ? 'd' : 'h',
    };
  }, [maxTime, timeUnit]);
  
  if (curves.length === 0) {
    return (
      <View style={[styles.container, { width, height }]}>
        <View style={[styles.placeholder, { borderColor: textColor + '30' }]}>
          <SvgText fill={textColor} opacity={0.4} fontSize={10}>
            No curves
          </SvgText>
        </View>
      </View>
    );
  }
  
  return (
    <View style={[styles.container, { width, height }]}>
      <Svg width={width} height={height}>
        {showAxes && (
          <>
            <Line
              x1={padding.left}
              y1={baselineY}
              x2={width - padding.right}
              y2={baselineY}
              stroke={textColor}
              strokeOpacity={0.2}
              strokeWidth={1}
              strokeDasharray="3,3"
            />
            <Line
              x1={padding.left}
              y1={padding.top}
              x2={padding.left}
              y2={height - padding.bottom}
              stroke={textColor}
              strokeOpacity={0.3}
              strokeWidth={1}
            />
            <Line
              x1={padding.left}
              y1={height - padding.bottom}
              x2={width - padding.right}
              y2={height - padding.bottom}
              stroke={textColor}
              strokeOpacity={0.3}
              strokeWidth={1}
            />
          </>
        )}
        
        <Path
          d={path}
          fill="none"
          stroke={lineColor}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        
        {showLabels && (
          <>
            <SvgText
              x={padding.left}
              y={height - 4}
              fill={textColor}
              opacity={0.5}
              fontSize={9}
              textAnchor="start"
            >
              {timeLabels.start}
            </SvgText>
            <SvgText
              x={padding.left + graphWidth / 2}
              y={height - 4}
              fill={textColor}
              opacity={0.5}
              fontSize={9}
              textAnchor="middle"
            >
              {timeLabels.mid}
            </SvgText>
            <SvgText
              x={width - padding.right}
              y={height - 4}
              fill={textColor}
              opacity={0.5}
              fontSize={9}
              textAnchor="end"
            >
              {timeLabels.end}{timeLabels.unit}
            </SvgText>
            
            <SvgText
              x={4}
              y={padding.top + 4}
              fill={textColor}
              opacity={0.5}
              fontSize={8}
              textAnchor="start"
            >
              +
            </SvgText>
            <SvgText
              x={4}
              y={height - padding.bottom - 2}
              fill={textColor}
              opacity={0.5}
              fontSize={8}
              textAnchor="start"
            >
              −
            </SvgText>
          </>
        )}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'transparent',
  },
  placeholder: {
    flex: 1,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
