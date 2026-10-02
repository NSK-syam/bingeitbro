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
| Splash screen with spinner: icon on `#0A0A0C`, hidden once the page hydrates (auto-hides after 10s at most) | `capacitor.config.ts` (`SplashScreen`), `assets/` |
| App icon from `public/bib-icon.svg` | sources in `assets/`, generated into `ios/` and `android/` |
| Android back button: navigate back, exit at the root | `NativeAppBridge` |
| No web push / service worker in the app (native FCM push instead) | `src/lib/push.ts` (guarded by `isNativeApp()`) |

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

## Native features (added after the 1.0 rejection)

App Review rejected 1.0 under guideline 4.2 (minimum functionality) and 5.1.1(v) (date of birth
was required). The changes below are implemented in code, but each one needs the manual setup in
the release checklist and testing on a device before you resubmit. Approval is still Apple's call.

| Feature | Platforms | Details |
| --- | --- | --- |
| Birthday is optional at signup | all | `AuthModal.tsx`, `CinematicAuth.tsx` |
| In-app account deletion (user menu → Delete account, or your profile → Account settings), with Sign in with Apple token revocation | all | [account-deletion.md](docs/mobile/account-deletion.md) |
| Privacy manifests (`PrivacyInfo.xcprivacy`) for the app and the widget | iOS | `ios/App/App`, `ios/App/BibWidget` |
| App-first start: logged-out users see the sign-in screen, not the SEO landing page | app | `src/app/page.tsx` |
| No AdSense inside the app (not allowed in app WebViews) | app | `src/app/layout.tsx`, `AdDisplayUnit.tsx` |
| Scheduled watches become on-device notifications (work offline) | iOS, Android | [device-features.md](docs/mobile/device-features.md) |
| Native share sheet (movie, show, profile, help bot) | iOS, Android | [device-features.md](docs/mobile/device-features.md) |
| Haptics on key actions | iOS, Android | [device-features.md](docs/mobile/device-features.md) |
| Offline mode: cached watchlist, schedule and friend picks | iOS, Android | [device-features.md](docs/mobile/device-features.md) |
| Push notifications for friend picks and reminders (FCM) | iOS, Android | [push.md](docs/mobile/push.md) |
| Sign in with Apple (native) | iOS | [apple-and-widget.md](docs/mobile/apple-and-widget.md) |
| "Latest from friends" home screen and lock screen widget | iOS | [apple-and-widget.md](docs/mobile/apple-and-widget.md) |

All of it is web code gated on `Capacitor.isNativePlatform()`, plus native code in `ios/` and
`android/`. The website does not change, apart from a hidden AdSense loader change and an
optional birthday.

## Release checklist (in this order)

1. **Supabase redirect URL:** add `com.bingeitbro.app://auth/callback` (see above).
2. **Supabase Apple provider:** enable it and add `com.bingeitbro.app` to Client IDs
   ([apple-and-widget.md](docs/mobile/apple-and-widget.md)).
3. **Firebase** (project `bingeitbro-d761b`): the iOS and Android apps are registered, and
   `GoogleService-Info.plist` (in the Xcode App target) and `android/app/google-services.json`
   are committed. **Still to do:** in Firebase → Project settings → Cloud Messaging → Apple app
   configuration, upload the APNs key `AuthKey_FXS3AHXNJU.p8` (Key ID `FXS3AHXNJU`, Team ID
   `M9XD55FYL5`) ([push.md](docs/mobile/push.md)).
4. **Database:** run `supabase-native-push-schema.sql` in the Supabase SQL editor.
5. **Cloudflare secrets:** set `FIREBASE_SERVICE_ACCOUNT_JSON`, plus `APPLE_TEAM_ID=M9XD55FYL5`,
   `APPLE_KEY_ID=65BUSN43JT` and `APPLE_PRIVATE_KEY` (contents of `AuthKey_65BUSN43JT.p8`, the Sign in with Apple key, used to revoke tokens when an Apple user
   deletes their account; see [account-deletion.md](docs/mobile/account-deletion.md)). Make sure
   `SUPABASE_SERVICE_ROLE_KEY` is set. Without the Apple secrets, Apple users can't delete
   their account (they get a clear error).
6. **Deploy the web app** to bingeitbro.com. The app loads the live site, so nothing above works
   in the app until this is deployed.
7. **Xcode:** pick your team for both the **App** and **BibWidget** targets. Bump **Build** on both,
   then Product → Archive → Distribute → App Store Connect.
8. **Test with TestFlight on an iPhone and an iPad** before you resubmit (checklists in the docs above).
9. **Reply to App Review** in App Store Connect, listing the native features (see below).

## Reply to App Review (draft)

> Thank you for the feedback. We have updated BingeItBro:
>
> **5.1.1(v):** Date of birth is now optional during signup. Users can delete their account inside
> the app: tap the profile menu → **Delete account** (also under Profile → Account settings).
>
> **4.2:** The app now provides native functionality that a browser cannot:
> - Sign in with Apple (native AuthenticationServices).
> - A home screen and lock screen widget (WidgetKit) showing the latest movie picks from your friends.
> - Push notifications when a friend recommends a movie to you.
> - Scheduled "movie night" reminders delivered as on-device local notifications, even offline.
> - An offline mode showing your saved watchlist, schedule and recent friend picks.
> - The native iOS share sheet for movies, shows and profiles, and haptic feedback.

## Out of scope

- In-app purchases.
- Universal Links / Android App Links (`https://bingeitbro.com/...` opening the app). These need
  `apple-app-site-association` and `assetlinks.json` hosted on the site.
- Pushes for nudges and group-watch invites. These are written straight from the client to
  Supabase, so they need a DB trigger or an API route first.

## Store submission notes

- Apple reviewed 1.0 on an **iPad Air 11-inch**. Test on an iPad (or the iPad simulator) too.
- Apple guideline 4.8 (Login Services): Sign in with Apple is implemented. It needs the Supabase
  Apple provider configured and a test on a real device before you resubmit.
