# BiB Native MVP Design

Date: March 23, 2026
Status: Draft for user review
Goal: Replace the current WebView-shell iOS/iPad app with a native MVP that is materially distinct from a browser experience and can pass App Store review under Guideline 4.2.

## Context

The current iOS app is a full-screen `react-native-webview` wrapper around `https://bingeitbro.com`, with native bridges for authentication, push, and external link handling. Apple has now rejected the app under Guideline 4.2 because the reviewer experience is too similar to using a website inside a browser.

The fastest path to approval is not feature parity. It is a smaller, native-first app that preserves the core value of BiB while removing the browser-wrapper architecture from the primary reviewer journey.

## Product Decision

The first native release optimizes for fastest App Store approval, not parity with the current web app.

The native MVP includes:

- Native auth
- Native movies/shows discovery
- Native title detail
- Native watchlist
- Native profile/settings
- Native account deletion

The native MVP excludes:

- Direct messages
- Group watch
- Friend recommendations
- Trivia
- Songs
- Full website rendering inside the app

## Reviewer Journey

The target 5-minute reviewer flow is:

1. Launch app
2. Sign up or sign in natively
3. Browse native discovery feed
4. Open a native title detail screen
5. Save a title to watchlist
6. Open the native watchlist
7. Open native profile/settings
8. Delete account in-app

If this path is fully native, the app is no longer meaningfully equivalent to browsing the website.

## Architecture

### App Structure

Use Expo/React Native with native navigation. Remove the app-root WebView.

- Auth stack
  - Login
  - Signup
  - Reset password
- Main tabs
  - Discover
  - Watchlist
  - Profile
- Detail stack
  - Movie detail
  - Show detail

### Data Sources

Reuse the existing backend and service integrations where possible:

- Supabase for auth, user data, and watchlist persistence
- Existing TMDB-backed routes/data contracts for metadata and watch-provider availability
- Existing account deletion endpoint

The website remains a separate product surface, but it is no longer the mobile UI layer.

### Native Integrations

Keep only integrations that are genuinely native:

- Sign in with Apple
- Google sign-in
- System browser or native external app handoff for OTT links
- Push notifications if needed later

Legal pages may open in the system browser if necessary, but they must not define the core app experience.

## Screen Design

### 1. Auth

Native screens for:

- Login
- Signup
- Password reset

Signup fields:

- Name
- Username
- Email
- Password
- Birthday (optional)

Also include:

- Continue with Apple
- Continue with Google
- Terms of Service link
- Privacy Policy link

### 2. Discover

Single native feed for movies and shows.

Required behavior:

- Browse trending/latest titles
- Country toggle: India / USA
- Basic filters only
- Pull to refresh
- Stable loading, empty, and retry states

This is the primary native surface that replaces the website home page.

### 3. Title Detail

Native detail screen for a movie or show.

Required elements:

- Poster or backdrop
- Title
- Year
- Language
- Rating
- Synopsis
- OTT provider availability
- Add/remove watchlist
- External OTT open action

If provider availability fails, the title screen remains usable and shows a scoped retry state.

### 4. Watchlist

Native list or grid of saved titles.

Required behavior:

- Show saved movies and shows
- Remove from watchlist
- Open title detail
- Clear empty state with CTA back to Discover

### 5. Profile / Settings

Native profile/settings screen.

Required items:

- Display name / username / email
- Sign out
- Delete Account & Data

The current web hash-route deletion flow is replaced by a native entry point and native confirmation UI.

## Error Handling

Each native screen must own its own loading, empty, and error behavior.

- Auth: inline validation and action-specific errors
- Discover: keep last-good data visible when refresh fails
- Detail: keep title view usable even when OTT provider fetch fails
- Watchlist: optimistic updates with rollback on error
- Profile/Delete: explicit destructive confirmation and deterministic post-delete sign-out

## Testing

### Unit

- Auth validation
- Watchlist state/actions
- OTT launch target selection

### Integration

- Login/signup flow
- Discover fetch and refresh
- Watchlist add/remove
- Account deletion flow

### Device QA

Must be verified on both:

- iPhone
- iPad

Manual checks:

- Apple Sign In
- Google sign-in
- Cold start
- Pull to refresh
- Offline/retry behavior
- Account deletion

## Migration Plan

### Milestone 1

Build the native foundation:

- Navigation
- Auth
- Session management
- Shared API client layer

### Milestone 2

Build the core product loop:

- Discover
- Title detail
- Watchlist

### Milestone 3

Build account management:

- Profile/settings
- Sign out
- Delete account and data

### Milestone 4

Remove the app-root WebView and cut the first native review build.

Freeze behavior during App Review. Do not keep shipping reviewer-visible web changes while Apple is testing the app.

## Deferred Scope

These are intentionally deferred from the first native release:

- Direct messages
- Group watch
- Friend recommendations
- Trivia
- Songs
- Advanced social surfaces
- Website pages embedded as the main app experience

These features can return in later native milestones after the native MVP is approved.

## Risks

### 1. Native UI rebuild cost

The current website UI cannot be reused directly as React Native screens. Native components must be built explicitly.

### 2. API boundary cleanup

The current mobile app depends on WebView session injection and bridge events. A real native app needs a proper client-side API/state layer.

### 3. Sign in with Apple deletion revocation

Account deletion currently removes the user but does not clearly revoke Apple authorization before deletion. That should be fixed during the native rebuild.

### 4. iPad quality

Tablet support is enabled. The native MVP must be intentionally usable on iPad, not merely stretched phone layouts.

## Recommendation

Do not continue patching the WebView shell.

Build the native MVP described in this document and ship that as the next App Store submission. That is the fastest credible path to getting BiB approved under Guideline 4.2 while preserving the core product value.
