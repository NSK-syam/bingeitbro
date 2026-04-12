import React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { DiscoverFilters, DiscoverSort } from '../../types';

type FilterSheetProps = {
  country: 'IN' | 'US';
  filters: DiscoverFilters;
  onApply: (filters: DiscoverFilters) => void;
  onClose: () => void;
  visible: boolean;
};

const SORT_OPTIONS: Array<{ label: string; value: DiscoverSort | null }> = [
  { label: 'Popular', value: 'popularity' },
  { label: 'Top rated', value: 'rating' },
  { label: 'Latest releases', value: 'release_date' },
];

const LANGUAGE_OPTIONS = [
  { label: 'English', value: 'en' },
  { label: 'Hindi', value: 'hi' },
  { label: 'Telugu', value: 'te' },
  { label: 'Tamil', value: 'ta' },
  { label: 'Malayalam', value: 'ml' },
  { label: 'Kannada', value: 'kn' },
  { label: 'Bengali', value: 'bn' },
  { label: 'Marathi', value: 'mr' },
  { label: 'Korean', value: 'ko' },
  { label: 'Japanese', value: 'ja' },
  { label: 'Spanish', value: 'es' },
  { label: 'French', value: 'fr' },
] as const;

const GENRE_OPTIONS = [
  { label: 'Action', value: 28 },
  { label: 'Adventure', value: 12 },
  { label: 'Animation', value: 16 },
  { label: 'Comedy', value: 35 },
  { label: 'Crime', value: 80 },
  { label: 'Documentary', value: 99 },
  { label: 'Drama', value: 18 },
  { label: 'Family', value: 10751 },
  { label: 'Fantasy', value: 14 },
  { label: 'History', value: 36 },
  { label: 'Horror', value: 27 },
  { label: 'Music', value: 10402 },
  { label: 'Mystery', value: 9648 },
  { label: 'Romance', value: 10749 },
  { label: 'Sci-Fi', value: 878 },
  { label: 'Thriller', value: 53 },
] as const;

const PROVIDER_OPTIONS = {
  IN: [
    { label: 'Netflix', value: 8 },
    { label: 'Prime Video', value: 119 },
    { label: 'Apple TV+', value: 350 },
    { label: 'JioHotstar', value: 2336 },
    { label: 'SonyLiv', value: 237 },
    { label: 'Zee5', value: 232 },
    { label: 'Aha', value: 532 },
    { label: 'YouTube', value: 192 },
  ],
  US: [
    { label: 'Netflix', value: 8 },
    { label: 'Prime Video', value: 9 },
    { label: 'Apple TV+', value: 350 },
    { label: 'Disney+', value: 337 },
    { label: 'Hulu', value: 15 },
    { label: 'Peacock', value: 386 },
    { label: 'Paramount+', value: 531 },
    { label: 'YouTube', value: 192 },
  ],
} as const;

function buildYearOptions() {
  const currentYear = new Date().getFullYear();
  return Array.from({ length: 16 }, (_, index) => currentYear - index);
}

type ChipOption<T> = {
  label: string;
  value: T;
};

