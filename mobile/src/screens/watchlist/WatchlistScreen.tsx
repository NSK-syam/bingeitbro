import React from 'react';
import { FlatList, Image, Pressable, RefreshControl, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';

import { EmptyState } from '../../components/common/EmptyState';
import { ErrorState } from '../../components/common/ErrorState';
import { LoadingState } from '../../components/common/LoadingState';
import { useWatchlist } from '../../hooks/useWatchlist';
import type { WatchlistItem } from '../../lib/watchlist';
import type { MainTabParamList } from '../../navigation/types';

const TMDB_POSTER_BASE = 'https://image.tmdb.org/t/p/w342';

function getPosterUrl(posterPath: string | null): string | null {
  return posterPath ? `${TMDB_POSTER_BASE}${posterPath}` : null;
}

function getDetailRoute(item: WatchlistItem) {
  return item.mediaType === 'movie' ? 'MovieDetail' : 'ShowDetail';
}

function getAccessibilityLabel(item: WatchlistItem) {
  return `Open ${item.mediaType} ${item.title}`;
}

export function WatchlistScreen({
  navigation,
}: BottomTabScreenProps<MainTabParamList, 'Watchlist'>) {
  const watchlist = useWatchlist();
  const hasItems = watchlist.items.length > 0;
  const blockingError = watchlist.error && !hasItems;
  const inlineError = watchlist.error && hasItems;

  const goToDiscover = () => {
    navigation.navigate('DiscoverTab', { screen: 'Discover' });
  };

  const openDetail = (item: WatchlistItem) => {
    navigation.navigate('DiscoverTab', {
      params: { tmdbId: item.tmdbId },
      screen: getDetailRoute(item),
    });
  };

  if (watchlist.loading && !hasItems) {
    return <LoadingState label="Loading watchlist..." />;
  }

  if (blockingError) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.screen}>
          <ErrorState
            message={watchlist.error?.message ?? 'Failed to load the watchlist'}
            onRetry={watchlist.refresh}
            retryLabel="Retry watchlist"
            title="Could not load saved titles"
          />
        </View>
      </SafeAreaView>
    );
  }

  if (!hasItems) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.screen}>
          <View style={styles.header}>
            <Text style={styles.eyebrow}>Binge It Bro</Text>
            <Text style={styles.title}>Watchlist</Text>
            <Text style={styles.subtitle}>
              Save movies and shows here to keep a short list of what to watch next.
            </Text>
          </View>

          <EmptyState
            actionLabel="Back to Discover"
            description="Nothing is saved yet. Head back to Discover to pick a movie or show for later."
            onActionPress={goToDiscover}
            title="Your watchlist is empty"
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.screen}>
        <View style={styles.header}>
          <Text style={styles.eyebrow}>Binge It Bro</Text>
          <Text style={styles.title}>Watchlist</Text>
          <Text style={styles.subtitle}>
            Saved titles stay one tap away so you can jump straight back into the detail flow.
          </Text>
        </View>

        <View style={styles.toolbar}>
          <Text style={styles.countLabel}>
            {watchlist.items.length} saved {watchlist.items.length === 1 ? 'title' : 'titles'}
          </Text>
          <Pressable
            accessibilityLabel="Back to Discover"
            accessibilityRole="button"
            onPress={goToDiscover}
            style={styles.discoverButton}
          >
            <Text style={styles.discoverButtonLabel}>Discover</Text>
          </Pressable>
        </View>

        {inlineError ? (
          <View style={styles.inlineError}>
            <Text style={styles.inlineErrorTitle}>Watchlist update failed</Text>
            <Text style={styles.inlineErrorBody}>
              {watchlist.error?.message ?? 'Your saved list is still available.'}
            </Text>
          </View>
        ) : null}

        <FlatList
          contentContainerStyle={styles.listContent}
          data={watchlist.items}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl
              colors={['#f97316']}
              onRefresh={watchlist.refresh}
              progressBackgroundColor="#020617"
              refreshing={watchlist.refreshing}
              tintColor="#f97316"
            />
          }
          renderItem={({ item }) => {
            const posterUrl = getPosterUrl(item.posterPath);
            const removing = watchlist.pendingIds.includes(item.id);

            return (
              <View style={styles.card}>
                <Pressable
                  accessibilityLabel={getAccessibilityLabel(item)}
                  accessibilityRole="button"
                  onPress={() => openDetail(item)}
                  style={styles.cardContent}
                >
                  {posterUrl ? (
                    <Image source={{ uri: posterUrl }} style={styles.poster} />
                  ) : (
                    <View style={[styles.poster, styles.posterFallback]}>
                      <Text style={styles.posterFallbackLabel}>{item.mediaType === 'movie' ? 'MOVIE' : 'SHOW'}</Text>
                    </View>
                  )}

                  <View style={styles.cardBody}>
                    <Text style={styles.badge}>{item.mediaType === 'movie' ? 'Movie' : 'Show'}</Text>
                    <Text numberOfLines={2} style={styles.cardTitle}>
                      {item.title}
                    </Text>
                    <Text style={styles.cardMeta}>Saved {new Date(item.addedAt).toLocaleDateString()}</Text>
                  </View>
                </Pressable>

                <Pressable
                  accessibilityLabel={`Remove ${item.title} from watchlist`}
                  accessibilityRole="button"
                  disabled={removing}
                  onPress={() => {
                    void watchlist.removeItem(item.id);
                  }}
                  style={[styles.removeButton, removing ? styles.removeButtonDisabled : null]}
                >
                  <Text style={[styles.removeButtonLabel, removing ? styles.removeButtonLabelDisabled : null]}>
                    {removing ? 'Removing...' : 'Remove'}
                  </Text>
                </Pressable>
              </View>
            );
          }}
          showsVerticalScrollIndicator={false}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#020617',
  },
  screen: {
    flex: 1,
    gap: 16,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  header: {
    gap: 8,
  },
  eyebrow: {
    color: '#f97316',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.6,
    textTransform: 'uppercase',
  },
  title: {
    color: '#f8fafc',
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  subtitle: {
    color: '#94a3b8',
    fontSize: 15,
    lineHeight: 22,
  },
  toolbar: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  countLabel: {
    color: '#cbd5e1',
    fontSize: 14,
    fontWeight: '700',
  },
  discoverButton: {
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#334155',
    backgroundColor: '#0f172a',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  discoverButtonLabel: {
    color: '#f8fafc',
    fontSize: 13,
    fontWeight: '700',
  },
  inlineError: {
    gap: 4,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#7f1d1d',
    backgroundColor: '#450a0a',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  inlineErrorTitle: {
    color: '#fee2e2',
    fontSize: 14,
    fontWeight: '700',
  },
  inlineErrorBody: {
    color: '#fecaca',
    fontSize: 13,
    lineHeight: 18,
  },
  listContent: {
    gap: 12,
    paddingBottom: 24,
  },
  card: {
    gap: 12,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#1e293b',
    backgroundColor: '#0f172a',
    padding: 14,
  },
  cardContent: {
    flexDirection: 'row',
    gap: 14,
  },
  poster: {
    width: 72,
    height: 104,
    borderRadius: 16,
    backgroundColor: '#1e293b',
  },
  posterFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  posterFallbackLabel: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },
  cardBody: {
    flex: 1,
    gap: 6,
    justifyContent: 'center',
  },
  badge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    overflow: 'hidden',
    color: '#fdba74',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  cardTitle: {
    color: '#f8fafc',
    fontSize: 18,
    fontWeight: '800',
    lineHeight: 24,
  },
  cardMeta: {
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: '600',
  },
  removeButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#7f1d1d',
    backgroundColor: '#450a0a',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  removeButtonDisabled: {
    borderColor: '#334155',
    backgroundColor: '#1e293b',
  },
  removeButtonLabel: {
    color: '#fee2e2',
    fontSize: 13,
    fontWeight: '700',
  },
  removeButtonLabelDisabled: {
    color: '#cbd5e1',
  },
});
