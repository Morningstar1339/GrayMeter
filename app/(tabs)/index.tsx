import React, { useEffect } from 'react';
import { StyleSheet, TouchableOpacity, ScrollView, Dimensions, Image, View, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useRouter } from 'expo-router';
import { useThemeColor } from '@/hooks/use-theme-color';
import { isDatabaseInitialized } from '@/database/database';

export default function HomeScreen() {
  const router = useRouter();
  const tintColor = useThemeColor({}, 'tint');
  const backgroundColor = useThemeColor({}, 'background');

  useEffect(() => {
    if (Platform.OS === 'web') {
      document.title = 'GrayMeter - Supplement Tracker';
    }
  }, []);

  useEffect(() => {
    // Database should already be initialized by RootLayout
    // Just verify it's ready and log status
    const checkAppStatus = () => {
      const dbReady = isDatabaseInitialized();
      console.log('HomeScreen: Database ready status:', dbReady);
      
      if (!dbReady) {
        console.warn('HomeScreen: Database not ready! This should not happen.');
      }
    };
    
    checkAppStatus();
  }, []);

  const handleLogSupplement = () => {
    router.push('/supplements');
  };

  // DISABLED FOR V1 - Re-enable for Mk II
  // const handleLogSymptom = () => {
  //   router.push('/body-diagram');
  // };

  const handleCognitiveTest = () => {
    router.push('/cognitive-tests');
  };

  const handleActivities = () => {
    router.push('/activities');
  };

  const handleLogSleep = () => {
    router.push('/sleep-logs');
  };

  const handleSchedules = () => {
    router.push('/my-schedules');
  };

  const handleExport = () => {
    router.push('/export');
  };

  const handleInsights = () => {
    router.push('/insights');
  };

  const handleHelp = () => {
    router.push('/help');
  };

  const handleDailyReview = () => {
    router.push('/daily-review');
  };

  return (
    <ThemedView style={styles.container} safeArea>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* DISABLED FOR V1 - Re-enable for Mk II */}
      {/* <SleepTracker /> */}
      <ThemedView style={styles.titleContainer}>
        <View style={[styles.logoContainer, { backgroundColor: backgroundColor }]}>
          <Image 
            source={require('@/assets/images/GrayMeter Logo.jpg')} 
            style={styles.logo}
            resizeMode="contain"
          />
        </View>
        <ThemedText type="title" style={styles.title} accessibilityRole="header">GrayMeter</ThemedText>
        <ThemedText style={styles.tagline}>
          Track your supplements, run cognitive tests, and discover what actually works for your brain.
        </ThemedText>
      </ThemedView>

      <ThemedView style={styles.buttonContainer}>
        <TouchableOpacity style={[styles.mainButton, { backgroundColor: tintColor }]} onPress={handleLogSupplement}>
          <ThemedText type="subtitle" style={[styles.buttonText, { color: backgroundColor }]}>Log Supplement</ThemedText>
        </TouchableOpacity>

        {/* DISABLED FOR V1 - Re-enable for Mk II */}
        {/* <TouchableOpacity style={styles.mainButton} onPress={handleLogSymptom}>
          <ThemedText type="subtitle" style={styles.buttonText}>Log Symptom</ThemedText>
        </TouchableOpacity> */}

        <TouchableOpacity style={[styles.mainButton, { backgroundColor: tintColor }]} onPress={handleCognitiveTest}>
          <ThemedText type="subtitle" style={[styles.buttonText, { color: backgroundColor }]}>Cognitive Test</ThemedText>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.mainButton, { backgroundColor: tintColor }]} onPress={handleActivities}>
          <ThemedText type="subtitle" style={[styles.buttonText, { color: backgroundColor }]}>Log Activity</ThemedText>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.mainButton, { backgroundColor: tintColor }]} onPress={handleLogSleep}>
          <ThemedText type="subtitle" style={[styles.buttonText, { color: backgroundColor }]}>Log Sleep</ThemedText>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.mainButton, { backgroundColor: tintColor }]} onPress={handleDailyReview}>
          <ThemedText type="subtitle" style={[styles.buttonText, { color: backgroundColor }]}>Daily Review</ThemedText>
        </TouchableOpacity>
      </ThemedView>

      <View style={styles.bottomContainer}>
        <TouchableOpacity style={[styles.iconButton, { backgroundColor: tintColor + '15' }]} onPress={handleInsights}>
          <Ionicons name="analytics-outline" size={28} color={tintColor} />
        </TouchableOpacity>

        <TouchableOpacity style={[styles.iconButton, { backgroundColor: tintColor + '15' }]} onPress={handleSchedules}>
          <Ionicons name="calendar-outline" size={28} color={tintColor} />
        </TouchableOpacity>
        
        <TouchableOpacity style={[styles.iconButton, { backgroundColor: tintColor + '15' }]} onPress={handleExport}>
          <Ionicons name="download-outline" size={28} color={tintColor} />
        </TouchableOpacity>
        
        <TouchableOpacity style={[styles.iconButton, { backgroundColor: tintColor + '15' }]} onPress={handleHelp}>
          <Ionicons name="information-circle-outline" size={28} color={tintColor} />
        </TouchableOpacity>
      </View>
      </ScrollView>
    </ThemedView>
  );
}

const { height: screenHeight } = Dimensions.get('window');

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    padding: 20,
    minHeight: screenHeight * 0.9,
  },
  titleContainer: {
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
  },
  tagline: {
    fontSize: 14,
    opacity: 0.7,
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 20,
    lineHeight: 20,
  },
  logoContainer: {
    width: 160,
    height: 160,
    borderRadius: 24,
    overflow: 'hidden',
    marginBottom: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: 150,
    height: 150,
  },
  buttonContainer: {
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 20,
    marginVertical: 16,
  },
  mainButton: {
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: 'center',
    minHeight: 56,
    justifyContent: 'center',
    width: '100%',
  },
  buttonText: {
    fontSize: 20,
    fontWeight: '600',
  },
  bottomContainer: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    marginTop: 20,
    paddingHorizontal: 40,
  },
  iconButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
