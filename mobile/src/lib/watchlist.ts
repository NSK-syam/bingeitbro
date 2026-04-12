import { httpRequest } from './http';

export type WatchlistMediaType = 'movie' | 'tv';

export type WatchlistItem = {
  addedAt: string;
  id: string;
  mediaType: WatchlistMediaType;
  posterPath: string | null;
  title: string;
  tmdbId: number;
};

export type CreateWatchlistItemInput = {
  mediaType: WatchlistMediaType;
  posterPath: string | null;
  title: string;
  tmdbId: number;
};

type ListWatchlistResponse = WatchlistItem[] | { items?: WatchlistItem[] };
type AddWatchlistItemResponse = WatchlistItem | { item?: WatchlistItem };

function unwrapWatchlistItems(response: ListWatchlistResponse): WatchlistItem[] {
  if (Array.isArray(response)) {
    return response;
  }

  if (response && Array.isArray(response.items)) {
    return response.items;
  }

  return [];
}

function unwrapWatchlistItem(response: AddWatchlistItemResponse): WatchlistItem {
  if (response && !Array.isArray(response) && 'item' in response && response.item) {
    return response.item;
  }

  return response as WatchlistItem;
}

export async function listWatchlist(accessToken: string): Promise<WatchlistItem[]> {
  const response = await httpRequest<ListWatchlistResponse>('/api/watchlist', {
    accessToken,
  });
  return unwrapWatchlistItems(response);
}

export async function addWatchlistItem(
  accessToken: string,
  input: CreateWatchlistItemInput,
): Promise<WatchlistItem> {
  const response = await httpRequest<AddWatchlistItemResponse>('/api/watchlist', {
    accessToken,
    body: input,
    method: 'POST',
  });
  return unwrapWatchlistItem(response);
}

export async function removeWatchlistItem(accessToken: string, id: string): Promise<void> {
  await httpRequest<{ ok?: boolean } | void>(`/api/watchlist/${encodeURIComponent(id)}`, {
    accessToken,
    method: 'DELETE',
  });
}
