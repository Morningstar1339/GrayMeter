// DISABLED FOR V1 - Re-enable for Mk II
// import React, { useEffect, useState } from 'react';
// import AsyncStorage from '@react-native-async-storage/async-storage';
// import { useSleepDetection } from '@/hooks/use-sleep-detection';
//
// interface SleepSettings {
//   bedtimeHour: number;
//   bedtimeMinute: number;
//   bedtimeAmPm: 'AM' | 'PM';
// }
//
// const SETTINGS_KEY = 'sleep_settings';
//
// const defaultSettings: SleepSettings = {
//   bedtimeHour: 10,
//   bedtimeMinute: 0,
//   bedtimeAmPm: 'PM',
// };
//
// export const SleepTracker: React.FC = () => {
//   const [settings, setSettings] = useState<SleepSettings>(defaultSettings);
//   useEffect(() => { loadSettings(); }, []);
//   const loadSettings = async () => {
//     try {
//       const saved = await AsyncStorage.getItem(SETTINGS_KEY);
//       if (saved) { setSettings({ ...defaultSettings, ...JSON.parse(saved) }); }
//     } catch (error) { console.error('Error loading sleep settings:', error); }
//   };
//   useSleepDetection(settings);
//   return null;
// };

import React from 'react';

export const SleepTracker: React.FC = () => {
  return null;
};