# Sign in with Apple and the iOS home screen widget

These iOS-only features run inside the Capacitor app (`server.url = https://bingeitbro.com`).
They are not visible on the web site or on Android.

## What is in the repo

| Piece | Location |
| --- | --- |
| Local Capacitor plugin `BibNative` (Swift) | `ios/App/App/BibNativePlugin.swift` |
| Registers the plugin | `ios/App/App/MainViewController.swift` (root VC created by `SceneDelegate.swift`; `Main.storyboard` points to it too) |
| JS plugin wrapper | `src/lib/native/bib-native.ts` |
| `signInWithApple()` on the auth context | `src/components/AuthProvider.tsx` |
| Apple button (iOS app only) | `src/components/native/AppleSignInButton.tsx`, used by `AuthModal.tsx` and `CinematicAuth.tsx` |
| Widget extension | `ios/App/BibWidget/` (target `BibWidget`, bundle id `com.bingeitbro.app.BibWidget`, iOS 17+) |
| Widget data sync | `src/components/native/NativeWidgetSync.tsx` (must be mounted inside `<AuthProvider>`) |
| Widget deep links | `src/lib/native/widget-deeplink.ts` |
| Script that added the target | `scripts/mobile/add-widget-target.rb` (idempotent) |

Re-running the target script (only needed if the project file is regenerated):

```bash
GEM_HOME="$(brew --prefix cocoapods)/libexec" ruby scripts/mobile/add-widget-target.rb
```

## Manual setup

### 1. Supabase: Apple provider (native ID-token flow)

Supabase Dashboard -> Authentication -> Sign In / Providers -> **Apple**:

1. Enable the Apple provider.
2. Add the iOS bundle ID `com.bingeitbro.app` to **Client IDs** (comma-separated if a
   Services ID is also listed).
3. For the native flow (`signInWithIdToken`) you do **not** need a Services ID, a
   `.p8` key or a client secret. Those are only needed for web OAuth with Apple, which
   this change does not add.

The app sends the identity token plus the raw nonce. The plugin gives Apple
SHA-256(raw nonce), and Supabase checks that the hash matches the token's `nonce` claim.

### 2. Apple Developer capabilities

Xcode automatic signing (team `M9XD55FYL5`) will create or update these when you
build to a device or archive. Check them under Certificates, Identifiers & Profiles -> Identifiers:

- `com.bingeitbro.app`: **Sign in with Apple** (Enable as a primary App ID), **App Groups**
  (`group.com.bingeitbro.app`) and **Push Notifications** (already present).
- `com.bingeitbro.app.BibWidget`: **App Groups** (`group.com.bingeitbro.app`).
- App Group `group.com.bingeitbro.app` must exist. Xcode creates it if your account role allows it.

If automatic signing cannot register the widget ID, open the project in Xcode, select the
**BibWidget** target -> Signing & Capabilities, choose the team and let Xcode fix it.

### 3. Versioning

