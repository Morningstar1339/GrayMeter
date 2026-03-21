import React, { useState, useEffect, useCallback } from 'react';
import { StyleSheet, TouchableOpacity, View, ScrollView, Dimensions } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useHierarchicalBack } from '@/hooks/use-hierarchical-back';
import { getCognitiveTestResults, CognitiveTestResult } from '@/database/cognitive-tests';

const { width: screenWidth } = Dimensions.get('window');
const OCTAGON_SIZE = Math.min(85, (screenWidth - 80) / 3);
const GAP = 12;

const TESTS = [
  { key: 'reflexes',        label: 'Reflexes',   time: '10s',  icon: 'flash-outline',         route: '/tests/reflexes' },
  { key: 'memory',          label: 'Memory',     time: '2m',   icon: 'grid-outline',          route: '/tests/memory' },
  { key: 'connections',     label: 'Route Planner', time: '2m', icon: 'git-network-outline',   route: '/tests/connections' },
  { key: 'rock-dodger',     label: 'Dodger',     time: '1m',   icon: 'shield-outline',        route: '/tests/rock-dodger' },
  { key: 'questionnaire',   label: 'Mood',       time: '10s',  icon: 'happy-outline',         route: '/tests/questionnaire' },
  { key: 'pattern-matcher', label: 'Pattern',    time: '2m',   icon: 'shapes-outline',        route: '/tests/pattern-matcher' },
  { key: 'tile-puzzle',     label: 'Planning',     time: '3m',   icon: 'apps-outline',          route: '/tests/tile-puzzle' },
  { key: 'stroop',          label: 'Coherence',     time: '45s',  icon: 'color-palette-outline', route: '/tests/stroop' },
  { key: 'n-back',          label: 'N-Back',     time: '1m',   icon: 'layers-outline',        route: '/tests/n-back' },
] as const;

type TabMode = 'test' | 'history';

