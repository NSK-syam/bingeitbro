'use client';

import { useState, useEffect } from 'react';
import { useAuth } from './AuthProvider';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AuthModal({ isOpen, onClose }: AuthModalProps) {
  const [mode, setMode] = useState<'login' | 'signup' | 'verify-otp'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');

  const { signIn, signUp, sendPhoneOtp, verifyPhoneOtp, checkUsernameAvailable } = useAuth();

  // Debounced username check
  useEffect(() => {
    if (username.length < 3) {
      setUsernameStatus('idle');
      return;
    }

    setUsernameStatus('checking');
    const timer = setTimeout(async () => {
      const available = await checkUsernameAvailable(username);
      setUsernameStatus(available ? 'available' : 'taken');
    }, 500);

    return () => clearTimeout(timer);
  }, [username, checkUsernameAvailable]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      if (mode === 'login') {
        const { error } = await signIn(email, password);
        if (error) {
          setError(error.message);
        } else {
          onClose();
        }
      } else if (mode === 'signup') {
        // Validate username
        if (username.length < 3) {
          setError('Username must be at least 3 characters');
          setLoading(false);
          return;
        }
        if (usernameStatus === 'taken') {
          setError('Username is already taken');
          setLoading(false);
          return;
        }
        if (!name.trim()) {
          setError('Please enter your name');
          setLoading(false);
          return;
        }
        if (!phone.trim()) {
          setError('Please enter your phone number');
          setLoading(false);
          return;
        }

        const result = await signUp(email, password, name, username, phone);
        if (result.error) {
          setError(result.error.message);
        } else if (result.needsPhoneVerification) {
          // Send OTP to phone
          const otpResult = await sendPhoneOtp(phone);
          if (otpResult.error) {
            setError(otpResult.error.message);
          } else {
            setMode('verify-otp');
            setSuccess('OTP sent to your phone!');
          }
        }
      } else if (mode === 'verify-otp') {
        const { error } = await verifyPhoneOtp(phone, otp);
        if (error) {
          setError(error.message);
        } else {
          setSuccess('Phone verified! You can now sign in.');
          setTimeout(() => {
            setMode('login');
            setSuccess('');
          }, 2000);
        }
      }
    } catch (err) {
      setError('Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const resendOtp = async () => {
    setError('');
    setLoading(true);
    const { error } = await sendPhoneOtp(phone);
    if (error) {
      setError(error.message);
    } else {
      setSuccess('OTP resent!');
    }
    setLoading(false);
  };

  const getTitle = () => {
    switch (mode) {
      case 'login': return 'Welcome back!';
      case 'signup': return 'Join BingeItBro';
      case 'verify-otp': return 'Verify Phone';
    }
  };

  const getSubtitle = () => {
    switch (mode) {
      case 'login': return 'Sign in to share recommendations';
      case 'signup': return 'Create an account to share your picks';
      case 'verify-otp': return `Enter the OTP sent to ${phone}`;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-md bg-[var(--bg-card)] rounded-2xl p-6 shadow-2xl border border-white/10 max-h-[90vh] overflow-y-auto">
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
          {mode === 'verify-otp' ? (
            <div>
              <label className="block text-sm text-[var(--text-muted)] mb-1">Enter OTP</label>
              <input
                type="text"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="123456"
                className="w-full px-4 py-3 bg-[var(--bg-secondary)] border border-white/5 rounded-xl text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]/50 focus:ring-1 focus:ring-[var(--accent)]/50 text-center text-2xl tracking-widest"
                required
                maxLength={6}
              />
              <button
                type="button"
                onClick={resendOtp}
                disabled={loading}
                className="mt-2 text-sm text-[var(--accent)] hover:underline"
              >
                Resend OTP
              </button>
            </div>
          ) : (
            <>
              {mode === 'signup' && (
                <>
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

                  <div>
                    <label className="block text-sm text-[var(--text-muted)] mb-1">Username</label>
                    <div className="relative">
                      <input
                        type="text"
                        id="username"
                        name="username"
                        autoComplete="username"
                        value={username}
                        onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                        placeholder="your_unique_username"
                        className={`w-full px-4 py-3 bg-[var(--bg-secondary)] border rounded-xl text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-1 ${
                          usernameStatus === 'available' ? 'border-green-500 focus:border-green-500 focus:ring-green-500/50' :
                          usernameStatus === 'taken' ? 'border-red-500 focus:border-red-500 focus:ring-red-500/50' :
                          'border-white/5 focus:border-[var(--accent)]/50 focus:ring-[var(--accent)]/50'
                        }`}
                        required
                        minLength={3}
                      />
                      <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        {usernameStatus === 'checking' && (
                          <div className="w-4 h-4 border-2 border-[var(--text-muted)] border-t-transparent rounded-full animate-spin" />
                        )}
                        {usernameStatus === 'available' && (
                          <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                        {usernameStatus === 'taken' && (
                          <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        )}
                      </div>
                    </div>
                    {usernameStatus === 'taken' && (
                      <p className="text-xs text-red-400 mt-1">This username is already taken</p>
                    )}
                    {usernameStatus === 'available' && (
                      <p className="text-xs text-green-400 mt-1">Username is available!</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm text-[var(--text-muted)] mb-1">Phone Number</label>
                    <input
                      type="tel"
                      id="phone"
                      name="phone"
                      autoComplete="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+91 9876543210"
                      className="w-full px-4 py-3 bg-[var(--bg-secondary)] border border-white/5 rounded-xl text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]/50 focus:ring-1 focus:ring-[var(--accent)]/50"
                      required
                    />
                    <p className="text-xs text-[var(--text-muted)] mt-1">We'll send an OTP to verify</p>
                  </div>
                </>
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
            </>
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
            disabled={loading || (mode === 'signup' && usernameStatus === 'taken')}
            className="w-full py-3 bg-[var(--accent)] text-[var(--bg-primary)] font-medium rounded-xl hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Please wait...' :
             mode === 'verify-otp' ? 'Verify OTP' :
             mode === 'login' ? 'Sign In' : 'Create Account'}
          </button>
        </form>

        {mode !== 'verify-otp' && (
          <div className="mt-6 text-center">
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
          </div>
        )}

        {mode === 'verify-otp' && (
          <div className="mt-6 text-center">
            <button
              onClick={() => {
                setMode('signup');
                setError('');
                setSuccess('');
              }}
              className="text-sm text-[var(--text-muted)] hover:text-[var(--accent)]"
            >
              Go back to signup
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
