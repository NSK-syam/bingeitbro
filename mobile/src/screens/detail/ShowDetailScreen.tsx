import React, { useMemo } from 'react';
import { Pressable, RefreshControl, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { ErrorState } from '../../components/common/ErrorState';
import { LoadingState } from '../../components/common/LoadingState';
import { DetailHero } from '../../components/detail/DetailHero';
import { ProviderList } from '../../components/detail/ProviderList';
import { useTitleDetail } from '../../hooks/useTitleDetail';
import { useWatchlist } from '../../hooks/useWatchlist';
import type { DiscoverStackParamList } from '../../navigation/types';

export function ShowDetailScreen({
  route,
}: NativeStackScreenProps<DiscoverStackParamList, 'ShowDetail'>) {
  const { title, loading, error, refresh, providers } = useTitleDetail('tv', route.params.tmdbId);
  const watchlist = useWatchlist();
  const savedItem = useMemo(
    () =>
      watchlist.items.find(
        (item) => item.mediaType === 'tv' && item.tmdbId === route.params.tmdbId,
      ) ?? null,
    [route.params.tmdbId, watchlist.items],
  );
  const pendingWatchlistId = savedItem?.id ?? null;
  const watchlistBusy = watchlist.loading || watchlist.pendingIds.includes(pendingWatchlistId ?? '');

  const handleWatchlistPress = async () => {
    if (!title || watchlistBusy) {
      return;
    }

    if (savedItem) {
      await watchlist.removeItem(savedItem.id);
      return;
    }

    await watchlist.addItem({
      mediaType: 'tv',
      posterPath: title.posterPath,
      title: title.title,
      tmdbId: title.tmdbId,
    });
  };

  if (loading && !title) {
    return <LoadingState label="Loading show details..." />;
  }

  if (error && !title) {
    return (
      <ErrorState
        message={error.message}
        onRetry={refresh}
        retryLabel="Retry show"
        title="Could not load show details"
      />
    );
  }

  if (!title) {
    return (
      <ErrorState
        message="Show details are unavailable right now."
        onRetry={refresh}
        retryLabel="Try again"
        title="Could not load show details"
      />
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl colors={['#f97316']} onRefresh={refresh} refreshing={loading} tintColor="#f97316" />}
        showsVerticalScrollIndicator={false}
      >
        <DetailHero
          backdropUrl={title.backdropUrl ?? title.posterUrl}
          kindLabel="Show"
          language={title.language}
          rating={title.rating}
          title={title.title}
          year={title.year}
        />

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Synopsis</Text>
          <Text style={styles.synopsis}>{title.synopsis || 'No synopsis available.'}</Text>
        </View>

        <ProviderList providers={providers} />

        {watchlist.error ? (
          <View style={styles.inlineError}>
            <Text style={styles.inlineErrorTitle}>Watchlist update failed</Text>
            <Text style={styles.inlineErrorBody}>{watchlist.error.message}</Text>
          </View>
        ) : null}

        <View style={styles.watchlistCard}>
          <View style={styles.watchlistCopy}>
            <Text style={styles.watchlistTitle}>Save this show</Text>
            <Text style={styles.watchlistBody}>
              Add the title to your watchlist so it is ready in the Watchlist tab.
            </Text>
          </View>
          <Pressable
            accessibilityLabel={savedItem ? 'Remove show from watchlist' : 'Add show to watchlist'}
            accessibilityRole="button"
            disabled={watchlistBusy}
            onPress={() => {
              void handleWatchlistPress();
            }}
            style={[
              styles.watchlistButton,
              savedItem ? styles.watchlistButtonActive : null,
              watchlistBusy ? styles.watchlistButtonDisabled : null,
            ]}
          >
            <Text
              style={[
                styles.watchlistButtonLabel,
                savedItem ? styles.watchlistButtonLabelActive : null,
                watchlistBusy ? styles.watchlistButtonLabelDisabled : null,
              ]}
            >
              {watchlistBusy
                ? savedItem
                  ? 'Removing...'
                  : 'Saving...'
                : savedItem
                  ? 'Saved to watchlist'
                  : 'Add to watchlist'}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#020617',
  },
  content: {
    gap: 20,
    padding: 16,
    paddingBottom: 28,
  },
  section: {
    gap: 10,
  },
  sectionTitle: {
    color: '#f8fafc',
    fontSize: 20,
    fontWeight: '800',
  },
  synopsis: {
    color: '#cbd5e1',
    fontSize: 15,
    lineHeight: 22,
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
  watchlistCard: {
    gap: 12,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#1e293b',
    backgroundColor: '#0f172a',
    padding: 16,
  },
  watchlistCopy: {
    gap: 6,
  },
  watchlistTitle: {
    color: '#f8fafc',
    fontSize: 18,
    fontWeight: '800',
  },
  watchlistBody: {
    color: '#94a3b8',
    fontSize: 13,
    lineHeight: 18,
  },
  watchlistButton: {
    alignItems: 'center',
    borderRadius: 16,
    backgroundColor: '#f97316',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  watchlistButtonActive: {
    backgroundColor: '#1e293b',
  },
  watchlistButtonDisabled: {
    opacity: 0.75,
  },
  watchlistButtonLabel: {
    color: '#020617',
    fontSize: 14,
    fontWeight: '800',
  },
  watchlistButtonLabelActive: {
    color: '#f8fafc',
  },
  watchlistButtonLabelDisabled: {
    color: '#e2e8f0',
  },
});
