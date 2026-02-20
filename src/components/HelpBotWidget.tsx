'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from './AuthProvider';
import {
  fetchFriendsList,
  getDirectChatThreads,
  getDirectMessagesWithUser,
  getMyWatchGroups,
  getWatchGroupMessages,
  sendDirectMessage,
  sendWatchGroupMessage,
  type DirectMessage,
  type DirectMessageThread,
  type FriendForSelect,
  type WatchGroupMessage,
} from '@/lib/supabase-rest';

type ChatTab = 'direct' | 'groups';

// ─── Movie / Show Chat Themes ────────────────────────────────────────────────
type ChatTheme = {
  id: string;
  label: string;
  /** CSS value for the chat area background (gradient or solid color) */
  bg: string;
  /** CSS value for the sent-message bubble background */
  bubble: string;
  /** Border color for sent-message bubble (Tailwind-compatible inline style) */
  bubbleBorder: string;
  /** Whether to render text in dark color on sent bubbles */
  darkText?: boolean;
};

const CHAT_THEMES: ChatTheme[] = [
  {
    // Neutral cinematic baseline
    id: 'default',
    label: 'Cinema Night',
    bg: 'linear-gradient(160deg, rgba(4,8,16,0.6) 0%, rgba(4,8,16,0.95) 100%), url("https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?q=80&w=1280&auto=format&fit=crop") center/cover no-repeat',
    bubble: 'rgba(6,182,212,0.25)',
    bubbleBorder: 'rgba(103,232,249,0.45)',
  },
  {
    // Interstellar
    id: 'interstellar',
    label: 'Interstellar',
    bg: 'linear-gradient(160deg, rgba(0,0,5,0.7) 0%, rgba(0,13,26,0.95) 100%), url("https://image.tmdb.org/t/p/w1280/2ssWTSVklAEc98frZUQhgtGHx7s.jpg") center/cover no-repeat',
    bubble: 'rgba(139,92,246,0.35)',
    bubbleBorder: 'rgba(196,181,253,0.55)',
  },
  {
    // The Matrix
    id: 'matrix',
    label: 'The Matrix',
    bg: 'linear-gradient(160deg, rgba(0,18,0,0.7) 0%, rgba(0,8,0,0.95) 100%), url("https://image.tmdb.org/t/p/w1280/tlm8UkiQsitc8rSuIAscQDCnP8d.jpg") center/cover no-repeat',
    bubble: 'rgba(0,180,60,0.30)',
    bubbleBorder: 'rgba(34,197,94,0.65)',
  },
  {
    // Dune
    id: 'dune',
    label: 'Dune',
    bg: 'linear-gradient(155deg, rgba(26,14,0,0.6) 0%, rgba(15,8,0,0.95) 100%), url("https://image.tmdb.org/t/p/w1280/wYMbnrdRCREjNLwFlG5SLWzBjui.jpg") center/cover no-repeat',
    bubble: 'rgba(217,119,6,0.35)',
    bubbleBorder: 'rgba(251,191,36,0.65)',
  },
  {
    // Blade Runner 2049
    id: 'bladerunner',
    label: 'Blade Runner 2049',
    bg: 'linear-gradient(145deg, rgba(10,0,21,0.7) 0%, rgba(0,8,15,0.95) 100%), url("https://image.tmdb.org/t/p/w1280/ilRyazdMJwN05exqhwK4tMKBYZs.jpg") center/cover no-repeat',
    bubble: 'rgba(236,72,153,0.35)',
    bubbleBorder: 'rgba(244,114,182,0.65)',
  },
  {
    // Game of Thrones
    id: 'game-of-thrones',
    label: 'Game of Thrones',
    bg: 'linear-gradient(160deg, rgba(6,13,20,0.6) 0%, rgba(4,10,16,0.95) 100%), url("https://image.tmdb.org/t/p/w1280/zZqpAXxVSBtxV9qPBcscfXBcL2w.jpg") center/cover no-repeat',
    bubble: 'rgba(147,210,240,0.25)',
    bubbleBorder: 'rgba(186,230,253,0.55)',
  },
  {
    // Avatar
    id: 'avatar',
    label: 'Avatar',
    bg: 'linear-gradient(145deg, rgba(0,18,8,0.6) 0%, rgba(0,21,8,0.95) 100%), url("https://image.tmdb.org/t/p/w1280/vL5LR6WdxWPjLPFRLe133jXWsh5.jpg") center/cover no-repeat',
    bubble: 'rgba(52,211,153,0.30)',
    bubbleBorder: 'rgba(110,231,183,0.60)',
  },
  {
    // The Lord of the Rings
    id: 'lotr',
    label: 'The Lord of the Rings',
    bg: 'linear-gradient(155deg, rgba(21,2,0,0.6) 0%, rgba(15,1,0,0.95) 100%), url("https://image.tmdb.org/t/p/w1280/oiwc338EoBgS4sEI2ixAny4KQKg.jpg") center/cover no-repeat',
    bubble: 'rgba(239,68,68,0.30)',
    bubbleBorder: 'rgba(252,165,165,0.55)',
  },
  {
    // Stranger Things
    id: 'upside-down',
    label: 'Stranger Things',
    bg: 'linear-gradient(155deg, rgba(10,0,16,0.7) 0%, rgba(8,0,10,0.95) 100%), url("https://image.tmdb.org/t/p/w1280/8zbAoryWbtH0DKdev8abFAjdufy.jpg") center/cover no-repeat',
    bubble: 'rgba(217,70,239,0.35)',
    bubbleBorder: 'rgba(232,121,249,0.60)',
  },
  {
    // Breaking Bad
    id: 'breaking-bad',
    label: 'Breaking Bad',
    bg: 'linear-gradient(145deg, rgba(3,17,8,0.7) 0%, rgba(4,11,8,0.95) 100%), url("https://image.tmdb.org/t/p/w1280/tsRy63Mu5cu8etL1X7ZLyf7UP1M.jpg") center/cover no-repeat',
    bubble: 'rgba(34,197,94,0.30)',
    bubbleBorder: 'rgba(134,239,172,0.60)',
  },
];

