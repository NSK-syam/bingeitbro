# BingeItBro Native App Redesign: Cinematic, Poster-First

## Summary

Give the iOS and Android apps their own app-native interface: dark, poster-first, with large
artwork, very little body text, horizontal rows and a bottom tab bar. The website keeps its
current look. This is a presentation redesign: product logic, data access and backend stay as
they are.

Mockups: https://claude.ai/artifact/MPfCUNzbiAV5D4QXhnrPua (Welcome, Home, Picks, Movie detail,
Recommend sheet, Groups, Profile; clickable).

## Why

- The app currently shows the website, including the long SEO landing page. Users and App Review
  see something that reads like a web article ("looks like Wikipedia").
- App Review rejected 1.0 under 4.2 (minimum functionality). The native features exist
  (Sign in with Apple, widget, push, local reminders, offline, share), but the UI hides them
  behind web-shaped pages.

## Confirmed decisions

- Scope: **app only**. The website is unchanged.
- Direction: **cinematic, poster-first**.
- Process: spec and clickable mockups first, then implementation screen by screen in reviewed
  PRs (same approach as the SearchOutfit premium frontend restoration).
- App icon: the amber "bib" mark (black geometric lowercase letters, play-triangle dot on the
  "i", on amber `#F5A623`). It replaces the old icon in the app only; the website favicon is
  unchanged.
- Songs, Trivia and Admin picks stay web-only.
- Product logic, Supabase access (`src/lib/supabase-rest.ts`, `createClient`) and API routes are
  reused as-is. A redesign PR must not also change business rules.

## Non-goals

- Website redesign.
- New backend features, schema changes or new quotas.
- A native (SwiftUI/Compose) rewrite.
- In-app purchases.

## Architecture

### Route split

- New URL space `/app/*`, implemented as a real app segment `src/app/app/` with its own
  `layout.tsx` (an app shell with a bottom tab bar). A route group `(app)` alone does not create
  `/app`, so use the segment.
- `/app/*` pages are `noindex` and never linked from the website.
- Native detection (`isNativeApp()`) chooses **presentation only**. It never authorizes data;
  every data path keeps its existing auth checks. A user-agent check in middleware is not used
  as the main switch: it can be spoofed and it multiplies cache and SSR variants.
- During migration `capacitor.config.ts` keeps `server.url = https://bingeitbro.com`. Once the
  shell is ready, native users are redirected from `/` to `/app`. Pointing `server.url` at
  `/app` later is optional.
- Boot state (native only): until native detection and the auth session settle, the app shows a
  neutral splash state, never the SEO landing page. The website's landing page and its loading
  behaviour are unchanged.
- `AuthProvider`, `NativeAppBridge`, `NativeFeatures`, `NativePush` and `NativeWidgetSync` stay
  mounted once in the root layout, shared by both shells. Logout cleanup and account isolation
  keep working unchanged.

### URL mapping inside the app

Once the shell is active (see Rollout and activation), every way into the app lands on new
screens. One function maps any incoming path (e.g. `src/lib/native/app-routes.ts`). It is used by
`NativeAppBridge`, `NativePush`, the widget handler and the native redirect.

| Incoming path | Native destination |
| --- | --- |
| `/` | `/app` (signed in) or `/app/welcome` (signed out) |
| `/movies`, `/shows` | `/app` (Home) |
| `/movie/[id]` | `/app/title/movie/[id]` |
| `/show/[id]` | `/app/title/show/[id]` |
| `/profile/[id]` | `/app/profile/[id]` |
| `/add` | `/app` with the Recommend sheet open |
| `/signup`, sign-in modals | `/app/welcome` |
| `/reset-password` | unchanged: `/reset-password` (password recovery is an explicit exception; its email link must keep working) |
| `/?view=friends` (push) | `/app/picks` |
| `/app/*` | unchanged (identity) |
| `/privacy`, `/terms`, `/cookies`, `/copyright`, `/disclaimer` | unchanged: the existing legal pages, opened from Me |
| `/songs`, `/trivia`, `/admin-picks` | not linked from the app; if reached, open in the system browser |
| anything else | `/app` |

