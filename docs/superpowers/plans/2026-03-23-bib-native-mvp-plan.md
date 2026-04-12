# BiB Native MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a native iPhone/iPad BiB MVP that replaces the app-root WebView with native auth, discover, detail, watchlist, and profile/account deletion flows.

**Architecture:** The mobile app becomes a real Expo/React Native app with native navigation, native screen state, and a mobile-owned data layer. Supabase remains the auth/backend system, and the existing `bingeitbro.com` routes remain the API surface where that reduces migration time, but the website is no longer the app UI.

**Tech Stack:** Expo 54, React Native 0.81, React 19, TypeScript, Supabase JS, React Navigation, AsyncStorage, Apple Sign In, Google sign-in, `bingeitbro.com` API routes, Jest + React Native Testing Library.

---

## File Structure

### Mobile app files

- Create: `/Users/syam/Movie Recom/mobile/src/navigation/RootNavigator.tsx`
- Create: `/Users/syam/Movie Recom/mobile/src/navigation/AuthNavigator.tsx`
- Create: `/Users/syam/Movie Recom/mobile/src/navigation/MainTabs.tsx`
- Create: `/Users/syam/Movie Recom/mobile/src/navigation/DiscoverStack.tsx`
- Create: `/Users/syam/Movie Recom/mobile/src/navigation/types.ts`
- Create: `/Users/syam/Movie Recom/mobile/src/providers/AppProviders.tsx`
- Create: `/Users/syam/Movie Recom/mobile/src/providers/AuthProvider.tsx`
- Create: `/Users/syam/Movie Recom/mobile/src/providers/__tests__/AuthProvider.test.tsx`
- Create: `/Users/syam/Movie Recom/mobile/src/lib/config.ts`
- Create: `/Users/syam/Movie Recom/mobile/src/lib/http.ts`
- Create: `/Users/syam/Movie Recom/mobile/src/lib/supabase.ts`
- Create: `/Users/syam/Movie Recom/mobile/src/lib/apple-auth.ts`
- Create: `/Users/syam/Movie Recom/mobile/src/lib/tmdb-proxy.ts`
- Create: `/Users/syam/Movie Recom/mobile/src/lib/account.ts`
- Create: `/Users/syam/Movie Recom/mobile/src/lib/providers.ts`
- Create: `/Users/syam/Movie Recom/mobile/src/lib/watchlist.ts`
- Create: `/Users/syam/Movie Recom/mobile/src/hooks/useSession.ts`
- Create: `/Users/syam/Movie Recom/mobile/src/hooks/useDiscoverFeed.ts`
- Create: `/Users/syam/Movie Recom/mobile/src/hooks/useTitleDetail.ts`
- Create: `/Users/syam/Movie Recom/mobile/src/hooks/useWatchlist.ts`
- Create: `/Users/syam/Movie Recom/mobile/src/screens/auth/LoginScreen.tsx`
- Create: `/Users/syam/Movie Recom/mobile/src/screens/auth/SignupScreen.tsx`
- Create: `/Users/syam/Movie Recom/mobile/src/screens/auth/ResetPasswordScreen.tsx`
- Create: `/Users/syam/Movie Recom/mobile/src/screens/discover/DiscoverScreen.tsx`
- Create: `/Users/syam/Movie Recom/mobile/src/screens/discover/__tests__/DiscoverScreen.test.tsx`
- Create: `/Users/syam/Movie Recom/mobile/src/screens/detail/MovieDetailScreen.tsx`
- Create: `/Users/syam/Movie Recom/mobile/src/screens/detail/ShowDetailScreen.tsx`
- Create: `/Users/syam/Movie Recom/mobile/src/screens/watchlist/WatchlistScreen.tsx`
- Create: `/Users/syam/Movie Recom/mobile/src/screens/profile/ProfileScreen.tsx`
- Create: `/Users/syam/Movie Recom/mobile/src/components/auth/AuthForm.tsx`
- Create: `/Users/syam/Movie Recom/mobile/src/components/discover/TitleCard.tsx`
- Create: `/Users/syam/Movie Recom/mobile/src/components/discover/CountryToggle.tsx`
- Create: `/Users/syam/Movie Recom/mobile/src/components/discover/FilterSheet.tsx`
- Create: `/Users/syam/Movie Recom/mobile/src/components/detail/ProviderList.tsx`
- Create: `/Users/syam/Movie Recom/mobile/src/components/detail/__tests__/ProviderList.test.tsx`
- Create: `/Users/syam/Movie Recom/mobile/src/components/detail/DetailHero.tsx`
- Create: `/Users/syam/Movie Recom/mobile/src/components/common/LoadingState.tsx`
- Create: `/Users/syam/Movie Recom/mobile/src/components/common/ErrorState.tsx`
- Create: `/Users/syam/Movie Recom/mobile/src/components/common/EmptyState.tsx`
- Create: `/Users/syam/Movie Recom/mobile/src/components/profile/DeleteAccountSheet.tsx`
- Create: `/Users/syam/Movie Recom/mobile/src/types/index.ts`
- Create: `/Users/syam/Movie Recom/mobile/jest.config.js`
- Create: `/Users/syam/Movie Recom/mobile/jest.setup.ts`
- Create: `/Users/syam/Movie Recom/mobile/src/lib/__tests__/providers.test.ts`
- Create: `/Users/syam/Movie Recom/mobile/src/hooks/__tests__/useDiscoverFeed.test.tsx`
- Create: `/Users/syam/Movie Recom/mobile/src/hooks/__tests__/useTitleDetail.test.tsx`
- Create: `/Users/syam/Movie Recom/mobile/src/hooks/__tests__/useWatchlist.test.tsx`
- Create: `/Users/syam/Movie Recom/mobile/src/screens/auth/__tests__/SignupScreen.test.tsx`
- Create: `/Users/syam/Movie Recom/mobile/src/screens/watchlist/__tests__/WatchlistScreen.test.tsx`
- Create: `/Users/syam/Movie Recom/mobile/src/screens/profile/__tests__/DeleteAccountSheet.test.tsx`
- Modify: `/Users/syam/Movie Recom/mobile/App.tsx`
- Modify: `/Users/syam/Movie Recom/mobile/package.json`
- Modify: `/Users/syam/Movie Recom/mobile/tsconfig.json`
- Modify: `/Users/syam/Movie Recom/mobile/app.json`
- Modify: `/Users/syam/Movie Recom/mobile/app.config.ts`

