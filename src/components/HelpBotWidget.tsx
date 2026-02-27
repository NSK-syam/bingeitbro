'use client';

import { Fragment, type DragEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from './AuthProvider';
import {
  applyMentionTarget,
  filterMentionTargets,
  getMentionQueryState,
  mentionHandle,
  splitMentionSegments,
  type MentionQueryState,
  type MentionTarget,
} from '@/lib/chat-mentions';
import {
  fetchFriendsList,
  getDirectChatThreads,
  getDirectMessagesWithUser,
  getMyWatchGroups,
  getWatchGroupMembers,
  getWatchGroupMessages,
  sendDirectMessage,
  sendWatchGroupMessage,
  getChatTheme,
  setChatTheme,
  deleteDirectMessage,
  deleteWatchGroupMessage,
  toggleDirectMessageReaction,
  toggleWatchGroupMessageReaction,
  type DirectMessage,
  type DirectMessageThread,
  type FriendForSelect,
  type WatchGroupMember,
  type WatchGroupMessage,
  type WatchGroupSharedMovie,
} from '@/lib/supabase-rest';
import { ENGLISH_THEMES, TELUGU_THEMES } from '@/lib/chat-themes';

type ChatTab = 'direct' | 'groups';

const CHAT_THEMES = [...ENGLISH_THEMES, ...TELUGU_THEMES];
const CHAT_REACTION_OPTIONS = [
  '\u2764\uFE0F',
  '\uD83D\uDE02',
  '\uD83D\uDE2E',
  '\uD83D\uDE22',
  '\uD83D\uDE20',
  '\uD83D\uDE2D',
];
const THEME_STORAGE_KEY = 'bib-chat-theme';
const THEME_LANG_STORAGE_KEY = 'bib-chat-theme-lang';
const CHAT_LATEST_STORAGE_PREFIX = 'bib-chat-known-latest-v1';
const CHAT_MOVIE_DRAG_MIME = 'application/x-bib-watch-group-pick';
const CHAT_MOVIE_DRAG_TEXT_PREFIX = 'bib-chat-share:';

type GroupThreadPreview = {
  groupId: string;
  groupName: string;
  latestMessageId: string | null;
  latestBody: string;
  latestCreatedAt: string | null;
  latestSenderId: string | null;
  unseenCount?: number;
};

type PopupAlert = {
  id: string;
  kind: ChatTab;
  targetId: string;
  title: string;
  preview: string;
};

type MessageActionMenuTarget = {
  kind: ChatTab;
  messageId: string;
};

type MessageActionKind = 'reply' | 'react' | 'pin' | 'forward' | 'copy' | 'delete' | 'select';

const OWNER_CHANGE_EVENT = 'bib-chat-shortcut-owner-change';
let activeWidgetInstances: symbol[] = [];

function emitOwnerChange() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(OWNER_CHANGE_EVENT));
}

function shortTime(dateString: string | null): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function dayKey(dateString: string | null): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

function chatDayLabel(dateString: string | null): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return '';

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((today.getTime() - target.getTime()) / 86400000);

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays > 1 && diffDays < 7) {
    return target.toLocaleDateString([], { weekday: 'long' });
  }

  const sameYear = target.getFullYear() === today.getFullYear();
  return target.toLocaleDateString([], sameYear
    ? { month: 'short', day: 'numeric' }
    : { month: 'short', day: 'numeric', year: 'numeric' });
}

