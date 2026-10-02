# In-app account deletion

App Store Guideline 5.1.1(v) requires apps that support account creation to let users
start account deletion inside the app. Binge It Bro does this on the web and in the iOS
app (which loads bingeitbro.com), so the same flow covers both.

## Where users find it (App Review note)

Paste this into App Store Connect, App Review Information, Notes:

> To delete an account: sign in, tap the avatar in the top-right corner, then tap
> **Delete account** (at the bottom of the menu). It is also on the user's own profile
> (avatar, **View My Profile**, scroll to **Account settings**, **Delete account**).
> The user types DELETE to confirm and re-authenticates: Sign in with Apple accounts
> confirm with Apple (and the app revokes its Apple tokens), email accounts re-enter their
> password, and Google accounts must have signed in within the last 10 minutes.
> Deletion is immediate and permanent.

That is 2 taps from any screen with the header (avatar, then Delete account) before the
confirmation dialog.

## Pieces

| Piece | Location |
| --- | --- |
| API route | `src/app/api/account/delete/route.ts` (`POST /api/account/delete`) |
| Server logic (no imports; fetch + Web Crypto only) | `src/lib/server/account-deletion.ts` |
| Client helper `deleteMyAccount()` | `src/lib/account-deletion.ts` |
| Confirmation modal | `src/components/DeleteAccountModal.tsx` |
| Entry points | `src/components/Header.tsx` (user menu), `src/app/profile/[id]/ProfilePageClient.tsx` (own profile, Account settings) |
| Rate limit | `src/middleware.ts`, key `account-delete`: 10 requests per 15 minutes per IP |
| Tests (mocked fetch) | `node scripts/test-account-deletion.mjs` |

## Request and checks

`POST /api/account/delete` with `Authorization: Bearer <Supabase access token>` and JSON:

```json
{ "confirm": "DELETE", "password": "...", "appleIdentityToken": "...", "appleAuthorizationCode": "...", "appleNonce": "<raw nonce>" }
```

Nothing is deleted until all of these pass:

1. The bearer token is valid (`GET /auth/v1/user`). A valid token whose user no longer
   exists returns `200 { ok: true, alreadyDeleted: true }`, so retries are idempotent.
2. `confirm` is exactly `DELETE` (else `400 confirmation_required`).
3. Recent re-authentication, chosen from the auth user's identities (admin API):
   - **Apple identity**: the Apple env must be configured (else `503 apple_revocation_unavailable`).
     The iOS app re-runs `BibNative.signInWithApple({ nonce })` and sends the identity token,
     authorization code and raw nonce (else `400 apple_reauth_required`). The server verifies
     the identity token against Apple's JWKS (RS256), `iss`, `aud = com.bingeitbro.app`, `exp`,
     `iat` no older than 10 minutes and `nonce == sha256hex(raw nonce)` (else
     `401 apple_token_invalid`). Its `sub` must equal the user's Apple identity
     (else `403 apple_account_mismatch`).
   - **Email identity** (no Apple): the password is re-entered and checked with
     `POST /auth/v1/token?grant_type=password`; the returned user id must match
     (`401 password_required` / `401 invalid_password`). The extra session is logged out.
   - **OAuth only (Google)**: the latest JWT `amr` timestamp or `last_sign_in_at` must be within
     10 minutes, else `403 reauth_required`. The modal then offers "Sign in again with Google".
4. **Apple only**: the authorization code is exchanged at `https://appleid.apple.com/auth/token`
   with an ES256 `client_secret` JWT, and the refresh token is revoked at
   `https://appleid.apple.com/auth/revoke` (`token_type_hint=refresh_token`). Any failure
   returns `502 apple_revocation_failed` (retryable, needs a new Apple confirmation) and
   nothing is deleted.

Sign in with Apple accounts on the website (no native Apple sign-in there) are told to use
the iOS app or email support. Such an account cannot be deleted on the web because its Apple
tokens must be revoked first.

## What is deleted, in order

Every step is idempotent. If one fails the response is `500 { code: "deletion_failed",
retryable: true, step }`. The auth user is deleted last, so the user is still signed in and
**Try again** continues where it stopped.

1. `native_push_tokens` where `user_id = <id>` (stop pushes at once; it also cascades).
2. `chat_themes` (TEXT `chat_id`, no foreign key): DM themes whose `chat_id` contains the
   user id, and `group:<id>` themes of groups the user owns.
