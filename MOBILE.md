# BingeItBro mobile apps (Capacitor, phase 1)

The iOS and Android apps are a thin native shell around the live site. `capacitor.config.ts`
points `server.url` at `https://bingeitbro.com`, so the app always loads production and every
web deploy updates the app automatically. The Next.js / Cloudflare build is unchanged.
`capacitor-www/` holds only an offline fallback page that Capacitor needs as `webDir`.

- App ID: `com.bingeitbro.app`
- App name: `BingeItBro`
- Deep link scheme: `com.bingeitbro.app` (OAuth return URL: `com.bingeitbro.app://auth/callback`)

> **The app runs whatever is deployed at bingeitbro.com.** The native Google sign-in, status
> bar, splash and back button handling all live in web code (`src/lib/native-app.ts`,
> `src/components/NativeAppBridge.tsx`). They only take effect in the app after this branch is
> deployed to production. Until then the app opens, but Google sign-in still shows the
> "blocked in in-app browsers" message.

## Prerequisites

Capacitor 8 requirements ([upgrade guide](https://capacitorjs.com/docs/updating/8-0)):

- Node 22+ (required by `@capacitor/cli`) and `npm ci` in the repo root
- iOS: macOS with Xcode 26.0+. The app targets iOS 15+ and uses Swift Package Manager, so
  CocoaPods is not needed.
- Android: Android Studio Otter (2025.2.1) or newer, Android SDK Platform 36 (compile/target SDK
  36, min SDK 24), and JDK 21 for command-line Gradle builds (Android Studio bundles one)

## Run on iOS

```bash
npm ci
npx cap sync ios        # copies config + plugins into ios/
npx cap open ios        # opens ios/App in Xcode
```

In Xcode:
1. Select the **App** target → **Signing & Capabilities** → pick your Team. Bundle ID is
   `com.bingeitbro.app`.
2. Pick a simulator or a connected iPhone and press **Run** (⌘R).

## Run on Android

```bash
npm ci
npx cap sync android    # copies config + plugins into android/
npx cap open android    # opens android/ in Android Studio
```

In Android Studio wait for Gradle sync, then pick an emulator or device and press **Run**.
From the command line: `cd android && ./gradlew assembleDebug` (APK in
`android/app/build/outputs/apk/debug/`).

To test against a local dev server instead of production, temporarily change `server.url` in
`capacitor.config.ts` to your machine's LAN address (for example `http://192.168.1.20:3000`, and
set `cleartext: true`), run `npx cap sync`, and **do not commit that change**.

## How Google sign-in works in the app

Google blocks OAuth inside embedded WebViews (`disallowed_useragent`), so the app does not use
the web redirect flow:

1. `AuthProvider.signInWithGoogle` detects the app with `Capacitor.isNativePlatform()`.
2. It calls `supabase.auth.signInWithOAuth` with `redirectTo: com.bingeitbro.app://auth/callback`
   and `skipBrowserRedirect: true`. Supabase stores the PKCE verifier in the WebView.
3. The OAuth URL opens in the system browser (`@capacitor/browser`: SFSafariViewController on
   iOS, Chrome Custom Tabs on Android).
4. After Google, Supabase redirects to `com.bingeitbro.app://auth/callback?code=…`. The OS hands
   that URL to the app (`Info.plist` URL type on iOS, intent filter on Android).
5. `NativeAppBridge` receives it through `App.addListener('appUrlOpen')` (or `App.getLaunchUrl()`
   if the OS had killed the app), closes the browser, and calls
   `supabase.auth.exchangeCodeForSession(code)` in the WebView.

Each callback URL is handled once. Auth codes are single-use, and handled URLs are remembered in
`sessionStorage`. If the exchange fails (for example, on a network error), the app shows the
existing `/auth/callback` error screen and the user taps "Continue with Google" again.

The web flow (`redirectTo: https://bingeitbro.com/auth/callback`) is unchanged.

## Manual settings you must add (I did not change any of these)

### Supabase dashboard

Project `lixovgnusjbooxskigmd` → **Authentication → URL Configuration → Redirect URLs** → add:

```
com.bingeitbro.app://auth/callback
```

Leave **Site URL** as `https://bingeitbro.com` and keep the existing web redirect URLs
(`https://bingeitbro.com/auth/callback`, `https://bingeitbro.com/**`). If the native URL is
missing from the allow list, Supabase falls back to the Site URL and the user lands on the
website in the system browser instead of returning to the app.

### Google Cloud console

**No change is needed for phase 1.** The app uses the same Supabase-hosted OAuth flow as the
website, with the existing **Web application** OAuth client. Google only ever redirects to
Supabase, and that redirect URI should already be listed:

- APIs & Services → Credentials → your Web OAuth client → **Authorized redirect URIs**:
  `https://lixovgnusjbooxskigmd.supabase.co/auth/v1/callback` (already present if web sign-in works)
- **Authorized JavaScript origins**: `https://bingeitbro.com` (already present)

Do not create iOS or Android OAuth client IDs for this flow. Those are only needed if we later
switch to native Google Sign-In SDKs (`signInWithIdToken`).

Before App Store / Play review, check that the **OAuth consent screen** is published
("In production"), not in "Testing". Otherwise only test users can sign in.

## Native polish included

| Feature | Where |
| --- | --- |
| Status bar: light text on `#0A0A0C` | `capacitor.config.ts` (`StatusBar`) + `NativeAppBridge` |
| Splash screen: icon on `#0A0A0C`, hidden once the page mounts (auto-hides after 2.5s anyway) | `capacitor.config.ts` (`SplashScreen`), `assets/` |
| App icon from `public/bib-icon.svg` | sources in `assets/`, generated into `ios/` and `android/` |
| Android back button: navigate back, exit at the root | `NativeAppBridge` |
| No web push / service worker in the app | `src/lib/push.ts` (guarded by `isNativeApp()`) |

### Regenerating icons and splash

Sources live in `assets/` and are rendered from `public/bib-icon.svg` with `sharp` (already
installed through Next.js). `@capacitor/assets` is not used because its bundled `sharp` needs npm
install scripts that this repo blocks.

```bash
node scripts/mobile/generate-asset-sources.cjs   # public/bib-icon.svg -> assets/*.png
node scripts/mobile/generate-native-assets.cjs   # assets/ -> iOS AppIcon/Splash + Android mipmaps/splash
npx cap sync
```

The iOS app icon is flattened onto `#0A0A0C` with no alpha channel, which the App Store requires.

## Out of scope (phase 1)

- Native push notifications (APNs / FCM). Web push is disabled in the app.
- In-app purchases.
- Universal Links / Android App Links (`https://bingeitbro.com/...` opening the app). This needs
  `apple-app-site-association` and `assetlinks.json` hosted on the site.

## Store submission notes

- Apple guideline 4.2 (minimum functionality) can reject apps that are only a website in a
  wrapper. Native sign-in, deep links, the splash screen and back handling help, but plan for
  native push (phase 2) before submitting to the App Store.
- Apple guideline 4.8 (Login Services): an iOS app that offers Google sign-in must also offer
  an equivalent privacy-focused login option, which in practice usually means Sign in with
  Apple. Expect App Review to ask for it. Check the current guideline wording before you submit.
