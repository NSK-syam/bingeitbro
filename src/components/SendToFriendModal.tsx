'use client';

import { useState, useEffect } from 'react';
import { useAuth } from './AuthProvider';
import { createClient, DBUser } from '@/lib/supabase';

interface Friend extends DBUser {
    friendshipId?: string;
}

interface SendToFriendModalProps {
    isOpen: boolean;
    onClose: () => void;
    movieId: string;
    movieTitle: string;
    moviePoster: string;
    movieYear?: number;
    // For TMDB movies
    tmdbId?: string;
    // For user-created recommendations
    recommendationId?: string;
}

export function SendToFriendModal(props: SendToFriendModalProps) {
    const {
        isOpen,
        onClose,
        movieTitle,
        moviePoster,
        movieYear,
        tmdbId,
        recommendationId,
    } = props;
    const { user } = useAuth();
    const [friends, setFriends] = useState<Friend[]>([]);
    const [selectedFriends, setSelectedFriends] = useState<Set<string>>(new Set());
    const [personalMessage, setPersonalMessage] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [isSending, setIsSending] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);

    // New search state
    const [searchQuery, setSearchQuery] = useState('');

    // Fetch friends
    useEffect(() => {
        if (!isOpen || !user) return;

        const fetchFriends = async () => {
            setIsLoading(true);
            setError('');
            try {
                const supabase = createClient();
                const { data, error: fetchError } = await supabase
                    .from('friends')
                    .select('id, friend_id, friend:users!friends_friend_id_fkey(*)')
                    .eq('user_id', user.id);

                if (fetchError) {
                    console.error('Error fetching friends:', fetchError);
                    setError('Could not load friends. Please try again.');
                    setFriends([]);
                    return;
                }

                if (data && Array.isArray(data)) {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const friendsList: Friend[] = data
                        .filter((f: any) => f.friend != null)
                        .map((f: any) => ({
                            ...f.friend,
                            friendshipId: f.id,
                        }));
                    setFriends(friendsList);
                } else {
                    setFriends([]);
                }
            } catch (err) {
                console.error('Error fetching friends:', err);
                setError('Could not load friends. Please try again.');
                setFriends([]);
            } finally {
                setIsLoading(false);
            }
        };

        fetchFriends();
    }, [isOpen, user]); // Use user for stability

    // Filter friends based on search
    const filteredFriends = friends.filter(friend =>
        friend.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        friend.username?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const toggleFriendSelection = (friendId: string) => {
        const newSelection = new Set(selectedFriends);
        if (newSelection.has(friendId)) {
            newSelection.delete(friendId);
        } else {
            newSelection.add(friendId);
        }
        setSelectedFriends(newSelection);
    };

    const handleSend = async () => {
        if (selectedFriends.size === 0) {
            setError('Please select at least one friend');
            return;
        }

        // Message is optional now so we do not check for it here

        setIsSending(true);
        setError('');

        try {
            const supabase = createClient();

            // Prepare recommendations to send
            const recommendations = Array.from(selectedFriends).map(recipientId => ({
                sender_id: user!.id,
                recipient_id: recipientId,
                recommendation_id: recommendationId || null,
                tmdb_id: tmdbId || null,
                movie_title: movieTitle,
                movie_poster: moviePoster,
                movie_year: movieYear || null,
                personal_message: personalMessage.trim(), // Can be empty string
            }));

            const { error: insertError } = await supabase
                .from('friend_recommendations')
                .insert(recommendations);

            if (insertError) {
                // Check if it's a duplicate error
                if (insertError.code === '23505') {
                    setError('You\'ve already recommended this movie to one or more selected friends');
                } else {
                    setError('Failed to send recommendations. Please try again.');
                    console.error('Error sending recommendations:', insertError);
                }
                setIsSending(false);
                return;
            }

            // Success!
            setSuccess(true);
            setTimeout(() => {
                onClose();
                // Reset state
                setSelectedFriends(new Set());
                setPersonalMessage('');
                setSearchQuery('');
                setSuccess(false);
            }, 1500);
        } catch (err) {
            console.error('Error sending recommendations:', err);
            setError('An unexpected error occurred');
        } finally {
            setIsSending(false);
        }
    };

    const handleClose = () => {
        if (!isSending) {
            onClose();
            setSelectedFriends(new Set());
            setPersonalMessage('');
            setSearchQuery('');
            setError('');
            setSuccess(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={handleClose} />

            {/* Modal */}
            <div className="relative w-full max-w-lg max-h-[90vh] overflow-hidden bg-[var(--bg-card)] rounded-2xl shadow-2xl border border-white/10">
                {/* Header */}
                <div className="p-6 border-b border-white/10">
                    <button
                        onClick={handleClose}
                        disabled={isSending}
                        className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-[var(--bg-secondary)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors disabled:opacity-50"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>

                    <div className="flex items-center gap-4">
                        <div className="w-16 h-24 rounded-lg overflow-hidden bg-[var(--bg-secondary)] flex-shrink-0">
                            <img src={moviePoster} alt={movieTitle} className="w-full h-full object-cover" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-[var(--text-primary)]">Send to Friends</h2>
                            <p className="text-sm text-[var(--text-secondary)] mt-1">{movieTitle}</p>
                            {movieYear && <p className="text-xs text-[var(--text-muted)]">{movieYear}</p>}
                        </div>
                    </div>
                </div>

                {/* Content */}
                <div className="p-6 overflow-y-auto max-h-[60vh]">
                    {success ? (
                        <div className="flex flex-col items-center justify-center py-8">
                            <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mb-4">
                                <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                            </div>
                            <p className="text-lg font-medium text-[var(--text-primary)]">Recommendation sent! 🎬</p>
                        </div>
                    ) : (
                        <>
                            {/* Personal Message - Optional */}
                            <div className="mb-6">
                                <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
                                    Personal Message <span className="text-[var(--text-muted)] font-normal">(optional)</span>
                                </label>
                                <textarea
                                    name="personalMessage"
                                    id="personalMessage"
                                    value={personalMessage}
                                    onChange={(e) => setPersonalMessage(e.target.value)}
                                    placeholder="Tell your friend why they should watch this..."
                                    disabled={isSending}
                                    className="w-full px-4 py-3 bg-[var(--bg-secondary)] border border-white/5 rounded-xl text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]/50 resize-none disabled:opacity-50"
                                    rows={3}
                                    maxLength={500}
                                />
                            </div>

                            {/* Friends List with Search */}
                            <div>
                                <h3 className="text-sm font-medium text-[var(--text-primary)] mb-3">
                                    Select Friends ({selectedFriends.size} selected)
                                </h3>

                                {/* Search Box */}
                                <div className="relative mb-3">
                                    <input
                                        type="text"
                                        name="friendSelectSearch"
                                        id="friendSelectSearch"
                                        placeholder="Search friends..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="w-full px-4 py-2 pl-9 bg-[var(--bg-secondary)] border border-white/5 rounded-lg text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]/50"
                                    />
                                    <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                    </svg>
                                </div>

                                {isLoading ? (
                                    <div className="flex justify-center py-8">
                                        <div className="w-6 h-6 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
                                    </div>
                                ) : friends.length === 0 ? (
                                    <div className="text-center py-8 text-[var(--text-muted)]">
                                        <p>No friends yet</p>
                                        <p className="text-sm mt-1">Add friends first to send recommendations</p>
                                    </div>
                                ) : filteredFriends.length === 0 ? (
                                    <div className="text-center py-8 text-[var(--text-muted)]">
                                        <p>No friends found matching &quot;{searchQuery}&quot;</p>
                                    </div>
                                ) : (
                                    <div className="space-y-2 max-h-48 overflow-y-auto">
                                        {filteredFriends.map((friend) => (
                                            <button
                                                key={friend.id}
                                                onClick={() => toggleFriendSelection(friend.id)}
                                                disabled={isSending}
                                                className={`w-full flex items-center justify-between p-3 rounded-xl transition-all disabled:opacity-50 ${selectedFriends.has(friend.id)
                                                    ? 'bg-[var(--accent)]/20 border-2 border-[var(--accent)]'
                                                    : 'bg-[var(--bg-secondary)] border-2 border-transparent hover:border-white/10'
                                                    }`}
                                            >
                                                <div className="flex items-center gap-3">
                                                    <span className="text-2xl">{friend.avatar}</span>
                                                    <div className="text-left">
                                                        <p className="font-medium text-[var(--text-primary)]">{friend.name}</p>
                                                        <p className="text-xs text-[var(--text-muted)]">{friend.email}</p>
                                                    </div>
                                                </div>
                                                {selectedFriends.has(friend.id) && (
                                                    <svg className="w-5 h-5 text-[var(--accent)]" fill="currentColor" viewBox="0 0 20 20">
                                                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                                    </svg>
                                                )}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Error Message */}
                            {error && (
                                <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-400">
                                    {error}
                                </div>
                            )}
                        </>
                    )}
                </div>

                {/* Footer */}
                {!success && (
                    <div className="p-6 border-t border-white/10 flex gap-3">
                        <button
                            onClick={handleClose}
                            disabled={isSending}
                            className="flex-1 px-4 py-2.5 bg-[var(--bg-secondary)] text-[var(--text-primary)] font-medium rounded-full hover:bg-[var(--bg-card)] transition-colors disabled:opacity-50"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleSend}
                            disabled={isSending || selectedFriends.size === 0}
                            className="flex-1 px-4 py-2.5 bg-[var(--accent)] text-[var(--bg-primary)] font-medium rounded-full hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                            {isSending ? (
                                <>
                                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                    Sending...
                                </>
                            ) : (
                                <>
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                                    </svg>
                                    Send Recommendation
                                </>
                            )}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
