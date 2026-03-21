import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, TouchableOpacity, View, Dimensions, ScrollView, Alert } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useThemeColor } from '@/hooks/use-theme-color';
import { saveCognitiveTestResult } from '@/database/cognitive-tests';
import { getRelevantScheduledTest, completeScheduledTest, getTestContext } from '@/database/study-scheduler';
import Svg, { Line, Circle } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { useHierarchicalBack } from '@/hooks/use-hierarchical-back';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
const NODE_COUNT = 18;
const NODE_RADIUS = 10;

interface Node {
  id: number;
  x: number;
  y: number;
}

export default function RoutePlannerScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const tintColor = useThemeColor({}, 'tint');
  const textColor = useThemeColor({}, 'text');
  const insets = useSafeAreaInsets();
  
  useHierarchicalBack('tests/connections');
  
  const [gameState, setGameState] = useState<'ready' | 'playing' | 'finished'>('ready');
  const [nodes, setNodes] = useState<Node[]>([]);
  const [route, setRoute] = useState<number[]>([]);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [score, setScore] = useState(0);
  const [optimalLength, setOptimalLength] = useState(0);
  const [optimalRoute, setOptimalRoute] = useState<number[]>([]);
  const [scheduledTest, setScheduledTest] = useState<any>(null);
  const [studyContext, setStudyContext] = useState<any>(null);
  
  const elapsedTimer = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);

  // Play area — full screen minus a thin top bar
  const topBarHeight = 44;
  const playTop = insets.top + topBarHeight;
  const playBottom = screenHeight - insets.bottom;
  const playHeight = playBottom - playTop;
  const playLeft = 16;
  const playRight = screenWidth - 16;
  const playWidth = playRight - playLeft;

  const generateNodes = (): Node[] => {
    const result: Node[] = [];
    const minDist = Math.min(playWidth, playHeight) / 7;
    const pad = NODE_RADIUS + 8;
    
    for (let i = 0; i < NODE_COUNT; i++) {
      let attempts = 0;
      let node: Node;
      let valid = false;
      
      do {
        node = {
          id: i,
          x: Math.random() * (playWidth - 2 * pad) + playLeft + pad,
          y: Math.random() * (playHeight - 2 * pad) + playTop + pad,
        };
        valid = result.every(n => {
          const dx = node.x - n.x;
          const dy = node.y - n.y;
          return Math.sqrt(dx * dx + dy * dy) >= minDist;
        });
        attempts++;
      } while (!valid && attempts < 1000);
      
      result.push(node);
    }
    return result;
  };

  const dist = (a: Node, b: Node): number => {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const calcRouteLength = (ns: Node[], r: number[]): number => {
    if (r.length < 2) return 0;
    let total = 0;
    for (let i = 0; i < r.length - 1; i++) {
      total += dist(ns[r[i]], ns[r[i + 1]]);
    }
    total += dist(ns[r[r.length - 1]], ns[r[0]]);
    return total;
  };

  // Held-Karp exact TSP solver — O(2^n * n^2)
  // For n=18: 2^18 * 18^2 = ~85M ops, ~38MB memory
  const solveTSPExact = (ns: Node[]): { length: number; route: number[] } => {
    const n = ns.length;
    if (n <= 1) return { length: 0, route: [0] };
    
    const FULL = (1 << n) - 1;
    
    // Use Float64Arrays for performance
    const size = 1 << n;
    const dp: Float64Array[] = new Array(size);
    const parent: Int8Array[] = new Array(size);
    
    for (let mask = 0; mask < size; mask++) {
      dp[mask] = new Float64Array(n).fill(Infinity);
      parent[mask] = new Int8Array(n).fill(-1);
    }
    
    // Start from node 0
    dp[1][0] = 0;
    
    // Precompute distance matrix
    const d: number[][] = new Array(n);
    for (let i = 0; i < n; i++) {
      d[i] = new Array(n);
      for (let j = 0; j < n; j++) {
        d[i][j] = dist(ns[i], ns[j]);
      }
    }
    
    for (let mask = 1; mask <= FULL; mask++) {
      for (let u = 0; u < n; u++) {
        if (!(mask & (1 << u))) continue;
        const val = dp[mask][u];
        if (val === Infinity) continue;
        
        for (let v = 0; v < n; v++) {
          if (mask & (1 << v)) continue;
          const newMask = mask | (1 << v);
          const newDist = val + d[u][v];
          if (newDist < dp[newMask][v]) {
            dp[newMask][v] = newDist;
            parent[newMask][v] = u;
          }
        }
      }
    }
    
    // Find best last node
    let bestLen = Infinity;
    let lastNode = -1;
    for (let u = 0; u < n; u++) {
      const total = dp[FULL][u] + d[u][0];
      if (total < bestLen) {
        bestLen = total;
        lastNode = u;
      }
    }
    
    // Reconstruct
    const route: number[] = [];
    let mask = FULL;
    let curr = lastNode;
    while (curr !== -1 && curr !== 0) {
      route.push(curr);
      const prev = parent[mask][curr];
      mask ^= (1 << curr);
      curr = prev;
    }
    route.push(0);
    route.reverse();
    
    return { length: bestLen, route };
  };

  const startGame = () => {
    const newNodes = generateNodes();
    setNodes(newNodes);
    setRoute([]);
    setGameState('playing');
    setElapsedTime(0);
    setScore(0);
    
    const optimal = solveTSPExact(newNodes);
    setOptimalLength(optimal.length);
    setOptimalRoute(optimal.route);
    
    startTimeRef.current = Date.now();
    elapsedTimer.current = setInterval(() => {
      setElapsedTime(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000) as any;
  };

  const handleNodePress = (nodeId: number) => {
    if (gameState !== 'playing') return;
    
    // If tapping the start node after visiting all others → finish
    if (route.length === nodes.length && nodeId === route[0]) {
      handleSubmit();
      return;
    }
    
    // If tapping a visited node → undo from that point
    const idx = route.indexOf(nodeId);
    if (idx !== -1) {
      setRoute(route.slice(0, idx));
      return;
    }
    
    setRoute([...route, nodeId]);
  };

  const handleSubmit = async () => {
    if (route.length !== nodes.length) return;
    
    const completionTime = Math.floor((Date.now() - startTimeRef.current) / 1000);
    const userLength = calcRouteLength(nodes, route);
    const efficiency = optimalLength > 0 ? (optimalLength / userLength) * 100 : 0;
    let finalScore = Math.max(0, Math.round(efficiency));
    
    setScore(finalScore);
    setElapsedTime(completionTime);
    
    try {
      const accuracyDecimal = optimalLength > 0 ? Math.min(1, optimalLength / userLength) : 0;
      const rawData = {
        userLength, optimalLength, routeOrder: route,
        nodeCount: nodes.length, efficiency, completionTime,
        accuracy: accuracyDecimal, speed: completionTime,
      };
      
      const studyId = scheduledTest ? studyContext?.study_protocol_id : undefined;
      const supplementLogId = scheduledTest ? studyContext?.supplement_log_id : undefined;
      await saveCognitiveTestResult('judgment', finalScore, rawData, completionTime, studyId, supplementLogId, accuracyDecimal * 100, completionTime);
      if (scheduledTest) await completeScheduledTest(scheduledTest.id);
    } catch (error) {
      console.error('Failed to save test result:', error);
    }
    
    setGameState('finished');
    if (elapsedTimer.current) clearInterval(elapsedTimer.current);
  };

  const handleBackToMenu = () => {
    if (elapsedTimer.current) clearInterval(elapsedTimer.current);
    router.push('/cognitive-tests');
  };

  const handleExitTest = () => {
    if (gameState === 'playing') {
      Alert.alert('Exit Test?', 'Your progress will not be saved.', [
        { text: 'No', style: 'cancel' },
        { text: 'Yes', style: 'destructive', onPress: () => {
          if (elapsedTimer.current) clearInterval(elapsedTimer.current);
          router.push(params.sequence === 'all-nine' ? '/tests/all-nine' : '/cognitive-tests');
        }},
      ]);
    } else {
      router.push(params.sequence === 'all-nine' ? '/tests/all-nine' : '/cognitive-tests');
    }
  };

  const handleNextTestOrFinish = () => {
    router.push(params.sequence === 'all-nine' ? '/tests/rock-dodger?sequence=all-nine' : '/cognitive-tests');
  };

  useEffect(() => {
    const check = async () => {
      try {
        const t = await getRelevantScheduledTest('judgment');
        if (t) { setScheduledTest(t); setStudyContext(await getTestContext(t.id)); }
      } catch (e) { console.error(e); }
    };
    check();
    return () => { if (elapsedTimer.current) clearInterval(elapsedTimer.current); };
  }, []);

  // === READY ===
  if (gameState === 'ready') {
    return (
      <ThemedView style={styles.container} safeArea>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.centered}>
            {params.sequence === 'all-nine' && (
              <View style={[styles.banner, { backgroundColor: tintColor + '15', borderColor: tintColor }]}>
                <ThemedText style={[styles.bannerText, { color: tintColor }]}>Test 4 of 9</ThemedText>
              </View>
            )}
            <ThemedText type="title" style={styles.title}>Route Planner</ThemedText>
            {scheduledTest && studyContext?.supplement_name && (
              <View style={[styles.banner, { backgroundColor: tintColor + '20', borderColor: tintColor }]}>
                <ThemedText style={[styles.bannerText, { color: tintColor }]}>📊 Study: {studyContext.supplement_name}</ThemedText>
              </View>
            )}
            <ThemedText style={styles.instructions}>
              Find the shortest route through all {NODE_COUNT} nodes.{'\n\n'}
              Tap nodes to build your route.{'\n'}
              Tap the start node to complete the loop.{'\n'}
              Tap any visited node to undo.
            </ThemedText>
            <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: tintColor }]} onPress={startGame} accessibilityRole="button" accessibilityLabel="Start route planner test" testID="btn-connections-start">
              <ThemedText style={styles.primaryBtnText}>Start</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryBtn} onPress={handleBackToMenu} accessibilityRole="button" accessibilityLabel="Back to menu" testID="btn-connections-back">
              <ThemedText style={styles.secondaryBtnText}>Back</ThemedText>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </ThemedView>
    );
  }

  // === FINISHED ===
  if (gameState === 'finished') {
    const userLength = calcRouteLength(nodes, route);
    const efficiency = optimalLength > 0 ? ((optimalLength / userLength) * 100).toFixed(1) : '0';
    
    const previewW = screenWidth - 60;
    const previewH = 300;
    const scaleNode = (n: Node) => ({
      x: ((n.x - playLeft) / playWidth) * previewW,
      y: ((n.y - playTop) / playHeight) * previewH,
    });
    
    return (
      <ThemedView style={styles.container} safeArea>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.centered}>
            <ThemedText type="title" style={styles.title}>Route Complete</ThemedText>
            <ThemedText style={styles.bigStat}>{efficiency}%</ThemedText>
            <ThemedText style={styles.statLabel}>efficiency</ThemedText>
            <ThemedText style={styles.subStats}>
              You: {userLength.toFixed(0)}  •  Optimal: {optimalLength.toFixed(0)}  •  {elapsedTime}s
            </ThemedText>
            
            <View style={[styles.previewBox, { width: previewW, height: previewH }]}>  
              <Svg width={previewW} height={previewH}>
                {/* User route first (underneath) */}
                {route.map((id, i) => {
                  const a = scaleNode(nodes[id]);
                  const b = scaleNode(nodes[route[(i + 1) % route.length]]);
                  return <Line key={`u${i}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={tintColor} strokeWidth="2" />;
                })}
                {/* Optimal route on top */}
                {optimalRoute.map((id, i) => {
                  const a = scaleNode(nodes[id]);
                  const b = scaleNode(nodes[optimalRoute[(i + 1) % optimalRoute.length]]);
                  return <Line key={`o${i}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#4CAF50" strokeWidth="2" strokeDasharray="5,4" opacity={0.7} />;
                })}
                {nodes.map(n => {
                  const p = scaleNode(n);
                  return <Circle key={n.id} cx={p.x} cy={p.y} r={5} fill={tintColor} />;
                })}
              </Svg>
            </View>
            <View style={styles.legendRow}>
              <View style={styles.legendItem}><View style={[styles.legendLine, { backgroundColor: tintColor }]} /><ThemedText style={styles.legendText}>Yours</ThemedText></View>
              <View style={styles.legendItem}><View style={[styles.legendLine, { backgroundColor: '#4CAF50' }]} /><ThemedText style={styles.legendText}>Optimal</ThemedText></View>
            </View>

            <ThemedText style={styles.resultMsg}>
              {Number(efficiency) >= 98 ? 'Virtually optimal.' :
               Number(efficiency) >= 90 ? 'Excellent routing.' :
               Number(efficiency) >= 80 ? 'Good effort.' : 'Keep practicing.'}
            </ThemedText>

            {params.sequence === 'all-nine' ? (
              <>
                <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: tintColor }]} onPress={handleNextTestOrFinish} accessibilityRole="button" accessibilityLabel="Next test" testID="btn-connections-next">
                  <ThemedText style={styles.primaryBtnText}>Next Test →</ThemedText>
                </TouchableOpacity>
                <TouchableOpacity style={styles.secondaryBtn} onPress={handleExitTest} accessibilityRole="button" accessibilityLabel="Exit sequence" testID="btn-connections-exit">
                  <ThemedText style={styles.secondaryBtnText}>Exit Sequence</ThemedText>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: tintColor }]} onPress={startGame} accessibilityRole="button" accessibilityLabel="Play again" testID="btn-connections-play-again">
                  <ThemedText style={styles.primaryBtnText}>Play Again</ThemedText>
                </TouchableOpacity>
                <TouchableOpacity style={styles.secondaryBtn} onPress={handleBackToMenu} accessibilityRole="button" accessibilityLabel="Back to menu" testID="btn-connections-back-menu">
                  <ThemedText style={styles.secondaryBtnText}>Back</ThemedText>
                </TouchableOpacity>
              </>
            )}
          </View>
        </ScrollView>
      </ThemedView>
    );
  }

  // === PLAYING — pure dots and lines ===
  const allVisited = route.length === nodes.length;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemedView style={styles.container} safeArea>
        {/* Thin top bar — timer and count only */}
        <View style={styles.topBar}>
          <TouchableOpacity onPress={handleExitTest} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} accessibilityRole="button" accessibilityLabel="Exit test" testID="btn-connections-exit-playing">
            <Ionicons name="close" size={22} color={textColor} />
          </TouchableOpacity>
          <ThemedText style={styles.topText}>{(() => {
            if (route.length < 2) return '0';
            let d = 0;
            for (let i = 0; i < route.length - 1; i++) d += dist(nodes[route[i]], nodes[route[i + 1]]);
            if (route.length === nodes.length) d += dist(nodes[route[route.length - 1]], nodes[route[0]]);
            return Math.round(d);
          })()}</ThemedText>
          <ThemedText style={styles.topText}>{elapsedTime}s</ThemedText>
        </View>

        {/* Play field — just dots and lines, nothing else */}
        <View style={{ flex: 1 }}>
          <Svg width={screenWidth} height={playHeight} style={StyleSheet.absoluteFill}>
            {route.map((id, i) => {
              if (i === 0) return null;
              const a = nodes[route[i - 1]];
              const b = nodes[id];
              return (
                <Line key={`r${i}`}
                  x1={a.x} y1={a.y - playTop}
                  x2={b.x} y2={b.y - playTop}
                  stroke={tintColor} strokeWidth="2"
                />
              );
            })}
            {/* Show return line when all visited — solid, same as rest */}
            {allVisited && route.length >= 2 && (
              <Line
                x1={nodes[route[route.length - 1]].x} y1={nodes[route[route.length - 1]].y - playTop}
                x2={nodes[route[0]].x} y2={nodes[route[0]].y - playTop}
                stroke={tintColor} strokeWidth="2"
              />
            )}
          </Svg>

          {nodes.map(node => {
            const visitIdx = route.indexOf(node.id);
            const isVisited = visitIdx !== -1;
            const isStart = visitIdx === 0;
            return (
              <TouchableOpacity
                key={node.id}
                onPress={() => handleNodePress(node.id)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel={`Node ${node.id + 1}`}
                testID={`btn-connections-node-${node.id}`}
                style={[
                  styles.node,
                  {
                    left: node.x - NODE_RADIUS,
                    top: node.y - playTop - NODE_RADIUS,
                    width: NODE_RADIUS * 2,
                    height: NODE_RADIUS * 2,
                    borderRadius: NODE_RADIUS,
                    backgroundColor: isVisited ? tintColor : '#8E8E93',
                    borderWidth: 1.5,
                    borderColor: 'white',
                  },
                ]}
              />
            );
          })}
        </View>
      </ThemedView>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { flexGrow: 1, padding: 20, paddingTop: 40 },
  centered: { alignItems: 'center', paddingTop: 20 },
  title: { fontSize: 28, fontWeight: 'bold', marginBottom: 16, textAlign: 'center' },
  instructions: { fontSize: 16, lineHeight: 24, textAlign: 'center', marginBottom: 24, opacity: 0.8 },
  banner: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 1, marginBottom: 16 },
  bannerText: { fontSize: 14, fontWeight: '600' },
  primaryBtn: { paddingHorizontal: 48, paddingVertical: 14, borderRadius: 25, marginBottom: 12 },
  primaryBtnText: { color: 'white', fontSize: 18, fontWeight: '600', textAlign: 'center' },
  secondaryBtn: { paddingVertical: 10 },
  secondaryBtnText: { fontSize: 16, opacity: 0.6, textAlign: 'center' },
  // Playing
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, height: 44 },
  topText: { fontSize: 15, fontWeight: '600', opacity: 0.7 },
  node: { position: 'absolute', zIndex: 10 },
  // Results
  bigStat: { fontSize: 42, fontWeight: 'bold', marginTop: 12, marginBottom: 4 },
  statLabel: { fontSize: 16, opacity: 0.6, marginBottom: 8 },
  subStats: { fontSize: 14, opacity: 0.5, marginBottom: 20, textAlign: 'center' },
  previewBox: { backgroundColor: 'rgba(128,128,128,0.05)', borderRadius: 12, marginBottom: 8 },
  legendRow: { flexDirection: 'row', justifyContent: 'center', gap: 24, marginBottom: 16 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendLine: { width: 20, height: 3, borderRadius: 2 },
  legendText: { fontSize: 13, opacity: 0.7 },
  resultMsg: { fontSize: 18, fontWeight: '500', textAlign: 'center', marginBottom: 24 },
});
