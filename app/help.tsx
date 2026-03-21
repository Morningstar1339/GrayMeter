import React from 'react';
import { StyleSheet, TouchableOpacity, ScrollView, View, Linking } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useHierarchicalBack } from '@/hooks/use-hierarchical-back';

export default function HelpScreen() {
  useHierarchicalBack('help');
  const router = useRouter();
  const tintColor = useThemeColor({}, 'tint');

  const handleHomePress = () => {
    router.push('/');
  };

  const sections = [
    {
      title: 'Cognitive Tests',
      icon: 'flash-outline',
      content: [
        'Nine different tests measure various cognitive abilities:',
        '• Reflexes: Tap targets as fast as possible',
        '• Memory: Match card pairs',
        '• Connections: Connect dots as a tree',
        '• N-Back: Remember sequences',
        '• Deduction: Match a hidden pattern',
        '• Planning: Unscramble a sliding tile puzzle',
        '• Coordination: Avoid obstacles',
        '• Coherence: Challenge both hemispheres of your brain',
        '• Questionnaire/Mood: Log your mood throughout the day',
        'Run "All 9" to complete the full test battery at once.',
      ],
    },
    {
      title: 'Supplement Logging',
      icon: 'medical-outline',
      content: [
        '• Add supplements with default dosages',
        '• Tap a supplement to log it instantly',
        '• View history and edit recent entries',
        '• Set up reminders for consistent dosing',
        '• Create warnings to avoid overconsumption',
      ],
    },
    {
      title: 'Activities',
      icon: 'fitness-outline',
      content: [
        '• Track activities throughout the day',
        '• Add custom units (miles run, minutes meditated, etc.)',
        '• See how activities affect cognitive performance and sleep',
      ],
    },
    {
      title: 'Sleep Tracking',
      icon: 'moon-outline',
      content: [
        '• Log sleep duration',
        '• See how supplements and activities affect sleep',
        '• See how sleep affects cognitive performance',
      ],
    },
    {
      title: 'Daily Review',
      icon: 'clipboard-outline',
      content: [
        '• End-of-day check-in with customizable summary',
      ],
    },
    {
      title: 'Correlation Analysis',
      icon: 'analytics-outline',
      content: [
        'The Insights page analyzes your data to find patterns:',
        '• Compares test scores when you took supplements vs. when you didn\'t',
        '• Identifies which activities help or hurt cognition',
        '• Requires sufficient data (multiple tests over days/weeks) for meaningful results',
      ],
    },
    {
      title: 'Data Export',
      icon: 'download-outline',
      content: [
        '• Export all data as CSV for external analysis',
        '• Your data stays on your device - no cloud sync needed',
      ],
    },
  ];

  return (
    <ThemedView style={styles.container} safeArea>
      <ThemedView style={styles.header}>
        <TouchableOpacity
          style={styles.homeButton}
          onPress={handleHomePress}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel="Go home"
          testID="btn-help-home"
        >
          <Ionicons name="home-outline" size={24} color={tintColor} />
        </TouchableOpacity>
        <ThemedText type="title" style={styles.title}>
          About GrayMeter
        </ThemedText>
        <View style={styles.headerPlaceholder} />
      </ThemedView>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <ThemedView style={styles.intro}>
          <ThemedText style={styles.introText}>
            GrayMeter helps you track your cognitive performance over time and identify what affects it. Log supplements, sleep, and activities, then run cognitive tests to discover correlations.
          </ThemedText>
        </ThemedView>

        {sections.map((section, index) => (
          <ThemedView key={index} style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name={section.icon as any} size={24} color={tintColor} />
              <ThemedText type="subtitle" style={styles.sectionTitle}>
                {section.title}
              </ThemedText>
            </View>
            
            {section.content.map((paragraph, pIndex) => (
              <ThemedText key={pIndex} style={styles.sectionContent}>
                {paragraph}
              </ThemedText>
            ))}
          </ThemedView>
        ))}

        <ThemedView style={styles.disclaimer}>
          <View style={styles.disclaimerHeader}>
            <Ionicons name="warning" size={20} color="#8B6914" />
            <ThemedText style={styles.disclaimerTitle}>Important Disclaimer</ThemedText>
          </View>
          <ThemedText style={styles.disclaimerText}>
            This app cannot evaluate any substance's safety. It is the user's responsibility to use supplements and pharmaceuticals responsibly. Consult a physician before experimenting with new supplements or pharmaceuticals.
          </ThemedText>
        </ThemedView>

        <ThemedView style={styles.footer}>
          <View style={styles.versionInfo}>
            <ThemedText style={styles.versionText}>Track. Test. Discover.</ThemedText>
            <ThemedText style={styles.versionText}>GrayMeter v1.0 Copyright 2025 Steelman Inc.</ThemedText>
            <TouchableOpacity
              onPress={() => Linking.openURL('mailto:info@steelmannet.com')}
              accessibilityRole="link"
              accessibilityLabel="Send email to support"
              testID="link-email-support"
            >
              <ThemedText style={[styles.versionText, { color: tintColor, textDecorationLine: 'underline' }]}>Click here to send us an email</ThemedText>
            </TouchableOpacity>
          </View>
        </ThemedView>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 12,
    marginBottom: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    flex: 1,
    textAlign: 'center',
  },
  homeButton: {
    padding: 8,
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerPlaceholder: {
    width: 40,
    height: 40,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  disclaimer: {
    marginBottom: 20,
    padding: 16,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 193, 7, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255, 193, 7, 0.4)',
  },
  disclaimerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  disclaimerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#8B6914',
  },
  disclaimerText: {
    fontSize: 14,
    lineHeight: 20,
    color: '#6B5310',
  },
  intro: {
    marginBottom: 30,
    padding: 20,
    borderRadius: 12,
    backgroundColor: 'rgba(0, 122, 255, 0.1)',
  },
  introText: {
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
  },
  section: {
    marginBottom: 25,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 10,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  sectionContent: {
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 8,
    marginLeft: 34, // Align with icon
  },
  footer: {
    marginTop: 30,
    marginBottom: 40,
    padding: 20,
    borderRadius: 12,
    backgroundColor: 'rgba(142, 142, 147, 0.1)',
    alignItems: 'center',
  },
  footerText: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    opacity: 0.8,
    marginBottom: 15,
  },
  versionInfo: {
    alignItems: 'center',
    gap: 4,
  },
  versionText: {
    fontSize: 12,
    opacity: 0.6,
  },
});
