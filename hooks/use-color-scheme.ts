import { useColorScheme as useRNColorScheme } from 'react-native';
import { Platform } from 'react-native';

/**
 * Force dark mode on web since GrayMeter targets biohacker/clinical users
 * who expect a dark, data-dense aesthetic. On native, follow system preference.
 */
export function useColorScheme() {
  const systemScheme = useRNColorScheme();
  if (Platform.OS === 'web') {
    return 'dark';
  }
  return systemScheme;
}