3. `DELETE /auth/v1/admin/users/<id>` (service role). Per the schema files,
   `public.users.id REFERENCES auth.users ON DELETE CASCADE` and every user-owned table
   references `public.users ... ON DELETE CASCADE`, so this removes everything below in a
   single Postgres transaction:
   - `public.users`
   - `recommendations`, `friends`, `friend_recommendations` (sent and received), `nudges`,
     `watchlist`, `watched_movies`, `top_10_picks`, `top_10_ratings`, `song_playlists`,
     `song_profile_ratings`, `watch_reminders`, `push_subscriptions`, `native_push_tokens`,
     `trivia_attempts`, `direct_messages`, `direct_message_reactions`
   - `watch_groups` the user owns (and with them their members, invites, picks, messages,
     votes, watches and reactions), plus the user's own membership, invites, picks, messages,
     votes, watches and reactions in other groups
   - rows in other users' data that point at the user's recommendations (other users'
     `watchlist`, `top_10_picks`, `nudges`, `friend_recommendations`) also cascade.
4. Fallback: if step 3 fails (for example if production's `public.users` foreign key does
   not cascade), the route deletes `public.users` where `id = <id>` (cascading the app
   tables) and retries step 3 once.

Not touched: `ai_budget_guard` (a global counter, not user data). There are no Supabase
Storage buckets (avatars are emoji or static paths) and no payment or subscription tables.

On success the client clears local data for the account (`cinema-chudu-watchlist`,
`bib_native_push_registered`, funnel keys and any key that contains the user id), clears the
iOS widget, calls `useAuth().signOut()` and goes to `/?account_deleted=1`.

No migration is required. To confirm production matches the schema files, run this read-only
query in the Supabase SQL editor (every row should show `c` for CASCADE):

```sql
select conrelid::regclass as table_name, conname, confdeltype
from pg_constraint
where contype = 'f'
  and confrelid in ('public.users'::regclass, 'auth.users'::regclass)
order by 1;
```

## Apple configuration (Cloudflare secrets)

| Variable | Value |
| --- | --- |
| `APPLE_TEAM_ID` | Apple Developer Team ID (10 characters, e.g. `M9XD55FYL5`) |
| `APPLE_KEY_ID` | Key ID of the Sign in with Apple key (10 characters) |
| `APPLE_PRIVATE_KEY` | Full contents of the `.p8` file, including the BEGIN/END lines. Real newlines or literal `\n` both work. |
| `APPLE_CLIENT_ID` | Optional. Defaults to `com.bingeitbro.app` (the bundle ID that issued the tokens). |

These are server-only secrets. Never prefix them with `NEXT_PUBLIC_`. Set them on the Worker:

```bash
npx wrangler secret put APPLE_TEAM_ID
npx wrangler secret put APPLE_KEY_ID
npx wrangler secret put APPLE_PRIVATE_KEY < AuthKey_XXXXXXXXXX.p8
```

`SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` must
also be set (as they already are for the other API routes). Without the Apple secrets,
email and Google accounts can still be deleted. Apple accounts get
`503 apple_revocation_unavailable` and nothing is deleted.

### Create the Sign in with Apple key

1. Apple Developer, Certificates, Identifiers & Profiles, **Keys**, click **+**.
2. Name it (for example "BIB Sign in with Apple"), tick **Sign in with Apple**, click
   **Configure** and pick the primary App ID `com.bingeitbro.app`. Save, Continue, Register.
3. Download the `.p8` file. You can only download it once, so store it safely. Note the
   **Key ID**.
4. The Team ID is shown at the top right of the developer portal (Membership details).
5. Add the three secrets above and deploy. To check: delete a test Apple account from the iOS
   app. The response contains `appleRevoked: true`, and the app no longer appears under
   Settings, Apple ID, Sign in with Apple on the test device.

## Testing

```bash
node scripts/test-account-deletion.mjs
```

This covers non-Apple success, Apple token exchange followed by revoke, missing Apple env,
missing Apple re-auth, Apple `sub` mismatch, bad nonce, Apple exchange failure, bad or missing
password, a stale Google session, a 401 on a missing or invalid bearer, a 400 on a missing
confirm, a mid-sequence failure that is then retried, the `public.users` fallback, and an
already-deleted account. Every rejection case asserts that no DELETE or revoke was sent.
