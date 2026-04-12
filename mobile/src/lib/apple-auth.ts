import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import { httpRequest } from './http';

export type AppleFullName = {
  familyName: string | null;
  givenName: string | null;
  middleName?: string | null;
};

export type AppleSignInResult = {
  authorizationCode: string | null;
  email: string | null;
  fullName: AppleFullName | null;
  identityToken: string;
  nonce: string;
  user: string;
};

type StoredAppleCredential = {
  authorizationCode: string | null;
  email: string | null;
  identityToken: string | null;
  user: string | null;
};

let latestAppleCredential: StoredAppleCredential | null = null;

function trimString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export async function isAppleSignInAvailable(): Promise<boolean> {
  return AppleAuthentication.isAvailableAsync();
}

export function getLatestAppleCredential(): StoredAppleCredential | null {
  return latestAppleCredential;
}

export function clearLatestAppleCredential(): void {
  latestAppleCredential = null;
}

export function formatAppleFullName(fullName: AppleFullName | null): string | null {
  if (!fullName) {
    return null;
  }

  const parts = [fullName.givenName, fullName.middleName ?? null, fullName.familyName].filter(
    (value): value is string => Boolean(value && value.trim()),
  );

  return parts.length > 0 ? parts.join(' ') : null;
}

export async function signInWithAppleAsync(): Promise<AppleSignInResult> {
  const nonce = Crypto.randomUUID();
  const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, nonce);
  const credential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
    ],
    nonce: hashedNonce,
  });

  const identityToken = trimString(credential.identityToken);
  const user = trimString(credential.user);
  if (!identityToken || !user) {
    throw new Error('Apple sign-in did not return the required identity token.');
  }

  latestAppleCredential = {
    authorizationCode: trimString(credential.authorizationCode),
    identityToken,
    email: trimString(credential.email),
    user,
  };

  return {
    identityToken,
    nonce,
    user,
    email: trimString(credential.email),
    authorizationCode: trimString(credential.authorizationCode),
    fullName: credential.fullName
      ? {
          givenName: credential.fullName.givenName ?? null,
          familyName: credential.fullName.familyName ?? null,
          middleName: credential.fullName.middleName ?? null,
        }
      : null,
  };
}

export async function captureAppleProviderCredential(accessToken: string): Promise<void> {
  const credential = getLatestAppleCredential();
  if (!credential || (!credential.authorizationCode && !credential.identityToken && !credential.user)) {
    return;
  }

  await httpRequest('/api/account/provider-credentials', {
    method: 'POST',
    accessToken,
    body: {
      provider: 'apple',
      authorizationCode: credential.authorizationCode,
      identityToken: credential.identityToken,
      email: credential.email,
      user: credential.user,
    },
  });
}
