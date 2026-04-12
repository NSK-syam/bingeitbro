// @ts-nocheck
import React from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

export function AuthForm({
  children,
  errorMessage,
  footer,
  headerActions,
  onPrimaryAction,
  primaryActionLabel,
  primaryDisabled = false,
  primaryLoading = false,
  successMessage,
  subtitle,
  title,
}) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.select({ ios: 'padding', default: undefined })}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.card}>
            <Text style={styles.eyebrow}>Binge It Bro</Text>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.subtitle}>{subtitle}</Text>

            {headerActions ? <View style={styles.headerActions}>{headerActions}</View> : null}

            {errorMessage ? (
              <View style={[styles.messageBox, styles.errorBox]}>
                <Text style={styles.errorText}>{errorMessage}</Text>
              </View>
            ) : null}

            {successMessage ? (
              <View style={[styles.messageBox, styles.successBox]}>
                <Text style={styles.successText}>{successMessage}</Text>
              </View>
            ) : null}

            <View style={styles.fields}>{children}</View>

            <Pressable
              accessibilityRole="button"
              disabled={primaryDisabled}
              onPress={onPrimaryAction}
              style={[
                styles.primaryButton,
                primaryDisabled ? styles.primaryButtonDisabled : null,
              ]}
            >
              {primaryLoading ? <ActivityIndicator color="#020617" /> : null}
              <Text style={styles.primaryButtonLabel}>
                {primaryLoading ? 'Working...' : primaryActionLabel}
              </Text>
            </Pressable>

            {footer ? <View style={styles.footer}>{footer}</View> : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function AuthTextField({
  autoCapitalize = 'none',
  autoComplete,
  autoCorrect = false,
  helperText,
  keyboardType = 'default',
  label,
  onChangeText,
  optional = false,
  placeholder,
  secureTextEntry = false,
  textContentType,
  value,
}) {
  const accessibilityLabel = optional ? `${label} (optional)` : label;

  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.fieldLabel}>
        {label}
        {optional ? <Text style={styles.optionalLabel}> (optional)</Text> : null}
      </Text>
      <TextInput
        accessibilityLabel={accessibilityLabel}
        autoCapitalize={autoCapitalize}
        autoComplete={autoComplete}
        autoCorrect={autoCorrect}
        keyboardType={keyboardType}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#64748b"
        secureTextEntry={secureTextEntry}
        style={styles.input}
        textContentType={textContentType}
        value={value}
      />
      {helperText ? <Text style={styles.helperText}>{helperText}</Text> : null}
    </View>
  );
}

export function AuthActionButton({
  disabled = false,
  label,
  onPress,
  variant = 'secondary',
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.actionButton,
        variant === 'primary' ? styles.primaryButton : null,
        variant === 'secondary' ? styles.secondaryButton : null,
        variant === 'tertiary' ? styles.tertiaryButton : null,
        disabled ? styles.buttonDisabled : null,
      ]}
    >
      <Text
        style={[
          styles.actionButtonLabel,
          variant === 'primary' ? styles.primaryButtonLabel : null,
          variant === 'secondary' ? styles.secondaryButtonLabel : null,
          variant === 'tertiary' ? styles.tertiaryButtonLabel : null,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function AuthLinkText({
  align = 'left',
  children,
  onPress,
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={align === 'center' ? styles.linkCenter : styles.linkLeft}
    >
      <Text style={styles.linkText}>{children}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#020617',
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 24,
  },
  card: {
    borderRadius: 28,
    borderWidth: 1,
    borderColor: '#1e293b',
    backgroundColor: '#0f172a',
    paddingHorizontal: 20,
    paddingVertical: 24,
  },
  eyebrow: {
    marginBottom: 10,
    color: '#f97316',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.6,
    textTransform: 'uppercase',
  },
  title: {
    color: '#f8fafc',
    fontSize: 30,
    fontWeight: '700',
  },
  subtitle: {
    marginTop: 8,
    color: '#94a3b8',
    fontSize: 15,
    lineHeight: 22,
  },
  headerActions: {
    marginTop: 24,
    gap: 12,
  },
  messageBox: {
    marginTop: 18,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  errorBox: {
    borderColor: '#7f1d1d',
    backgroundColor: '#450a0a',
  },
  successBox: {
    borderColor: '#14532d',
    backgroundColor: '#052e16',
  },
  errorText: {
    color: '#fecaca',
    fontSize: 14,
    lineHeight: 20,
  },
  successText: {
    color: '#bbf7d0',
    fontSize: 14,
    lineHeight: 20,
  },
  fields: {
    marginTop: 20,
    gap: 16,
  },
  fieldGroup: {
    gap: 8,
  },
  fieldLabel: {
    color: '#e2e8f0',
    fontSize: 14,
    fontWeight: '600',
  },
  optionalLabel: {
    color: '#94a3b8',
    fontWeight: '500',
  },
  input: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#334155',
    backgroundColor: '#020617',
    color: '#f8fafc',
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  helperText: {
    color: '#94a3b8',
    fontSize: 12,
    lineHeight: 18,
  },
  primaryButton: {
    marginTop: 22,
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderRadius: 18,
    backgroundColor: '#f97316',
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  primaryButtonDisabled: {
    opacity: 0.6,
  },
  primaryButtonLabel: {
    color: '#020617',
    fontSize: 16,
    fontWeight: '700',
  },
  footer: {
    marginTop: 18,
    gap: 10,
  },
  actionButton: {
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: '#334155',
    backgroundColor: '#111827',
  },
  tertiaryButton: {
    borderWidth: 1,
    borderColor: '#475569',
    backgroundColor: 'transparent',
  },
  actionButtonLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  secondaryButtonLabel: {
    color: '#f8fafc',
  },
  tertiaryButtonLabel: {
    color: '#cbd5e1',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  linkLeft: {
    alignSelf: 'flex-start',
  },
  linkCenter: {
    alignSelf: 'center',
  },
  linkText: {
    color: '#f97316',
    fontSize: 14,
    fontWeight: '600',
  },
});
