'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from './AuthProvider';
import { fetchTmdbWithProxy } from '@/lib/tmdb-fetch';
import {
  addWatchGroupPick,
  clearWatchGroupPickVote,
  createWatchGroup,
  fetchFriendsList,
  getIncomingWatchGroupInvites,
  getMyWatchGroups,
  getWatchGroupMembers,
  getPendingWatchGroupInvites,
  getWatchGroupPicks,
  leaveWatchGroup,
  respondToWatchGroupInvite,
  sendWatchGroupInvite,
  updateWatchGroup,
  voteOnWatchGroupPick,
  type FriendForSelect,
  type WatchGroup,
  type WatchGroupIncomingInvite,
  type WatchGroupMember,
  type WatchGroupPendingInvite,
  type WatchGroupPick,
} from '@/lib/supabase-rest';

type SearchMediaResult = {
  id: number;
  title: string;
  year: number | null;
  poster: string | null;
  rating: number;
  language: string;
};

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
  const [friends, setFriends] = useState<FriendForSelect[]>([]);
  const [incomingInvites, setIncomingInvites] = useState<WatchGroupIncomingInvite[]>([]);
  const [incomingInvitesLoading, setIncomingInvitesLoading] = useState(false);
  const [pendingInvites, setPendingInvites] = useState<WatchGroupPendingInvite[]>([]);
  const [pendingInvitesLoading, setPendingInvitesLoading] = useState(false);

  const [groupName, setGroupName] = useState('');
  const [groupDescription, setGroupDescription] = useState('');
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [editingGroupName, setEditingGroupName] = useState('');
  const [editingGroupDescription, setEditingGroupDescription] = useState('');
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
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  const activeGroup = useMemo(
    () => groups.find((group) => group.id === activeGroupId) ?? null,
    [groups, activeGroupId],
  );

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
      setIncomingInvites([]);
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
      setPendingInvites([]);
    } finally {
      setPendingInvitesLoading(false);
    }
  }, []);

  const loadActiveGroupData = useCallback(async (groupId: string) => {
    if (!user) return;
    setMembersLoading(true);
    setPicksLoading(true);
    try {
      const [memberRows, pickRows] = await Promise.all([
        getWatchGroupMembers(groupId),
        getWatchGroupPicks(groupId, user.id),
      ]);
      setMembers(memberRows);
      setPicks(pickRows);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load group data.');
      setMembers([]);
      setPicks([]);
    } finally {
      setMembersLoading(false);
      setPicksLoading(false);
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
    if (!activeGroup) {
      setEditingGroupName('');
      setEditingGroupDescription('');
      return;
    }
    setEditingGroupName(activeGroup.name);
    setEditingGroupDescription(activeGroup.description ?? '');
  }, [activeGroup]);

  useEffect(() => {
    if (!isOpen || !activeGroupId || !isActiveGroupOwner) {
      setPendingInvites([]);
      return;
    }
    void loadPendingInvites(activeGroupId);
  }, [isOpen, activeGroupId, isActiveGroupOwner, loadPendingInvites]);

  useEffect(() => {
    if (!isOpen) {
      setGroupName('');
      setGroupDescription('');
      setEditingGroupName('');
      setEditingGroupDescription('');
      setFriendSearch('');
      setInviteUserId('');
      setPickQuery('');
      setPickNote('');
      setSearchResults([]);
      setError('');
      setSuccess('');
      setMediaType('movie');
      setSendingInvite(false);
      setSavingGroupSettings(false);
      setLeavingGroup(false);
      setAddingPickId(null);
      setVotingPickId(null);
      setRespondingInviteId(null);
      setPendingInvites([]);
      setIncomingInvites([]);
    }
  }, [isOpen]);

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

  if (!isOpen) return null;

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
    if (!activeGroup || !isActiveGroupOwner) return;
    const name = editingGroupName.trim();
    if (name.length < 2) {
      setError('Group name must be at least 2 characters.');
      return;
    }
    setSavingGroupSettings(true);
    setError('');
    setSuccess('');
    try {
      await updateWatchGroup(activeGroup.id, {
        name,
        description: editingGroupDescription,
      });
      setSuccess('Group settings updated.');
      await loadGroups(activeGroup.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update group settings.');
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

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 sm:p-6">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={onClose} />
      <div
        className="relative w-full max-w-6xl max-h-[90vh] overflow-y-auto rounded-3xl border border-indigo-300/20 bg-[var(--bg-card)] p-6 sm:p-7 shadow-[0_30px_90px_rgba(0,0,0,0.55)]"
        onClick={(e) => e.stopPropagation()}
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
                      <p className="text-sm font-medium text-[var(--text-primary)] line-clamp-1">{group.name}</p>
                      <p className="text-xs text-[var(--text-muted)] mt-0.5">
                        {group.memberCount} members · {group.role === 'owner' ? 'Owner' : 'Member'}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </section>

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
                  <div className="flex flex-wrap items-center gap-2 justify-between">
                    <div>
                      <h3 className="text-lg font-semibold text-[var(--text-primary)]">{activeGroup.name}</h3>
                      <p className="text-xs text-[var(--text-muted)] mt-1">
                        {activeGroup.description || 'No description'} · {members.length} members
                      </p>
                    </div>
                    {isActiveGroupOwner && (
                      <span className="text-[11px] uppercase tracking-[0.16em] px-2 py-1 rounded-full border border-indigo-300/40 text-indigo-200">
                        Owner controls enabled
                      </span>
                    )}
                  </div>

                  <div className="mt-4">
                    <p className="text-xs uppercase tracking-[0.14em] text-[var(--text-muted)] mb-2">
                      Group settings
                    </p>
                    {isActiveGroupOwner ? (
                      <div className="rounded-xl border border-white/10 bg-[var(--bg-primary)] p-3 space-y-2">
                        <input
                          type="text"
                          value={editingGroupName}
                          onChange={(e) => setEditingGroupName(e.target.value)}
                          maxLength={60}
                          className="w-full rounded-lg border border-white/10 bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-indigo-400/55"
                          placeholder="Group name"
                        />
                        <textarea
                          value={editingGroupDescription}
                          onChange={(e) => setEditingGroupDescription(e.target.value)}
                          maxLength={300}
                          rows={2}
                          className="w-full rounded-lg border border-white/10 bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-indigo-400/55 resize-none"
                          placeholder="Group description"
                        />
                        <button
                          type="button"
                          onClick={handleSaveGroupSettings}
                          disabled={savingGroupSettings}
                          className="rounded-lg bg-indigo-400/90 px-3 py-2 text-sm font-semibold text-[#0b1327] disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {savingGroupSettings ? 'Saving…' : 'Save settings'}
                        </button>
                      </div>
                    ) : (
                      <div className="rounded-xl border border-white/10 bg-[var(--bg-primary)] p-3">
                        <p className="text-sm text-[var(--text-muted)]">
                          Don&apos;t want this group anymore? You can leave anytime.
                        </p>
                        <button
                          type="button"
                          onClick={handleLeaveGroup}
                          disabled={leavingGroup}
                          className="mt-2 rounded-lg border border-rose-300/40 bg-rose-500/15 px-3 py-2 text-sm font-semibold text-rose-100 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {leavingGroup ? 'Leaving…' : 'Leave group'}
                        </button>
                      </div>
                    )}
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
                            <span>{member.avatar || '🎬'}</span>
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
                                <span>{invite.inviteeAvatar || '🎬'}</span>
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
                          <div className="w-10 h-14 rounded-md overflow-hidden bg-black/30 flex-shrink-0">
                            {result.poster ? (
                              <img src={result.poster} alt={result.title} className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-xs">🎬</div>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-[var(--text-primary)] truncate">{result.title}</p>
                            <p className="text-xs text-[var(--text-muted)] mt-0.5">
                              {result.year ?? 'Unknown'} · {result.language} · ★ {result.rating.toFixed(1)}
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

                  {picks.length === 0 ? (
                    <p className="text-sm text-[var(--text-muted)]">No picks yet. Add the first movie or show above.</p>
                  ) : (
                    <div className="space-y-3 max-h-[45vh] overflow-y-auto pr-1">
                      {picks.map((pick) => (
                        <article
                          key={pick.id}
                          className="rounded-xl border border-white/10 bg-[var(--bg-primary)]/85 p-3"
                        >
                          <div className="flex gap-3">
                            <div className="w-14 h-20 rounded-md overflow-hidden bg-black/30 flex-shrink-0">
                              {pick.poster ? (
                                <img src={pick.poster} alt={pick.title} className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-sm">🎬</div>
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <p className="text-sm font-semibold text-[var(--text-primary)] line-clamp-1">{pick.title}</p>
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
                              <div className="mt-2 flex items-center gap-2">
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
                              </div>
                            </div>
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
