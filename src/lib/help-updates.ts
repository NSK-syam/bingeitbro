export type HelpUpdateTone = 'rose' | 'cyan' | 'emerald' | 'amber' | 'indigo';

export type HelpUpdate = {
  id: string;
  date: string; // YYYY-MM-DD
  tag: string;
  title: string;
  detail: string;
  tone?: HelpUpdateTone;
};

// Keep newest first. Add each product update here so Help Bot shows a full in-app changelog.
export const HELP_UPDATES: HelpUpdate[] = [
  {
    id: '2026-02-17-helpbot-full-changelog',
    date: '2026-02-17',
    tag: 'New update',
    title: 'Help Bot now shows full update history',
    detail:
      'BiB Help Bot now contains a running in-app changelog so users can see every major feature and platform update in one place.',
    tone: 'indigo',
  },
  {
    id: '2026-02-17-guest-trust-note',
    date: '2026-02-17',
    tag: 'Trust & Safety',
    title: 'Recommendations-only notice added',
    detail:
      'Landing page now clearly states BiB does not host or stream content. It recommends what to watch and points users to legal platforms.',
    tone: 'amber',
  },
  {
    id: '2026-02-17-signup-abuse-protection',
    date: '2026-02-17',
    tag: 'Security',
    title: 'Signup protection hardened',
    detail:
      'Added signup abuse controls: IP/email rate limits, cooldown, disposable email blocking, and optional Cloudflare Turnstile verification.',
    tone: 'rose',
  },
  {
    id: '2026-02-17-trivia-submit-fix',
    date: '2026-02-17',
    tag: 'Fix',
    title: 'Weekly trivia leaderboard submit fixed',
    detail:
      'Trivia attempt submission now handles all valid Supabase RPC response shapes, fixing false “Failed to submit trivia attempt” errors.',
    tone: 'emerald',
  },
  {
    id: '2026-02-17-trivia-cta',
    date: '2026-02-17',
    tag: 'Feature',
    title: 'Weekly Trivia added near Group Watch',
    detail:
      'New “Weekly Trivia” button now appears in the main feature row beside Group Watch for faster access.',
    tone: 'cyan',
  },
  {
    id: '2026-02-17-trivia-mixed-questions',
    date: '2026-02-17',
    tag: 'Feature',
    title: 'Trivia now uses mixed question types',
    detail:
      'Weekly trivia now mixes director, cast, genre, runtime, and release-year questions (instead of only release-date questions).',
    tone: 'indigo',
  },
  {
    id: '2026-02-16-group-watch-private',
    date: '2026-02-16',
    tag: 'Feature',
    title: 'Group Watch: private invites + accept/reject',
    detail:
      'Groups are invite-only. Invited users can accept or reject invites. Members can leave groups, and owners can edit group settings.',
    tone: 'cyan',
  },
  {
    id: '2026-02-16-group-watch-votes',
    date: '2026-02-16',
    tag: 'Feature',
    title: 'Group picks with upvote/downvote',
    detail:
      'Group members can add movie/show picks and vote together to decide what to watch next.',
    tone: 'emerald',
  },
  {
    id: '2026-02-16-schedule-watch-email',
    date: '2026-02-16',
    tag: 'Feature',
    title: 'Schedule Watch reminders via email',
    detail:
      'Scheduled watch reminders now support recurring dispatch and email notifications so users don’t miss planned watch time.',
    tone: 'amber',
  },
  {
    id: '2026-02-16-friend-email-reminders',
    date: '2026-02-16',
    tag: 'Feature',
    title: 'Friend recommendation email alerts',
    detail:
      'When friends send recommendations, recipients can get email alerts with quick links back into BiB.',
    tone: 'rose',
  },
  {
    id: '2026-02-16-timezone-reminders',
    date: '2026-02-16',
    tag: 'Feature',
    title: 'Schedule Watch follows local time zone',
    detail:
      'Scheduled reminders now use each user’s local timezone so reminder timing matches actual local date and time.',
    tone: 'cyan',
  },
  {
    id: '2026-02-16-profile-username-edit',
    date: '2026-02-16',
    tag: 'Feature',
    title: 'Profile username editing',
    detail:
      'Users can now update their username from profile with availability checks.',
    tone: 'emerald',
  },
  {
    id: '2026-02-16-persistent-login',
    date: '2026-02-16',
    tag: 'UX',
    title: 'Improved persistent sign-in behavior',
    detail:
      'Users stay signed in consistently across sessions until they explicitly sign out.',
    tone: 'indigo',
  },
  {
    id: '2026-02-16-email-primary-tip',
    date: '2026-02-16',
    tag: 'Inbox tip',
    title: 'Spam to Primary guidance',
    detail:
      'If BiB emails land in Spam, users should click “Report not spam” so future friend and reminder emails land in Primary inbox.',
    tone: 'rose',
  },
];

export const HELP_UPDATES_VERSION = HELP_UPDATES[0]?.id ?? 'helpbot-v1';

