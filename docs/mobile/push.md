# Native push notifications (iOS + Android)

The Capacitor app uses Firebase Cloud Messaging (FCM) through
`@capacitor-firebase/messaging`. The web site is unchanged: all native code is
gated on `isNativeApp()` and dynamically imported.

Until the steps below are done, push stays **off and silent**. The app does not
crash without the Firebase config files, shows no permission prompt, and the
server sender does nothing when its env vars are missing.

## How it works

1. `src/components/native/NativePush.tsx` (mounted once, native only) listens to
   Supabase auth. After sign-in it calls `FirebaseMessaging.getToken()`. That
   call doubles as the "is Firebase configured?" check. It then asks for
   notification permission and POSTs the token to `/api/native-push/register`,
   with the Supabase access token as Bearer auth.
2. Token refreshes (`tokenReceived`) are re-registered. On sign-out the token is
   unlinked server-side (`DELETE /api/native-push/register`) and deleted at FCM.
3. Tapping a notification navigates to `data.path`. Only same-site relative
   paths are allowed, for example `/?view=friends` or `/movie/tmdb-123`.
4. The server (`src/lib/server/fcm.ts`) signs a service-account JWT with Web
   Crypto, gets an OAuth token (cached per isolate), and sends through the FCM
   HTTP v1 API. On Cloudflare it runs inside `ctx.waitUntil`, so the API
   response isn't delayed. Tokens that FCM reports as `UNREGISTERED` are
   deleted.
5. Pushes are sent when:
   - a friend sends recommendations (`/api/send-friend-recommendations`) → "<sender> sent you <movie>", which opens the friend recs inbox;
   - a watch reminder fires (`/api/watch-reminders/dispatch-emails`) → "Time to watch", which opens the movie/show;
   - a friend-recommendation reminder fires (the same dispatch route) → "<sender> reminded you", which opens the movie.

## Required before TestFlight / store submission

You must complete steps 1 to 6. Push will not work end-to-end without all of them.

### 1. Firebase project

1. Go to https://console.firebase.google.com and click **Add project**. You
   can reuse an existing project. Analytics is optional.
2. Note the **Project ID** (Project settings → General).

### 2. iOS app + `GoogleService-Info.plist`

1. Firebase console → Project settings → General → **Add app** → iOS.
2. Bundle ID: `com.bingeitbro.app` (it must match exactly). App nickname: anything.
3. Download `GoogleService-Info.plist`. Skip the SDK and code steps, which are already done.
4. Open `ios/App/App.xcodeproj` in Xcode. Drag `GoogleService-Info.plist` into the
   **App** group (next to `Info.plist`). In the dialog:
   - check **Copy items if needed**,
   - under **Add to targets**, check **App**.
5. Confirm it shows under App target → Build Phases → **Copy Bundle Resources**.

> This changes `project.pbxproj`. That's expected, so commit it together with the plist.
> The plist holds public client identifiers, not secrets, but keep it out of
> public repos if you prefer.

### 3. APNs key → Firebase

1. Go to https://developer.apple.com/account → Certificates, IDs & Profiles → **Keys**
   → **+**. Name it (e.g. "BiB APNs"), enable **Apple Push Notifications service (APNs)**,
   then Continue → Register → **Download** the `.p8` file. You can only download it once.
   Note the **Key ID** and your **Team ID**.
2. Under Identifiers → `com.bingeitbro.app`, make sure **Push Notifications** is enabled.
   The project already has `aps-environment` in `ios/App/App/App.entitlements`.
   Xcode switches it to production for App Store and TestFlight builds through the provisioning profile.
3. Firebase console → Project settings → **Cloud Messaging** → Apple app configuration →
   **APNs Authentication Key** → Upload the `.p8`, then enter the Key ID and Team ID.
   One key works for both development and production.

### 4. Android app + `google-services.json`

1. Firebase console → Project settings → General → **Add app** → Android.
2. Package name: `com.bingeitbro.app`. Download `google-services.json`.
3. Put it at `android/app/google-services.json`.
   `android/app/build.gradle` already applies the `com.google.gms.google-services`
   plugin only when this file exists, so builds without it keep working.
4. Android 13+ asks for notification permission at runtime (`POST_NOTIFICATIONS` is
   declared). The app creates the `bib_default` channel and uses
   `@drawable/ic_stat_notification` as the small icon.

### 5. Service account → Cloudflare Worker secrets

1. Firebase console → Project settings → **Service accounts** → **Generate new private key**.
   This downloads a JSON key. Treat it as a secret and never commit it.
   - The default `firebase-adminsdk-…` account works. A dedicated account also works if it
     has the role **Firebase Cloud Messaging API Admin**
     (`roles/firebasecloudmessaging.admin`).
   - Make sure **Firebase Cloud Messaging API (V1)** is enabled
     (Project settings → Cloud Messaging).
2. Set the secrets on the `bingeitbro` Worker. Use secrets, not plain vars, and never
   put them in a `NEXT_PUBLIC_*` variable. Pick **one** option:

   Option A (single secret):
   ```bash
   npx wrangler secret put FIREBASE_SERVICE_ACCOUNT_JSON   # paste the whole JSON (or base64 of it)
   ```
   Option B (three secrets):
   ```bash
   npx wrangler secret put FIREBASE_PROJECT_ID
   npx wrangler secret put FIREBASE_CLIENT_EMAIL
   npx wrangler secret put FIREBASE_PRIVATE_KEY            # the -----BEGIN PRIVATE KEY----- block; literal \n is OK
   ```
3. `SUPABASE_SERVICE_ROLE_KEY` must also be set as a secret. It is already used by other
   routes. Token registration and sending need it: tokens are only read and written server-side.
4. For local testing, put the same names in `.env.local`. Don't commit it.

### 6. Database table

In the Supabase SQL Editor, run `supabase-native-push-schema.sql` (it is safe to re-run). This creates
`public.native_push_tokens` with RLS, so users can only touch their own rows, and adds an index.

## Then

1. `npm run build` and deploy the web app (the native app loads the live site).
2. `npx cap sync`, then open Xcode and run on a **real device** (simulator APNs support is
   limited and unreliable for FCM). Sign in and allow notifications.
3. Test: from another account, send yourself a recommendation. You should get
   "<name> sent you <movie>", and tapping it opens the inbox.
4. Optional: in Firebase console → Messaging, send a test message to the device token.

## Notes / troubleshooting

- No permission prompt after sign-in: the Firebase config file is probably missing from the build
  (check Copy Bundle Resources / `android/app/google-services.json`). Xcode logs
  `[FirebaseMessaging] Firebase was not configured`.
- Server logs `[fcm] OAuth token request failed 400/401`: the service-account secret is wrong or
  revoked. `[fcm] send failed 403`: the FCM v1 API is disabled or the account lacks the FCM role.
- Foreground behaviour: iOS only updates the badge while the app is open
  (`capacitor.config.ts` → `FirebaseMessaging.presentationOptions`). The web app gets a
  `bib:native-push-received` window event and can show an in-app toast if wanted.
- Rate limit: `/api/native-push/register` allows 30 requests per IP every 10 minutes (`src/middleware.ts`).
  The server keeps the 10 most recent tokens per user.
- Not covered yet: nudges and group-watch invites are written directly from the client to
  Supabase, so there is no server send point to hook. They would need a DB trigger or an API route.
