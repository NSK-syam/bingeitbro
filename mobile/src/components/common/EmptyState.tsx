import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

type EmptyStateProps = {
  actionLabel?: string;
  description: string;
  onActionPress?: () => void;
  title: string;
};

export function EmptyState({
  actionLabel,
  description,
  onActionPress,
  title,
}: EmptyStateProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>{description}</Text>
      {onActionPress && actionLabel ? (
        <Pressable
          accessibilityLabel={actionLabel}
          accessibilityRole="button"
          onPress={onActionPress}
          style={styles.button}
        >
          <Text style={styles.buttonLabel}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#1e293b',
    backgroundColor: '#0f172a',
    gap: 10,
    marginHorizontal: 20,
    paddingHorizontal: 18,
    paddingVertical: 22,
  },
  title: {
    color: '#f8fafc',
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  description: {
    color: '#94a3b8',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  button: {
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#334155',
    backgroundColor: '#111827',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  buttonLabel: {
    color: '#e2e8f0',
    fontSize: 14,
    fontWeight: '600',
  },
});
