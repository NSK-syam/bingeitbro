# Binge It Bro Mobile (iOS + Android)

This app keeps the website live and ships a native mobile shell that loads the same production experience from `https://bingeitbro.com`.

## Local run

1. Install dependencies:
   - `npm install`
2. Optional env:
   - `cp .env.example .env`
3. Start Expo:
   - `npm run start`
4. Run on iOS simulator:
   - `npm run ios`

## iOS TestFlight release

1. Log in to Expo:
   - `npx eas-cli login`
2. Configure EAS once:
   - `npx eas-cli build:configure`
3. Build iOS production binary:
   - `npm run build:ios`
4. Submit to App Store Connect:
   - `npm run submit:ios`
5. In App Store Connect, assign the build to TestFlight testers.

## Android Play Store release

1. Log in to Expo:
   - `npx eas-cli login`
2. Configure EAS once (if not already):
   - `npx eas-cli build:configure`
3. Build Android app bundle for Play Store:
   - `npm run build:android`
4. Submit to Google Play internal testing track:
   - `npm run submit:android`
5. In Play Console, complete store listing, content rating, privacy policy, and rollout.

### Optional internal Android build only

- `npm run build:android:internal`

## Required Apple setup

1. Active Apple Developer Program account.
2. App Store Connect app with bundle ID:
   - `com.bingeitbro.app`
3. Correct team selected during EAS build/submit.
4. Sign in with Apple capability enabled (configured in `app.json` via `ios.usesAppleSignIn: true`).
5. Apple auth provider enabled in Supabase Auth with your Services ID / key so native Apple login can exchange tokens.

## Notes

- External OTT links open in an in-app browser sheet for legal and platform safety.
- Main in-app host allowlist:
  - `bingeitbro.com`
  - `www.bingeitbro.com`
- The app has an in-app `Legal` panel with TMDB attribution and links to:
  - TMDB website
  - Copyright page
  - Terms page
  - Privacy page
