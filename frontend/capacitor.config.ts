import type { CapacitorConfig } from '@capacitor/cli';

// The Learners Academy mobile app. Marlbridge will get its own app (own ID,
// name and native folders) alongside this one later.
// appId is permanent once the app is published on the stores.
const config: CapacitorConfig = {
  appId: 'pk.com.learnersacademy.portal',
  appName: 'Learners Academy',
  webDir: 'dist-app-la',
  android: { path: 'mobile/la/android' },
  ios: { path: 'mobile/la/ios' },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1000,
      backgroundColor: '#ffffff',
    },
  },
};

export default config;