### Web/backend files

- Create: `/Users/syam/Movie Recom/bib/supabase/migrations/20260323_create_watchlist.sql`
- Create: `/Users/syam/Movie Recom/bib/src/app/api/watchlist/route.ts`
- Create: `/Users/syam/Movie Recom/bib/src/app/api/watchlist/[id]/route.ts`
- Create: `/Users/syam/Movie Recom/bib/src/app/api/account/provider-credentials/route.ts`
- Modify: `/Users/syam/Movie Recom/bib/src/app/api/account/delete/route.ts`
- Modify: `/Users/syam/Movie Recom/bib/src/app/privacy/page.tsx`
- Modify: `/Users/syam/Movie Recom/bib/src/app/support/page.tsx`
- Test/manual: `/Users/syam/Movie Recom/bib/src/app/api/account/delete/route.ts`

---

## Chunk 1: Mobile foundation and native auth

### Task 1: Replace the app-root WebView with native navigation scaffolding

**Files:**
- Modify: `/Users/syam/Movie Recom/mobile/package.json`
- Modify: `/Users/syam/Movie Recom/mobile/App.tsx`
- Create: `/Users/syam/Movie Recom/mobile/src/navigation/RootNavigator.tsx`
- Create: `/Users/syam/Movie Recom/mobile/src/navigation/AuthNavigator.tsx`
- Create: `/Users/syam/Movie Recom/mobile/src/navigation/MainTabs.tsx`
- Create: `/Users/syam/Movie Recom/mobile/src/navigation/DiscoverStack.tsx`
- Create: `/Users/syam/Movie Recom/mobile/src/navigation/types.ts`
- Create: `/Users/syam/Movie Recom/mobile/src/providers/AppProviders.tsx`
- Create: `/Users/syam/Movie Recom/mobile/src/components/common/LoadingState.tsx`
- Test: `/Users/syam/Movie Recom/mobile/jest.config.js`

- [ ] **Step 1: Add the navigation and test dependencies**

Update `/Users/syam/Movie Recom/mobile/package.json` to add:

```json
{
  "dependencies": {
    "@react-navigation/bottom-tabs": "^7.4.2",
    "@react-navigation/native": "^7.1.17",
    "@react-navigation/native-stack": "^7.3.25",
    "react-native-safe-area-context": "^5.6.1",
    "react-native-screens": "^4.16.0"
  },
  "devDependencies": {
    "@testing-library/react-native": "^13.3.3",
    "jest": "^30.0.5",
    "jest-expo": "~54.0.7"
  }
}
```

