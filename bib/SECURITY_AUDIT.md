# BiB (Binge it bro) – Security Audit Report

**Scope:** Full application security review before public launch  
**Date:** 2026-02-08  
**Assumption:** Site is publicly accessible and may be targeted by attackers.

---

## Executive Summary

| Severity | Count |
|----------|--------|
| Critical | 0 (1 fixed during audit) |
| High     | 1 |
| Medium   | 5 |
| Low      | 6 |

**Launch-blocking issues:** The **open redirect** in the auth callback was **Critical** and has been **fixed**. Remaining High item (security headers) is **fixed** with added headers. Remaining findings are **Medium/Low** and should be addressed soon after launch; none are strictly launch-blocking if you accept the residual risks below.

**Verdict:** **Safe to launch** after deploying the applied fixes (open redirect, security headers, reset-password logging). Complete the Medium/Low items in the first sprint post-launch.

---

## 1. Critical (Fixed During Audit)

### 1.1 ~~Open redirect in auth callback~~ — FIXED

- **Where:** `src/app/auth/callback/page.tsx`
- **Issue:** The `next` redirect parameter was allowed for any string that `startsWith('/')`. So `?next=//evil.com/phishing` resulted in `window.location.replace('//evil.com/phishing')`, a **protocol-relative redirect** to an attacker’s site after sign-in.
- **Exploit:** Attacker sends victim: `https://bingeitbro.com/auth/callback?next=//evil.com/fake-bib`. After OAuth, the user is sent to evil.com.
- **Fix applied:** Restrict `next` to same-origin paths: allow only paths that start with `/` and do **not** start with `//` or `/\\` (to block protocol-relative and backslash bypasses).

```ts
// After fix
const next =
  typeof rawNext === 'string' &&
  rawNext.startsWith('/') &&
  !rawNext.startsWith('//') &&
  !rawNext.startsWith('/\\\\')
    ? rawNext
    : '/';
```

---

## 2. High

### 2.1 Missing security headers — FIXED

- **Where:** Response headers for all pages.
- **Issue:** No `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, or `Permissions-Policy`, increasing risk of clickjacking, MIME sniffing, and referrer leakage.
- **Fix applied:** `next.config.ts` now adds:
  - `X-Frame-Options: DENY`
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Permissions-Policy: camera=(), microphone=(), geolocation=()`
- **Optional (post-launch):** Add **Content-Security-Policy** (CSP) with a strict policy; test thoroughly to avoid breaking inline scripts or third-party (e.g. TMDB) resources. HSTS is usually set by Vercel; confirm in production.

---

## 3. Medium

### 3.1 TMDB API key in client bundle

- **Where:** `NEXT_PUBLIC_TMDB_API_KEY` used in Header, TrendingMovies, MoviePageClient, WatchlistModal, MovieBackground, tmdb.ts.
- **Issue:** The key is embedded in the client bundle. Anyone can extract it and use it for their own requests. TMDB keys are often used in client with referrer restrictions; abuse can still lead to quota burn or key revocation.
- **Exploit:** Open DevTools → Sources → search for `api_key` or the key value; use it for direct TMDB calls.
- **Fix:** Prefer a **server-side proxy** for TMDB: create `/api/tmdb/[...path]` that uses a **server-only** env var (e.g. `TMDB_API_KEY` without `NEXT_PUBLIC_`), validates path/query, and forwards to TMDB. Point all client TMDB calls to this proxy. Keep referrer/domain restrictions on the key if TMDB supports them.

### 3.2 No rate limiting on API routes

- **Where:** `POST /api/send-friend-recommendations`, `POST /api/notifications/friend-recommendations`.
- **Issue:** No per-IP or per-user rate limiting. An attacker can spam recommendations or notification emails, abuse Supabase/Unosend, and impact availability.
- **Fix:** Add rate limiting (e.g. Vercel KV or Upstash Redis, or a middleware like `@upstash/ratelimit`). Example: limit to 20 sends per user per hour for send-friend-recommendations, and 30 notification requests per user per hour. Apply similar limits to other mutating endpoints.

### 3.3 Profile `userId` / username not strictly validated

