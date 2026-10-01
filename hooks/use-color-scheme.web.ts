import { useEffect, useState } from 'react';

/**
 * Force dark mode on web since GrayMeter targets biohacker/clinical users
 * who expect a dark, data-dense aesthetic. Static rendering starts with light,
 * then hydrates to dark mode.
 */
export function useColorScheme() {
  const [hasHydrated, setHasHydrated] = useState(false);

  useEffect(() => {
    setHasHydrated(true);
  }, []);

  if (hasHydrated) {
    return 'dark';  // Force dark mode on web after hydration
  }

  return 'light';  // Light during SSR to prevent hydration mismatch
}