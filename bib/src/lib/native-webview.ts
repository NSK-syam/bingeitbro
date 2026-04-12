type NativeBridge = {
  postMessage: (message: string) => void;
};

export type NativeAuthMessageType = 'BIB_AUTH_GOOGLE_SIGN_IN' | 'BIB_AUTH_APPLE_SIGN_IN';
export type NativeExternalMessageType = 'BIB_OPEN_EXTERNAL_URL';
export type NativePushMessageType =
  | 'BIB_NATIVE_PUSH_SYNC_CONTEXT'
  | 'BIB_NATIVE_PUSH_CLEAR_CONTEXT'
  | 'BIB_ENABLE_NATIVE_PUSH'
  | 'BIB_REFRESH_NATIVE_PUSH_STATUS'
  | 'BIB_SEND_NATIVE_PUSH_TEST';
export type NativeBridgeMessageType = NativeAuthMessageType | NativeExternalMessageType | NativePushMessageType;

export type NativeExternalTarget = {
  appUrl?: string;
  browserUrl?: string;
};

export type NativePushContext = {
  userId: string;
  accessToken: string;
};

type WindowWithNativeBridge = Window & {
  ReactNativeWebView?: NativeBridge;
  __BIB_NATIVE_PLATFORM?: 'ios' | 'android';
  __BIB_NATIVE_SHELL?: boolean;
  __BIB_NATIVE_EXTERNAL_OPEN?: boolean;
  __BIB_IOS_REVIEW_MODE?: boolean;
};

export function hasNativeAuthBridge(): boolean {
  if (typeof window === 'undefined') return false;
  const bridge = (window as WindowWithNativeBridge).ReactNativeWebView;
  return typeof bridge?.postMessage === 'function';
}

export function getNativeAppPlatform(): 'ios' | 'android' | null {
  if (typeof window === 'undefined') return null;
  return (window as WindowWithNativeBridge).__BIB_NATIVE_PLATFORM ?? null;
}

export function isNativeAppShell(): boolean {
  if (typeof window === 'undefined') return false;
  const win = window as WindowWithNativeBridge;
  if (win.__BIB_NATIVE_SHELL) return true;
  if (win.__BIB_NATIVE_PLATFORM) return true;
  return (window.navigator.userAgent || '').toLowerCase().includes('bibenativeapp');
}

function isLikelyIosUserAgent(): boolean {
  if (typeof window === 'undefined') return false;

  const userAgent = window.navigator.userAgent || '';
  if (/\b(iPad|iPhone|iPod)\b/i.test(userAgent)) return true;

  return /Macintosh/i.test(userAgent) && typeof navigator !== 'undefined' && navigator.maxTouchPoints > 1;
}

export function isNativeAppleSignInSupported(): boolean {
  if (!hasNativeAuthBridge()) return false;

  const platform = getNativeAppPlatform();
  if (platform) return platform === 'ios';

  return isLikelyIosUserAgent();
}

export function isNativeIosApp(): boolean {
  return isNativeAppleSignInSupported();
}

export function isNativeIosReviewMode(): boolean {
  if (typeof window === 'undefined') return false;
  const win = window as WindowWithNativeBridge;
  if (win.__BIB_IOS_REVIEW_MODE) return true;
  if (document.documentElement.dataset.bibIosReview === '1') return true;
  return false;
}

export function supportsNativeExternalOpen(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean((window as WindowWithNativeBridge).__BIB_NATIVE_EXTERNAL_OPEN);
}

function postNativeMessage(payload: Record<string, unknown> & { type: NativeBridgeMessageType }): boolean {
  if (!hasNativeAuthBridge()) return false;
  const bridge = (window as WindowWithNativeBridge).ReactNativeWebView;
  bridge?.postMessage(JSON.stringify(payload));
  return true;
}

export function postNativeAuthMessage(type: NativeAuthMessageType): boolean {
  return postNativeMessage({ type });
}

export function postNativeExternalOpenMessage(target: NativeExternalTarget): boolean {
  if (!supportsNativeExternalOpen()) return false;
  const appUrl = target.appUrl?.trim();
  const browserUrl = target.browserUrl?.trim();
  if (!appUrl && !browserUrl) return false;

  return postNativeMessage({
    type: 'BIB_OPEN_EXTERNAL_URL',
    appUrl,
    browserUrl,
  });
}

export function postNativePushSyncContextMessage(context: NativePushContext): boolean {
  const userId = context.userId.trim();
  const accessToken = context.accessToken.trim();
  if (!userId || !accessToken) return false;

  return postNativeMessage({
    type: 'BIB_NATIVE_PUSH_SYNC_CONTEXT',
    userId,
    accessToken,
  });
}

export function postNativePushClearContextMessage(context?: Partial<NativePushContext>): boolean {
  const userId = context?.userId?.trim();
  const accessToken = context?.accessToken?.trim();

  return postNativeMessage({
    type: 'BIB_NATIVE_PUSH_CLEAR_CONTEXT',
    userId,
    accessToken,
  });
}

export function postNativePushEnableMessage(context?: Partial<NativePushContext>): boolean {
  const userId = context?.userId?.trim();
  const accessToken = context?.accessToken?.trim();

  return postNativeMessage({
    type: 'BIB_ENABLE_NATIVE_PUSH',
    userId,
    accessToken,
  });
}

export function postNativePushRefreshMessage(): boolean {
  return postNativeMessage({ type: 'BIB_REFRESH_NATIVE_PUSH_STATUS' });
}

export function postNativePushTestMessage(): boolean {
  return postNativeMessage({ type: 'BIB_SEND_NATIVE_PUSH_TEST' });
}
