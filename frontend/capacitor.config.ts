import type { CapacitorConfig } from '@capacitor/cli';

// The mobile app for all three schools (Senior Campus, Junior Campus, Marlbridge);
// the school is picked on the app's home screen (src/appCampus.ts).
// appId is permanent once the app is published on the stores.
const config: CapacitorConfig = {
  appId: 'pk.com.learnersacademy.portal',
  appName: 'Learners Portal',
  webDir: 'dist-app-la',
  // Pinch-to-zoom is off by default in Capacitor; wide tables and PDFs need it.
  zoomEnabled: true,
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
