import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

type DetailHeroProps = {
  backdropUrl: string | null;
  kindLabel: string;
  language: string;
  rating: number | null;
  title: string;
  year: number | null;
};

function formatRating(rating: number | null) {
  return rating === null ? 'Unrated' : rating.toFixed(1);
}

export function DetailHero({
  backdropUrl,
  kindLabel,
  language,
  rating,
  title,
  year,
}: DetailHeroProps) {
  return (
    <View style={styles.container}>
      <View style={styles.media}>
        {backdropUrl ? (
          <Image accessibilityLabel={`${title} hero image`} source={{ uri: backdropUrl }} style={styles.image} />
        ) : (
          <View style={styles.fallback}>
            <Text style={styles.fallbackLabel}>No hero image</Text>
          </View>
        )}
        <View style={styles.overlay} />
      </View>

      <View style={styles.body}>
        <Text style={styles.eyebrow}>{kindLabel}</Text>
        <Text style={styles.title}>{title}</Text>
        <View style={styles.metaRow}>
          <View style={styles.metaPill}>
            <Text style={styles.metaLabel}>{year === null ? 'Unknown year' : String(year)}</Text>
          </View>
          <View style={styles.metaPill}>
            <Text style={styles.metaLabel}>{language}</Text>
          </View>
          <View style={styles.metaPill}>
            <Text style={styles.metaLabel}>{formatRating(rating)}</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 28,
    overflow: 'hidden',
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  media: {
    height: 260,
    backgroundColor: '#111827',
  },
  image: {
    height: '100%',
    width: '100%',
  },
  fallback: {
    alignItems: 'center',
    height: '100%',
    justifyContent: 'center',
    padding: 20,
  },
  fallbackLabel: {
    color: '#94a3b8',
    fontSize: 14,
    fontWeight: '600',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(2, 6, 23, 0.55)',
  },
  body: {
    gap: 10,
    paddingHorizontal: 18,
    paddingVertical: 18,
  },
  eyebrow: {
    color: '#fb923c',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  title: {
    color: '#f8fafc',
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: -0.6,
    lineHeight: 34,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  metaPill: {
    borderRadius: 999,
    backgroundColor: 'rgba(15, 23, 42, 0.92)',
    borderWidth: 1,
    borderColor: '#334155',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  metaLabel: {
    color: '#e2e8f0',
    fontSize: 12,
    fontWeight: '700',
  },
});
