import React from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import type { TitleProvidersState } from '../../types';
import type { OTTLink } from '../../lib/providers';

type ProviderListProps = {
  providers: TitleProvidersState;
};

async function openProvider(provider: OTTLink) {
  const fallbackUrl = provider.browserUrl || provider.url;
  const appUrl = provider.appUrl?.trim();

  if (appUrl) {
    try {
      if (await Linking.canOpenURL(appUrl)) {
        await Linking.openURL(appUrl);
        return;
      }
    } catch {
      // Fall through to browserUrl.
    }
  }

  try {
    await Linking.openURL(fallbackUrl);
  } catch {
    // Keep provider taps locally handled even if the system cannot open the fallback URL.
  }
}

function ProviderStateCard({
  message,
  actionLabel,
  onActionPress,
  retrying,
}: {
  actionLabel?: string;
  message: string;
  onActionPress?: () => void;
  retrying?: boolean;
}) {
  return (
    <View style={styles.stateCard}>
      <Text style={styles.stateMessage}>{message}</Text>
      {onActionPress && actionLabel ? (
        <Pressable accessibilityLabel={actionLabel} accessibilityRole="button" onPress={onActionPress} style={styles.stateButton}>
          {retrying ? <ActivityIndicator color="#020617" /> : <Text style={styles.stateButtonLabel}>{actionLabel}</Text>}
        </Pressable>
      ) : null}
    </View>
  );
}

export function ProviderList({ providers }: ProviderListProps) {
  const hasItems = providers.items.length > 0;

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <Text style={styles.title}>OTT Providers</Text>
        <Text style={styles.subtitle}>Tap a provider to hand off to the app when possible.</Text>
      </View>

      {providers.loading && !hasItems ? <ProviderStateCard message="Loading provider options..." /> : null}

      {providers.error ? (
        <ProviderStateCard
          actionLabel={providers.retrying ? 'Retrying...' : 'Retry providers'}
          message={providers.error.message}
          onActionPress={providers.retry}
          retrying={providers.retrying}
        />
      ) : null}

      {!providers.loading && !providers.error && !hasItems ? (
        <ProviderStateCard message="No streaming providers were found for this title." />
      ) : null}

      {hasItems ? (
        <View style={styles.list}>
          {providers.items.map((provider) => (
            <Pressable
              accessibilityLabel={`Open ${provider.platform}`}
              accessibilityRole="button"
              key={`${provider.platform}-${provider.url}`}
              onPress={() => {
                void openProvider(provider);
              }}
              style={styles.row}
            >
              <View style={styles.logo}>
                <Text style={styles.logoLabel}>{provider.platform.slice(0, 1).toUpperCase()}</Text>
              </View>
              <View style={styles.body}>
                <Text style={styles.platform}>{provider.platform}</Text>
                <Text style={styles.available}>{provider.availableIn ?? 'Available now'}</Text>
              </View>
              <Text style={styles.action}>Open</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: 12,
  },
  header: {
    gap: 4,
  },
  title: {
    color: '#f8fafc',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  subtitle: {
    color: '#94a3b8',
    fontSize: 13,
    lineHeight: 18,
  },
  stateCard: {
    alignItems: 'center',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#1e293b',
    backgroundColor: '#0f172a',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 18,
  },
  stateMessage: {
    color: '#cbd5e1',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  stateButton: {
    alignItems: 'center',
    borderRadius: 14,
    backgroundColor: '#f97316',
    paddingHorizontal: 16,
    paddingVertical: 12,
    minWidth: 124,
  },
  stateButtonLabel: {
    color: '#020617',
    fontSize: 14,
    fontWeight: '800',
  },
  list: {
    gap: 10,
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#1e293b',
    backgroundColor: '#0f172a',
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  logo: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 44,
    width: 44,
    borderRadius: 14,
    backgroundColor: '#1e293b',
  },
  logoLabel: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '800',
  },
  body: {
    flex: 1,
    gap: 4,
  },
  platform: {
    color: '#f8fafc',
    fontSize: 15,
    fontWeight: '700',
  },
  available: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '600',
  },
  action: {
    color: '#fb923c',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
});
