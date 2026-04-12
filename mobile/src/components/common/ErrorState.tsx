import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

type ErrorStateProps = {
  message: string;
  onRetry: () => void;
  retryLabel?: string;
  title?: string;
};

export function ErrorState({
  message,
  onRetry,
  retryLabel = 'Retry',
  title = 'Something went wrong',
}: ErrorStateProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>
      <Pressable
        accessibilityLabel={retryLabel}
        accessibilityRole="button"
        onPress={onRetry}
        style={styles.button}
      >
        <Text style={styles.buttonLabel}>{retryLabel}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#7f1d1d',
    backgroundColor: '#450a0a',
    gap: 10,
    marginHorizontal: 20,
    paddingHorizontal: 18,
    paddingVertical: 20,
  },
  title: {
    color: '#fee2e2',
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  message: {
    color: '#fecaca',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  button: {
    alignItems: 'center',
    borderRadius: 14,
    backgroundColor: '#f97316',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  buttonLabel: {
    color: '#020617',
    fontSize: 14,
    fontWeight: '700',
  },
});
