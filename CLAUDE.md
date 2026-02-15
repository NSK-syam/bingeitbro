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
- **OOM Errors**: Use service role key to bypass RLS, retry logic for transient failures
- **OAuth Redirect Loop**: Ensure Site URL and Redirect URLs match in Supabase dashboard
- **Navigator.locks Deadlock**: Custom lock implementation in supabase.ts
- **Friends Sync**: Lift state to parent component for shared access

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

## Development Philosophy
- **Mobile-first** responsive design
- **User privacy** - never auto-fill sensitive data
- **Friend-focused** - real recommendations over algorithms
- **Performance** - optimize for global users (USA + India)
- **Security** - RLS policies, PKCE auth, CSP headers
