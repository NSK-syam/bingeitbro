import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { DiscoverCountry } from '../../types';

type CountryToggleProps = {
  onChange: (country: DiscoverCountry) => void;
  value: DiscoverCountry;
};

const OPTIONS: Array<{ label: string; value: DiscoverCountry }> = [
  { label: 'India', value: 'IN' },
  { label: 'USA', value: 'US' },
];

export function CountryToggle({ onChange, value }: CountryToggleProps) {
  return (
    <View accessibilityLabel="Country toggle" style={styles.container}>
      {OPTIONS.map((option) => {
        const selected = option.value === value;

        return (
          <Pressable
            accessibilityLabel={`Switch to ${option.label}`}
            accessibilityRole="button"
            key={option.value}
            onPress={() => onChange(option.value)}
            style={[styles.option, selected ? styles.optionSelected : null]}
          >
            <Text style={[styles.label, selected ? styles.labelSelected : null]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#1e293b',
    backgroundColor: '#0f172a',
    padding: 4,
  },
  option: {
    alignItems: 'center',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  optionSelected: {
    backgroundColor: '#f97316',
  },
  label: {
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: '700',
  },
  labelSelected: {
    color: '#020617',
  },
});