App Store Connect requires the extension and the app to have matching versions.
`MARKETING_VERSION` and `CURRENT_PROJECT_VERSION` are set on **both** the App and the
BibWidget targets. When you bump the app version, bump BibWidget too (or re-run the script,
which copies the App target's Debug values).

### 4. Hosted web code

The Apple button and the widget sync are part of the web bundle loaded from
bingeitbro.com. They only appear and run after the web changes are deployed **and** the
user runs an app build that includes `BibNativePlugin`. Older app builds do not register
`BibNative`, so the button stays hidden (`Capacitor.isPluginAvailable('BibNative')`).

### 5. Privacy manifests

`ios/App/App/PrivacyInfo.xcprivacy` and `ios/App/BibWidget/PrivacyInfo.xcprivacy` are bundled
with each target. Both declare `NSPrivacyTracking = false` and no tracking domains.

- App: UserDefaults access for `CA92.1` (own app, used by @capacitor/preferences) and `1C8F.1`
  (App Group shared with the widget).
- App collected data. None is used for tracking, and nothing is shared with data brokers or ad networks.

  | Manifest type | What it is in BingeItBro | Linked | Purpose |
  | --- | --- | --- | --- |
  | EmailAddress | account email, notification emails | yes | App Functionality |
  | Name | display name, Apple-provided name | yes | App Functionality |
  | UserID | Supabase user id, username | yes | App Functionality |
  | DeviceID | FCM/APNs push token (`native_push_tokens`) | yes | App Functionality |
  | EmailsOrTextMessages | direct messages and group-watch chat | yes | App Functionality |
  | OtherUserContent | recommendations and personal notes, playlists, ratings, watchlist/reminders | yes | App Functionality |
  | OtherDataTypes | optional birthday (birthday greeting) | yes | App Functionality |
  | ProductInteraction | datafa.st page analytics and `trackFunnelEvent` (anonymous session id, no user id) | no | Analytics |

  Not declared, because it is not collected: photos or videos (avatars are emoji), precise or
  coarse location (country is guessed from the device time zone and stored locally, and IP is
  only used transiently for rate limiting), contacts, health, financial data, crash data
  (Crashlytics is not linked), and advertising data (AdSense is web only and not loaded in the app).
- Widget: UserDefaults access for `1C8F.1` only. It collects no data.

**App Store Connect -> App Privacy must match this table:**

- Data Used to Track You: none.
- Data Linked to You: Contact Info (Email Address, Name), Identifiers (User ID, Device ID),
  User Content (Emails or Text Messages, Other User Content) and Other Data, all for App Functionality.
- Data Not Linked to You: Usage Data (Product Interaction) for Analytics.

If datafa.st is ever configured to identify signed-in users, move Product Interaction to
"Linked to You" in both places.

The Capacitor core and the Firebase/Google SPM packages ship their own manifests. The
Capacitor plugin sources (@capacitor/* and @capacitor-firebase/messaging) use no other
required-reason APIs. Only Preferences uses UserDefaults.

## How Sign in with Apple works

1. `AppleSignInButton` renders only when `Capacitor.getPlatform() === 'ios'` and the plugin is
   available. This is checked in an effect, so server rendering and the web are unchanged.
2. `signInWithApple()` creates a random raw nonce, calls `BibNative.signInWithApple({ nonce })`
   (`ASAuthorizationController`, scopes full name and email), then calls
   `supabase.auth.signInWithIdToken({ provider: 'apple', token, nonce: rawNonce })`.
3. Cancelling the Apple sheet rejects with code `CANCELED`. The UI ignores that silently.
   Only one request can run at a time.
4. Apple sends the user's name only on the first authorization. It is stored in auth
   metadata (`full_name`), used by `ensureUserProfile` when it creates the profile, and written
   to `users.name` only if that is empty or still the auto-generated placeholder.
5. With "Hide My Email", the email is `...@privaterelay.appleid.com`. The generated username then
   comes from the Apple name (or `user_xxxx`) instead of the random relay prefix.

Testing: you need a real device or a simulator signed in to an Apple ID, and the app must be signed
with the Sign in with Apple capability. To get the first-time name again, remove the app under
Settings -> Apple ID -> Sign-In & Security -> Sign in with Apple.

## Widget

- Families: `systemSmall`, `systemMedium` (up to three picks) and `accessoryRectangular` (Lock Screen).
- Data: `NativeWidgetSync` loads the latest three received `friend_recommendations` (excluding
  self-sends), sender names and the unwatched count. It then calls `BibNative.setWidgetData`.
  The plugin downloads w185 posters into the App Group container (`widget-posters/`), writes a
  minimal JSON snapshot (titles, years, sender names, paths, poster file names, count and
  timestamp; no tokens or ids) to `UserDefaults(suiteName: "group.com.bingeitbro.app")` key
  `widgetData`, and calls `WidgetCenter.shared.reloadAllTimelines()`. The widget never uses the network.
- Refresh: on sign-in, when the app becomes active, and every 15 minutes while it is visible.
  The data is cleared on sign-out and when the account changes.
- Account isolation is enforced by `WidgetOwnerGate` (`ios/App/App/WidgetOwnerGate.swift`, a pure
  struct). Its state lives in the App Group:
  - `widgetExpectedOwner`: the reserved owner (SHA-256 of the user id) or the `__signed_out__` sentinel.
  - `widgetGeneration`: the current generation.
  - `widgetDataOwner`: the owner of the committed snapshot.
- The rules:
  - `ensureWidgetOwner` (called before every fetch) and `setWidgetData` reserve the owner
    synchronously when they start. Every owner transition increments the generation, even if
    nothing was committed yet.
  - Each `setWidgetData` increments the generation again, so a newer write supersedes an older one.
  - A write commits only if both its generation and its owner still match the persisted state.
    Otherwise it is dropped along with its poster files.
  - A snapshot belonging to a different or unknown owner is cleared. The same owner's snapshot is
    kept across transient fetch errors.
  - `clearWidgetData` synchronously sets the `__signed_out__` sentinel and increments the
    generation, then removes the snapshot.
  - The widget shows a snapshot only if `widgetDataOwner` equals the reserved owner. After
    sign-out (sentinel) it never shows one.
- Sign-out: `NativeWidgetSync.tsx` registers `registerNativeLogoutCleanup('widget', ...)` at module
  load. `AuthProvider.signOut` awaits it before revoking the session. The first native step is the
  synchronous sentinel and generation bump, so a cleanup cut short by the 5 s budget still blocks
  every pending commit. On the next start with no user, `NativeWidgetSync` calls
  `clearWidgetData` again. A sync that started before sign-out checks a logout epoch before
  each native call and stops.
- Tests: `scripts/mobile/test-widget-owner-gate.sh` compiles the gate with `swiftc` and runs the
  scenarios. No simulator is needed.
  - B4 repro: A's write is in flight, B reserves, B's fetch fails, so A's write must not commit.
  - Logout during a write.
  - Sign-out and back in as the same account.
  - Superseded writes.
  - Same-account snapshot kept.
  - Foreign or unknown snapshot cleared.
  - State restored after a restart.
- Manual device check for B4:
  1. Sign in as A with picks and wait for the widget to fill.
  2. Sign out, which should empty the widget immediately.
  3. Turn on Airplane Mode and sign in as B. Their fetch fails and the widget must stay empty.
  4. Turn Airplane Mode off and pull to refresh. The widget shows B's picks only.
- Tap: `com.bingeitbro.app://open?path=<url-encoded same-origin path>`, for example
  `com.bingeitbro.app://open?path=%2Fmovie%2Ftmdb-27205`. The empty state uses `path=%2F`.
  Handle it in the `appUrlOpen` / `getLaunchUrl` handler with
  `getWidgetOpenPath(url)` from `src/lib/native/widget-deeplink.ts`.

### Testing the widget

1. `npx cap sync ios`, open `ios/App/App.xcodeproj`, then run the **App** scheme on a device or simulator.
   The widget is embedded automatically.
2. Sign in and open the app once so `NativeWidgetSync` writes data.
3. Long-press the home screen -> **+** -> search "BingeItBro" -> add the small or medium widget.
4. To debug the widget alone, run the **BibWidget** scheme and pick a widget family when prompted.
5. The App Group only works on a signed build. With `CODE_SIGNING_ALLOWED=NO` (CI simulator
   builds), `setWidgetData` may not reach the shared container, and the widget may show the empty state.
