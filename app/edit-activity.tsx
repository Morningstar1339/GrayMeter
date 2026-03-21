import React, { useState, useRef } from 'react';
import { StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, View, KeyboardAvoidingView, Platform } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { updateActivity, deleteActivity } from '@/database/activities';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useHierarchicalBack } from '@/hooks/use-hierarchical-back';

const AVAILABLE_ICONS = [
  'fitness', 'walk', 'bicycle', 'barbell', 'basketball', 'football',
  'tennisball', 'golf', 'boat', 'trail-sign', 'bonfire', 'water',
  'leaf', 'rose', 'flower', 'sunny', 'moon', 'cloudy',
  'book', 'musical-notes', 'brush', 'color-palette', 'camera', 'game-controller',
  'bed', 'cafe', 'restaurant', 'wine', 'beer', 'pizza',
  'car', 'airplane', 'train', 'bus', 'subway', 'walk-outline',
  'timer', 'stopwatch', 'speedometer', 'pulse', 'heart', 'medkit'
];

const DEFAULT_COLORS = [
  '#34C759', '#007AFF', '#FF3B30', '#FF9500', '#FFCC00', '#5AC8FA',
  '#AF52DE', '#FF2D92', '#8E8E93', '#5856D6', '#FF6B6B', '#4ECDC4',
  '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F'
];

const getContrastingTextColor = (backgroundColor: string): string => {
  const hex = backgroundColor.replace('#', '');
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? '#000000' : '#FFFFFF';
};

