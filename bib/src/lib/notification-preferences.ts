export type NotificationCategory = 'chat' | 'recommendation' | 'schedule' | 'announcement';

export type NotificationPreferenceKey =
  | 'chatsEnabled'
  | 'recommendationsEnabled'
  | 'scheduleEnabled'
  | 'announcementsEnabled';

export type NotificationPreferences = Record<NotificationPreferenceKey, boolean>;

export type NotificationPreferenceRow = {
  user_id: string;
  chats_enabled: boolean | null;
  recommendations_enabled: boolean | null;
  schedule_enabled: boolean | null;
  announcements_enabled: boolean | null;
};

export const defaultNotificationPreferences: NotificationPreferences = {
  chatsEnabled: true,
  recommendationsEnabled: true,
  scheduleEnabled: true,
  announcementsEnabled: true,
};

export const notificationPreferenceFields = [
  'chats_enabled',
  'recommendations_enabled',
  'schedule_enabled',
  'announcements_enabled',
] as const;

export const notificationPreferenceOptions: Array<{
  key: NotificationPreferenceKey;
  label: string;
  description: string;
}> = [
  {
    key: 'chatsEnabled',
    label: 'Chats',
    description: 'Direct messages and Group Watch chat alerts.',
  },
  {
    key: 'recommendationsEnabled',
    label: 'Recommendations',
    description: 'Friend movie and show recommendations.',
  },
  {
    key: 'scheduleEnabled',
    label: 'Schedule reminders',
    description: 'Scheduled watch reminders and reminder nudges.',
  },
  {
    key: 'announcementsEnabled',
    label: 'Movie announcements',
    description: 'New-release broadcasts and major BiB alerts.',
  },
];

export function normalizeNotificationPreferences(
  value: Partial<NotificationPreferences> | null | undefined,
): NotificationPreferences {
  return {
    chatsEnabled: value?.chatsEnabled ?? defaultNotificationPreferences.chatsEnabled,
    recommendationsEnabled: value?.recommendationsEnabled ?? defaultNotificationPreferences.recommendationsEnabled,
    scheduleEnabled: value?.scheduleEnabled ?? defaultNotificationPreferences.scheduleEnabled,
    announcementsEnabled: value?.announcementsEnabled ?? defaultNotificationPreferences.announcementsEnabled,
  };
}

export function rowToNotificationPreferences(
  row: Partial<NotificationPreferenceRow> | null | undefined,
): NotificationPreferences {
  if (!row) return defaultNotificationPreferences;
  return normalizeNotificationPreferences({
    chatsEnabled: typeof row.chats_enabled === 'boolean' ? row.chats_enabled : undefined,
    recommendationsEnabled: typeof row.recommendations_enabled === 'boolean' ? row.recommendations_enabled : undefined,
    scheduleEnabled: typeof row.schedule_enabled === 'boolean' ? row.schedule_enabled : undefined,
    announcementsEnabled: typeof row.announcements_enabled === 'boolean' ? row.announcements_enabled : undefined,
  });
}

export function notificationPreferencesToRowPatch(
  value: Partial<NotificationPreferences>,
): Partial<NotificationPreferenceRow> {
  const patch: Partial<NotificationPreferenceRow> = {};
  if (typeof value.chatsEnabled === 'boolean') patch.chats_enabled = value.chatsEnabled;
  if (typeof value.recommendationsEnabled === 'boolean') patch.recommendations_enabled = value.recommendationsEnabled;
  if (typeof value.scheduleEnabled === 'boolean') patch.schedule_enabled = value.scheduleEnabled;
  if (typeof value.announcementsEnabled === 'boolean') patch.announcements_enabled = value.announcementsEnabled;
  return patch;
}

export function normalizeNotificationPreferencesPatch(
  value: unknown,
): Partial<NotificationPreferences> {
  if (!value || typeof value !== 'object') return {};
  const input = value as Record<string, unknown>;
  const patch: Partial<NotificationPreferences> = {};
  if (typeof input.chatsEnabled === 'boolean') patch.chatsEnabled = input.chatsEnabled;
  if (typeof input.recommendationsEnabled === 'boolean') {
    patch.recommendationsEnabled = input.recommendationsEnabled;
  }
  if (typeof input.scheduleEnabled === 'boolean') patch.scheduleEnabled = input.scheduleEnabled;
  if (typeof input.announcementsEnabled === 'boolean') {
    patch.announcementsEnabled = input.announcementsEnabled;
  }
  return patch;
}

export function getNotificationPreferenceKeyForCategory(
  category: NotificationCategory,
): NotificationPreferenceKey {
  switch (category) {
    case 'chat':
      return 'chatsEnabled';
    case 'recommendation':
      return 'recommendationsEnabled';
    case 'schedule':
      return 'scheduleEnabled';
    case 'announcement':
      return 'announcementsEnabled';
  }
}
