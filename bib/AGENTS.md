# AGENTS.md

## Scope
- This repository is the production web app for Binge It Bro.
- Stack: Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4, Supabase.
- Package manager: `npm`.

## Commands
- Install: `npm ci`
- Build: `npm run build`
- Lint: `npm run lint`
- Prelaunch checks: `node scripts/prelaunch.mjs`
- Secret scan: `bash scripts/secret-scan.sh --all`

## Environment
- The app can build with placeholder values for Supabase, TMDB, Turnstile, UnoSend, and cron secrets.
- Prefer placeholder values unless the task explicitly requires live integration testing.
- Never commit real credentials.

## High-value Security Areas
- `src/app/api/signup/route.ts`
- `src/app/api/send-friend-recommendations/route.ts`
- `src/app/api/watch-reminders/**`
- `src/app/api/notifications/**`
- `src/app/api/stripe/**`
- `src/app/api/tmdb/**`
- `src/lib/supabase*.ts`

## Constraints
- Preserve same-origin proxying and host validation in TMDB routes.
- Preserve server/client environment boundaries.
- Do not remove RLS assumptions or service-role protections without justification.
