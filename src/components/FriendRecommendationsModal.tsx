'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthProvider';
import { useNudges, useWatched } from '@/hooks';
import { DBUser } from '@/lib/supabase';
import {
    getReceivedFriendRecommendations,
    markFriendRecommendationRead,
    markFriendRecommendationsRead,
    markFriendRecommendationWatched,
    getSentFriendRecommendations,
} from '@/lib/supabase-rest';
import { WatchlistButton } from '@/components/WatchlistButton';
import Link from 'next/link';

interface FriendRecommendation {
    id: string;
    sender: DBUser;
    movieTitle: string;
    moviePoster: string;
    movieYear?: number;
    personalMessage: string;
    isRead: boolean;
    isWatched?: boolean;
    watchedAt?: string | null;
    createdAt: string;
    movieId: string;
    isTmdb: boolean;
}

interface SentRecommendation {
    id: string;
    recipient: DBUser;
    movieTitle: string;
    moviePoster: string;
    movieYear?: number;
    personalMessage: string;
    isRead: boolean;
    isWatched?: boolean;
    watchedAt?: string | null;
    createdAt: string;
    movieId: string;
    isTmdb: boolean;
}

interface FriendRecommendationsModalProps {
    isOpen: boolean;
    onClose: () => void;
    onCountChange?: (count: number) => void;
}

