import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

const DELETE_CONFIRMATION = 'DELETE';

type DeleteAccountSheetProps = {
  deleting: boolean;
  errorMessage: string | null;
  onClose: () => void;
  onDelete: () => void;
  userLabel?: string | null;
  visible: boolean;
};

export function DeleteAccountSheet({
  deleting,
  errorMessage,
  onClose,
  onDelete,
  userLabel,
  visible,
}: DeleteAccountSheetProps) {
  const [confirmationValue, setConfirmationValue] = useState('');
  const [validationMessage, setValidationMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) {
      setConfirmationValue('');
      setValidationMessage(null);
      return;
    }

    setValidationMessage(null);
  }, [visible]);

  const confirmationMatches = confirmationValue.trim() === DELETE_CONFIRMATION;
  const helperMessage = errorMessage ?? validationMessage;

  const handleDelete = () => {
    if (deleting) {
      return;
    }

    if (!confirmationMatches) {
      setValidationMessage('Type DELETE exactly to unlock account deletion.');
      return;
    }

    setValidationMessage(null);
    onDelete();
  };

  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={visible}>
      <View style={styles.overlay}>
        <Pressable
          accessibilityLabel="Close delete account sheet"
          onPress={onClose}
          style={styles.backdrop}
        />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.eyebrow}>Danger zone</Text>
          <Text style={styles.title}>Delete account and data</Text>
          <Text style={styles.subtitle}>
            This permanently deletes your profile, watchlist, ratings, and account access
            {userLabel ? ` for ${userLabel}` : ''}.
          </Text>

          <View style={styles.warningCard}>
            <Text style={styles.warningTitle}>Before you continue</Text>
            <Text style={styles.warningBody}>
              Type DELETE in all caps to confirm the destructive action. If the request fails,
              your current session stays signed in so you can retry.
            </Text>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Confirmation</Text>
            <TextInput
              accessibilityLabel="Delete confirmation"
              autoCapitalize="characters"
              autoCorrect={false}
              editable={!deleting}
              onChangeText={(value) => {
                setConfirmationValue(value);
                if (validationMessage) {
                  setValidationMessage(null);
                }
              }}
              placeholder="Type DELETE"
              placeholderTextColor="#64748b"
              style={styles.input}
              value={confirmationValue}
            />
            <Text style={styles.inputHint}>Type DELETE exactly to continue.</Text>
          </View>

          {helperMessage ? (
            <View style={styles.errorCard}>
              <Text style={styles.errorTitle}>Deletion failed</Text>
              <Text style={styles.errorBody}>{helperMessage}</Text>
            </View>
          ) : null}

          <View style={styles.footer}>
            <Pressable
              accessibilityLabel="Keep account"
              accessibilityRole="button"
              disabled={deleting}
              onPress={onClose}
              style={[styles.secondaryButton, deleting ? styles.buttonDisabled : null]}
            >
              <Text style={styles.secondaryButtonLabel}>Keep account</Text>
            </Pressable>
            <Pressable
              accessibilityLabel="Delete account and data"
              accessibilityRole="button"
              accessibilityState={{ disabled: deleting || !confirmationMatches }}
              disabled={deleting}
              onPress={handleDelete}
              style={[
                styles.primaryButton,
                !confirmationMatches ? styles.primaryButtonLocked : null,
                deleting ? styles.buttonDisabled : null,
              ]}
            >
              {deleting ? (
                <ActivityIndicator color="#fff7ed" />
              ) : (
                <Text style={styles.primaryButtonLabel}>Delete forever</Text>
              )}
            </Pressable>
          </View>
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
    backgroundColor: 'rgba(2, 6, 23, 0.72)',
  },
  sheet: {
    backgroundColor: '#0f172a',
    borderColor: '#1e293b',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1,
    paddingBottom: 28,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  handle: {
    alignSelf: 'center',
    backgroundColor: '#334155',
    borderRadius: 999,
    height: 4,
    marginBottom: 16,
    width: 48,
  },
  eyebrow: {
    color: '#fb7185',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  title: {
    color: '#fff7ed',
    fontSize: 24,
    fontWeight: '800',
    marginTop: 10,
  },
  subtitle: {
    color: '#cbd5e1',
    fontSize: 14,
    lineHeight: 21,
    marginTop: 8,
  },
  warningCard: {
    backgroundColor: '#450a0a',
    borderColor: '#7f1d1d',
    borderRadius: 20,
    borderWidth: 1,
    gap: 8,
    marginTop: 20,
    padding: 16,
  },
  warningTitle: {
    color: '#fee2e2',
    fontSize: 15,
    fontWeight: '700',
  },
  warningBody: {
    color: '#fecaca',
    fontSize: 13,
    lineHeight: 19,
  },
  inputGroup: {
    gap: 8,
    marginTop: 20,
  },
  inputLabel: {
    color: '#e2e8f0',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  input: {
    backgroundColor: '#111827',
    borderColor: '#334155',
    borderRadius: 16,
    borderWidth: 1,
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 1.2,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  inputHint: {
    color: '#94a3b8',
    fontSize: 13,
  },
  errorCard: {
    backgroundColor: '#431407',
    borderColor: '#c2410c',
    borderRadius: 18,
    borderWidth: 1,
    gap: 6,
    marginTop: 16,
    padding: 14,
  },
  errorTitle: {
    color: '#fdba74',
    fontSize: 14,
    fontWeight: '700',
  },
  errorBody: {
    color: '#fed7aa',
    fontSize: 13,
    lineHeight: 19,
  },
  footer: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 22,
  },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: '#111827',
    borderColor: '#334155',
    borderRadius: 16,
    borderWidth: 1,
    flex: 1,
    paddingVertical: 14,
  },
  secondaryButtonLabel: {
    color: '#e2e8f0',
    fontSize: 14,
    fontWeight: '700',
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#dc2626',
    borderRadius: 16,
    flex: 1,
    justifyContent: 'center',
    minHeight: 50,
    paddingHorizontal: 14,
  },
  primaryButtonLocked: {
    backgroundColor: '#7f1d1d',
  },
  primaryButtonLabel: {
    color: '#fff7ed',
    fontSize: 14,
    fontWeight: '800',
  },
  buttonDisabled: {
    opacity: 0.72,
  },
});
