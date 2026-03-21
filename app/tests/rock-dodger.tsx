import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, TouchableOpacity, View, Dimensions, Alert, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useThemeColor } from '@/hooks/use-theme-color';
import { saveCognitiveTestResult } from '@/database/cognitive-tests';
import { getRelevantScheduledTest, completeScheduledTest, getTestContext, isUserInActiveTestSession } from '@/database/study-scheduler';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import Animated, { useSharedValue, useAnimatedStyle, runOnJS } from 'react-native-reanimated';
import { useHierarchicalBack } from '@/hooks/use-hierarchical-back';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
const PLAYER_SIZE = 40;
const ROCK_SIZE = 50;
const OBSTACLE_SPEED_BASE = 3;
const OBSTACLE_SPAWN_RATE_BASE = 800;
const JOYSTICK_SIZE = 120;
const JOYSTICK_KNOB_SIZE = 50;
const PLAYER_SPEED = 5;

interface Obstacle {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export default function RockDodgerTestScreen() {
  console.log('RockDodgerTestScreen component loaded successfully');
  const router = useRouter();
  const params = useLocalSearchParams();
  const tintColor = useThemeColor({}, 'tint');
  const insets = useSafeAreaInsets();
  
  useHierarchicalBack('tests/rock-dodger');
  
  const [gameState, setGameState] = useState<'ready' | 'playing' | 'finished'>('ready');
  const gameStateRef = useRef<'ready' | 'playing' | 'finished'>('ready');

  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  const [survivalTime, setSurvivalTime] = useState(0);
  const difficultyLevelRef = useRef(1);
  const [obstacles, setObstacles] = useState<Obstacle[]>([]);
  const [, setRocksSpawned] = useState(0);
  const [scheduledTest, setScheduledTest] = useState<any>(null);
  const [studyContext, setStudyContext] = useState<any>(null);
  const [activeTestSession, setActiveTestSession] = useState<any>(null);
  
  const playerX = useSharedValue(screenWidth / 2 - PLAYER_SIZE / 2);
  const gameTimer = useRef<number | null>(null);
  const spawnTimer = useRef<number | null>(null);
  const obstacleIdCounter = useRef(0);
  const startTime = useRef<number>(0);
  
  const velocityX = useSharedValue(0);
  const velocityY = useSharedValue(0);
  const joystickOffsetX = useSharedValue(0);
  const joystickOffsetY = useSharedValue(0);

  const gameAreaTop = insets.top + 140;
  const gameAreaHeight = screenHeight - insets.top - insets.bottom - 140 - JOYSTICK_SIZE - 40;
  const defaultPlayerY = gameAreaTop + gameAreaHeight * 0.5;
  const playerY = useSharedValue(defaultPlayerY);
  

  const generateObstacle = (): Obstacle => {
    obstacleIdCounter.current++;
    
    const playerCenterX = playerX.value + PLAYER_SIZE / 2;
    const playerCenterY = playerY.value + PLAYER_SIZE / 2;
    
    let spawnX = (playerCenterX + screenWidth / 2) % screenWidth;
    let spawnY = gameAreaTop + ((playerCenterY - gameAreaTop + gameAreaHeight / 2) % gameAreaHeight);
    
    spawnX += (Math.random() - 0.5) * 60;
    spawnY += (Math.random() - 0.5) * 60;
    
    spawnX = ((spawnX % screenWidth) + screenWidth) % screenWidth;
    spawnY = gameAreaTop + (((spawnY - gameAreaTop) % gameAreaHeight) + gameAreaHeight) % gameAreaHeight;
    
    spawnX -= ROCK_SIZE / 2;
    spawnY -= ROCK_SIZE / 2;
    
    const rockSpeed = OBSTACLE_SPEED_BASE + (difficultyLevelRef.current - 1) * 0.5;
    
    const angle = Math.random() * Math.PI * 2;
    const vx = Math.cos(angle) * rockSpeed;
    const vy = Math.sin(angle) * rockSpeed;
    
    return {
      id: obstacleIdCounter.current,
      x: spawnX,
      y: spawnY,
      vx,
      vy,
    };
  };

  const checkCollision = (playerXVal: number, playerYVal: number, obstacle: Obstacle): boolean => {
    const playerCenterX = playerXVal + PLAYER_SIZE / 2;
    const playerCenterY = playerYVal + PLAYER_SIZE / 2;
    const obstacleCenterX = obstacle.x + ROCK_SIZE / 2;
    const obstacleCenterY = obstacle.y + ROCK_SIZE / 2;
    
    const dx = playerCenterX - obstacleCenterX;
    const dy = playerCenterY - obstacleCenterY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const collisionDistance = (PLAYER_SIZE / 2) + (ROCK_SIZE / 2);
    
    return distance < collisionDistance;
  };

