import React, { useState, useEffect, useRef, useCallback } from 'react';
import { StyleSheet, TouchableOpacity, View, Dimensions, Alert, ScrollView } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useThemeColor } from '@/hooks/use-theme-color';
import { saveCognitiveTestResult } from '@/database/cognitive-tests';
import { getRelevantScheduledTest, completeScheduledTest, getTestContext, isUserInActiveTestSession } from '@/database/study-scheduler';
import { useHierarchicalBack } from '@/hooks/use-hierarchical-back';
import { Ionicons } from '@expo/vector-icons';

const { height: screenHeight } = Dimensions.get('window');
const BALL_SIZE = 40;

const COLORS = ['#FF3B30', '#007AFF', '#34C759', '#FFCC00', '#AF52DE', '#FF9500', '#5AC8FA', '#FF2D55'];
const COLOR_NAMES = ['Red', 'Blue', 'Green', 'Yellow', 'Purple', 'Orange', 'Cyan', 'Pink'];
const BALL_OPTIONS = [5, 6, 7, 8];

interface Ball {
  id: number;
  color: string;
  colorName: string;
  colorIndex: number;
}

interface GuessRecord {
  pattern: Ball[];
  matches: number;
}

export default function PatternMatcherTestScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const tintColor = useThemeColor({}, 'tint');

  useHierarchicalBack('tests/pattern-matcher');

  const [gameState, setGameState] = useState<'ready' | 'playing' | 'finished'>('ready');
  const [numBalls, setNumBalls] = useState(5);
  const [targetPattern, setTargetPattern] = useState<Ball[]>([]);
  const [playerRack, setPlayerRack] = useState<Ball[]>([]);
  const [selectedPosition, setSelectedPosition] = useState<number | null>(null);
  const [swapCount, setSwapCount] = useState(0);
  const [matchCount, setMatchCount] = useState(0);
  const [scheduledTest, setScheduledTest] = useState<any>(null);
  const [studyContext, setStudyContext] = useState<any>(null);
  const [guessHistory, setGuessHistory] = useState<GuessRecord[]>([]);
  const [historyExpanded, setHistoryExpanded] = useState(true);

  const startTime = useRef<number>(0);
  const completionTimeRef = useRef<number>(0);

  const generatePattern = (count: number): Ball[] => {
    const indices = Array.from({ length: count }, (_, i) => i);
    const shuffled = indices.sort(() => Math.random() - 0.5);
    return shuffled.map((colorIndex, i) => ({
      id: i, color: COLORS[colorIndex], colorName: COLOR_NAMES[colorIndex], colorIndex,
    }));
  };

  const createScrambledRack = (pattern: Ball[]): Ball[] => {
    let scrambled: Ball[];
    do {
      const indices = Array.from({ length: pattern.length }, (_, i) => i);
      const shuffled = indices.sort(() => Math.random() - 0.5);
      scrambled = shuffled.map((colorIndex, i) => ({
        id: i, color: COLORS[colorIndex], colorName: COLOR_NAMES[colorIndex], colorIndex,
      }));
    } while (checkMatches(scrambled, pattern) > 0);
    return scrambled;
  };

  const checkMatches = (rack: Ball[], pattern: Ball[]): number => {
    let m = 0;
    for (let i = 0; i < Math.min(rack.length, pattern.length); i++) {
      if (rack[i]?.colorIndex === pattern[i]?.colorIndex) m++;
    }
    return m;
  };

  const handleBallPress = (position: number) => {
    if (selectedPosition === null) {
      setSelectedPosition(position);
    } else if (selectedPosition === position) {
      setSelectedPosition(null);
    } else {
      const newRack = [...playerRack];
      [newRack[selectedPosition], newRack[position]] = [newRack[position], newRack[selectedPosition]];
      setPlayerRack(newRack);
      setSelectedPosition(null);
      setSwapCount(prev => prev + 1);

      const newMatches = checkMatches(newRack, targetPattern);
      setMatchCount(newMatches);
      setGuessHistory(prev => [{ pattern: [...newRack], matches: newMatches }, ...prev]);

      if (newMatches === targetPattern.length) {
        endGame(newRack);
      }
    }
  };

  const startGame = async () => {
    try {
      const activeSession = await isUserInActiveTestSession();
      if (activeSession.isActive && String(activeSession.activeTest?.test_type) !== 'pattern_matcher') {
        Alert.alert('Test Session Active',
          `Active ${activeSession.activeTest?.test_type} test. Continue anyway?`,
          [{ text: 'Cancel', style: 'cancel' }, { text: 'Continue', onPress: () => startGameNow() }]);
        return;
      }
    } catch (e) { console.error(e); }
    startGameNow();
  };

  const startGameNow = () => {
    const pattern = generatePattern(numBalls);
    const rack = createScrambledRack(pattern);
    setGameState('playing');
    setTargetPattern(pattern);
    setPlayerRack(rack);
    setSelectedPosition(null);
    setSwapCount(0);
    setMatchCount(0);
    setGuessHistory([{ pattern: rack, matches: checkMatches(rack, pattern) }]);
    startTime.current = Date.now();
  };

  const endGame = useCallback(async (finalRack?: Ball[]) => {
    const ct = (Date.now() - startTime.current) / 1000;
    completionTimeRef.current = ct;
    setGameState('finished');

    const efficiencyBonus = Math.max(0, 50 - (swapCount * 3));
    const timeBonus = Math.max(0, 50 - ct);
    const difficultyMultiplier = numBalls * 0.2;
    const score = Math.floor((timeBonus + efficiencyBonus) * difficultyMultiplier);

    const rawData = {
      completionTime: ct, swapCount, numBalls,
      patternColors: targetPattern.map(b => b.colorName),
      accuracy: 100, speed: ct,
    };

    try {
      const studyId = scheduledTest ? studyContext?.study_protocol_id : undefined;
      const supplementLogId = scheduledTest ? studyContext?.supplement_log_id : undefined;
      await saveCognitiveTestResult('pattern_matcher', score, rawData, ct, studyId, supplementLogId, 100, ct);
      if (scheduledTest) await completeScheduledTest(scheduledTest.id);
    } catch (e) { console.error('Failed to save:', e); }
  }, [scheduledTest, studyContext, swapCount, targetPattern, numBalls]);

  const handleBackToMenu = () => {
    router.push(params.sequence === 'all-nine' ? '/tests/all-nine' : '/cognitive-tests');
  };

  const handleNextTestOrFinish = () => {
    router.push(params.sequence === 'all-nine' ? '/tests/tile-puzzle?sequence=all-nine' : '/cognitive-tests');
  };

  const handleExitTest = () => {
    if (gameState === 'playing') {
      Alert.alert('Exit Test?', 'Your progress will not be saved.', [
        { text: 'No', style: 'cancel' },
        { text: 'Yes', style: 'destructive', onPress: handleBackToMenu },
      ]);
    } else {
      handleBackToMenu();
    }
  };

  useEffect(() => {
    const check = async () => {
      try {
        const t = await getRelevantScheduledTest('pattern_matcher');
        if (t) { setScheduledTest(t); setStudyContext(await getTestContext(t.id)); }
      } catch (e) { console.error(e); }
    };
    check();
  }, []);

  // === READY ===
  if (gameState === 'ready') {
    return (
      <ThemedView style={styles.container} safeArea>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.centered}>
            {params.sequence === 'all-nine' && (
              <View style={[styles.banner, { backgroundColor: tintColor + '15', borderColor: tintColor }]}>
                <ThemedText style={[styles.bannerText, { color: tintColor }]}>Test 6 of 9</ThemedText>
              </View>
            )}
            <ThemedText type="title" style={styles.title}>Deduction</ThemedText>
            {scheduledTest && studyContext?.supplement_name && (
              <View style={[styles.banner, { backgroundColor: tintColor + '20', borderColor: tintColor }]}>
                <ThemedText style={[styles.bannerText, { color: tintColor }]}>📊 Study: {studyContext.supplement_name}</ThemedText>
              </View>
            )}
            <ThemedText style={styles.instructions}>
              Deduce the hidden color sequence.{'\n\n'}
              Tap two balls to swap them.{'\n'}
              After each swap, you see how many are correct.{'\n'}
              Use logic to find the right order.
            </ThemedText>

            <ThemedText style={styles.selectorLabel}>Number of balls:</ThemedText>
            <View style={styles.selectorRow}>
              {BALL_OPTIONS.map(n => (
                <TouchableOpacity
                  key={n}
                  style={[
                    styles.selectorBtn,
                    numBalls === n ? { backgroundColor: tintColor } : { borderColor: tintColor, borderWidth: 1 },
                  ]}
                  onPress={() => setNumBalls(n)}
                  accessibilityRole="button"
                  accessibilityLabel={`${n} balls`}
                  testID={`btn-pattern-balls-${n}`}
                >
                  <ThemedText style={[styles.selectorBtnText, numBalls === n && { color: 'white' }]}>{n}</ThemedText>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: tintColor }]} onPress={startGame} accessibilityRole="button" accessibilityLabel="Start pattern matcher test" testID="btn-pattern-start">
              <ThemedText style={styles.primaryBtnText}>Start</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryBtn} onPress={handleBackToMenu} accessibilityRole="button" accessibilityLabel="Back to menu" testID="btn-pattern-back">
              <ThemedText style={styles.secondaryBtnText}>Back</ThemedText>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </ThemedView>
    );
  }

  // === FINISHED ===
  if (gameState === 'finished') {
    const ct = completionTimeRef.current;
    return (
      <ThemedView style={styles.container} safeArea>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.centered}>
            <ThemedText type="title" style={styles.title}>Pattern Solved</ThemedText>
            <ThemedText style={styles.bigStat}>{ct.toFixed(1)}s</ThemedText>
            <ThemedText style={styles.statLabel}>{swapCount} swaps  •  {numBalls} balls</ThemedText>
            <ThemedText style={styles.resultMsg}>
              {swapCount <= numBalls ? 'Excellent deduction.' :
               swapCount <= numBalls * 2 ? 'Good logical thinking.' :
               swapCount <= numBalls * 3 ? 'Solid effort.' : 'Keep practicing.'}
            </ThemedText>

            {/* Show final pattern */}
            <View style={styles.finalPatternRow}>
              {targetPattern.map((ball, i) => (
                <View key={i} style={[styles.smallBall, { backgroundColor: ball.color }]} />
              ))}
            </View>

            {params.sequence === 'all-nine' ? (
              <>
                <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: tintColor }]} onPress={handleNextTestOrFinish} accessibilityRole="button" accessibilityLabel="Next test" testID="btn-pattern-next">
                  <ThemedText style={styles.primaryBtnText}>Next Test →</ThemedText>
                </TouchableOpacity>
                <TouchableOpacity style={styles.secondaryBtn} onPress={handleBackToMenu} accessibilityRole="button" accessibilityLabel="Exit sequence" testID="btn-pattern-exit">
                  <ThemedText style={styles.secondaryBtnText}>Exit Sequence</ThemedText>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: tintColor }]} onPress={() => { setGameState('ready'); }} accessibilityRole="button" accessibilityLabel="Play again" testID="btn-pattern-play-again">
                  <ThemedText style={styles.primaryBtnText}>Play Again</ThemedText>
                </TouchableOpacity>
                <TouchableOpacity style={styles.secondaryBtn} onPress={handleBackToMenu} accessibilityRole="button" accessibilityLabel="Back to menu" testID="btn-pattern-back-menu">
                  <ThemedText style={styles.secondaryBtnText}>Back</ThemedText>
                </TouchableOpacity>
              </>
            )}
          </View>
        </ScrollView>
      </ThemedView>
    );
  }

  // === PLAYING ===
  return (
    <ThemedView style={styles.container} safeArea>
      <ScrollView contentContainerStyle={styles.gameContent} showsVerticalScrollIndicator={false}>
        {/* Top bar */}
        <View style={styles.topBar}>
          <TouchableOpacity onPress={handleExitTest} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} accessibilityRole="button" accessibilityLabel="Exit test" testID="btn-pattern-exit-playing">
            <Ionicons name="close" size={22} color={tintColor} />
          </TouchableOpacity>
          <ThemedText style={styles.topText}>Swaps: {swapCount}</ThemedText>
          <ThemedText style={[styles.topText, matchCount === targetPattern.length && { color: '#34C759' }]}>
            {matchCount}/{targetPattern.length}
          </ThemedText>
        </View>

        {/* Player rack */}
        <View style={styles.rackSection}>
          <View style={styles.rackRow}>
            {playerRack.map((ball, index) => {
              const isSelected = selectedPosition === index;
              return (
                <TouchableOpacity
                  key={index}
                  style={[
                    styles.ball,
                    {
                      backgroundColor: ball.color,
                      borderColor: isSelected ? '#FFD700' : '#ccc',
                      borderWidth: isSelected ? 4 : 1,
                      transform: [{ scale: isSelected ? 1.1 : 1 }],
                    },
                  ]}
                  onPress={() => handleBallPress(index)}
                  accessibilityRole="button"
                  accessibilityLabel={`${ball.colorName} ball at position ${index + 1}${isSelected ? ', selected' : ''}`}
                  testID={`btn-pattern-ball-${index}`}
                />
              );
            })}
          </View>
          <ThemedText style={styles.hint}>
            {selectedPosition !== null ? 'Tap another ball to swap' : 'Tap a ball to select it'}
          </ThemedText>
        </View>

        {/* History */}
        {guessHistory.length > 0 && (
          <View style={styles.historySection}>
            <TouchableOpacity style={styles.historyHeader} onPress={() => setHistoryExpanded(!historyExpanded)} accessibilityRole="button" accessibilityLabel={`${historyExpanded ? 'Collapse' : 'Expand'} history`} testID="btn-pattern-history-toggle">
              <ThemedText style={styles.historyTitle}>
                History ({guessHistory.length}) {historyExpanded ? '▼' : '▶'}
              </ThemedText>
            </TouchableOpacity>
            {historyExpanded && (
              <ScrollView style={styles.historyList} nestedScrollEnabled>
                {guessHistory.map((guess, idx) => (
                  <View key={idx} style={styles.historyRow}>
                    <View style={styles.historyDots}>
                      {guess.pattern.map((ball, i) => (
                        <View key={i} style={[styles.historyDot, { backgroundColor: ball.color }]} />
                      ))}
                    </View>
                    <ThemedText style={styles.historyMatches}>{guess.matches}/{numBalls}</ThemedText>
                  </View>
                ))}
              </ScrollView>
            )}
          </View>
        )}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { flexGrow: 1, padding: 20, paddingTop: 40 },
  gameContent: { flexGrow: 1, padding: 20 },
  centered: { alignItems: 'center', paddingTop: 20 },
  title: { fontSize: 28, fontWeight: 'bold', marginBottom: 16, textAlign: 'center' },
  instructions: { fontSize: 16, lineHeight: 24, textAlign: 'center', marginBottom: 24, opacity: 0.8 },
  banner: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 1, marginBottom: 16 },
  bannerText: { fontSize: 14, fontWeight: '600' },
  // Selector
  selectorLabel: { fontSize: 16, fontWeight: '600', marginBottom: 12 },
  selectorRow: { flexDirection: 'row', gap: 12, marginBottom: 28 },
  selectorBtn: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  selectorBtnText: { fontSize: 18, fontWeight: '600' },
  // Buttons
  primaryBtn: { paddingHorizontal: 48, paddingVertical: 14, borderRadius: 25, marginBottom: 12 },
  primaryBtnText: { color: 'white', fontSize: 18, fontWeight: '600', textAlign: 'center' },
  secondaryBtn: { paddingVertical: 10 },
  secondaryBtnText: { fontSize: 16, opacity: 0.6, textAlign: 'center' },
  // Playing
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  topText: { fontSize: 15, fontWeight: '600', opacity: 0.7 },
  rackSection: { alignItems: 'center', marginBottom: 30 },
  rackRow: { flexDirection: 'row', gap: 8, justifyContent: 'center', flexWrap: 'wrap' },
  ball: {
    width: BALL_SIZE, height: BALL_SIZE, borderRadius: BALL_SIZE / 2,
    elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.2, shadowRadius: 2,
  },
  hint: { fontSize: 13, opacity: 0.6, marginTop: 12, textAlign: 'center' },
  // Results
  bigStat: { fontSize: 42, fontWeight: 'bold', marginTop: 12, marginBottom: 4 },
  statLabel: { fontSize: 16, opacity: 0.6, marginBottom: 16 },
  resultMsg: { fontSize: 18, fontWeight: '500', textAlign: 'center', marginBottom: 24 },
  finalPatternRow: { flexDirection: 'row', gap: 8, marginBottom: 28 },
  smallBall: { width: 24, height: 24, borderRadius: 12, borderWidth: 1, borderColor: '#ccc' },
  // History
  historySection: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, overflow: 'hidden', marginBottom: 20 },
  historyHeader: { padding: 10, backgroundColor: 'rgba(128,128,128,0.1)' },
  historyTitle: { fontSize: 14, fontWeight: '600' },
  historyList: { maxHeight: 360, paddingHorizontal: 10 },
  historyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: 'rgba(128,128,128,0.2)' },
  historyDots: { flexDirection: 'row', gap: 4 },
  historyDot: { width: 16, height: 16, borderRadius: 8, borderWidth: 1, borderColor: '#ccc' },
  historyMatches: { fontSize: 14, fontWeight: '500', minWidth: 30, textAlign: 'right' },
});
