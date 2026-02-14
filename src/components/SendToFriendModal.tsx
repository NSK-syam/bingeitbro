'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthProvider';
import { fetchFriendsList, sendFriendRecommendations, getAlreadyRecommendedRecipientIds, type FriendForSelect } from '@/lib/supabase-rest';
import { notifyFriendRecommendationEmails } from '@/lib/notifications';
import { getResolvedTimeZone, parseLocalDateTimeInput } from '@/lib/local-datetime';

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
    const [friends, setFriends] = useState<FriendForSelect[]>([]);
    const [selectedFriends, setSelectedFriends] = useState<Set<string>>(new Set());
    const [personalMessage, setPersonalMessage] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [isSending, setIsSending] = useState(false);
    const [error, setError] = useState('');
    const [statusMessage, setStatusMessage] = useState('');
    const [friendsLoadError, setFriendsLoadError] = useState('');
    const [success, setSuccess] = useState(false);
    const [alreadySentTo, setAlreadySentTo] = useState<Set<string>>(new Set());
    const [scheduleReminder, setScheduleReminder] = useState(false);
    const [remindAtInput, setRemindAtInput] = useState('');
    const userTimeZone = getResolvedTimeZone();

    const [searchQuery, setSearchQuery] = useState('');

    const fetchFriends = useCallback(async () => {
        if (!user) return;
        setIsLoading(true);
        setFriendsLoadError('');
        try {
            // Use token-based REST (same as Manage Friends) so list loads reliably
            const friendsList = await fetchFriendsList(user.id);
            setFriends(friendsList);
        } catch (err) {
            console.error('Error fetching friends:', err);
            setFriendsLoadError(err instanceof Error ? err.message : 'Could not load friends. Please try again.');
            setFriends([]);
        } finally {
            setIsLoading(false);
        }
    }, [user]);

    // Fetch friends when modal opens; clear previous error
    useEffect(() => {
        if (!isOpen || !user) return;
        setError('');
        setStatusMessage('');
        fetchFriends();
    }, [isOpen, user, fetchFriends]);

    // Pre-check which friends already have this movie (so we can show "Already sent" and avoid 409)
    useEffect(() => {
        if (!isOpen || !user || friends.length === 0) {
            setAlreadySentTo(new Set());
            return;
        }
        const recipientIds = friends.map(f => f.id);
        getAlreadyRecommendedRecipientIds(user.id, recipientIds, {
            tmdbId: tmdbId != null ? Number(tmdbId) : null,
            recommendationId: recommendationId ?? null,
        }).then(setAlreadySentTo);
    }, [isOpen, user?.id, friends, tmdbId, recommendationId]);

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

        setIsSending(true);
        setError('');
        setStatusMessage('');

        try {
            const remindAtIso = (() => {
                if (!scheduleReminder) return null;
                const raw = remindAtInput.trim();
                if (!raw) return '';
                const parsed = parseLocalDateTimeInput(raw);
                if (!parsed) return '';
                if (Number.isNaN(parsed.getTime())) return '';
                return parsed.toISOString();
            })();

            if (scheduleReminder) {
                if (!remindAtIso) {
                    setError('Pick a valid date and time for the reminder.');
                    return;
                }
                if (new Date(remindAtIso).getTime() < Date.now() - 60_000) {
                    setError('Reminder time must be in the future.');
                    return;
                }
            }

            const recipientList = Array.from(selectedFriends);
            const alreadySent = await getAlreadyRecommendedRecipientIds(user!.id, recipientList, {
                tmdbId: tmdbId != null ? Number(tmdbId) : null,
                recommendationId: recommendationId ?? null,
            });
            const toSend = recipientList.filter(id => !alreadySent.has(id));

            if (toSend.length === 0) {
                setError('You\'ve already recommended this movie to all selected friends.');
                return;
            }

            const safePoster = (() => {
                const trimmed = (moviePoster || '').trim();
                if (!trimmed) return '';
                if (trimmed.startsWith('data:')) return '';
                if (trimmed.length > 500) return '';
                if (!trimmed.startsWith('https://image.tmdb.org/')) return '';
                return trimmed;
            })();
            const safeMessage = personalMessage.trim().slice(0, 200);
            const safeTitle = movieTitle.trim().slice(0, 200);

            const recommendations = toSend.map(recipientId => ({
                sender_id: user!.id,
                recipient_id: recipientId,
                recommendation_id: recommendationId ?? null,
                tmdb_id: tmdbId != null ? Number(tmdbId) : null,
                movie_title: safeTitle,
                movie_poster: safePoster,
                movie_year: movieYear ?? null,
                personal_message: safeMessage,
                remind_at: remindAtIso,
            }));

            const result = await sendFriendRecommendations(recommendations);

            const sentCount = result.sent ?? 0;
            const duplicateCount = result.skipped?.duplicates?.length ?? 0;
            const notAllowedCount = result.skipped?.notAllowed?.length ?? 0;
            const alreadyCount = alreadySent.size + duplicateCount;

            const messageParts: string[] = [];
            if (sentCount > 0) {
                messageParts.push(`Sent to ${sentCount} friend${sentCount === 1 ? '' : 's'}.`);
            }
            if (alreadyCount > 0) {
                messageParts.push(`Skipped ${alreadyCount} who already had this recommendation.`);
            }
            if (notAllowedCount > 0) {
                messageParts.push(`Skipped ${notAllowedCount} who aren't in your friends list.`);
            }

            if (sentCount === 0) {
                setError(messageParts.join(' ') || 'No recommendations were sent. Please try again.');
                return;
            }

            const sentRecipientIds = Array.isArray(result.sentRecipientIds) ? result.sentRecipientIds : [];
            let emailRecipients = recommendations;
            if (sentRecipientIds.length > 0) {
                const sentSet = new Set(sentRecipientIds);
                emailRecipients = recommendations.filter((rec) => sentSet.has(rec.recipient_id));
            } else if (sentCount !== recommendations.length) {
                emailRecipients = [];
            }

            const emailPayload = emailRecipients.map((rec) => ({
                recipient_id: rec.recipient_id,
                movie_title: rec.movie_title,
                movie_year: rec.movie_year ?? null,
                personal_message: rec.personal_message ?? null,
            }));
            if (emailPayload.length > 0) {
                void notifyFriendRecommendationEmails(emailPayload).catch((err) => {
                    console.warn('Failed to send recommendation email:', err);
                });
            }

            if (alreadyCount > 0 || notAllowedCount > 0) {
                setStatusMessage(messageParts.join(' '));
            } else if (scheduleReminder && remindAtIso) {
                setStatusMessage(`Reminder scheduled for ${new Date(remindAtIso).toLocaleString()}.`);
            }
            setSuccess(true);
            setTimeout(() => {
                onClose();
                setSelectedFriends(new Set());
                setPersonalMessage('');
                setSearchQuery('');
                setScheduleReminder(false);
                setRemindAtInput('');
                setSuccess(false);
                setError('');
                setStatusMessage('');
            }, alreadyCount > 0 || notAllowedCount > 0 ? 2500 : 1500);
        } catch (err) {
            console.error('Error sending recommendations:', err);
            if (err instanceof Error && err.message === 'DUPLICATE') {
                setError('One or more friends already have this recommendation. Try selecting only friends you haven\'t sent it to.');
            } else {
                setError(err instanceof Error ? err.message : 'Failed to send. Please try again.');
            }
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
            setScheduleReminder(false);
            setRemindAtInput('');
            setError('');
            setSuccess(false);
            setStatusMessage('');
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
                            {statusMessage && (
                                <p className="text-sm text-[var(--text-muted)] mt-2 text-center">{statusMessage}</p>
                            )}
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

                            <div className="mb-6 rounded-xl border border-white/10 bg-[var(--bg-secondary)]/70 p-4">
                                <label className="inline-flex items-center gap-2 text-sm font-medium text-[var(--text-primary)]">
                                    <input
                                        type="checkbox"
                                        checked={scheduleReminder}
                                        onChange={(e) => {
                                            setScheduleReminder(e.target.checked);
                                            if (!e.target.checked) setRemindAtInput('');
                                        }}
                                        disabled={isSending}
                                        className="h-4 w-4 rounded border-white/20 bg-transparent text-[var(--accent)] focus:ring-[var(--accent)]"
                                    />
                                    Schedule reminder for selected friends
                                </label>
                                <p className="mt-1 text-xs text-[var(--text-muted)]">
                                    They&apos;ll get a reminder notification and email at this time.
                                </p>
                                {scheduleReminder && (
                                    <div className="mt-3">
                                        <input
                                            type="datetime-local"
                                            name="friendRecommendationRemindAt"
                                            id="friendRecommendationRemindAt"
                                            value={remindAtInput}
                                            onChange={(e) => setRemindAtInput(e.target.value)}
                                            disabled={isSending}
                                            className="w-full rounded-lg border border-white/10 bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] focus:border-[var(--accent)]/60 focus:outline-none disabled:opacity-50"
                                        />
                                        <p className="mt-2 text-xs text-[var(--text-muted)]">Your timezone: {userTimeZone}</p>
                                    </div>
                                )}
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
                                ) : friendsLoadError ? (
                                    <div className="text-center py-8">
                                        <p className="text-red-400 mb-2">{friendsLoadError}</p>
                                        <p className="text-sm text-[var(--text-muted)] mb-4">The server may be slow. Try again in a moment.</p>
                                        <button
                                            type="button"
                                            onClick={() => fetchFriends()}
                                            className="px-4 py-2 bg-[var(--accent)] text-[var(--bg-primary)] font-medium rounded-full hover:opacity-90 transition-opacity"
                                        >
                                            Retry
                                        </button>
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
                                        {filteredFriends.map((friend) => {
                                            const alreadySent = alreadySentTo.has(friend.id);
                                            return (
                                                <button
                                                    key={friend.id}
                                                    onClick={() => !alreadySent && toggleFriendSelection(friend.id)}
                                                    disabled={isSending || alreadySent}
                                                    className={`w-full flex items-center justify-between p-3 rounded-xl transition-all disabled:opacity-50 ${alreadySent ? 'opacity-75' : ''} ${selectedFriends.has(friend.id)
                                                        ? 'bg-[var(--accent)]/20 border-2 border-[var(--accent)]'
                                                        : 'bg-[var(--bg-secondary)] border-2 border-transparent hover:border-white/10'
                                                        }`}
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <span className="text-2xl">{friend.avatar}</span>
                                                        <div className="text-left">
                                                            <p className="font-medium text-[var(--text-primary)]">{friend.name}</p>
                                                            {friend.username && (
                                                                <p className="text-xs text-[var(--text-muted)]">@{friend.username}</p>
                                                            )}
                                                            {alreadySent && (
                                                                <p className="text-xs text-amber-400 mt-0.5">Already recommended this movie</p>
                                                            )}
                                                        </div>
                                                    </div>
                                                    {alreadySent ? (
                                                        <span className="text-xs text-[var(--text-muted)]">Sent</span>
                                                    ) : selectedFriends.has(friend.id) ? (
                                                        <svg className="w-5 h-5 text-[var(--accent)]" fill="currentColor" viewBox="0 0 20 20">
                                                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                                        </svg>
                                                    ) : null}
                                                </button>
                                            );
                                        })}
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
