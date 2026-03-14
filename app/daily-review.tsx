import React, { useState } from 'react';
import { StyleSheet, TouchableOpacity, View, ScrollView, Alert } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useRouter } from 'expo-router';
import { useThemeColor } from '@/hooks/use-theme-color';
import { Ionicons } from '@expo/vector-icons';
import { useHierarchicalBack } from '@/hooks/use-hierarchical-back';
import { saveDailyReview } from '@/database/daily-review';

const SOCIAL_CATEGORIES = ['Incidental', 'Friendly', 'Flirtatious', 'Familial'];

const PRODUCTIVITY_CATEGORIES = ['Work', 'School', 'Chores'];

const NEWS_OPTIONS = ['Concerning', 'Relieving', 'Exciting', 'Depressing'];


interface DailyReviewData {
  socialDid: string[];
  socialWished: string[];
  socialRatings: Record<string, number>;
  productivityDid: string[];
  productivityWished: string[];
  productivityRatings: Record<string, number>;
  wellness: number | null;
  newsTypes: string[];
}

export default function DailyReviewScreen() {
  const router = useRouter();
  const tintColor = useThemeColor({}, 'tint');
  
  useHierarchicalBack('daily-review');
  
  const [isSaved, setIsSaved] = useState(false);
  const [data, setData] = useState<DailyReviewData>({
    socialDid: [],
    socialWished: [],
    socialRatings: {},
    productivityDid: [],
    productivityWished: [],
    productivityRatings: {},
    wellness: null,
    newsTypes: [],
  });

  const toggleSocialDid = (category: string) => {
    setData(prev => {
      const newDid = prev.socialDid.includes(category)
        ? prev.socialDid.filter(c => c !== category)
        : [...prev.socialDid, category];
      
      const newRatings = { ...prev.socialRatings };
      if (!newDid.includes(category)) {
        delete newRatings[category];
      }
      
      return { ...prev, socialDid: newDid, socialRatings: newRatings };
    });
  };

  const setWellnessRating = (rating: number) => {
    setData(prev => ({ ...prev, wellness: rating }));
  };

  const toggleSocialWished = (category: string) => {
    setData(prev => ({
      ...prev,
      socialWished: prev.socialWished.includes(category)
        ? prev.socialWished.filter(c => c !== category)
        : [...prev.socialWished, category],
    }));
  };

  const setSocialRating = (category: string, rating: number) => {
    setData(prev => ({
      ...prev,
      socialRatings: { ...prev.socialRatings, [category]: rating },
    }));
  };

  const toggleProductivityDid = (category: string) => {
    setData(prev => {
      const newDid = prev.productivityDid.includes(category)
        ? prev.productivityDid.filter(c => c !== category)
        : [...prev.productivityDid, category];
      
      const newRatings = { ...prev.productivityRatings };
      if (!newDid.includes(category)) {
        delete newRatings[category];
      }
      
      return { ...prev, productivityDid: newDid, productivityRatings: newRatings };
    });
  };

  const setProductivityRating = (category: string, rating: number) => {
    setData(prev => ({
      ...prev,
      productivityRatings: { ...prev.productivityRatings, [category]: rating },
    }));
  };


  const toggleNewsType = (newsType: string) => {
    setData(prev => ({
      ...prev,
      newsTypes: prev.newsTypes.includes(newsType)
        ? prev.newsTypes.filter(t => t !== newsType)
        : [...prev.newsTypes, newsType],
    }));
  };

  const handleSave = async () => {
    try {
      const dataToSave = {
        ...data,
        wellness: data.wellness !== null ? String(data.wellness) : null,
      };
      await saveDailyReview(dataToSave);
      setIsSaved(true);
      setTimeout(() => {
        router.back();
      }, 1500);
    } catch (error) {
      console.error('Failed to save daily review:', error);
      Alert.alert('Error', 'Failed to save daily review');
    }
  };

  const renderCheckbox = (checked: boolean, label: string, onPress: () => void) => (
    <TouchableOpacity style={styles.checkboxRow} onPress={onPress}>
      <Ionicons
        name={checked ? 'checkbox' : 'square-outline'}
        size={24}
        color={tintColor}
      />
      <View style={styles.checkboxTextContainer}>
        <ThemedText style={styles.checkboxLabel}>{label}</ThemedText>
      </View>
    </TouchableOpacity>
  );

  const renderRating = (category: string, currentRating: number | undefined, onRate: (rating: number) => void) => (
    <View style={styles.ratingRow}>
      <ThemedText style={styles.ratingLabel}>{category}</ThemedText>
      <View style={styles.ratingButtonsRow}>
        {[1, 2, 3, 4, 5].map(rating => (
          <TouchableOpacity
            key={rating}
            style={[
              styles.ratingButton,
              { borderColor: tintColor },
              currentRating === rating && { backgroundColor: tintColor },
            ]}
            onPress={() => onRate(rating)}
          >
            <ThemedText
              style={[
                styles.ratingText,
                { color: tintColor },
                currentRating === rating && styles.ratingTextActive,
              ]}
            >
              {rating}
            </ThemedText>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  const renderWellnessRating = (currentRating: number | null, onRate: (rating: number) => void, lowLabel: string, highLabel: string) => (
    <View style={styles.ratingRow}>
      <View style={styles.ratingLabelsRow}>
        <ThemedText style={styles.ratingEndLabel}>{lowLabel}</ThemedText>
        <ThemedText style={styles.ratingEndLabel}>{highLabel}</ThemedText>
      </View>
      <View style={styles.ratingButtonsRow}>
        {[1, 2, 3, 4, 5].map(rating => (
          <TouchableOpacity
            key={rating}
            style={[
              styles.ratingButton,
              { borderColor: tintColor },
              currentRating === rating && { backgroundColor: tintColor },
            ]}
            onPress={() => onRate(rating)}
          >
            <ThemedText
              style={[
                styles.ratingText,
                { color: tintColor },
                currentRating === rating && styles.ratingTextActive,
              ]}
            >
              {rating}
            </ThemedText>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );


  if (isSaved) {
    return (
      <ThemedView style={styles.container} safeArea>
        <View style={styles.successContent}>
          <Ionicons name="checkmark-circle" size={80} color="#34C759" />
          <ThemedText style={styles.successText}>
            Daily review has been logged.
          </ThemedText>
        </View>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container} safeArea>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="chevron-back" size={28} color={tintColor} />
        </TouchableOpacity>
        <ThemedText type="title" style={styles.title}>Daily Review</ThemedText>
        <View style={styles.headerPlaceholder} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.section}>
          <ThemedText type="subtitle" style={styles.sectionTitle}>Socialization</ThemedText>
          
          <ThemedText style={styles.questionLabel}>What sort of social interactions did you have today?</ThemedText>
          {SOCIAL_CATEGORIES.map(category => (
            <View key={category}>
              {renderCheckbox(
                data.socialDid.includes(category),
                category,
                () => toggleSocialDid(category)
              )}
            </View>
          ))}

          <ThemedText style={[styles.questionLabel, styles.marginTop]}>
            Which kind of socializing do you wish you had more of today?
          </ThemedText>
          {SOCIAL_CATEGORIES.map(category => (
            <View key={category}>
              {renderCheckbox(
                data.socialWished.includes(category),
                category,
                () => toggleSocialWished(category)
              )}
            </View>
          ))}

          {data.socialDid.length > 0 && (
            <>
              <ThemedText style={[styles.questionLabel, styles.marginTop]}>
                How well did you socialize today for each category?
              </ThemedText>
              <View style={styles.ratingLabelsRow}>
                <ThemedText style={styles.ratingEndLabelSmall}>Very poorly</ThemedText>
                <ThemedText style={styles.ratingEndLabelSmall}>Very well</ThemedText>
              </View>
              {data.socialDid.map(category =>
                renderRating(category, data.socialRatings[category], (rating) => setSocialRating(category, rating))
              )}
            </>
          )}
        </View>

        <View style={styles.section}>
          <ThemedText type="subtitle" style={styles.sectionTitle}>Productivity</ThemedText>
          
          <ThemedText style={styles.questionLabel}>What did you have planned today?</ThemedText>
          {PRODUCTIVITY_CATEGORIES.map(category => (
            <View key={category}>
              {renderCheckbox(
                data.productivityDid.includes(category),
                category,
                () => toggleProductivityDid(category)
              )}
            </View>
          ))}

          {data.productivityDid.length > 0 && (
            <>
              <ThemedText style={[styles.questionLabel, styles.marginTop]}>
                How well did you do?
              </ThemedText>
              <View style={styles.ratingLabelsRow}>
                <ThemedText style={styles.ratingEndLabelSmall}>Very poorly</ThemedText>
                <ThemedText style={styles.ratingEndLabelSmall}>Very well</ThemedText>
              </View>
              {data.productivityDid.map(category =>
                renderRating(category, data.productivityRatings[category], (rating) => setProductivityRating(category, rating))
              )}
            </>
          )}
        </View>

        <View style={styles.section}>
          <ThemedText type="subtitle" style={styles.sectionTitle}>Wellness</ThemedText>
          <ThemedText style={styles.questionLabel}>How is your physical wellness?</ThemedText>
          {renderWellnessRating(data.wellness, setWellnessRating, 'Very sick', 'Very well')}
        </View>

        <View style={styles.section}>
          <ThemedText type="subtitle" style={styles.sectionTitle}>News</ThemedText>
          <ThemedText style={styles.questionLabel}>
            Did you receive any news today that was personally...
          </ThemedText>
          {NEWS_OPTIONS.map(option => (
            <View key={option}>
              {renderCheckbox(
                data.newsTypes.includes(option),
                option,
                () => toggleNewsType(option)
              )}
            </View>
          ))}
        </View>

        <TouchableOpacity
          style={[styles.saveButton, { backgroundColor: tintColor }]}
          onPress={handleSave}
        >
          <ThemedText style={styles.saveButtonText}>Save Review</ThemedText>
        </TouchableOpacity>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  backButton: {
    padding: 4,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    flex: 1,
    marginLeft: 8,
  },
  headerPlaceholder: {
    width: 32,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 16,
  },
  questionLabel: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 12,
    opacity: 0.8,
  },
  marginTop: {
    marginTop: 20,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 12,
  },
  checkboxTextContainer: {
    flex: 1,
  },
  checkboxLabel: {
    fontSize: 16,
  },
  checkboxDescription: {
    fontSize: 13,
    opacity: 0.6,
    marginTop: 2,
  },
  ratingRow: {
    marginBottom: 16,
  },
  ratingLabel: {
    fontSize: 15,
    fontWeight: '500',
    marginBottom: 10,
  },
  ratingButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  ratingEndLabel: {
    fontSize: 12,
    opacity: 0.6,
  },
  ratingLabelsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  ratingButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ratingText: {
    fontSize: 16,
    fontWeight: '600',
  },
  ratingTextActive: {
    color: 'white',
  },
  saveButton: {
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 20,
  },
  saveButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '600',
  },
  successContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    paddingBottom: 100,
  },
  successText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#34C759',
    textAlign: 'center',
    marginTop: 20,
  },
});
