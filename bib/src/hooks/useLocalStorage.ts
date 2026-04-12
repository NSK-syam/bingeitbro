'use client';

import { useState, useEffect, useCallback } from 'react';

const LOCAL_STORAGE_SYNC_EVENT = 'bib-local-storage-sync';

export function useLocalStorage<T>(key: string, initialValue: T): [T, (value: T | ((prev: T) => T)) => void] {
  // State to store our value
  const [storedValue, setStoredValue] = useState<T>(initialValue);
  const [isHydrated, setIsHydrated] = useState(false);

  // Hydrate from localStorage on mount
  useEffect(() => {
    try {
      const item = window.localStorage.getItem(key);
      if (item) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setStoredValue(JSON.parse(item));
      }
    } catch (error) {
      console.warn(`Error reading localStorage key "${key}":`, error);
    }
    setIsHydrated(true);
  }, [key]);

  // Keep multiple hook instances in sync (same tab + other tabs).
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const onStorage = (event: StorageEvent) => {
      if (event.key !== key) return;
      try {
        if (event.newValue == null) {
          setStoredValue(initialValue);
        } else {
          setStoredValue(JSON.parse(event.newValue));
        }
      } catch {
        setStoredValue(initialValue);
      }
    };

    const onLocalSync = (event: Event) => {
      const custom = event as CustomEvent<{ key: string; value: T }>;
      if (!custom.detail || custom.detail.key !== key) return;
      setStoredValue(custom.detail.value);
    };

    window.addEventListener('storage', onStorage);
    window.addEventListener(LOCAL_STORAGE_SYNC_EVENT, onLocalSync as EventListener);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(LOCAL_STORAGE_SYNC_EVENT, onLocalSync as EventListener);
    };
  }, [key, initialValue]);

  // Return a wrapped version of useState's setter function that persists to localStorage
  const setValue = useCallback((value: T | ((prev: T) => T)) => {
    try {
      // Allow value to be a function so we have the same API as useState
      setStoredValue((prev) => {
        const valueToStore = value instanceof Function ? value(prev) : value;
        // Save to localStorage
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(key, JSON.stringify(valueToStore));
          window.dispatchEvent(
            new CustomEvent(LOCAL_STORAGE_SYNC_EVENT, {
              detail: { key, value: valueToStore },
            })
          );
        }
        return valueToStore;
      });
    } catch (error) {
      console.warn(`Error setting localStorage key "${key}":`, error);
    }
  }, [key]);

  // Return initial value until hydrated to avoid hydration mismatch
  return [isHydrated ? storedValue : initialValue, setValue];
}
