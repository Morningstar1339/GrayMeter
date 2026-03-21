import { useColorScheme as useSystemColorScheme } from 'react-native';
import { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const THEME_STORAGE_KEY = 'user_theme_preference';

export type ColorSchemeName = 'light' | 'dark';

/**
 * Custom hook that defaults to dark mode but allows user override
 * Unlike system useColorScheme, this defaults to 'dark' regardless of system preference
 */
export function useColorScheme(): ColorSchemeName {
  const systemColorScheme = useSystemColorScheme();
  const [userPreference, setUserPreference] = useState<ColorSchemeName | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    // Load user preference on mount
    const loadUserPreference = async () => {
      try {
        const stored = await AsyncStorage.getItem(THEME_STORAGE_KEY);
        if (stored === 'light' || stored === 'dark') {
          setUserPreference(stored);
        }
      } catch (error) {
        console.warn('Failed to load theme preference:', error);
      } finally {
        setIsLoaded(true);
      }
    };
    
    loadUserPreference();
  }, []);

  // If we haven't loaded preference yet, default to dark
  if (!isLoaded) {
    return 'dark';
  }

  // If user has explicit preference, use that
  if (userPreference) {
    return userPreference;
  }

  // Otherwise default to dark (manifesto requirement)
  return 'dark';
}

/**
 * Function to set user's explicit theme preference
 * This allows users to override the dark default if they want
 */
export async function setColorSchemePreference(scheme: ColorSchemeName | null): Promise<void> {
  try {
    if (scheme) {
      await AsyncStorage.setItem(THEME_STORAGE_KEY, scheme);
    } else {
      await AsyncStorage.removeItem(THEME_STORAGE_KEY);
    }
  } catch (error) {
    console.warn('Failed to save theme preference:', error);
  }
}
