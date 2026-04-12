// @ts-nocheck
import React, { useMemo, useState } from 'react';
import { isSupabaseConfigured, getRuntimeConfig } from '../../lib/config';
import { getSupabaseClient } from '../../lib/supabase';
import {
  AuthForm,
  AuthLinkText,
  AuthTextField,
} from '../../components/auth/AuthForm';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function ResetPasswordScreen({ navigation }) {
  const { siteUrl } = useMemo(() => getRuntimeConfig(), []);
  const [email, setEmail] = useState('');
  const [errorMessage, setErrorMessage] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const handleResetPassword = async () => {
    if (submitting) {
      return;
    }

    const trimmedEmail = email.trim().toLowerCase();

    if (!EMAIL_PATTERN.test(trimmedEmail)) {
      setSuccessMessage(null);
      setErrorMessage('Enter a valid email address.');
      return;
    }

    if (!isSupabaseConfigured()) {
      setSuccessMessage(null);
      setErrorMessage('Supabase is not configured for the mobile app.');
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const supabase = getSupabaseClient();
      const { error } = await supabase.auth.resetPasswordForEmail(trimmedEmail, {
        redirectTo: `${siteUrl}/reset-password`,
      });

      if (error) {
        setErrorMessage(error.message);
        return;
      }

      setSuccessMessage('Check your email for a password reset link.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthForm
      errorMessage={errorMessage}
      footer={
        <AuthLinkText align="center" onPress={() => navigation.navigate('Login')}>
          Return to login
        </AuthLinkText>
      }
      onPrimaryAction={() => {
        void handleResetPassword();
      }}
      primaryActionLabel="Send reset link"
      primaryDisabled={submitting}
      primaryLoading={submitting}
      subtitle="Enter the email tied to your account and we will send a reset link."
      successMessage={successMessage}
      title="Reset password"
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
    </AuthForm>
  );
}
