# BingeItBro - Movie Recommendation Platform

A social movie recommendation platform where friends share personalized movie and series recommendations. Get recommendations from friends, not algorithms.

**Live:** [bingeitbro.com](https://bingeitbro.com)
**Repository:** github.com/NSK-syam/bingeitbro
**Development Time:** ~56 hours over 15 days (165 commits)

## Core Features
1. **Friend Recommendations** - Get personalized movie picks from people who know your taste
2. **Share Playlists** - Make your movie collection public and inspire others
3. **Email Notifications** - Never miss when friends send recommendations
4. **Schedule Watchlist** - Plan movie nights and watch when you're free
5. **Where to Watch** - Direct links to Netflix, Prime, Disney+, and 20+ OTT platforms
6. **Multi-language** - Supports 10+ languages (English, Hindi, Telugu, Tamil, Malayalam, Kannada, etc.)

## Tech Stack
- **Next.js 16** (App Router with React 19)
- **Supabase** (PostgreSQL + Auth with RLS)
- **TMDB API** (Movie metadata and streaming availability)
- **Tailwind CSS 4** (Styling)
- **Vercel** (Production hosting with edge functions)
- **TypeScript 5** (Type safety)

## Key Files & Components

### Authentication & Core
- `src/components/AuthProvider.tsx` - Auth context, login/signup/Google OAuth
- `src/components/Header.tsx` - Navigation, search, user menu
- `src/lib/supabase.ts` - Supabase client (singleton with PKCE flow)
- `src/lib/tmdb.ts` - TMDB API wrapper functions

### Features
- `src/components/SubmitRecommendation.tsx` - Add movie recommendation form
- `src/components/SendToFriendModal.tsx` - Send recommendations to friends
- `src/components/FriendRecommendationsModal.tsx` - Inbox for received recommendations
- `src/components/FriendsManager.tsx` - Manage friends list
- `src/components/WatchlistModal.tsx` - Personal watchlist management
- `src/components/ScheduleWatchModal.tsx` - Schedule movies for later
- `src/components/GroupWatchModal.tsx` - Group watch with voting

### Pages
- `src/app/page.tsx` - Home page (trending + friends feed)
- `src/app/profile/[id]/page.tsx` - User profile page
- `src/app/add/page.tsx` - Add recommendation flow
- `src/app/api/send-friend-recommendations/route.ts` - Friend recommendation API

## Database Schema (Supabase PostgreSQL)

### `users`
- `id` (UUID, PK) - References auth.users
- `email`, `name`, `username` (unique), `avatar` (emoji)
- `created_at`

### `recommendations`
- `id` (UUID, PK)
- `user_id` (FK → users.id)
- `title`, `original_title`, `year`, `type` (movie/series/documentary/anime)
- `poster`, `backdrop`, `genres[]`, `language`, `duration`, `rating`
- `personal_note`, `mood[]`, `watch_with`
- `ott_links` (JSONB), `tmdb_id`
- `created_at`, `updated_at`

### `friends`
- `id` (UUID, PK)
- `user_id`, `friend_id` (both FK → users.id)
- Unique constraint on (user_id, friend_id)

### `friend_recommendations`
- `id` (UUID, PK)
- `sender_id`, `recipient_id` (FK → users.id)
- `recommendation_id` (FK → recommendations.id, nullable)
- `tmdb_id`, `movie_title`, `movie_poster`, `movie_year`
- `personal_message`, `is_read`, `is_watched`, `watched_at`
- Unique indexes prevent duplicate sends

## Important Implementation Details

### Authentication
- Uses **PKCE flow** (most secure for SPAs)
- Custom navigator.locks override to prevent deadlocks
- Google OAuth with Supabase
- Session persistence with auto-refresh

### Performance Optimizations
- TMDB proxy for India (low latency)
- Debounced search (300ms)
- Optimistic updates for watched status
- LocalStorage for watchlist (instant access)
- Code splitting with dynamic imports
- Image optimization via Next.js

### Known Issues & Solutions

#### 1. OAuth Redirect Loop (`/?error=auth`)
**Problem**: After Google OAuth, users redirected to `/?error=auth` instead of app.
**Root Cause**: Supabase Site URL and Redirect URLs not configured for production.
**Solution**:
- In Supabase Dashboard → Authentication → URL Configuration:
  - Site URL: `https://bingeitbro.com`
  - Redirect URLs: `https://bingeitbro.com/auth/callback`, `https://bingeitbro.com/**`
- Fix auth callback code exchange in `src/app/auth/callback/page.tsx`
**Commit**: `585eb6c`

#### 2. Navigator.locks Deadlock (AbortError)
**Problem**: App freezes with `AbortError: The operation was aborted` when multiple components access Supabase auth.
**Root Cause**: `@supabase/ssr` uses `navigator.locks` internally, deadlocks with singleton client.
**Solution**:
```typescript
// src/lib/supabase.ts - Disable navigator.locks
auth: {
  flowType: 'pkce',
  lock: async (_name, _timeout, fn) => {
    return await fn();  // Execute immediately without lock
  },
}
```
**Impact**: Eliminated all AbortError crashes.

#### 3. Supabase OOM (Out of Memory) Errors (XX000)
**Problem**: Friend recommendations fail with `XX000: out of memory` when sending to multiple friends.
**Root Cause**: Supabase free tier limited memory (256MB Edge Functions, 1GB Postgres), expensive RLS evaluation.
**Solutions**:
- **A. Use Service Role Key** to bypass RLS (set `SUPABASE_SERVICE_ROLE_KEY`)
- **B. Retry Logic**: Wait 800ms and retry once on OOM error
- **C. Migrate to Next.js API Route** (from Edge Functions for more memory)
- **D. Limit payload**: Max 50 recommendations/request, truncate strings
**Commits**: `8e73751`, `6f61965`, `56ddf13`, `0e418a6`
**Impact**: Reduced OOM from ~30% to <1%

#### 4. CORS Errors with Edge Functions
**Problem**: Browser blocks requests to Supabase Edge Functions.
**Root Cause**: Different origin (`PROJECT.supabase.co` vs `bingeitbro.com`).
**Solution**: Migrated to Next.js API Routes (same-origin, no CORS needed).
**Alternative**: Add CORS headers to Edge Function responses.
**Commits**: `e8959be`, `24b8d2b`, `c7af1a3`

#### 5. Friends List Not Syncing Between Modals
**Problem**: Adding friend in FriendsManager doesn't update SendToFriendModal.
**Root Cause**: Each modal had separate `useState` for friends list.
**Solution**: Lift friends state to parent component, refetch on modal close:
```typescript
// src/app/page.tsx
const [friends, setFriends] = useState<Friend[]>([]);
const handleFriendsManagerClose = async () => {
  setShowFriendsManager(false);
  const { data } = await supabase.from('friends').select('*');
  setFriends(data ?? []);
};
```
**Commit**: `60ff3e8`

#### 6. Email Headers Failing with UnoSend
**Problem**: Transactional emails rejected due to invalid headers.
**Solution**: Normalize headers:
```typescript
const headers = {
  'From': 'Binge It Bro <noreply@bingeitbro.com>',
  'To': recipient.email,
  'Reply-To': 'support@bingeitbro.com',
  'Content-Type': 'text/html; charset=UTF-8'
};
```
**Commits**: `4950419`, `0c79c9f`

#### 7. HTML Caching on Vercel/Cloudflare
**Problem**: Users see stale content after deployment.
**Root Cause**: Default HTML caching without invalidation.
**Solution**: Disable caching in `next.config.ts`:
```typescript
async headers() {
  return [{
    source: '/:path*',
    headers: [{ key: 'Cache-Control', value: 'no-store, must-revalidate' }],
  }];
}
```
**Commits**: `328234b`, `04e7a07`

#### 8. Sitemap Base URL Incorrect
**Problem**: Sitemap shows `localhost:3000` in production.
**Solution**: Use environment variable:
```typescript
const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://bingeitbro.com';
```
**Commit**: `53e05f2`

#### 9. TMDB API Rate Limits (Future Prevention)
**Risk**: Free tier has 1000 requests/day limit.
**Prevention**: Implement caching layer for popular movies, debounce search (300ms).

#### 10. Performance Issues for India Users
**Problem**: TMDB API slow from India (300-500ms latency).
**Solution**: TMDB proxy server deployed for low-latency access.
**Commits**: Related to performance optimization sprint

## Launch Materials
- `binge-it-bro-launch-poster.html` - Twitter poster (1200x628px) with all features
- `launch-tweets.md` - 8 tweet options + Instagram/LinkedIn/Reddit content
- `DEVELOPMENT_TIMELINE.md` - Complete 56-hour development breakdown

## Documentation
- `COMPREHENSIVE_README.md` - Full technical documentation
- `DEVELOPMENT_TIMELINE.md` - Time tracking and productivity analysis
- Root `CLAUDE.md` - Project-wide instructions (macOS home directory context)

## Ignore These (don't read)
- node_modules/
- .next/
- public/
- *.lock
- .git/

## Common Commands
```bash
npm run dev          # Start dev server (localhost:3000)
npm run build        # Build for production
npm run lint         # Run ESLint
npx vercel --prod    # Deploy to Vercel production
```

## Environment Variables Required
```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
NEXT_PUBLIC_TMDB_API_KEY=your-tmdb-api-key
SUPABASE_SERVICE_ROLE_KEY=your-service-key (optional, reduces OOM)
```

## Troubleshooting Guide

### Common Errors & Quick Fixes

**Error**: `AbortError: The operation was aborted`
- **Fix**: Navigator.locks deadlock. Check `src/lib/supabase.ts` has custom lock implementation.

**Error**: `XX000: out of memory` or `Postgres XX000`
- **Fix**: OOM error. Add `SUPABASE_SERVICE_ROLE_KEY` env var, implement retry logic.

**Error**: `CORS policy: No 'Access-Control-Allow-Origin'`
- **Fix**: Use Next.js API routes instead of Edge Functions, or add CORS headers.

**Error**: OAuth redirects to `/?error=auth`
- **Fix**: Check Supabase Site URL and Redirect URLs match production domain.

**Error**: Friends not showing after adding
- **Fix**: Refetch friends list after modal closes, lift state to parent.

**Error**: Emails not sending / going to spam
- **Fix**: Check SPF/DKIM/DMARC records, normalize email headers.

**Error**: Users see old content after deploy
- **Fix**: Disable HTML caching in `next.config.ts` with `Cache-Control: no-store`.

**Error**: Search results delayed/duplicated
- **Fix**: Check debounce implementation (300ms), ensure cleanup in useEffect.

**Error**: `Module not found: Can't resolve '@supabase/ssr'`
- **Fix**: Project uses `@supabase/supabase-js` instead (to avoid navigator.locks).

**Error**: Build fails with TypeScript errors
- **Fix**: Check types in `src/lib/supabase.ts` (DBUser, DBRecommendation, etc.).

### Performance Red Flags

🔴 **If seeing slow load times**:
- Check TMDB API latency (should be <200ms)
- Verify image optimization is working (WebP format)
- Check for missing debounce on search input

🔴 **If database queries slow**:
- Check RLS policies aren't evaluating unnecessarily
- Use service role key for bulk operations
- Verify indexes exist on user_id, created_at, tmdb_id

🔴 **If friend recommendations failing**:
- Check payload size (<50 recommendations/request)
- Verify service role key is valid JWT format
- Check Supabase free tier usage (may need upgrade)

## Development Philosophy
- **Mobile-first** responsive design
- **User privacy** - never auto-fill sensitive data
- **Friend-focused** - real recommendations over algorithms
- **Performance** - optimize for global users (USA + India)
- **Security** - RLS policies, PKCE auth, CSP headers
- **Debug-friendly** - Clear error messages, comprehensive logging
- **Progressive enhancement** - LocalStorage → Supabase sync