export default function CognitiveTestsScreen() {
  useHierarchicalBack('cognitive-tests');
  const router = useRouter();
  const tintColor = useThemeColor({}, 'tint');
  const backgroundColor = useThemeColor({}, 'background');
  
  const [activeTab, setActiveTab] = useState<TabMode>('test');
  const [testHistory, setTestHistory] = useState<CognitiveTestResult[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  const loadTestHistory = useCallback(async () => {
    setIsLoadingHistory(true);
    try {
      const results = await getCognitiveTestResults();
      setTestHistory(results);
    } catch (error) {
      console.error('Failed to load test history:', error);
    } finally {
      setIsLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'history') {
      loadTestHistory();
    }
  }, [activeTab, loadTestHistory]);

  const handleHomePress = () => {
    router.push('/');
  };

  const startTest = (route: any) => {
    router.push(route);
  };

  const handleAllTests = () => {
    router.push('/tests/all-nine');
  };

  const OctagonButton = ({ test }: { test: typeof TESTS[number] }) => {
    const size = OCTAGON_SIZE;
    const corner = size * 0.29;
    
    return (
      <TouchableOpacity
        style={[
          styles.octagon,
          {
            width: size,
            height: size,
            borderRadius: corner,
          }
        ]}
        onPress={() => startTest(test.route)}
        accessibilityRole="button"
        accessibilityLabel={`Start ${test.label} test`}
        testID={`btn-test-${test.key}`}
      >
        <View style={[
          styles.octagonInner,
          { 
            backgroundColor: backgroundColor,
            borderColor: tintColor,
            borderRadius: corner * 0.8,
          }
        ]}>
          <Ionicons name={test.icon as any} size={40} color={tintColor} style={styles.octagonIcon} />
          <ThemedText style={styles.octagonLabel}>{test.label}</ThemedText>
        </View>
      </TouchableOpacity>
    );
  };

  const renderTestTab = () => (
    <>
      <View style={styles.hexContainer}>
        <View style={styles.hexRow}>
          <OctagonButton test={TESTS[0]} />
          <OctagonButton test={TESTS[1]} />
          <OctagonButton test={TESTS[2]} />
        </View>

        <View style={[styles.hexRow, { marginTop: GAP }]}>
          <OctagonButton test={TESTS[3]} />
          <OctagonButton test={TESTS[4]} />
          <OctagonButton test={TESTS[5]} />
        </View>

        <View style={[styles.hexRow, { marginTop: GAP }]}>
          <OctagonButton test={TESTS[6]} />
          <OctagonButton test={TESTS[7]} />
          <OctagonButton test={TESTS[8]} />
        </View>
      </View>

      <ThemedView style={styles.bottomButtons}>
        <TouchableOpacity
          style={[styles.runAllButton, { backgroundColor: tintColor }]}
          onPress={handleAllTests}
          accessibilityRole="button"
          accessibilityLabel="Run all 9 tests"
          testID="btn-run-all-tests"
        >
          <Ionicons
            name="checkmark-done-outline"
            size={24}
            color={backgroundColor}
            style={styles.runAllIcon}
          />
          <ThemedText
            type="subtitle"
            style={[styles.runAllText, { color: backgroundColor }]}
          >
            Run All 9 Tests
          </ThemedText>
          <ThemedText style={[styles.runAllTime, { color: backgroundColor }]}>
            ~5 min
          </ThemedText>
        </TouchableOpacity>
      </ThemedView>
    </>
  );

  const formatTestName = (testType: string): string => {
    const names: Record<string, string> = {
      'reflexes': 'Reflexes',
      'memory': 'Memory',
      'judgment': 'Judgment',
      'rock_dodger': 'Coordination',
      'pattern_matcher': 'Deduction',
      'tile_puzzle': 'Planning',
      'n_back': 'N-Back',
      'stroop': 'Coherence',
      'questionnaire': 'Mood'
    };
    return names[testType] || testType;
  };

  const formatDate = (timestamp: number): string => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  const formatTime = (timestamp: number): string => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  };

  const groupResultsByDate = (results: CognitiveTestResult[]): Map<string, CognitiveTestResult[]> => {
    const groups = new Map<string, CognitiveTestResult[]>();
    results.forEach(result => {
      const dateKey = formatDate(result.timestamp);
      if (!groups.has(dateKey)) {
        groups.set(dateKey, []);
      }
      groups.get(dateKey)!.push(result);
    });
    return groups;
  };

  const renderHistoryTab = () => {
    if (isLoadingHistory) {
      return (
        <View style={styles.historyContainer}>
          <View style={styles.emptyHistoryState}>
            <Ionicons name="hourglass-outline" size={48} color="#8E8E93" />
            <ThemedText style={styles.emptyHistoryTitle}>Loading...</ThemedText>
          </View>
        </View>
      );
    }

    if (testHistory.length === 0) {
      return (
        <View style={styles.historyContainer}>
          <View style={styles.emptyHistoryState}>
            <Ionicons name="time-outline" size={64} color="#8E8E93" />
            <ThemedText style={styles.emptyHistoryTitle}>Test History</ThemedText>
            <ThemedText style={styles.emptyHistoryText}>
              Your test results and performance trends will appear here.
            </ThemedText>
            <ThemedText style={styles.emptyHistorySubtext}>
              Complete some cognitive tests to start tracking your progress.
            </ThemedText>
          </View>
        </View>
      );
    }

    const groupedResults = groupResultsByDate(testHistory);

    return (
      <View style={styles.historyContainer}>
        {Array.from(groupedResults.entries()).map(([date, results]) => (
          <View key={date} style={styles.dateGroup}>
            <ThemedText style={styles.dateHeader}>{date}</ThemedText>
            {results.map((result) => (
              <View key={result.id} style={[styles.historyItem, { borderColor: tintColor + '30' }]}>
                <View style={styles.historyItemLeft}>
                  <ThemedText style={styles.historyTestName}>{formatTestName(result.test_type)}</ThemedText>
                  <ThemedText style={styles.historyTime}>{formatTime(result.timestamp)}</ThemedText>
                </View>
                <View style={styles.historyItemRight}>
                  <ThemedText style={[styles.historyScore, { color: tintColor }]}>{result.score}</ThemedText>
                  {result.accuracy > 0 && result.test_type !== 'pattern_matcher' && result.test_type !== 'questionnaire' && result.test_type !== 'tile_puzzle' && (
                    <ThemedText style={styles.historyAccuracy}>
                      {result.accuracy.toFixed(0)}% acc
                    </ThemedText>
                  )}
                </View>
              </View>
            ))}
          </View>
        ))}
      </View>
    );
  };

  return (
    <ThemedView style={styles.container} safeArea>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <ThemedView style={styles.header}>
          <TouchableOpacity
            style={styles.homeButton}
            onPress={handleHomePress}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel="Go home"
            testID="btn-tests-home"
          >
            <Ionicons name="home-outline" size={24} color={tintColor} />
          </TouchableOpacity>
          <ThemedText type="title" style={styles.title}>
            Cognitive Tests
          </ThemedText>
          <View style={styles.headerPlaceholder} />
        </ThemedView>

        <View style={styles.tabContainer}>
          <TouchableOpacity
            style={[
              styles.tab,
              activeTab === 'test' && { backgroundColor: tintColor }
            ]}
            onPress={() => setActiveTab('test')}
            accessibilityRole="tab"
            accessibilityLabel="Test tab"
            testID="tab-tests"
          >
            <Ionicons 
              name="fitness-outline" 
              size={18} 
              color={activeTab === 'test' ? 'white' : tintColor} 
              style={styles.tabIcon}
            />
            <ThemedText style={[
              styles.tabText,
              activeTab === 'test' && { color: 'white' }
            ]}>
              Test
            </ThemedText>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.tab,
              activeTab === 'history' && { backgroundColor: tintColor }
            ]}
            onPress={() => setActiveTab('history')}
            accessibilityRole="tab"
            accessibilityLabel="History tab"
            testID="tab-history"
          >
            <Ionicons 
              name="time-outline" 
              size={18} 
              color={activeTab === 'history' ? 'white' : tintColor} 
              style={styles.tabIcon}
            />
            <ThemedText style={[
              styles.tabText,
              activeTab === 'history' && { color: 'white' }
            ]}>
              History
            </ThemedText>
          </TouchableOpacity>
        </View>

        {activeTab === 'test' ? renderTestTab() : renderHistoryTab()}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  header: {
    paddingTop: 8,
    paddingBottom: 8,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  homeButton: {
    padding: 4,
  },
  headerPlaceholder: {
    width: 24,
    height: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
  },
  tabContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: 'rgba(128, 128, 128, 0.1)',
  },
  tabIcon: {
    marginRight: 8,
  },
  tabText: {
    fontSize: 16,
    fontWeight: '600',
  },
  hexContainer: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  hexRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: GAP,
  },
  octagon: {
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '22.5deg' }],
  },
  octagonInner: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'flex-end',
    borderWidth: 2,
    transform: [{ rotate: '-22.5deg' }],
    paddingBottom: 4,
  },
  octagonIcon: {
    position: 'absolute',
    top: '8%',
  },
  octagonLabel: {
    fontSize: 10,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 8,
  },
  bottomButtons: {
    marginTop: 16,
  },
  runAllButton: {
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  runAllIcon: {
    marginRight: 8,
  },
  runAllText: {
    fontSize: 16,
    fontWeight: '700',
  },
  runAllTime: {
    fontSize: 12,
    opacity: 0.8,
    marginLeft: 8,
  },
  historyContainer: {
    flex: 1,
    paddingVertical: 8,
  },
  emptyHistoryState: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyHistoryTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginTop: 16,
  },
  emptyHistoryText: {
    fontSize: 14,
    opacity: 0.6,
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 20,
    lineHeight: 20,
  },
  emptyHistorySubtext: {
    fontSize: 13,
    opacity: 0.5,
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 30,
  },
  dateGroup: {
    marginBottom: 14,
  },
  dateHeader: {
    fontSize: 13,
    fontWeight: '600',
    opacity: 0.6,
    marginBottom: 6,
  },
  historyItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderRadius: 8,
    marginBottom: 6,
  },
  historyItemLeft: {
    flex: 1,
  },
  historyTestName: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 1,
  },
  historyTime: {
    fontSize: 11,
    opacity: 0.6,
  },
  historyItemRight: {
    alignItems: 'flex-end',
  },
  historyScore: {
    fontSize: 16,
    fontWeight: '700',
  },
  historyAccuracy: {
    fontSize: 10,
    opacity: 0.6,
  },
});