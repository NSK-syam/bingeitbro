import type { CapacitorConfig } from '@capacitor/cli';

// Remote-hosted shell: the native app loads the live site. The web build
// (Next.js on Cloudflare) is unchanged; capacitor-www is only an offline
// fallback page that Capacitor requires as webDir.
const config: CapacitorConfig = {
  appId: 'com.bingeitbro.app',
  appName: 'BingeItBro',
  webDir: 'capacitor-www',
  // WebView background while the remote site loads (avoids a white flash after the splash).
  backgroundColor: '#0A0A0C',
  server: {
    url: 'https://bingeitbro.com',
    cleartext: false,
    errorPath: 'index.html',
  },
  plugins: {
    SplashScreen: {
      // Stay up until NativeAppBridge calls SplashScreen.hide() after the page hydrates
      // (cold loads of the live site can take several seconds), capped at 10s.
      launchShowDuration: 10000,
      launchAutoHide: true,
      backgroundColor: '#0A0A0C',
      showSpinner: true,
      iosSpinnerStyle: 'large',
      spinnerColor: '#F59E0B',
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#0A0A0C',
      overlaysWebView: false,
    },
    // iOS foreground presentation: only update the badge (no banner/sound while
    // the app is open, matching Android where FCM doesn't display foreground
    // notifications). The web app gets a 'bib:native-push-received' event instead.
    FirebaseMessaging: {
      presentationOptions: ['badge'],
    },
  },
};

export default config;
