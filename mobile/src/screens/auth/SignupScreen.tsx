// @ts-nocheck
import React, { useMemo, useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import {
  AuthForm,
  AuthLinkText,
  AuthTextField,
} from '../../components/auth/AuthForm';
import { getRuntimeConfig } from '../../lib/config';
import { useSession } from '../../hooks/useSession';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BIRTHDAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const VERIFICATION_REQUIRED_MESSAGE = 'Please complete the verification challenge.';

function getCaptchaRecoveryStatus(message) {
  const normalizedMessage = message.trim().toLowerCase();

  if (!normalizedMessage) {
    return null;
  }

  const mentionsCaptcha =
    normalizedMessage.includes('captcha') ||
    normalizedMessage.includes('turnstile') ||
    normalizedMessage.includes('verification');

  if (!mentionsCaptcha) {
    return null;
  }

  if (
    normalizedMessage.includes('expired') ||
    normalizedMessage.includes('timeout') ||
    normalizedMessage.includes('timed out')
  ) {
    return 'expired';
  }

  return 'error';
}

function escapeHtml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildTurnstileHtml(siteKey) {
  const escapedSiteKey = escapeHtml(siteKey);

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta
      name="viewport"
      content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no"
    />
    <style>
      html, body {
        margin: 0;
        padding: 0;
        background: transparent;
        color: #e2e8f0;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      body {
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 88px;
      }

      .challenge {
        width: 100%;
        display: flex;
        justify-content: center;
      }
    </style>
    <script>
      function postMessage(type, payload) {
        if (!window.ReactNativeWebView || !window.ReactNativeWebView.postMessage) {
          return;
        }

        window.ReactNativeWebView.postMessage(JSON.stringify(Object.assign({ type: type }, payload || {})));
      }

      function onCaptchaSuccess(token) {
        postMessage('turnstile-token', { token: token });
      }

      function onCaptchaExpired() {
        postMessage('turnstile-expired');
      }

      function onCaptchaError() {
        postMessage('turnstile-error');
      }
    </script>
    <script
      src="https://challenges.cloudflare.com/turnstile/v0/api.js"
      async
      defer
    ></script>
  </head>
  <body>
    <div
      class="cf-turnstile challenge"
      data-sitekey="${escapedSiteKey}"
      data-theme="dark"
      data-callback="onCaptchaSuccess"
      data-expired-callback="onCaptchaExpired"
      data-error-callback="onCaptchaError"
    ></div>
  </body>
</html>`;
}

function parseBirthday(value) {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return {
      error: null,
      birthdate: null,
    };
  }

  const match = BIRTHDAY_PATTERN.exec(trimmedValue);
  if (!match) {
    return {
      error: 'Enter birthday as YYYY-MM-DD or leave it blank.',
      birthdate: null,
    };
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsedDate = new Date(Date.UTC(year, month - 1, day));

  if (
    parsedDate.getUTCFullYear() !== year ||
    parsedDate.getUTCMonth() !== month - 1 ||
    parsedDate.getUTCDate() !== day
  ) {
    return {
      error: 'Enter a valid birthday or leave it blank.',
      birthdate: null,
    };
  }

  return {
    error: null,
    birthdate: `${match[1]}-${match[2]}-${match[3]}`,
  };
}

export function SignupScreen({ navigation }) {
  const { loading, signUp } = useSession();
  const { siteUrl, turnstileSiteKey } = useMemo(() => getRuntimeConfig(), []);
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [birthday, setBirthday] = useState('');
  const [captchaToken, setCaptchaToken] = useState('');
  const [captchaStatus, setCaptchaStatus] = useState(
    turnstileSiteKey ? 'pending' : 'disabled',
  );
  const [captchaRefreshKey, setCaptchaRefreshKey] = useState(0);
  const [errorMessage, setErrorMessage] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const requiresCaptcha = Boolean(turnstileSiteKey);
  const disabled = loading || submitting;

  const openLegalDocument = (path) => {
    void Linking.openURL(`${siteUrl}${path}`);
  };

  const clearCaptchaError = () => {
    setErrorMessage((currentMessage) =>
      currentMessage === VERIFICATION_REQUIRED_MESSAGE ? null : currentMessage,
    );
  };

  const handleCaptchaMessage = (event) => {
    try {
      const payload = JSON.parse(event.nativeEvent.data ?? '{}');

      if (payload.type === 'turnstile-token' && payload.token) {
        setCaptchaToken(payload.token);
        setCaptchaStatus('verified');
        clearCaptchaError();
        return;
      }

      if (payload.type === 'turnstile-expired') {
        setCaptchaToken('');
        setCaptchaStatus('expired');
        return;
      }

      if (payload.type === 'turnstile-error') {
        setCaptchaToken('');
        setCaptchaStatus('error');
      }
    } catch {
      setCaptchaToken('');
      setCaptchaStatus('error');
    }
  };

  const reloadCaptcha = () => {
    setCaptchaToken('');
    setCaptchaStatus('pending');
    setCaptchaRefreshKey((currentValue) => currentValue + 1);
  };

  const handleSignup = async () => {
    if (disabled) {
      return;
    }

    const trimmedName = name.trim();
    const normalizedUsername = username.trim().toLowerCase();
    const trimmedEmail = email.trim().toLowerCase();

    if (!trimmedName) {
      setSuccessMessage(null);
      setErrorMessage('Enter your name.');
      return;
    }

    if (normalizedUsername.length < 3 || normalizedUsername.length > 24) {
      setSuccessMessage(null);
      setErrorMessage('Username must be between 3 and 24 characters.');
      return;
    }

    if (!/^[a-z0-9_]+$/.test(normalizedUsername)) {
      setSuccessMessage(null);
      setErrorMessage('Username can only use lowercase letters, numbers, and underscores.');
      return;
    }

    if (!EMAIL_PATTERN.test(trimmedEmail)) {
      setSuccessMessage(null);
      setErrorMessage('Enter a valid email address.');
      return;
    }

    if (password.length < 8) {
      setSuccessMessage(null);
      setErrorMessage('Password must be at least 8 characters.');
      return;
    }

    const birthdayResult = parseBirthday(birthday);
    if (birthdayResult.error) {
      setSuccessMessage(null);
      setErrorMessage(birthdayResult.error);
      return;
    }

    if (requiresCaptcha && !captchaToken) {
      setSuccessMessage(null);
      setErrorMessage(VERIFICATION_REQUIRED_MESSAGE);
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const result = await signUp({
        birthdate: birthdayResult.birthdate,
        ...(requiresCaptcha ? { captchaToken } : {}),
        email: trimmedEmail,
        name: trimmedName,
        password,
        username: normalizedUsername,
      });

      if (result.error) {
        const captchaRecoveryStatus = requiresCaptcha
          ? getCaptchaRecoveryStatus(result.error.message)
          : null;

        if (captchaRecoveryStatus) {
          setCaptchaToken('');
          setCaptchaStatus(captchaRecoveryStatus);
        }

        setErrorMessage(result.error.message);
        return;
      }

      setSuccessMessage(
        result.needsEmailConfirmation
          ? 'Check your inbox to confirm your account.'
          : 'Account created. You are signed in.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthForm
      errorMessage={errorMessage}
      footer={
        <>
          <Text style={{ color: '#94a3b8', fontSize: 14, lineHeight: 20, textAlign: 'center' }}>
            By creating an account you agree to our
          </Text>
          <AuthLinkText align="center" onPress={() => openLegalDocument('/terms')}>
            Terms
          </AuthLinkText>
          <AuthLinkText align="center" onPress={() => openLegalDocument('/privacy')}>
            Privacy
          </AuthLinkText>
          <Text style={{ color: '#94a3b8', fontSize: 14, textAlign: 'center' }}>
            Already have an account?
          </Text>
          <AuthLinkText align="center" onPress={() => navigation.navigate('Login')}>
            Back to login
          </AuthLinkText>
        </>
      }
      onPrimaryAction={() => {
        void handleSignup();
      }}
      primaryActionLabel="Create account"
      primaryDisabled={disabled}
      primaryLoading={submitting}
      subtitle="Create your account to save titles, track your watchlist, and manage your profile."
      successMessage={successMessage}
      title="Join BingeItBro"
    >
      <AuthTextField
        autoCapitalize="words"
        autoComplete="name"
        label="Your name"
        onChangeText={setName}
        placeholder="What should we call you?"
        textContentType="name"
        value={name}
      />
      <AuthTextField
        autoCapitalize="none"
        autoComplete="username"
        helperText="Lowercase letters, numbers, and underscores only."
        label="Username"
        onChangeText={(value) => setUsername(value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
        placeholder="moviebuff_92"
        textContentType="username"
        value={username}
      />
      <AuthTextField
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        label="Email"
        onChangeText={setEmail}
        placeholder="you@example.com"
        textContentType="emailAddress"
        value={email}
      />
      <AuthTextField
        autoCapitalize="none"
        autoComplete="new-password"
        label="Password"
        onChangeText={setPassword}
        placeholder="Create a password"
        secureTextEntry
        textContentType="newPassword"
        value={password}
      />
      <AuthTextField
        autoCapitalize="none"
        helperText="Optional. Use YYYY-MM-DD if you want to save your birthday to your profile."
        label="Birthday"
        onChangeText={setBirthday}
        optional
        placeholder="YYYY-MM-DD"
        value={birthday}
      />
      {requiresCaptcha ? (
        <View style={styles.verificationCard}>
          <Text style={styles.verificationTitle}>Security verification</Text>
          <Text style={styles.verificationBody}>
            Complete the Turnstile challenge before creating your account.
          </Text>
          <View style={styles.webViewFrame}>
            <WebView
              key={`turnstile-${captchaRefreshKey}`}
              javaScriptEnabled
              nestedScrollEnabled={false}
              onMessage={handleCaptchaMessage}
              originWhitelist={['*']}
              scrollEnabled={false}
              source={{
                baseUrl: siteUrl,
                html: buildTurnstileHtml(turnstileSiteKey),
              }}
              style={styles.webView}
            />
          </View>
          <Text style={styles.verificationStatus}>
            {captchaStatus === 'verified'
              ? 'Verification complete.'
              : captchaStatus === 'error'
                ? 'Verification failed. Reload the challenge and try again.'
                : captchaStatus === 'expired'
                  ? 'Verification expired. Reload the challenge to continue.'
                  : 'Waiting for verification to complete.'}
          </Text>
          {captchaStatus === 'error' || captchaStatus === 'expired' ? (
            <AuthLinkText onPress={reloadCaptcha}>Reload verification</AuthLinkText>
          ) : null}
        </View>
      ) : null}
    </AuthForm>
  );
}

const styles = StyleSheet.create({
  verificationCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#334155',
    backgroundColor: '#111827',
    padding: 14,
  },
  verificationTitle: {
    color: '#f8fafc',
    fontSize: 15,
    fontWeight: '700',
  },
  verificationBody: {
    marginTop: 6,
    color: '#94a3b8',
    fontSize: 13,
    lineHeight: 19,
  },
  webViewFrame: {
    marginTop: 12,
    minHeight: 92,
    overflow: 'hidden',
    borderRadius: 14,
    backgroundColor: '#020617',
  },
  webView: {
    flex: 1,
    minHeight: 92,
    backgroundColor: 'transparent',
  },
  verificationStatus: {
    marginTop: 10,
    color: '#cbd5e1',
    fontSize: 12,
    lineHeight: 18,
  },
});
