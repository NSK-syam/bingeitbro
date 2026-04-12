import React, { useMemo, useState } from 'react';
import {
  Linking,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';

import { DeleteAccountSheet } from '../../components/profile/DeleteAccountSheet';
import {
  deleteAccount,
  getPrivacyPolicyUrl,
  getSupportUrl,
} from '../../lib/account';
import { getSupabaseClient } from '../../lib/supabase';
import type { MainTabParamList } from '../../navigation/types';

const { useSession } = require('../../hooks/useSession');

type ProfileScreenProps = BottomTabScreenProps<MainTabParamList, 'Profile'>;

function toErrorMessage(error: unknown, fallbackMessage: string): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (
    typeof error === 'object' &&
    error &&
    'message' in error &&
    typeof error.message === 'string'
  ) {
    return error.message;
  }

  return fallbackMessage;
}

function getDisplayName(user: Record<string, any> | null | undefined): string {
  const candidates = [
    user?.user_metadata?.full_name,
    user?.user_metadata?.name,
    user?.user_metadata?.username,
    user?.email,
  ];

  return candidates.find((value) => typeof value === 'string' && value.trim())?.trim() ?? 'Movie fan';
}

function getUsername(user: Record<string, any> | null | undefined): string | null {
  const username = user?.user_metadata?.username;
  return typeof username === 'string' && username.trim() ? `@${username.trim()}` : null;
}

function getInitials(label: string): string {
  const initials = label
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

  return initials || 'MF';
}

async function openExternalLink(url: string): Promise<void> {
  await Linking.openURL(url);
}

