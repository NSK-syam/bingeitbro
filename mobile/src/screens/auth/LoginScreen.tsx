// @ts-nocheck
import React, { useState } from 'react';
import { Text } from 'react-native';
import {
  AuthActionButton,
  AuthForm,
  AuthLinkText,
  AuthTextField,
} from '../../components/auth/AuthForm';
import { useSession } from '../../hooks/useSession';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function LoginScreen({ navigation }) {
  const { loading, signIn, signInWithApple, signInWithGoogle } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [socialProvider, setSocialProvider] = useState(null);
  const disabled = loading || submitting || socialProvider !== null;

  const handleLogin = async () => {
    if (disabled) {
      return;
    }

    const trimmedEmail = email.trim().toLowerCase();

    if (!EMAIL_PATTERN.test(trimmedEmail)) {
      setErrorMessage('Enter a valid email address.');
      return;
    }

    if (!password) {
      setErrorMessage('Enter your password.');
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);

    try {
      const { error } = await signIn({
        email: trimmedEmail,
        password,
      });

      if (error) {
        setErrorMessage(error.message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleSocialSignIn = async (provider) => {
    if (disabled) {
      return;
    }

    setErrorMessage(null);
    setSocialProvider(provider);

    try {
      const result =
        provider === 'apple'
          ? await signInWithApple()
          : await signInWithGoogle();

      if (result.error) {
        setErrorMessage(result.error.message);
      }
    } finally {
      setSocialProvider(null);
    }
  };

  return (
    <AuthForm
      errorMessage={errorMessage}
      footer={
        <>
          <AuthLinkText onPress={() => navigation.navigate('ResetPassword')}>
            Forgot password?
          </AuthLinkText>
          <Text style={{ color: '#94a3b8', fontSize: 14, textAlign: 'center' }}>
            New here?
          </Text>
          <AuthLinkText align="center" onPress={() => navigation.navigate('Signup')}>
            Create account
          </AuthLinkText>
        </>
      }
      headerActions={
        <>
          <AuthActionButton
            disabled={disabled}
            label={
              socialProvider === 'apple' ? 'Connecting to Apple...' : 'Continue with Apple'
            }
            onPress={() => {
              void handleSocialSignIn('apple');
            }}
          />
          <AuthActionButton
            disabled={disabled}
            label={
              socialProvider === 'google' ? 'Connecting to Google...' : 'Continue with Google'
            }
            onPress={() => {
              void handleSocialSignIn('google');
            }}
          />
        </>
      }
      onPrimaryAction={() => {
        void handleLogin();
      }}
      primaryActionLabel="Log in"
      primaryDisabled={disabled}
      primaryLoading={submitting}
      subtitle="Sign in to keep your watchlist and account details available across devices."
      title="Welcome back"
    >
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
        autoComplete="password"
        label="Password"
        onChangeText={setPassword}
        placeholder="Enter your password"
        secureTextEntry
        textContentType="password"
        value={password}
      />
    </AuthForm>
  );
}
