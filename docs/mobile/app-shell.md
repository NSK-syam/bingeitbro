# Native app shell (`/app`)

The redesigned app UI lives under `/app/*` (spec:
`docs/superpowers/specs/2026-10-03-bingeitbro-native-app-redesign-design.md`). It is **inactive**:
nothing on the website links to it, the native app doesn't redirect to it yet, and it is
`noindex`. Users keep the current UI until the activation gate (redesign PR 6).

## Opening it for testing

- **Browser:** open `https://bingeitbro.com/app` (or `http://localhost:3000/app` with `npm run dev`).
  It works in any browser, but it is designed for phone sizes.
- **iOS Simulator** (app installed): run
  ```bash
  xcrun simctl openurl booted "com.bingeitbro.app://open?path=%2Fapp"
  ```
  The widget deep-link handler opens `/app`, and navigation then stays inside the shell.
- **Android emulator:**
  ```bash
  adb shell am start -a android.intent.action.VIEW -d "com.bingeitbro.app://open?path=%2Fapp"
  ```
  This needs the `open` host added to the Android intent filter, which comes in a later PR. Until
  then, use a browser.

## What's in place (PR 1)

| Piece | Where |
| --- | --- |
| Route mapping: every website, push, widget and OAuth path to its app destination | `src/lib/native/app-routes.ts`, tests in `scripts/mobile/test-app-routes.mjs` |
| Shell: sign-in gating, safe areas, boot state, bottom bar, Recommend sheet | `src/components/app/AppShell.tsx`, `TabBar.tsx`, `Sheet.tsx` |
| Design tokens (scoped to `.bib-app`) and bundled fonts (Archivo, Geist) | `src/app/app/app.css`, `src/app/app/fonts/` |
| Base components | `PosterTile`, `PosterRow`, `AppButton`, `ScreenHeader`/`EmptyState`, `icons` |
| Placeholder screens (Home, Picks, Groups, Me, Welcome, title, profile) | `src/app/app/**/page.tsx` |

Run the routing tests with `node scripts/mobile/test-app-routes.mjs`.
