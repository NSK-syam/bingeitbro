'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useAuth } from './AuthProvider';
import { isLikelyInAppBrowser } from '@/lib/browser-detect';
import { trackFunnelEvent } from '@/lib/funnel';

declare global {
    interface Window {
        turnstile?: {
            render: (
                container: string | HTMLElement,
                options: {
                    sitekey: string;
                    theme?: 'light' | 'dark' | 'auto';
                    callback?: (token: string) => void;
                    'expired-callback'?: () => void;
                    'error-callback'?: () => void;
                },
            ) => string;
            reset?: (widgetId: string) => void;
        };
    }
}

let turnstileScriptPromise: Promise<void> | null = null;

function loadTurnstileScript(): Promise<void> {
    if (typeof window === 'undefined') return Promise.resolve();
    if (window.turnstile) return Promise.resolve();
    if (turnstileScriptPromise) return turnstileScriptPromise;

    turnstileScriptPromise = new Promise<void>((resolve, reject) => {
        const existing = document.getElementById('cf-turnstile-script') as HTMLScriptElement | null;
        if (existing) {
            existing.addEventListener('load', () => resolve(), { once: true });
            existing.addEventListener('error', () => reject(new Error('Turnstile failed to load')), { once: true });
            return;
        }

        const script = document.createElement('script');
        script.id = 'cf-turnstile-script';
        script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
        script.async = true;
        script.defer = true;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('Turnstile failed to load'));
        document.head.appendChild(script);
    });

    return turnstileScriptPromise;
}