- [ ] **Step 2: Install dependencies and verify lockfile changes**

Run: `cd /Users/syam/Movie Recom/mobile && npm install`
Expected: `package-lock.json` updates with the navigation and test packages.

- [ ] **Step 3: Replace the root WebView app with a provider + navigator entry**

Set `/Users/syam/Movie Recom/mobile/App.tsx` to a thin native root:

```tsx
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppProviders } from './src/providers/AppProviders';
import { RootNavigator } from './src/navigation/RootNavigator';

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AppProviders>
          <RootNavigator />
        </AppProviders>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
```

- [ ] **Step 4: Create the navigation skeleton**

Implement:
- `RootNavigator.tsx` with auth-gated routing
- `AuthNavigator.tsx` with `Login`, `Signup`, `ResetPassword`
- `MainTabs.tsx` with `Discover`, `Watchlist`, `Profile`
- `DiscoverStack.tsx` with `Discover`, `MovieDetail`, `ShowDetail`

Use a root param list like:

```ts
export type RootStackParamList = {
  Auth: undefined;
  Main: undefined;
  MovieDetail: { tmdbId: number };
  ShowDetail: { tmdbId: number };
};
```

- [ ] **Step 5: Run TypeScript to confirm the shell compiles**

Run: `cd /Users/syam/Movie Recom/mobile && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git -C /Users/syam/Movie Recom add mobile/package.json mobile/package-lock.json mobile/App.tsx mobile/src/navigation mobile/src/providers mobile/src/components/common
git -C /Users/syam/Movie Recom commit -m "feat: replace WebView shell with native navigation scaffold"
```

### Task 2: Build the shared mobile data/auth foundation

**Files:**
- Create: `/Users/syam/Movie Recom/mobile/src/lib/config.ts`
- Create: `/Users/syam/Movie Recom/mobile/src/lib/http.ts`
- Create: `/Users/syam/Movie Recom/mobile/src/lib/supabase.ts`
- Create: `/Users/syam/Movie Recom/mobile/src/lib/apple-auth.ts`
- Create: `/Users/syam/Movie Recom/mobile/src/lib/tmdb-proxy.ts`
- Create: `/Users/syam/Movie Recom/mobile/src/lib/providers.ts`
- Create: `/Users/syam/Movie Recom/mobile/src/hooks/useSession.ts`
- Create: `/Users/syam/Movie Recom/mobile/src/providers/AuthProvider.tsx`
- Create: `/Users/syam/Movie Recom/mobile/src/providers/__tests__/AuthProvider.test.tsx`
- Create: `/Users/syam/Movie Recom/bib/src/app/api/account/provider-credentials/route.ts`
- Modify: `/Users/syam/Movie Recom/mobile/app.json`
- Modify: `/Users/syam/Movie Recom/mobile/app.config.ts`

- [ ] **Step 1: Write the failing auth-provider smoke test**

Create a simple render test that expects loading state before session hydration:

```tsx
it('shows auth loading before session resolves', () => {
  const screen = render(<AuthProvider><Text>child</Text></AuthProvider>);
  expect(screen.getByText(/loading/i)).toBeTruthy();
});
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `cd /Users/syam/Movie Recom/mobile && npx jest src/providers/__tests__/AuthProvider.test.tsx --runInBand`
Expected: FAIL because the provider and test setup do not exist yet.

- [ ] **Step 3: Create the shared mobile HTTP and config layer**

Add `/Users/syam/Movie Recom/mobile/src/lib/config.ts` and `/Users/syam/Movie Recom/mobile/src/lib/http.ts`:

```ts
export const env = {
  apiBaseUrl: 'https://bingeitbro.com',
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
};
```

```ts
export async function getJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${env.apiBaseUrl}${path}`, init);
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  return response.json() as Promise<T>;
}
```

- [ ] **Step 4: Create a dedicated mobile Supabase client**

Add `/Users/syam/Movie Recom/mobile/src/lib/supabase.ts`:

```ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { env } from './config';

export const supabase = createClient(env.supabaseUrl, env.supabaseAnonKey, {
  auth: {
    flowType: 'pkce',
    persistSession: true,
    autoRefreshToken: true,
    storage: AsyncStorage,
    detectSessionInUrl: false,
  },
});
```

- [ ] **Step 5: Add the shared TMDB/provider helpers**