export function FriendRecommendationsModal({
    isOpen,
    onClose,
    onCountChange,
}: FriendRecommendationsModalProps) {
    const { user } = useAuth();
    const { sendNudge, hasNudged } = useNudges();
    const { setWatched } = useWatched();
    const [recommendations, setRecommendations] = useState<FriendRecommendation[]>([]);
    const [sentRecommendations, setSentRecommendations] = useState<SentRecommendation[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isLoadingSent, setIsLoadingSent] = useState(false);
    const [view, setView] = useState<'received' | 'sent'>('received');
    const [filter, setFilter] = useState<'all' | 'unread'>('unread');
    const [nudgeSending, setNudgeSending] = useState<Record<string, boolean>>({});
    const [nudgeError, setNudgeError] = useState<Record<string, string | null>>({});

    const fetchRecommendations = useCallback(async () => {
        if (!user) return;
        setIsLoading(true);
        try {
            const rows = await getReceivedFriendRecommendations(user.id);
            const defaultSender: DBUser = {
                id: '',
                email: '',
                name: 'Anonymous',
                username: '',
                avatar: '🎬',
                created_at: '',
            };
            const mapped: FriendRecommendation[] = rows.map(rec => ({
                id: rec.id,
                sender: rec.sender
                    ? {
                          id: rec.sender.id,
                          email: rec.sender.email ?? '',
                          name: rec.sender.name ?? 'Anonymous',
                          username: '',
                          avatar: rec.sender.avatar ?? '🎬',
                          created_at: '',
                      }
                    : defaultSender,
                movieTitle: rec.movie_title,
                moviePoster: rec.movie_poster,
                movieYear: rec.movie_year ?? undefined,
                personalMessage: rec.personal_message ?? '',
                isRead: rec.is_read,
                isWatched: rec.is_watched ?? false,
                watchedAt: rec.watched_at ?? null,
                createdAt: rec.created_at,
                movieId: String(rec.tmdb_id ?? rec.recommendation_id ?? ''),
                isTmdb: !!rec.tmdb_id,
            }));
            setRecommendations(mapped);
            const unreadCount = mapped.filter(r => !r.isRead).length;
            onCountChange?.(unreadCount);
        } catch {
            setRecommendations([]);
            onCountChange?.(0);
        } finally {
            setIsLoading(false);
        }
    }, [user, onCountChange]);

    const fetchSentRecommendations = useCallback(async () => {
        if (!user) return;
        setIsLoadingSent(true);
        try {
            const rows = await getSentFriendRecommendations(user.id);
            const defaultRecipient: DBUser = {
                id: '',
                email: '',
                name: 'Friend',
                username: '',
                avatar: '🎬',
                created_at: '',
            };
            const mapped: SentRecommendation[] = rows.map(rec => ({
                id: rec.id,
                recipient: rec.recipient
                    ? {
                          id: rec.recipient.id,
                          email: rec.recipient.email ?? '',
                          name: rec.recipient.name ?? 'Friend',
                          username: '',
                          avatar: rec.recipient.avatar ?? '🎬',
                          created_at: '',
                      }
                    : defaultRecipient,
                movieTitle: rec.movie_title,
                moviePoster: rec.movie_poster,
                movieYear: rec.movie_year ?? undefined,
                personalMessage: rec.personal_message ?? '',
                isRead: rec.is_read,
                isWatched: rec.is_watched ?? false,
                watchedAt: rec.watched_at ?? null,
                createdAt: rec.created_at,
                movieId: String(rec.tmdb_id ?? rec.recommendation_id ?? ''),
                isTmdb: !!rec.tmdb_id,
            }));
            setSentRecommendations(mapped);
        } catch {
            setSentRecommendations([]);
        } finally {
            setIsLoadingSent(false);
        }
    }, [user]);

    const handleSendNudge = async (rec: SentRecommendation) => {
        setNudgeSending((prev) => ({ ...prev, [rec.id]: true }));
        setNudgeError((prev) => ({ ...prev, [rec.id]: null }));

        const { error } = await sendNudge(rec.recipient.id, {
            recommendationId: rec.isTmdb ? undefined : rec.movieId,
            tmdbId: rec.isTmdb ? rec.movieId : undefined,
            movieTitle: rec.movieTitle,
            moviePoster: rec.moviePoster,
            movieYear: rec.movieYear ?? null,
            friendRecommendationId: rec.id,
        });

        setNudgeSending((prev) => ({ ...prev, [rec.id]: false }));

        if (error) {
            const message =
                typeof error === 'string'
                    ? error
                    : typeof error?.message === 'string'
                        ? error.message
                        : 'Unable to send reminder';
            setNudgeError((prev) => ({ ...prev, [rec.id]: message }));
        }
    };

    useEffect(() => {
        if (!isOpen || !user) return;
        if (view === 'received') {
            fetchRecommendations();
        } else {
            fetchSentRecommendations();
        }
    }, [isOpen, user, view, fetchRecommendations, fetchSentRecommendations]);

    const markAsRead = async (recId: string) => {
        try {
            await markFriendRecommendationRead(recId);
            setRecommendations(prev =>
                prev.map(rec =>
                    rec.id === recId ? { ...rec, isRead: true } : rec
                )
            );
            const unreadCount = recommendations.filter(r => !r.isRead && r.id !== recId).length;
            onCountChange?.(unreadCount);
        } catch {
            // ignore
        }
    };

    const markAsWatched = async (recId: string) => {
        try {
            await markFriendRecommendationWatched(recId);
            setRecommendations(prev =>
                prev.map(rec =>
                    rec.id === recId ? { ...rec, isRead: true, isWatched: true, watchedAt: new Date().toISOString() } : rec
                )
            );
            const rec = recommendations.find(r => r.id === recId);
            if (rec?.movieId) {
                const watchedId = rec.isTmdb ? `tmdb-${rec.movieId}` : rec.movieId;
                setWatched(watchedId, true);
            }
            const unreadCount = recommendations.filter(r => !r.isRead && r.id !== recId).length;
            onCountChange?.(unreadCount);
        } catch {
            // ignore
        }
    };

    const markAllAsRead = async () => {
        const unreadIds = recommendations.filter(r => !r.isRead).map(r => r.id);
        if (unreadIds.length === 0) return;
        try {
            await markFriendRecommendationsRead(unreadIds);
            setRecommendations(prev =>
                prev.map(rec => ({ ...rec, isRead: true }))
            );
            onCountChange?.(0);
        } catch {
            // ignore
        }
    };

    const filteredRecommendations = filter === 'unread'
        ? recommendations.filter(r => !r.isRead)
        : recommendations;

    const unreadCount = recommendations.filter(r => !r.isRead).length;

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />

            {/* Modal */}
            <div className="relative w-full max-w-2xl max-h-[90vh] overflow-hidden bg-[var(--bg-card)] rounded-2xl shadow-2xl border border-white/10">
                {/* Header */}
                <div className="p-6 border-b border-white/10">
                    <button
                        onClick={onClose}
                        className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-[var(--bg-secondary)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>

                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="text-xl font-bold text-[var(--text-primary)]">Friend Recommendations</h2>
                            <p className="text-sm text-[var(--text-muted)] mt-1">
                                Movies your friends think you&apos;ll love
                            </p>
                        </div>
                        {unreadCount > 0 && (
                            <button
                                onClick={markAllAsRead}
                                className="text-xs text-[var(--accent)] hover:underline"
                            >
                                Mark all as read
                            </button>
                        )}
                    </div>

                    {/* View + Filter Tabs */}
                    <div className="flex flex-wrap gap-2 mt-4">
                        <button
                            onClick={() => setView('received')}
                            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${view === 'received'
                                    ? 'bg-[var(--accent)] text-[var(--bg-primary)]'
                                    : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                                }`}
                        >
                            Received
                        </button>
                        <button
                            onClick={() => setView('sent')}
                            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${view === 'sent'
                                    ? 'bg-[var(--accent)] text-[var(--bg-primary)]'
                                    : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                                }`}
                        >
                            Sent ({sentRecommendations.length})
                        </button>
                        {view === 'received' && (
                            <>
                                <button
                                    onClick={() => setFilter('unread')}
                                    className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${filter === 'unread'
                                            ? 'bg-[var(--accent)] text-[var(--bg-primary)]'
                                            : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                                        }`}
                                >
                                    Unread {unreadCount > 0 && `(${unreadCount})`}
                                </button>
                                <button
                                    onClick={() => setFilter('all')}
                                    className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${filter === 'all'
                                            ? 'bg-[var(--accent)] text-[var(--bg-primary)]'
                                            : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                                        }`}
                                >
                                    All ({recommendations.length})
                                </button>
                            </>
                        )}
                    </div>
                </div>

                {/* Content */}
                <div className="p-6 overflow-y-auto max-h-[60vh]">
                    {view === 'received' ? (
                    isLoading ? (
                        <div className="flex justify-center py-12">
                            <div className="w-8 h-8 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
                        </div>
                    ) : filteredRecommendations.length === 0 ? (
                        <div className="text-center py-12">
                            <div className="text-6xl mb-4">📬</div>
                            <p className="text-lg text-[var(--text-primary)] font-medium">
                                {filter === 'unread' ? 'No new recommendations' : 'No recommendations yet'}
                            </p>
                            <p className="text-sm text-[var(--text-muted)] mt-2">
                                {filter === 'unread'
                                    ? 'Check back later for movie suggestions from friends'
                                    : "Your friends haven&apos;t sent you any recommendations yet"}
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {filteredRecommendations.map((rec) => {
                                const movieUrl = rec.isTmdb
                                    ? `/movie/tmdb-${rec.movieId}`
                                    : `/movie/${rec.movieId}`;

                                const timeAgo = new Date(rec.createdAt).toLocaleDateString('en-US', {
                                    month: 'short',
                                    day: 'numeric',
                                    hour: 'numeric',
                                    minute: '2-digit',
                                });

                                return (
                                    <div
                                        key={rec.id}
                                        className={`relative p-4 rounded-xl border transition-all ${rec.isRead
                                                ? 'bg-[var(--bg-secondary)] border-white/5'
                                                : 'bg-[var(--bg-card)] border-[var(--accent)]/30 shadow-lg shadow-[var(--accent)]/10'
                                            }`}
                                    >
                                        {!rec.isRead && (
                                            <div className="absolute top-2 right-2">
                                                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-[var(--accent)] text-[var(--bg-primary)]">
                                                    NEW
                                                </span>
                                            </div>
                                        )}
                                        {rec.isWatched && (
                                            <div className="absolute top-2 left-2">
                                                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-500/20 text-green-300 border border-green-500/30">
                                                    Watched
                                                </span>
                                            </div>
                                        )}

                                        <div className="flex gap-4">
                                            {/* Movie Poster */}
                                            <Link href={movieUrl} prefetch={false} onClick={() => markAsRead(rec.id)}>
                                                <div className="w-20 h-28 rounded-lg overflow-hidden bg-[var(--bg-secondary)] flex-shrink-0 cursor-pointer hover:ring-2 hover:ring-[var(--accent)] transition-all">
                                                    <img
                                                        src={rec.moviePoster}
                                                        alt={rec.movieTitle}
                                                        className="w-full h-full object-cover"
                                                    />
                                                </div>
                                            </Link>

                                            {/* Content */}
                                            <div className="flex-1 min-w-0">
                                                {/* Sender Info */}
                                                <div className="flex items-center gap-2 mb-2">
                                                    <span className="text-xl">{rec.sender.avatar}</span>
                                                    <span className="text-sm font-medium text-[var(--text-primary)]">
                                                        {rec.sender.name}
                                                    </span>
                                                    <span className="text-xs text-[var(--text-muted)]">• {timeAgo}</span>
                                                </div>

                                                {/* Movie Title */}
                                                <Link href={movieUrl} prefetch={false} onClick={() => markAsRead(rec.id)}>
                                                    <h3 className="font-bold text-[var(--text-primary)] hover:text-[var(--accent)] transition-colors cursor-pointer">
                                                        {rec.movieTitle}
                                                        {rec.movieYear && (
                                                            <span className="text-sm text-[var(--text-muted)] ml-2">
                                                                ({rec.movieYear})
                                                            </span>
                                                        )}
                                                    </h3>
                                                </Link>

                                                {/* Personal Message */}
                                                <div className="mt-3 p-3 bg-[var(--bg-primary)] rounded-lg border border-white/5">
                                                    <p className="text-sm text-[var(--text-secondary)] italic">
                                                        &quot;{rec.personalMessage}&quot;
                                                    </p>
                                                </div>

                                                {/* Actions */}
                                                <div className="flex items-center gap-3 mt-3 flex-wrap">
                                                    <Link href={movieUrl} prefetch={false} onClick={() => markAsRead(rec.id)}>
                                                        <button className="text-xs px-3 py-1.5 bg-[var(--accent)] text-[var(--bg-primary)] font-medium rounded-full hover:bg-[var(--accent-hover)] transition-colors">
                                                            View Movie
                                                        </button>
                                                    </Link>
                                                    <WatchlistButton
                                                        movieId={rec.isTmdb ? `tmdb-${rec.movieId}` : rec.movieId}
                                                        title={rec.movieTitle}
                                                        poster={rec.moviePoster}
                                                        size="sm"
                                                        showLabel
                                                    />
                                                    {!rec.isWatched && (
                                                        <button
                                                            onClick={() => markAsWatched(rec.id)}
                                                            className="text-xs px-3 py-1.5 bg-green-500/20 text-green-300 border border-green-500/40 rounded-full hover:bg-green-500/30 transition-colors"
                                                        >
                                                            Mark as watched
                                                        </button>
                                                    )}
                                                    {!rec.isRead && (
                                                        <button
                                                            onClick={() => markAsRead(rec.id)}
                                                            className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                                                        >
                                                            Mark as read
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )
                    ) : (
                        view === 'sent' && (
                            isLoadingSent ? (
                                <div className="flex justify-center py-12">
                                    <div className="w-8 h-8 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
                                </div>
                            ) : sentRecommendations.length === 0 ? (
                                <div className="text-center py-12">
                                    <div className="text-6xl mb-4">📤</div>
                                    <p className="text-lg text-[var(--text-primary)] font-medium">
                                        No sent recommendations yet
                                    </p>
                                    <p className="text-sm text-[var(--text-muted)] mt-2">
                                        Send a recommendation to see who watches it.
                                    </p>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {sentRecommendations.map((rec) => {
                                        const movieUrl = rec.isTmdb
                                            ? `/movie/tmdb-${rec.movieId}`
                                            : `/movie/${rec.movieId}`;

                                        const timeAgo = new Date(rec.createdAt).toLocaleDateString('en-US', {
                                            month: 'short',
                                            day: 'numeric',
                                            hour: 'numeric',
                                            minute: '2-digit',
                                        });

                                        const nudgeKey = rec.isTmdb ? `tmdb-${rec.movieId}` : rec.movieId;
                                        const alreadyNudged = hasNudged(nudgeKey);
                                        const isSending = !!nudgeSending[rec.id];
                                        const errorMessage = nudgeError[rec.id];

                                        return (
                                            <div
                                                key={rec.id}
                                                className="relative p-4 rounded-xl border border-white/5 bg-[var(--bg-secondary)]"
                                            >
                                                {rec.isWatched ? (
                                                    <div className="absolute top-2 right-2">
                                                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-500/20 text-green-300 border border-green-500/30">
                                                            Watched
                                                        </span>
                                                    </div>
                                                ) : (
                                                    <div className="absolute top-2 right-2">
                                                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-white/10 text-[var(--text-muted)]">
                                                            Not watched yet
                                                        </span>
                                                    </div>
                                                )}

                                                <div className="flex gap-4">
                                                    <Link href={movieUrl} prefetch={false}>
                                                        <div className="w-20 h-28 rounded-lg overflow-hidden bg-[var(--bg-secondary)] flex-shrink-0 cursor-pointer hover:ring-2 hover:ring-[var(--accent)] transition-all">
                                                            <img
                                                                src={rec.moviePoster}
                                                                alt={rec.movieTitle}
                                                                className="w-full h-full object-cover"
                                                            />
                                                        </div>
                                                    </Link>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2 mb-2">
                                                            <span className="text-xl">{rec.recipient.avatar}</span>
                                                            <span className="text-sm font-medium text-[var(--text-primary)]">
                                                                {rec.recipient.name}
                                                            </span>
                                                            <span className="text-xs text-[var(--text-muted)]">• {timeAgo}</span>
                                                        </div>
                                                        <Link href={movieUrl} prefetch={false}>
                                                            <h3 className="font-bold text-[var(--text-primary)] hover:text-[var(--accent)] transition-colors cursor-pointer">
                                                                {rec.movieTitle}
                                                                {rec.movieYear && (
                                                                    <span className="text-sm text-[var(--text-muted)] ml-2">
                                                                        ({rec.movieYear})
                                                                    </span>
                                                                )}
                                                            </h3>
                                                        </Link>
                                                        <div className="mt-3 p-3 bg-[var(--bg-primary)] rounded-lg border border-white/5">
                                                            <p className="text-sm text-[var(--text-secondary)] italic">
                                                                &quot;{rec.personalMessage}&quot;
                                                            </p>
                                                        </div>
                                                        {rec.isWatched && rec.watchedAt && (
                                                            <p className="text-xs text-green-300 mt-3">
                                                                Watched on {new Date(rec.watchedAt).toLocaleDateString('en-US', {
                                                                    month: 'short',
                                                                    day: 'numeric',
                                                                    hour: 'numeric',
                                                                    minute: '2-digit',
                                                                })}
                                                            </p>
                                                        )}
                                                        {!rec.isWatched && (
                                                            <div className="mt-3 flex items-center gap-2 flex-wrap">
                                                                <button
                                                                    onClick={() => handleSendNudge(rec)}
                                                                    disabled={alreadyNudged || isSending}
                                                                    className={`text-xs px-3 py-1.5 rounded-full transition-colors ${
                                                                        alreadyNudged || isSending
                                                                            ? 'bg-green-500/20 text-green-300'
                                                                            : 'bg-pink-500/20 text-pink-300 hover:bg-pink-500/30'
                                                                    }`}
                                                                >
                                                                    {alreadyNudged ? 'Reminded' : isSending ? 'Sending...' : 'Send reminder'}
                                                                </button>
                                                                <span className="text-xs text-[var(--text-muted)]">
                                                                    Sends a nudge notification
                                                                </span>
                                                            </div>
                                                        )}
                                                        {errorMessage && (
                                                            <p className="text-xs text-red-300 mt-2">
                                                                {errorMessage}
                                                            </p>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )
                        )
                    )}
                </div>
            </div>
        </div>
    );
}
