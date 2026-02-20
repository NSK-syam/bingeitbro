'use client';

import { safeLocalStorageGet, safeLocalStorageSet } from '@/lib/safe-storage';

type FunnelProps = Record<string, string | number | boolean | null | undefined>;

const SESSION_KEY = 'bib-funnel-session-id';
const BUFFER_KEY = 'bib-funnel-buffer';
const MAX_BUFFERED_EVENTS = 60;
const ENABLED = process.env.NEXT_PUBLIC_ENABLE_FUNNEL_METRICS === 'true';

function randomId(length = 18): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

function getSessionId(): string {
  const existing = (safeLocalStorageGet(SESSION_KEY) || '').trim();
  if (existing) return existing;
  const next = randomId();
  safeLocalStorageSet(SESSION_KEY, next);
  return next;
}

function sanitizeProps(props: FunnelProps): Record<string, string | number | boolean | null> {
  const clean: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(props)) {
    if (!/^[a-zA-Z0-9_.-]{1,60}$/.test(key)) continue;
    if (value === null || value === undefined) {
      clean[key] = null;
      continue;
    }
    if (typeof value === 'boolean' || typeof value === 'number') {
      clean[key] = value;
      continue;
    }
    const trimmed = value.trim();
    clean[key] = trimmed.length > 160 ? trimmed.slice(0, 160) : trimmed;
  }
  return clean;
}

function pushLocalBuffer(event: Record<string, unknown>) {
  try {
    const raw = safeLocalStorageGet(BUFFER_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    const arr = Array.isArray(parsed) ? parsed : [];
    arr.push(event);
    while (arr.length > MAX_BUFFERED_EVENTS) arr.shift();
    safeLocalStorageSet(BUFFER_KEY, JSON.stringify(arr));
  } catch {
    // Ignore storage/parse failures.
  }
}

export function trackFunnelEvent(name: string, props: FunnelProps = {}): void {
  if (typeof window === 'undefined') return;
  if (!ENABLED) return;

  const safeName = (name || '').trim().toLowerCase();
  if (!/^[a-z0-9_:-]{2,80}$/.test(safeName)) return;

  const payload = {
    name: safeName,
    ts: new Date().toISOString(),
    path: `${window.location.pathname}${window.location.search}`,
    sessionId: getSessionId(),
    props: sanitizeProps(props),
  };

  pushLocalBuffer(payload);

  try {
    const body = JSON.stringify(payload);
    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: 'application/json' });
      navigator.sendBeacon('/api/funnel', blob);
      return;
    }
    void fetch('/api/funnel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    });
  } catch {
    // Ignore telemetry failures.
  }
}