Create:
- `/Users/syam/Movie Recom/mobile/src/lib/tmdb-proxy.ts`
- `/Users/syam/Movie Recom/mobile/src/lib/providers.ts`

These must reuse the website backend routes and provider-shaping rules so later screens build on a stable mobile data layer.

- [ ] **Step 6: Create a real mobile auth provider**

Implement `/Users/syam/Movie Recom/mobile/src/providers/AuthProvider.tsx` with:
- `session`
- `user`
- `loading`
- `signIn`
- `signUp`
- `signOut`
- `signInWithApple`
- `signInWithGoogle`
- `deleteAccount`

No WebView bridge messages remain in this provider.

- [ ] **Step 7: Capture Apple deletion prerequisites during native sign-in**

Create `/Users/syam/Movie Recom/mobile/src/lib/apple-auth.ts` and `/Users/syam/Movie Recom/bib/src/app/api/account/provider-credentials/route.ts`.

If the native Apple auth response includes revocation-relevant material, persist only the minimum backend metadata needed for later account deletion revocation. If Supabase/native Apple auth does not expose enough information for revocation, document that explicitly in the route contract and downgrade later deletion hardening to session revocation plus limitation disclosure.

- [ ] **Step 8: Configure the app for native auth only**

Update `/Users/syam/Movie Recom/mobile/app.json` and `/Users/syam/Movie Recom/mobile/app.config.ts` so they only carry:
- bundle IDs / package IDs
- Apple sign-in
- URL scheme
- Supabase env passthrough

Do not keep WebView bootstrap logic in config.

- [ ] **Step 9: Run tests and TypeScript**

Run:
- `cd /Users/syam/Movie Recom/mobile && npx jest src/providers/__tests__/AuthProvider.test.tsx --runInBand`
- `cd /Users/syam/Movie Recom/mobile && npx tsc --noEmit`

Expected: PASS

- [ ] **Step 10: Commit**

```bash
git -C /Users/syam/Movie Recom add mobile/src/lib mobile/src/hooks mobile/src/providers mobile/app.json mobile/app.config.ts bib/src/app/api/account/provider-credentials/route.ts
git -C /Users/syam/Movie Recom commit -m "feat: add native mobile foundation and auth layer"
```

### Task 3: Build native login, signup, and reset-password screens

**Files:**
- Create: `/Users/syam/Movie Recom/mobile/src/components/auth/AuthForm.tsx`
- Create: `/Users/syam/Movie Recom/mobile/src/screens/auth/LoginScreen.tsx`
- Create: `/Users/syam/Movie Recom/mobile/src/screens/auth/SignupScreen.tsx`
- Create: `/Users/syam/Movie Recom/mobile/src/screens/auth/ResetPasswordScreen.tsx`
- Create: `/Users/syam/Movie Recom/mobile/src/screens/auth/__tests__/SignupScreen.test.tsx`

- [ ] **Step 1: Write a failing signup validation test**

```tsx
it('does not require birthday during signup', async () => {
  render(<SignupScreen />);
  fireEvent.changeText(screen.getByLabelText(/your name/i), 'Syam');
  fireEvent.changeText(screen.getByLabelText(/username/i), 'syam');
  fireEvent.changeText(screen.getByLabelText(/^email$/i), 'syam@example.com');
  fireEvent.changeText(screen.getByLabelText(/password/i), '12345678');
  fireEvent.press(screen.getByText(/create account/i));
  expect(screen.queryByText(/birthday/i)).toBeNull();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /Users/syam/Movie Recom/mobile && npx jest src/screens/auth/__tests__/SignupScreen.test.tsx --runInBand`
Expected: FAIL because the signup screen does not exist yet.

- [ ] **Step 3: Implement native auth forms**

Build the auth screens with these fields:

- Login:
  - email
  - password
  - Continue with Apple
  - Continue with Google
  - forgot password
- Signup:
  - name
  - username
  - email
  - password
  - optional birthday
  - Terms and Privacy links
- Reset:
  - email

The signup screen must explicitly label birthday as optional and must submit without it.

- [ ] **Step 4: Run the auth screen tests**

Run: `cd /Users/syam/Movie Recom/mobile && npx jest src/screens/auth/__tests__/SignupScreen.test.tsx --runInBand`
Expected: PASS

- [ ] **Step 5: Run TypeScript**

Run: `cd /Users/syam/Movie Recom/mobile && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git -C /Users/syam/Movie Recom add mobile/src/components/auth mobile/src/screens/auth
git -C /Users/syam/Movie Recom commit -m "feat: add native auth screens"
```

