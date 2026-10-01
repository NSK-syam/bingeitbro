import type { CapacitorConfig } from '@capacitor/cli';

// Remote-hosted shell: the native app loads the live site. The web build
// (Next.js on Cloudflare) is unchanged; capacitor-www is only an offline
// fallback page that Capacitor requires as webDir.
const config: CapacitorConfig = {
  appId: 'com.bingeitbro.app',
  appName: 'BingeItBro',
  webDir: 'capacitor-www',
  server: {
    url: 'https://bingeitbro.com',
    cleartext: false,
    errorPath: 'index.html',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2500,
      launchAutoHide: true,
      backgroundColor: '#0A0A0C',
      showSpinner: false,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#0A0A0C',
      overlaysWebView: false,
    },
  },
};

export default config;