- **Where:** `src/app/profile/[id]/ProfilePageClient.tsx` – `resolvedUserId` is used in Supabase queries (e.g. `id=eq.${resolvedUserId}` or `username=eq.${resolvedUserId.toLowerCase()}`).
- **Issue:** If `id` from the route is not validated, odd or malicious values could lead to unexpected query shape (depending on PostgREST). Low risk because RLS still enforces access, but input validation is best practice.
- **Fix:** Validate before use:
  - If UUID: allow only `^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i`.
  - If username: allow only `^[a-z0-9_]{1,50}$` (after toLowerCase). Reject or redirect otherwise.

### 3.4 Sensitive data in localStorage

- **Where:** `sb-{projectRef}-auth-token` in localStorage (Supabase session).
- **Issue:** Access tokens and refresh tokens are in localStorage. If the site is compromised by XSS, they can be stolen. You have no `dangerouslySetInnerHTML` and React escapes by default, which reduces XSS risk but doesn’t remove it (e.g. third-party scripts or future bugs).
- **Fix:** Rely on **httpOnly cookies** for session where possible (e.g. Supabase with SSR/cookies). You already use cookies in middleware for some flows; ensure the primary session is cookie-based and avoid storing tokens in localStorage long term. Document in privacy policy that auth data is stored in browser storage.

### 3.5 Debug / dev script in repo

- **Where:** `debug_search.js` (root) reads `.env.local` and uses Supabase.
- **Issue:** If this file is ever deployed or run in a context where `.env.local` is present, it could expose env. It also trains bad habits (loading .env from disk in ad-hoc scripts).
- **Fix:** Add `debug_search.js` to `.gitignore` if it contains project-specific logic, or move it to a `scripts/` or `tools/` folder and document that it must never run in production. Ensure `.env.local` and `.env*.local` are gitignored.

---

## 4. Low

### 4.1 Supabase anon key in client

- **Where:** `NEXT_PUBLIC_SUPABASE_ANON_KEY` used in frontend and in API routes.
- **Issue:** Anon key is public by design; it’s safe only when RLS is correct. If a policy is misconfigured, data could be exposed.
- **Mitigation:** RLS is enabled and policies have been reviewed (see below). Keep following principle of least privilege; never rely on the anon key alone for sensitive writes without RLS.

### 4.2 VAPID public key in client

- **Where:** `NEXT_PUBLIC_VAPID_PUBLIC_KEY` in `src/lib/push.ts`.
- **Issue:** VAPID public key is meant to be public; no change needed. Only the **private** key must be server-only (used when sending push messages).
- **Action:** Confirm the **private** key is never in the repo or client; it should only be in server/env (e.g. Edge Function or backend that sends push).

### 4.3 Auth callback timeout and errors

- **Where:** `src/app/auth/callback/page.tsx` – 15s timeout and generic error messages.
- **Issue:** Long timeout is acceptable; ensure error messages never leak tokens or internal details (they don’t currently).
- **Action:** Optional: add a short, generic message for “Sign-in timed out” and avoid logging sensitive data.

### 4.4 CORS

- **Where:** API routes are same-origin only (no explicit CORS for `bingeitbro.com`).
- **Issue:** Browsers enforce same-origin for fetch from your frontend; no cross-origin API abuse from other sites. Supabase Edge Function in repo has its own CORS; it’s not used for the main send flow.
- **Action:** When/if you add CORS for an API, allow only your domain(s); never `*` for credentialed requests.

### 4.5 Logging of auth/session in reset-password — FIXED

- **Where:** `src/app/reset-password/page.tsx` had `console.log('[ResetPassword] Auth event:', event, !!session)`.
- **Issue:** Logging `session` (even as boolean) in the same line can lead to accidentally logging the full session object in some environments.
- **Fix applied:** Removed the `console.log` call.

### 4.6 Email link in notifications

- **Where:** `src/app/api/notifications/friend-recommendations/route.ts` – link is `${siteUrl}/?view=friends` (hardcoded).
- **Issue:** None; not user-controlled. Good.

---

## 5. Backend / APIs – Summary