## Chunk 2: Discover and title detail

### Task 4: Build the typed models and feed/detail hooks

**Files:**
- Create: `/Users/syam/Movie Recom/mobile/src/types/index.ts`
- Create: `/Users/syam/Movie Recom/mobile/src/hooks/useDiscoverFeed.ts`
- Create: `/Users/syam/Movie Recom/mobile/src/hooks/useTitleDetail.ts`
- Create: `/Users/syam/Movie Recom/mobile/src/lib/__tests__/providers.test.ts`
- Create: `/Users/syam/Movie Recom/mobile/src/hooks/__tests__/useDiscoverFeed.test.tsx`
- Create: `/Users/syam/Movie Recom/mobile/src/hooks/__tests__/useTitleDetail.test.tsx`

- [ ] **Step 1: Write a failing provider mapping test**

```ts
it('maps OTT provider payload into external launch items', () => {
  const links = mapProvidersToLinks(samplePayload);
  expect(links[0]).toMatchObject({ platform: 'Netflix' });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /Users/syam/Movie Recom/mobile && npx jest src/lib/__tests__/providers.test.ts --runInBand`
Expected: FAIL because the provider mapper does not exist yet.

- [ ] **Step 3: Implement typed feed/detail hooks**

Create hooks that own loading, error, and last-good-state behavior:
- `useDiscoverFeed(country, contentType, filters)`
- `useTitleDetail(kind, tmdbId)`

If refresh fails, keep the last known list visible.

- [ ] **Step 4: Add failure-mode tests for discover and detail hooks**

Cover:
- discover refresh failure preserves the last good list
- detail provider fetch failure does not crash the title screen and returns a scoped retry state

- [ ] **Step 5: Run tests**