export function CinematicAuth() {
    const router = useRouter();
    const { signIn, signUp, signInWithGoogle, checkUsernameAvailable } = useAuth();

    // Animation Phases: 'viewfinder' -> 'auth'
    const [phase, setPhase] = useState<'viewfinder' | 'auth'>('viewfinder');
    const [countdown, setCountdown] = useState(3);

    // Auth Form State
    const [mode, setMode] = useState<'login' | 'signup' | 'reset'>('signup');
    const [showEmailSignup, setShowEmailSignup] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [name, setName] = useState('');
    const [username, setUsername] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState('');
    const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');
    const [showPassword, setShowPassword] = useState(false);
    const [birthDay, setBirthDay] = useState('');
    const [birthMonth, setBirthMonth] = useState('');
    const [birthYear, setBirthYear] = useState('');
    const [inAppBrowser, setInAppBrowser] = useState(false);
    const [captchaToken, setCaptchaToken] = useState('');
    const [captchaLoading, setCaptchaLoading] = useState(false);
    const [captchaError, setCaptchaError] = useState('');
    const turnstileWidgetIdRef = useRef<string | null>(null);
    const turnstileSiteKey = (process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || '').trim();

    useEffect(() => {
        if (phase !== 'viewfinder') return;
        if (countdown > 0) {
            const timer = setTimeout(() => setCountdown(c => c - 1), 1000);
            return () => clearTimeout(timer);
        } else {
            setPhase('auth');
        }
    }, [countdown, phase]);

    useEffect(() => {
        if (phase !== 'auth' || typeof window === 'undefined') return;
        if (mode !== 'signup' || !turnstileSiteKey) {
            setCaptchaToken('');
            setCaptchaError('');
            turnstileWidgetIdRef.current = null;
            return;
        }
        const mount = async () => {
            setCaptchaLoading(true);
            setCaptchaError('');
            try {
                await loadTurnstileScript();
                if (phase !== 'auth' || mode !== 'signup') return;
                const container = document.getElementById('signup-turnstile');
                if (!container || !window.turnstile) return;
                if (!turnstileWidgetIdRef.current) {
                    turnstileWidgetIdRef.current = window.turnstile.render(container, {
                        sitekey: turnstileSiteKey,
                        theme: 'dark',
                        callback: (token) => {
                            setCaptchaToken(token);
                            setCaptchaError('');
                        },
                        'expired-callback': () => setCaptchaToken(''),
                        'error-callback': () => {
                            setCaptchaToken('');
                            setCaptchaError('Verification failed. Please retry.');
                        },
                    });
                } else if (window.turnstile.reset && turnstileWidgetIdRef.current) {
                    window.turnstile.reset(turnstileWidgetIdRef.current);
                }
            } catch {
                setCaptchaError('Unable to load verification challenge. Refresh and try again.');
            } finally {
                setCaptchaLoading(false);
            }
        };
        void mount();
    }, [phase, mode, turnstileSiteKey]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        setInAppBrowser(isLikelyInAppBrowser(window.navigator.userAgent || ''));
    }, []);

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

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setSuccess('');
        setLoading(true);
        trackFunnelEvent('email_auth_submit', { mode });

        try {
            if (mode === 'login') {
                const { error } = await signIn(email, password);
                if (error) {
                    setError(error.message);
                    trackFunnelEvent('email_auth_error', { mode, message: error.message.slice(0, 120) });
                } else {
                    trackFunnelEvent('email_auth_success', { mode });
                    router.push('/');
                }
            } else {
                if (username.length < 3) throw new Error('Username must be at least 3 characters');
                if (username.length > 24) throw new Error('Username must be 24 characters or fewer');
                if (usernameStatus === 'taken') throw new Error('Username is already taken');
                if (!name.trim()) throw new Error('Please enter your name');
                if (password.length < 8) throw new Error('Password must be at least 8 characters');

                const y = Number(birthYear);
                const m = Number(birthMonth);
                const d = Number(birthDay);
                if (!y || !m || !d) throw new Error('Please select your birthday (day, month, year)');
                const dt = new Date(Date.UTC(y, m - 1, d));
                if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) throw new Error('Please select a valid birthday');
                const birthdate = `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

                if (turnstileSiteKey && !captchaToken) throw new Error('Please complete the verification challenge.');

                const res = await signUp(email, password, name, username, birthdate, captchaToken);
                if (res.error) {
                    setError(res.error.message);
                    trackFunnelEvent('email_auth_error', { mode, message: res.error.message.slice(0, 120) });
                } else {
                    trackFunnelEvent('email_auth_success', { mode });
                    router.push('/');
                }
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Something went wrong';
            setError(message);
            trackFunnelEvent('email_auth_error', { mode, message: message.slice(0, 120) });
        } finally {
            setLoading(false);
        }
    };

    const handleGoogleSignIn = async () => {
        setError('');
        setLoading(true);
        trackFunnelEvent('oauth_start', { source: 'cinematic_auth', mode });
        const { error } = await signInWithGoogle();
        if (error) {
            setError(error.message);
            setLoading(false);
            trackFunnelEvent('oauth_error', { source: 'cinematic_auth', mode, message: error.message.slice(0, 120) });
        } else {
            trackFunnelEvent('oauth_redirect_started', { source: 'cinematic_auth', mode });
        }
    };

    const handlePasswordReset = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setSuccess('');
        setLoading(true);

        try {
            const { createClient } = await import('@/lib/supabase');
            const supabase = createClient();
            const { error } = await supabase.auth.resetPasswordForEmail(email, {
                redirectTo: `${window.location.origin}/reset-password`,
            });

            if (error) {
                setError(error.message);
            } else {
                setSuccess('Check your email (and spam folder) for a password reset link!');
                setTimeout(() => {
                    setMode('login');
                    setShowEmailSignup(true);
                    setSuccess('');
                }, 3000);
            }
        } catch {
            setError('Something went wrong');
        } finally {
            setLoading(false);
        }
    };

    const openInBrowser = () => {
        if (typeof window === 'undefined') return;
        const target = `${window.location.origin}${window.location.pathname}${window.location.search}`;
        try { window.open(target, '_blank', 'noopener,noreferrer'); } catch { window.location.href = target; }
    };

    const showCredentialForm = mode === 'reset' || mode === 'login' || (mode === 'signup' && showEmailSignup);

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-50 overflow-hidden font-sans text-white">
            {/* Phase 1: Viewfinder */}
            <AnimatePresence>
                {phase === 'viewfinder' && (
                    <motion.div
                        key="viewfinder"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0, scale: 1.1, filter: 'blur(10px)' }}
                        transition={{ duration: 0.5 }}
                        className="absolute inset-0 pointer-events-none flex flex-col items-center justify-between p-8 sm:p-12 border-[1px] border-white/20"
                        style={{
                            boxShadow: 'inset 0 0 100px rgba(0,0,0,0.8)',
                            backgroundImage: 'linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)',
                            backgroundSize: '100px 100px',
                            backgroundPosition: 'center'
                        }}
                    >
                        {/* Viewfinder UI Elements */}
                        <div className="w-full flex justify-between items-start font-mono text-xl text-red-500 font-bold tracking-widest">
                            <div className="flex items-center gap-3">
                                <motion.div
                                    className="w-4 h-4 rounded-full bg-red-500"
                                    animate={{ opacity: [1, 0, 1] }}
                                    transition={{ duration: 1, repeat: Infinity }}
                                />
                                REC
                            </div>
                            <div className="text-white/70 text-base">BAT 98%</div>
                        </div>

                        {/* Crosshairs & Countdown */}
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 flex items-center justify-center">
                            <div className="w-1 h-4 bg-white/50 absolute top-0" />
                            <div className="w-1 h-4 bg-white/50 absolute bottom-0" />
                            <div className="w-4 h-1 bg-white/50 absolute left-0" />
                            <div className="w-4 h-1 bg-white/50 absolute right-0" />

                            {/* The Countdown Number */}
                            <motion.div
                                key={countdown}
                                initial={{ opacity: 0, scale: 0.5 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 1.5 }}
                                transition={{ duration: 0.5 }}
                                className="text-8xl font-mono text-white/90 font-bold tabular-nums"
                            >
                                {countdown > 0 ? countdown : ''}
                            </motion.div>
                        </div>

                        <div className="w-full flex justify-between items-end font-mono text-white/70 text-sm">
                            <div>F2.8 / ISO 800</div>
                            <div>00:00:0{Math.max(0, 3 - countdown)}:00</div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Phase 3: Auth Slate */}
            <AnimatePresence>
                {phase === 'auth' && (
                    <motion.div
                        key="auth"
                        initial={{ y: '100vh', rotate: 5 }}
                        animate={{ y: 0, rotate: 0 }}
                        transition={{ type: 'spring', damping: 20, stiffness: 100 }}
                        className="absolute inset-0 z-20 flex items-center justify-center p-4 sm:p-8"
                    >
                        <div className="bib-clapper shadow-[0_30px_100px_rgba(0,0,0,0.8)] relative">
                            {/* Clapper Top Stripe */}
                            <div className="bib-clapper-top" style={{ animation: 'none' }}>
                                <div className="bib-clapper-stripes" />
                            </div>

                            {/* Form Content Wrapper (replaces bib-clapper-body) */}
                            <div className="bib-clapper-body relative text-center">
                                <div className="absolute top-6 right-8 text-right font-mono text-[10px] sm:text-xs text-[#a1a1aa] uppercase tracking-widest">
                                    Take: 1<br />Roll: A
                                </div>

                                <div className="bib-clapper-title mb-1 mt-4">
                                    {mode === 'signup' ? 'Admit One' : 'Welcome'}
                                </div>
                                <div className="bib-clapper-sub mb-8 text-[#a1a1aa]">
                                    {mode === 'signup' ? 'Claim your ticket to the director\'s chair.' : 'Ready for the next scene?'}
                                </div>

                                {/* Auth Form Fields */}
                                <div className="py-2 flex flex-col items-center w-full">
                                    {/* Google OAuth & Mode Selector */}
                                    {mode !== 'reset' && (
                                        <div className="w-full">
                                            {inAppBrowser && (
                                                <div className="mb-3 rounded-xl border border-amber-400/30 bg-amber-500/10 p-3 text-sm text-amber-200">
                                                    Google sign-in is blocked inside in-app browsers. Open this page in Safari/Chrome and continue.
                                                    <button onClick={openInBrowser} className="mt-2 w-full rounded-lg bg-amber-400/20 px-3 py-2 font-medium">Open in Browser</button>
                                                </div>
                                            )}
                                            <button
                                                onClick={handleGoogleSignIn}
                                                disabled={loading || inAppBrowser}
                                                className="w-full py-3 px-4 bg-white/10 text-white border border-white/20 font-medium rounded-xl hover:bg-white/20 transition-colors flex items-center justify-center gap-3"
                                            >
                                                <svg className="w-5 h-5" viewBox="0 0 24 24">
                                                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                                                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                                                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                                                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                                                </svg>
                                                Continue with Google
                                            </button>

                                            <div className="relative my-6">
                                                <div className="absolute inset-0 flex items-center">
                                                    <div className="w-full border-t border-white/10" />
                                                </div>
                                                <div className="relative flex justify-center text-sm">
                                                    <span className="px-4 text-white/50 bg-[#0b0b0e]">or</span>
                                                </div>
                                            </div>

                                            {mode === 'signup' && !showEmailSignup && (
                                                <button
                                                    type="button"
                                                    onClick={() => { setShowEmailSignup(true); setError(''); setSuccess(''); }}
                                                    className="w-full mb-4 py-3 px-4 rounded-xl border border-white/15 text-white hover:border-white/35 transition-colors"
                                                >
                                                    Use email and password instead
                                                </button>
                                            )}
                                        </div>
                                    )}

                                    {(error || success) && (
                                        <div className="space-y-3 mb-4 w-full">
                                            {error && <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm">{error}</div>}
                                            {success && <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-xl text-green-400 text-sm">{success}</div>}
                                        </div>
                                    )}

                                    {showCredentialForm && (
                                        <form onSubmit={mode === 'reset' ? handlePasswordReset : handleSubmit} className="space-y-4 w-full text-left max-h-[40vh] overflow-y-auto px-1 custom-scrollbar">
                                            {mode === 'signup' && (
                                                <>
                                                    <div>
                                                        <label className="block text-sm text-white/60 mb-1">Your Name</label>
                                                        <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Director's Name" className="w-full px-4 py-3 bg-black/40 border border-white/10 rounded-xl text-white outline-none focus:border-cyan-400 focus:bg-white/5 transition-colors" required />
                                                    </div>
                                                    <div>
                                                        <label className="block text-sm text-white/60 mb-1">Username</label>
                                                        <input type="text" value={username} onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))} placeholder="Callsign" className={`w-full px-4 py-3 bg-black/40 border rounded-xl text-white outline-none focus:bg-white/5 transition-colors focus:border-cyan-400 ${usernameStatus === 'taken' ? 'border-red-500' : 'border-white/10'}`} required minLength={3} />
                                                        {usernameStatus === 'taken' && <p className="text-xs text-red-400 mt-1">This username is already taken</p>}
                                                        {usernameStatus === 'available' && <p className="text-xs text-green-400 mt-1">Username is available!</p>}
                                                    </div>
                                                    <div>
                                                        <label className="block text-sm text-white/60 mb-1">Birthday</label>
                                                        <div className="grid grid-cols-3 gap-2">
                                                            <select value={birthDay} onChange={e => setBirthDay(e.target.value)} className="bg-black/40 border border-white/10 rounded-xl p-3 text-white outline-none focus:border-cyan-400 focus:bg-white/5 transition-colors" required>
                                                                <option value="">DD</option>
                                                                {Array.from({ length: 31 }, (_, i) => String(i + 1)).map(v => <option key={v} value={v}>{v}</option>)}
                                                            </select>
                                                            <select value={birthMonth} onChange={e => setBirthMonth(e.target.value)} className="bg-black/40 border border-white/10 rounded-xl p-3 text-white outline-none focus:border-cyan-400 focus:bg-white/5 transition-colors" required>
                                                                <option value="">MM</option>
                                                                {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map((l, i) => <option key={l} value={String(i + 1)}>{l}</option>)}
                                                            </select>
                                                            <select value={birthYear} onChange={e => setBirthYear(e.target.value)} className="bg-black/40 border border-white/10 rounded-xl p-3 text-white outline-none focus:border-cyan-400 focus:bg-white/5 transition-colors" required>
                                                                <option value="">YYYY</option>
                                                                {Array.from({ length: 100 }, (_, i) => String(new Date().getFullYear() - i)).map(v => <option key={v} value={v}>{v}</option>)}
                                                            </select>
                                                        </div>
                                                    </div>
                                                    {turnstileSiteKey && (
                                                        <div className="rounded-xl border border-white/10 bg-black/40 p-3">
                                                            <div id="signup-turnstile" className="min-h-[65px]" />
                                                            {captchaError && <p className="text-xs text-red-400 mt-2">{captchaError}</p>}
                                                        </div>
                                                    )}
                                                </>
                                            )}
                                            <div>
                                                <label className="block text-sm text-white/60 mb-1">Email</label>
                                                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="contact@agency.com" className="w-full px-4 py-3 bg-black/40 border border-white/10 rounded-xl text-white outline-none focus:border-cyan-400 focus:bg-white/5 transition-colors" required />
                                            </div>
                                            {mode !== 'reset' && (
                                                <div className="relative">
                                                    <label className="block text-sm text-white/60 mb-1">Password</label>
                                                    <input type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" className="w-full px-4 py-3 bg-black/40 border border-white/10 rounded-xl text-white outline-none focus:border-cyan-400 focus:bg-white/5 transition-colors" required minLength={6} />
                                                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-[38px] text-white/50 hover:text-white">
                                                        {showPassword ? 'Hide' : 'Show'}
                                                    </button>
                                                </div>
                                            )}
                                            {mode === 'login' && (
                                                <div className="text-right mt-1">
                                                    <button type="button" onClick={() => setMode('reset')} className="text-sm text-cyan-400 hover:text-cyan-300">Forgot password?</button>
                                                </div>
                                            )}

                                            <button type="submit" disabled={loading} className="w-full mt-6 py-4 bg-gradient-to-r from-[#f59e0b] to-[#f97316] text-[#0a0a0c] font-bold uppercase tracking-widest hover:brightness-110 transition-all rounded-full disabled:opacity-50 shadow-[0_12px_30px_rgba(245,158,11,0.35)]">
                                                {loading ? 'Rolling...' : mode === 'signup' ? 'Action!' : mode === 'login' ? 'Roll Camera' : 'Cut & Reset'}
                                            </button>
                                        </form>
                                    )}
                                </div>

                                <div className="mt-6 text-center text-[11px] uppercase tracking-widest text-[#a1a1aa] bib-clapper-meta flex justify-center !mt-4 border-t border-white/10 pt-4">
                                    <button onClick={() => {
                                        const next = mode === 'login' ? 'signup' : 'login';
                                        setMode(next);
                                        setShowEmailSignup(next !== 'signup');
                                    }} className="hover:text-[#fbbf24] transition-colors focus:outline-none focus:text-[#fbbf24]">
                                        {mode === 'login' ? "New cast member? Sign up" : mode === 'signup' ? "Returning cast? Sign in" : "Back to set"}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