const THEME_STORAGE_KEY = 'bib-chat-theme';

type GroupThreadPreview = {
  groupId: string;
  groupName: string;
  latestMessageId: string | null;
  latestBody: string;
  latestCreatedAt: string | null;
  latestSenderId: string | null;
};

type PopupAlert = {
  id: string;
  kind: ChatTab;
  targetId: string;
  title: string;
  preview: string;
};

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

function trimPreview(value: string, maxLen: number = 72): string {
  const text = value.trim();
  if (!text) return 'New message';
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen - 1)}...`;
}

function chatKey(kind: ChatTab, targetId: string): string {
  return `${kind}:${targetId}`;
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
  const [directMessages, setDirectMessages] = useState<DirectMessage[]>([]);
  const [groupMessages, setGroupMessages] = useState<WatchGroupMessage[]>([]);
  const [composer, setComposer] = useState('');
  const [popups, setPopups] = useState<PopupAlert[]>([]);
  const [unreadByChat, setUnreadByChat] = useState<Record<string, PopupAlert>>({});

  const [activeThemeId, setActiveThemeId] = useState<string>(() => {
    if (typeof window === 'undefined') return 'default';
    return localStorage.getItem(THEME_STORAGE_KEY) ?? 'default';
  });
  const [showThemePicker, setShowThemePicker] = useState(false);

  const activeTheme = CHAT_THEMES.find((t) => t.id === activeThemeId) ?? CHAT_THEMES[0];

  const selectTheme = (themeId: string) => {
    setActiveThemeId(themeId);
    if (typeof window !== 'undefined') {
      localStorage.setItem(THEME_STORAGE_KEY, themeId);
    }
    setShowThemePicker(false);
  };

  const knownLatestByThreadRef = useRef<Record<string, string>>({});
  const initializedRef = useRef(false);
  const chatBodyRef = useRef<HTMLDivElement>(null);

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

        const groupRows = await Promise.all(
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
            } satisfies GroupThreadPreview;
          }),
        );

        const sortedGroups = [...groupRows].sort((a, b) => {
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

        for (const group of sortedGroups) {
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

        knownLatestByThreadRef.current = latestByThread;
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
      setComposer('');
      setSelectedDirectUserId(null);
      setDirectConversationOpen(false);
      setSelectedGroupId(null);
      setUnreadByChat({});
      knownLatestByThreadRef.current = {};
      initializedRef.current = false;
      return;
    }
    void refreshThreads(false);
  }, [isActiveOwner, user?.id, refreshThreads]);

  useEffect(() => {
    if (!isActiveOwner || !user?.id) return;
    const intervalId = window.setInterval(() => {
      void refreshThreads(true);
    }, 12000);
    return () => window.clearInterval(intervalId);
  }, [isActiveOwner, user?.id, refreshThreads]);

  useEffect(() => {
    if (!user?.id || !selectedDirectUserId) {
      setDirectMessages([]);
      setDirectConversationOpen(false);
      return;
    }
    void loadDirectConversation(user.id, selectedDirectUserId).catch(() => undefined);
  }, [user?.id, selectedDirectUserId, loadDirectConversation]);

  useEffect(() => {
    if (!user?.id || !selectedGroupId) {
      setGroupMessages([]);
      return;
    }
    void loadGroupConversation(user.id, selectedGroupId).catch(() => undefined);
  }, [user?.id, selectedGroupId, loadGroupConversation]);

  useEffect(() => {
    if (!isOpen) return;
    const el = chatBodyRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [isOpen, tab, directMessages, groupMessages]);

  const directList = useMemo(() => {
    const byPeer = new Map(directThreads.map((thread) => [thread.peerId, thread]));
    const recentDirect = directThreads.map((thread) => ({
      peerId: thread.peerId,
      name: thread.peerName,
      username: thread.peerUsername,
      avatar: thread.peerAvatar,
      preview: trimPreview(thread.latestBody),
      time: shortTime(thread.latestCreatedAt),
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

  const popupCount = Object.keys(unreadByChat).length;

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
    setSelectedDirectUserId(peerId);
    setDirectConversationOpen(true);
    setComposer('');
    clearPopupsForTarget('direct', peerId);
    clearUnreadForTarget('direct', peerId);
  }, [clearPopupsForTarget, clearUnreadForTarget]);

  const openFromPopup = (popup: PopupAlert) => {
    setIsOpen(true);
    setTab(popup.kind);
    setError('');
    setComposer('');
    if (popup.kind === 'direct') {
      setSelectedDirectUserId(popup.targetId);
      setDirectConversationOpen(true);
      clearPopupsForTarget('direct', popup.targetId);
      clearUnreadForTarget('direct', popup.targetId);
    } else {
      setSelectedGroupId(popup.targetId);
      clearPopupsForTarget('groups', popup.targetId);
      clearUnreadForTarget('groups', popup.targetId);
    }
    removePopup(popup.id);
  };

  const sendCurrentMessage = async () => {
    if (!user?.id || sending) return;
    const body = composer.trim();
    if (!body) return;

    setSending(true);
    setError('');
    try {
      if (tab === 'direct') {
        if (!selectedDirectUserId) return;
        await sendDirectMessage({
          senderId: user.id,
          recipientId: selectedDirectUserId,
          body,
        });
        setComposer('');
        await loadDirectConversation(user.id, selectedDirectUserId);
      } else {
        if (!selectedGroupId) return;
        await sendWatchGroupMessage({
          groupId: selectedGroupId,
          senderId: user.id,
          body,
        });
        setComposer('');
        await loadGroupConversation(user.id, selectedGroupId);
      }
      await refreshThreads(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to send message.';
      const low = message.toLowerCase();
      if (low.includes('direct_messages')) {
        setError('Direct chat migration is missing. Run direct messages migration SQL first.');
      } else if (low.includes('watch_group_messages')) {
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
    <div className="fixed bottom-3 right-2 sm:bottom-5 sm:right-5 z-[120] flex flex-col items-end gap-3">
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
          className="w-[min(calc(100vw-1rem),560px)] sm:w-[min(92vw,560px)] h-[min(72vh,620px)] max-h-[calc(100vh-9rem)] rounded-2xl border border-cyan-200/30 bg-[#090d19]/95 backdrop-blur-2xl shadow-[0_24px_70px_rgba(0,0,0,0.55)] flex flex-col overflow-hidden"
          onClick={() => setShowThemePicker(false)}
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
                setShowThemePicker(false);
              }}
              className="h-8 w-8 rounded-full border border-white/15 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-white/35 transition-colors"
              aria-label="Close chat shortcuts"
            >
              X
            </button>
          </div>

          <div className="border-b border-white/10 px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <div className="inline-flex rounded-full border border-white/10 bg-[var(--bg-primary)] p-1">
                <button
                  type="button"
                  onClick={() => {
                    setTab('direct');
                    setComposer('');
                    setDirectConversationOpen(false);
                  }}
                  className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${tab === 'direct' ? 'bg-[var(--accent)] text-[#130f0a]' : 'text-[var(--text-muted)]'
                    }`}
                >
                  Direct
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTab('groups');
                    setComposer('');
                  }}
                  className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${tab === 'groups' ? 'bg-[var(--accent)] text-[#130f0a]' : 'text-[var(--text-muted)]'
                    }`}
                >
                  Groups
                </button>
              </div>

              <div className="relative" onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  onClick={() => setShowThemePicker((prev) => !prev)}
                  className="h-8 px-2 rounded-full border border-cyan-300/50 bg-cyan-500/15 text-cyan-200 hover:text-cyan-100 hover:border-cyan-300/80 hover:bg-cyan-500/25 transition-colors flex items-center gap-1 text-[11px] font-semibold tracking-wide"
                  aria-label="Change chat theme"
                  title="Change theme"
                >
                  <svg viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5">
                    <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.7" />
                    <circle cx="7" cy="8" r="1.1" fill="currentColor" />
                    <circle cx="12.8" cy="7.2" r="1.1" fill="currentColor" />
                    <circle cx="12.2" cy="12.4" r="1.1" fill="currentColor" />
                  </svg>
                  Theme
                </button>

                {showThemePicker && (
                  <div className="absolute right-0 top-10 z-50 w-[min(82vw,360px)] rounded-2xl border border-white/15 bg-[#090d19]/98 backdrop-blur-2xl shadow-[0_24px_60px_rgba(0,0,0,0.65)] p-3">
                    <p className="mb-2.5 text-[10px] uppercase tracking-[0.18em] text-[var(--text-muted)]">Chat Theme</p>
                    <div className="grid grid-cols-2 gap-2">
                      {CHAT_THEMES.map((theme) => {
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
                            <div className="h-6 w-full" style={{ background: swatchBg }} />
                            <div className="flex items-center justify-between gap-2 px-2 py-1.5 bg-[#050917]/85">
                              <span className="text-[10px] text-[var(--text-primary)] line-clamp-1">{theme.label}</span>
                              {isActive && (
                                <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-cyan-200">On</span>
                              )}
                            </div>
                            {isActive && (
                              <span className="absolute right-1 top-1 rounded-full border border-cyan-200/80 bg-cyan-500/25 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-cyan-100">
                                Active
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                    <div className="mt-2.5 border-t border-white/10 pt-2">
                      <p className="text-[10px] text-[var(--text-muted)] text-center">
                        Current: {activeTheme.label}
                      </p>
                    </div>
                  </div>
                )}
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

          {tab === 'direct' ? (
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
                      directMessages.map((message) => (
                        <div key={message.id} className={`flex ${message.mine ? 'justify-end' : 'justify-start'}`}>
                          <article
                            className={`max-w-[85%] rounded-xl border px-3 py-2 ${message.mine ? '' : 'border-white/10 bg-[var(--bg-primary)]'}`}
                            style={message.mine ? { background: activeTheme.bubble, borderColor: activeTheme.bubbleBorder } : undefined}
                          >
                            <p className="text-sm text-[var(--text-primary)] whitespace-pre-wrap break-words">{message.body}</p>
                            <p className="mt-1 text-[10px] text-[var(--text-muted)] text-right">{shortTime(message.createdAt)}</p>
                          </article>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ) : (
                <>
                  <p className="mb-2 text-[11px] uppercase tracking-[0.14em] text-[var(--text-muted)]">
                    Recent chats
                  </p>
                  <div className="h-full min-h-0 space-y-1 overflow-y-auto rounded-xl border border-white/10 bg-[var(--bg-primary)]/65 p-1.5">
                    {directList.length === 0 ? (
                      <p className="px-2 py-2 text-xs text-[var(--text-muted)]">No direct chats yet.</p>
                    ) : (
                      directList.map((thread) => (
                        <button
                          key={thread.peerId}
                          type="button"
                          onClick={() => openDirectConversation(thread.peerId)}
                          className={`w-full rounded-lg border px-2 py-1.5 text-left transition-colors ${selectedDirectUserId === thread.peerId
                              ? 'border-cyan-300/55 bg-cyan-500/12'
                              : 'border-white/10 bg-[var(--bg-card)] hover:border-cyan-300/35'
                            }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs font-semibold text-[var(--text-primary)] line-clamp-1">
                              {thread.name}
                            </p>
                            <span className="text-[10px] text-[var(--text-muted)]">{thread.time}</span>
                          </div>
                          <p className="text-[11px] text-[var(--text-muted)] line-clamp-1">{thread.preview}</p>
                        </button>
                      ))
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
              <div className="max-h-[28vh] space-y-1 overflow-y-auto rounded-xl border border-white/10 bg-[var(--bg-primary)]/65 p-1.5">
                {groupThreads.length === 0 ? (
                  <p className="px-2 py-2 text-xs text-[var(--text-muted)]">No groups yet.</p>
                ) : (
                  groupThreads.map((group) => (
                    <button
                      key={group.groupId}
                      type="button"
                      onClick={() => {
                        setSelectedGroupId(group.groupId);
                        clearPopupsForTarget('groups', group.groupId);
                        clearUnreadForTarget('groups', group.groupId);
                      }}
                      className={`w-full rounded-lg border px-2 py-1.5 text-left transition-colors ${selectedGroupId === group.groupId
                          ? 'border-cyan-300/55 bg-cyan-500/12'
                          : 'border-white/10 bg-[var(--bg-card)] hover:border-cyan-300/35'
                        }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-semibold text-[var(--text-primary)] line-clamp-1">
                          {group.groupName}
                        </p>
                        <span className="text-[10px] text-[var(--text-muted)]">{shortTime(group.latestCreatedAt)}</span>
                      </div>
                      <p className="text-[11px] text-[var(--text-muted)] line-clamp-1">
                        {trimPreview(group.latestBody || 'No messages yet')}
                      </p>
                    </button>
                  ))
                )}
              </div>

              <div
                ref={chatBodyRef}
                className="mt-2 flex-1 min-h-0 space-y-2 overflow-y-auto pr-1 rounded-xl p-2 transition-all duration-500"
                style={{ background: activeTheme.bg }}
              >
                {selectedGroupId ? (
                  groupMessages.length === 0 ? (
                    <p className="text-xs text-[var(--text-muted)]">
                      {activeGroup ? `Start group chat in ${activeGroup.groupName}.` : 'Pick a group to chat.'}
                    </p>
                  ) : (
                    groupMessages.map((message) => (
                      <div key={message.id} className={`flex ${message.mine ? 'justify-end' : 'justify-start'}`}>
                        <article
                          className={`max-w-[85%] rounded-xl border px-3 py-2 ${message.mine ? '' : 'border-white/10 bg-[var(--bg-primary)]'}`}
                          style={message.mine ? { background: activeTheme.bubble, borderColor: activeTheme.bubbleBorder } : undefined}
                        >
                          {!message.mine && (
                            <p className="text-[11px] font-semibold text-[var(--text-secondary)] mb-1">{message.senderName}</p>
                          )}
                          {message.sharedMovie && (
                            <p className="mb-1 text-xs text-cyan-100/90">
                              Shared: {message.sharedMovie.title}
                            </p>
                          )}
                          {message.body && (
                            <p className="text-sm text-[var(--text-primary)] whitespace-pre-wrap break-words">{message.body}</p>
                          )}
                          <p className="mt-1 text-[10px] text-[var(--text-muted)] text-right">{shortTime(message.createdAt)}</p>
                        </article>
                      </div>
                    ))
                  )
                ) : (
                  <p className="text-xs text-[var(--text-muted)]">Create or join a group to use group chat.</p>
                )}
              </div>
            </div>
          )}

          <div className="border-t border-white/10 p-3">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
              <input
                type="text"
                value={composer}
                onChange={(e) => setComposer(e.target.value)}
                onKeyDown={(e) => {
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
                  !composer.trim() ||
                  (tab === 'direct' ? !selectedDirectUserId : !selectedGroupId)
                }
                className="rounded-lg bg-cyan-400/90 px-4 py-2 text-sm font-semibold text-[#082633] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {sending ? 'Sending...' : 'Send'}
              </button>
            </div>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => {
          setIsOpen((prev) => !prev);
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
