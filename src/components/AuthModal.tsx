'use client';

import { useState } from 'react';
import { useAuth } from './AuthProvider';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AuthModal({ isOpen, onClose }: AuthModalProps) {
  const [mode, setMode] = useState<'login' | 'signup' | 'otp'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');

  const { signIn, signUp, signInWithOtp } = useAuth();

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      if (mode === 'otp') {
        const { error } = await signInWithOtp(email);
        if (error) {
          setError(error.message);
        } else {
          setSuccess('Check your email for a magic link!');
        }
      } else if (mode === 'login') {
        const { error } = await signIn(email, password);
        if (error) {
          setError(error.message);
        } else {
          onClose();
        }
      } else {
        if (!name.trim()) {
          setError('Please enter your name');
          setLoading(false);
          return;
        }
        const { error } = await signUp(email, password, name);
        if (error) {
          setError(error.message);
        } else {
          setSuccess('Check your email for a confirmation link!');
        }
      }
    } catch (err) {
      setError('Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const getTitle = () => {
    switch (mode) {
      case 'login': return 'Welcome back!';
      case 'signup': return 'Join BingeItBro';
      case 'otp': return 'Sign in with Email';
    }
  };

  const getSubtitle = () => {
    switch (mode) {
      case 'login': return 'Sign in to share recommendations';
      case 'signup': return 'Create an account to share your picks';
      case 'otp': return "We'll send you a magic link";
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-md bg-[var(--bg-card)] rounded-2xl p-6 shadow-2xl border border-white/10">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-[var(--bg-secondary)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="text-center mb-6">
          <h2 className="text-2xl font-bold text-[var(--text-primary)]">
            {getTitle()}
          </h2>
          <p className="text-sm text-[var(--text-muted)] mt-1">
            {getSubtitle()}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'signup' && (
            <div>
              <label className="block text-sm text-[var(--text-muted)] mb-1">Your Name</label>
              <input
                type="text"
                id="name"
                name="name"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="What should we call you?"
                className="w-full px-4 py-3 bg-[var(--bg-secondary)] border border-white/5 rounded-xl text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]/50 focus:ring-1 focus:ring-[var(--accent)]/50"
                required
              />
            </div>
          )}

          <div>
            <label className="block text-sm text-[var(--text-muted)] mb-1">Email</label>
            <input
              type="email"
              id="email"
              name="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full px-4 py-3 bg-[var(--bg-secondary)] border border-white/5 rounded-xl text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]/50 focus:ring-1 focus:ring-[var(--accent)]/50"
              required
            />
          </div>

          {mode !== 'otp' && (
            <div>
              <label className="block text-sm text-[var(--text-muted)] mb-1">Password</label>
              <input
                type="password"
                id="password"
                name="password"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-4 py-3 bg-[var(--bg-secondary)] border border-white/5 rounded-xl text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]/50 focus:ring-1 focus:ring-[var(--accent)]/50"
                required
                minLength={6}
              />
            </div>
          )}

          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm">
              {error}
            </div>
          )}

          {success && (
            <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-xl text-green-400 text-sm">
              {success}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-[var(--accent)] text-[var(--bg-primary)] font-medium rounded-xl hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Please wait...' : mode === 'otp' ? 'Send Magic Link' : mode === 'login' ? 'Sign In' : 'Create Account'}
          </button>
        </form>

        {/* Divider */}
        {mode === 'login' && (
          <div className="my-4 flex items-center gap-3">
            <div className="flex-1 h-px bg-white/10"></div>
            <span className="text-sm text-[var(--text-muted)]">or</span>
            <div className="flex-1 h-px bg-white/10"></div>
          </div>
        )}

        {/* OTP option on login */}
        {mode === 'login' && (
          <button
            onClick={() => {
              setMode('otp');
              setError('');
              setSuccess('');
            }}
            className="w-full py-3 bg-[var(--bg-secondary)] text-[var(--text-primary)] font-medium rounded-xl hover:bg-[var(--bg-card-hover)] transition-colors border border-white/10"
          >
            Sign in with Magic Link
          </button>
        )}

        <div className="mt-6 text-center space-y-2">
          {mode === 'otp' ? (
            <button
              onClick={() => {
                setMode('login');
                setError('');
                setSuccess('');
              }}
              className="text-sm text-[var(--text-muted)] hover:text-[var(--accent)]"
            >
              Sign in with password instead
            </button>
          ) : (
            <button
              onClick={() => {
                setMode(mode === 'login' ? 'signup' : 'login');
                setError('');
                setSuccess('');
              }}
              className="text-sm text-[var(--text-muted)] hover:text-[var(--accent)]"
            >
              {mode === 'login' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
