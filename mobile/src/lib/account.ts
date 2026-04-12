import { getRuntimeConfig } from './config';
import { httpRequest } from './http';

function joinSitePath(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${getRuntimeConfig().siteUrl}${normalizedPath}`;
}

export async function deleteAccount(accessToken: string): Promise<void> {
  await httpRequest('/api/account/delete', {
    method: 'POST',
    accessToken,
  });
}

export function getPrivacyPolicyUrl(): string {
  return joinSitePath('/privacy');
}

export function getSupportUrl(): string {
  return joinSitePath('/support');
}