function ChipGroup<T extends string | number>({
  options,
  selectedValue,
  onSelect,
}: {
  onSelect: (value: T | null) => void;
  options: readonly ChipOption<T>[];
  selectedValue: T | null | undefined;
}) {
  return (
    <View style={styles.chipGroup}>
      <Pressable
        accessibilityRole="button"
        onPress={() => onSelect(null)}
        style={[styles.chip, selectedValue == null ? styles.chipSelected : null]}
      >
        <Text style={[styles.chipLabel, selectedValue == null ? styles.chipLabelSelected : null]}>
          Any
        </Text>
      </Pressable>
      {options.map((option) => {
        const selected = option.value === selectedValue;
        return (
          <Pressable
            accessibilityRole="button"
            key={`${option.label}-${String(option.value)}`}
            onPress={() => onSelect(option.value)}
            style={[styles.chip, selected ? styles.chipSelected : null]}
          >
            <Text style={[styles.chipLabel, selected ? styles.chipLabelSelected : null]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function FilterSheet({ country, filters, onApply, onClose, visible }: FilterSheetProps) {
  const [draftSortBy, setDraftSortBy] = useState<DiscoverSort | null>(filters.sortBy ?? null);
  const [draftLanguage, setDraftLanguage] = useState<string | null>(filters.language ?? null);
  const [draftGenreId, setDraftGenreId] = useState<number | null>(filters.genreId ?? null);
  const [draftProviderId, setDraftProviderId] = useState<number | null>(filters.providerId ?? null);
  const [draftYear, setDraftYear] = useState<number | null>(filters.year ?? null);

  useEffect(() => {
    if (visible) {
      setDraftSortBy(filters.sortBy ?? null);
      setDraftLanguage(filters.language ?? null);
      setDraftGenreId(filters.genreId ?? null);
      setDraftProviderId(filters.providerId ?? null);
      setDraftYear(filters.year ?? null);
    }
  }, [filters.genreId, filters.language, filters.providerId, filters.sortBy, filters.year, visible]);

  const selectedLabel = useMemo(() => {
    return SORT_OPTIONS.find((option) => option.value === (draftSortBy ?? null))?.label ?? 'Popular';
  }, [draftSortBy]);
  const yearOptions = useMemo(() => buildYearOptions(), []);
  const providerOptions = PROVIDER_OPTIONS[country];

  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={visible}>
      <View style={styles.overlay}>
        <Pressable accessibilityLabel="Close discover filters" onPress={onClose} style={styles.backdrop} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.title}>Filters</Text>
          <Text style={styles.subtitle}>Refine the discover feed by sort, language, year, OTT platform, and genre.</Text>

          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Sort by</Text>
              {SORT_OPTIONS.map((option) => {
                const selected = option.value === (draftSortBy ?? null);

                return (
                  <Pressable
                    accessibilityRole="button"
                    key={option.label}
                    onPress={() => setDraftSortBy(option.value)}
                    style={[styles.option, selected ? styles.optionSelected : null]}
                  >
                    <Text style={[styles.optionLabel, selected ? styles.optionLabelSelected : null]}>
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Language</Text>
              <ChipGroup
                onSelect={setDraftLanguage}
                options={LANGUAGE_OPTIONS}
                selectedValue={draftLanguage}
              />
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Year</Text>
              <ChipGroup
                onSelect={setDraftYear}
                options={yearOptions.map((year) => ({ label: String(year), value: year }))}
                selectedValue={draftYear}
              />
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionLabel}>OTT platform</Text>
              <ChipGroup
                onSelect={setDraftProviderId}
                options={providerOptions}
                selectedValue={draftProviderId}
              />
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Genre</Text>
              <ChipGroup
                onSelect={setDraftGenreId}
                options={GENRE_OPTIONS}
                selectedValue={draftGenreId}
              />
            </View>
          </ScrollView>

          <View style={styles.footer}>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                onApply({
                  genreId: draftGenreId,
                  language: draftLanguage,
                  providerId: draftProviderId,
                  sortBy: draftSortBy,
                  year: draftYear,
                });
                onClose();
              }}
              style={styles.primaryButton}
            >
              <Text style={styles.primaryButtonLabel}>Apply</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setDraftSortBy(null);
                setDraftLanguage(null);
                setDraftGenreId(null);
                setDraftProviderId(null);
                setDraftYear(null);
              }}
              style={styles.secondaryButton}
            >
              <Text style={styles.secondaryButtonLabel}>Reset</Text>
            </Pressable>
          </View>

          <Text style={styles.selectionLabel}>Current sort: {selectedLabel}</Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(2, 6, 23, 0.68)',
  },
  sheet: {
    maxHeight: '88%',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: '#0f172a',
    borderTopWidth: 1,
    borderColor: '#1e293b',
    paddingHorizontal: 20,
    paddingBottom: 28,
    paddingTop: 12,
  },
  handle: {
    alignSelf: 'center',
    width: 48,
    height: 4,
    borderRadius: 999,
    backgroundColor: '#334155',
    marginBottom: 16,
  },
  title: {
    color: '#f8fafc',
    fontSize: 20,
    fontWeight: '700',
  },
  subtitle: {
    color: '#94a3b8',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 6,
  },
  scrollContent: {
    paddingBottom: 8,
  },
  section: {
    gap: 10,
    marginTop: 22,
  },
  sectionLabel: {
    color: '#cbd5e1',
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.1,
  },
  option: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1e293b',
    backgroundColor: '#111827',
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  optionSelected: {
    borderColor: '#f97316',
    backgroundColor: '#451a03',
  },
  optionLabel: {
    color: '#cbd5e1',
    fontSize: 15,
    fontWeight: '600',
  },
  optionLabelSelected: {
    color: '#fed7aa',
  },
  chipGroup: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#334155',
    backgroundColor: '#111827',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  chipSelected: {
    borderColor: '#f97316',
    backgroundColor: '#451a03',
  },
  chipLabel: {
    color: '#cbd5e1',
    fontSize: 13,
    fontWeight: '700',
  },
  chipLabelSelected: {
    color: '#fed7aa',
  },
  footer: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 22,
  },
  primaryButton: {
    flex: 1,
    alignItems: 'center',
    borderRadius: 14,
    backgroundColor: '#f97316',
    paddingVertical: 13,
  },
  primaryButtonLabel: {
    color: '#020617',
    fontSize: 14,
    fontWeight: '700',
  },
  secondaryButton: {
    flex: 1,
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#334155',
    backgroundColor: '#111827',
    paddingVertical: 13,
  },
  secondaryButtonLabel: {
    color: '#e2e8f0',
    fontSize: 14,
    fontWeight: '700',
  },
  selectionLabel: {
    color: '#94a3b8',
    fontSize: 13,
    marginTop: 14,
  },
});
