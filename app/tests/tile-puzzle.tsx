import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, TouchableOpacity, View, Dimensions, Alert, ScrollView } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useThemeColor } from '@/hooks/use-theme-color';
import { saveCognitiveTestResult } from '@/database/cognitive-tests';
import { getRelevantScheduledTest, completeScheduledTest, getTestContext, isUserInActiveTestSession } from '@/database/study-scheduler';
import { useHierarchicalBack } from '@/hooks/use-hierarchical-back';
import { Ionicons } from '@expo/vector-icons';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
const GRID_SIZE = 3;
const TILE_SIZE = (screenWidth - 80) / GRID_SIZE;

type PuzzleState = (number | null)[][];

export default function TilePuzzleTestScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const tintColor = useThemeColor({}, 'tint');
  
  useHierarchicalBack('tests/tile-puzzle');
  
  const [gameState, setGameState] = useState<'ready' | 'playing' | 'finished'>('ready');
  const [puzzle, setPuzzle] = useState<PuzzleState>([]);
  const [moves, setMoves] = useState(0);
  const [scheduledTest, setScheduledTest] = useState<any>(null);
  const [studyContext, setStudyContext] = useState<any>(null);
  const [activeTestSession, setActiveTestSession] = useState<any>(null);
  const [isGiveUpPressed, setIsGiveUpPressed] = useState(false);
  const [completionTime, setCompletionTime] = useState<number>(0);
  
  const startTime = useRef<number>(0);

  const createSolvedPuzzle = (): PuzzleState => {
    const solved: PuzzleState = [];
    let num = 1;
    for (let i = 0; i < GRID_SIZE; i++) {
      solved[i] = [];
      for (let j = 0; j < GRID_SIZE; j++) {
        if (i === GRID_SIZE - 1 && j === GRID_SIZE - 1) {
          solved[i][j] = null; // Empty space
        } else {
          solved[i][j] = num++;
        }
      }
    }
    return solved;
  };

  const isSolvable = (puzzle: PuzzleState): boolean => {
    const flattened = puzzle.flat().filter(num => num !== null) as number[];
    let inversions = 0;
    
    for (let i = 0; i < flattened.length - 1; i++) {
      for (let j = i + 1; j < flattened.length; j++) {
        if (flattened[i] > flattened[j]) {
          inversions++;
        }
      }
    }
    
    return inversions % 2 === 0;
  };

  const shufflePuzzle = (): PuzzleState => {
    let shuffled: PuzzleState;
    do {
      const solved = createSolvedPuzzle();
      const flattened = solved.flat();
      
      // Fisher-Yates shuffle
      for (let i = flattened.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [flattened[i], flattened[j]] = [flattened[j], flattened[i]];
      }
      
      shuffled = [];
      for (let i = 0; i < GRID_SIZE; i++) {
        shuffled[i] = flattened.slice(i * GRID_SIZE, (i + 1) * GRID_SIZE);
      }
    } while (!isSolvable(shuffled) || isPuzzleSolved(shuffled));
    
    return shuffled;
  };

  const isPuzzleSolved = (currentPuzzle: PuzzleState): boolean => {
    const solved = createSolvedPuzzle();
    for (let i = 0; i < GRID_SIZE; i++) {
      for (let j = 0; j < GRID_SIZE; j++) {
        if (currentPuzzle[i][j] !== solved[i][j]) {
          return false;
        }
      }
    }
    return true;
  };

  const findEmptySpace = (currentPuzzle: PuzzleState): [number, number] => {
    for (let i = 0; i < GRID_SIZE; i++) {
      for (let j = 0; j < GRID_SIZE; j++) {
        if (currentPuzzle[i][j] === null) {
          return [i, j];
        }
      }
    }
    return [-1, -1];
  };

  const canMoveTile = (row: number, col: number, currentPuzzle: PuzzleState): boolean => {
    const [emptyRow, emptyCol] = findEmptySpace(currentPuzzle);
    const rowDiff = Math.abs(row - emptyRow);
    const colDiff = Math.abs(col - emptyCol);
    return (rowDiff === 1 && colDiff === 0) || (rowDiff === 0 && colDiff === 1);
  };

  const moveTile = (row: number, col: number) => {
    if (!canMoveTile(row, col, puzzle)) return;
    
    const newPuzzle = puzzle.map(r => [...r]);
    const [emptyRow, emptyCol] = findEmptySpace(newPuzzle);
    
    newPuzzle[emptyRow][emptyCol] = newPuzzle[row][col];
    newPuzzle[row][col] = null;
    
    setPuzzle(newPuzzle);
    setMoves(prev => prev + 1);
    
    if (isPuzzleSolved(newPuzzle)) {
      endGame(true);
    }
  };

  const startGame = async () => {
    try {
      const activeSession = await isUserInActiveTestSession();
      if (activeSession.isActive && String(activeSession.activeTest?.test_type) !== 'tile_puzzle') {
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
    const newPuzzle = shufflePuzzle();
    
    setGameState('playing');
    setPuzzle(newPuzzle);
    setMoves(0);
    setIsGiveUpPressed(false);
    setCompletionTime(0);
    startTime.current = Date.now();
  };

  const endGame = async (solved: boolean) => {
    setGameState('finished');
    
    const finalCompletionTime = (Date.now() - startTime.current) / 1000;
    setCompletionTime(finalCompletionTime);
    
    const accuracy = solved ? 100 : 0;
    const speed = finalCompletionTime;
    
    const rawData = {
      completion_time: finalCompletionTime,
      total_moves: moves,
      gave_up: !solved,
      solved,
      accuracy,
      speed
    };
    
    try {
      const studyId = scheduledTest ? studyContext?.study_protocol_id : undefined;
      const supplementLogId = scheduledTest ? studyContext?.supplement_log_id : undefined;
      
      const score = solved ? 130 - moves : 0;
      await saveCognitiveTestResult('tile_puzzle', score, rawData, finalCompletionTime, studyId, supplementLogId, accuracy, speed);
      
      if (scheduledTest) {
        await completeScheduledTest(scheduledTest.id);
      }
    } catch (error) {
      console.error('Failed to save tile puzzle test result:', error);
    }
  };

  const handleGiveUp = () => {
    Alert.alert(
      'Give Up?',
      'Are you sure you want to give up on this puzzle?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Give Up', style: 'destructive', onPress: () => {
          setIsGiveUpPressed(true);
          endGame(false);
        }}
      ]
    );
  };

  const handleBackToMenu = () => {
    if (params.sequence === 'all-nine') {
      router.push('/tests/all-nine');
    } else {
      router.push('/cognitive-tests');
    }
  };

  const handleNextTestOrFinish = () => {
    if (params.sequence === 'all-nine') {
      router.push('/tests/n-back?sequence=all-nine');
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
        if (activeSession.isActive && String(activeSession.activeTest?.test_type) !== 'tile_puzzle') {
          setActiveTestSession(activeSession);
        }
        
        const relevantTest = await getRelevantScheduledTest('tile_puzzle');
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

  if (gameState === 'ready') {
    return (
      <ThemedView style={styles.container} safeArea>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <ThemedView style={styles.instructionsContainer}>
            {params.sequence === 'all-nine' && (
              <ThemedView style={[styles.progressBanner, { backgroundColor: tintColor + '15', borderColor: tintColor }]}>
                <ThemedText style={[styles.progressText, { color: tintColor }]}>
                  Test 7 of 9
                </ThemedText>
              </ThemedView>
            )}
            <ThemedText type="title" style={styles.title}>Planning</ThemedText>
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
              Arrange the numbered tiles in order!{'\n\n'}
              • Tap tiles adjacent to empty space to move them{'\n'}
              • Goal: arrange numbers 1-8 in order{'\n'}
              • Empty space should be bottom-right{'\n'}
              • Try to solve in as few moves as possible
            </ThemedText>
            <TouchableOpacity
              style={[styles.startButton, { backgroundColor: tintColor }]}
              onPress={startGame}
              accessibilityRole="button"
              accessibilityLabel="Start tile puzzle test"
              testID="btn-tile-start"
            >
              <ThemedText style={styles.startButtonText}>Start Test</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity style={styles.backButton} onPress={handleBackToMenu} accessibilityRole="button" accessibilityLabel="Back to menu" testID="btn-tile-back">
              <ThemedText style={styles.backButtonText}>Back to Menu</ThemedText>
            </TouchableOpacity>
          </ThemedView>
        </ScrollView>
      </ThemedView>
    );
  }

  if (gameState === 'finished') {
    const wasSolved = !isGiveUpPressed && isPuzzleSolved(puzzle);
    
    return (
      <ThemedView style={styles.container} safeArea>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <ThemedView style={styles.resultsContainer}>
            <ThemedText type="title" style={styles.title}>
              {wasSolved ? 'Puzzle Solved!' : 'Game Over'}
            </ThemedText>
            <ThemedText style={styles.metricText}>Total Moves: {moves}</ThemedText>
            <ThemedText style={styles.metricText}>Time: {completionTime.toFixed(1)}s</ThemedText>
            <ThemedText style={styles.resultMessage}>
              {wasSolved && moves <= 30 ? 'Outstanding spatial reasoning!' : 
               wasSolved && moves <= 50 ? 'Great problem solving!' : 
               wasSolved ? 'Good work!' : 'Keep practicing!'}
            </ThemedText>
            {params.sequence === 'all-nine' ? (
              <>
                <TouchableOpacity
                  style={[styles.startButton, { backgroundColor: tintColor }]}
                  onPress={handleNextTestOrFinish}
                  accessibilityRole="button"
                  accessibilityLabel="Next test"
                  testID="btn-tile-next"
                >
                  <ThemedText style={styles.startButtonText}>Next Test</ThemedText>
                </TouchableOpacity>
                <TouchableOpacity style={styles.backButton} onPress={handleBackToMenu} accessibilityRole="button" accessibilityLabel="Exit test battery" testID="btn-tile-exit-battery">
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
                  testID="btn-tile-play-again"
                >
                  <ThemedText style={styles.startButtonText}>Play Again</ThemedText>
                </TouchableOpacity>
                <TouchableOpacity style={styles.backButton} onPress={handleBackToMenu} accessibilityRole="button" accessibilityLabel="Back to menu" testID="btn-tile-back-menu">
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
          testID="btn-tile-back-playing"
        >
          <Ionicons name="arrow-back" size={20} color={tintColor} />
        </TouchableOpacity>
        <View style={styles.bannerStats}>
          <ThemedText style={styles.bannerStatText}>Moves: {moves}</ThemedText>
        </View>
      </ThemedView>

      <View style={styles.puzzleContainer}>
        {puzzle.map((row, rowIndex) =>
          row.map((tile, colIndex) => (
            <TouchableOpacity
              key={`${rowIndex}-${colIndex}`}
              style={[
                styles.tile,
                {
                  backgroundColor: tile === null ? 'transparent' : tintColor,
                  borderColor: tile === null ? 'transparent' : '#ccc',
                }
              ]}
              onPress={() => moveTile(rowIndex, colIndex)}
              disabled={!canMoveTile(rowIndex, colIndex, puzzle)}
              accessibilityRole="button"
              accessibilityLabel={tile !== null ? `Tile ${tile}` : 'Empty space'}
              testID={`btn-tile-cell-${rowIndex}-${colIndex}`}
            >
              {tile !== null && (
                <ThemedText style={styles.tileText}>{tile}</ThemedText>
              )}
            </TouchableOpacity>
          ))
        )}
      </View>

      <ThemedView style={styles.goalContainer}>
        <ThemedText style={styles.goalTitle}>Goal:</ThemedText>
        <View style={styles.goalGrid}>
          {[1, 2, 3, 4, 5, 6, 7, 8, null].map((num, index) => (
            <View
              key={index}
              style={[
                styles.goalTile,
                { backgroundColor: num === null ? 'transparent' : '#ccc' }
              ]}
            >
              {num !== null && (
                <ThemedText style={styles.goalTileText}>{num}</ThemedText>
              )}
            </View>
          ))}
        </View>
      </ThemedView>

      <TouchableOpacity
        style={[styles.giveUpButton, { borderColor: '#FF3B30' }]}
        onPress={handleGiveUp}
        accessibilityRole="button"
        accessibilityLabel="Give up"
        testID="btn-tile-give-up"
      >
        <ThemedText style={[styles.giveUpButtonText, { color: '#FF3B30' }]}>Give Up</ThemedText>
      </TouchableOpacity>

      <TouchableOpacity style={styles.backButton} onPress={handleBackToMenu} accessibilityRole="button" accessibilityLabel="Back to menu" testID="btn-tile-back-playing-bottom">
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
  movesText: {
    fontSize: 18,
    fontWeight: '600',
  },
  puzzleContainer: {
    width: TILE_SIZE * GRID_SIZE + 20,
    height: TILE_SIZE * GRID_SIZE + 20,
    alignSelf: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: '#333',
    padding: 10,
    borderRadius: 10,
    marginBottom: 30,
  },
  tile: {
    width: TILE_SIZE - 10,
    height: TILE_SIZE - 10,
    margin: 5,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  tileText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: 'white',
  },
  goalContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  goalTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 10,
  },
  goalGrid: {
    width: 120,
    height: 120,
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: '#f0f0f0',
    padding: 5,
    borderRadius: 5,
  },
  goalTile: {
    width: 30,
    height: 30,
    margin: 2.5,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 3,
  },
  goalTileText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: 'black',
  },
  giveUpButton: {
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 8,
    borderWidth: 2,
    alignItems: 'center',
    marginBottom: 20,
    alignSelf: 'center',
  },
  giveUpButtonText: {
    fontSize: 16,
    fontWeight: '600',
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