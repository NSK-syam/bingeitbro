import React, { useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { EmptyState } from '../../components/common/EmptyState';
import { ErrorState } from '../../components/common/ErrorState';
import { LoadingState } from '../../components/common/LoadingState';
import { CountryToggle } from '../../components/discover/CountryToggle';
import { FilterSheet } from '../../components/discover/FilterSheet';
import { TitleCard } from '../../components/discover/TitleCard';
import { useDiscoverFeed } from '../../hooks/useDiscoverFeed';
import type { DiscoverFilters } from '../../types';
import type { DiscoverStackParamList } from '../../navigation/types';

const SEGMENTS = [
  { label: 'Movies', value: 'movie' as const },
  { label: 'Shows', value: 'tv' as const },
];

const DEFAULT_FILTERS: DiscoverFilters = {};

function getSortLabel(sortBy: DiscoverFilters['sortBy']) {
  if (sortBy === 'rating') {
    return 'Top rated';
  }

  if (sortBy === 'release_date') {
    return 'Latest';
  }

  return 'Popular';
}

function countActiveFilters(filters: DiscoverFilters) {
  return [filters.genreId, filters.language, filters.providerId, filters.sortBy, filters.year].filter(Boolean)
    .length;
}

export function DiscoverScreen({
  navigation,
}: NativeStackScreenProps<DiscoverStackParamList, 'Discover'>) {
  const [contentType, setContentType] = useState<'movie' | 'tv'>('movie');
  const [country, setCountry] = useState<'IN' | 'US'>('IN');
  const [filters, setFilters] = useState<DiscoverFilters>(DEFAULT_FILTERS);
  const [filtersVisible, setFiltersVisible] = useState(false);
  const [settledQueryKey, setSettledQueryKey] = useState<string | null>(null);

  const queryKey = useMemo(
    () => JSON.stringify({ contentType, country, filters }),
    [contentType, country, filters],
  );
  const feed = useDiscoverFeed(country, contentType, filters);

  const hasItems = feed.items.length > 0;
  const inlineError = feed.error && hasItems;
  const blockingError = feed.error && !hasItems;
  const queryTransition = settledQueryKey !== queryKey;
  const initialLoading = queryTransition;
  const emptyState = !feed.loading && !hasItems && !feed.error;
  const contentLabel = contentType === 'movie' ? 'movies' : 'shows';
  const sortLabel = useMemo(() => getSortLabel(filters.sortBy), [filters.sortBy]);
  const activeFilterCount = useMemo(() => countActiveFilters(filters), [filters]);

  useEffect(() => {
    if (!feed.loading && !feed.refreshing) {
      setSettledQueryKey(queryKey);
    }
  }, [feed.loading, feed.refreshing, queryKey]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.screen}>
        <View style={styles.header}>
          <Text style={styles.eyebrow}>Binge It Bro</Text>
          <Text style={styles.title}>Discover</Text>
          <Text style={styles.subtitle}>
            Browse movies and shows with region filters and reliable refreshes.
          </Text>
        </View>

        <View style={styles.topRow}>
          <View style={styles.segments}>
            {SEGMENTS.map((segment) => {
              const selected = segment.value === contentType;

              return (
                <Pressable
                  accessibilityLabel={`${segment.label} segment`}
                  accessibilityRole="button"
                  key={segment.value}
                  onPress={() => setContentType(segment.value)}
                  style={[styles.segment, selected ? styles.segmentSelected : null]}
                >
                  <Text style={[styles.segmentLabel, selected ? styles.segmentLabelSelected : null]}>
                    {segment.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <CountryToggle onChange={setCountry} value={country} />
        </View>

        <View style={styles.toolbar}>
          <Pressable
            accessibilityLabel="Open filters"
            accessibilityRole="button"
            onPress={() => setFiltersVisible(true)}
            style={styles.filterButton}
          >
            <Text style={styles.filterButtonLabel}>Filters</Text>
            <Text style={styles.filterButtonValue}>
              {activeFilterCount > 0 ? `${activeFilterCount} active · ${sortLabel}` : sortLabel}
            </Text>
          </Pressable>

          <Text style={styles.countLabel}>
            {hasItems ? `${feed.items.length} ${contentLabel}` : 'Ready to browse'}
          </Text>
        </View>

        {initialLoading ? (
          <LoadingState label={`Loading ${contentLabel}...`} />
        ) : blockingError ? (
          <ErrorState
            message={feed.error?.message ?? 'Failed to load discover feed'}
            onRetry={feed.refresh}
            retryLabel="Try again"
            title="Could not load titles"
          />
        ) : emptyState ? (
          <EmptyState
            actionLabel="Retry"
            description="No titles matched the current feed. Try another region, switch movie/show, or reset filters."
            onActionPress={feed.refresh}
            title="Nothing to show"
          />
        ) : (
          <View style={styles.listWrap}>
            {inlineError ? (
              <View style={styles.inlineError}>
                <Text style={styles.inlineErrorTitle}>Refresh failed</Text>
                <Text style={styles.inlineErrorBody}>
                  {feed.error?.message ?? 'The current list is still available.'}
                </Text>
                <Pressable accessibilityRole="button" onPress={feed.refresh} style={styles.inlineRetry}>
                  <Text style={styles.inlineRetryLabel}>Retry</Text>
                </Pressable>
              </View>
            ) : null}

            <FlatList
              contentContainerStyle={styles.listContent}
              data={feed.items}
              keyExtractor={(item) => `${item.kind}-${item.tmdbId}`}
              numColumns={2}
              refreshControl={
                <RefreshControl
                  colors={['#f97316']}
                  onRefresh={feed.refresh}
                  progressBackgroundColor="#020617"
                  refreshing={feed.refreshing}
                  tintColor="#f97316"
                />
              }
              renderItem={({ item }) => (
                <View style={styles.cardCell}>
                  <TitleCard
                    item={item}
                    onPress={() =>
                      navigation.navigate(item.kind === 'movie' ? 'MovieDetail' : 'ShowDetail', {
                        tmdbId: item.tmdbId,
                      })
                    }
                  />
                </View>
              )}
              showsVerticalScrollIndicator={false}
            />
          </View>
        )}
      </View>

      <FilterSheet
        country={country}
        filters={filters}
        onApply={setFilters}
        onClose={() => setFiltersVisible(false)}
        visible={filtersVisible}
      />
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
  topRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  segments: {
    flex: 1,
    flexDirection: 'row',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#1e293b',
    backgroundColor: '#0f172a',
    padding: 4,
  },
  segment: {
    alignItems: 'center',
    borderRadius: 14,
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  segmentSelected: {
    backgroundColor: '#f97316',
  },
  segmentLabel: {
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: '800',
  },
  segmentLabelSelected: {
    color: '#020617',
  },
  toolbar: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  filterButton: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1e293b',
    backgroundColor: '#0f172a',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  filterButtonLabel: {
    color: '#cbd5e1',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  filterButtonValue: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '700',
    marginTop: 3,
  },
  countLabel: {
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: '600',
  },
  listWrap: {
    flex: 1,
  },
  inlineError: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#7f1d1d',
    backgroundColor: '#450a0a',
    gap: 8,
    marginBottom: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  inlineErrorTitle: {
    color: '#fee2e2',
    fontSize: 15,
    fontWeight: '800',
  },
  inlineErrorBody: {
    color: '#fecaca',
    fontSize: 13,
    lineHeight: 19,
  },
  inlineRetry: {
    alignSelf: 'flex-start',
    borderRadius: 12,
    backgroundColor: '#f97316',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  inlineRetryLabel: {
    color: '#020617',
    fontSize: 13,
    fontWeight: '700',
  },
  listContent: {
    paddingBottom: 24,
    gap: 12,
  },
  cardCell: {
    flex: 1,
  },
});
