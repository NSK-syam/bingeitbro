# Native device features (iOS / Android app)

These features exist only inside the Capacitor app. Each one checks `isNativeApp()` and loads its
plugin with a dynamic `import()`, so the website works exactly as before. Like the rest of the
app's native code, they live in the web bundle and reach the app only after this branch is
deployed to bingeitbro.com.

Plugins used (already in `package.json`): `@capacitor/local-notifications`, `@capacitor/share`,
`@capacitor/haptics`, `@capacitor/network`, `@capacitor/preferences`, plus `@capacitor/app` for
the resume event.

## What was added

### 1. Watch reminders as on-device notifications

- `src/lib/native/watch-reminders.ts`
  - `scheduleNativeWatchReminder(reminder)`: runs after **Schedule Watch** is saved
    (`ScheduleWatchButton`, `ScheduleWatchModal`). It asks for notification permission with
    `LocalNotifications.requestPermissions()`, cancels any pending notification for the same
    title, then schedules a notification for `remindAt`.
  - `cancelNativeWatchReminder(movieId)`: runs when a schedule is removed.
  - `syncNativeWatchReminders(reminders)`: runs on app start and on resume (throttled to once a
    minute). It fetches `getUpcomingWatchReminders()`, schedules future reminders that are missing
    or have moved, and cancels stale ones. After sign-out it is called with an empty list, which
    clears every reminder.
  - Notification ids are a stable 31-bit FNV-1a hash of the reminder id, so they fit in a Java
    `int`. `extra` carries `{ kind, reminderId, movieId, path, remindAt }`.
  - On Android, reminders use `isExactNotification: false` with `allowWhileIdle: true`. The app
    never sends the user to the "Alarms & reminders" settings screen, but a reminder can arrive a
    few minutes late.
- Tapping a notification: `NativeFeatures` listens for `localNotificationActionPerformed` and
  sets `window.location` to the in-app path (`/movie/...` or `/show/...`). Only relative paths
  that start with `/` are accepted.
- The web Notification API is not used in the app:
  - `ScheduleWatchButton` skips `Notification.requestPermission()`.
  - `WatchReminderCenter` skips `new Notification(...)`, because the OS has already shown the
    local notification. The in-app toast still appears.
  - `FriendRecommendationReminderCenter` shows due friend reminders with
    `LocalNotifications.schedule` (shown right away). It does not ask for permission, and the
    in-app toast still appears.
- The server stays the source of truth. Email reminders and the polling toasts are unchanged.

### 2. Native share sheet

- `src/lib/native/share.ts` provides:
  - `shareContent({ title, text, url })`: in the app it uses `@capacitor/share`. On the web it
    passes through to `navigator.share`. It returns `'shared' | 'cancelled' | 'unavailable'`, and
    callers keep their existing web fallbacks.
  - `toPublicUrl()`: rewrites any path or URL to `https://bingeitbro.com/...`, so shared links
    never contain `capacitor://`, `localhost` or a LAN address.
- Call sites:
  - Movie and show pages: a **Share** button (`src/components/native/NativeShareButton.tsx`). It
    renders only in the app, so the web layout is unchanged.
  - Profile/playlist "Share on WhatsApp" button: opens the OS share sheet in the app (WhatsApp is
    one of the targets). The web still opens `wa.me`.
  - HelpBot chat **Forward**: uses `shareContent`. On the web this is the same `navigator.share`,
    and both web and app still fall back to copying.
- No other share or copy-link actions exist. The `add` page's "copy JSON" is an admin tool.

### 3. Haptics

`src/lib/native/haptics.ts` provides `impactLight()`, `notificationSuccess()` and `selection()`.
They do nothing on the web and never throw.

| Moment | Helper |
| --- | --- |
| Add to watchlist (`WatchlistButton`) | `impactLight` |
| Mark watched (`WatchedButton`, friend-recs inbox, group pick) | `notificationSuccess` |
| Recommendation sent (`SendToFriendModal`) | `notificationSuccess` |
| Watch reminder saved (`ScheduleWatchButton` / `ScheduleWatchModal`) | `notificationSuccess` |
| Group watch vote (`GroupWatchModal`) | `selection` |
| Share button tap | `impactLight` |

There is no pull-to-refresh in the app, so it has no haptic.

### 4. Offline mode

- `src/lib/native/offline-cache.ts` writes JSON to Capacitor Preferences under these keys:
  - `bib_offline_watchlist`: mirrored from the `cinema-chudu-watchlist` localStorage key, and
    updated on every change.
  - `bib_offline_scheduled`: upcoming scheduled watches, refreshed on start and resume.
  - `bib_offline_friend_recs`: the latest 20 received friend recommendations.

  Each value has the shape `{ version: 1, savedAt, userId, items: [{ id, title, poster, year,
  path, at, note }] }`, capped at 100 items. The two account caches are cleared on sign-out.