Rules:
- Media type is always explicit in the path (`movie` vs `show`); ids are never guessed.
- Query strings and hashes are kept where the destination uses them, and dropped otherwise.
- The input is validated first: same origin and a relative path only (`/` but not `//`), using
  the existing `sanitizeAppPath`/`safeInAppPath` helpers. Anything else is rejected.
- OAuth return (`com.bingeitbro.app://auth/callback`): exchange the code, then go to the
  destination the user asked for before signing in, or `/app`.
- Signed-out users who open a title, profile or picks link go to `/app/welcome?next=<mapped
  path>`, and return there after sign-in. `next` is validated with the same rules.
- Android back: back within `/app`; exit at a tab root.

Acceptance cases (automated where possible, and on a device):
- Google and Apple OAuth return to the requested destination.
- Cold and warm launches from a push notification.
- Cold and warm launches from the widget.
- A signed-out user opening a title link.
- Movie vs show ids map to the right screen.
- An invalid or external path is rejected.
- No redirect loop from `/` ⇄ `/app` ⇄ `/app/welcome`, signed in or out.

### Reusing logic

- Reuse data functions and behaviour first. Don't extract every hook from `MoviesHome.tsx`
  (1,273 lines) up front.
- For each screen, extract only the small controller or hook it needs, and give the new UI its
  own presentation components under `src/components/app/`.
- Existing web callers may change only in narrow, behaviour-preserving ways (e.g. calling an
  extracted hook). Each such change needs regression proof: a test, or a before/after check of
  the web screen. Website presentation must not change.
- When reusing modal logic (FriendRecommendations, GroupWatch, ScheduleWatch, Watchlist, Nudges,
  SendToFriend), audit its assumptions: global CSS, routing, ownership checks, async
  cancellation, mount lifetime.
- Preserve loading, empty and error states, validation, keyboard and focus behaviour, and all
  mutations.

## Visual system

| Token | Value | Use |
| --- | --- | --- |
| Ground | `#0B0B0E` | App background |
| Surface | `#16161B` | Cards, sheets, settings groups |
| Raised | `#1C1C22` | Secondary buttons, inputs |
| Text | `#F4F4F5` | Primary text |
| Muted | `#A1A1AA` | Secondary text (meets 4.5:1 on ground and surface) |
| Accent | `#F5A623` | Primary actions, selected tab, unread dots (matches the new app icon). Filled amber buttons use dark text `#0B0B0E`, never white |
| Danger | `#FCA5A5` | Delete account |

- Type: **Archivo** (condensed, heavy) for display titles and poster titles; **Geist** for UI
  text (already used by the site).
- Radii: 22px hero and cards, 14 to 18px controls, 8 to 10px posters.
- Posters are the primary visual. Rows are horizontal and swipeable.
- Contrast: muted text measures 7.67:1 on ground and 7.04:1 on surface. Any text over artwork or
  translucent overlays needs its own contrast check.
- Icons: one stroke icon set at 24px, 2px stroke.

## Screens and tab ownership

Bottom bar: four navigation tabs (**Home · Picks · Groups · Me**) with a centred **(+)
Recommend** action button. The (+) opens the Recommend sheet; it is a button, not a tab, and never
gets `aria-current`. The sheet closes on swipe down, Cancel, Android back or a successful send,
and focus returns to the (+) button.

| Screen | Owns | Reuses |
| --- | --- | --- |
| Welcome | Sign in with Apple (iOS first), Google, email; poster collage | `AuthProvider` sign-in methods |
| Home | Latest friend pick as hero, rows: From friends, Tonight (schedule), Trending | friend recs, watch reminders, TMDB trending |
| Picks | Inbox of received recommendations: New / Saved / Watched / Sent; mark watched, schedule | `getReceivedFriendRecommendations`, `markFriendRecommendationWatched`, `getSentFriendRecommendations` |
| Recommend (+) | Bottom sheet: pick a title, select friends, note, send | `sendFriendRecommendations`, `getAlreadyRecommendedRecipientIds` |
| Title detail | Poster, meta, friends who recommend it, where to watch (text names, no logos), Recommend / Schedule / Save, friends' notes, TMDB credit | TMDB wrappers, OTT links, schedule, watchlist |
| Groups | Watch groups, voting on picks, next movie night with on-device reminder, group chat entry | watch group functions, group chat |
| Me | Profile, stats, top 10, settings: notifications, reminders, widget how-to, friends, privacy, terms, about/credits, sign out, delete account | profile, top-10, account deletion flow |

