import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, TouchableOpacity, View, Dimensions, Alert, ScrollView } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useThemeColor } from '@/hooks/use-theme-color';
import { saveCognitiveTestResult } from '@/database/cognitive-tests';
import { getRelevantScheduledTest, completeScheduledTest, getTestContext, isUserInActiveTestSession } from '@/database/study-scheduler';
import { validateTestPrerequisites, handleTestSaveError } from '@/utils/test-validation';
import { checkDatabaseHealth } from '@/database/database';
import { useHierarchicalBack } from '@/hooks/use-hierarchical-back';
import { Ionicons } from '@expo/vector-icons';

const { height: screenHeight, width: screenWidth } = Dimensions.get('window');
const SHAPE_SIZE = Math.min(250, screenWidth * 0.6, screenHeight * 0.25);
const TRIAL_COUNT = 20;
const N_LEVELS = [1, 2, 3, 4] as const;
const ADAPTIVE_THRESHOLD = 0.85;
const ADAPTIVE_SESSIONS_REQUIRED = 3;

const SHAPES = [
  { id: 'circle', name: 'Circle', symbol: '●' },
  { id: 'square', name: 'Square', symbol: '■' },
  { id: 'triangle', name: 'Triangle', symbol: '▲' }
];

interface Trial {
  id: number;
  shape: string;
  isMatch: boolean;
  userResponse: boolean | null;
  responseTime: number | null;
}

