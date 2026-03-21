import React from 'react';
import { StyleSheet, TouchableOpacity, View, ScrollView } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useRouter } from 'expo-router';
import { useThemeColor } from '@/hooks/use-theme-color';
import { Ionicons } from '@expo/vector-icons';
import { useHierarchicalBack } from '@/hooks/use-hierarchical-back';

export default function AllTestsScreen() {
  useHierarchicalBack('tests/all-nine');
  const router = useRouter();
  const tintColor = useThemeColor({}, 'tint');

  const handleStartSequence = () => {
    router.push('/tests/questionnaire?sequence=all-nine');
  };

  const handleBackToMenu = () => {
    router.push('/cognitive-tests');
  };

  const testSequence = [
    { id: 'questionnaire', name: 'Mood', icon: 'happy-outline', duration: '10s' },
    { id: 'reflexes', name: 'Reflexes', icon: 'flash-outline', duration: '10s' },
    { id: 'memory', name: 'Memory', icon: 'grid-outline', duration: '1m' },
    { id: 'connections', name: 'Route Planner', icon: 'git-network-outline', duration: '30s' },
    { id: 'rock-dodger', name: 'Coordination', icon: 'shield-outline', duration: '30s' },
    { id: 'pattern-matcher', name: 'Pattern', icon: 'shapes-outline', duration: '30s' },
    { id: 'tile-puzzle', name: 'Planning', icon: 'apps-outline', duration: '30s' },
    { id: 'n-back', name: 'N-Back', icon: 'layers-outline', duration: '1m' },
    { id: 'stroop', name: 'Coherence', icon: 'color-palette-outline', duration: '30s' },
  ];

  return (
    <ThemedView style={styles.container} safeArea>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <ThemedView style={[styles.infoBanner, { borderColor: tintColor }]}>
          <TouchableOpacity
            style={styles.bannerBackButton}
            onPress={handleBackToMenu}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel="Back to menu"
            testID="btn-all-nine-back"
          >
            <Ionicons name="arrow-back" size={20} color={tintColor} />
          </TouchableOpacity>
          <View style={styles.bannerContent}>
            <ThemedText style={styles.bannerTitle}>All 9 Tests</ThemedText>
            <ThemedText style={styles.bannerSubtitle}>~5 min total</ThemedText>
          </View>
        </ThemedView>

        <ThemedView style={styles.content}>
          <View style={styles.sequenceContainer}>
            {testSequence.map((test, index) => (
              <View key={test.id} style={styles.testRow}>
                <ThemedText style={[styles.testNumber, { color: tintColor }]}>{index + 1}.</ThemedText>
                <Ionicons name={test.icon as any} size={18} color={tintColor} style={styles.testIcon} />
                <ThemedText style={styles.testName}>{test.name}</ThemedText>
                <ThemedText style={styles.testDuration}>{test.duration}</ThemedText>
              </View>
            ))}
          </View>

          <TouchableOpacity
            style={[styles.startButton, { backgroundColor: tintColor }]}
            onPress={handleStartSequence}
            accessibilityRole="button"
            accessibilityLabel="Start full test battery"
            testID="btn-all-nine-start"
          >
            <ThemedText style={styles.startButtonText}>Start Full Test Battery</ThemedText>
          </TouchableOpacity>

          <TouchableOpacity style={styles.backButton} onPress={handleBackToMenu} accessibilityRole="button" accessibilityLabel="Back to menu" testID="btn-all-nine-back-menu">
            <ThemedText style={styles.backButtonText}>Back to Menu</ThemedText>
          </TouchableOpacity>
        </ThemedView>
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
    paddingTop: 16,
    paddingBottom: 40,
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    marginBottom: 16,
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
  bannerContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  bannerTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  bannerSubtitle: {
    fontSize: 14,
    opacity: 0.6,
  },
  content: {
    paddingHorizontal: 20,
  },
  sequenceContainer: {
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  testRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  testNumber: {
    fontSize: 14,
    fontWeight: '600',
    width: 24,
  },
  testIcon: {
    marginRight: 10,
  },
  testName: {
    fontSize: 15,
    fontWeight: '500',
    flex: 1,
  },
  testDuration: {
    fontSize: 13,
    opacity: 0.5,
  },
  startButton: {
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 16,
    minHeight: 48,
    width: '100%',
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
    minHeight: 44,
  },
  backButtonText: {
    fontSize: 16,
    opacity: 0.7,
  },
});
