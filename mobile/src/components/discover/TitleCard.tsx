import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import type { TitleSummary } from '../../types';

type TitleCardProps = {
  item: TitleSummary;
  onPress: () => void;
};

export function TitleCard({ item, onPress }: TitleCardProps) {
  return (
    <Pressable
      accessibilityLabel={`Open ${item.kind} ${item.title}`}
      accessibilityRole="button"
      onPress={onPress}
      style={styles.card}
    >
      <View style={styles.posterFrame}>
        {item.posterUrl ? (
          <Image source={{ uri: item.posterUrl }} style={styles.poster} />
        ) : (
          <View style={styles.posterFallback}>
            <Text style={styles.posterFallbackLabel}>No poster</Text>
          </View>
        )}
      </View>

      <View style={styles.body}>
        <View style={styles.row}>
          <View style={styles.badge}>
            <Text style={styles.badgeLabel}>{item.kind === 'movie' ? 'Movie' : 'Show'}</Text>
          </View>
          {item.year ? <Text style={styles.meta}>{item.year}</Text> : null}
          {item.rating ? <Text style={styles.meta}>{item.rating.toFixed(1)}</Text> : null}
        </View>

        <Text numberOfLines={2} style={styles.title}>
          {item.title}
        </Text>

        <Text numberOfLines={2} style={styles.synopsis}>
          {item.synopsis || 'No synopsis available.'}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#1e293b',
    backgroundColor: '#0f172a',
    overflow: 'hidden',
  },
  posterFrame: {
    aspectRatio: 0.72,
    backgroundColor: '#111827',
  },
  poster: {
    height: '100%',
    width: '100%',
  },
  posterFallback: {
    alignItems: 'center',
    height: '100%',
    justifyContent: 'center',
    padding: 16,
  },
  posterFallbackLabel: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '600',
  },
  body: {
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  badge: {
    borderRadius: 999,
    backgroundColor: '#451a03',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  badgeLabel: {
    color: '#fed7aa',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  meta: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '600',
  },
  title: {
    color: '#f8fafc',
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 20,
  },
  synopsis: {
    color: '#cbd5e1',
    fontSize: 12,
    lineHeight: 18,
  },
});