- `NativeFeatures` uses `@capacitor/network`:
  - While offline, an amber "You're offline" banner sits at the top (safe-area aware). Its
    **Your saved list** button opens a full-screen, read-only list (scheduled watches,
    watchlist, picks from friends).
  - When the connection returns, a "Back online" banner shows for 2.5 s and a re-sync runs.
- `capacitor-www/index.html` is the native `errorPath` page, shown when the site can't load at
  all, for example on a cold start offline.
  - It reads the same Preferences keys through the native bridge. It uses
    `window.Capacitor.Plugins.Preferences` if present, otherwise
    `Capacitor.nativePromise('Preferences', 'get', …)`.
  - It renders the cached titles with `textContent` only. If the bridge or the data is missing,
    it shows just the offline message.
  - It retries automatically on the `online` event, and also with the **Retry** button.

## Mounting

`src/components/native/NativeFeatures.tsx` must be rendered once **inside `<AuthProvider>`**
(it calls `useAuth()`), for example next to `<NativeAppBridge />` in `src/app/layout.tsx`. It
returns `null` on the web.

## How to test on a device

Deploy first, or point `server.url` at a LAN dev server as described in MOBILE.md. Then run
`npx cap sync` and run the app from Xcode or Android Studio.

1. **Reminder (app open):**
   1. Sign in, open a movie, tap **Schedule Watch**, and pick a time 2–3 minutes from now.
   2. Allow notifications when asked. You should feel a success haptic.
   3. Background the app. The notification "Time to watch 🍿" arrives at that time.
   4. Tap it. The app opens on that movie's page.
2. **Reminder (app killed):** repeat with the app swiped away. The notification should still
   arrive, and tapping it should cold-start the app on the movie page. This checks that the
   retained `localNotificationActionPerformed` event is delivered.
3. **Reschedule / remove:**
   1. Reschedule the same title. Only one notification should be pending, at the new time.
   2. Remove the schedule. Nothing should arrive.
   3. Debug check: run `LocalNotifications.getPending()` in the Safari or Chrome web inspector.
4. **Re-sync:**
   1. Schedule a watch on the website.
   2. Open the app, or bring it back to the foreground after more than 1 minute.
   3. The notification is now pending on the device.
   4. Sign out. All pending reminders are cancelled.
5. **Friend reminder:**
   1. Have a friend send you a recommendation with a reminder time.
   2. When it is due and the app is open, a local notification and the in-app toast appear.
6. **Share:**
   1. On a movie or show page, tap **Share**. The OS share sheet opens.
   2. Share to Notes or Messages. The link must be `https://bingeitbro.com/movie/...`.
   3. Repeat with the profile share button and with HelpBot **Forward**.
7. **Haptics:** add to watchlist, mark watched, send a recommendation, and vote in a group watch.
   Use a physical device; simulators have no haptics.
8. **Offline (site already loaded):**
   1. Use the app online once: visit home and add a watchlist item.
   2. Turn on airplane mode. The offline banner appears.
   3. Tap **Your saved list**. The cached lists appear.
   4. Turn airplane mode off. "Back online" shows.
9. **Offline (cold start):**
   1. Kill the app and turn on airplane mode.
   2. Launch the app. The fallback page shows "You're offline" and the cached lists.
   3. Turn airplane mode off. The page reloads the site.
10. **Web regression:** in a desktop browser:
    - No Share button on movie or show pages.
    - Profile share still opens WhatsApp.
    - Scheduling still asks for browser notification permission.
    - No offline banner.

## App Review talking points (guideline 4.2)

- **Local notifications:** scheduled watch reminders are delivered by the OS at the chosen
  time, even when the app is closed. They are re-synced on launch and resume, and tapping one
  deep-links into the title.
- **Native share sheet:** movies, shows and profiles share through UIActivityViewController
  (iOS) or the Android share intent, using public web links.
- **Haptic feedback** on key actions: watchlist, watched, sending a recommendation, voting,
  scheduling.
- **Offline mode:**
  - Network status is detected natively and shown with a native-style banner.
  - The user's watchlist, scheduled watches and friends' picks are stored on the device
    (Preferences, i.e. UserDefaults / SharedPreferences) and can be browsed offline.
  - The cache is available even on a cold launch with no connection.
- These are combined with the existing native Google sign-in (system browser + custom URL
  scheme), the status bar, splash screen and Android back-button handling.

## Known limitations / follow-ups

- Android delivery is inexact by design (no `SCHEDULE_EXACT_ALARM` prompt). If minute-accurate
  delivery is needed, the Android owners would add the permission and the code would switch to
  `isExactNotification: true`.
- Friend reminders appear only while the app is running, because they come from polling. Watch
  reminders are pre-scheduled and do not have this limit.
- The offline view is text-only. Posters are not cached.
- iOS shows local notifications while the app is in the foreground by default (banner, list,
  sound, badge). The tap event is retained until a listener attaches, which is what makes
  cold-start deep links work.
- `@capacitor-firebase/messaging` is also installed. Capacitor's notification router should
  dispatch local vs. remote notification taps correctly, but check this on a device once push is
  wired up.