function trimPreview(value: string, maxLen: number = 72): string {
  const text = value.trim();
  if (!text) return 'New message';
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen - 1)}...`;
}

function chatKey(kind: ChatTab, targetId: string): string {
  return `${kind}:${targetId}`;
}

function parseDraggedSharedMovie(raw: string): WatchGroupSharedMovie | null {
  try {
    const parsed = JSON.parse(raw) as Partial<{
      mediaType: 'movie' | 'show';
      tmdbId: string;
      title: string;
      poster: string | null;
      releaseYear: number | null;
    }>;
    if (!parsed || (parsed.mediaType !== 'movie' && parsed.mediaType !== 'show')) return null;
    if (typeof parsed.tmdbId !== 'string' || !parsed.tmdbId.trim()) return null;
    if (typeof parsed.title !== 'string' || !parsed.title.trim()) return null;
    return {
      mediaType: parsed.mediaType,
      tmdbId: parsed.tmdbId.trim(),
      title: parsed.title.trim(),
      poster: typeof parsed.poster === 'string' ? parsed.poster : null,
      releaseYear: typeof parsed.releaseYear === 'number' ? parsed.releaseYear : null,
    };
  } catch {
    return null;
  }
}

function latestStorageKey(userId: string): string {
  return `${CHAT_LATEST_STORAGE_PREFIX}:${userId}`;
}

function readKnownLatest(userId: string): Record<string, string> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(latestStorageKey(userId));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    const normalized: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof key === 'string' && typeof value === 'string' && value.trim()) {
        normalized[key] = value;
      }
    }
    return normalized;
  } catch {
    return {};
  }
}

function writeKnownLatest(userId: string, value: Record<string, string>): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(latestStorageKey(userId), JSON.stringify(value));
  } catch {
    // Ignore storage quota/privacy mode failures.
  }
}

export function HelpBotWidget() {
  const { user } = useAuth();
  const instanceId = useMemo(() => Symbol('chat-shortcut-instance'), []);
  const [isActiveOwner, setIsActiveOwner] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [tab, setTab] = useState<ChatTab>('direct');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const [friends, setFriends] = useState<FriendForSelect[]>([]);
  const [directThreads, setDirectThreads] = useState<DirectMessageThread[]>([]);
  const [groupThreads, setGroupThreads] = useState<GroupThreadPreview[]>([]);
  const [selectedDirectUserId, setSelectedDirectUserId] = useState<string | null>(null);
  const [directConversationOpen, setDirectConversationOpen] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [groupConversationOpen, setGroupConversationOpen] = useState(false);
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);
  const [directMessages, setDirectMessages] = useState<DirectMessage[]>([]);
  const [groupMessages, setGroupMessages] = useState<WatchGroupMessage[]>([]);
  const [groupMembersByGroup, setGroupMembersByGroup] = useState<Record<string, WatchGroupMember[]>>({});
  const [composer, setComposer] = useState('');
  const [composerSharedMovie, setComposerSharedMovie] = useState<WatchGroupSharedMovie | null>(null);
  const [composerDropActive, setComposerDropActive] = useState(false);
  const [composerMentionQuery, setComposerMentionQuery] = useState<MentionQueryState | null>(null);
  const [composerMentionIndex, setComposerMentionIndex] = useState(0);
  const [replyingToMessage, setReplyingToMessage] = useState<DirectMessage | WatchGroupMessage | null>(null);
  const [reactionPickerMessageId, setReactionPickerMessageId] = useState<string | null>(null);
  const [messageActionMenu, setMessageActionMenu] = useState<MessageActionMenuTarget | null>(null);
  const [reactingMessageId, setReactingMessageId] = useState<string | null>(null);
  const [chatActionToast, setChatActionToast] = useState('');
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedMessageKeys, setSelectedMessageKeys] = useState<Record<string, true>>({});
  const [pinnedMessageKeys, setPinnedMessageKeys] = useState<Record<string, true>>({});
  const [popups, setPopups] = useState<PopupAlert[]>([]);
  const [unreadByChat, setUnreadByChat] = useState<Record<string, PopupAlert>>({});

  const [themeMap, setThemeMap] = useState<Record<string, string>>(() => {
    if (typeof window === 'undefined') return {};
    try {
      const stored = localStorage.getItem(THEME_STORAGE_KEY);
      if (stored) {
        if (stored.startsWith('{')) return JSON.parse(stored);
        return { global: stored };
      }
    } catch {
      // ignore
    }
    return {};
  });

  const [themeLang, setThemeLang] = useState<'English' | 'Telugu'>(() => {
    if (typeof window === 'undefined') return 'English';
    return (localStorage.getItem(THEME_LANG_STORAGE_KEY) as 'English' | 'Telugu') ?? 'English';
  });
  const [showThemePicker, setShowThemePicker] = useState(false);

  const currentChatKey = useMemo(() => {
    if (tab === 'direct' && directConversationOpen && selectedDirectUserId && user?.id) {
      // Sort IDs alphabetically to ensure both users have the exact same chat key
      const sorted = [user.id, selectedDirectUserId].sort();
      return `direct:${sorted[0]}_${sorted[1]}`;
    }
    if (tab === 'groups' && selectedGroupId) {
      return `group:${selectedGroupId}`;
    }
    return 'global';
  }, [tab, directConversationOpen, selectedDirectUserId, selectedGroupId, user?.id]);

  const activeThemeId = themeMap[currentChatKey] || 'default';
  const activeTheme = CHAT_THEMES.find((t) => t.id === activeThemeId) ?? ENGLISH_THEMES[0];

  // Fetch the synchronized theme from Supabase when the chat key changes
  useEffect(() => {
    if (currentChatKey === 'global') return;
    let isActive = true;

    async function fetchDatabaseTheme() {
      try {
        const themeId = await getChatTheme(currentChatKey);
        if (themeId && isActive) {
          setThemeMap((prev) => {
            if (prev[currentChatKey] === themeId) return prev;
            const next = { ...prev, [currentChatKey]: themeId };
            if (typeof window !== 'undefined') {
              localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(next));
            }
            return next;
          });
        }
      } catch (err) {
        console.error('Error fetching theme from database', err);
      }
    }

    fetchDatabaseTheme();
    const intervalId = window.setInterval(fetchDatabaseTheme, 12000);
    return () => {
      isActive = false;
      window.clearInterval(intervalId);
    };
  }, [currentChatKey]);

  const selectTheme = async (themeId: string) => {
    setThemeMap((prev) => {
      const next = { ...prev, [currentChatKey]: themeId };
      if (typeof window !== 'undefined') {
        localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(next));
      }
      return next;
    });
    setShowThemePicker(false);

    // Asynchronously push to database if it's a specific conversation
    if (currentChatKey !== 'global') {
      try {
        await setChatTheme(currentChatKey, themeId);
      } catch (err) {
        console.error('Failed to sync theme to database:', err);
      }
    }
  };

  const knownLatestByThreadRef = useRef<Record<string, string>>({});
  const knownGroupUnseenRef = useRef<Record<string, number>>({});
  const initializedRef = useRef(false);
  const chatBodyRef = useRef<HTMLDivElement>(null);
  const composerInputRef = useRef<HTMLInputElement>(null);
  const knownLatestBootstrappedUserRef = useRef<string | null>(null);
  const reactionLongPressTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const syncOwner = () => {
      setIsActiveOwner(activeWidgetInstances[0] === instanceId);
    };

    activeWidgetInstances.push(instanceId);
    syncOwner();
    if (typeof window !== 'undefined') {
      window.addEventListener(OWNER_CHANGE_EVENT, syncOwner);
    }
    emitOwnerChange();

    return () => {
      activeWidgetInstances = activeWidgetInstances.filter((id) => id !== instanceId);
      if (typeof window !== 'undefined') {
        window.removeEventListener(OWNER_CHANGE_EVENT, syncOwner);
      }
      emitOwnerChange();
    };
  }, [instanceId]);

  const loadDirectConversation = useCallback(async (currentUserId: string, peerUserId: string) => {
    const rows = await getDirectMessagesWithUser(currentUserId, peerUserId);
    setDirectMessages(rows);
  }, []);

  const loadGroupConversation = useCallback(async (currentUserId: string, groupId: string) => {
    const rows = await getWatchGroupMessages(groupId, currentUserId);
    setGroupMessages(rows);
  }, []);

  const refreshThreads = useCallback(
    async (silent: boolean = false) => {
      if (!user?.id) return;
      if (!silent) setLoading(true);

      try {
        const [friendRows, directRows, groups] = await Promise.all([
          fetchFriendsList(user.id).catch(() => []),
          getDirectChatThreads(user.id).catch(() => []),
          getMyWatchGroups(user.id).catch(() => []),
        ]);

        setFriends(friendRows);
        setDirectThreads(directRows);

        const shouldLoadFullGroupPreviews = isOpen;
        const groupRows = shouldLoadFullGroupPreviews
          ? await Promise.all(
            groups.map(async (group) => {
              const messages = await getWatchGroupMessages(group.id, user.id).catch(() => []);
              const latest = messages.length > 0 ? messages[messages.length - 1] : null;
              return {
                groupId: group.id,
                groupName: group.name,
                latestMessageId: latest?.id ?? null,
                latestBody: latest?.body ?? '',
                latestCreatedAt: latest?.createdAt ?? null,
                latestSenderId: latest?.senderId ?? null,
                unseenCount: group.unseenCount ?? 0,
              } satisfies GroupThreadPreview;
            }),
          )
          : groups.map((group) => ({
            groupId: group.id,
            groupName: group.name,
            latestMessageId: null,
            latestBody: group.unseenCount > 0
              ? `${group.unseenCount} new message${group.unseenCount > 1 ? 's' : ''}`
              : 'No messages yet',
            latestCreatedAt: group.updatedAt ?? null,
            latestSenderId: null,
            unseenCount: group.unseenCount ?? 0,
          } satisfies GroupThreadPreview));

        const sortedGroups = [...groupRows].sort((a, b) => {
          const unseenDiff = (b.unseenCount ?? 0) - (a.unseenCount ?? 0);
          if (unseenDiff !== 0) return unseenDiff;
          if (!a.latestCreatedAt && !b.latestCreatedAt) {
            return a.groupName.localeCompare(b.groupName);
          }
          if (!a.latestCreatedAt) return 1;
          if (!b.latestCreatedAt) return -1;
          return new Date(b.latestCreatedAt).getTime() - new Date(a.latestCreatedAt).getTime();
        });
        setGroupThreads(sortedGroups);

        setSelectedDirectUserId((prev) => {
          if (prev && (directRows.some((row) => row.peerId === prev) || friendRows.some((row) => row.id === prev))) {
            return prev;
          }
          if (directRows.length > 0) return directRows[0].peerId;
          if (friendRows.length > 0) return friendRows[0].id;
          return null;
        });

        setSelectedGroupId((prev) => {
          if (prev && sortedGroups.some((group) => group.groupId === prev)) return prev;
          return sortedGroups[0]?.groupId ?? null;
        });

        const latestByThread: Record<string, string> = { ...knownLatestByThreadRef.current };
        const newPopups: PopupAlert[] = [];
        const unreadAdds: PopupAlert[] = [];

        for (const thread of directRows) {
          const key = `d:${thread.peerId}`;
          const prevId = knownLatestByThreadRef.current[key];
          latestByThread[key] = thread.latestMessageId;
          if (thread.latestFromMe) continue;
          if (!initializedRef.current) continue;
          if (prevId !== thread.latestMessageId) {
            const isActiveDirectThread =
              isOpen &&
              tab === 'direct' &&
              directConversationOpen &&
              selectedDirectUserId === thread.peerId;
            if (isActiveDirectThread) continue;
            newPopups.push({
              id: `d-${thread.latestMessageId}`,
              kind: 'direct',
              targetId: thread.peerId,
              title: thread.peerName,
              preview: trimPreview(thread.latestBody),
            });
            unreadAdds.push({
              id: `d-${thread.latestMessageId}`,
              kind: 'direct',
              targetId: thread.peerId,
              title: thread.peerName,
              preview: trimPreview(thread.latestBody),
            });
          }
        }

        if (shouldLoadFullGroupPreviews) {
          const nextUnseen = { ...knownGroupUnseenRef.current };
          for (const group of sortedGroups) {
            nextUnseen[group.groupId] = Math.max(0, group.unseenCount ?? 0);
            if (!group.latestMessageId || !group.latestSenderId) continue;
            const key = `g:${group.groupId}`;
            const prevId = knownLatestByThreadRef.current[key];
            latestByThread[key] = group.latestMessageId;
            if (group.latestSenderId === user.id) continue;
            if (!initializedRef.current) continue;
            if (prevId !== group.latestMessageId) {
              const isActiveGroupThread =
                isOpen &&
                tab === 'groups' &&
                selectedGroupId === group.groupId;
              if (isActiveGroupThread) continue;
              newPopups.push({
                id: `g-${group.latestMessageId}`,
                kind: 'groups',
                targetId: group.groupId,
                title: group.groupName,
                preview: trimPreview(group.latestBody || 'New group message'),
              });
              unreadAdds.push({
                id: `g-${group.latestMessageId}`,
                kind: 'groups',
                targetId: group.groupId,
                title: group.groupName,
                preview: trimPreview(group.latestBody || 'New group message'),
              });
            }
          }
          knownGroupUnseenRef.current = nextUnseen;
        } else {
          const nextUnseen = { ...knownGroupUnseenRef.current };
          for (const group of sortedGroups) {
            const currentUnseen = Math.max(0, group.unseenCount ?? 0);
            const previousUnseen = Math.max(0, knownGroupUnseenRef.current[group.groupId] ?? 0);
            nextUnseen[group.groupId] = currentUnseen;
            if (!initializedRef.current || currentUnseen <= previousUnseen) continue;
            const popupId = `g-unseen-${group.groupId}-${currentUnseen}`;
            const preview = trimPreview(`${currentUnseen} unread message${currentUnseen > 1 ? 's' : ''}`);
            newPopups.push({
              id: popupId,
              kind: 'groups',
              targetId: group.groupId,
              title: group.groupName,
              preview,
            });
            unreadAdds.push({
              id: popupId,
              kind: 'groups',
              targetId: group.groupId,
              title: group.groupName,
              preview,
            });
          }
          knownGroupUnseenRef.current = nextUnseen;
        }

        knownLatestByThreadRef.current = latestByThread;
        writeKnownLatest(user.id, latestByThread);
        if (!initializedRef.current) {
          initializedRef.current = true;
        } else {
          if (newPopups.length > 0) {
            setPopups((prev) => {
              const next = [...prev];
              for (const popup of newPopups) {
                const idx = next.findIndex((row) => row.id === popup.id);
                if (idx !== -1) next.splice(idx, 1);
                next.unshift(popup);
              }
              return next.slice(0, 10);
            });
          }
          if (unreadAdds.length > 0) {
            setUnreadByChat((prev) => {
              const next = { ...prev };
              for (const alert of unreadAdds) {
                next[chatKey(alert.kind, alert.targetId)] = alert;
              }
              return next;
            });
          }
        }
      } catch (err) {
        if (!silent) {
          setError(err instanceof Error ? err.message : 'Failed to load chat shortcuts.');
        }
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [user?.id, isOpen, tab, directConversationOpen, selectedDirectUserId, selectedGroupId],
  );

  useEffect(() => {
    if (!isActiveOwner || !user?.id) {
      setIsOpen(false);
      setError('');
      setFriends([]);
      setDirectThreads([]);
      setGroupThreads([]);
      setDirectMessages([]);
      setGroupMessages([]);
      setGroupMembersByGroup({});
      setComposer('');
      setComposerSharedMovie(null);
      setComposerDropActive(false);
      setComposerMentionQuery(null);
      setComposerMentionIndex(0);
      setReplyingToMessage(null);
      setReactionPickerMessageId(null);
      setMessageActionMenu(null);
      setReactingMessageId(null);
      setSelectedDirectUserId(null);
      setDirectConversationOpen(false);
      setSelectedGroupId(null);
      setGroupConversationOpen(false);
      setUnreadByChat({});
      knownLatestByThreadRef.current = {};
      knownGroupUnseenRef.current = {};
      initializedRef.current = false;
      knownLatestBootstrappedUserRef.current = null;
      return;
    }
    if (knownLatestBootstrappedUserRef.current !== user.id) {
      const restored = readKnownLatest(user.id);
      knownLatestByThreadRef.current = restored;
      initializedRef.current = Object.keys(restored).length > 0;
      knownLatestBootstrappedUserRef.current = user.id;
    }
    void refreshThreads(false);
  }, [isActiveOwner, user?.id, refreshThreads]);

  useEffect(() => {
    if (!isActiveOwner || !user?.id) return;
    const intervalId = window.setInterval(() => {
      void refreshThreads(true);
    }, isOpen ? 6000 : 15000);
    return () => window.clearInterval(intervalId);
  }, [isActiveOwner, user?.id, refreshThreads, isOpen]);

  useEffect(() => {
    if (!isActiveOwner || !user?.id) return;
    const onFocus = () => {
      void refreshThreads(true);
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void refreshThreads(true);
      }
    };

    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [isActiveOwner, user?.id, refreshThreads]);

  useEffect(() => {
    if (!user?.id || !selectedDirectUserId) {
      setDirectMessages([]);
      setDirectConversationOpen(false);
      setReplyingToMessage(null);
      setReactionPickerMessageId(null);
      setComposerMentionQuery(null);
      setComposerMentionIndex(0);
      setComposerSharedMovie(null);
      setComposerDropActive(false);
      return;
    }
    setReactionPickerMessageId(null);
    setMessageActionMenu(null);
    setComposerMentionQuery(null);
    setComposerMentionIndex(0);
    setComposerSharedMovie(null);
    setComposerDropActive(false);
    void loadDirectConversation(user.id, selectedDirectUserId).catch(() => undefined);
  }, [user?.id, selectedDirectUserId, loadDirectConversation]);

  useEffect(() => {
    if (!user?.id || !selectedGroupId) {
      setGroupMessages([]);
      setGroupConversationOpen(false);
      setReplyingToMessage(null);
      setReactionPickerMessageId(null);
      setComposerMentionQuery(null);
      setComposerMentionIndex(0);
      setComposerSharedMovie(null);
      setComposerDropActive(false);
      return;
    }
    setReactionPickerMessageId(null);
    setComposerMentionQuery(null);
    setComposerMentionIndex(0);
    setComposerSharedMovie(null);
    setComposerDropActive(false);
    void loadGroupConversation(user.id, selectedGroupId).catch(() => undefined);
  }, [user?.id, selectedGroupId, loadGroupConversation]);

  useEffect(() => {
    if (!selectedGroupId) {
      setComposerMentionQuery(null);
      setComposerMentionIndex(0);
      return;
    }
    if (groupMembersByGroup[selectedGroupId]) return;
    void getWatchGroupMembers(selectedGroupId)
      .then((rows) => {
        setGroupMembersByGroup((prev) => ({ ...prev, [selectedGroupId]: rows }));
      })
      .catch(() => undefined);
  }, [selectedGroupId, groupMembersByGroup]);

  useEffect(() => {
    if (!isOpen) return;
    const el = chatBodyRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [isOpen, tab, directMessages, groupMessages]);

  useEffect(() => {
    if (!isOpen) {
      setReactionPickerMessageId(null);
      setMessageActionMenu(null);
      setComposerSharedMovie(null);
      setComposerDropActive(false);
      setComposerMentionQuery(null);
      setComposerMentionIndex(0);
      setGroupConversationOpen(false);
      return;
    }
    if (tab !== 'groups') {
      setComposerMentionQuery(null);
      setComposerMentionIndex(0);
    }
  }, [isOpen, tab, directConversationOpen]);

  useEffect(() => {
    if (!chatActionToast) return;
    const t = window.setTimeout(() => setChatActionToast(''), 1800);
    return () => window.clearTimeout(t);
  }, [chatActionToast]);

  const clearReactionLongPress = useCallback(() => {
    if (reactionLongPressTimerRef.current !== null) {
      window.clearTimeout(reactionLongPressTimerRef.current);
      reactionLongPressTimerRef.current = null;
    }
  }, []);

  const startMessageLongPress = useCallback((kind: ChatTab, messageId: string) => {
    clearReactionLongPress();
    reactionLongPressTimerRef.current = window.setTimeout(() => {
      setReactionPickerMessageId(null);
      setMessageActionMenu({ kind, messageId });
      reactionLongPressTimerRef.current = null;
    }, 380);
  }, [clearReactionLongPress]);

  useEffect(() => {
    return () => {
      clearReactionLongPress();
    };
  }, [clearReactionLongPress]);

  const directList = useMemo(() => {
    const byPeer = new Map(directThreads.map((thread) => [thread.peerId, thread]));
    const recentDirect = directThreads.map((thread) => ({
      peerId: thread.peerId,
      name: thread.peerName,
      username: thread.peerUsername,
      avatar: thread.peerAvatar,
      preview: trimPreview(thread.latestBody),
      time: shortTime(thread.latestCreatedAt),
      latestCreatedAt: thread.latestCreatedAt,
    }));
    const freshFriends = friends
      .filter((friend) => !byPeer.has(friend.id))
      .map((friend) => ({
        peerId: friend.id,
        name: friend.name || 'Friend',
        username: friend.username ?? null,
        avatar: friend.avatar ?? null,
        preview: 'Start chatting',
        time: '',
        latestCreatedAt: null as string | null,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return [...recentDirect, ...freshFriends];
  }, [directThreads, friends]);

  const activeDirect = useMemo(
    () => directList.find((thread) => thread.peerId === selectedDirectUserId) ?? null,
    [directList, selectedDirectUserId],
  );

  const activeGroup = useMemo(
    () => groupThreads.find((group) => group.groupId === selectedGroupId) ?? null,
    [groupThreads, selectedGroupId],
  );

  const directMessageById = useMemo(
    () => new Map(directMessages.map((message) => [message.id, message])),
    [directMessages],
  );

  const groupMessageById = useMemo(
    () => new Map(groupMessages.map((message) => [message.id, message])),
    [groupMessages],
  );

  const groupMentionTargets = useMemo<MentionTarget[]>(
    () =>
      tab === 'groups' && selectedGroupId
        ? (groupMembersByGroup[selectedGroupId] ?? []).map((member) => ({
          id: member.userId,
          name: member.name,
          username: member.username,
        }))
        : [],
    [groupMembersByGroup, selectedGroupId, tab],
  );

  const filteredComposerMentions = useMemo(
    () =>
      tab === 'groups' && composerMentionQuery
        ? filterMentionTargets(groupMentionTargets, composerMentionQuery.query, user?.id ?? null)
        : [],
    [tab, composerMentionQuery, groupMentionTargets, user?.id],
  );

  const renderMessageBody = useCallback((value: string) => (
    <>
      {splitMentionSegments(value).map((segment, index) => (
        <span
          key={`mention-segment-${index}-${segment.mention ? 'm' : 't'}`}
          className={segment.mention ? 'font-semibold text-cyan-200' : undefined}
        >
          {segment.text}
        </span>
      ))}
    </>
  ), []);

  const selectedMessageCount = Object.keys(selectedMessageKeys).length;
  const messageKey = useCallback((kind: ChatTab, messageId: string) => `${kind}:${messageId}`, []);

  const toggleMessageSelection = useCallback((kind: ChatTab, messageId: string) => {
    const key = `${kind}:${messageId}`;
    setSelectedMessageKeys((prev) => {
      if (prev[key]) {
        const next = { ...prev };
        delete next[key];
        return next;
      }
      return { ...prev, [key]: true };
    });
  }, []);

  const getActionMenuMessage = useCallback((kind: ChatTab, messageId: string) => {
    if (kind === 'direct') {
      return directMessageById.get(messageId) ?? null;
    }
    return groupMessageById.get(messageId) ?? null;
  }, [directMessageById, groupMessageById]);

  const getMessageActionText = useCallback((message: DirectMessage | WatchGroupMessage | null) => {
    if (!message) return '';
    const body = message.body?.trim();
    if (body) return body;
    if ('sharedMovie' in message && message.sharedMovie?.title) return `Shared: ${message.sharedMovie.title}`;
    return '';
  }, []);

  const closeMessageTools = useCallback(() => {
    setMessageActionMenu(null);
    setReactionPickerMessageId(null);
  }, []);

  const handleMessageAction = useCallback(async (kind: ChatTab, messageId: string, action: MessageActionKind) => {
    const message = getActionMenuMessage(kind, messageId);
    if (!message) {
      setMessageActionMenu(null);
      return;
    }

    const text = getMessageActionText(message);

    if (action === 'reply') {
      setReplyingToMessage(message);
      setMessageActionMenu(null);
      return;
    }

    if (action === 'react') {
      setMessageActionMenu(null);
      setReactionPickerMessageId(messageId);
      return;
    }

    if (action === 'pin') {
      const key = `${kind}:${messageId}`;
      setPinnedMessageKeys((prev) => {
        const next = { ...prev };
        if (next[key]) delete next[key];
        else next[key] = true;
        return next;
      });
      setChatActionToast(pinnedMessageKeys[key] ? 'Message unpinned' : 'Message pinned');
      setMessageActionMenu(null);
      return;
    }

    if (action === 'select') {
      setSelectionMode(true);
      toggleMessageSelection(kind, messageId);
      setMessageActionMenu(null);
      return;
    }

    if (action === 'copy' || action === 'forward') {
      if (!text) {
        setChatActionToast('Nothing to copy');
        setMessageActionMenu(null);
        return;
      }
      if (action === 'forward' && typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
        try {
          await navigator.share({ text });
          setChatActionToast('Forwarded');
          setMessageActionMenu(null);
          return;
        } catch {
          // Fallback to copy below.
        }
      }
      try {
        await navigator.clipboard.writeText(text);
        setChatActionToast(action === 'forward' ? 'Forward text copied' : 'Copied');
      } catch {
        setError('Failed to copy message.');
      }
      setMessageActionMenu(null);
      return;
    }

    if (action === 'delete') {
      setMessageActionMenu(null);
      if (!user?.id) return;
      if (!message.mine) {
        setChatActionToast('Only your messages can be deleted');
        return;
      }
      setError('');
      try {
        if (kind === 'direct') {
          if (!selectedDirectUserId) return;
          await deleteDirectMessage({ messageId, userId: user.id });
          await loadDirectConversation(user.id, selectedDirectUserId);
        } else {
          if (!selectedGroupId) return;
          await deleteWatchGroupMessage({ messageId, userId: user.id });
          await loadGroupConversation(user.id, selectedGroupId);
        }
        await refreshThreads(true);
        setChatActionToast('Message deleted');
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to delete message.';
        setError(msg);
      }
    }
  }, [
    getActionMenuMessage,
    getMessageActionText,
    pinnedMessageKeys,
    toggleMessageSelection,
    user?.id,
    selectedDirectUserId,
    selectedGroupId,
    loadDirectConversation,
    loadGroupConversation,
    refreshThreads,
  ]);

  const popupCount = Object.keys(unreadByChat).length;
  const hasUnreadThread = useCallback((kind: ChatTab, targetId: string) => {
    return Boolean(unreadByChat[chatKey(kind, targetId)]);
  }, [unreadByChat]);
  const directUnreadThreadCount = useMemo(
    () => directList.reduce((count, thread) => count + (hasUnreadThread('direct', thread.peerId) ? 1 : 0), 0),
    [directList, hasUnreadThread],
  );
  const groupUnreadThreadCount = useMemo(
    () =>
      groupThreads.reduce((count, group) => {
        const hasUnread = (group.unseenCount ?? 0) > 0 || hasUnreadThread('groups', group.groupId);
        return count + (hasUnread ? 1 : 0);
      }, 0),
    [groupThreads, hasUnreadThread],
  );
  const allUnreadThreadCount = directUnreadThreadCount + groupUnreadThreadCount;
  const visibleDirectList = useMemo(
    () => (showUnreadOnly ? directList.filter((thread) => hasUnreadThread('direct', thread.peerId)) : directList),
    [showUnreadOnly, directList, hasUnreadThread],
  );
  const visibleGroupThreads = useMemo(
    () =>
      showUnreadOnly
        ? groupThreads.filter((group) => (group.unseenCount ?? 0) > 0 || hasUnreadThread('groups', group.groupId))
        : groupThreads,
    [showUnreadOnly, groupThreads, hasUnreadThread],
  );
  const showCombinedChatList = !directConversationOpen && !groupConversationOpen;
  const activeMessageActionTarget = messageActionMenu;
  const activeMessageActionMessage = activeMessageActionTarget
    ? getActionMenuMessage(activeMessageActionTarget.kind, activeMessageActionTarget.messageId)
    : null;
  const activeMessageActionText = getMessageActionText(activeMessageActionMessage);
  const visibleAllChatRows = useMemo(() => {
    const directRows = visibleDirectList.map((thread) => {
      const isUnread = hasUnreadThread('direct', thread.peerId);
      return {
        key: `d:${thread.peerId}`,
        kind: 'direct' as const,
        targetId: thread.peerId,
        name: thread.name,
        preview: thread.preview,
        time: thread.time,
        sortAt: thread.latestCreatedAt,
        unreadCount: isUnread ? 1 : 0,
        isSelected: tab === 'direct' && selectedDirectUserId === thread.peerId,
      };
    });
    const groupRows = visibleGroupThreads.map((group) => {
      const localUnread = hasUnreadThread('groups', group.groupId);
      const unreadCount = Math.max(group.unseenCount ?? 0, localUnread ? 1 : 0);
      return {
        key: `g:${group.groupId}`,
        kind: 'groups' as const,
        targetId: group.groupId,
        name: group.groupName,
        preview: trimPreview(group.latestBody || 'No messages yet'),
        time: shortTime(group.latestCreatedAt),
        sortAt: group.latestCreatedAt,
        unreadCount,
        isSelected: tab === 'groups' && selectedGroupId === group.groupId,
      };
    });

    return [...directRows, ...groupRows].sort((a, b) => {
      const unreadDiff = b.unreadCount - a.unreadCount;
      if (unreadDiff !== 0) return unreadDiff;
      if (a.sortAt && b.sortAt) {
        return new Date(b.sortAt).getTime() - new Date(a.sortAt).getTime();
      }
      if (a.sortAt) return -1;
      if (b.sortAt) return 1;
      if (a.kind !== b.kind) return a.kind === 'groups' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }, [
    visibleDirectList,
    visibleGroupThreads,
    hasUnreadThread,
    selectedDirectUserId,
    selectedGroupId,
    tab,
  ]);

  const removePopup = useCallback((popupId: string) => {
    setPopups((prev) => prev.filter((item) => item.id !== popupId));
  }, []);

  const clearPopupsForTarget = useCallback((kind: ChatTab, targetId: string) => {
    setPopups((prev) => prev.filter((item) => !(item.kind === kind && item.targetId === targetId)));
  }, []);

  const clearUnreadForTarget = useCallback((kind: ChatTab, targetId: string) => {
    setUnreadByChat((prev) => {
      const key = chatKey(kind, targetId);
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  const openDirectConversation = useCallback((peerId: string) => {
    setTab('direct');
    setSelectedDirectUserId(peerId);
    setDirectConversationOpen(true);
    setComposer('');
    setComposerSharedMovie(null);
    setComposerDropActive(false);
    setComposerMentionQuery(null);
    setComposerMentionIndex(0);
    closeMessageTools();
    clearPopupsForTarget('direct', peerId);
    clearUnreadForTarget('direct', peerId);
  }, [clearPopupsForTarget, clearUnreadForTarget, closeMessageTools]);

  const openFromPopup = (popup: PopupAlert) => {
    setIsOpen(true);
    setTab(popup.kind);
    setError('');
    setComposer('');
    setComposerSharedMovie(null);
    setComposerDropActive(false);
    setComposerMentionQuery(null);
    setComposerMentionIndex(0);
    closeMessageTools();
    if (popup.kind === 'direct') {
      setSelectedDirectUserId(popup.targetId);
      setDirectConversationOpen(true);
      clearPopupsForTarget('direct', popup.targetId);
      clearUnreadForTarget('direct', popup.targetId);
    } else {
      setSelectedGroupId(popup.targetId);
      setGroupConversationOpen(true);
      clearPopupsForTarget('groups', popup.targetId);
      clearUnreadForTarget('groups', popup.targetId);
    }
    removePopup(popup.id);
  };

  const toggleReaction = useCallback(async (kind: ChatTab, messageId: string, reaction: string) => {
    if (!user?.id || reactingMessageId === messageId) return;
    setReactionPickerMessageId(null);
    setReactingMessageId(messageId);
    setError('');
    try {
      if (kind === 'direct') {
        if (!selectedDirectUserId) return;
        await toggleDirectMessageReaction({ messageId, userId: user.id, reaction });
        await loadDirectConversation(user.id, selectedDirectUserId);
      } else {
        if (!selectedGroupId) return;
        await toggleWatchGroupMessageReaction({ messageId, userId: user.id, reaction });
        await loadGroupConversation(user.id, selectedGroupId);
      }
      await refreshThreads(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to react to message.';
      const low = message.toLowerCase();
      if (low.includes('direct_message_reactions') || low.includes('watch_group_message_reactions')) {
        setError('Chat reactions migration is missing. Run chat reactions migration SQL first.');
      } else {
        setError(message);
      }
    } finally {
      setReactingMessageId(null);
    }
  }, [
    user?.id,
    reactingMessageId,
    selectedDirectUserId,
    selectedGroupId,
    loadDirectConversation,
    loadGroupConversation,
    refreshThreads,
  ]);

  const syncComposerMentionQuery = useCallback((value: string, cursor: number) => {
    if (tab !== 'groups') {
      setComposerMentionQuery(null);
      setComposerMentionIndex(0);
      return;
    }
    const queryState = getMentionQueryState(value, cursor);
    setComposerMentionQuery(queryState);
    if (!queryState) {
      setComposerMentionIndex(0);
    } else {
      setComposerMentionIndex((prev) => Math.min(prev, 5));
    }
  }, [tab]);

  const applyComposerMention = useCallback((target: MentionTarget) => {
    if (!composerMentionQuery) return;
    const applied = applyMentionTarget(composer, composerMentionQuery, target);
    setComposer(applied.text);
    setComposerMentionQuery(null);
    setComposerMentionIndex(0);
    requestAnimationFrame(() => {
      const input = composerInputRef.current;
      if (!input) return;
      input.focus();
      input.setSelectionRange(applied.cursor, applied.cursor);
    });
  }, [composer, composerMentionQuery]);

  const handleComposerDrop = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setComposerDropActive(false);
    const mimeRaw = event.dataTransfer.getData(CHAT_MOVIE_DRAG_MIME);
    const textRaw = event.dataTransfer.getData('text/plain');
    const raw = mimeRaw
      || (textRaw.startsWith(CHAT_MOVIE_DRAG_TEXT_PREFIX)
        ? textRaw.slice(CHAT_MOVIE_DRAG_TEXT_PREFIX.length)
        : '');
    if (!raw) return;
    const sharedMovie = parseDraggedSharedMovie(raw);
    if (!sharedMovie) return;
    setComposerSharedMovie(sharedMovie);
    requestAnimationFrame(() => composerInputRef.current?.focus());
  }, []);

  const sendCurrentMessage = async () => {
    if (!user?.id || sending) return;
    const body = composer.trim();
    const sharedMovie = composerSharedMovie;
    if (!body && !sharedMovie) return;

    setSending(true);
    setError('');
    try {
      if (tab === 'direct') {
        if (!selectedDirectUserId) return;
        await sendDirectMessage({
          senderId: user.id,
          recipientId: selectedDirectUserId,
          body,
          replyToId: replyingToMessage?.id ?? null,
          sharedMovie,
        });
        setComposer('');
        setComposerSharedMovie(null);
        setComposerDropActive(false);
        setComposerMentionQuery(null);
        setComposerMentionIndex(0);
        setReplyingToMessage(null);
        await loadDirectConversation(user.id, selectedDirectUserId);
      } else {
        if (!selectedGroupId) return;
        await sendWatchGroupMessage({
          groupId: selectedGroupId,
          senderId: user.id,
          body,
          replyToId: replyingToMessage?.id ?? null,
          sharedMovie,
        });
        setComposer('');
        setComposerSharedMovie(null);
        setComposerDropActive(false);
        setComposerMentionQuery(null);
        setComposerMentionIndex(0);
        setReplyingToMessage(null);
        await loadGroupConversation(user.id, selectedGroupId);
      }
      await refreshThreads(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to send message.';
      const low = message.toLowerCase();
      const directTableMissing =
        low.includes('direct_messages') &&
        (low.includes('does not exist') || low.includes('relation') || low.includes('not found'));
      const groupTableMissing =
        low.includes('watch_group_messages') &&
        (low.includes('does not exist') || low.includes('relation') || low.includes('not found'));
      if (directTableMissing) {
        setError('Direct chat migration is missing. Run direct messages migration SQL first.');
      } else if (groupTableMissing) {
        setError('Group chat migration is missing. Run group chat migration SQL first.');
      } else {
        setError(message);
      }
    } finally {
      setSending(false);
    }
  };

  if (!isActiveOwner || !user) return null;

  return (
    <div className="fixed bottom-2 left-2 right-2 z-[120] flex flex-col items-stretch gap-3 sm:bottom-5 sm:left-auto sm:right-5 sm:items-end">
      {popups.length > 0 && (
        <div className="w-[min(92vw,360px)] space-y-2">
          {popups.map((popup) => (
            <button
              key={popup.id}
              type="button"
              onClick={() => openFromPopup(popup)}
              className="w-full rounded-xl border border-emerald-300/35 bg-[#081219]/95 px-3 py-2 text-left shadow-[0_16px_38px_rgba(0,0,0,0.42)] hover:border-emerald-200/55 transition-colors"
            >
              <p className="text-[11px] uppercase tracking-[0.16em] text-emerald-200/80">
                {popup.kind === 'direct' ? 'Direct message' : 'Group message'}
              </p>
              <p className="mt-1 text-sm font-semibold text-[var(--text-primary)]">{popup.title}</p>
              <p className="mt-0.5 text-xs text-[var(--text-secondary)] line-clamp-2">{popup.preview}</p>
              <div className="mt-1.5 flex justify-end">
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(event) => {
                    event.stopPropagation();
                    removePopup(popup.id);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      event.stopPropagation();
                      removePopup(popup.id);
                    }
                  }}
                  className="text-[10px] uppercase tracking-[0.12em] text-emerald-200/80 hover:text-emerald-100"
                >
                  Dismiss
                </span>
              </div>
            </button>
          ))}
        </div>
      )}

      {isOpen && (
        <div
          className="relative h-[calc(100dvh-6.5rem)] max-h-[calc(100dvh-6.5rem)] w-full rounded-2xl border border-cyan-200/30 bg-[#090d19]/95 backdrop-blur-2xl shadow-[0_24px_70px_rgba(0,0,0,0.55)] flex flex-col overflow-hidden sm:h-[min(72vh,620px)] sm:max-h-[calc(100vh-9rem)] sm:w-[min(92vw,560px)]"
          onClick={() => {
            setShowThemePicker(false);
            closeMessageTools();
            setComposerMentionQuery(null);
            setComposerMentionIndex(0);
          }}
        >
          <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.2em] text-cyan-200/70">BiB Chat</p>
              <h3 className="text-base font-semibold text-[var(--text-primary)]">Direct and group chat</h3>
            </div>
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                setGroupConversationOpen(false);
                setShowThemePicker(false);
                setComposerMentionQuery(null);
                setComposerMentionIndex(0);
              }}
              className="h-8 w-8 rounded-full border border-white/15 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-white/35 transition-colors"
              aria-label="Close chat shortcuts"
            >
              X
            </button>
          </div>

          <div className="border-b border-white/10 px-3 py-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex rounded-full border border-white/10 bg-[var(--bg-primary)] p-1">
                  <button
                    type="button"
                    onClick={() => setShowUnreadOnly(false)}
                    className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${!showUnreadOnly
                      ? 'bg-white/10 text-[var(--text-primary)]'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                      }`}
                    title="Show all chats"
                  >
                    All
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowUnreadOnly(true)}
                    className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold transition-colors ${showUnreadOnly
                      ? 'bg-emerald-500/18 text-emerald-100'
                      : 'text-[var(--text-muted)] hover:text-emerald-200'
                      }`}
                    title="Show unread chats only"
                  >
                    <span>Unread</span>
                    <span className={`inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] leading-none ${showUnreadOnly
                      ? 'bg-emerald-300/20 text-emerald-100'
                      : 'bg-white/10 text-[var(--text-secondary)]'
                      }`}>
                      {allUnreadThreadCount}
                    </span>
                  </button>
                </div>
              </div>

              <div className="relative" onClick={(e) => e.stopPropagation()}>
                <>
                  <button
                    type="button"
                    disabled={currentChatKey === 'global'}
                    onClick={() => {
                      if (currentChatKey === 'global') return;
                      setShowThemePicker((prev) => !prev);
                    }}
                    className="h-8 w-8 sm:w-auto sm:px-2 rounded-full border border-cyan-300/50 bg-cyan-500/15 text-cyan-200 hover:text-cyan-100 hover:border-cyan-300/80 hover:bg-cyan-500/25 transition-colors inline-flex items-center justify-center gap-1 text-[11px] font-semibold tracking-wide disabled:opacity-45 disabled:cursor-not-allowed"
                    aria-label={currentChatKey === 'global' ? 'Open a chat to change theme' : 'Change chat theme'}
                    title={currentChatKey === 'global' ? 'Open a chat to change theme' : 'Change theme'}
                  >
                    <svg viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5">
                      <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.7" />
                      <circle cx="7" cy="8" r="1.1" fill="currentColor" />
                      <circle cx="12.8" cy="7.2" r="1.1" fill="currentColor" />
                      <circle cx="12.2" cy="12.4" r="1.1" fill="currentColor" />
                    </svg>
                    <span className="hidden sm:inline">Theme</span>
                  </button>

                  {showThemePicker && currentChatKey !== 'global' && (
                    <div className="absolute right-0 top-10 z-50 w-[min(calc(100vw-1rem),420px)] rounded-2xl border border-white/15 bg-[#090d19]/98 backdrop-blur-3xl shadow-[0_24px_60px_rgba(0,0,0,0.65)] p-3 overflow-hidden flex flex-col max-h-[60vh]">
                        <div className="flex items-center justify-between mb-3 border-b border-white/10 pb-2">
                          <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--text-muted)]">Chat Theme Filter</p>
                          <div className="flex bg-[#050917]/80 rounded-lg p-0.5 border border-white/10">
                            <button
                              type="button"
                              onClick={() => {
                                setThemeLang('English');
                                if (typeof window !== 'undefined') localStorage.setItem(THEME_LANG_STORAGE_KEY, 'English');
                              }}
                              className={`px-3 py-1 text-[10px] font-semibold uppercase tracking-wider rounded-md transition-colors ${themeLang === 'English' ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-300/30' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] border border-transparent'
                                }`}
                            >
                              English (20)
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setThemeLang('Telugu');
                                if (typeof window !== 'undefined') localStorage.setItem(THEME_LANG_STORAGE_KEY, 'Telugu');
                              }}
                              className={`px-3 py-1 text-[10px] font-semibold uppercase tracking-wider rounded-md transition-colors ${themeLang === 'Telugu' ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-300/30' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] border border-transparent'
                                }`}
                            >
                              Telugu (20)
                            </button>
                          </div>
                        </div>

                        <div className="overflow-y-auto pr-1 pb-1 space-y-2 flex-1 min-h-0 custom-scrollbar">
                          <div className="grid grid-cols-2 gap-2">
                            {(themeLang === 'English' ? ENGLISH_THEMES : TELUGU_THEMES).map((theme) => {
                              const isActive = theme.id === activeThemeId;
                              const swatchBg = theme.bg === 'transparent'
                                ? 'linear-gradient(135deg,#0f172a 0%,#1e293b 100%)'
                                : theme.bg;
                              return (
                                <button
                                  key={theme.id}
                                  type="button"
                                  onClick={() => selectTheme(theme.id)}
                                  aria-label={`${theme.label} theme${isActive ? ' (active)' : ''}`}
                                  className={`relative overflow-hidden rounded-xl border transition-all text-left ${isActive
                                    ? 'border-cyan-300 shadow-[0_0_12px_rgba(103,232,249,0.5)]'
                                    : 'border-white/15 hover:border-white/45'
                                    }`}
                                >
                                  <div className="h-10 w-full bg-cover bg-center" style={{ background: swatchBg }} />
                                  <div className="flex items-center justify-between gap-2 px-2 py-1.5 bg-[#050917]/95">
                                    <span className="text-[10px] font-medium text-[var(--text-primary)] line-clamp-1">{theme.label}</span>
                                    {isActive && (
                                      <span className="text-[9px] font-bold uppercase tracking-[0.08em] text-cyan-300">On</span>
                                    )}
                                  </div>
                                  {isActive && (
                                    <span className="absolute right-1 top-1 rounded-full border border-cyan-200/80 bg-cyan-500/25 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-cyan-100 backdrop-blur-sm">
                                      Active
                                    </span>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        <div className="mt-2 border-t border-white/10 pt-2 shrink-0">
                          <p className="text-[10px] text-[var(--text-muted)] text-center">
                            Current: <span className="text-cyan-200/90 font-medium">{activeTheme.label}</span>
                          </p>
                        </div>
                      </div>
                  )}
                </>
              </div>
            </div>
          </div>

          {error && (
            <div className="mx-3 mt-3 rounded-lg border border-red-500/35 bg-red-500/10 px-3 py-2 text-xs text-red-100">
              {error}
            </div>
          )}
          {loading && (
            <p className="px-3 pt-3 text-xs text-[var(--text-muted)]">Loading chats...</p>
          )}

          {selectionMode && (
            <div className="mx-3 mt-3 rounded-xl border border-emerald-300/20 bg-emerald-500/8 px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-emerald-100">
                  Select messages {selectedMessageCount > 0 ? `(${selectedMessageCount})` : ''}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedMessageKeys({});
                    setSelectionMode(false);
                  }}
                  className="rounded-full border border-white/15 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                >
                  Done
                </button>
              </div>
              <p className="mt-1 text-[10px] text-emerald-100/70">Tap messages to select or unselect.</p>
            </div>
          )}

          {showCombinedChatList ? (
            <div className="p-3 flex-1 min-h-0 overflow-hidden">
              <p className="mb-2 text-[11px] uppercase tracking-[0.14em] text-[var(--text-muted)]">
                All chats
              </p>
              <div className="h-full min-h-0 space-y-1 overflow-y-auto rounded-xl border border-white/10 bg-[var(--bg-primary)]/65 p-1.5">
                {visibleAllChatRows.length === 0 ? (
                  <p className="px-2 py-2 text-xs text-[var(--text-muted)]">
                    {showUnreadOnly ? 'No unread chats.' : 'No chats yet.'}
                  </p>
                ) : (
                  visibleAllChatRows.map((row) => {
                    const isUnread = row.unreadCount > 0;
                    return (
                      <button
                        key={row.key}
                        type="button"
                        onClick={() => {
                          if (row.kind === 'direct') {
                            openDirectConversation(row.targetId);
                            return;
                          }
                          setTab('groups');
                          setSelectedGroupId(row.targetId);
                          setGroupConversationOpen(true);
                          setComposerMentionQuery(null);
                          setComposerMentionIndex(0);
                          closeMessageTools();
                          clearPopupsForTarget('groups', row.targetId);
                          clearUnreadForTarget('groups', row.targetId);
                        }}
                        className={`w-full rounded-lg border px-2 py-1.5 text-left transition-colors ${row.isSelected
                          ? 'border-cyan-300/55 bg-cyan-500/12'
                          : isUnread
                            ? 'border-emerald-300/40 bg-emerald-500/10 hover:border-emerald-300/60'
                            : 'border-white/10 bg-[var(--bg-card)] hover:border-cyan-300/35'
                          }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0 flex items-center gap-2">
                            <span className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] uppercase tracking-[0.1em] ${row.kind === 'groups'
                              ? 'border-cyan-300/25 text-cyan-200/80 bg-cyan-500/10'
                              : 'border-white/15 text-[var(--text-muted)] bg-black/15'
                              }`}>
                              {row.kind === 'groups' ? 'Group' : 'DM'}
                            </span>
                            <p className="text-xs font-semibold text-[var(--text-primary)] line-clamp-1">
                              {row.name}
                            </p>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className={`text-[10px] ${isUnread && !row.isSelected ? 'font-semibold text-emerald-300' : 'text-[var(--text-muted)]'}`}>
                              {row.time}
                            </span>
                            {isUnread && !row.isSelected && (
                              <span className="inline-flex min-w-4 items-center justify-center rounded-full bg-emerald-400 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-emerald-950">
                                {row.unreadCount > 99 ? '99+' : row.unreadCount}
                              </span>
                            )}
                          </div>
                        </div>
                        <p className={`text-[11px] line-clamp-1 ${isUnread && !row.isSelected ? 'font-semibold text-[var(--text-primary)]' : 'text-[var(--text-muted)]'}`}>
                          {row.preview}
                        </p>
                      </button>
                    );
                  })
                )}
              </div>
              <p className="mt-2 text-xs text-[var(--text-muted)]">
                All chats includes direct messages and group chats.
              </p>
            </div>
          ) : tab === 'direct' ? (
            <div className="p-3 flex-1 min-h-0 overflow-hidden">
              {directConversationOpen && selectedDirectUserId ? (
                <div className="mt-2 h-full flex flex-col min-h-0">
                  <div className="mb-2 flex items-center justify-between rounded-lg border border-white/10 bg-[var(--bg-primary)]/60 px-2.5 py-1.5">
                    <p className="text-xs font-semibold text-[var(--text-primary)] line-clamp-1">
                      {activeDirect?.name || 'Direct chat'}
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setDirectConversationOpen(false);
                        setComposer('');
                        setComposerSharedMovie(null);
                        setComposerDropActive(false);
                      }}
                      className="rounded-md border border-white/15 px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                    >
                      Back
                    </button>
                  </div>
                  <div
                    ref={chatBodyRef}
                    className="flex-1 min-h-0 space-y-2 overflow-y-auto pr-1 rounded-xl p-2 transition-all duration-500"
                    style={{ background: activeTheme.bg }}
                  >
                    {directMessages.length === 0 ? (
                      <p className="text-xs text-[var(--text-muted)]">
                        {activeDirect ? `Start chatting with ${activeDirect.name}.` : 'Pick a friend to start chatting.'}
                      </p>
                    ) : (
                      directMessages.map((message, index) => {
                        const repliedMessage = message.replyToId ? directMessageById.get(message.replyToId) ?? null : null;
                        const isReplying = replyingToMessage?.id === message.id;
                        const prevMessage = index > 0 ? directMessages[index - 1] : null;
                        const showDaySeparator = !prevMessage || dayKey(prevMessage.createdAt) !== dayKey(message.createdAt);
                        return (
                          <Fragment key={message.id}>
                            {showDaySeparator && (
                              <div className="my-1 flex justify-center">
                                <span className="rounded-2xl border border-white/10 bg-white/90 px-4 py-1.5 text-xs font-semibold text-zinc-900 shadow-sm">
                                  {chatDayLabel(message.createdAt)}
                                </span>
                              </div>
                            )}
                            <motion.div
                              layout
                              drag="x"
                              dragConstraints={{ left: 0, right: 0 }}
                              dragElastic={{ right: 0.2, left: 0 }}
                              onDragEnd={(e, info) => {
                                if (info.offset.x > 50) {
                                  setReplyingToMessage(message);
                                  if (navigator.vibrate) navigator.vibrate(50);
                                }
                              }}
                              className={`flex w-full items-center ${message.mine ? 'justify-end' : 'justify-start'}`}
                            >
                              <article
                                onPointerDown={() => {
                                  if (selectionMode) return;
                                  startMessageLongPress('direct', message.id);
                                }}
                                onPointerUp={clearReactionLongPress}
                                onPointerCancel={clearReactionLongPress}
                                onPointerLeave={clearReactionLongPress}
                                onClick={(event) => {
                                  if (!selectionMode) return;
                                  event.stopPropagation();
                                  toggleMessageSelection('direct', message.id);
                                }}
                                onContextMenu={(event) => {
                                  event.preventDefault();
                                  clearReactionLongPress();
                                  setMessageActionMenu({ kind: 'direct', messageId: message.id });
                                }}
                                className={`relative max-w-[85%] rounded-xl border px-3 py-2 transition-transform duration-200 ${message.mine ? '' : 'border-white/10 bg-[var(--bg-primary)]'} ${isReplying ? 'scale-[1.02] ring-2 ring-cyan-400/50' : ''} ${selectedMessageKeys[messageKey('direct', message.id)] ? 'ring-2 ring-emerald-300/70' : ''} ${pinnedMessageKeys[messageKey('direct', message.id)] ? 'border-amber-300/45' : ''} ${selectionMode ? 'cursor-pointer' : ''}`}
                                style={message.mine ? { background: activeTheme.bubble, borderColor: activeTheme.bubbleBorder } : undefined}
                              >
                              {pinnedMessageKeys[messageKey('direct', message.id)] && (
                                <span className="absolute -top-2 right-2 rounded-full border border-amber-300/35 bg-amber-400/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-amber-200">
                                  Pin
                                </span>
                              )}
                              {selectionMode && selectedMessageKeys[messageKey('direct', message.id)] && (
                                <span className="absolute -left-2 -top-2 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full border border-emerald-200/70 bg-emerald-400 text-[10px] font-bold text-emerald-950">
                                  ✓
                                </span>
                              )}
                              {message.replyToId && (
                                <div className="mb-2 rounded bg-black/20 px-2 py-1.5 border-l-2 border-cyan-400/60 flex flex-col">
                                  <span className="text-[10px] font-semibold text-cyan-200/80 mb-0.5">
                                    {repliedMessage?.senderName || 'Replied Message'}
                                  </span>
                                  <span className="text-xs text-white/70 line-clamp-2">
                                    {repliedMessage?.body || repliedMessage?.sharedMovie?.title || '...'}
                                  </span>
                                </div>
                              )}
                              {message.sharedMovie && (
                                <div className="mb-2 rounded-xl border border-white/10 bg-black/20 p-2">
                                  <p className="text-[10px] uppercase tracking-[0.16em] text-cyan-100/75">
                                    Shared pick
                                  </p>
                                  <p className="mt-1 text-sm font-semibold text-[var(--text-primary)]">
                                    {message.sharedMovie.title}
                                  </p>
                                  <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
                                    {message.sharedMovie.mediaType === 'movie' ? 'Movie' : 'Show'}
                                    {message.sharedMovie.releaseYear ? ` • ${message.sharedMovie.releaseYear}` : ''}
                                  </p>
                                </div>
                              )}
                              {message.body && (
                                <p className="text-sm text-[var(--text-primary)] whitespace-pre-wrap break-words">
                                  {renderMessageBody(message.body)}
                                </p>
                              )}
                              <p className="mt-1 flex items-center justify-end gap-1.5 text-[10px] text-[var(--text-muted)] text-right">
                                {shortTime(message.createdAt)}
                              </p>
                              {message.reactions.length > 0 && (
                                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                                  {message.reactions.map((reaction) => (
                                    <button
                                      key={`${message.id}-${reaction.value}`}
                                      type="button"
                                      onClick={() => void toggleReaction('direct', message.id, reaction.value)}
                                      disabled={reactingMessageId === message.id}
                                      className={`rounded-full border px-1.5 py-0.5 text-[11px] leading-none ${reaction.reacted ? 'border-cyan-300/55 bg-cyan-500/18 text-cyan-100' : 'border-white/20 bg-black/20 text-white/85'} disabled:opacity-60`}
                                    >
                                      <span>{reaction.value}</span>
                                      <span className="ml-1">{reaction.count}</span>
                                    </button>
                                  ))}
                                </div>
                              )}
                              {reactionPickerMessageId === message.id && (
                                <div
                                  onClick={(event) => event.stopPropagation()}
                                  className={`absolute top-0 z-30 inline-flex w-max max-w-[calc(100vw-40px)] -translate-y-[calc(100%+8px)] flex-nowrap items-center gap-1.5 overflow-x-auto rounded-full border border-white/15 bg-[#111827]/95 px-2 py-1 shadow-[0_14px_30px_rgba(0,0,0,0.45)] ${message.mine ? 'right-1' : 'left-1'}`}
                                >
                                  {CHAT_REACTION_OPTIONS.map((reaction) => {
                                    const active = message.reactions.some((item) => item.value === reaction && item.reacted);
                                    return (
                                      <button
                                        key={`${message.id}-${reaction}-option`}
                                        type="button"
                                        onClick={() => void toggleReaction('direct', message.id, reaction)}
                                        disabled={reactingMessageId === message.id}
                                        className={`rounded-full border px-1.5 py-0.5 text-sm leading-none transition-colors ${active ? 'border-cyan-300/55 bg-cyan-500/18' : 'border-white/15 bg-black/20'} disabled:opacity-60`}
                                      >
                                        {reaction}
                                      </button>
                                    );
                                  })}
                                </div>
                              )}
                              </article>
                            </motion.div>
                          </Fragment>
                        );
                      })
                    )}
                  </div>
                </div>
              ) : (
                <>
                  <p className="mb-2 text-[11px] uppercase tracking-[0.14em] text-[var(--text-muted)]">
                    Recent chats
                  </p>
                  <div className="h-full min-h-0 space-y-1 overflow-y-auto rounded-xl border border-white/10 bg-[var(--bg-primary)]/65 p-1.5">
                    {visibleDirectList.length === 0 ? (
                      <p className="px-2 py-2 text-xs text-[var(--text-muted)]">
                        {showUnreadOnly ? 'No unread direct chats.' : 'No direct chats yet.'}
                      </p>
                    ) : (
                      visibleDirectList.map((thread) => {
                        const isSelected = selectedDirectUserId === thread.peerId;
                        const isUnread = hasUnreadThread('direct', thread.peerId);
                        return (
                          <button
                            key={thread.peerId}
                            type="button"
                            onClick={() => openDirectConversation(thread.peerId)}
                            className={`w-full rounded-lg border px-2 py-1.5 text-left transition-colors ${isSelected
                              ? 'border-cyan-300/55 bg-cyan-500/12'
                              : isUnread
                                ? 'border-emerald-300/40 bg-emerald-500/10 hover:border-emerald-300/60'
                                : 'border-white/10 bg-[var(--bg-card)] hover:border-cyan-300/35'
                              }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-xs font-semibold text-[var(--text-primary)] line-clamp-1">
                                {thread.name}
                              </p>
                              <div className="flex items-center gap-1.5">
                                <span className={`text-[10px] ${isUnread && !isSelected ? 'font-semibold text-emerald-300' : 'text-[var(--text-muted)]'}`}>{thread.time}</span>
                                {isUnread && !isSelected && (
                                  <span className="inline-flex min-w-4 items-center justify-center rounded-full bg-emerald-400 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-emerald-950">
                                    1
                                  </span>
                                )}
                              </div>
                            </div>
                            <p className={`text-[11px] line-clamp-1 ${isUnread && !isSelected ? 'font-semibold text-[var(--text-primary)]' : 'text-[var(--text-muted)]'}`}>
                              {thread.preview}
                            </p>
                          </button>
                        );
                      })
                    )}
                  </div>
                  <p className="mt-2 text-xs text-[var(--text-muted)]">
                    Tap any username to open that chat only.
                  </p>
                </>
              )}
            </div>
          ) : (
            <div className="p-3 flex-1 min-h-0 overflow-hidden flex flex-col">
              <div className={`${groupConversationOpen ? 'hidden sm:block' : 'block'} max-h-[24vh] space-y-1 overflow-y-auto rounded-xl border border-white/10 bg-[var(--bg-primary)]/65 p-1.5 sm:max-h-[28vh]`}>
                {visibleGroupThreads.length === 0 ? (
                  <p className="px-2 py-2 text-xs text-[var(--text-muted)]">
                    {showUnreadOnly ? 'No unread group chats.' : 'No groups yet.'}
                  </p>
                ) : (
                  visibleGroupThreads.map((group) => {
                    const isSelected = selectedGroupId === group.groupId;
                    const localUnread = hasUnreadThread('groups', group.groupId);
                    const unreadCount = Math.max(group.unseenCount ?? 0, localUnread ? 1 : 0);
                    const isUnread = unreadCount > 0;
                    return (
                      <button
                        key={group.groupId}
                        type="button"
                        onClick={() => {
                          setSelectedGroupId(group.groupId);
                          setGroupConversationOpen(true);
                          setComposerMentionQuery(null);
                          setComposerMentionIndex(0);
                          closeMessageTools();
                          clearPopupsForTarget('groups', group.groupId);
                          clearUnreadForTarget('groups', group.groupId);
                        }}
                        className={`w-full rounded-lg border px-2 py-1.5 text-left transition-colors ${isSelected
                          ? 'border-cyan-300/55 bg-cyan-500/12'
                          : isUnread
                            ? 'border-emerald-300/40 bg-emerald-500/10 hover:border-emerald-300/60'
                            : 'border-white/10 bg-[var(--bg-card)] hover:border-cyan-300/35'
                          }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-semibold text-[var(--text-primary)] line-clamp-1">
                            {group.groupName}
                          </p>
                          <div className="flex items-center gap-1.5">
                            <span className={`text-[10px] ${isUnread && !isSelected ? 'font-semibold text-emerald-300' : 'text-[var(--text-muted)]'}`}>
                              {shortTime(group.latestCreatedAt)}
                            </span>
                            {isUnread && !isSelected && (
                              <span className="inline-flex min-w-4 items-center justify-center rounded-full bg-emerald-400 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-emerald-950">
                                {unreadCount > 99 ? '99+' : unreadCount}
                              </span>
                            )}
                          </div>
                        </div>
                        <p className={`text-[11px] line-clamp-1 ${isUnread && !isSelected ? 'font-semibold text-[var(--text-primary)]' : 'text-[var(--text-muted)]'}`}>
                          {trimPreview(group.latestBody || 'No messages yet')}
                        </p>
                      </button>
                    );
                  })
                )}
              </div>

              {selectedGroupId && (
                <div className={`${groupConversationOpen ? 'flex sm:hidden' : 'hidden'} mt-2 items-center justify-between rounded-lg border border-white/10 bg-[var(--bg-primary)]/70 px-2.5 py-1.5`}>
                  <p className="text-xs font-semibold text-[var(--text-primary)] line-clamp-1">
                    {activeGroup?.groupName || 'Group chat'}
                  </p>
                  <button
                    type="button"
                    onClick={() => setGroupConversationOpen(false)}
                    className="rounded-md border border-white/15 px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  >
                    Chats
                  </button>
                </div>
              )}

              <div
                ref={chatBodyRef}
                className={`mt-2 flex-1 min-h-0 space-y-2 overflow-y-auto pr-1 rounded-xl p-2 transition-all duration-500 ${groupConversationOpen ? 'block' : 'hidden sm:block'}`}
                style={{ background: activeTheme.bg }}
              >
                {selectedGroupId ? (
                  groupMessages.length === 0 ? (
                    <p className="text-xs text-[var(--text-muted)]">
                      {activeGroup ? `Start group chat in ${activeGroup.groupName}.` : 'Pick a group to chat.'}
                    </p>
                  ) : (
                    groupMessages.map((message, index) => {
                      const repliedMessage = message.replyToId ? groupMessageById.get(message.replyToId) ?? null : null;
                      const isReplying = replyingToMessage?.id === message.id;
                      const prevMessage = index > 0 ? groupMessages[index - 1] : null;
                      const showDaySeparator = !prevMessage || dayKey(prevMessage.createdAt) !== dayKey(message.createdAt);
                      return (
                        <Fragment key={message.id}>
                          {showDaySeparator && (
                            <div className="my-1 flex justify-center">
                              <span className="rounded-2xl border border-white/10 bg-white/90 px-4 py-1.5 text-xs font-semibold text-zinc-900 shadow-sm">
                                {chatDayLabel(message.createdAt)}
                              </span>
                            </div>
                          )}
                          <motion.div
                            layout
                            drag="x"
                            dragConstraints={{ left: 0, right: 0 }}
                            dragElastic={{ right: 0.2, left: 0 }}
                            onDragEnd={(e, info) => {
                              if (info.offset.x > 50) {
                                setReplyingToMessage(message);
                                if (navigator.vibrate) navigator.vibrate(50);
                              }
                            }}
                            className={`flex w-full items-center ${message.mine ? 'justify-end' : 'justify-start'}`}
                          >
                            <article
                              onPointerDown={() => {
                                if (selectionMode) return;
                                startMessageLongPress('groups', message.id);
                              }}
                              onPointerUp={clearReactionLongPress}
                              onPointerCancel={clearReactionLongPress}
                              onPointerLeave={clearReactionLongPress}
                              onClick={(event) => {
                                if (!selectionMode) return;
                                event.stopPropagation();
                                toggleMessageSelection('groups', message.id);
                              }}
                              onContextMenu={(event) => {
                                event.preventDefault();
                                clearReactionLongPress();
                                setMessageActionMenu({ kind: 'groups', messageId: message.id });
                              }}
                              className={`relative max-w-[85%] rounded-xl border px-3 py-2 transition-transform duration-200 ${message.mine ? '' : 'border-white/10 bg-[var(--bg-primary)]'} ${isReplying ? 'scale-[1.02] ring-2 ring-cyan-400/50' : ''} ${selectedMessageKeys[messageKey('groups', message.id)] ? 'ring-2 ring-emerald-300/70' : ''} ${pinnedMessageKeys[messageKey('groups', message.id)] ? 'border-amber-300/45' : ''} ${selectionMode ? 'cursor-pointer' : ''}`}
                              style={message.mine ? { background: activeTheme.bubble, borderColor: activeTheme.bubbleBorder } : undefined}
                            >
                            {pinnedMessageKeys[messageKey('groups', message.id)] && (
                              <span className="absolute -top-2 right-2 rounded-full border border-amber-300/35 bg-amber-400/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-amber-200">
                                Pin
                              </span>
                            )}
                            {selectionMode && selectedMessageKeys[messageKey('groups', message.id)] && (
                              <span className="absolute -left-2 -top-2 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full border border-emerald-200/70 bg-emerald-400 text-[10px] font-bold text-emerald-950">
                                ✓
                              </span>
                            )}
                            {!message.mine && (
                              <p className="text-[11px] font-semibold text-[var(--text-secondary)] mb-1">{message.senderName}</p>
                            )}
                            {message.replyToId && (
                              <div className="mb-2 rounded bg-black/20 px-2 py-1.5 border-l-2 border-cyan-400/60 flex flex-col">
                                <span className="text-[10px] font-semibold text-cyan-200/80 mb-0.5">
                                  {repliedMessage?.senderName || 'Replied Message'}
                                </span>
                                <span className="text-xs text-white/70 line-clamp-2">
                                  {repliedMessage?.body || repliedMessage?.sharedMovie?.title || '...'}
                                </span>
                              </div>
                            )}
                            {message.sharedMovie && (
                              <p className="mb-1 text-xs text-cyan-100/90">
                                Shared: {message.sharedMovie.title}
                              </p>
                            )}
                            {message.body && (
                              <p className="text-sm text-[var(--text-primary)] whitespace-pre-wrap break-words">
                                {renderMessageBody(message.body)}
                              </p>
                            )}
                            <p className="mt-1 flex items-center gap-1.5 justify-end text-[10px] text-[var(--text-muted)] text-right">
                              {shortTime(message.createdAt)}
                            </p>
                            {message.reactions.length > 0 && (
                              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                                {message.reactions.map((reaction) => (
                                  <button
                                    key={`${message.id}-${reaction.value}`}
                                    type="button"
                                    onClick={() => void toggleReaction('groups', message.id, reaction.value)}
                                    disabled={reactingMessageId === message.id}
                                    className={`rounded-full border px-1.5 py-0.5 text-[11px] leading-none ${reaction.reacted ? 'border-cyan-300/55 bg-cyan-500/18 text-cyan-100' : 'border-white/20 bg-black/20 text-white/85'} disabled:opacity-60`}
                                  >
                                    <span>{reaction.value}</span>
                                    <span className="ml-1">{reaction.count}</span>
                                  </button>
                                ))}
                              </div>
                            )}
                            {reactionPickerMessageId === message.id && (
                              <div
                                onClick={(event) => event.stopPropagation()}
                                className={`absolute top-0 z-30 inline-flex w-max max-w-[calc(100vw-40px)] -translate-y-[calc(100%+8px)] flex-nowrap items-center gap-1.5 overflow-x-auto rounded-full border border-white/15 bg-[#111827]/95 px-2 py-1 shadow-[0_14px_30px_rgba(0,0,0,0.45)] ${message.mine ? 'right-1' : 'left-1'}`}
                              >
                                {CHAT_REACTION_OPTIONS.map((reaction) => {
                                  const active = message.reactions.some((item) => item.value === reaction && item.reacted);
                                  return (
                                    <button
                                      key={`${message.id}-${reaction}-option`}
                                      type="button"
                                      onClick={() => void toggleReaction('groups', message.id, reaction)}
                                      disabled={reactingMessageId === message.id}
                                      className={`rounded-full border px-1.5 py-0.5 text-sm leading-none transition-colors ${active ? 'border-cyan-300/55 bg-cyan-500/18' : 'border-white/15 bg-black/20'} disabled:opacity-60`}
                                    >
                                      {reaction}
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                            </article>
                          </motion.div>
                        </Fragment>
                      );
                    })
                  )
                ) : (
                  <p className="text-xs text-[var(--text-muted)]">Create or join a group to use group chat.</p>
                )}
              </div>
            </div>
          )}

          <div className={`border-t border-white/10 p-3 pt-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] relative ${showCombinedChatList ? 'hidden' : tab === 'groups' && !groupConversationOpen ? 'hidden sm:block' : 'block'}`}>
            {replyingToMessage && (
              <div className="mb-2 flex items-center justify-between rounded-t-xl border-l-2 border-cyan-400/80 bg-[var(--bg-primary)]/80 px-3 py-1.5 backdrop-blur-md pb-2">
                <div className="flex flex-col overflow-hidden">
                  <span className="text-[10px] uppercase tracking-wider text-cyan-300 font-semibold mb-0.5">
                    Replying to {replyingToMessage.mine ? 'yourself' : ('senderName' in replyingToMessage ? replyingToMessage.senderName : 'friend')}
                  </span>
                  <span className="text-xs text-[var(--text-muted)] line-clamp-1 truncate pr-2">
                    {replyingToMessage.body || ('sharedMovie' in replyingToMessage && replyingToMessage.sharedMovie?.title) || 'Attachment'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setReplyingToMessage(null)}
                  className="shrink-0 p-1 text-[var(--text-muted)] hover:text-white transition-colors h-6 w-6 ml-1 flex items-center justify-center rounded-full hover:bg-white/10"
                >
                  <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4" stroke="currentColor" strokeWidth="2">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
            )}
            {composerSharedMovie && (
              <div className="mb-2 rounded-xl border border-cyan-300/25 bg-cyan-500/8 p-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[10px] uppercase tracking-[0.14em] text-cyan-200/75">Shared pick ready</p>
                    <p className="mt-0.5 text-sm font-semibold text-[var(--text-primary)] truncate">
                      {composerSharedMovie.title}
                    </p>
                    <p className="text-[11px] text-[var(--text-muted)]">
                      {composerSharedMovie.mediaType === 'movie' ? 'Movie' : 'Show'}
                      {composerSharedMovie.releaseYear ? ` • ${composerSharedMovie.releaseYear}` : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setComposerSharedMovie(null);
                      setComposerDropActive(false);
                    }}
                    className="shrink-0 rounded-full border border-white/15 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  >
                    Remove
                  </button>
                </div>
              </div>
            )}
            <div
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = 'copy';
                if (!composerDropActive) setComposerDropActive(true);
              }}
              onDragLeave={(event) => {
                event.preventDefault();
                const nextTarget = event.relatedTarget;
                if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) return;
                setComposerDropActive(false);
              }}
              onDrop={handleComposerDrop}
              className={`rounded-xl transition-colors ${composerDropActive ? 'ring-2 ring-cyan-300/55 bg-cyan-400/5' : ''}`}
            >
              <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                <input
                  ref={composerInputRef}
                  type="text"
                  value={composer}
                  onChange={(e) => {
                    const nextValue = e.target.value;
                    setComposer(nextValue);
                    syncComposerMentionQuery(nextValue, e.target.selectionStart ?? nextValue.length);
                  }}
                  onClick={(e) => {
                    syncComposerMentionQuery(
                      e.currentTarget.value,
                      e.currentTarget.selectionStart ?? e.currentTarget.value.length,
                    );
                  }}
                  onKeyUp={(e) => {
                    syncComposerMentionQuery(
                      e.currentTarget.value,
                      e.currentTarget.selectionStart ?? e.currentTarget.value.length,
                    );
                  }}
                  onKeyDown={(e) => {
                    if (tab === 'groups' && composerMentionQuery && filteredComposerMentions.length > 0) {
                      if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        setComposerMentionIndex((prev) => (prev + 1) % filteredComposerMentions.length);
                        return;
                      }
                      if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        setComposerMentionIndex((prev) => (prev - 1 + filteredComposerMentions.length) % filteredComposerMentions.length);
                        return;
                      }
                      if (e.key === 'Enter' || e.key === 'Tab') {
                        e.preventDefault();
                        const selected = filteredComposerMentions[composerMentionIndex] ?? filteredComposerMentions[0];
                        if (selected) applyComposerMention(selected);
                        return;
                      }
                      if (e.key === 'Escape') {
                        e.preventDefault();
                        setComposerMentionQuery(null);
                        setComposerMentionIndex(0);
                        return;
                      }
                    }
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      void sendCurrentMessage();
                    }
                  }}
                  maxLength={1200}
                  placeholder={tab === 'direct' ? 'Message selected friend...' : 'Message selected group...'}
                  className="rounded-lg border border-white/10 bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-cyan-400/55"
                />
                <button
                  type="button"
                  onClick={() => void sendCurrentMessage()}
                  disabled={
                    sending ||
                    (!composer.trim() && !composerSharedMovie) ||
                    (tab === 'direct' ? !selectedDirectUserId : !selectedGroupId || !groupConversationOpen)
                  }
                  className="rounded-lg bg-cyan-400/90 px-4 py-2 text-sm font-semibold text-[#082633] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {sending ? 'Sending...' : 'Send'}
                </button>
              </div>
              <p className={`mt-2 px-1 text-xs ${composerDropActive ? 'text-cyan-200' : 'text-[var(--text-muted)]'}`}>
                {composerDropActive
                  ? 'Drop movie to attach and share in chat.'
                  : tab === 'direct'
                    ? 'Drag a movie card here to share it in direct chat.'
                    : 'Drop a pick here to share it in chat. Mobile users can use Share to chat.'}
              </p>
            </div>
            {tab === 'groups' && composerMentionQuery && filteredComposerMentions.length > 0 && (
              <div className="mt-2 rounded-xl border border-cyan-300/30 bg-[#070f1a]/95 p-1">
                <p className="px-2 pb-1 text-[10px] uppercase tracking-[0.14em] text-cyan-200/70">
                  Mention a member
                </p>
                <div className="max-h-36 overflow-y-auto space-y-0.5">
                  {filteredComposerMentions.map((target, index) => {
                    const handle = mentionHandle(target);
                    const active = index === composerMentionIndex;
                    return (
                      <button
                        key={`composer-mention-${target.id}`}
                        type="button"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => applyComposerMention(target)}
                        className={`w-full rounded-lg px-2 py-1.5 text-left text-sm transition-colors ${
                          active
                            ? 'bg-cyan-500/20 text-cyan-100'
                            : 'text-[var(--text-primary)] hover:bg-cyan-500/10'
                        }`}
                      >
                        <span className="font-semibold">{target.name}</span>
                        <span className="ml-1 text-[11px] text-[var(--text-muted)]">@{handle}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {chatActionToast && (
            <div className="pointer-events-none absolute bottom-20 left-1/2 z-[70] -translate-x-1/2">
              <div className="rounded-full border border-white/15 bg-black/80 px-3 py-1.5 text-xs font-medium text-white shadow-[0_12px_30px_rgba(0,0,0,0.35)]">
                {chatActionToast}
              </div>
            </div>
          )}

          {messageActionMenu && (
            <div
              className="absolute inset-0 z-[80] bg-black/35 backdrop-blur-[1px]"
              onClick={(event) => {
                event.stopPropagation();
                setMessageActionMenu(null);
              }}
            >
              <div className="absolute inset-x-2 bottom-2 rounded-2xl border border-white/15 bg-[#0c1222]/98 p-2 shadow-[0_26px_60px_rgba(0,0,0,0.55)] sm:inset-x-3">
                <div
                  className="rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2"
                  onClick={(event) => event.stopPropagation()}
                >
                  <p className="text-[10px] uppercase tracking-[0.16em] text-[var(--text-muted)]">
                    {messageActionMenu.kind === 'direct' ? 'Message options' : 'Group message options'}
                  </p>
                  <p className="mt-1 text-sm text-[var(--text-primary)] line-clamp-2 break-words">
                    {activeMessageActionText || 'No text in this message'}
                  </p>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2" onClick={(event) => event.stopPropagation()}>
                  {([
                    { key: 'reply', label: 'Reply' },
                    { key: 'react', label: 'React' },
                    { key: 'delete', label: 'Delete' },
                  ] as Array<{ key: MessageActionKind; label: string }>).map((action) => {
                    const disableDelete = action.key === 'delete' && Boolean(activeMessageActionMessage) && !activeMessageActionMessage?.mine;
                    return (
                      <button
                        key={`action-${action.key}`}
                        type="button"
                        disabled={disableDelete}
                        onClick={() => void handleMessageAction(messageActionMenu.kind, messageActionMenu.messageId, action.key)}
                        className={`rounded-xl border px-3 py-2 text-left text-sm font-medium transition-colors ${
                          action.key === 'delete'
                            ? 'border-rose-300/25 bg-rose-500/8 text-rose-200 hover:bg-rose-500/15'
                            : 'border-white/10 bg-white/[0.03] text-[var(--text-primary)] hover:border-cyan-300/35 hover:bg-cyan-500/8'
                        } disabled:cursor-not-allowed disabled:opacity-45`}
                      >
                        {action.label}
                      </button>
                    );
                  })}
                </div>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    setMessageActionMenu(null);
                  }}
                  className="mt-2 w-full rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2 text-sm font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={() => {
          setIsOpen((prev) => {
            const next = !prev;
            if (!next) {
              setGroupConversationOpen(false);
            }
            return next;
          });
          setError('');
        }}
        className="relative h-14 w-14 rounded-full border border-cyan-200/60 bg-gradient-to-br from-cyan-300 via-sky-400 to-teal-500 text-[#f4feff] shadow-[0_14px_40px_rgba(34,211,238,0.45)] hover:scale-[1.03] active:scale-100 transition-transform"
        aria-label="Open chat shortcuts"
        title="Chat shortcuts"
      >
        <span className="absolute inset-[3px] rounded-full bg-black/18" aria-hidden />
        <svg
          className="relative z-10 mx-auto h-7 w-7 drop-shadow-[0_2px_6px_rgba(0,0,0,0.4)]"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden
        >
          <path d="M5 6.5h14a2 2 0 012 2v7a2 2 0 01-2 2H9l-4 3v-3H5a2 2 0 01-2-2v-7a2 2 0 012-2z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M8.5 11h7M8.5 14h5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
        {popupCount > 0 && (
          <span className="absolute -top-1 -right-1 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white border border-white/70">
            {popupCount}
          </span>
        )}
      </button>
    </div>
  );
}
