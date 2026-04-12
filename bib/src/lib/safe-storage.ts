export function safeLocalStorageGet(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function safeLocalStorageSet(key: string, value: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Ignore storage failures (privacy mode, quota, blocked storage).
  }
}

export function safeLocalStorageRemove(key: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Ignore storage failures.
  }
}

export function safeLocalStorageKeys(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    return Object.keys(window.localStorage);
  } catch {
    return [];
  }
}

export function safeSessionStorageKeys(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    return Object.keys(window.sessionStorage);
  } catch {
    return [];
  }
}

export function safeSessionStorageRemove(key: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // Ignore storage failures.
  }
}