export default function EditActivityScreen() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const tintColor = useThemeColor({}, 'tint');
  const textColor = useThemeColor({}, 'text');
  const scrollViewRef = useRef<ScrollView>(null);
  
  useHierarchicalBack('edit-activity');

  const [name, setName] = useState((params.name as string) || '');
  const [defaultValue, setDefaultValue] = useState((params.default_value as string) || '');
  const [unit, setUnit] = useState((params.unit as string) || '');
  const [selectedIcon, setSelectedIcon] = useState((params.icon_id as string) || 'fitness');
  const [selectedColor, setSelectedColor] = useState((params.color as string) || DEFAULT_COLORS[0]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const activityId = Number(params.id);

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Please enter an activity name');
      return;
    }

    if (!defaultValue.trim() || isNaN(Number(defaultValue)) || Number(defaultValue) <= 0) {
      Alert.alert('Error', 'Please enter a valid default value');
      return;
    }

    if (!unit.trim()) {
      Alert.alert('Error', 'Please enter a unit');
      return;
    }

    setIsSubmitting(true);
    try {
      await updateActivity({
        id: activityId,
        name: name.trim(),
        default_value: Number(defaultValue),
        unit: unit.trim(),
        icon_id: selectedIcon,
        color: selectedColor
      });

      router.back();
    } catch (error) {
      console.error('Failed to update activity:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      Alert.alert('Error', `Failed to update activity: ${errorMessage}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete Activity',
      `Are you sure you want to delete "${name}"? This will also delete all log entries for this activity.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteActivity(activityId);
              router.back();
            } catch (error) {
              console.error('Failed to delete activity:', error);
              Alert.alert('Error', 'Failed to delete activity');
            }
          }
        }
      ]
    );
  };

  const handleCancel = () => {
    router.back();
  };

  return (
    <ThemedView style={styles.container} safeArea>
      <KeyboardAvoidingView 
        style={{ flex: 1 }} 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
      <ThemedView style={styles.header}>
        <TouchableOpacity onPress={handleCancel} style={styles.cancelButton} accessibilityRole="button" accessibilityLabel="Cancel" testID="btn-edit-activity-cancel">
          <ThemedText style={styles.cancelText}>Cancel</ThemedText>
        </TouchableOpacity>
        <ThemedText type="title" style={styles.title}>Edit Activity</ThemedText>
        <TouchableOpacity
          onPress={handleSave}
          style={[styles.saveButton, { backgroundColor: tintColor }]}
          disabled={isSubmitting}
          accessibilityRole="button"
          accessibilityLabel="Save activity"
          testID="btn-edit-activity-save"
        >
          <ThemedText style={styles.saveText}>Save</ThemedText>
        </TouchableOpacity>
      </ThemedView>

      <ScrollView ref={scrollViewRef} style={styles.content} showsVerticalScrollIndicator={false}>
        <ThemedView style={styles.section}>
          <ThemedText style={styles.label}>Name</ThemedText>
          <TextInput
            style={[styles.input, { borderColor: tintColor + '30', color: textColor }]}
            value={name}
            onChangeText={setName}
            placeholder="Activity name"
            placeholderTextColor="#8E8E93"
            autoCapitalize="words"
            maxLength={50}
            accessibilityLabel="Activity name"
            testID="input-edit-activity-name"
          />
        </ThemedView>

        <ThemedView style={styles.section}>
          <ThemedText style={styles.label}>Default Value</ThemedText>
          <View style={styles.valueContainer}>
            <TextInput
              style={[styles.valueInput, { borderColor: tintColor + '30', color: textColor }]}
              value={defaultValue}
              onChangeText={setDefaultValue}
              placeholder="Amount"
              placeholderTextColor="#8E8E93"
              keyboardType="numeric"
              maxLength={10}
              accessibilityLabel="Default value"
              testID="input-edit-activity-default-value"
            />
            <TextInput
              style={[styles.unitInput, { borderColor: tintColor + '30', color: textColor }]}
              value={unit}
              onChangeText={setUnit}
              placeholder="Unit"
              placeholderTextColor="#8E8E93"
              autoCapitalize="none"
              maxLength={20}
              accessibilityLabel="Activity unit"
              testID="input-edit-activity-unit"
            />
          </View>
        </ThemedView>

        <ThemedView style={styles.section}>
          <ThemedText style={styles.label}>Icon</ThemedText>
          <View style={styles.iconGrid}>
            {AVAILABLE_ICONS.map((icon) => (
              <TouchableOpacity
                key={icon}
                style={[
                  styles.iconButton,
                  selectedIcon === icon && { backgroundColor: selectedColor }
                ]}
                onPress={() => setSelectedIcon(icon)}
                accessibilityRole="button"
                accessibilityLabel={`Select ${icon} icon`}
                testID={`btn-activity-icon-${icon}`}
              >
                <Ionicons 
                  name={icon as any} 
                  size={24} 
                  color={selectedIcon === icon ? getContrastingTextColor(selectedColor) : tintColor} 
                />
              </TouchableOpacity>
            ))}
          </View>
        </ThemedView>

        <ThemedView style={styles.section}>
          <ThemedText style={styles.label}>Color</ThemedText>
          <View style={styles.colorGrid}>
            {DEFAULT_COLORS.map((color) => (
              <TouchableOpacity
                key={color}
                style={[
                  styles.colorButton,
                  { backgroundColor: color },
                  selectedColor === color && styles.selectedColorButton
                ]}
                onPress={() => setSelectedColor(color)}
                accessibilityRole="button"
                accessibilityLabel={`Select color ${color}`}
                testID={`btn-activity-color-${color.replace('#','')}`}
              >
                {selectedColor === color && (
                  <Ionicons name="checkmark" size={18} color={getContrastingTextColor(color)} />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </ThemedView>

        <View style={styles.previewSection}>
          <ThemedText style={styles.label}>Preview</ThemedText>
          <View style={[styles.previewCard, { backgroundColor: selectedColor }]}>
            <Ionicons 
              name={selectedIcon as any} 
              size={28} 
              color={getContrastingTextColor(selectedColor)} 
            />
            <View style={styles.previewText}>
              <ThemedText style={[styles.previewName, { color: getContrastingTextColor(selectedColor) }]}>
                {name || 'Activity Name'}
              </ThemedText>
              <ThemedText style={[styles.previewValue, { color: getContrastingTextColor(selectedColor), opacity: 0.8 }]}>
                {defaultValue || '0'} {unit || 'unit'}
              </ThemedText>
            </View>
          </View>
        </View>

        <TouchableOpacity style={styles.deleteButton} onPress={handleDelete} accessibilityRole="button" accessibilityLabel="Delete activity" testID="btn-delete-activity">
          <Ionicons name="trash-outline" size={20} color="#FF3B30" />
          <ThemedText style={styles.deleteText}>Delete Activity</ThemedText>
        </TouchableOpacity>

        <View style={{ height: 100 }} />
      </ScrollView>
      </KeyboardAvoidingView>
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
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  cancelButton: {
    padding: 8,
  },
  cancelText: {
    fontSize: 16,
    color: '#8E8E93',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
  },
  saveButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  saveText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  section: {
    marginBottom: 24,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
    color: '#8E8E93',
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
  },
  valueContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  valueInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
  },
  unitInput: {
    flex: 2,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
  },
  iconGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  iconButton: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(128, 128, 128, 0.1)',
  },
  colorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  colorButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedColorButton: {
    borderWidth: 3,
    borderColor: 'white',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  previewSection: {
    marginBottom: 24,
  },
  previewCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    gap: 12,
  },
  previewText: {
    flex: 1,
  },
  previewName: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 4,
  },
  previewValue: {
    fontSize: 14,
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
    marginTop: 20,
  },
  deleteText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FF3B30',
  },
});