export function ProfileScreen(_props: ProfileScreenProps) {
  const { loading, session, signOut, user } = useSession();
  const [deleteSheetVisible, setDeleteSheetVisible] = useState(false);
  const [deletePending, setDeletePending] = useState(false);
  const [deleteErrorMessage, setDeleteErrorMessage] = useState<string | null>(null);
  const [signOutPending, setSignOutPending] = useState(false);
  const [screenMessage, setScreenMessage] = useState<string | null>(null);

  const displayName = useMemo(() => getDisplayName(user), [user]);
  const initials = useMemo(() => getInitials(displayName), [displayName]);
  const username = useMemo(() => getUsername(user), [user]);
  const email = typeof user?.email === 'string' ? user.email : 'No email available';

  const links = useMemo(
    () => [
      {
        label: 'Privacy policy',
        url: getPrivacyPolicyUrl(),
      },
      {
        label: 'Support',
        url: getSupportUrl(),
      },
    ],
    [],
  );

  const handleSignOut = async () => {
    if (loading || signOutPending || deletePending) {
      return;
    }

    setScreenMessage(null);
    setSignOutPending(true);

    try {
      const { error } = await signOut();
      if (error) {
        setScreenMessage(error.message);
      }
    } finally {
      setSignOutPending(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (deletePending) {
      return;
    }

    const accessToken = session?.access_token;
    if (!accessToken) {
      setDeleteErrorMessage('You must be signed in to delete your account.');
      return;
    }

    setDeletePending(true);
    setDeleteErrorMessage(null);

    try {
      await deleteAccount(accessToken);

      const supabase = getSupabaseClient();
      const { error } = await supabase.auth.signOut({ scope: 'local' });
      if (error) {
        setScreenMessage(
          'Your account was deleted, but the local session could not be cleared automatically. Please close and reopen the app.',
        );
      } else {
        setScreenMessage('Your account has been deleted.');
      }

      setDeleteSheetVisible(false);
      setDeleteErrorMessage(null);
    } catch (error) {
      setDeleteErrorMessage(toErrorMessage(error, 'Unable to delete your account.'));
    } finally {
      setDeletePending(false);
    }
  };

  const handleOpenLink = async (url: string) => {
    setScreenMessage(null);

    try {
      await openExternalLink(url);
    } catch (error) {
      setScreenMessage(toErrorMessage(error, 'Unable to open that link right now.'));
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.eyebrow}>Profile</Text>
          <Text style={styles.title}>Account and privacy</Text>
          <Text style={styles.subtitle}>
            Review your identity, open support resources, sign out, or permanently delete
            your account from one place.
          </Text>
        </View>

        <View style={styles.identityCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarLabel}>{initials}</Text>
          </View>
          <View style={styles.identityText}>
            <Text style={styles.name}>{displayName}</Text>
            {username ? <Text style={styles.username}>{username}</Text> : null}
            <Text style={styles.email}>{email}</Text>
          </View>
        </View>

        {screenMessage ? (
          <View style={styles.messageCard}>
            <Text style={styles.messageTitle}>Action needed</Text>
            <Text style={styles.messageBody}>{screenMessage}</Text>
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Account actions</Text>
          <Pressable
            accessibilityLabel="Sign out"
            accessibilityRole="button"
            onPress={() => {
              void handleSignOut();
            }}
            style={[styles.actionButton, styles.primaryAction]}
          >
            <Text style={styles.primaryActionLabel}>
              {signOutPending ? 'Signing out...' : 'Sign out'}
            </Text>
          </Pressable>
          <Pressable
            accessibilityLabel="Open delete account sheet"
            accessibilityRole="button"
            onPress={() => {
              setDeleteErrorMessage(null);
              setDeleteSheetVisible(true);
            }}
            style={[styles.actionButton, styles.destructiveAction]}
          >
            <Text style={styles.destructiveActionLabel}>Delete account and data</Text>
          </Pressable>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Privacy and support</Text>
          {links.map((link) => (
            <Pressable
              accessibilityLabel={link.label}
              accessibilityRole="button"
              key={link.label}
              onPress={() => {
                void handleOpenLink(link.url);
              }}
              style={styles.linkRow}
            >
              <View>
                <Text style={styles.linkLabel}>{link.label}</Text>
                <Text style={styles.linkValue}>{link.url}</Text>
              </View>
              <Text style={styles.linkChevron}>Open</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>

      <DeleteAccountSheet
        deleting={deletePending}
        errorMessage={deleteErrorMessage}
        onClose={() => {
          if (deletePending) {
            return;
          }

          setDeleteSheetVisible(false);
          setDeleteErrorMessage(null);
        }}
        onDelete={() => {
          void handleDeleteAccount();
        }}
        userLabel={email}
        visible={deleteSheetVisible}
      />
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
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 32,
  },
  header: {
    gap: 8,
  },
  eyebrow: {
    color: '#f97316',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  title: {
    color: '#f8fafc',
    fontSize: 31,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  subtitle: {
    color: '#94a3b8',
    fontSize: 15,
    lineHeight: 22,
  },
  identityCard: {
    alignItems: 'center',
    backgroundColor: '#0f172a',
    borderColor: '#1e293b',
    borderRadius: 26,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 16,
    padding: 18,
  },
  avatar: {
    alignItems: 'center',
    backgroundColor: '#1d4ed8',
    borderRadius: 24,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  avatarLabel: {
    color: '#dbeafe',
    fontSize: 17,
    fontWeight: '800',
  },
  identityText: {
    flex: 1,
    gap: 4,
  },
  name: {
    color: '#f8fafc',
    fontSize: 20,
    fontWeight: '700',
  },
  username: {
    color: '#f97316',
    fontSize: 14,
    fontWeight: '600',
  },
  email: {
    color: '#cbd5e1',
    fontSize: 14,
  },
  messageCard: {
    backgroundColor: '#431407',
    borderColor: '#c2410c',
    borderRadius: 20,
    borderWidth: 1,
    gap: 6,
    padding: 16,
  },
  messageTitle: {
    color: '#fdba74',
    fontSize: 15,
    fontWeight: '700',
  },
  messageBody: {
    color: '#fed7aa',
    fontSize: 13,
    lineHeight: 19,
  },
  section: {
    gap: 12,
  },
  sectionLabel: {
    color: '#cbd5e1',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  actionButton: {
    alignItems: 'center',
    borderRadius: 18,
    minHeight: 54,
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  primaryAction: {
    backgroundColor: '#f97316',
  },
  primaryActionLabel: {
    color: '#020617',
    fontSize: 15,
    fontWeight: '800',
  },
  destructiveAction: {
    backgroundColor: '#450a0a',
    borderColor: '#7f1d1d',
    borderWidth: 1,
  },
  destructiveActionLabel: {
    color: '#fecaca',
    fontSize: 15,
    fontWeight: '800',
  },
  linkRow: {
    alignItems: 'center',
    backgroundColor: '#0f172a',
    borderColor: '#1e293b',
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 15,
  },
  linkLabel: {
    color: '#f8fafc',
    fontSize: 15,
    fontWeight: '700',
  },
  linkValue: {
    color: '#94a3b8',
    fontSize: 12,
    marginTop: 4,
  },
  linkChevron: {
    color: '#f97316',
    fontSize: 13,
    fontWeight: '700',
  },
});