  const updateGame = () => {
    if (gameStateRef.current !== 'playing') return;

    const currentTime = Date.now();
    const survival = (currentTime - startTime.current) / 1000;
    setSurvivalTime(survival);
    
    let newX = playerX.value + velocityX.value;
    let newY = playerY.value + velocityY.value;
    
    const wrapWidth = screenWidth;
    const wrapHeight = gameAreaHeight;
    
    if (newX < -PLAYER_SIZE) {
      newX = wrapWidth;
    } else if (newX > wrapWidth) {
      newX = -PLAYER_SIZE;
    }
    
    if (newY < gameAreaTop - PLAYER_SIZE) {
      newY = gameAreaTop + wrapHeight;
    } else if (newY > gameAreaTop + wrapHeight) {
      newY = gameAreaTop - PLAYER_SIZE;
    }
    
    playerX.value = newX;
    playerY.value = newY;
    
    setObstacles(prevObstacles => {
      const currentPlayerX = playerX.value;
      const currentPlayerY = playerY.value;
      
      const newObstacles = prevObstacles.map(obstacle => {
        let newRockX = obstacle.x + obstacle.vx;
        let newRockY = obstacle.y + obstacle.vy;
        
        if (newRockX < -ROCK_SIZE) {
          newRockX = screenWidth;
        } else if (newRockX > screenWidth) {
          newRockX = -ROCK_SIZE;
        }
        
        if (newRockY < gameAreaTop - ROCK_SIZE) {
          newRockY = gameAreaTop + gameAreaHeight;
        } else if (newRockY > gameAreaTop + gameAreaHeight) {
          newRockY = gameAreaTop - ROCK_SIZE;
        }
        
        return {
          ...obstacle,
          x: newRockX,
          y: newRockY
        };
      });
      
      for (const obstacle of newObstacles) {
        if (checkCollision(currentPlayerX, currentPlayerY, obstacle)) {
          runOnJS(endGame)();
          return newObstacles;
        }
      }
      
      const newDifficultyLevel = Math.floor(survival / 10) + 1;
      if (newDifficultyLevel !== difficultyLevelRef.current) {
        difficultyLevelRef.current = newDifficultyLevel;
      }
      
      return newObstacles;
    });
  };

  const spawnObstacle = () => {
    if (gameStateRef.current !== 'playing') {
      return;
    }

    const newRock = generateObstacle();
    setObstacles(prev => [...prev, newRock]);
    
    setRocksSpawned(prev => prev + 1);
    
    const spawnRate = Math.max(300, OBSTACLE_SPAWN_RATE_BASE - (difficultyLevelRef.current - 1) * 100);
    spawnTimer.current = setTimeout(spawnObstacle, spawnRate) as any;
  };

