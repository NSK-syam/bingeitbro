export function isLikelyInAppBrowser(userAgent: string): boolean {
  const ua = userAgent.toLowerCase();
  if (!ua) return false;

  // Common in-app / embedded browser signatures.
  const embeddedMarkers = [
    'instagram',
    'fban',
    'fbav',
    'fb_iab',
    'messenger',
    'line/',
    'micromessenger',
    'snapchat',
    'tiktok',
    'twitter',
    'x-webview',
    '; wv)',
    ' webview',
  ];

  if (embeddedMarkers.some((marker) => ua.includes(marker))) {
    return true;
  }

  // iOS embedded webviews often miss Safari token.
  const isIos = /iphone|ipad|ipod/.test(ua);
  const hasSafari = ua.includes('safari');
  const hasBrowserEngine = ua.includes('applewebkit');
  if (isIos && hasBrowserEngine && !hasSafari) {
    return true;
  }

  return false;
}