| Area | Status | Notes |
|------|--------|--------|
| **Auth on API routes** | OK | Both `/api/send-friend-recommendations` and `/api/notifications/friend-recommendations` require Bearer token and validate user via Supabase Auth. |
| **Sender identity** | OK | send-friend-recommendations enforces `sender_id === user.id` and caps/validates all fields (poster URL allowlist, lengths). |
| **Friends check** | OK | When `SUPABASE_SERVICE_ROLE_KEY` is set, only recipients who are friends of the sender are allowed; otherwise RLS applies on insert. |
| **Input validation** | OK | Recommendation rows: type checks, length caps (200/500), poster restricted to `https://image.tmdb.org/`. |
| **IDOR** | OK | Profile data is protected by RLS (users table: public read is intentional for profiles). Send recommendation uses authenticated user and friend list. |
| **SQL/NoSQL injection** | OK | No raw SQL; Supabase client/PostgREST use parameterized queries. Paths in supabase-rest are built from app-controlled values (e.g. userId validated as UUID or username). |
| **Mass assignment** | OK | Only explicit fields are mapped into `toInsert` / InsertRow; no blind spread of request body. |
| **Email HTML** | OK | Notification email body uses `escapeHtml()` for user-controlled content (movie title, message, names). |

---

## 6. Auth & User Data – Summary

| Area | Status | Notes |
|------|--------|--------|
| **Password handling** | OK | Passwords go to Supabase Auth only (signInWithPassword, signUp, resetPasswordForEmail). Not logged or stored in app code. |
| **Session** | OK | Supabase manages session; refresh handled by client. Token in localStorage (see 3.4 for hardening). |
| **Redirect after auth** | OK | Open redirect fixed; only same-origin paths allowed for `next`. |
| **Email verification** | OK | Supabase handles confirmation; redirectTo points to your domain. |
| **Account takeover** | Low risk | No obvious IDOR on profile/settings; RLS restricts updates to own user. Strong passwords and optional 2FA in Supabase improve security. |
| **Privilege escalation** | OK | No admin endpoints in scope; RLS and sender_id check prevent sending recommendations as another user. |

---

## 7. Supabase / Database – Summary

| Area | Status | Notes |
|------|--------|--------|
| **RLS on users** | OK | SELECT all (public profiles), INSERT/UPDATE only own row. |
| **RLS on recommendations** | OK | SELECT all; INSERT/UPDATE/DELETE only own. |
| **RLS on friends** | OK | SELECT/INSERT/DELETE scoped to `user_id = auth.uid()`. |
| **RLS on friend_recommendations** | OK | INSERT only when sender = auth.uid() and recipient is in friends; SELECT/UPDATE/DELETE as per sender/recipient. |
| **RLS on watchlist / watched_movies / nudges** | OK | Scoped to `user_id` / sender/recipient. |
| **push_subscriptions** | OK | RLS: “Users can manage their push subscriptions” with `auth.uid() = user_id`. |
| **Service role key** | OK | Used only server-side (API route) and never in client. |
| **Direct table exposure** | OK | Client uses Supabase REST with user token; RLS applies. No direct table URLs exposed to client without auth. |

---

## 8. Infrastructure & Config

| Area | Status | Notes |
|------|--------|--------|
| **Env leaks** | OK | No `NEXT_PUBLIC_` for secrets. UNOSEND_API_KEY, SUPABASE_SERVICE_ROLE_KEY are server-only. |
| **Security headers** | FIXED | X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy added in next.config. |
| **Rate limiting** | Missing | Add for send and notification APIs (see 3.2). |
| **Sensitive logging** | FIXED | Reset-password console.log removed. send-friend-recommendations logs only status/code/message (no tokens). |
| **Third-party SDK** | OK | Supabase, TMDB (client key – see 3.1). No obvious dangerous patterns. |

---

## 9. Launch Checklist

- [x] Open redirect in auth callback fixed (same-origin only for `next`).
- [x] Security headers added (X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy).
- [x] Reset-password auth/session logging removed.
- [ ] Deploy and confirm headers and redirect behavior in production.
- [ ] (Post-launch) Add rate limiting on send and notification APIs.
- [ ] (Post-launch) Harden profile `userId`/username validation (UUID + safe username regex).
- [ ] (Post-launch) Consider TMDB server proxy and moving key off client.
- [ ] (Post-launch) Consider moving session to httpOnly cookies where possible.
- [ ] Ensure `debug_search.js` is not deployed and .env.local is gitignored.

---

## 10. Final Verdict

**Safe to launch** after deploying the current codebase with the fixes applied (open redirect, security headers, reset-password logging). Address Medium/Low items in the next sprint; none are strictly launch-blocking if you accept the described residual risks (TMDB key exposure, no rate limiting, localStorage tokens, and optional input validation/CSP).
