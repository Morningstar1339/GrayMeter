import React, { useState, useEffect } from 'react';
import { StyleSheet, TouchableOpacity, View, Dimensions, Alert, ScrollView } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useThemeColor } from '@/hooks/use-theme-color';
import { saveCognitiveTestResult } from '@/database/cognitive-tests';
import { getRelevantScheduledTest, completeScheduledTest, getTestContext } from '@/database/study-scheduler';
import { validateTestPrerequisites, handleTestSaveError } from '@/utils/test-validation';
import { checkDatabaseHealth } from '@/database/database';
import { Ionicons } from '@expo/vector-icons';
import { useHierarchicalBack } from '@/hooks/use-hierarchical-back';

const { width: screenWidth } = Dimensions.get('window');
const BUTTON_WIDTH = (screenWidth - 60) / 2;
const TOTAL_TRIALS = 25;
const MAX_RESPONSE_TIME = 5000;

const COLORS = [
  { name: 'RED', hex: '#E53935' },
  { name: 'BLUE', hex: '#1E88E5' },
  { name: 'GREEN', hex: '#43A047' },
  { name: 'YELLOW', hex: '#FDD835' },
  { name: 'ORANGE', hex: '#FF9800' },
  { name: 'PURPLE', hex: '#9C27B0' },
] as const;

type TrialType = 'word' | 'color';

type ColorName = typeof COLORS[number]['name'];

interface Trial {
  word: ColorName;
  inkColor: ColorName;
  trialType: TrialType;
  correctAnswer: ColorName;
  userAnswer: ColorName | null;
  responseTime: number | null;
  isCorrect: boolean | null;
}

