# Prelaunch Checklist (Automated)

Run before every production launch:

```bash
npm run prelaunch
```

The command runs these checks and prints `PASS`, `WARN`, or `FAIL`:

1. Rate limits
2. Row Level Security (RLS)
3. CAPTCHA on auth + forms
4. Server-side validation
5. API keys secured
6. Env vars set properly
7. CORS restrictions
8. Dependency audit

## Exit behavior

- Any `FAIL` -> command exits with code `1` (block launch)
- Only `PASS`/`WARN` -> exits with code `0`

## Notes per check

- `Rate limits`: looks for explicit per-request/per-user rate limiting controls in API/middleware.
- `RLS`: confirms SQL files include both `enable row level security` and `create policy`.
- `CAPTCHA`: requires both code-level CAPTCHA integration and related env keys.
- `Server-side validation`: inspects POST API routes for payload validation signals.
- `API keys secured`: scans source for obvious hardcoded secret patterns.
- `Env vars`: validates required vars plus recommended optional vars.
- `CORS`: fails on wildcard origins and prefers explicit allow-lists.
- `Dependency audit`: runs `npm audit --omit=dev` and fails on high/critical vulnerabilities.

## Typical launch flow

```bash
npm run lint
npm run build
npm run prelaunch
npm run cf:deploy
```

If `prelaunch` fails, fix blockers and re-run until clean.
