import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, TouchableOpacity, View, Dimensions, Alert, ScrollView, Animated } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useThemeColor } from '@/hooks/use-theme-color';
import { saveCognitiveTestResult } from '@/database/cognitive-tests';
import { getRelevantScheduledTest, completeScheduledTest, getTestContext, isUserInActiveTestSession } from '@/database/study-scheduler';
import { validateTestPrerequisites, handleTestSaveError } from '@/utils/test-validation';
import { checkDatabaseHealth } from '@/database/database';
import { Ionicons } from '@expo/vector-icons';
import { useHierarchicalBack } from '@/hooks/use-hierarchical-back';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
const BUBBLE_SIZE = 40; // ~1cm on most devices
const TEST_DURATION = 10000; // 10 seconds

interface BubblePosition {
  x: number;
  y: number;
}

export default function ReflexesTestScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const tintColor = useThemeColor({}, 'tint');
  const insets = useSafeAreaInsets();
  
  useHierarchicalBack('tests/reflexes');
  const [gameAreaSize, setGameAreaSize] = useState({ width: 0, height: 0 });
  const [gameState, setGameState] = useState<'ready' | 'playing' | 'finished'>('ready');
  const [inputsDisabled, setInputsDisabled] = useState(false);
  const [score, setScore] = useState(0);
  const [hits, setHits] = useState(0);
  const [misses, setMisses] = useState(0);
  const [timeLeft, setTimeLeft] = useState(TEST_DURATION / 1000);
  const [bubblePosition, setBubblePosition] = useState<BubblePosition>({ x: 0, y: 0 });
  const [scheduledTest, setScheduledTest] = useState<any>(null);
  const [studyContext, setStudyContext] = useState<any>(null);
  const [activeTestSession, setActiveTestSession] = useState<any>(null);
  const [combo, setCombo] = useState(0);
  const [maxCombo, setMaxCombo] = useState(0);
  const [showHitEffect, setShowHitEffect] = useState(false);
  const [hitEffectPosition, setHitEffectPosition] = useState<BubblePosition>({ x: 0, y: 0 });
  
  // Animation values
  const bubbleScale = useRef(new Animated.Value(1)).current;
  const scoreScale = useRef(new Animated.Value(1)).current;
  const comboScale = useRef(new Animated.Value(1)).current;
  const hitEffectOpacity = useRef(new Animated.Value(0)).current;
  const hitEffectScale = useRef(new Animated.Value(0.5)).current;
  
  const gameTimer = useRef<number | null>(null);
  const countdownTimer = useRef<number | null>(null);
  const justTappedBubble = useRef<boolean>(false);
  const hitsRef = useRef(0);
  const missesRef = useRef(0);
  const gameEndedRef = useRef(false);

