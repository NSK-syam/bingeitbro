'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from './AuthProvider';
import { deleteMyAccount, getReauthMethod, type ReauthMethod } from '@/lib/account-deletion';

interface DeleteAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Confirmation modal for permanent in-app account deletion.
 * Rendered in a portal so fixed positioning is not clipped by a blurred header.
 */
export function DeleteAccountModal({ isOpen, onClose }: DeleteAccountModalProps) {
  const { user, signOut, signInWithGoogle } = useAuth();
  const [confirmText, setConfirmText] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [method, setMethod] = useState<ReauthMethod>('recent-session');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    // Reset each time the modal opens; the re-auth method depends on the native bridge (client only).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setConfirmText('');
    setPassword('');
    setError(null);
    setBusy(false);
    setMethod(getReauthMethod(user));
  }, [isOpen, user]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, busy, onClose]);

  if (!isOpen || !mounted || !user) return null;

  const confirmed = confirmText.trim() === 'DELETE';
  const needsPassword = method === 'password';
  const blocked = method === 'apple-unavailable';
  const canSubmit = confirmed && !busy && !blocked && (!needsPassword || password.length > 0);

  const handleDelete = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    const outcome = await deleteMyAccount({ password: needsPassword ? password : undefined, signOut });
    if (outcome.status === 'deleted') return; // deleteMyAccount redirects.
    setBusy(false);
    if (outcome.status === 'canceled') return;
    setError({ code: outcome.code, message: outcome.message });
  };

  const handleReauthGoogle = async () => {
    setBusy(true);
    const { error: reauthError } = await signInWithGoogle();
    if (reauthError) {
      setBusy(false);
      setError({ code: 'reauth_failed', message: reauthError.message });
    }
  };

  const showGoogleReauth = error?.code === 'reauth_required' && method === 'recent-session';

  return createPortal(
    <>
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[90]"
        onClick={() => !busy && onClose()}
      />
      <div className="fixed inset-0 z-[91] flex items-center justify-center p-4 pointer-events-none">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-account-title"
          className="pointer-events-auto w-full max-w-md max-h-[90vh] overflow-y-auto bg-[var(--bg-card)] rounded-2xl border border-red-500/30 shadow-2xl"
        >
          <div className="p-5 border-b border-white/10">
            <h2 id="delete-account-title" className="text-lg font-semibold text-red-400">
              Delete account
            </h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              This permanently deletes your Binge It Bro account. It cannot be undone.
            </p>
          </div>

          <div className="p-5 space-y-4 text-sm text-[var(--text-primary)]">
            <div>
              <p className="font-medium mb-1">What gets deleted</p>
              <ul className="list-disc pl-5 space-y-0.5 text-[var(--text-muted)]">
                <li>Your profile, username and sign-in</li>
                <li>Your recommendations, watchlist, watched list and top 10 picks</li>
                <li>Friends, recommendations you sent or received, and nudges</li>
                <li>Direct messages, watch groups you own, group picks, votes and chats</li>
                <li>Watch reminders, playlists, ratings, trivia scores and push notification devices</li>
                {method === 'apple-native' && <li>Your Sign in with Apple link to this app (revoked with Apple)</li>}
              </ul>
            </div>

            {method === 'apple-native' && (
              <p className="rounded-lg bg-[var(--bg-secondary)] p-3 text-[var(--text-muted)]">
                You signed in with Apple. You will be asked to confirm with Apple before your account is deleted.
              </p>
            )}
            {method === 'apple-unavailable' && (
              <p className="rounded-lg bg-[var(--bg-secondary)] p-3 text-[var(--text-muted)]">
                This account uses Sign in with Apple. Open the Binge It Bro iOS app and delete your account from your
                profile, or email <a className="text-[var(--accent)] underline" href="mailto:support@bingeitbro.com">support@bingeitbro.com</a>.
              </p>
            )}
            {method === 'recent-session' && (
              <p className="rounded-lg bg-[var(--bg-secondary)] p-3 text-[var(--text-muted)]">
                For your security, you need to have signed in within the last 10 minutes. If asked, sign in again and
                come back here.
              </p>
            )}

            {needsPassword && (
              <label className="block">
                <span className="block mb-1 font-medium">Password</span>
                <input
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={busy}
                  className="w-full px-3 py-2 rounded-lg bg-[var(--bg-secondary)] border border-white/10 focus:border-red-400 outline-none"
                />
              </label>
            )}

            {!blocked && (
              <label className="block">
                <span className="block mb-1 font-medium">
                  Type <span className="font-mono text-red-400">DELETE</span> to confirm
                </span>
                <input
                  type="text"
                  autoCapitalize="characters"
                  autoCorrect="off"
                  autoComplete="off"
                  spellCheck={false}
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  disabled={busy}
                  placeholder="DELETE"
                  className="w-full px-3 py-2 rounded-lg bg-[var(--bg-secondary)] border border-white/10 focus:border-red-400 outline-none font-mono"
                />
              </label>
            )}

            {error && (
              <div role="alert" className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-red-300">
                {error.message}
                {showGoogleReauth && (
                  <button
                    type="button"
                    onClick={handleReauthGoogle}
                    disabled={busy}
                    className="mt-2 block w-full px-3 py-2 rounded-lg bg-[var(--bg-secondary)] text-[var(--text-primary)] border border-white/10 hover:border-[var(--accent)]/50 disabled:opacity-50"
                  >
                    Sign in again with Google
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="p-5 border-t border-white/10 flex gap-3 justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="px-4 py-2 rounded-full text-sm bg-[var(--bg-secondary)] text-[var(--text-primary)] hover:bg-[var(--bg-primary)] disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={!canSubmit}
              className="px-4 py-2 rounded-full text-sm font-medium bg-red-600 text-white hover:bg-red-500 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {busy ? 'Deleting…' : error?.code && error.code !== 'canceled' ? 'Try again' : 'Delete permanently'}
            </button>
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}