Direct messages live under each friend (from Picks or Me → Friends), not as their own tab.
Songs, Trivia and Admin picks are web-only (decided); the app doesn't link to them.

## App Review 4.2

The new UI must put native features where reviewers will meet them in the core journeys:

- Scheduling a watch sets an on-device reminder (Groups, Title detail, Picks).
- The Picks inbox and saved list work offline with a visible offline banner.
- Share uses the native share sheet; Recommend uses haptics.
- Me → Settings shows notifications, watch reminders and how to add the widget.
- Sign in with Apple appears first on Welcome on iOS.
- Browsing never requires granting a permission first.

The mockups and the implementation must include these functional states, not only the happy path:
offline, notification permission denied, empty inbox, Apple sign-in, delete account
confirmation, network error.

The App Review reply lists honest demo steps for features that work after setup (see
`MOBILE.md`). A new look alone does not establish 4.2 acceptance; approval remains Apple's call.

## Accessibility

- Every poster has a readable title in text and an accessible name; never colour-only meaning;
  no hover-only actions.
- Tab bar: `aria-current` on the selected tab, labels on icon-only buttons, touch targets of at
  least 44px.
- Respect Dynamic Type / text scaling, reduced motion and safe areas (notch, home indicator).
- VoiceOver (iOS) and TalkBack (Android) order follows visual order; sheets trap focus and
  return it on close.
- Large text: every screen stays usable at iOS Dynamic Type AX3 and Android font scale 2.0, with no
  clipped or overlapping text.
- Keyboard: inputs scroll into view above the keyboard.
- iPad: two-column layouts where width allows; no stretched phone layout (Apple reviewed 1.0 on
  an iPad Air).

## Performance

- No autoplay video. Use TMDB poster sizes `w185`/`w342` for rows and at most `w780` for the
  hero; never `original`.
- Reserve image dimensions; lazy-load rows below the fold; prioritise only above-fold artwork.
- Designed placeholders and failure states for posters (title on a tinted tile, as in the
  mockups).
- The splash stays up until the shell hydrates (already in place, capped at 10s).

## TMDB attribution

Keep TMDB attribution in a discoverable place (Title detail footer and Me → About and credits).
Check TMDB's current API terms and attribution requirements before finalising assets. This spec
does not assert licence compliance.

## Rollout and activation

The shell stays **inactive** until it is complete. Until the final gate, native users keep the
current UI. `/app` can be opened directly for testing, and turned on per device with a debug flag
(e.g. a `bib_app_shell=1` Preferences key set from a hidden settings gesture or a dev build).

One reviewed PR per step:

1. App shell, inactive: the `/app` segment and layout, bottom bar, route-mapping function with its
   tests, boot state, design tokens and base components (poster tile, rows, sheet, buttons).
2. Welcome and Home.
3. Picks and the Recommend sheet.
4. Title detail (movie and show).
5. Groups (including the chat entry) and Me (settings, sign out, delete account).
6. Cross-screen audit, then the activation gate: turn on the native `/` → `/app` redirect and the
   full route mapping.

Each screen PR ships complete for that screen:
- baseline accessibility (labels, focus, large text);
- loading, empty, error and offline states;
- iPad layout;
- for the relevant screens, mockups of those states, approved before the screen is.

Sign out and delete account must be reachable as soon as the shell is activated. Step 6 is
only the cross-screen audit and polish; it is not where baseline work happens.

Activation gate (step 6):
- Every mapped destination exists and works.
- All acceptance cases above, including password recovery, pass on an iPhone and an iPad.
- They also pass on an Android build: back button and sheet dismissal, TalkBack and font scale
  2.0, and cold and warm deep links from push and OAuth.
- Codex has reviewed it.

Each PR:
- lint, build and `cap sync`;
- a simulator smoke test on iPhone and iPad;
- Codex review;
- no change to website presentation.
