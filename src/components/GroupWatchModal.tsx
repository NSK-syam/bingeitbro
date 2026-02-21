'use client';

import Link from 'next/link';
import Image from 'next/image';
import { type DragEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from './AuthProvider';
import { fetchTmdbWithProxy } from '@/lib/tmdb-fetch';
import { ENGLISH_THEMES, TELUGU_THEMES } from '@/lib/chat-themes';
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
  addWatchGroupPick,
  clearWatchGroupPickVote,
  createWatchGroup,
  fetchFriendsList,
  getChatTheme,
  getWatchGroupMessages,
  getIncomingWatchGroupInvites,
  getMyWatchGroups,
  markWatchGroupSeen,
  markWatchGroupPickWatched,
  getWatchGroupMembers,
  getPendingWatchGroupInvites,
  getWatchGroupPicks,
  leaveWatchGroup,
  respondToWatchGroupInvite,
  renameWatchGroup,
  setChatTheme,
  sendWatchGroupMessage,
  sendWatchGroupInvite,
  toggleWatchGroupMessageReaction,
  voteOnWatchGroupPick,
  type FriendForSelect,
  type WatchGroup,
  type WatchGroupIncomingInvite,
  type WatchGroupMessage,
  type WatchGroupMember,
  type WatchGroupPendingInvite,
  type WatchGroupPick,
  type WatchGroupSharedMovie,
} from '@/lib/supabase-rest';

type SearchMediaResult = {
  id: number;
  title: string;
  year: number | null;
  poster: string | null;
  rating: number;
  language: string;
};

const GROUP_PICK_DRAG_MIME = 'application/x-bib-watch-group-pick';
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
const CHAT_THEMES = [...ENGLISH_THEMES, ...TELUGU_THEMES];

function parseYear(value?: string): number | null {
  if (!value) return null;
  const date = new Date(value);
  const year = date.getFullYear();
  return Number.isFinite(year) ? year : null;
}

function normalizeLanguage(code: string): string {
  const c = code.toLowerCase();
  if (c === 'en') return 'EN';
  if (c === 'hi') return 'HI';
  if (c === 'te') return 'TE';
  if (c === 'ta') return 'TA';
  if (c === 'kn') return 'KN';
  if (c === 'ml') return 'ML';
  if (c === 'mr') return 'MR';
  if (c === 'bn') return 'BN';
  return c ? c.toUpperCase() : 'NA';
}