export default function StroopTestScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const tintColor = useThemeColor({}, 'tint');
  
  useHierarchicalBack('tests/stroop');
  
  const [gameState, setGameState] = useState<'ready' | 'playing' | 'finished'>('ready');
  const [currentTrial, setCurrentTrial] = useState(0);
  const [trials, setTrials] = useState<Trial[]>([]);
  const [currentWord, setCurrentWord] = useState<ColorName>('RED');
  const [currentInkColor, setCurrentInkColor] = useState<ColorName>('BLUE');
  const [currentTrialType, setCurrentTrialType] = useState<TrialType>('word');
  const [shuffledColors, setShuffledColors] = useState<typeof COLORS[number][]>([...COLORS]);
  const [trialStartTime, setTrialStartTime] = useState(0);
  const [scheduledTest, setScheduledTest] = useState<any>(null);
  const [studyContext, setStudyContext] = useState<any>(null);
  const [score, setScore] = useState(0);
  const [avgResponseTime, setAvgResponseTime] = useState(0);
  const [typeAStats, setTypeAStats] = useState({ correct: 0, total: 0, avgTime: 0 });
  const [typeBStats, setTypeBStats] = useState({ correct: 0, total: 0, avgTime: 0 });

  const generateTrial = (): { word: ColorName; inkColor: ColorName; trialType: TrialType } => {
    const wordIndex = Math.floor(Math.random() * COLORS.length);
    let inkIndex = Math.floor(Math.random() * COLORS.length);
    while (inkIndex === wordIndex) {
      inkIndex = Math.floor(Math.random() * COLORS.length);
    }
    const trialType: TrialType = Math.random() < 0.5 ? 'word' : 'color';
    return {
      word: COLORS[wordIndex].name,
      inkColor: COLORS[inkIndex].name,
      trialType,
    };
  };

  const getColorHex = (colorName: ColorName): string => {
    return COLORS.find(c => c.name === colorName)?.hex || '#000';
  };

  const shuffleColors = () => {
    const shuffled = [...COLORS].sort(() => Math.random() - 0.5);
    setShuffledColors(shuffled);
  };

  const startGame = async () => {
    const canProceed = await validateTestPrerequisites('Stroop');
    if (!canProceed) return;
    
    setGameState('playing');
    setCurrentTrial(0);
    setTrials([]);
    setScore(0);
    
    const firstTrial = generateTrial();
    setCurrentWord(firstTrial.word);
    setCurrentInkColor(firstTrial.inkColor);
    setCurrentTrialType(firstTrial.trialType);
    shuffleColors();
    setTrialStartTime(Date.now());
  };

  const handleColorPress = (selectedColor: ColorName) => {
    if (gameState !== 'playing') return;
    
    const responseTime = Date.now() - trialStartTime;
    const correctAnswer = currentTrialType === 'word' ? currentInkColor : currentWord;
    const isCorrect = selectedColor === correctAnswer;
    
    const newTrial: Trial = {
      word: currentWord,
      inkColor: currentInkColor,
      trialType: currentTrialType,
      correctAnswer,
      userAnswer: selectedColor,
      responseTime,
      isCorrect,
    };
    
    setTrials(prev => [...prev, newTrial]);
    
    if (currentTrial + 1 >= TOTAL_TRIALS) {
      endGame([...trials, newTrial]);
    } else {
      setCurrentTrial(prev => prev + 1);
      const nextTrial = generateTrial();
      setCurrentWord(nextTrial.word);
      setCurrentInkColor(nextTrial.inkColor);
      setCurrentTrialType(nextTrial.trialType);
      shuffleColors();
      setTrialStartTime(Date.now());
    }
  };

  const endGame = async (finalTrials: Trial[]) => {
    setGameState('finished');
    
    const correctTrials = finalTrials.filter(t => t.isCorrect);
    const accuracyDecimal = correctTrials.length / finalTrials.length;
    const accuracy = accuracyDecimal * 100;
    const avgTime = correctTrials.length > 0
      ? correctTrials.reduce((sum, t) => sum + (t.responseTime || 0), 0) / correctTrials.length
      : MAX_RESPONSE_TIME;
    
    const typeATrials = finalTrials.filter(t => t.trialType === 'word');
    const typeBTrials = finalTrials.filter(t => t.trialType === 'color');
    const typeACorrect = typeATrials.filter(t => t.isCorrect);
    const typeBCorrect = typeBTrials.filter(t => t.isCorrect);
    
    setTypeAStats({
      correct: typeACorrect.length,
      total: typeATrials.length,
      avgTime: typeACorrect.length > 0
        ? typeACorrect.reduce((sum, t) => sum + (t.responseTime || 0), 0) / typeACorrect.length
        : 0,
    });
    setTypeBStats({
      correct: typeBCorrect.length,
      total: typeBTrials.length,
      avgTime: typeBCorrect.length > 0
        ? typeBCorrect.reduce((sum, t) => sum + (t.responseTime || 0), 0) / typeBCorrect.length
        : 0,
    });
    
    setAvgResponseTime(avgTime);
    
    const speedScore = Math.max(0, 1 - (avgTime / MAX_RESPONSE_TIME));
    const finalScore = Math.round(accuracyDecimal * 70 + speedScore * 30);
    setScore(finalScore);
    
    const saveTestResult = async () => {
      try {
        const studyId = scheduledTest ? studyContext?.study_protocol_id : undefined;
        const supplementLogId = scheduledTest ? studyContext?.supplement_log_id : undefined;
        
        const rawData = {
          totalTrials: TOTAL_TRIALS,
          correctAnswers: correctTrials.length,
          accuracy: accuracyDecimal,
          avgResponseTime: avgTime,
          typeATrials: typeATrials.length,
          typeACorrect: typeACorrect.length,
          typeAAccuracy: typeATrials.length > 0 ? typeACorrect.length / typeATrials.length : 0,
          typeBTrials: typeBTrials.length,
          typeBCorrect: typeBCorrect.length,
          typeBAccuracy: typeBTrials.length > 0 ? typeBCorrect.length / typeBTrials.length : 0,
          trials: finalTrials.map(t => ({
            word: t.word,
            inkColor: t.inkColor,
            trialType: t.trialType,
            userAnswer: t.userAnswer,
            responseTime: t.responseTime,
            isCorrect: t.isCorrect,
          })),
        };
        
        await saveCognitiveTestResult('stroop', finalScore, rawData, avgTime / 1000, studyId, supplementLogId, accuracy, avgTime);
        
        if (scheduledTest) {
          await completeScheduledTest(scheduledTest.id);
        }
      } catch (error) {
        handleTestSaveError('Stroop', error, saveTestResult, handleBackToMenu);
      }
    };
    
    await saveTestResult();
  };

  const handleBackToMenu = () => {
    router.push('/cognitive-tests');
  };

  const handleExitTest = () => {
    if (gameState === 'playing') {
      Alert.alert(
        'Exit Test?',
        'Your progress will not be saved.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Exit',
            style: 'destructive',
            onPress: () => {
              if (params.sequence === 'all-nine') {
                router.push('/tests/all-nine');
              } else {
                router.push('/cognitive-tests');
              }
            },
          },
        ]
      );
    } else {
      if (params.sequence === 'all-nine') {
        router.push('/tests/all-nine');
      } else {
        router.push('/cognitive-tests');
      }
    }
  };

  const handlePlayAgain = () => {
    startGame();
  };

  const handleNextTestOrFinish = () => {
    router.push('/cognitive-tests');
  };

  useEffect(() => {
    const checkScheduledTest = async () => {
      try {
        const relevantTest = await getRelevantScheduledTest('stroop');
        if (relevantTest) {
          setScheduledTest(relevantTest);
          const context = await getTestContext(relevantTest.id);
          setStudyContext(context);
        }
      } catch (error) {
        console.error('Failed to check for scheduled test:', error);
      }
    };
    
    checkScheduledTest();
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      console.log('NAVIGATED TO: Stroop Test');
      console.log('DB status on navigation:', checkDatabaseHealth());
      return () => {
        console.log('NAVIGATING AWAY FROM: Stroop Test');
      };
    }, [])
  );

  if (gameState === 'ready') {
    return (
      <ThemedView style={styles.container} safeArea>
        <ScrollView contentContainerStyle={styles.readyContent} showsVerticalScrollIndicator={false}>
          {params.sequence === 'all-nine' && (
            <ThemedView style={[styles.progressBanner, { backgroundColor: tintColor + '15', borderColor: tintColor }]}>
              <ThemedText style={[styles.progressText, { color: tintColor }]}>
                Test 9 of 9
              </ThemedText>
            </ThemedView>
          )}
          
          {scheduledTest && studyContext?.supplement_name && (
            <ThemedView style={[styles.studyBanner, { backgroundColor: tintColor + '20', borderColor: tintColor }]}>
              <ThemedText style={[styles.studyText, { color: tintColor }]}>
                Study: {studyContext.supplement_name}
              </ThemedText>
            </ThemedView>
          )}

          <ThemedText type="title" style={styles.readyTitle}>Coherence Test</ThemedText>

          <ThemedText style={styles.description}>
            Color names appear with a mismatched ink color. If words appear as answer options, select the word that describes the color of the text. If colored buttons appear as options, select the color that the word describes.
          </ThemedText>

          <View style={styles.exampleContainer}>
            <View style={styles.exampleRow}>
              <View style={styles.exampleColumn}>
                <ThemedText style={styles.exampleLabel}>Match the INK</ThemedText>
                <ThemedText style={[styles.exampleStimulus, { color: '#1E88E5' }]}>RED</ThemedText>
                <View style={styles.exampleButtons}>
                  <View style={styles.mockButtonWord}>
                    <ThemedText style={styles.mockButtonWordText}>RED</ThemedText>
                  </View>
                  <View style={styles.mockButtonWordSelected}>
                    <ThemedText style={styles.mockButtonWordText}>BLUE</ThemedText>
                    <Ionicons name="finger-print" size={18} color={tintColor} style={styles.pointerIcon} />
                  </View>
                </View>
              </View>
              
              <View style={styles.exampleColumn}>
                <ThemedText style={styles.exampleLabel}>Match the WORD</ThemedText>
                <ThemedText style={[styles.exampleStimulus, { color: '#1E88E5' }]}>RED</ThemedText>
                <View style={styles.exampleButtons}>
                  <View style={styles.mockButtonColorSelected}>
                    <Ionicons name="finger-print" size={18} color="#fff" style={styles.pointerIconCenter} />
                  </View>
                  <View style={styles.mockButtonColor} />
                </View>
              </View>
            </View>
          </View>

          <ThemedText style={styles.trialInfo}>{TOTAL_TRIALS} trials | ~45 seconds</ThemedText>
          
          <TouchableOpacity
            style={[styles.startButton, { backgroundColor: tintColor }]}
            onPress={startGame}
            accessibilityRole="button"
            accessibilityLabel="Start Stroop test"
            testID="btn-stroop-start"
          >
            <ThemedText style={styles.startButtonText}>Start Test</ThemedText>
          </TouchableOpacity>
          <TouchableOpacity style={styles.backButton} onPress={handleBackToMenu} accessibilityRole="button" accessibilityLabel="Back to menu" testID="btn-stroop-back">
            <ThemedText style={styles.backButtonText}>Back to Menu</ThemedText>
          </TouchableOpacity>
        </ScrollView>
      </ThemedView>
    );
  }

  if (gameState === 'finished') {
    const correctCount = trials.filter(t => t.isCorrect).length;
    const accuracy = (correctCount / TOTAL_TRIALS) * 100;
    
    return (
      <ThemedView style={styles.container} safeArea>
        <ScrollView contentContainerStyle={styles.finishedContent} showsVerticalScrollIndicator={false}>
          <Ionicons name="checkmark-circle" size={64} color="#34C759" />
          <ThemedText type="title" style={styles.finishedTitle}>Complete!</ThemedText>
          <ThemedText style={styles.finalScore}>Score: {score}/100</ThemedText>
          
          <View style={styles.metricsRow}>
            <View style={styles.metricBox}>
              <ThemedText style={styles.metricValue}>{accuracy.toFixed(0)}%</ThemedText>
              <ThemedText style={styles.metricLabel}>Accuracy</ThemedText>
            </View>
            <View style={styles.metricBox}>
              <ThemedText style={styles.metricValue}>{(avgResponseTime / 1000).toFixed(2)}s</ThemedText>
              <ThemedText style={styles.metricLabel}>Avg Time</ThemedText>
            </View>
          </View>
          
          <View style={styles.breakdownContainer}>
            <ThemedText style={styles.breakdownTitle}>By Trial Type</ThemedText>
            <View style={styles.breakdownRow}>
              <ThemedText style={styles.breakdownLabel}>Match INK:</ThemedText>
              <ThemedText style={styles.breakdownValue}>
                {typeAStats.correct}/{typeAStats.total}
              </ThemedText>
            </View>
            <View style={styles.breakdownRow}>
              <ThemedText style={styles.breakdownLabel}>Match WORD:</ThemedText>
              <ThemedText style={styles.breakdownValue}>
                {typeBStats.correct}/{typeBStats.total}
              </ThemedText>
            </View>
          </View>
          
          {params.sequence === 'all-nine' ? (
            <TouchableOpacity
              style={[styles.startButton, { backgroundColor: tintColor }]}
              onPress={handleNextTestOrFinish}
              accessibilityRole="button"
              accessibilityLabel="Finish all tests"
              testID="btn-stroop-finish"
            >
              <ThemedText style={styles.startButtonText}>Finish All Tests</ThemedText>
            </TouchableOpacity>
          ) : (
            <>
              <TouchableOpacity
                style={[styles.startButton, { backgroundColor: tintColor }]}
                onPress={handlePlayAgain}
                accessibilityRole="button"
                accessibilityLabel="Play again"
                testID="btn-stroop-play-again"
              >
                <ThemedText style={styles.startButtonText}>Play Again</ThemedText>
              </TouchableOpacity>
              <TouchableOpacity style={styles.backButton} onPress={handleBackToMenu} accessibilityRole="button" accessibilityLabel="Back to menu" testID="btn-stroop-back-menu">
                <ThemedText style={styles.backButtonText}>Back to Menu</ThemedText>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container} safeArea>
      <ThemedView style={[styles.infoBanner, { borderColor: tintColor }]}>
        <TouchableOpacity
          style={styles.bannerBackButton}
          onPress={handleExitTest}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel="Exit test"
          testID="btn-stroop-exit-playing"
        >
          <Ionicons name="arrow-back" size={20} color={tintColor} />
        </TouchableOpacity>
        <View style={styles.bannerStats}>
          <ThemedText style={styles.bannerStatText}>
            {currentTrial + 1}/{TOTAL_TRIALS}
          </ThemedText>
        </View>
      </ThemedView>
      
      <View style={styles.gameArea}>
        <ThemedText style={styles.instruction}>
          {currentTrialType === 'word' ? 'Match the INK' : 'Match the WORD'}
        </ThemedText>
        
        <View style={styles.wordContainer}>
          <ThemedText 
            style={[styles.stroopWord, { color: getColorHex(currentInkColor) }]}
          >
            {currentWord}
          </ThemedText>
        </View>
        
        <View style={styles.buttonGrid}>
          <View style={styles.buttonRow}>
            {shuffledColors.slice(0, 2).map((color) => (
              <TouchableOpacity
                key={color.name}
                style={[
                  styles.colorButton,
                  { width: BUTTON_WIDTH },
                  currentTrialType === 'color' && { backgroundColor: color.hex }
                ]}
                onPress={() => handleColorPress(color.name)}
                accessibilityRole="button"
                accessibilityLabel={`Select ${color.name.toLowerCase()}`}
                testID={`btn-stroop-color-${color.name.toLowerCase()}`}
              >
                {currentTrialType === 'word' ? (
                  <ThemedText style={styles.colorButtonTextPlain}>
                    {color.name}
                  </ThemedText>
                ) : null}
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.buttonRow}>
            {shuffledColors.slice(2, 4).map((color) => (
              <TouchableOpacity
                key={color.name}
                style={[
                  styles.colorButton,
                  { width: BUTTON_WIDTH },
                  currentTrialType === 'color' && { backgroundColor: color.hex }
                ]}
                onPress={() => handleColorPress(color.name)}
                accessibilityRole="button"
                accessibilityLabel={`Select ${color.name.toLowerCase()}`}
                testID={`btn-stroop-color-${color.name.toLowerCase()}`}
              >
                {currentTrialType === 'word' ? (
                  <ThemedText style={styles.colorButtonTextPlain}>
                    {color.name}
                  </ThemedText>
                ) : null}
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.buttonRow}>
            {shuffledColors.slice(4, 6).map((color) => (
              <TouchableOpacity
                key={color.name}
                style={[
                  styles.colorButton,
                  { width: BUTTON_WIDTH },
                  currentTrialType === 'color' && { backgroundColor: color.hex }
                ]}
                onPress={() => handleColorPress(color.name)}
                accessibilityRole="button"
                accessibilityLabel={`Select ${color.name.toLowerCase()}`}
                testID={`btn-stroop-color-${color.name.toLowerCase()}`}
              >
                {currentTrialType === 'word' ? (
                  <ThemedText style={styles.colorButtonTextPlain}>
                    {color.name}
                  </ThemedText>
                ) : null}
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    marginTop: 20,
    marginBottom: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.03)',
  },
  bannerBackButton: {
    padding: 4,
    marginRight: 12,
  },
  bannerStats: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  bannerStatText: {
    fontSize: 14,
    fontWeight: '600',
  },
  readyContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 60,
    alignItems: 'center',
  },
  readyTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  progressBanner: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 12,
  },
  progressText: {
    fontSize: 14,
    fontWeight: '600',
  },
  studyBanner: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 12,
  },
  studyText: {
    fontSize: 14,
    fontWeight: '600',
  },
  description: {
    fontSize: 14,
    textAlign: 'center',
    opacity: 0.7,
    marginBottom: 20,
    lineHeight: 20,
    paddingHorizontal: 10,
  },
  exampleContainer: {
    alignItems: 'center',
    backgroundColor: 'rgba(128, 128, 128, 0.08)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    width: '100%',
  },
  exampleStimulus: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  exampleRow: {
    flexDirection: 'row',
    gap: 20,
  },
  exampleColumn: {
    alignItems: 'center',
  },
  exampleLabel: {
    fontSize: 11,
    fontWeight: '600',
    opacity: 0.6,
    marginBottom: 8,
  },
  exampleButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  mockButtonWord: {
    width: 44,
    height: 44,
    backgroundColor: '#E0E0E0',
    borderRadius: 6,
    borderWidth: 2,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mockButtonWordSelected: {
    width: 44,
    height: 44,
    backgroundColor: '#E0E0E0',
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#00D4FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mockButtonWordText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#000',
  },
  mockButtonColor: {
    width: 44,
    height: 44,
    borderRadius: 6,
    backgroundColor: '#1E88E5',
  },
  mockButtonColorSelected: {
    width: 44,
    height: 44,
    borderRadius: 6,
    backgroundColor: '#E53935',
    borderWidth: 2,
    borderColor: '#00D4FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pointerIcon: {
  },
  pointerIconCenter: {
  },
  trialInfo: {
    fontSize: 14,
    opacity: 0.5,
    marginBottom: 20,
  },
  startButton: {
    paddingVertical: 14,
    paddingHorizontal: 48,
    borderRadius: 12,
  },
  startButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '600',
  },
  backButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    marginTop: 12,
    alignItems: 'center',
  },
  backButtonText: {
    fontSize: 16,
    opacity: 0.7,
  },
  gameArea: {
    flex: 1,
    paddingHorizontal: 16,
    paddingBottom: 20,
    overflow: 'visible',
  },
  instruction: {
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    opacity: 0.7,
    marginBottom: 8,
  },
  wordContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    minHeight: 120,
    overflow: 'visible',
    zIndex: 10,
  },
  stroopWord: {
    fontSize: 69,
    lineHeight: 110,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  buttonGrid: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  colorButton: {
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E0E0E0',
    borderWidth: 1,
    borderColor: '#BDBDBD',
    height: 48,
  },
  colorButtonTextPlain: {
    color: '#000000',
    fontSize: 18,
    fontWeight: '700',
  },
  finishedContent: {
    flexGrow: 1,
    alignItems: 'center',
    paddingHorizontal: 30,
    paddingTop: 40,
  },
  finishedTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    marginTop: 12,
    marginBottom: 8,
  },
  finalScore: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 24,
    marginBottom: 20,
  },
  metricBox: {
    alignItems: 'center',
  },
  metricValue: {
    fontSize: 20,
    fontWeight: '700',
  },
  metricLabel: {
    fontSize: 12,
    opacity: 0.6,
  },
  breakdownContainer: {
    backgroundColor: 'rgba(128, 128, 128, 0.1)',
    borderRadius: 10,
    padding: 16,
    marginBottom: 24,
    width: '100%',
  },
  breakdownTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 12,
    textAlign: 'center',
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  breakdownLabel: {
    fontSize: 14,
    opacity: 0.8,
  },
  breakdownValue: {
    fontSize: 14,
    fontWeight: '600',
  },
});