  const startGame = async () => {
    try {
      const activeSession = await isUserInActiveTestSession();
      if (activeSession.isActive && String(activeSession.activeTest?.test_type) !== 'rock_dodger') {
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
    
    startGameNow();
  };

  const startGameNow = () => {
    setGameState('playing');
    setSurvivalTime(0);
    difficultyLevelRef.current = 1;
    setObstacles([]);
    setRocksSpawned(0);
    playerX.value = screenWidth / 2 - PLAYER_SIZE / 2;
    playerY.value = defaultPlayerY;
    startTime.current = Date.now();
    velocityX.value = 0;
    velocityY.value = 0;
    joystickOffsetX.value = 0;
    joystickOffsetY.value = 0;
    
    gameTimer.current = setInterval(updateGame, 16) as any;
    setTimeout(spawnObstacle, 500) as any;
  };

  const endGame = async () => {
    setGameState('finished');
    if (gameTimer.current) {
      clearInterval(gameTimer.current);
    }
    if (spawnTimer.current) {
      clearTimeout(spawnTimer.current);
    }
    
    const calculatedTime = (Date.now() - startTime.current) / 1000;
    const finalSurvivalTime = Math.max(0.001, calculatedTime);
    setSurvivalTime(finalSurvivalTime);
    
    const rawData = {
      survivalTime: finalSurvivalTime
    };
    
    try {
      const studyId = scheduledTest ? studyContext?.study_protocol_id : undefined;
      const supplementLogId = scheduledTest ? studyContext?.supplement_log_id : undefined;
      
      const score = Math.round(finalSurvivalTime * 4);
      await saveCognitiveTestResult('rock_dodger', score, rawData, finalSurvivalTime, studyId, supplementLogId);
      
      if (scheduledTest) {
        await completeScheduledTest(scheduledTest.id);
      }
    } catch (error) {
      console.error('Failed to save rock dodger test result:', error);
    }
  };

  const joystickGesture = Gesture.Pan()
    .onStart(() => {
      joystickOffsetX.value = 0;
      joystickOffsetY.value = 0;
    })
    .onUpdate((event) => {
      const maxOffset = (JOYSTICK_SIZE - JOYSTICK_KNOB_SIZE) / 2;
      
      let offsetX = event.translationX;
      let offsetY = event.translationY;
      
      const dist = Math.sqrt(offsetX * offsetX + offsetY * offsetY);
      if (dist > maxOffset) {
        offsetX = (offsetX / dist) * maxOffset;
        offsetY = (offsetY / dist) * maxOffset;
      }
      
      joystickOffsetX.value = offsetX;
      joystickOffsetY.value = offsetY;
      
      const normalizedX = offsetX / maxOffset;
      const normalizedY = offsetY / maxOffset;
      
      velocityX.value = normalizedX * PLAYER_SPEED;
      velocityY.value = normalizedY * PLAYER_SPEED;
    })
    .onEnd(() => {
      joystickOffsetX.value = 0;
      joystickOffsetY.value = 0;
      velocityX.value = 0;
      velocityY.value = 0;
    });

  const joystickKnobStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { translateX: joystickOffsetX.value },
        { translateY: joystickOffsetY.value }
      ],
    };
  });

  const playerAnimatedStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { translateX: playerX.value },
        { translateY: playerY.value - gameAreaTop }
      ],
    };
  });

  const handleBackToMenu = () => {
    if (params.sequence === 'all-nine') {
      router.push('/tests/all-nine');
    } else {
      router.push('/cognitive-tests');
    }
  };

  const handleAbortTest = () => {
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
              gameStateRef.current = 'ready';
              setGameState('ready');
              if (gameTimer.current) {
                clearInterval(gameTimer.current);
                gameTimer.current = null;
              }
              if (spawnTimer.current) {
                clearTimeout(spawnTimer.current);
                spawnTimer.current = null;
              }
              handleBackToMenu();
            },
          },
        ]
      );
    } else {
      handleBackToMenu();
    }
  };

  const handleNextTestOrFinish = () => {
    if (params.sequence === 'all-nine') {
      router.push('/tests/pattern-matcher?sequence=all-nine');
    } else {
      router.push('/cognitive-tests');
    }
  };

  const handlePlayAgain = () => {
    startGame();
  };

  useEffect(() => {
    const checkTestStatus = async () => {
      try {
        const activeSession = await isUserInActiveTestSession();
        if (activeSession.isActive && String(activeSession.activeTest?.test_type) !== 'rock_dodger') {
          setActiveTestSession(activeSession);
        }
        
        const relevantTest = await getRelevantScheduledTest('rock_dodger');
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
        clearInterval(gameTimer.current);
      }
      if (spawnTimer.current) {
        clearTimeout(spawnTimer.current);
      }
    };
  }, []);

  if (gameState === 'ready') {
    return (
      <ThemedView style={styles.container} safeArea>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <ThemedView style={styles.instructionsContainer}>
            {params.sequence === 'all-nine' && (
              <ThemedView style={[styles.progressBanner, { backgroundColor: tintColor + '15', borderColor: tintColor }]}>
                <ThemedText style={[styles.progressText, { color: tintColor }]}>
                  Test 5 of 9
                </ThemedText>
              </ThemedView>
            )}
            <ThemedText type="title" style={styles.title}>Coordination</ThemedText>
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
              Dodge the rocks using the joystick!{'\n\n'}
              • Use the joystick at the bottom to move{'\n'}
              • Rocks spawn far away with random trajectories{'\n'}
              • Game ends when you hit a rock{'\n'}
              • Difficulty increases over time
            </ThemedText>
            <TouchableOpacity
              style={[styles.startButton, { backgroundColor: tintColor }]}
              onPress={startGame}
              accessibilityRole="button"
              accessibilityLabel="Start coordination test"
              testID="btn-rockdodger-start"
            >
              <ThemedText style={styles.startButtonText}>Start Test</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity style={styles.backButton} onPress={handleBackToMenu} accessibilityRole="button" accessibilityLabel="Back to menu" testID="btn-rockdodger-back">
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
            <ThemedText type="title" style={styles.title}>Test Complete!</ThemedText>
            <ThemedText style={styles.finalScore}>Survival Time: {survivalTime.toFixed(1)}s</ThemedText>
            <ThemedText style={styles.resultMessage}>
              {survivalTime >= 30 ? 'Excellent reflexes!' : 
               survivalTime >= 20 ? 'Good performance!' : 
               survivalTime >= 10 ? 'Not bad!' : 'Keep practicing!'}
            </ThemedText>
            {params.sequence === 'all-nine' ? (
              <>
                <TouchableOpacity
                  style={[styles.startButton, { backgroundColor: tintColor }]}
                  onPress={handleNextTestOrFinish}
                  accessibilityRole="button"
                  accessibilityLabel="Next test"
                  testID="btn-rockdodger-next"
                >
                  <ThemedText style={styles.startButtonText}>Next Test</ThemedText>
                </TouchableOpacity>
                <TouchableOpacity style={styles.backButton} onPress={handleBackToMenu} accessibilityRole="button" accessibilityLabel="Exit test battery" testID="btn-rockdodger-exit-battery">
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
                  testID="btn-rockdodger-play-again"
                >
                  <ThemedText style={styles.startButtonText}>Play Again</ThemedText>
                </TouchableOpacity>
                <TouchableOpacity style={styles.backButton} onPress={handleBackToMenu} accessibilityRole="button" accessibilityLabel="Back to menu" testID="btn-rockdodger-back-menu">
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
      <GestureHandlerRootView style={styles.gameContainer}>
        <ThemedView style={[styles.infoBanner, { borderColor: tintColor }]}>
          <TouchableOpacity
            style={styles.bannerBackButton}
            onPress={handleAbortTest}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel="Exit test"
            testID="btn-rockdodger-exit-playing"
          >
            <Ionicons name="arrow-back" size={20} color={tintColor} />
          </TouchableOpacity>
          <View style={styles.bannerStats}>
            <ThemedText style={styles.bannerStatText}>Time: {survivalTime.toFixed(1)}s</ThemedText>
          </View>
        </ThemedView>
        
        <View style={[styles.gameArea, { height: gameAreaHeight }]}>
          <Animated.View
            style={[
              styles.player,
              { backgroundColor: '#FF3B30', top: 0 },
              playerAnimatedStyle
            ]}
          />
          
          {obstacles.map(obstacle => (
            <View
              key={obstacle.id}
              style={[
                styles.obstacle,
                {
                  backgroundColor: '#2196F3',
                  left: obstacle.x,
                  top: obstacle.y - gameAreaTop,
                  width: ROCK_SIZE,
                  height: ROCK_SIZE,
                  borderRadius: ROCK_SIZE / 2,
                }
              ]}
            />
          ))}
        </View>
        
        <View style={styles.joystickContainer}>
          <GestureDetector gesture={joystickGesture}>
            <View style={styles.joystickBase}>
              <Animated.View style={[styles.joystickKnob, joystickKnobStyle]} />
            </View>
          </GestureDetector>
        </View>
      </GestureHandlerRootView>
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
    justifyContent: 'center',
  },
  bannerStatText: {
    fontSize: 14,
    fontWeight: '600',
  },
  timer: {
    fontSize: 16,
    fontWeight: '600',
  },
  scoreText: {
    fontSize: 16,
    fontWeight: '600',
  },
  levelText: {
    fontSize: 16,
    fontWeight: '600',
  },
  gameArea: {
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
  },
  player: {
    position: 'absolute',
    width: PLAYER_SIZE,
    height: PLAYER_SIZE,
    borderRadius: PLAYER_SIZE / 2,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  obstacle: {
    position: 'absolute',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  joystickContainer: {
    height: JOYSTICK_SIZE + 40,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 20,
  },
  joystickBase: {
    width: JOYSTICK_SIZE,
    height: JOYSTICK_SIZE,
    borderRadius: JOYSTICK_SIZE / 2,
    backgroundColor: 'rgba(150, 150, 150, 0.3)',
    borderWidth: 2,
    borderColor: 'rgba(150, 150, 150, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  joystickKnob: {
    width: JOYSTICK_KNOB_SIZE,
    height: JOYSTICK_KNOB_SIZE,
    borderRadius: JOYSTICK_KNOB_SIZE / 2,
    backgroundColor: 'rgba(100, 100, 100, 0.8)',
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
});
