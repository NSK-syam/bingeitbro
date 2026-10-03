/**
 * Native sign-out cleanup registry (Capacitor app only).
 *
 * Native modules (device reminders/offline caches, push token, widget) register an
 * async cleanup at module load. AuthProvider.signOut awaits runNativeLogoutCleanup()
 * BEFORE revoking the Supabase session and before any caller navigates away, so the
 * cleanup isn't cut short by a full page load and can still use the session (e.g. the
 * push unlink request). Each module must also clean up persisted leftovers on the next
 * startup in case this run was interrupted.
 */

export type NativeLogoutContext = {
  /** The account being signed out (null if unknown). */
  userId: string | null;
  /** That account's access token, still valid while cleanup runs (null if unavailable). */
  accessToken: string | null;
};

export type NativeLogoutCleanup = (ctx: NativeLogoutContext) => Promise<void>;

const cleanups = new Map<string, NativeLogoutCleanup>();

/** Register (or replace) a cleanup under a stable key. Returns an unregister function. */
export function registerNativeLogoutCleanup(key: string, cleanup: NativeLogoutCleanup): () => void {
  cleanups.set(key, cleanup);
  return () => {
    if (cleanups.get(key) === cleanup) cleanups.delete(key);
  };
}

/**
 * Run every registered cleanup in parallel and wait for all of them, bounded by
 * timeoutMs so sign-out can never hang. Never throws.
 */
export async function runNativeLogoutCleanup(ctx: NativeLogoutContext, timeoutMs = 5000): Promise<void> {
  if (cleanups.size === 0) return;
  let timer: ReturnType<typeof setTimeout> | null = null;
  // Promise.resolve().then(...) so a callback that throws synchronously can't escape.
  const all = Promise.allSettled([...cleanups.values()].map((cleanup) => Promise.resolve().then(() => cleanup(ctx))));
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, timeoutMs);
  });
  try {
    await Promise.race([all.then(() => undefined), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