export default function NBackTestScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const tintColor = useThemeColor({}, 'tint');
  
  useHierarchicalBack('tests/n-back');
  
  const [gameState, setGameState] = useState<'ready' | 'instructions' | 'playing' | 'finished'>('ready');
  const [currentTrial, setCurrentTrial] = useState(0);
  const [currentShape, setCurrentShape] = useState<string | null>(null);
  const [trials, setTrials] = useState<Trial[]>([]);
  const [showingStimulus, setShowingStimulus] = useState(false);
  const [scheduledTest, setScheduledTest] = useState<any>(null);
  const [studyContext, setStudyContext] = useState<any>(null);
  const [activeTestSession, setActiveTestSession] = useState<any>(null);
  const [nLevel, setNLevel] = useState<number>(2);
  const [adaptiveMode, setAdaptiveMode] = useState<boolean>(false);
  const [recentAccuracies, setRecentAccuracies] = useState<number[]>([]);
  
  const trialStartTime = useRef<number>(0);

  const generateTrials = (level: number): Trial[] => {
    const newTrials: Trial[] = [];
    const sequence: string[] = [];
    
    for (let i = 0; i < TRIAL_COUNT; i++) {
      if (i < level) {
        const shapeIndex = Math.floor(Math.random() * SHAPES.length);
        const shape = SHAPES[shapeIndex]?.id || 'circle';
        sequence.push(shape);
        newTrials.push({
          id: i,
          shape,
          isMatch: false,
          userResponse: null,
          responseTime: null
        });
      } else {
        const shouldBeMatch = Math.random() < 0.3;
        
        if (shouldBeMatch) {
          const shape = sequence[i - level];
          sequence.push(shape);
          newTrials.push({
            id: i,
            shape,
            isMatch: true,
            userResponse: null,
            responseTime: null
          });
        } else {
          const excludeShape = sequence[i - level];
          const availableShapes = SHAPES.filter(s => s.id !== excludeShape);
          if (availableShapes.length === 0) {
            const shape = SHAPES[0]?.id || 'circle';
            sequence.push(shape);
          } else {
            const shapeIndex = Math.floor(Math.random() * availableShapes.length);
            const shape = availableShapes[shapeIndex]?.id || 'circle';
            sequence.push(shape);
          }
          newTrials.push({
            id: i,
            shape: sequence[sequence.length - 1],
            isMatch: false,
            userResponse: null,
            responseTime: null
          });
        }
      }
    }
    
    return newTrials;
  };

  const handleResponse = (isMatch: boolean) => {
    if (currentTrial >= trials.length) return;
    
    const responseTime = Date.now() - trialStartTime.current;
    const updatedTrials = [...trials];
    updatedTrials[currentTrial] = {
      ...updatedTrials[currentTrial],
      userResponse: isMatch,
      responseTime
    };
    setTrials(updatedTrials);
    
    // Move to next trial immediately after button press
    const nextTrialIndex = currentTrial + 1;
    
    if (nextTrialIndex >= TRIAL_COUNT) {
      endGame();
      return;
    }
    
    // Show next shape immediately
    setCurrentTrial(nextTrialIndex);
    setCurrentShape(trials[nextTrialIndex].shape);
    setShowingStimulus(true);
    trialStartTime.current = Date.now();
  };

  // Removed nextTrial function - no longer needed with user-controlled pacing

  const startInstructions = () => {
    setGameState('instructions');
    
    // Show instructions for 1 second then start immediately
    setTimeout(() => {
      startGameNow();
    }, 1000);
  };

  const startGame = async () => {
    console.log('🔄 N-BACK TEST: Starting game with pre-validation...');
    
    // Pre-test validation: Check database accessibility
    const canProceed = await validateTestPrerequisites('N-Back');
    if (!canProceed) {
      console.log('❌ N-BACK TEST: Pre-validation failed, aborting test start');
      return;
    }
    
    try {
      const activeSession = await isUserInActiveTestSession();
      if (activeSession.isActive && String(activeSession.activeTest?.test_type) !== 'n_back') {
        Alert.alert(
          'Test Session Active',
          `You have an active ${activeSession.activeTest?.test_type} test (${Math.ceil(activeSession.timeRemaining || 0)}s remaining). Starting another test may affect your results.\n\nContinue anyway?`,
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Continue', onPress: () => startInstructions() }
          ]
        );
        return;
      }
    } catch (error) {
      console.error('Failed to check active session:', error);
    }
    
    console.log('✅ N-BACK TEST: Pre-validation passed, starting instructions');
    startInstructions();
  };

  const startGameNow = () => {
    const newTrials = generateTrials(nLevel);
    
    setGameState('playing');
    setTrials(newTrials);
    setCurrentTrial(0);
    setCurrentShape(newTrials[0].shape);
    setShowingStimulus(true);
    trialStartTime.current = Date.now();
  };

  const endGame = async () => {
    setGameState('finished');
    
    // Calculate metrics
    const completedTrials = trials.filter(t => t.userResponse !== null);
    const matches = trials.filter(t => t.isMatch);
    const hits = trials.filter(t => t.isMatch && t.userResponse === true);
    const misses = trials.filter(t => t.isMatch && t.userResponse === false);
    const falseAlarms = trials.filter(t => !t.isMatch && t.userResponse === true);
    const correctRejections = trials.filter(t => !t.isMatch && t.userResponse === false);
    
    const accuracyDecimal = (hits.length + correctRejections.length) / TRIAL_COUNT;
    const accuracy = accuracyDecimal * 100;
    const hitRate = matches.length > 0 ? hits.length / matches.length : 0;
    const falseAlarmRate = (TRIAL_COUNT - matches.length) > 0 ? falseAlarms.length / (TRIAL_COUNT - matches.length) : 0;
    
    // Calculate d-prime (signal detection theory metric)
    const hitRateAdjusted = Math.max(0.01, Math.min(0.99, hitRate));
    const falseAlarmRateAdjusted = Math.max(0.01, Math.min(0.99, falseAlarmRate));
    const dPrime = normalInverse(hitRateAdjusted) - normalInverse(falseAlarmRateAdjusted);
    
    const averageResponseTime = completedTrials.length > 0 
      ? completedTrials.reduce((sum, t) => sum + (t.responseTime || 0), 0) / completedTrials.length 
      : 0;
    
    const hitResponseTimes = hits.filter(h => h.responseTime !== null);
    const averageHitResponseTime = hitResponseTimes.length > 0
      ? hitResponseTimes.reduce((sum, h) => sum + h.responseTime!, 0) / hitResponseTimes.length
      : 0;
    
    const speed = averageHitResponseTime;
    
    const difficultyAdjustedScore = accuracyDecimal * (1 + 0.2 * (nLevel - 1));
    
    const rawData = {
      accuracy: accuracyDecimal,
      hits: hits.length,
      misses: misses.length,
      falseAlarms: falseAlarms.length,
      correctRejections: correctRejections.length,
      averageResponseTime,
      averageHitResponseTime,
      dPrime,
      trials: trials,
      speed,
      nLevel,
      difficultyAdjustedScore
    };
    
    const saveTestResult = async () => {
      try {
        console.log('🔄 N-BACK TEST: Saving test result...');
        const studyId = scheduledTest ? studyContext?.study_protocol_id : undefined;
        const supplementLogId = scheduledTest ? studyContext?.supplement_log_id : undefined;
        
        const score = Math.round(accuracy);
        await saveCognitiveTestResult('n_back', score, rawData, undefined, studyId, supplementLogId, accuracy, speed, nLevel);
        
        if (scheduledTest) {
          await completeScheduledTest(scheduledTest.id);
        }
        
        if (adaptiveMode) {
          const newAccuracies = [...recentAccuracies, accuracyDecimal].slice(-ADAPTIVE_SESSIONS_REQUIRED);
          setRecentAccuracies(newAccuracies);
          
          if (newAccuracies.length >= ADAPTIVE_SESSIONS_REQUIRED) {
            const allAboveThreshold = newAccuracies.every(acc => acc >= ADAPTIVE_THRESHOLD);
            if (allAboveThreshold && nLevel < 4) {
              setNLevel(nLevel + 1);
              setRecentAccuracies([]);
            }
          }
        }
        
        console.log('✅ N-BACK TEST: Test result saved successfully');
      } catch (error) {
        console.log('❌ N-BACK TEST: Failed to save test result:', error);
        
        // Show error alert with retry option
        handleTestSaveError(
          'N-Back',
          error,
          saveTestResult, // Retry function
          () => router.push('/cognitive-tests') // Return to menu function
        );
      }
    };
    
    await saveTestResult();
  };

  // Approximation of the inverse normal distribution for d-prime calculation
  const normalInverse = (p: number): number => {
    const a1 = -3.969683028665376e+01;
    const a2 = 2.209460984245205e+02;
    const a3 = -2.759285104469687e+02;
    const a4 = 1.383577518672690e+02;
    const a5 = -3.066479806614716e+01;
    const a6 = 2.506628277459239e+00;
    
    const b1 = -5.447609879822406e+01;
    const b2 = 1.615858368580409e+02;
    const b3 = -1.556989798598866e+02;
    const b4 = 6.680131188771972e+01;
    const b5 = -1.328068155288572e+01;
    
    if (p <= 0 || p >= 1) return 0;
    
    const q = p - 0.5;
    if (Math.abs(q) <= 0.425) {
      const r = 0.180625 - q * q;
      return q * (((((a1 * r + a2) * r + a3) * r + a4) * r + a5) * r + a6) /
                 (((((b1 * r + b2) * r + b3) * r + b4) * r + b5) * r + 1);
    }
    
    const r = q < 0 ? p : 1 - p;
    const t = Math.sqrt(-Math.log(r));
    const result = (q < 0 ? -1 : 1) * (t - ((2.515517 + 0.802853 * t + 0.010328 * t * t) /
                   (1 + 1.432788 * t + 0.189269 * t * t + 0.001308 * t * t * t)));
    
    return result;
  };

  const handleBackToMenu = () => {
    if (params.sequence === 'all-nine') {
      router.push('/tests/all-nine');
    } else {
      router.push('/cognitive-tests');
    }
  };

  const handleFinishBattery = () => {
    router.push('/tests/stroop?sequence=all-nine');
  };

  const handlePlayAgain = () => {
    startGame();
  };

  useEffect(() => {
    const checkTestStatus = async () => {
      try {
        const activeSession = await isUserInActiveTestSession();
        if (activeSession.isActive && String(activeSession.activeTest?.test_type) !== 'n_back') {
          setActiveTestSession(activeSession);
        }
        
        const relevantTest = await getRelevantScheduledTest('n_back');
        if (relevantTest) {
          setScheduledTest(relevantTest);
          const context = await getTestContext(relevantTest.id);
          setStudyContext(context);
        }
      } catch (error) {
        console.error('Failed to check for scheduled test:', error);
      }
    };
    
    checkTestStatus();
  }, []);

  // Navigation event logging
  useFocusEffect(
    React.useCallback(() => {
      console.log('📱 NAVIGATED TO: N-Back Test');
      console.log('DB status on navigation:', checkDatabaseHealth());
      return () => {
        console.log('📱 NAVIGATING AWAY FROM: N-Back Test');
      };
    }, [])
  );

  if (gameState === 'ready') {
    return (
      <ThemedView style={styles.container} safeArea>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <ThemedView style={styles.instructionsContainer}>
            {params.sequence === 'all-nine' && (
              <ThemedView style={[styles.progressBanner, { backgroundColor: tintColor + '15', borderColor: tintColor }]}>
                <ThemedText style={[styles.progressText, { color: tintColor }]}>
                  Test 8 of 9
                </ThemedText>
              </ThemedView>
            )}
            <ThemedText type="title" style={styles.title}>N-Back Test</ThemedText>
            {scheduledTest && studyContext?.supplement_name && (
              <ThemedView style={[styles.studyBanner, { backgroundColor: tintColor + '20', borderColor: tintColor }]}>
                <ThemedText style={[styles.studyText, { color: tintColor }]}>
                  📊 Study Test for {studyContext.supplement_name}
                </ThemedText>
              </ThemedView>
            )}
            {activeTestSession && (
              <ThemedView style={[styles.warningBanner, { backgroundColor: '#FF3B30' + '20', borderColor: '#FF3B30' }]}>
                <ThemedText style={[styles.warningText, { color: '#FF3B30' }]}>
                  ⚠️ Active {activeTestSession.activeTest?.test_type} test ({Math.ceil(activeTestSession.timeRemaining || 0)}s remaining)
                </ThemedText>
              </ThemedView>
            )}
            <ThemedText style={styles.instructions}>
              Working memory test - scientifically validated!{'\n\n'}
              • You&apos;ll see a sequence of shapes{'\n'}
              • Tap a button to advance to the next shape{'\n'}
              • Tap &quot;MATCH&quot; if current shape matches the one from {nLevel} step{nLevel > 1 ? 's' : ''} back{'\n'}
              • Tap &quot;NO MATCH&quot; if it doesn&apos;t match{'\n'}
              • 20 trials total{'\n'}
              • Focus and respond quickly!
            </ThemedText>
            
            <ThemedView style={styles.levelSelector}>
              <ThemedText style={styles.levelLabel}>Difficulty Level:</ThemedText>
              <View style={styles.levelButtons}>
                {N_LEVELS.map((level) => (
                  <TouchableOpacity
                    key={level}
                    style={[
                      styles.levelButton,
                      nLevel === level && { backgroundColor: tintColor },
                      nLevel !== level && { borderColor: tintColor, borderWidth: 1 }
                    ]}
                    onPress={() => setNLevel(level)}
                    accessibilityRole="button"
                    accessibilityLabel={`${level}-back difficulty level`}
                    testID={`btn-nback-level-${level}`}
                  >
                    <ThemedText style={[
                      styles.levelButtonText,
                      nLevel === level && { color: 'white' }
                    ]}>
                      {level}-back
                    </ThemedText>
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity
                style={[
                  styles.adaptiveToggle,
                  adaptiveMode && { backgroundColor: tintColor + '20', borderColor: tintColor }
                ]}
                onPress={() => setAdaptiveMode(!adaptiveMode)}
                accessibilityRole="button"
                accessibilityLabel={`Adaptive mode ${adaptiveMode ? 'enabled' : 'disabled'}`}
                testID="btn-nback-adaptive"
              >
                <Ionicons 
                  name={adaptiveMode ? 'checkbox' : 'square-outline'} 
                  size={20} 
                  color={adaptiveMode ? tintColor : '#8E8E93'} 
                />
                <ThemedText style={styles.adaptiveText}>
                  Adaptive mode (auto-increase on 85%+ accuracy)
                </ThemedText>
              </TouchableOpacity>
            </ThemedView>
            <TouchableOpacity
              style={[styles.startButton, { backgroundColor: tintColor }]}
              onPress={startGame}
              accessibilityRole="button"
              accessibilityLabel="Start n-back test"
              testID="btn-nback-start"
            >
              <ThemedText style={styles.startButtonText}>Start Test</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity style={styles.backButton} onPress={handleBackToMenu} accessibilityRole="button" accessibilityLabel="Back to menu" testID="btn-nback-back">
              <ThemedText style={styles.backButtonText}>Back to Menu</ThemedText>
            </TouchableOpacity>
          </ThemedView>
        </ScrollView>
      </ThemedView>
    );
  }

  if (gameState === 'instructions') {
    return (
      <ThemedView style={styles.container} safeArea>
        <ThemedView style={styles.countdownContainer}>
          <ThemedText style={styles.reminderText}>
            Remember: Match if current shape = shape from {nLevel} step{nLevel > 1 ? 's' : ''} back
          </ThemedText>
        </ThemedView>
      </ThemedView>
    );
  }

  if (gameState === 'finished') {
    const completedTrials = trials.filter(t => t.userResponse !== null);
    const matches = trials.filter(t => t.isMatch);
    const hits = trials.filter(t => t.isMatch && t.userResponse === true);
    const misses = trials.filter(t => t.isMatch && t.userResponse === false);
    const falseAlarms = trials.filter(t => !t.isMatch && t.userResponse === true);
    const correctRejections = trials.filter(t => !t.isMatch && t.userResponse === false);
    
    const accuracy = (hits.length + correctRejections.length) / TRIAL_COUNT;
    const adjustedScore = accuracy * (1 + 0.2 * (nLevel - 1));
    
    const averageResponseTime = completedTrials.length > 0 
      ? completedTrials.reduce((sum, t) => sum + (t.responseTime || 0), 0) / completedTrials.length 
      : 0;
    
    const hitResponseTimes = hits.filter(h => h.responseTime !== null);
    const averageHitResponseTime = hitResponseTimes.length > 0
      ? hitResponseTimes.reduce((sum, h) => sum + h.responseTime!, 0) / hitResponseTimes.length
      : 0;
    
    return (
      <ThemedView style={styles.container} safeArea>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <ThemedView style={styles.resultsContainer}>
            <ThemedText type="title" style={styles.title}>{nLevel}-Back Complete!</ThemedText>
            <ThemedText style={styles.metricText}>Accuracy: {(accuracy * 100).toFixed(1)}%</ThemedText>
            <ThemedText style={styles.metricText}>Adjusted Score: {(adjustedScore * 100).toFixed(1)}%</ThemedText>
            <ThemedText style={styles.metricText}>Speed: {averageHitResponseTime.toFixed(0)}ms</ThemedText>
            <ThemedText style={styles.metricText}>Hits: {hits.length}/{matches.length}</ThemedText>
            <ThemedText style={styles.metricText}>Misses: {misses.length}</ThemedText>
            <ThemedText style={styles.metricText}>False Alarms: {falseAlarms.length}</ThemedText>
            <ThemedText style={styles.metricText}>Correct Rejections: {correctRejections.length}</ThemedText>
            <ThemedText style={styles.metricText}>Avg Response Time: {averageResponseTime.toFixed(0)}ms</ThemedText>
            {adaptiveMode && accuracy >= ADAPTIVE_THRESHOLD && nLevel < 4 && (
              <ThemedText style={[styles.metricText, { color: '#34C759', fontWeight: '600' }]}>
                Great job! {ADAPTIVE_SESSIONS_REQUIRED - recentAccuracies.length - 1} more sessions at 85%+ to level up!
              </ThemedText>
            )}
            <ThemedText style={styles.resultMessage}>
              {accuracy >= 0.8 ? 'Excellent working memory!' : 
               accuracy >= 0.65 ? 'Good cognitive performance!' : 
               accuracy >= 0.5 ? 'Fair performance!' : 'Keep practicing!'}
            </ThemedText>
            {params.sequence === 'all-nine' ? (
              <>
                <TouchableOpacity
                  style={[styles.startButton, { backgroundColor: tintColor }]}
                  onPress={handleFinishBattery}
                  accessibilityRole="button"
                  accessibilityLabel="Continue to Stroop test"
                  testID="btn-nback-next"
                >
                  <ThemedText style={styles.startButtonText}>Continue to Stroop</ThemedText>
                </TouchableOpacity>
                <TouchableOpacity style={styles.backButton} onPress={handleBackToMenu} accessibilityRole="button" accessibilityLabel="Exit test battery" testID="btn-nback-exit-battery">
                  <ThemedText style={styles.backButtonText}>Exit Test Battery</ThemedText>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <TouchableOpacity
                  style={[styles.startButton, { backgroundColor: tintColor }]}
                  onPress={handlePlayAgain}
                  accessibilityRole="button"
                  accessibilityLabel="Play again"
                  testID="btn-nback-play-again"
                >
                  <ThemedText style={styles.startButtonText}>Play Again</ThemedText>
                </TouchableOpacity>
                <TouchableOpacity style={styles.backButton} onPress={handleBackToMenu} accessibilityRole="button" accessibilityLabel="Back to menu" testID="btn-nback-back-menu">
                  <ThemedText style={styles.backButtonText}>Back to Menu</ThemedText>
                </TouchableOpacity>
              </>
            )}
          </ThemedView>
        </ScrollView>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container} safeArea>
      <ThemedView style={[styles.infoBanner, { borderColor: tintColor }]}>
        <TouchableOpacity
          style={styles.bannerBackButton}
          onPress={handleBackToMenu}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel="Back to menu"
          testID="btn-nback-back-playing"
        >
          <Ionicons name="arrow-back" size={20} color={tintColor} />
        </TouchableOpacity>
        <View style={styles.bannerStats}>
          <ThemedText style={styles.bannerStatText}>Trial: {currentTrial + 1}/20</ThemedText>
          <ThemedText style={styles.bannerStatText}>{nLevel}-Back Test</ThemedText>
        </View>
      </ThemedView>

      <View style={styles.stimulusArea}>
        {showingStimulus && currentShape && (
          <View style={styles.shapeContainer}>
            <ThemedText style={[styles.shape, { color: tintColor }]}>
              {SHAPES.find(s => s.id === currentShape)?.symbol || '?'}
            </ThemedText>
          </View>
        )}
      </View>

      <ThemedView style={styles.responseArea}>
        <TouchableOpacity
          style={[styles.responseButton, styles.noMatchButton, { borderColor: '#FF3B30' }]}
          onPress={() => handleResponse(false)}
          accessibilityRole="button"
          accessibilityLabel="No match"
          testID="btn-nback-no-match"
        >
          <ThemedText style={[styles.responseButtonText, { color: '#FF3B30' }]}>NO MATCH</ThemedText>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.responseButton, styles.matchButton, { borderColor: '#34C759' }]}
          onPress={() => handleResponse(true)}
          accessibilityRole="button"
          accessibilityLabel="Match"
          testID="btn-nback-match"
        >
          <ThemedText style={[styles.responseButtonText, { color: '#34C759' }]}>MATCH</ThemedText>
        </TouchableOpacity>
      </ThemedView>

      <TouchableOpacity style={styles.backButton} onPress={handleBackToMenu} accessibilityRole="button" accessibilityLabel="Back to menu" testID="btn-nback-back-playing-bottom">
        <ThemedText style={styles.backButtonText}>Back to Menu</ThemedText>
      </TouchableOpacity>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    padding: 20,
    paddingTop: 40,
    paddingBottom: 60,
    minHeight: screenHeight,
  },
  instructionsContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  resultsContainer: {
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 80,
    paddingBottom: 60,
    paddingHorizontal: 20,
  },
  countdownContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  title: {
    fontSize: 26,
    fontWeight: 'bold',
    marginBottom: 30,
    marginTop: 20,
    textAlign: 'center',
    lineHeight: 32,
  },
  instructions: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 40,
    lineHeight: 24,
  },
  startButton: {
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    marginBottom: 20,
  },
  startButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '600',
  },
  backButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  backButtonText: {
    fontSize: 16,
    opacity: 0.7,
  },
  countdownText: {
    fontSize: 72,
    fontWeight: 'bold',
    marginVertical: 30,
  },
  reminderText: {
    fontSize: 16,
    textAlign: 'center',
    opacity: 0.8,
    lineHeight: 24,
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
    justifyContent: 'space-around',
  },
  bannerStatText: {
    fontSize: 14,
    fontWeight: '600',
  },
  trialText: {
    fontSize: 18,
    fontWeight: '600',
  },
  instructionText: {
    fontSize: 18,
    fontWeight: '600',
  },
  stimulusArea: {
    flex: 2,
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 20,
    minHeight: 350,
    paddingHorizontal: 20,
  },
  shapeContainer: {
    width: SHAPE_SIZE,
    height: SHAPE_SIZE,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.05)',
    borderRadius: 16,
    borderWidth: 3,
    borderColor: 'rgba(0,0,0,0.15)',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  shape: {
    fontSize: Math.min(140, SHAPE_SIZE * 0.55),
    textAlign: 'center',
    lineHeight: Math.min(140, SHAPE_SIZE * 0.55),
  },
  responseArea: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 20,
    marginBottom: 40,
  },
  responseButton: {
    paddingVertical: 20,
    paddingHorizontal: 30,
    borderRadius: 12,
    borderWidth: 2,
    minWidth: 120,
    alignItems: 'center',
  },
  matchButton: {
    backgroundColor: 'transparent',
  },
  noMatchButton: {
    backgroundColor: 'transparent',
  },
  responseButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  finalScore: {
    fontSize: 26,
    fontWeight: 'bold',
    marginBottom: 20,
    marginTop: 20,
    textAlign: 'center',
    lineHeight: 32,
  },
  metricText: {
    fontSize: 16,
    marginBottom: 8,
    textAlign: 'center',
  },
  resultMessage: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 30,
    marginTop: 20,
    opacity: 0.8,
    lineHeight: 24,
  },
  studyBanner: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 20,
    alignItems: 'center',
  },
  studyText: {
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  warningBanner: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 20,
    alignItems: 'center',
  },
  warningText: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  progressBanner: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 15,
    alignItems: 'center',
  },
  progressText: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  levelSelector: {
    marginBottom: 30,
    alignItems: 'center',
    width: '100%',
  },
  levelLabel: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  levelButtons: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  levelButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    minWidth: 70,
    alignItems: 'center',
  },
  levelButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  adaptiveToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#8E8E93',
  },
  adaptiveText: {
    fontSize: 13,
    opacity: 0.8,
  },
});