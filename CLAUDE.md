# BingeItBro - Movie Recommendation App

## Tech Stack
- Next.js 16 (App Router)
- Supabase Auth + Database
- Tailwind CSS
- Deployed on Vercel at bingeitbro.com

## Key Files
- `src/components/AuthProvider.tsx` - Auth context, signIn/signOut/Google OAuth
- `src/components/Header.tsx` - Navigation, user menu
- `src/app/profile/[id]/page.tsx` - User profile page
- `src/app/auth/callback/route.ts` - OAuth callback handler
- `src/lib/supabase.ts` - Supabase client (browser)
- `src/lib/supabase-server.ts` - Supabase client (server)

## Database Tables
- `users` - id, email, name, username, avatar, created_at
- `recommendations` - movie/show recommendations
- `friends` - friend relationships

## Ignore These (don't read)
- node_modules/
- .next/
- public/
- *.lock
- .git/

## Commands
- `npm run dev` - Start dev server
- `npm run build` - Build for production
- `npx vercel --prod` - Deploy to Vercel
