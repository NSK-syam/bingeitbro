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
    id: '2026-02-17-helpbot-feature-updates',
    date: '2026-02-17',
    tag: 'New update',
    title: 'Help Bot now shows feature updates',
    detail:
      'Check this panel anytime to see only new user-facing features and product changes.',
    tone: 'indigo',
  },
  {
    id: '2026-02-17-weekly-trivia',
    date: '2026-02-17',
    tag: 'Feature',
    title: 'Weekly Trivia is live',
    detail:
      'Play 10-question weekly movie trivia in English, Telugu, Hindi, and Tamil. Submit your score to the leaderboard.',
    tone: 'amber',
  },
  {
    id: '2026-02-17-trivia-access',
    date: '2026-02-17',
    tag: 'Feature',
    title: 'Quick access to Weekly Trivia',
    detail:
      'Weekly Trivia is now available from the main feature row beside Group Watch.',
    tone: 'cyan',
  },
  {
    id: '2026-02-16-group-watch',
    date: '2026-02-16',
    tag: 'Feature',
    title: 'Group Watch is live',
    detail:
      'Create private groups, invite friends, share movie/show picks, and vote together with upvotes/downvotes.',
    tone: 'indigo',
  },
  {
    id: '2026-02-16-schedule-watch',
    date: '2026-02-16',
    tag: 'Reminder',
    title: 'Schedule Watch reminders',
    detail:
      'Schedule any movie or show for later and get reminder notifications so you never miss planned watch time.',
    tone: 'amber',
  },
  {
    id: '2026-02-16-friend-email-reminders',
    date: '2026-02-16',
    tag: 'Feature',
    title: 'Friend recommendation email alerts',
    detail:
      'When friends send recommendations, users get email alerts with quick links back to BiB.',
    tone: 'rose',
  },
  {
    id: '2026-02-16-profile-username',
    date: '2026-02-16',
    tag: 'Feature',
    title: 'Profile username editing',
    detail:
      'Users can now update their username from profile.',
    tone: 'cyan',
  },
  {
    id: '2026-02-16-where-to-watch',
    date: '2026-02-16',
    tag: 'Feature',
    title: 'Where to watch support',
    detail:
      'Find legal OTT platforms for movies and shows with country-aware availability.',
    tone: 'emerald',
  },
];

export const HELP_UPDATES_VERSION = HELP_UPDATES[0]?.id ?? 'helpbot-v1';