Run:
- `cd /Users/syam/Movie Recom/mobile && npx jest src/lib/__tests__/providers.test.ts --runInBand`
- `cd /Users/syam/Movie Recom/mobile && npx jest src/hooks/__tests__/useDiscoverFeed.test.tsx --runInBand`
- `cd /Users/syam/Movie Recom/mobile && npx jest src/hooks/__tests__/useTitleDetail.test.tsx --runInBand`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git -C /Users/syam/Movie Recom add mobile/src/types mobile/src/lib mobile/src/hooks
git -C /Users/syam/Movie Recom commit -m "feat: add native data layer for discover and detail"
```

### Task 5: Build the native Discover screen

**Files:**
- Create: `/Users/syam/Movie Recom/mobile/src/screens/discover/DiscoverScreen.tsx`
- Create: `/Users/syam/Movie Recom/mobile/src/screens/discover/__tests__/DiscoverScreen.test.tsx`
- Create: `/Users/syam/Movie Recom/mobile/src/components/discover/TitleCard.tsx`
- Create: `/Users/syam/Movie Recom/mobile/src/components/discover/CountryToggle.tsx`
- Create: `/Users/syam/Movie Recom/mobile/src/components/discover/FilterSheet.tsx`
- Create: `/Users/syam/Movie Recom/mobile/src/components/common/ErrorState.tsx`
- Create: `/Users/syam/Movie Recom/mobile/src/components/common/EmptyState.tsx`

- [ ] **Step 1: Write a failing render test for Discover**

```tsx
it('shows discover titles and supports pull to refresh state', () => {
  render(<DiscoverScreen />);
  expect(screen.getByText(/discover/i)).toBeTruthy();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /Users/syam/Movie Recom/mobile && npx jest src/screens/discover/__tests__/DiscoverScreen.test.tsx --runInBand`
Expected: FAIL because the screen does not exist yet.

- [ ] **Step 3: Implement the Discover screen**

Required UI:
- segmented movies/shows control
- India/USA country toggle
- basic filter button/sheet
- list/grid of title cards
- pull-to-refresh
- loading / empty / retry states

Use `FlatList` with stable keys and `onRefresh`.

- [ ] **Step 4: Preserve the “last good list” behavior**

Store the previous successful feed in state and render it when a refresh fails:

```ts
const [lastGoodItems, setLastGoodItems] = useState<TitleSummary[]>([]);
```

Do not replace the list with an error-only screen on refresh failure.

- [ ] **Step 5: Run TypeScript**

Run:
- `cd /Users/syam/Movie Recom/mobile && npx jest src/screens/discover/__tests__/DiscoverScreen.test.tsx --runInBand`
- `cd /Users/syam/Movie Recom/mobile && npx tsc --noEmit`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git -C /Users/syam/Movie Recom add mobile/src/screens/discover mobile/src/components/discover mobile/src/components/common
git -C /Users/syam/Movie Recom commit -m "feat: add native discover screen"
```

### Task 6: Build native movie/show detail screens

**Files:**
- Create: `/Users/syam/Movie Recom/mobile/src/screens/detail/MovieDetailScreen.tsx`
- Create: `/Users/syam/Movie Recom/mobile/src/screens/detail/ShowDetailScreen.tsx`
- Create: `/Users/syam/Movie Recom/mobile/src/components/detail/DetailHero.tsx`
- Create: `/Users/syam/Movie Recom/mobile/src/components/detail/ProviderList.tsx`
- Create: `/Users/syam/Movie Recom/mobile/src/components/detail/__tests__/ProviderList.test.tsx`

- [ ] **Step 1: Write the failing provider-list interaction test**

```tsx
it('renders provider links and allows opening OTT targets', () => {
  render(<ProviderList providers={[sampleProvider]} />);
  expect(screen.getByText(/netflix/i)).toBeTruthy();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /Users/syam/Movie Recom/mobile && npx jest src/components/detail/__tests__/ProviderList.test.tsx --runInBand`
Expected: FAIL because the detail components do not exist yet.

- [ ] **Step 3: Implement native detail screens**

Each detail screen must include:
- hero image
- title
- year
- language
- rating
- synopsis
- OTT providers
- watchlist CTA

Use separate route params for:
- `MovieDetail: { tmdbId: number }`
- `ShowDetail: { tmdbId: number }`

- [ ] **Step 4: Implement provider opening with system handoff**

Provider rows should attempt app/openable URLs first and browser fallback second:

```ts
if (provider.appUrl && await Linking.canOpenURL(provider.appUrl)) {
  await Linking.openURL(provider.appUrl);
} else {
  await Linking.openURL(provider.browserUrl);
}
```

- [ ] **Step 5: Run TypeScript**

Run:
- `cd /Users/syam/Movie Recom/mobile && npx jest src/components/detail/__tests__/ProviderList.test.tsx --runInBand`
- `cd /Users/syam/Movie Recom/mobile && npx tsc --noEmit`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git -C /Users/syam/Movie Recom add mobile/src/screens/detail mobile/src/components/detail
git -C /Users/syam/Movie Recom commit -m "feat: add native title detail screens"
```

## Chunk 3: Watchlist, profile, deletion, and review hardening

### Task 7: Add a real watchlist backend surface and native watchlist screen

**Files:**
- Create: `/Users/syam/Movie Recom/bib/supabase/migrations/20260323_create_watchlist.sql`
- Create: `/Users/syam/Movie Recom/bib/src/app/api/watchlist/route.ts`
- Create: `/Users/syam/Movie Recom/bib/src/app/api/watchlist/[id]/route.ts`
- Create: `/Users/syam/Movie Recom/bib/src/app/api/watchlist/__tests__/route.test.ts`
- Create: `/Users/syam/Movie Recom/mobile/src/lib/watchlist.ts`
- Create: `/Users/syam/Movie Recom/mobile/src/hooks/useWatchlist.ts`
- Create: `/Users/syam/Movie Recom/mobile/src/screens/watchlist/WatchlistScreen.tsx`
- Create: `/Users/syam/Movie Recom/mobile/src/hooks/__tests__/useWatchlist.test.tsx`
- Create: `/Users/syam/Movie Recom/mobile/src/screens/watchlist/__tests__/WatchlistScreen.test.tsx`

- [ ] **Step 1: Write the failing watchlist hook test**

```tsx
it('adds and removes a title optimistically', async () => {
  const { result } = renderHook(() => useWatchlist());
  await act(async () => {
    await result.current.add(sampleTitle);
  });
  expect(result.current.items).toHaveLength(1);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /Users/syam/Movie Recom/mobile && npx jest src/hooks/__tests__/useWatchlist.test.tsx --runInBand`
Expected: FAIL because the watchlist API layer does not exist yet.

- [ ] **Step 3: Create a persisted watchlist table**

Add `/Users/syam/Movie Recom/bib/supabase/migrations/20260323_create_watchlist.sql` with:

```sql
create table if not exists public.watchlist_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tmdb_id bigint not null,
  media_type text not null check (media_type in ('movie', 'tv')),
  title text not null,
  poster_path text,
  added_at timestamptz not null default now(),
  unique (user_id, tmdb_id, media_type)
);
```

Add RLS policies so users can only read and mutate their own rows.

- [ ] **Step 4: Expose the watchlist API**

Implement:
- `GET /api/watchlist`
- `POST /api/watchlist`
- `DELETE /api/watchlist/[id]`

Keep payloads small and mobile-specific.

- [ ] **Step 5: Build the mobile watchlist hook and screen**

The hook should:
- load the list
- add an item optimistically
- remove an item optimistically
- rollback on mutation failure

The screen should:
- show saved titles
- open detail on press
- show a clear empty state
- include a CTA back to Discover

- [ ] **Step 6: Add route-level verification for watchlist APIs**

Cover:
- authenticated list fetch
- add item success
- duplicate add behavior
- delete success
- unauthorized rejection

- [ ] **Step 7: Verify watchlist APIs with executable HTTP checks**

Run:
- `cd /Users/syam/Movie Recom/bib && npm run build`
- `cd /Users/syam/Movie Recom/bib && npm run start >/tmp/bib-watchlist-api.log 2>&1 &`
- `curl -i http://localhost:3000/api/watchlist`
- `curl -i -X POST http://localhost:3000/api/watchlist -H 'Content-Type: application/json' -d '{}'`

Expected:
- unauthenticated GET returns `401` or equivalent auth rejection
- invalid POST returns `400`
- authenticated manual verification is done with a real bearer token before the task is closed

- [ ] **Step 8: Run tests**

Run:
- `cd /Users/syam/Movie Recom/mobile && npx jest src/hooks/__tests__/useWatchlist.test.tsx --runInBand`
- `cd /Users/syam/Movie Recom/mobile && npx jest src/screens/watchlist/__tests__/WatchlistScreen.test.tsx --runInBand`
- `cd /Users/syam/Movie Recom/mobile && npx tsc --noEmit`

Expected: PASS

- [ ] **Step 9: Commit**

```bash
git -C /Users/syam/Movie Recom add bib/supabase/migrations/20260323_create_watchlist.sql bib/src/app/api/watchlist mobile/src/lib/watchlist.ts mobile/src/hooks/useWatchlist.ts mobile/src/screens/watchlist/WatchlistScreen.tsx mobile/src/hooks/__tests__/useWatchlist.test.tsx
git -C /Users/syam/Movie Recom commit -m "feat: add native watchlist persistence"
```

### Task 8: Build native profile/settings and harden account deletion

**Files:**
- Create: `/Users/syam/Movie Recom/mobile/src/screens/profile/ProfileScreen.tsx`
- Create: `/Users/syam/Movie Recom/mobile/src/components/profile/DeleteAccountSheet.tsx`
- Create: `/Users/syam/Movie Recom/mobile/src/lib/account.ts`
- Create: `/Users/syam/Movie Recom/mobile/src/screens/profile/__tests__/DeleteAccountSheet.test.tsx`
- Modify: `/Users/syam/Movie Recom/bib/src/app/api/account/delete/route.ts`
- Modify: `/Users/syam/Movie Recom/bib/src/app/privacy/page.tsx`
- Modify: `/Users/syam/Movie Recom/bib/src/app/support/page.tsx`

- [ ] **Step 1: Write the failing delete-account confirmation test**

```tsx
it('requires DELETE before confirming account deletion', async () => {
  render(<DeleteAccountSheet visible onConfirm={jest.fn()} />);
  fireEvent.press(screen.getByText(/delete account and data/i));
  expect(screen.getByText(/type delete/i)).toBeTruthy();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /Users/syam/Movie Recom/mobile && npx jest src/screens/profile/__tests__/DeleteAccountSheet.test.tsx --runInBand`
Expected: FAIL because the sheet does not exist yet.

- [ ] **Step 3: Implement the native profile/settings screen**

Include:
- user identity
- sign out button
- delete account and data button
- optional links to privacy/support in the system browser

Do not route deletion through any web hash or WebView.

- [ ] **Step 4: Harden the backend deletion route**

Update `/Users/syam/Movie Recom/bib/src/app/api/account/delete/route.ts` to:
- validate auth
- revoke active sessions
- attempt Sign in with Apple authorization revocation only if the prerequisite provider credentials from Task 2 are available
- delete the user

If revocation prerequisites are unavailable in the shipped auth flow, document the exact limitation in code comments and support docs, and keep deletion acceptance criteria limited to session revocation plus full account deletion.

- [ ] **Step 5: Align privacy/support copy**

Update:
- `/Users/syam/Movie Recom/bib/src/app/privacy/page.tsx`
- `/Users/syam/Movie Recom/bib/src/app/support/page.tsx`

They must describe:
- native account deletion
- optional birthday
- watchlist persistence

- [ ] **Step 6: Add integration checks for post-delete behavior**

Verify:
- delete confirmation requires `DELETE`
- successful deletion signs the user out locally
- failed deletion leaves the session intact and surfaces an actionable error

- [ ] **Step 7: Add executable route verification for account deletion**

Run:
- `cd /Users/syam/Movie Recom/bib && npm run build`
- `cd /Users/syam/Movie Recom/bib && npm run start >/tmp/bib-account-delete-api.log 2>&1 &`
- `curl -i -X POST http://localhost:3000/api/account/delete`

Expected:
- unauthenticated request returns `401`
- authenticated manual verification is completed with a valid bearer token before closing the task

- [ ] **Step 8: Run tests and TypeScript**

Run:
- `cd /Users/syam/Movie Recom/mobile && npx jest src/screens/profile/__tests__/DeleteAccountSheet.test.tsx --runInBand`
- `cd /Users/syam/Movie Recom/mobile && npx tsc --noEmit`
- `cd /Users/syam/Movie Recom/bib && npx tsc --noEmit`

Expected: PASS

- [ ] **Step 9: Commit**

```bash
git -C /Users/syam/Movie Recom add mobile/src/screens/profile mobile/src/components/profile mobile/src/lib/account.ts bib/src/app/api/account/delete/route.ts bib/src/app/privacy/page.tsx bib/src/app/support/page.tsx
git -C /Users/syam/Movie Recom commit -m "feat: add native profile and account deletion flow"
```

### Task 9: Remove the old WebView-only behavior and cut a review build

**Files:**
- Modify: `/Users/syam/Movie Recom/mobile/App.tsx`
- Modify: `/Users/syam/Movie Recom/mobile/package.json`
- Test/manual: `/Users/syam/Movie Recom/mobile`

- [ ] **Step 1: Delete the remaining app-root WebView code paths**

Remove:
- `react-native-webview`
- WebView bridge message handling
- WebView session injection
- website bootstrap scripts

The mobile root should contain only native screens and native app state.

- [ ] **Step 2: Remove obsolete dependencies**

If no longer used, remove from `package.json`:
- `react-native-webview`
- any bridge-only packages/helpers

- [ ] **Step 3: Run full mobile verification**

Run:
- `cd /Users/syam/Movie Recom/mobile && npx tsc --noEmit`
- `cd /Users/syam/Movie Recom/mobile && npx jest --runInBand`

Expected: PASS

- [ ] **Step 4: Build the iOS binary**

Run: `cd /Users/syam/Movie Recom/mobile && npm run build:ios -- --non-interactive`
Expected: EAS build completes successfully.

- [ ] **Step 5: Manual reviewer QA**

Verify on iPhone and iPad:
- launch
- actual email signup with optional birthday omitted
- actual email login
- actual Apple Sign In
- actual Google sign-in
- browse discover feed
- pull to refresh
- refresh failure preserves the last good list
- offline launch / retry behavior
- open detail
- provider failure path stays scoped to the detail screen
- save to watchlist
- open watchlist
- watchlist empty state links back to Discover
- open profile
- delete account
- post-delete sign-out
- adaptive iPad layout for auth, discover, detail, watchlist, and profile is intentionally usable rather than stretched phone UI

- [ ] **Step 6: Commit**

```bash
git -C /Users/syam/Movie Recom add mobile/App.tsx mobile/package.json mobile/package-lock.json
git -C /Users/syam/Movie Recom commit -m "refactor: remove WebView shell for native MVP"
```

---

## Review and release checklist

- [ ] App Store Connect build uses the native MVP binary, not any WebView-shell binary
- [ ] Sign in with Apple appears on login and signup
- [ ] Birthday is optional everywhere
- [ ] Account deletion is reachable natively from profile/settings
- [ ] iPad layout is tested intentionally
- [ ] No full-app WebView remains in the reviewer journey
- [ ] Privacy/support pages match shipped behavior

---

Plan complete and saved to `docs/superpowers/plans/2026-03-23-bib-native-mvp-plan.md`. Two execution options:

1. Subagent-Driven (recommended) - I dispatch a fresh subagent per task, review between tasks, fast iteration
2. Inline Execution - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
