import {
  createElement,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';

import {
  addWatchlistItem,
  listWatchlist,
  removeWatchlistItem,
  type CreateWatchlistItemInput,
  type WatchlistItem,
} from '../lib/watchlist';

const { useSession } = require('./useSession') as {
  useSession: () => SessionValue;
};

type SessionValue = {
  loading: boolean;
  session?: {
    access_token?: string | null;
  } | null;
};

type WatchlistItemsResponse = WatchlistItem[] | { items?: WatchlistItem[] };
type WatchlistItemResponse = WatchlistItem | { item?: WatchlistItem };

export type WatchlistState = {
  addItem: (input: CreateWatchlistItemInput) => Promise<void>;
  error: Error | null;
  items: WatchlistItem[];
  loading: boolean;
  pendingIds: string[];
  refresh: () => Promise<void>;
  refreshing: boolean;
  removeItem: (id: string) => Promise<void>;
};

const WatchlistContext = createContext<WatchlistState | undefined>(undefined);

function toError(value: unknown, fallbackMessage: string): Error {
  if (value instanceof Error) {
    return value;
  }

  if (
    typeof value === 'object' &&
    value !== null &&
    'message' in value &&
    typeof value.message === 'string'
  ) {
    return new Error(value.message);
  }

  return new Error(fallbackMessage);
}

function createOptimisticItem(input: CreateWatchlistItemInput): WatchlistItem {
  return {
    addedAt: new Date().toISOString(),
    id: `optimistic-${input.mediaType}-${input.tmdbId}-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`,
    mediaType: input.mediaType,
    posterPath: input.posterPath,
    title: input.title,
    tmdbId: input.tmdbId,
  };
}

function mergeSavedItem(
  current: WatchlistItem[],
  optimisticId: string,
  savedItem: WatchlistItem,
): WatchlistItem[] {
  const replaced = current.map((item) => (item.id === optimisticId ? savedItem : item));
  const deduped: WatchlistItem[] = [];
  let savedInserted = false;

  for (const item of replaced) {
    const sameSavedIdentity =
      item.id === savedItem.id ||
      (item.mediaType === savedItem.mediaType && item.tmdbId === savedItem.tmdbId);

    if (sameSavedIdentity) {
      if (!savedInserted) {
        deduped.push(savedItem);
        savedInserted = true;
      }
      continue;
    }

    if (!deduped.some((existing) => existing.id === item.id)) {
      deduped.push(item);
    }
  }

  if (!savedInserted) {
    deduped.unshift(savedItem);
  }

  return deduped;
}

function normalizeItemsResponse(response: WatchlistItemsResponse): WatchlistItem[] {
  if (Array.isArray(response)) {
    return response;
  }

  if (response && Array.isArray(response.items)) {
    return response.items;
  }

  return [];
}

function normalizeItemResponse(response: WatchlistItemResponse): WatchlistItem {
  if (response && !Array.isArray(response) && 'item' in response && response.item) {
    return response.item;
  }

  return response as WatchlistItem;
}

type RemovalSnapshot = {
  fallbackIndex: number;
  item: WatchlistItem;
  nextId: string | null;
  previousId: string | null;
};

function findRestoreIndex(current: WatchlistItem[], snapshot: RemovalSnapshot): number {
  const previousIndex = snapshot.previousId
    ? current.findIndex((item) => item.id === snapshot.previousId)
    : -1;
  if (previousIndex >= 0) {
    return previousIndex + 1;
  }

  const nextIndex = snapshot.nextId
    ? current.findIndex((item) => item.id === snapshot.nextId)
    : -1;
  if (nextIndex >= 0) {
    return nextIndex;
  }

  return Math.min(snapshot.fallbackIndex, current.length);
}

export function useWatchlistState(): WatchlistState {
  const { loading: sessionLoading, session } = useSession();
  const accessToken = session?.access_token ?? null;
  const [items, setItemsState] = useState<WatchlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [pendingIds, setPendingIds] = useState<string[]>([]);
  const authVersionRef = useRef(0);
  const itemsRef = useRef<WatchlistItem[]>([]);
  const mutationVersionRef = useRef(0);
  const requestSequenceRef = useRef(0);

  const setItems = useCallback(
    (updater: WatchlistItem[] | ((current: WatchlistItem[]) => WatchlistItem[])) => {
      setItemsState((current) => {
        const nextItems =
          typeof updater === 'function'
            ? (updater as (current: WatchlistItem[]) => WatchlistItem[])(current)
            : updater;
        itemsRef.current = nextItems;
        return nextItems;
      });
    },
    [],
  );

  const load = useCallback(
    async (mode: 'initial' | 'refresh', token: string, authVersion: number) => {
      const requestId = requestSequenceRef.current + 1;
      requestSequenceRef.current = requestId;
      const mutationVersion = mutationVersionRef.current;

      if (mode === 'refresh') {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      try {
        const nextItems = normalizeItemsResponse(await listWatchlist(token));

        if (
          requestSequenceRef.current !== requestId ||
          authVersionRef.current !== authVersion ||
          mutationVersionRef.current !== mutationVersion
        ) {
          return;
        }

        setItems(nextItems);
        setError(null);
      } catch (unknownError) {
        if (
          requestSequenceRef.current !== requestId ||
          authVersionRef.current !== authVersion ||
          mutationVersionRef.current !== mutationVersion
        ) {
          return;
        }

        const nextError = toError(unknownError, 'Failed to load watchlist');
        setError(nextError);
        if (mode === 'initial') {
          setItems([]);
        }
      } finally {
        if (requestSequenceRef.current !== requestId || authVersionRef.current !== authVersion) {
          return;
        }

        if (mode === 'refresh') {
          setRefreshing(false);
        } else {
          setLoading(false);
        }
      }
    },
    [setItems],
  );

  useEffect(() => {
    const authVersion = authVersionRef.current + 1;
    authVersionRef.current = authVersion;
    requestSequenceRef.current += 1;

    if (sessionLoading) {
      setLoading(true);
      return;
    }

    if (!accessToken) {
      setItems([]);
      setError(null);
      setLoading(false);
      setRefreshing(false);
      setPendingIds([]);
      return;
    }

    void load('initial', accessToken, authVersion);
  }, [accessToken, load, sessionLoading, setItems]);

  const refresh = useCallback(async () => {
    if (!accessToken) {
      setItems([]);
      setError(null);
      setLoading(false);
      setRefreshing(false);
      setPendingIds([]);
      return;
    }

    await load('refresh', accessToken, authVersionRef.current);
  }, [accessToken, load, setItems]);

  const addItem = useCallback(
    async (input: CreateWatchlistItemInput) => {
      if (!accessToken) {
        const nextError = new Error('You must be signed in to save titles.');
        setError(nextError);
        throw nextError;
      }

      const authVersion = authVersionRef.current;
      mutationVersionRef.current += 1;
      const optimisticItem = createOptimisticItem(input);
      setError(null);
      setPendingIds((current) => [...current, optimisticItem.id]);
      setItems((current) => [optimisticItem, ...current]);

      try {
        const savedItem = normalizeItemResponse(await addWatchlistItem(accessToken, input));
        if (authVersionRef.current !== authVersion) {
          return;
        }

        setItems((current) => mergeSavedItem(current, optimisticItem.id, savedItem));
      } catch (unknownError) {
        if (authVersionRef.current !== authVersion) {
          return;
        }

        const nextError = toError(unknownError, 'Failed to save to watchlist');
        setItems((current) => current.filter((item) => item.id !== optimisticItem.id));
        setError(nextError);
        throw nextError;
      } finally {
        if (authVersionRef.current !== authVersion) {
          return;
        }

        setPendingIds((current) => current.filter((id) => id !== optimisticItem.id));
      }
    },
    [accessToken, setItems],
  );

  const removeItem = useCallback(
    async (id: string) => {
      if (!accessToken) {
        const nextError = new Error('You must be signed in to update the watchlist.');
        setError(nextError);
        throw nextError;
      }

      const authVersion = authVersionRef.current;
      mutationVersionRef.current += 1;
      const currentItems = itemsRef.current;
      const removedIndex = currentItems.findIndex((item) => item.id === id);
      const removalSnapshot =
        removedIndex >= 0
          ? {
              fallbackIndex: removedIndex,
              item: currentItems[removedIndex] as WatchlistItem,
              nextId: currentItems[removedIndex + 1]?.id ?? null,
              previousId: currentItems[removedIndex - 1]?.id ?? null,
            }
          : null;

      setError(null);
      setPendingIds((current) => [...current, id]);
      setItems((current) => current.filter((item) => item.id !== id));

      if (!removalSnapshot) {
        setPendingIds((current) => current.filter((pendingId) => pendingId !== id));
        return;
      }

      try {
        await removeWatchlistItem(accessToken, id);
      } catch (unknownError) {
        if (authVersionRef.current !== authVersion) {
          return;
        }

        const nextError = toError(unknownError, 'Failed to remove from watchlist');
        setItems((current) => {
          if (current.some((item) => item.id === id)) {
            return current;
          }

          const nextItems = current.slice();
          const restoreIndex = findRestoreIndex(current, removalSnapshot);
          nextItems.splice(restoreIndex, 0, removalSnapshot.item);
          return nextItems;
        });
        setError(nextError);
        throw nextError;
      } finally {
        if (authVersionRef.current !== authVersion) {
          return;
        }

        setPendingIds((current) => current.filter((pendingId) => pendingId !== id));
      }
    },
    [accessToken, setItems],
  );

  return useMemo(
    () => ({
      addItem,
      error,
      items,
      loading,
      pendingIds,
      refresh,
      refreshing,
      removeItem,
    }),
    [addItem, error, items, loading, pendingIds, refresh, refreshing, removeItem],
  );
}

export function WatchlistProvider({ children }: PropsWithChildren) {
  const value = useWatchlistState();

  return createElement(WatchlistContext.Provider, { value }, children);
}

export function useWatchlist(): WatchlistState {
  const value = useContext(WatchlistContext);

  if (!value) {
    throw new Error('useWatchlist must be used within a WatchlistProvider');
  }

  return value;
}
