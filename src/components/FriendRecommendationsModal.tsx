'use client';

import { useState, useEffect } from 'react';
import { useAuth } from './AuthProvider';
import { createClient, DBUser } from '@/lib/supabase';
import Link from 'next/link';

interface FriendRecommendation {
    id: string;
    sender: DBUser;
    movieTitle: string;
    moviePoster: string;
    movieYear?: number;
    personalMessage: string;
    isRead: boolean;
    createdAt: string;
    // For navigation
    movieId: string; // Either tmdb_id or recommendation_id
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
    const [recommendations, setRecommendations] = useState<FriendRecommendation[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [filter, setFilter] = useState<'all' | 'unread'>('unread');

    // Fetch recommendations
    useEffect(() => {
        if (!isOpen || !user) return;

        const fetchRecommendations = async () => {
            setIsLoading(true);
            const supabase = createClient();

            const { data, error } = await supabase
                .from('friend_recommendations')
                .select(`
          id,
          sender_id,
          movie_title,
          movie_poster,
          movie_year,
          personal_message,
          is_read,
          created_at,
          tmdb_id,
          recommendation_id,
          sender:users!friend_recommendations_sender_id_fkey(*)
        `)
                .eq('recipient_id', user.id)
                .order('created_at', { ascending: false });

            if (data && !error) {
                const mapped: FriendRecommendation[] = data.map((rec: any) => ({
                    id: rec.id,
                    sender: rec.sender,
                    movieTitle: rec.movie_title,
                    moviePoster: rec.movie_poster,
                    movieYear: rec.movie_year,
                    personalMessage: rec.personal_message,
                    isRead: rec.is_read,
                    createdAt: rec.created_at,
                    movieId: rec.tmdb_id || rec.recommendation_id,
                    isTmdb: !!rec.tmdb_id,
                }));
                setRecommendations(mapped);

                // Update count
                const unreadCount = mapped.filter(r => !r.isRead).length;
                onCountChange?.(unreadCount);
            }

            setIsLoading(false);
        };

        fetchRecommendations();
    }, [isOpen, user, onCountChange]);

    const markAsRead = async (recId: string) => {
        const supabase = createClient();
        const { error } = await supabase
            .from('friend_recommendations')
            .update({ is_read: true })
            .eq('id', recId);

        if (!error) {
            setRecommendations(prev =>
                prev.map(rec =>
                    rec.id === recId ? { ...rec, isRead: true } : rec
                )
            );

            // Update count
            const unreadCount = recommendations.filter(r => !r.isRead && r.id !== recId).length;
            onCountChange?.(unreadCount);
        }
    };

    const markAllAsRead = async () => {
        const supabase = createClient();
        const unreadIds = recommendations.filter(r => !r.isRead).map(r => r.id);

        if (unreadIds.length === 0) return;

        const { error } = await supabase
            .from('friend_recommendations')
            .update({ is_read: true })
            .in('id', unreadIds);

        if (!error) {
            setRecommendations(prev =>
                prev.map(rec => ({ ...rec, isRead: true }))
            );
            onCountChange?.(0);
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
                                Movies your friends think you'll love
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

                    {/* Filter Tabs */}
                    <div className="flex gap-2 mt-4">
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
                    </div>
                </div>

                {/* Content */}
                <div className="p-6 overflow-y-auto max-h-[60vh]">
                    {isLoading ? (
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
                                    : 'Your friends haven\'t sent you any recommendations yet'}
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

                                        <div className="flex gap-4">
                                            {/* Movie Poster */}
                                            <Link href={movieUrl} onClick={() => markAsRead(rec.id)}>
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
                                                <Link href={movieUrl} onClick={() => markAsRead(rec.id)}>
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
                                                        "{rec.personalMessage}"
                                                    </p>
                                                </div>

                                                {/* Actions */}
                                                <div className="flex items-center gap-3 mt-3">
                                                    <Link href={movieUrl} onClick={() => markAsRead(rec.id)}>
                                                        <button className="text-xs px-3 py-1.5 bg-[var(--accent)] text-[var(--bg-primary)] font-medium rounded-full hover:bg-[var(--accent-hover)] transition-colors">
                                                            View Movie
                                                        </button>
                                                    </Link>
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
                    )}
                </div>
            </div>
        </div>
    );
}