const generateRandomPosition = (): BubblePosition => {
  // If we don't know the layout yet, just center the bubble as a fallback
  if (!gameAreaSize.width || !gameAreaSize.height) {
    return {
      x: screenWidth / 2,
      y: screenHeight / 2,
    };
  }

  // Margins *within the game area* (not the whole screen)
  const SIDE_MARGIN = 40;
  const TOP_MARGIN = 20;
  const BOTTOM_MARGIN = insets.bottom + 32; // keep clear of gesture/nav area

  const minX = SIDE_MARGIN + BUBBLE_SIZE / 2;
  const maxX = gameAreaSize.width - SIDE_MARGIN - BUBBLE_SIZE / 2;

  const minY = TOP_MARGIN + BUBBLE_SIZE / 2;
  const maxY = gameAreaSize.height - BOTTOM_MARGIN - BUBBLE_SIZE / 2;

  // If layout is too tight for our margins, fall back to center
  if (minX >= maxX || minY >= maxY) {
    return {
      x: gameAreaSize.width / 2,
      y: gameAreaSize.height / 2,
    };
  }

  return {
    x: Math.random() * (maxX - minX) + minX,
    y: Math.random() * (maxY - minY) + minY,
  };
};



  const startGame = async () => {
    console.log('🔄 REFLEXES TEST: Starting game with pre-validation...');
    
    // Pre-test validation: Check database accessibility
    const canProceed = await validateTestPrerequisites('Reflexes');
    if (!canProceed) {
      console.log('❌ REFLEXES TEST: Pre-validation failed, aborting test start');
      return;
    }
    
    // Check for active test sessions before starting
    try {
      const activeSession = await isUserInActiveTestSession();
      if (activeSession.isActive && activeSession.activeTest?.test_type !== 'reflexes') {
        Alert.alert(
          'Test Session Active',
          `You have an active ${activeSession.activeTest?.test_type} test (${Math.ceil(activeSession.timeRemaining || 0)}s remaining). Starting another test may affect your results.\n\nContinue anyway?`,
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Continue', onPress: () => startGameNow() }
          ]
        );
        return;
      }
    } catch (error) {
      console.error('Failed to check active session:', error);
    }
    
    console.log('✅ REFLEXES TEST: Pre-validation passed, starting game');
    startGameNow();
  };

  const startGameNow = () => {
    hitsRef.current = 0;
    missesRef.current = 0;
    gameEndedRef.current = false;
    setScore(0);
    setHits(0);
    setMisses(0);
    setCombo(0);
    setMaxCombo(0);
    setTimeLeft(TEST_DURATION / 1000);
    setGameState('playing');
    setBubblePosition(generateRandomPosition());
    
    // Reset animation values
    bubbleScale.setValue(1);
    scoreScale.setValue(1);
    comboScale.setValue(1);
    hitEffectOpacity.setValue(0);
    setShowHitEffect(false);
    setHitEffectPosition({ x: 0, y: 0 });
    
    // Start countdown timer
    countdownTimer.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          endGame();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    // End game after duration
    gameTimer.current = setTimeout(() => {
      endGame();
    }, TEST_DURATION);
  };

  const endGame = async () => {
    if (gameEndedRef.current) {
      return;
    }
    gameEndedRef.current = true;
    
    if (gameTimer.current) {
      clearTimeout(gameTimer.current);
      gameTimer.current = null;
    }
    if (countdownTimer.current) {
      clearInterval(countdownTimer.current);
      countdownTimer.current = null;
    }
    
    const finalHits = hitsRef.current;
    const finalMisses = missesRef.current;
    
    console.log('🎮 REFLEXES endGame called:', { finalHits, finalMisses, hitsRef: hitsRef.current, missesRef: missesRef.current });
    const accuracyDecimal = (finalHits + finalMisses) > 0 ? finalHits / (finalHits + finalMisses) : 1;
    const accuracyPercent = accuracyDecimal * 100;
    const finalScore = Math.round(6 * (finalHits - finalMisses) * accuracyDecimal);
    
    setHits(finalHits);
    setMisses(finalMisses);
    setScore(finalScore);
    
    const saveTestResult = async () => {
      try {
        console.log('🔄 REFLEXES TEST: Saving test result...', { finalHits, finalMisses, finalScore });
        const studyId = scheduledTest ? studyContext?.study_protocol_id : undefined;
        const supplementLogId = scheduledTest ? studyContext?.supplement_log_id : undefined;
        
        const rawData = {
          finalScore: finalScore,
          testDuration: TEST_DURATION / 1000,
          bubblesHit: finalHits,
          misses: finalMisses,
          totalTaps: finalHits + finalMisses,
          accuracy: accuracyPercent
        };
        await saveCognitiveTestResult('reflexes', finalScore, rawData, TEST_DURATION / 1000, studyId, supplementLogId, accuracyPercent);
        
        if (scheduledTest) {
          await completeScheduledTest(scheduledTest.id);
        }
        
        console.log('✅ REFLEXES TEST: Test result saved successfully');
      } catch (error) {
        console.log('❌ REFLEXES TEST: Failed to save test result:', error);
        
        handleTestSaveError(
          'Reflexes',
          error,
          saveTestResult,
          handleBackToMenu
        );
      }
    };
    
    await saveTestResult();
    
    setGameState('finished');
    setInputsDisabled(true);
    setTimeout(() => setInputsDisabled(false), 1000);
  };

  const handleBubbleTap = (e: any) => {
    e.stopPropagation();
    if (gameState === 'playing') {
      justTappedBubble.current = true;
      setTimeout(() => { justTappedBubble.current = false; }, 50);
      
      // Capture tap coordinates for hit effect
      const tapX = e.nativeEvent.locationX + bubblePosition.x - BUBBLE_SIZE / 2;
      const tapY = e.nativeEvent.locationY + bubblePosition.y - BUBBLE_SIZE / 2;
      setHitEffectPosition({ x: tapX, y: tapY });
      
      // Update counts
      hitsRef.current += 1;
      setHits(hitsRef.current);
      setScore(hitsRef.current - missesRef.current);
      
      // Update combo
      const newCombo = combo + 1;
      setCombo(newCombo);
      if (newCombo > maxCombo) {
        setMaxCombo(newCombo);
      }
      
      // Haptic feedback
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      
      // Visual feedback animations
      playBubbleHitAnimation();
      playScoreAnimation();
      playComboAnimation(newCombo);
      playHitEffect();
      
      setBubblePosition(generateRandomPosition());
    }
  };

  const handleScreenTap = () => {
    if (gameState === 'playing' && !justTappedBubble.current) {
      missesRef.current += 1;
      setMisses(missesRef.current);
      setScore(hitsRef.current - missesRef.current);
      
      // Reset combo on miss
      setCombo(0);
      
      // Haptic feedback for miss
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      
      // Visual feedback for miss
      playMissAnimation();
    }
  };

  // Animation functions
  const playBubbleHitAnimation = () => {
    bubbleScale.setValue(1.2);
    Animated.spring(bubbleScale, {
      toValue: 1,
      useNativeDriver: true,
      tension: 300,
      friction: 6
    }).start();
  };

  const playScoreAnimation = () => {
    scoreScale.setValue(1.2);
    Animated.spring(scoreScale, {
      toValue: 1,
      useNativeDriver: true,
      tension: 200,
      friction: 5
    }).start();
  };

  const playComboAnimation = (comboCount: number) => {
    if (comboCount >= 3) {
      comboScale.setValue(1.4);
      Animated.spring(comboScale, {
        toValue: 1,
        useNativeDriver: true,
        tension: 150,
        friction: 4
      }).start();
    }
  };

  const playHitEffect = () => {
    setShowHitEffect(true);
    hitEffectOpacity.setValue(0.8);
    hitEffectScale.setValue(0.5);
    
    Animated.parallel([
      Animated.timing(hitEffectOpacity, {
        toValue: 0,
        duration: 500,
        useNativeDriver: true,
      }),
      Animated.timing(hitEffectScale, {
        toValue: 2,
        duration: 500,
        useNativeDriver: true,
      })
    ]).start(() => {
      setShowHitEffect(false);
    });
  };

  const playMissAnimation = () => {
    // Subtle shake effect for the screen
    Animated.sequence([
      Animated.timing(scoreScale, { toValue: 0.95, duration: 100, useNativeDriver: true }),
      Animated.timing(scoreScale, { toValue: 1.05, duration: 100, useNativeDriver: true }),
      Animated.timing(scoreScale, { toValue: 1, duration: 100, useNativeDriver: true }),
    ]).start();
  };

  const handleBackToMenu = () => {
    router.push('/cognitive-tests');
  };

  const handleExitTest = () => {
    if (gameState === 'playing') {
      Alert.alert(
        'Exit Test?',
        'Your progress will not be saved. Are you sure you want to exit?',
        [
          {
            text: 'No',
            style: 'cancel',
          },
          {
            text: 'Yes',
            style: 'destructive',
            onPress: () => {
              // Clean up timers
              if (gameTimer.current) {
                clearTimeout(gameTimer.current);
              }
              if (countdownTimer.current) {
                clearInterval(countdownTimer.current);
              }
              
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
    if (params.sequence === 'all-nine') {
      router.push('/tests/memory?sequence=all-nine');
    } else {
      router.push('/cognitive-tests');
    }
  };

  useEffect(() => {
    // Check for relevant scheduled test and active sessions on component mount
    const checkTestStatus = async () => {
      try {
        // Check for active test session that might overlap
        const activeSession = await isUserInActiveTestSession();
        if (activeSession.isActive && activeSession.activeTest?.test_type !== 'reflexes') {
          setActiveTestSession(activeSession);
        }
        
        // Check for relevant scheduled test
        const relevantTest = await getRelevantScheduledTest('reflexes');
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
    
    return () => {
      if (gameTimer.current) {
        clearTimeout(gameTimer.current);
      }
      if (countdownTimer.current) {
        clearInterval(countdownTimer.current);
      }
    };
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      console.log('📱 NAVIGATED TO: Reflexes Test');
      console.log('DB status on navigation:', checkDatabaseHealth());
      
      hitsRef.current = 0;
      missesRef.current = 0;
      gameEndedRef.current = false;
      setHits(0);
      setMisses(0);
      setScore(0);
      setCombo(0);
      setMaxCombo(0);
      setGameState('ready');
      setTimeLeft(TEST_DURATION / 1000);
      
      // Reset animations
      bubbleScale.setValue(1);
      scoreScale.setValue(1);
      comboScale.setValue(1);
      hitEffectOpacity.setValue(0);
      setShowHitEffect(false);
      setHitEffectPosition({ x: 0, y: 0 });
      
      return () => {
        console.log('📱 NAVIGATING AWAY FROM: Reflexes Test');
        if (gameTimer.current) {
          clearTimeout(gameTimer.current);
          gameTimer.current = null;
        }
        if (countdownTimer.current) {
          clearInterval(countdownTimer.current);
          countdownTimer.current = null;
        }
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
                Test 2 of 9
              </ThemedText>
            </ThemedView>
          )}
          <ThemedText type="title" style={styles.title}>Reflexes Test</ThemedText>
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
            Tap the dots as quickly as possible for 10 seconds!
          </ThemedText>
          <TouchableOpacity
            style={[styles.startButton, { backgroundColor: tintColor }]}
            onPress={startGame}
            accessibilityRole="button"
            accessibilityLabel="Start reflexes test"
            testID="btn-reflexes-start"
          >
            <ThemedText style={styles.startButtonText}>Start Test</ThemedText>
          </TouchableOpacity>
          <TouchableOpacity style={styles.backButton} onPress={handleBackToMenu} accessibilityRole="button" accessibilityLabel="Back to menu" testID="btn-reflexes-back">
            <ThemedText style={styles.backButtonText}>Back to Menu</ThemedText>
          </TouchableOpacity>
        </ThemedView>
        </ScrollView>
      </ThemedView>
    );
  }

  if (gameState === 'finished') {
    return (
      <ThemedView style={styles.container} safeArea>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <ThemedView style={styles.resultsContainer}>
          <ThemedText type="title" style={styles.title}>
            {score >= 80 ? '🎯 Excellent!' : score >= 50 ? '✅ Well Done!' : score >= 25 ? '👍 Good Try!' : '💪 Keep Going!'}
          </ThemedText>
          <ThemedText style={styles.finalScore}>Score: {score}</ThemedText>
          <View style={styles.metricsGrid}>
            <View style={styles.metricCard}>
              <ThemedText style={styles.metricNumber}>{((hits + misses) > 0 ? ((hits / (hits + misses)) * 100) : 100).toFixed(0)}%</ThemedText>
              <ThemedText style={styles.metricLabel}>Accuracy</ThemedText>
            </View>
            <View style={styles.metricCard}>
              <ThemedText style={styles.metricNumber}>{hits}</ThemedText>
              <ThemedText style={styles.metricLabel}>Hits</ThemedText>
            </View>
            <View style={styles.metricCard}>
              <ThemedText style={styles.metricNumber}>{maxCombo}</ThemedText>
              <ThemedText style={styles.metricLabel}>Best Combo</ThemedText>
            </View>
          </View>
          <ThemedText style={styles.resultMessage}>
            {score >= 80 ? 'Excellent reflexes!' : 
             score >= 50 ? 'Good performance!' : 
             score >= 25 ? 'Not bad!' : 'Keep practicing!'}
          </ThemedText>
          {params.sequence === 'all-nine' ? (
            <>
              <TouchableOpacity
                style={[styles.startButton, { backgroundColor: tintColor }, inputsDisabled && { opacity: 0.5 }]}
                onPress={handleNextTestOrFinish}
                disabled={inputsDisabled}
                accessibilityRole="button"
                accessibilityLabel="Next test"
                testID="btn-reflexes-next"
              >
                <ThemedText style={styles.startButtonText}>Next Test</ThemedText>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.backButton, inputsDisabled && { opacity: 0.5 }]} onPress={handleExitTest} disabled={inputsDisabled} accessibilityRole="button" accessibilityLabel="Exit test battery" testID="btn-reflexes-exit-battery">
                <ThemedText style={styles.backButtonText}>Exit Test Battery</ThemedText>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <TouchableOpacity
                style={[styles.startButton, { backgroundColor: tintColor }, inputsDisabled && { opacity: 0.5 }]}
                onPress={handlePlayAgain}
                disabled={inputsDisabled}
                accessibilityRole="button"
                accessibilityLabel="Play again"
                testID="btn-reflexes-play-again"
              >
                <ThemedText style={styles.startButtonText}>Play Again</ThemedText>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.backButton, inputsDisabled && { opacity: 0.5 }]} onPress={handleBackToMenu} disabled={inputsDisabled} accessibilityRole="button" accessibilityLabel="Back to menu" testID="btn-reflexes-back-menu">
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
    <TouchableOpacity
      style={[styles.gameContainer, { paddingTop: insets.top + 10 }]}
      onPress={handleScreenTap}
      activeOpacity={1}
      accessibilityRole="button"
      accessibilityLabel="Game area, tap to play"
      testID="btn-reflexes-game-area"
    >
      <ThemedView style={[styles.infoBanner, { borderColor: tintColor }]}>
        <TouchableOpacity
          style={styles.bannerBackButton}
          onPress={handleExitTest}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel="Exit test"
          testID="btn-reflexes-exit-playing"
        >
          <Ionicons name="arrow-back" size={20} color={tintColor} />
        </TouchableOpacity>
        <View style={styles.bannerStats}>
          <ThemedText style={styles.bannerStatText}>Time: {timeLeft}s</ThemedText>
          <Animated.View style={{ transform: [{ scale: scoreScale }] }}>
            <ThemedText style={[styles.bannerStatText, { color: tintColor }]}>Score: {score}</ThemedText>
          </Animated.View>
          {combo >= 3 && (
            <Animated.View style={{ transform: [{ scale: comboScale }] }}>
              <ThemedText style={[styles.comboText, { color: '#FF6B35' }]}>
                {combo}x
              </ThemedText>
            </Animated.View>
          )}
        </View>
      </ThemedView>
      
      <View
  style={styles.gameArea}
  onLayout={(event) => {
    const { width, height } = event.nativeEvent.layout;
    setGameAreaSize({ width, height });
  }}
>

        <Animated.View
          style={[
            styles.bubble,
            {
              backgroundColor: tintColor,
              left: bubblePosition.x - BUBBLE_SIZE / 2,
              top: bubblePosition.y - BUBBLE_SIZE / 2,
              transform: [{ scale: bubbleScale }],
            }
          ]}
        >
          <TouchableOpacity
            style={styles.bubbleTouchArea}
            onPress={handleBubbleTap}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Tap the bubble"
            testID="btn-reflexes-bubble"
          />
        </Animated.View>

        {/* Hit Effect */}
        {showHitEffect && (
          <Animated.View
            style={[
              styles.hitEffect,
              {
                left: hitEffectPosition.x - 30,
                top: hitEffectPosition.y - 30,
                opacity: hitEffectOpacity,
                transform: [{ scale: hitEffectScale }],
              }
            ]}
          />
        )}
      </View>
    </TouchableOpacity>
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
  },
  backButtonText: {
    fontSize: 16,
    opacity: 0.7,
  },
  gameContainer: {
    flex: 1,
    paddingTop: 20,
    backgroundColor: 'transparent',
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
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
  comboText: {
    fontSize: 16,
    fontWeight: '700',
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  timer: {
    fontSize: 18,
    fontWeight: '600',
  },
  scoreText: {
    fontSize: 18,
    fontWeight: '600',
  },
  gameArea: {
    flex: 1,
    position: 'relative',
  },
  bubble: {
    position: 'absolute',
    width: BUBBLE_SIZE,
    height: BUBBLE_SIZE,
    borderRadius: BUBBLE_SIZE / 2,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  bubbleTouchArea: {
    width: '100%',
    height: '100%',
    borderRadius: BUBBLE_SIZE / 2,
  },
  hitEffect: {
    position: 'absolute',
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 3,
    borderColor: '#22C55E',
    backgroundColor: 'transparent',
  },
  finalScore: {
    fontSize: 26,
    fontWeight: 'bold',
    marginBottom: 20,
    marginTop: 20,
    textAlign: 'center',
    paddingHorizontal: 10,
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
    paddingHorizontal: 20,
    lineHeight: 24,
  },
  metricsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    marginBottom: 30,
    marginTop: 20,
  },
  metricCard: {
    alignItems: 'center',
    flex: 1,
  },
  metricNumber: {
    fontSize: 24,
    fontWeight: '700',
    lineHeight: 28,
  },
  metricLabel: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 4,
    opacity: 0.7,
    textTransform: 'uppercase',
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
});