export function GroupWatchModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const tmdbApiKey = (process.env.NEXT_PUBLIC_TMDB_API_KEY || '').trim();

  const [groups, setGroups] = useState<WatchGroup[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [members, setMembers] = useState<WatchGroupMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [picks, setPicks] = useState<WatchGroupPick[]>([]);
  const [picksLoading, setPicksLoading] = useState(false);
  const [chatMessages, setChatMessages] = useState<WatchGroupMessage[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatMessage, setChatMessage] = useState('');
  const [chatMentionQuery, setChatMentionQuery] = useState<MentionQueryState | null>(null);
  const [chatMentionIndex, setChatMentionIndex] = useState(0);
  const [chatSharedPick, setChatSharedPick] = useState<WatchGroupPick | null>(null);
  const [chatDropActive, setChatDropActive] = useState(false);
  const [replyingToMessage, setReplyingToMessage] = useState<WatchGroupMessage | null>(null);
  const [reactionPickerMessageId, setReactionPickerMessageId] = useState<string | null>(null);
  const [reactingMessageId, setReactingMessageId] = useState<string | null>(null);
  const [showThemePicker, setShowThemePicker] = useState(false);
  const [sendingChatMessage, setSendingChatMessage] = useState(false);
  const [friends, setFriends] = useState<FriendForSelect[]>([]);
  const [incomingInvites, setIncomingInvites] = useState<WatchGroupIncomingInvite[]>([]);
  const [incomingInvitesLoading, setIncomingInvitesLoading] = useState(false);
  const [pendingInvites, setPendingInvites] = useState<WatchGroupPendingInvite[]>([]);
  const [pendingInvitesLoading, setPendingInvitesLoading] = useState(false);
  const [themeLang, setThemeLang] = useState<'English' | 'Telugu'>(() => {
    if (typeof window === 'undefined') return 'English';
    const stored = window.localStorage.getItem(THEME_LANG_STORAGE_KEY);
    return stored === 'Telugu' ? 'Telugu' : 'English';
  });
  const [themeMap, setThemeMap] = useState<Record<string, string>>(() => {
    if (typeof window === 'undefined') return {};
    try {
      const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
      if (!stored) return {};
      if (stored.startsWith('{')) {
        const parsed = JSON.parse(stored);
        return parsed && typeof parsed === 'object' ? (parsed as Record<string, string>) : {};
      }
      return { global: stored };
    } catch {
      return {};
    }
  });

  const [groupName, setGroupName] = useState('');
  const [groupDescription, setGroupDescription] = useState('');
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [editingGroupName, setEditingGroupName] = useState('');
  const [savingGroupSettings, setSavingGroupSettings] = useState(false);
  const [leavingGroup, setLeavingGroup] = useState(false);

  const [friendSearch, setFriendSearch] = useState('');
  const [inviteUserId, setInviteUserId] = useState('');
  const [sendingInvite, setSendingInvite] = useState(false);
  const [respondingInviteId, setRespondingInviteId] = useState<string | null>(null);

  const [mediaType, setMediaType] = useState<'movie' | 'show'>('movie');
  const [pickQuery, setPickQuery] = useState('');
  const [pickNote, setPickNote] = useState('');
  const [searchResults, setSearchResults] = useState<SearchMediaResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [addingPickId, setAddingPickId] = useState<number | null>(null);
  const [votingPickId, setVotingPickId] = useState<string | null>(null);
  const [markingWatchedPickId, setMarkingWatchedPickId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const reactionLongPressTimerRef = useRef<number | null>(null);

  const activeGroup = useMemo(
    () => groups.find((group) => group.id === activeGroupId) ?? null,
    [groups, activeGroupId],
  );
  const currentThemeChatKey = useMemo(
    () => (activeGroupId ? `group:${activeGroupId}` : 'global'),
    [activeGroupId],
  );
  const activeThemeId = themeMap[currentThemeChatKey] || 'default';
  const activeTheme = CHAT_THEMES.find((theme) => theme.id === activeThemeId) ?? ENGLISH_THEMES[0];

  const isActiveGroupOwner = Boolean(
    activeGroup && user && activeGroup.ownerId === user.id,
  );

  const filteredFriends = useMemo(() => {
    const memberIds = new Set(members.map((m) => m.userId));
    const pendingInviteeIds = new Set(pendingInvites.map((invite) => invite.inviteeId));
    const query = friendSearch.trim().toLowerCase();
    return friends
      .filter((friend) => !memberIds.has(friend.id) && !pendingInviteeIds.has(friend.id))
      .filter((friend) => {
        if (!query) return true;
        const username = friend.username?.toLowerCase() ?? '';
        return friend.name.toLowerCase().includes(query) || username.includes(query);
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [friends, members, pendingInvites, friendSearch]);

  const groupMentionTargets = useMemo<MentionTarget[]>(
    () =>
      members.map((member) => ({
        id: member.userId,
        name: member.name,
        username: member.username,
      })),
    [members],
  );

  const filteredChatMentions = useMemo(
    () =>
      chatMentionQuery
        ? filterMentionTargets(groupMentionTargets, chatMentionQuery.query, user?.id ?? null)
        : [],
    [groupMentionTargets, chatMentionQuery, user?.id],
  );

  const baselineMemberCount = useMemo(
    () => Math.max(1, activeGroup?.memberCount ?? 0, members.length),
    [activeGroup?.memberCount, members.length],
  );

  const getRequiredWatchedCount = useCallback(
    (pick: WatchGroupPick) => Math.max(1, pick.memberCount, baselineMemberCount),
    [baselineMemberCount],
  );

  const visiblePicks = useMemo(
    () => picks.filter((pick) => pick.watchedCount < getRequiredWatchedCount(pick)),
    [picks, getRequiredWatchedCount],
  );

  const selectTheme = useCallback(
    async (themeId: string) => {
      setThemeMap((prev) => {
        const next = { ...prev, [currentThemeChatKey]: themeId };
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(next));
        }
        return next;
      });
      setShowThemePicker(false);
      if (currentThemeChatKey === 'global') return;
      try {
        await setChatTheme(currentThemeChatKey, themeId);
      } catch {
        // Ignore sync errors and keep local theme.
      }
    },
    [currentThemeChatKey],
  );

  const loadGroups = useCallback(async (preferredGroupId?: string) => {
    if (!user) return;
    setGroupsLoading(true);
    try {
      const rows = await getMyWatchGroups(user.id);
      setGroups(rows);
      if (rows.length === 0) {
        setActiveGroupId(null);
      } else if (preferredGroupId && rows.some((row) => row.id === preferredGroupId)) {
        setActiveGroupId(preferredGroupId);
      } else if (!activeGroupId || !rows.some((row) => row.id === activeGroupId)) {
        setActiveGroupId(rows[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load groups.');
      setGroups([]);
      setActiveGroupId(null);
    } finally {
      setGroupsLoading(false);
    }
  }, [activeGroupId, user]);

  const loadFriends = useCallback(async () => {
    if (!user) return;
    try {
      const rows = await fetchFriendsList(user.id);
      setFriends(rows);
    } catch {
      setFriends([]);
    }
  }, [user]);

  const loadIncomingInvites = useCallback(async () => {
    if (!user) return;
    setIncomingInvitesLoading(true);
    try {
      const rows = await getIncomingWatchGroupInvites(user.id);
      setIncomingInvites(rows);
    } catch {
      // Keep previous invites if refresh fails temporarily.
    } finally {
      setIncomingInvitesLoading(false);
    }
  }, [user]);

  const loadPendingInvites = useCallback(async (groupId: string) => {
    setPendingInvitesLoading(true);
    try {
      const rows = await getPendingWatchGroupInvites(groupId);
      setPendingInvites(rows);
    } catch {
      // Keep previous pending list if refresh fails temporarily.
    } finally {
      setPendingInvitesLoading(false);
    }
  }, []);

  const loadActiveGroupData = useCallback(async (groupId: string) => {
    if (!user) return;
    setMembersLoading(true);
    setPicksLoading(true);
    setChatLoading(true);
    try {
      const [memberRows, pickRows, chatRows] = await Promise.all([
        getWatchGroupMembers(groupId),
        getWatchGroupPicks(groupId, user.id),
        getWatchGroupMessages(groupId, user.id).catch(() => []),
      ]);
      setMembers(memberRows);
      setPicks(pickRows);
      setChatMessages(chatRows);
      // Mark group as seen after successfully loading picks.
      void markWatchGroupSeen(groupId).then(() => {
        setGroups((prev) =>
          prev.map((g) => (g.id === groupId ? { ...g, unseenCount: 0 } : g)),
        );
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load group data.');
      setMembers([]);
      setPicks([]);
    } finally {
      setMembersLoading(false);
      setPicksLoading(false);
      setChatLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!isOpen || !user) return;
    void loadGroups();
    void loadFriends();
    void loadIncomingInvites();
    setTimeout(() => searchInputRef.current?.focus(), 0);
  }, [isOpen, user, loadGroups, loadFriends, loadIncomingInvites]);

  useEffect(() => {
    if (!isOpen || !activeGroupId) return;
    void loadActiveGroupData(activeGroupId);
  }, [isOpen, activeGroupId, loadActiveGroupData]);

  useEffect(() => {
    if (!isOpen || currentThemeChatKey === 'global') return;
    let active = true;
    void getChatTheme(currentThemeChatKey)
      .then((themeId) => {
        if (!active || !themeId) return;
        setThemeMap((prev) => {
          if (prev[currentThemeChatKey] === themeId) return prev;
          const next = { ...prev, [currentThemeChatKey]: themeId };
          if (typeof window !== 'undefined') {
            window.localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(next));
          }
          return next;
        });
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [isOpen, currentThemeChatKey]);

  useEffect(() => {
    setChatSharedPick(null);
    setChatDropActive(false);
    setChatMentionQuery(null);
    setChatMentionIndex(0);
    setReplyingToMessage(null);
    setReactionPickerMessageId(null);
    setReactingMessageId(null);
    setShowThemePicker(false);
  }, [activeGroupId]);

  useEffect(() => {
    if (!isOpen || !activeGroupId || !user?.id) return;
    const intervalId = window.setInterval(() => {
      void getWatchGroupMessages(activeGroupId, user.id)
        .then((rows) => setChatMessages(rows))
        .catch(() => undefined);
    }, 12000);
    return () => window.clearInterval(intervalId);
  }, [isOpen, activeGroupId, user?.id]);

  useEffect(() => {
    if (!isOpen || !activeGroupId || !user?.id) return;
    const intervalId = window.setInterval(() => {
      void Promise.all([
        getWatchGroupPicks(activeGroupId, user.id).then((rows) => setPicks(rows)),
        getWatchGroupMembers(activeGroupId).then((rows) => setMembers(rows)),
      ]).catch(() => undefined);
    }, 10000);
    return () => window.clearInterval(intervalId);
  }, [isOpen, activeGroupId, user?.id]);

  useEffect(() => {
    const el = chatContainerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [chatMessages, activeGroupId]);

  useEffect(() => {
    if (!activeGroup) {
      setEditingGroupName('');
      return;
    }
    setEditingGroupName(activeGroup.name);
  }, [activeGroup]);

  useEffect(() => {
    if (!isOpen || !activeGroupId || !isActiveGroupOwner) {
      setPendingInvites([]);
      return;
    }
    void loadPendingInvites(activeGroupId);
  }, [isOpen, activeGroupId, isActiveGroupOwner, loadPendingInvites]);

  useEffect(() => {
    if (!isOpen || !user?.id) return;
    const intervalId = window.setInterval(() => {
      void loadIncomingInvites();
      if (activeGroupId && isActiveGroupOwner) {
        void loadPendingInvites(activeGroupId);
      }
    }, 8000);
    return () => window.clearInterval(intervalId);
  }, [isOpen, user?.id, activeGroupId, isActiveGroupOwner, loadIncomingInvites, loadPendingInvites]);

  useEffect(() => {
    if (!isOpen) {
      setGroupName('');
      setGroupDescription('');
      setEditingGroupName('');
      setFriendSearch('');
      setInviteUserId('');
      setPickQuery('');
      setPickNote('');
      setChatMessage('');
      setChatMentionQuery(null);
      setChatMentionIndex(0);
      setChatSharedPick(null);
      setReplyingToMessage(null);
      setReactionPickerMessageId(null);
      setReactingMessageId(null);
      setChatDropActive(false);
      setSearchResults([]);
      setChatMessages([]);
      setError('');
      setSuccess('');
      setMediaType('movie');
      setSendingInvite(false);
      setSavingGroupSettings(false);
      setLeavingGroup(false);
      setAddingPickId(null);
      setVotingPickId(null);
      setMarkingWatchedPickId(null);
      setRespondingInviteId(null);
      setPendingInvites([]);
      setIncomingInvites([]);
    }
  }, [isOpen]);

  const clearReactionLongPress = useCallback(() => {
    if (reactionLongPressTimerRef.current !== null) {
      window.clearTimeout(reactionLongPressTimerRef.current);
      reactionLongPressTimerRef.current = null;
    }
  }, []);

  const startReactionLongPress = useCallback((messageId: string) => {
    clearReactionLongPress();
    reactionLongPressTimerRef.current = window.setTimeout(() => {
      setReactionPickerMessageId(messageId);
      reactionLongPressTimerRef.current = null;
    }, 380);
  }, [clearReactionLongPress]);

  useEffect(() => {
    return () => {
      clearReactionLongPress();
    };
  }, [clearReactionLongPress]);

  useEffect(() => {
    if (!isOpen || !tmdbApiKey) return;
    const query = pickQuery.trim();
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }
    let canceled = false;
    const timer = window.setTimeout(async () => {
      setSearchLoading(true);
      try {
        const endpoint = mediaType === 'movie' ? 'movie' : 'tv';
        const response = await fetchTmdbWithProxy(
          `https://api.themoviedb.org/3/search/${endpoint}?api_key=${tmdbApiKey}&query=${encodeURIComponent(query)}&page=1&include_adult=false`,
        );
        const data = (await response.json().catch(() => ({}))) as { results?: unknown[] };
        const rows = Array.isArray(data.results) ? data.results : [];
        const mapped = rows
          .slice(0, 8)
          .flatMap((row): SearchMediaResult[] => {
            if (!row || typeof row !== 'object') return [];
            const value = row as Record<string, unknown>;
            const id = typeof value.id === 'number' ? value.id : Number(value.id);
            if (!Number.isFinite(id)) return [];
            const title =
              mediaType === 'movie'
                ? String(value.title ?? '').trim()
                : String(value.name ?? '').trim();
            if (!title) return [];
            const year = parseYear(
              mediaType === 'movie'
                ? String(value.release_date ?? '')
                : String(value.first_air_date ?? ''),
            );
            const posterPath = typeof value.poster_path === 'string' ? value.poster_path : '';
            return [
              {
                id,
                title,
                year,
                poster: posterPath ? `https://image.tmdb.org/t/p/w300${posterPath}` : null,
                rating: typeof value.vote_average === 'number' ? value.vote_average : 0,
                language: normalizeLanguage(String(value.original_language ?? '')),
              },
            ];
          });
        if (!canceled) setSearchResults(mapped);
      } catch {
        if (!canceled) setSearchResults([]);
      } finally {
        if (!canceled) setSearchLoading(false);
      }
    }, 250);

    return () => {
      canceled = true;
      window.clearTimeout(timer);
    };
  }, [isOpen, tmdbApiKey, mediaType, pickQuery]);

  const handleCreateGroup = async () => {
    if (!user) return;
    const name = groupName.trim();
    if (name.length < 2) {
      setError('Group name must be at least 2 characters.');
      return;
    }
    setCreatingGroup(true);
    setError('');
    setSuccess('');
    try {
      const group = await createWatchGroup(user.id, {
        name,
        description: groupDescription,
      });
      setGroupName('');
      setGroupDescription('');
      setSuccess(`Created "${group.name}".`);
      await loadGroups(group.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create group.');
    } finally {
      setCreatingGroup(false);
    }
  };

  const handleSaveGroupSettings = async () => {
    if (!activeGroup) return;
    const name = editingGroupName.trim();
    if (name.length < 2) {
      setError('Group name must be at least 2 characters.');
      return;
    }
    setSavingGroupSettings(true);
    setError('');
    setSuccess('');
    try {
      await renameWatchGroup(activeGroup.id, name);
      setSuccess('Group name updated.');
      await loadGroups(activeGroup.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update group settings.';
      if (message.toLowerCase().includes('rename_watch_group')) {
        setError('Group rename migration is not enabled yet. Run rename migration SQL first.');
      } else {
        setError(message);
      }
    } finally {
      setSavingGroupSettings(false);
    }
  };

  const handleLeaveGroup = async () => {
    if (!user || !activeGroup || isActiveGroupOwner) return;
    setLeavingGroup(true);
    setError('');
    setSuccess('');
    try {
      await leaveWatchGroup(activeGroup.id, user.id);
      setSuccess(`You left "${activeGroup.name}".`);
      setMembers([]);
      setPicks([]);
      await loadGroups();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to leave group.');
    } finally {
      setLeavingGroup(false);
    }
  };

  const handleSendInvite = async () => {
    if (!activeGroupId || !user || !inviteUserId) return;
    setSendingInvite(true);
    setError('');
    setSuccess('');
    try {
      await sendWatchGroupInvite({
        groupId: activeGroupId,
        inviterId: user.id,
        inviteeId: inviteUserId,
      });
      setInviteUserId('');
      setFriendSearch('');
      setSuccess('Invite sent. Friend must accept to join.');
      await loadPendingInvites(activeGroupId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send invite.');
    } finally {
      setSendingInvite(false);
    }
  };

  const handleRespondInvite = async (
    invite: WatchGroupIncomingInvite,
    decision: 'accepted' | 'rejected',
  ) => {
    if (!user) return;
    setRespondingInviteId(invite.id);
    setError('');
    setSuccess('');
    try {
      const response = await respondToWatchGroupInvite(invite.id, decision);
      if (decision === 'accepted') {
        setSuccess(`You joined "${invite.groupName}".`);
      } else {
        setSuccess(`Invite to "${invite.groupName}" declined.`);
      }

      await loadIncomingInvites();
      await loadGroups(decision === 'accepted' ? response.groupId : undefined);
      if (decision === 'accepted') {
        setActiveGroupId(response.groupId);
        await loadActiveGroupData(response.groupId);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to respond to invite.');
    } finally {
      setRespondingInviteId(null);
    }
  };

  const handleAddPick = async (media: SearchMediaResult) => {
    if (!activeGroupId || !user) return;
    setAddingPickId(media.id);
    setError('');
    setSuccess('');
    try {
      await addWatchGroupPick({
        groupId: activeGroupId,
        senderId: user.id,
        mediaType,
        tmdbId: String(media.id),
        title: media.title,
        poster: media.poster,
        releaseYear: media.year,
        note: pickNote,
      });
      setPickNote('');
      setPickQuery('');
      setSearchResults([]);
      setSuccess('Pick added to group.');
      await loadActiveGroupData(activeGroupId);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to add pick.';
      if (/duplicate|unique/i.test(message)) {
        setError('This title is already in the group picks.');
      } else {
        setError(message);
      }
    } finally {
      setAddingPickId(null);
    }
  };

  const handleVote = async (pick: WatchGroupPick, voteValue: -1 | 1) => {
    if (!user) return;
    setVotingPickId(pick.id);
    setError('');
    try {
      if (pick.myVote === voteValue) {
        await clearWatchGroupPickVote(pick.id, user.id);
      } else {
        await voteOnWatchGroupPick(pick.id, user.id, voteValue);
      }
      if (activeGroupId) {
        await loadActiveGroupData(activeGroupId);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to vote.');
    } finally {
      setVotingPickId(null);
    }
  };

  const handleMarkWatched = async (pick: WatchGroupPick) => {
    if (!user || pick.watchedByMe) return;
    setMarkingWatchedPickId(pick.id);
    setError('');
    try {
      await markWatchGroupPickWatched(pick.id, user.id);
      if (activeGroupId) {
        await loadActiveGroupData(activeGroupId);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to mark as watched.';
      if (message.toLowerCase().includes('watch_group_pick_watches')) {
        setError('Group watched migration is not enabled yet. Run watched migration SQL first.');
      } else {
        setError(message);
      }
    } finally {
      setMarkingWatchedPickId(null);
    }
  };

  const toSharedMovie = useCallback((pick: WatchGroupPick): WatchGroupSharedMovie => {
    return {
      mediaType: pick.mediaType,
      tmdbId: pick.tmdbId,
      title: pick.title,
      poster: pick.poster,
      releaseYear: pick.releaseYear,
    };
  }, []);

  const handleAttachPickToChat = useCallback((pick: WatchGroupPick) => {
    setChatSharedPick(pick);
    setChatDropActive(false);
    setTimeout(() => chatInputRef.current?.focus(), 0);
  }, []);

  const handlePickDragStart = useCallback((event: DragEvent<HTMLElement>, pick: WatchGroupPick) => {
    event.dataTransfer.effectAllowed = 'copy';
    event.dataTransfer.setData(
      GROUP_PICK_DRAG_MIME,
      JSON.stringify({
        id: pick.id,
        mediaType: pick.mediaType,
        tmdbId: pick.tmdbId,
        title: pick.title,
        poster: pick.poster,
        releaseYear: pick.releaseYear,
      }),
    );
  }, []);

  const handleChatDrop = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setChatDropActive(false);
    const raw = event.dataTransfer.getData(GROUP_PICK_DRAG_MIME);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as Partial<WatchGroupPick>;
      if (
        !parsed ||
        (parsed.mediaType !== 'movie' && parsed.mediaType !== 'show') ||
        typeof parsed.tmdbId !== 'string' ||
        typeof parsed.title !== 'string'
      ) {
        return;
      }
      setChatSharedPick({
        id: String(parsed.id ?? ''),
        groupId: activeGroupId ?? '',
        senderId: user?.id ?? '',
        senderName: 'Member',
        senderAvatar: null,
        mediaType: parsed.mediaType,
        tmdbId: parsed.tmdbId,
        title: parsed.title,
        poster: typeof parsed.poster === 'string' ? parsed.poster : null,
        releaseYear: typeof parsed.releaseYear === 'number' ? parsed.releaseYear : null,
        note: null,
        createdAt: new Date().toISOString(),
        upvotes: 0,
        downvotes: 0,
        score: 0,
        myVote: 0,
        watchedCount: 0,
        memberCount: 1,
        watchedByMe: false,
      });
      setTimeout(() => chatInputRef.current?.focus(), 0);
    } catch {
      return;
    }
  }, [activeGroupId, user?.id]);

  const syncChatMentionQuery = useCallback((value: string, cursor: number) => {
    const queryState = getMentionQueryState(value, cursor);
    setChatMentionQuery(queryState);
    if (!queryState) {
      setChatMentionIndex(0);
    } else {
      setChatMentionIndex((prev) => Math.min(prev, 5));
    }
  }, []);

  const applyChatMention = useCallback((target: MentionTarget) => {
    if (!chatMentionQuery) return;
    const applied = applyMentionTarget(chatMessage, chatMentionQuery, target);
    setChatMessage(applied.text);
    setChatMentionQuery(null);
    setChatMentionIndex(0);
    requestAnimationFrame(() => {
      const input = chatInputRef.current;
      if (!input) return;
      input.focus();
      input.setSelectionRange(applied.cursor, applied.cursor);
    });
  }, [chatMessage, chatMentionQuery]);

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

  const handleSendChatMessage = async () => {
    if (!activeGroupId || !user) return;
    const body = chatMessage.trim();
    const sharedMovie = chatSharedPick ? toSharedMovie(chatSharedPick) : null;
    if (!body && !sharedMovie) return;
    setSendingChatMessage(true);
    setError('');
    try {
      await sendWatchGroupMessage({
        groupId: activeGroupId,
        senderId: user.id,
        body,
        sharedMovie,
        replyToId: replyingToMessage?.id ?? null,
      });
      setChatMessage('');
      setChatMentionQuery(null);
      setChatMentionIndex(0);
      setChatSharedPick(null);
      setReplyingToMessage(null);
      const rows = await getWatchGroupMessages(activeGroupId, user.id);
      setChatMessages(rows);
      void markWatchGroupSeen(activeGroupId).then(() => {
        setGroups((prev) =>
          prev.map((g) => (g.id === activeGroupId ? { ...g, unseenCount: 0 } : g)),
        );
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to send message.';
      if (message.toLowerCase().includes('watch_group_messages')) {
        setError('Group chat migration is not enabled yet. Run chat migration SQL first.');
      } else if (
        message.toLowerCase().includes('shared_media_type') ||
        message.toLowerCase().includes('shared_tmdb_id')
      ) {
        setError('Movie-share chat migration is not enabled yet. Run movie-share migration SQL first.');
      } else {
        setError(message);
      }
    } finally {
      setSendingChatMessage(false);
    }
  };

  const handleToggleChatReaction = useCallback(async (messageId: string, reaction: string) => {
    if (!user?.id || reactingMessageId === messageId) return;
    setReactionPickerMessageId(null);
    setReactingMessageId(messageId);
    setError('');
    try {
      await toggleWatchGroupMessageReaction({
        messageId,
        userId: user.id,
        reaction,
      });
      if (activeGroupId) {
        const rows = await getWatchGroupMessages(activeGroupId, user.id);
        setChatMessages(rows);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to react to message.';
      const lower = message.toLowerCase();
      if (lower.includes('watch_group_message_reactions')) {
        setError('Chat reactions migration is not enabled yet. Run chat reactions migration SQL first.');
      } else {
        setError(message);
      }
    } finally {
      setReactingMessageId(null);
    }
  }, [activeGroupId, reactingMessageId, user?.id]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 sm:p-6">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={onClose} />
      <div
        className="relative w-full max-w-6xl max-h-[90vh] overflow-y-auto rounded-3xl border border-indigo-300/20 bg-[var(--bg-card)] p-6 sm:p-7 shadow-[0_30px_90px_rgba(0,0,0,0.55)]"
        onClick={(e) => {
          e.stopPropagation();
          setChatMentionQuery(null);
          setReactionPickerMessageId(null);
          setShowThemePicker(false);
        }}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 w-10 h-10 rounded-full bg-[var(--bg-secondary)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
          aria-label="Close group watch"
        >
          <svg className="w-5 h-5 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="mb-6">
          <p className="text-[11px] uppercase tracking-[0.24em] text-indigo-200/85">Group Watch</p>
          <h2 className="mt-2 text-2xl sm:text-3xl font-bold text-[var(--text-primary)]">Create groups, share picks, vote together</h2>
          <p className="mt-2 text-sm text-[var(--text-muted)]">
            Add movie or show picks to your group and let everyone upvote or downvote what to watch next.
          </p>
        </div>

        {!tmdbApiKey && (
          <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            Missing `NEXT_PUBLIC_TMDB_API_KEY`.
          </div>
        )}
        {error && (
          <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div>
        )}
        {success && (
          <div className="mb-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{success}</div>
        )}

        <div className="grid gap-5 lg:grid-cols-[360px_minmax(0,1fr)]">
          <aside className="space-y-5">
            <section className="rounded-2xl border border-white/10 bg-[var(--bg-secondary)]/70 p-4">
              <p className="text-sm font-semibold text-[var(--text-primary)] mb-3">Create new group</p>
              <div className="space-y-3">
                <input
                  type="text"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  placeholder="Group name (movie night squad)"
                  maxLength={60}
                  className="w-full rounded-xl border border-white/10 bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-indigo-400/55"
                />
                <textarea
                  value={groupDescription}
                  onChange={(e) => setGroupDescription(e.target.value)}
                  placeholder="Optional description"
                  maxLength={300}
                  rows={2}
                  className="w-full rounded-xl border border-white/10 bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-indigo-400/55 resize-none"
                />
                <button
                  type="button"
                  onClick={handleCreateGroup}
                  disabled={creatingGroup || !user}
                  className="w-full rounded-xl bg-gradient-to-r from-indigo-400 to-fuchsia-500 px-3 py-2 text-sm font-semibold text-[#0c1020] disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {creatingGroup ? 'Creating…' : 'Create Group'}
                </button>
              </div>
            </section>

            <section className="rounded-2xl border border-white/10 bg-[var(--bg-secondary)]/70 p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold text-[var(--text-primary)]">Your groups</p>
                {groupsLoading && <span className="text-xs text-[var(--text-muted)]">Loading…</span>}
              </div>
              {groups.length === 0 ? (
                <p className="text-sm text-[var(--text-muted)]">No groups yet. Create your first one.</p>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                  {groups.map((group) => (
                    <button
                      key={group.id}
                      type="button"
                      onClick={() => setActiveGroupId(group.id)}
                      className={[
                        'w-full rounded-xl border px-3 py-2 text-left transition-colors',
                        activeGroupId === group.id
                          ? 'border-indigo-300/70 bg-indigo-500/20'
                          : 'border-white/10 bg-[var(--bg-primary)] hover:border-indigo-300/35',
                      ].join(' ')}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium text-[var(--text-primary)] line-clamp-1">{group.name}</p>
                        {group.unseenCount > 0 && (
                          <span className="shrink-0 rounded-full bg-rose-500/20 border border-rose-300/30 px-2 py-0.5 text-[11px] font-semibold text-rose-100">
                            {group.unseenCount}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-[var(--text-muted)] mt-0.5">
                        {group.memberCount} members · {group.role === 'owner' ? 'Owner' : 'Member'}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </section>

            {activeGroup && (
              <section className="rounded-2xl border border-white/10 bg-[var(--bg-secondary)]/70 p-4">
                <p className="text-sm font-semibold text-[var(--text-primary)] mb-3">Group name</p>
                <div className="space-y-2">
                  <input
                    type="text"
                    value={editingGroupName}
                    onChange={(e) => setEditingGroupName(e.target.value)}
                    maxLength={60}
                    placeholder="Group name"
                    className="w-full rounded-xl border border-white/10 bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-indigo-400/55"
                  />
                  <button
                    type="button"
                    onClick={handleSaveGroupSettings}
                    disabled={savingGroupSettings}
                    className="w-full rounded-xl bg-indigo-400/90 px-3 py-2 text-sm font-semibold text-[#0b1327] disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {savingGroupSettings ? 'Saving…' : 'Save group name'}
                  </button>
                  {!isActiveGroupOwner && (
                    <button
                      type="button"
                      onClick={handleLeaveGroup}
                      disabled={leavingGroup}
                      className="w-full rounded-xl border border-rose-300/40 bg-rose-500/15 px-3 py-2 text-sm font-semibold text-rose-100 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {leavingGroup ? 'Leaving…' : 'Leave group'}
                    </button>
                  )}
                </div>
              </section>
            )}

            <section className="rounded-2xl border border-white/10 bg-[var(--bg-secondary)]/70 p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold text-[var(--text-primary)]">Invites</p>
                {incomingInvitesLoading && (
                  <span className="text-xs text-[var(--text-muted)]">Loading…</span>
                )}
              </div>
              {incomingInvites.length === 0 ? (
                <p className="text-sm text-[var(--text-muted)]">No pending group invites.</p>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                  {incomingInvites.map((invite) => (
                    <div
                      key={invite.id}
                      className="rounded-xl border border-white/10 bg-[var(--bg-primary)] px-3 py-2"
                    >
                      <p className="text-sm font-medium text-[var(--text-primary)] line-clamp-1">
                        {invite.groupName}
                      </p>
                      <p className="text-xs text-[var(--text-muted)] mt-0.5">
                        From {invite.inviterName}
                      </p>
                      <div className="mt-2 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void handleRespondInvite(invite, 'accepted')}
                          disabled={respondingInviteId === invite.id}
                          className="rounded-lg bg-emerald-400/90 px-2.5 py-1.5 text-xs font-semibold text-[#0b1327] disabled:opacity-50"
                        >
                          Accept
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleRespondInvite(invite, 'rejected')}
                          disabled={respondingInviteId === invite.id}
                          className="rounded-lg border border-white/15 bg-[var(--bg-card)] px-2.5 py-1.5 text-xs font-semibold text-[var(--text-secondary)] disabled:opacity-50"
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </aside>

          <section className="space-y-5 min-w-0">
            {!activeGroup ? (
              <div className="rounded-2xl border border-white/10 bg-[var(--bg-secondary)]/70 p-8 text-center">
                <p className="text-sm text-[var(--text-muted)]">Select a group to manage picks and voting.</p>
              </div>
            ) : (
              <>
                <div className="rounded-2xl border border-white/10 bg-[var(--bg-secondary)]/70 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <div>
                      <h3 className="text-lg font-semibold text-[var(--text-primary)]">{activeGroup.name}</h3>
                      <p className="text-xs text-[var(--text-muted)] mt-1">
                        {activeGroup.description || 'No description'} · {members.length} members
                      </p>
                    </div>
                  </div>

                  <div className="mt-4">
                    <p className="text-xs uppercase tracking-[0.14em] text-[var(--text-muted)] mb-2">Members</p>
                    {membersLoading ? (
                      <p className="text-sm text-[var(--text-muted)]">Loading members…</p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {members.map((member) => (
                          <span
                            key={member.userId}
                            className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-[var(--bg-primary)] px-2.5 py-1 text-xs text-[var(--text-secondary)]"
                          >
                            <span>{member.avatar || ''}</span>
                            <span>{member.name}</span>
                            {member.role === 'owner' && <span className="text-indigo-200">• owner</span>}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {isActiveGroupOwner && (
                    <div className="mt-4 rounded-xl border border-white/10 bg-[var(--bg-primary)] p-3">
                      <p className="text-xs uppercase tracking-[0.14em] text-[var(--text-muted)] mb-2">
                        Invite friends (private group)
                      </p>
                      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_150px_auto]">
                        <input
                          type="text"
                          value={friendSearch}
                          onChange={(e) => setFriendSearch(e.target.value)}
                          placeholder="Search your friends…"
                          className="rounded-lg border border-white/10 bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-indigo-400/55"
                        />
                        <select
                          value={inviteUserId}
                          onChange={(e) => setInviteUserId(e.target.value)}
                          className="rounded-lg border border-white/10 bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-indigo-400/55"
                        >
                          <option value="">Choose friend</option>
                          {filteredFriends.map((friend) => (
                            <option key={friend.id} value={friend.id}>
                              {friend.name}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={handleSendInvite}
                          disabled={!inviteUserId || sendingInvite}
                          className="rounded-lg bg-indigo-400/90 px-3 py-2 text-sm font-semibold text-[#0b1327] disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {sendingInvite ? 'Sending…' : 'Send invite'}
                        </button>
                      </div>
                      <p className="mt-2 text-xs text-[var(--text-muted)]">
                        Invited users must accept before they can see this group.
                      </p>

                      <div className="mt-3 border-t border-white/10 pt-3">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-xs uppercase tracking-[0.14em] text-[var(--text-muted)]">
                            Pending invites
                          </p>
                          {pendingInvitesLoading && (
                            <span className="text-[11px] text-[var(--text-muted)]">Loading…</span>
                          )}
                        </div>
                        {pendingInvites.length === 0 ? (
                          <p className="text-sm text-[var(--text-muted)]">No pending invites.</p>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            {pendingInvites.map((invite) => (
                              <span
                                key={invite.id}
                                className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-[var(--bg-card)] px-2.5 py-1 text-xs text-[var(--text-secondary)]"
                              >
                                <span>{invite.inviteeAvatar || ''}</span>
                                <span>{invite.inviteeName}</span>
                                <span className="text-amber-200">• pending</span>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <div className="rounded-2xl border border-white/10 bg-[var(--bg-secondary)]/70 p-4">
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <p className="text-sm font-semibold text-[var(--text-primary)]">Add pick to group</p>
                    <div className="inline-flex rounded-full border border-white/10 bg-[var(--bg-primary)] p-1">
                      <button
                        type="button"
                        onClick={() => setMediaType('movie')}
                        className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${mediaType === 'movie' ? 'bg-[var(--accent)] text-[#130f0a]' : 'text-[var(--text-muted)]'}`}
                      >
                        Movies
                      </button>
                      <button
                        type="button"
                        onClick={() => setMediaType('show')}
                        className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${mediaType === 'show' ? 'bg-[var(--accent)] text-[#130f0a]' : 'text-[var(--text-muted)]'}`}
                      >
                        Shows
                      </button>
                    </div>
                  </div>

                  <div className="grid gap-2">
                    <input
                      ref={searchInputRef}
                      type="text"
                      value={pickQuery}
                      onChange={(e) => setPickQuery(e.target.value)}
                      placeholder={`Search ${mediaType === 'movie' ? 'movies' : 'shows'}…`}
                      className="rounded-lg border border-white/10 bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-indigo-400/55"
                    />
                    <input
                      type="text"
                      value={pickNote}
                      onChange={(e) => setPickNote(e.target.value)}
                      maxLength={400}
                      placeholder="Optional note for the group"
                      className="rounded-lg border border-white/10 bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-indigo-400/55"
                    />
                  </div>

                  {searchLoading && <p className="mt-2 text-sm text-[var(--text-muted)]">Searching…</p>}
                  {searchResults.length > 0 && (
                    <div className="mt-3 space-y-2 max-h-72 overflow-y-auto pr-1">
                      {searchResults.map((result) => (
                        <div
                          key={result.id}
                          className="flex items-center gap-3 rounded-xl border border-white/10 bg-[var(--bg-primary)] px-3 py-2"
                        >
                          <div className="relative w-10 h-14 rounded-md overflow-hidden bg-black/30 flex-shrink-0">
                            {result.poster ? (
                              <Image src={result.poster} alt={result.title} fill sizes="80px" className="object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-xs"></div>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-[var(--text-primary)] truncate">{result.title}</p>
                            <p className="text-xs text-[var(--text-muted)] mt-0.5">
                              {result.year ?? 'Unknown'} · {result.language} ·  {result.rating.toFixed(1)}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleAddPick(result)}
                            disabled={addingPickId === result.id}
                            className="rounded-lg bg-gradient-to-r from-indigo-400 to-fuchsia-500 px-3 py-1.5 text-xs font-semibold text-[#0b1327] disabled:opacity-50"
                          >
                            {addingPickId === result.id ? 'Adding…' : 'Add'}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="rounded-2xl border border-white/10 bg-[var(--bg-secondary)]/70 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm font-semibold text-[var(--text-primary)]">Group picks</p>
                    {picksLoading && <span className="text-xs text-[var(--text-muted)]">Refreshing…</span>}
                  </div>

                  {visiblePicks.length === 0 ? (
                    <p className="text-sm text-[var(--text-muted)]">No picks yet. Add the first movie or show above.</p>
                  ) : (
                    <div className="space-y-3 max-h-[45vh] overflow-y-auto pr-1">
                      {visiblePicks.map((pick) => (
                        <article
                          key={pick.id}
                          draggable
                          onDragStart={(event) => handlePickDragStart(event, pick)}
                          className="rounded-xl border border-white/10 bg-[var(--bg-primary)]/85 p-3 cursor-grab active:cursor-grabbing"
                        >
                          <div className="flex gap-3">
                            <Link
                              href={pick.mediaType === 'movie' ? `/movie/${pick.tmdbId}` : `/show/${pick.tmdbId}`}
                              className="relative w-14 h-20 rounded-md overflow-hidden bg-black/30 flex-shrink-0"
                              title={`Open ${pick.title}`}
                            >
                              {pick.poster ? (
                                <Image src={pick.poster} alt={pick.title} fill sizes="80px" className="object-cover" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-sm"></div>
                              )}
                            </Link>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <Link
                                    href={pick.mediaType === 'movie' ? `/movie/${pick.tmdbId}` : `/show/${pick.tmdbId}`}
                                    className="text-sm font-semibold text-[var(--text-primary)] line-clamp-1 hover:underline"
                                  >
                                    {pick.title}
                                  </Link>
                                  <p className="text-xs text-[var(--text-muted)] mt-0.5">
                                    {pick.mediaType === 'movie' ? 'Movie' : 'Show'} · {pick.releaseYear ?? 'Unknown'} · by {pick.senderName}
                                  </p>
                                </div>
                                <span className={`text-xs font-semibold px-2 py-1 rounded-full border ${pick.score >= 0 ? 'text-emerald-200 border-emerald-300/30 bg-emerald-500/10' : 'text-rose-200 border-rose-300/30 bg-rose-500/10'}`}>
                                  Score {pick.score}
                                </span>
                              </div>
                              {pick.note && (
                                <p className="mt-1 text-xs text-[var(--text-secondary)] line-clamp-2">{pick.note}</p>
                              )}
                              <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                                Watched {pick.watchedCount}/{getRequiredWatchedCount(pick)}
                              </p>
                              <div className="mt-2 flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleAttachPickToChat(pick)}
                                  className="px-2.5 py-1 rounded-lg text-xs font-semibold border border-indigo-300/30 bg-indigo-500/10 text-indigo-100 hover:border-indigo-200/50 transition-colors"
                                >
                                  Share to chat
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void handleVote(pick, 1)}
                                  disabled={votingPickId === pick.id}
                                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors ${pick.myVote === 1 ? 'bg-emerald-500/20 border-emerald-300/40 text-emerald-100' : 'bg-transparent border-white/15 text-[var(--text-secondary)] hover:border-emerald-300/30 hover:text-emerald-100'}`}
                                >
                                  ▲ {pick.upvotes}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void handleVote(pick, -1)}
                                  disabled={votingPickId === pick.id}
                                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors ${pick.myVote === -1 ? 'bg-rose-500/20 border-rose-300/40 text-rose-100' : 'bg-transparent border-white/15 text-[var(--text-secondary)] hover:border-rose-300/30 hover:text-rose-100'}`}
                                >
                                  ▼ {pick.downvotes}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void handleMarkWatched(pick)}
                                  disabled={pick.watchedByMe || markingWatchedPickId === pick.id}
                                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors ${pick.watchedByMe
                                      ? 'bg-sky-500/20 border-sky-300/40 text-sky-100'
                                      : 'bg-transparent border-white/15 text-[var(--text-secondary)] hover:border-sky-300/30 hover:text-sky-100'
                                    }`}
                                >
                                  {pick.watchedByMe ? 'Watched' : markingWatchedPickId === pick.id ? 'Saving...' : 'Mark watched'}
                                </button>
                              </div>
                              <p className="mt-2 text-[11px] text-[var(--text-muted)]">
                                Drag this card into group chat to share it.
                              </p>
                            </div>
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                </div>

                <div className="rounded-2xl border border-white/10 bg-[var(--bg-secondary)]/70 p-4">
                  <div className="flex items-center justify-between mb-3 gap-2">
                    <p className="text-sm font-semibold text-[var(--text-primary)]">Group chat</p>
                    <div className="flex items-center gap-2">
                      {chatLoading && <span className="text-xs text-[var(--text-muted)]">Loading...</span>}
                      {currentThemeChatKey !== 'global' && (
                        <div className="relative">
                          <button
                            type="button"
                            onClick={() => setShowThemePicker((prev) => !prev)}
                            className="h-8 px-2 rounded-full border border-cyan-300/50 bg-cyan-500/15 text-cyan-200 hover:text-cyan-100 hover:border-cyan-300/80 hover:bg-cyan-500/25 transition-colors flex items-center gap-1 text-[11px] font-semibold tracking-wide"
                            aria-label="Change group chat theme"
                            title="Change theme"
                          >
                            Theme
                          </button>
                          {showThemePicker && (
                            <div className="absolute right-0 top-10 z-50 w-[min(90vw,420px)] rounded-2xl border border-white/15 bg-[#090d19]/98 backdrop-blur-3xl shadow-[0_24px_60px_rgba(0,0,0,0.65)] p-3 overflow-hidden flex flex-col max-h-[60vh]">
                              <div className="flex items-center justify-between mb-3 border-b border-white/10 pb-2">
                                <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--text-muted)]">Group Theme</p>
                                <div className="flex bg-[#050917]/80 rounded-lg p-0.5 border border-white/10">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setThemeLang('English');
                                      if (typeof window !== 'undefined') window.localStorage.setItem(THEME_LANG_STORAGE_KEY, 'English');
                                    }}
                                    className={`px-3 py-1 text-[10px] font-semibold uppercase tracking-wider rounded-md transition-colors ${themeLang === 'English' ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-300/30' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] border border-transparent'}`}
                                  >
                                    English
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setThemeLang('Telugu');
                                      if (typeof window !== 'undefined') window.localStorage.setItem(THEME_LANG_STORAGE_KEY, 'Telugu');
                                    }}
                                    className={`px-3 py-1 text-[10px] font-semibold uppercase tracking-wider rounded-md transition-colors ${themeLang === 'Telugu' ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-300/30' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] border border-transparent'}`}
                                  >
                                    Telugu
                                  </button>
                                </div>
                              </div>

                              <div className="overflow-y-auto pr-1 pb-1 space-y-2 flex-1 min-h-0">
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
                                        onClick={() => void selectTheme(theme.id)}
                                        className={`relative overflow-hidden rounded-xl border transition-all text-left ${isActive ? 'border-cyan-300 shadow-[0_0_12px_rgba(103,232,249,0.5)]' : 'border-white/15 hover:border-white/45'}`}
                                        aria-label={`${theme.label}${isActive ? ' active' : ''}`}
                                      >
                                        <div className="h-10 w-full bg-cover bg-center" style={{ background: swatchBg }} />
                                        <div className="flex items-center justify-between gap-2 px-2 py-1.5 bg-[#050917]/95">
                                          <span className="text-[10px] font-medium text-[var(--text-primary)] line-clamp-1">{theme.label}</span>
                                          {isActive && (
                                            <span className="text-[9px] font-bold uppercase tracking-[0.08em] text-cyan-300">On</span>
                                          )}
                                        </div>
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <div
                    onDragOver={(event) => {
                      if (!Array.from(event.dataTransfer.types).includes(GROUP_PICK_DRAG_MIME)) return;
                      event.preventDefault();
                      if (!chatDropActive) setChatDropActive(true);
                    }}
                    onDragLeave={() => setChatDropActive(false)}
                    onDrop={handleChatDrop}
                    className={`mb-3 rounded-2xl border p-3 transition-colors ${chatDropActive
                        ? 'border-indigo-300/55 bg-indigo-500/12'
                        : 'border-white/10 bg-[var(--bg-primary)]/70'
                      }`}
                  >
                    {replyingToMessage && (
                      <div className="mb-3 flex items-center justify-between rounded-xl border-l-2 border-cyan-400/80 bg-[var(--bg-card)]/85 px-3 py-2">
                        <div className="min-w-0">
                          <p className="text-[10px] uppercase tracking-[0.12em] text-cyan-200/85">
                            Replying to {replyingToMessage.mine ? 'yourself' : replyingToMessage.senderName || 'member'}
                          </p>
                          <p className="text-xs text-[var(--text-muted)] line-clamp-1">
                            {replyingToMessage.body.trim() || replyingToMessage.sharedMovie?.title || 'Attachment'}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setReplyingToMessage(null)}
                          className="rounded-full border border-white/15 bg-[var(--bg-primary)] px-2 py-1 text-[11px] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                          aria-label="Cancel reply"
                        >
                          Clear
                        </button>
                      </div>
                    )}
                    <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                      <input
                        ref={chatInputRef}
                        type="text"
                        value={chatMessage}
                        onChange={(e) => {
                          const nextValue = e.target.value;
                          setChatMessage(nextValue);
                          syncChatMentionQuery(nextValue, e.target.selectionStart ?? nextValue.length);
                        }}
                        onClick={(e) => {
                          syncChatMentionQuery(
                            e.currentTarget.value,
                            e.currentTarget.selectionStart ?? e.currentTarget.value.length,
                          );
                        }}
                        onKeyUp={(e) => {
                          syncChatMentionQuery(
                            e.currentTarget.value,
                            e.currentTarget.selectionStart ?? e.currentTarget.value.length,
                          );
                        }}
                        onKeyDown={(e) => {
                          if (chatMentionQuery && filteredChatMentions.length > 0) {
                            if (e.key === 'ArrowDown') {
                              e.preventDefault();
                              setChatMentionIndex((prev) => (prev + 1) % filteredChatMentions.length);
                              return;
                            }
                            if (e.key === 'ArrowUp') {
                              e.preventDefault();
                              setChatMentionIndex((prev) => (prev - 1 + filteredChatMentions.length) % filteredChatMentions.length);
                              return;
                            }
                            if (e.key === 'Enter' || e.key === 'Tab') {
                              e.preventDefault();
                              const selected = filteredChatMentions[chatMentionIndex] ?? filteredChatMentions[0];
                              if (selected) applyChatMention(selected);
                              return;
                            }
                            if (e.key === 'Escape') {
                              e.preventDefault();
                              setChatMentionQuery(null);
                              setChatMentionIndex(0);
                              return;
                            }
                          }
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            void handleSendChatMessage();
                          }
                        }}
                        maxLength={1200}
                        placeholder="Write a message, or drag a movie from picks into this box..."
                        className="rounded-lg border border-white/10 bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-indigo-400/55"
                      />
                      <button
                        type="button"
                        onClick={() => void handleSendChatMessage()}
                        disabled={sendingChatMessage || (!chatMessage.trim() && !chatSharedPick)}
                        className="rounded-lg bg-indigo-400/90 px-4 py-2 text-sm font-semibold text-[#0b1327] disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {sendingChatMessage ? 'Sending...' : 'Send'}
                      </button>
                    </div>
                    {chatMentionQuery && filteredChatMentions.length > 0 && (
                      <div className="mt-2 rounded-xl border border-cyan-300/30 bg-[#070f1a]/95 p-1">
                        <p className="px-2 pb-1 text-[10px] uppercase tracking-[0.14em] text-cyan-200/70">
                          Mention a member
                        </p>
                        <div className="max-h-40 overflow-y-auto space-y-0.5">
                          {filteredChatMentions.map((target, index) => {
                            const handle = mentionHandle(target);
                            const active = index === chatMentionIndex;
                            return (
                              <button
                                key={`mention-${target.id}`}
                                type="button"
                                onMouseDown={(event) => event.preventDefault()}
                                onClick={() => applyChatMention(target)}
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
                    {chatSharedPick && (
                      <div className="mt-3 rounded-xl border border-indigo-300/35 bg-indigo-500/10 p-2.5">
                        <div className="flex items-center gap-2.5">
                          <Link
                            href={chatSharedPick.mediaType === 'movie' ? `/movie/${chatSharedPick.tmdbId}` : `/show/${chatSharedPick.tmdbId}`}
                            className="relative h-14 w-10 rounded-md overflow-hidden bg-black/25 shrink-0"
                            title={`Open ${chatSharedPick.title}`}
                          >
                            {chatSharedPick.poster ? (
                              <Image src={chatSharedPick.poster} alt={chatSharedPick.title} fill sizes="80px" className="object-cover" />
                            ) : (
                              <div className="w-full h-full" />
                            )}
                          </Link>
                          <div className="min-w-0 flex-1">
                            <p className="text-[11px] uppercase tracking-[0.12em] text-indigo-100/80">Attached movie</p>
                            <Link
                              href={chatSharedPick.mediaType === 'movie' ? `/movie/${chatSharedPick.tmdbId}` : `/show/${chatSharedPick.tmdbId}`}
                              className="text-sm font-semibold text-[var(--text-primary)] line-clamp-1 hover:underline"
                            >
                              {chatSharedPick.title}
                            </Link>
                            <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                              {chatSharedPick.mediaType === 'movie' ? 'Movie' : 'Show'} · {chatSharedPick.releaseYear ?? 'Unknown'}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setChatSharedPick(null)}
                            className="rounded-lg border border-white/15 bg-[var(--bg-card)] px-2.5 py-1 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    )}
                    <p className="mt-2 text-[11px] text-[var(--text-muted)]">
                      Drop a pick here to share it in chat. Mobile users can use Share to chat.
                    </p>
                  </div>

                  {chatMessages.length === 0 ? (
                    <p className="text-sm text-[var(--text-muted)]">No messages yet. Start the conversation.</p>
                  ) : (
                    <div
                      ref={chatContainerRef}
                      className="max-h-[26rem] overflow-y-auto pr-1 space-y-2.5 rounded-xl p-2"
                      style={{ background: activeTheme.bg }}
                    >
                      {chatMessages.map((message) => {
                        const showBody =
                          message.body.trim().length > 0 &&
                          !(
                            message.sharedMovie &&
                            message.body.toLowerCase().startsWith('shared movie:')
                          );
                        const isReplying = replyingToMessage?.id === message.id;
                        const replyMessage = message.replyToId
                          ? chatMessages.find((m) => m.id === message.replyToId)
                          : null;
                        const replyText = replyMessage?.body.trim()
                          || replyMessage?.sharedMovie?.title
                          || 'Attachment';
                        return (
                          <motion.div
                            key={message.id}
                            layout
                            drag="x"
                            dragConstraints={{ left: 0, right: 0 }}
                            dragElastic={{ right: 0.2, left: 0 }}
                            onDragEnd={(_, info) => {
                              if (info.offset.x > 50) {
                                setReplyingToMessage(message);
                                if (typeof navigator !== 'undefined' && navigator.vibrate) {
                                  navigator.vibrate(50);
                                }
                              }
                            }}
                            className={`flex items-end gap-2 ${message.mine ? 'justify-end' : 'justify-start'}`}
                          >
                            {!message.mine && (
                              <div className="h-7 w-7 shrink-0 rounded-full border border-white/15 bg-[var(--bg-primary)] flex items-center justify-center text-[11px] font-semibold text-[var(--text-secondary)]">
                                {(message.senderName || 'M').slice(0, 1).toUpperCase()}
                              </div>
                            )}
                            <article
                              onPointerDown={() => startReactionLongPress(message.id)}
                              onPointerUp={clearReactionLongPress}
                              onPointerCancel={clearReactionLongPress}
                              onPointerLeave={clearReactionLongPress}
                              onContextMenu={(event) => {
                                event.preventDefault();
                                clearReactionLongPress();
                                setReactionPickerMessageId(message.id);
                              }}
                              className={`relative max-w-[86%] rounded-2xl border px-3 py-2.5 transition-transform duration-200 ${message.mine
                                  ? ''
                                  : 'border-white/10 bg-[var(--bg-primary)]'
                                } ${isReplying ? 'scale-[1.01] ring-2 ring-cyan-400/45' : ''}`}
                              style={message.mine ? { background: activeTheme.bubble, borderColor: activeTheme.bubbleBorder } : undefined}
                            >
                              {!message.mine && (
                                <p className="text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
                                  {message.senderName}
                                </p>
                              )}
                              {message.replyToId && (
                                <div className="mb-2 rounded-lg border-l-2 border-cyan-400/70 bg-black/25 px-2 py-1.5">
                                  <p className="text-[10px] font-semibold text-cyan-200/85">
                                    {replyMessage?.senderName || 'Replied message'}
                                  </p>
                                  <p className="text-[11px] text-white/75 line-clamp-2">
                                    {replyText}
                                  </p>
                                </div>
                              )}
                              {message.sharedMovie && (
                                <Link
                                  href={message.sharedMovie.mediaType === 'movie' ? `/movie/${message.sharedMovie.tmdbId}` : `/show/${message.sharedMovie.tmdbId}`}
                                  className="mb-2 block rounded-xl border border-white/10 bg-[var(--bg-card)]/90 p-2 hover:border-indigo-300/45 transition-colors"
                                  title={`Open ${message.sharedMovie.title}`}
                                >
                                  <div className="flex items-center gap-2.5">
                                    <div className="relative h-14 w-10 rounded-md overflow-hidden bg-black/20 shrink-0">
                                      {message.sharedMovie.poster ? (
                                        <Image src={message.sharedMovie.poster} alt={message.sharedMovie.title} fill sizes="80px" className="object-cover" />
                                      ) : (
                                        <div className="w-full h-full" />
                                      )}
                                    </div>
                                    <div className="min-w-0">
                                      <p className="text-[11px] uppercase tracking-[0.12em] text-indigo-200/75">Shared pick</p>
                                      <p className="text-sm font-semibold text-[var(--text-primary)] line-clamp-1">
                                        {message.sharedMovie.title}
                                      </p>
                                      <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                                        {message.sharedMovie.mediaType === 'movie' ? 'Movie' : 'Show'} · {message.sharedMovie.releaseYear ?? 'Unknown'}
                                      </p>
                                    </div>
                                  </div>
                                </Link>
                              )}
                              {showBody && (
                                <p className="text-sm text-[var(--text-primary)] whitespace-pre-wrap break-words">
                                  {renderMessageBody(message.body)}
                                </p>
                              )}
                              <p className="mt-1 text-[10px] text-[var(--text-muted)] text-right">
                                {new Date(message.createdAt).toLocaleTimeString([], {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </p>
                              {message.reactions.length > 0 && (
                                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                                  {message.reactions.map((reaction) => (
                                    <button
                                      key={`${message.id}-${reaction.value}`}
                                      type="button"
                                      onClick={() => void handleToggleChatReaction(message.id, reaction.value)}
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
                                  className="absolute left-1/2 top-0 z-30 inline-flex w-max max-w-[calc(100vw-28px)] -translate-x-1/2 -translate-y-[calc(100%+8px)] flex-nowrap items-center gap-1.5 overflow-x-auto rounded-full border border-white/15 bg-[#111827]/95 px-2 py-1 shadow-[0_14px_30px_rgba(0,0,0,0.45)]"
                                >
                                  {CHAT_REACTION_OPTIONS.map((reaction) => {
                                    const active = message.reactions.some((item) => item.value === reaction && item.reacted);
                                    return (
                                      <button
                                        key={`${message.id}-${reaction}-option`}
                                        type="button"
                                        onClick={() => void handleToggleChatReaction(message.id, reaction)}
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
                        );
                      })}
                    </div>
                  )}
                  <p className="mt-2 text-[11px] text-[var(--text-muted)]">
                    Only accepted members in this group can read and send chat messages.
                  </p>
                </div>
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
