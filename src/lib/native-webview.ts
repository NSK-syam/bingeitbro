type NativeBridge = {
  postMessage: (message: string) => void;
};

type WindowWithNativeBridge = Window & {
  ReactNativeWebView?: NativeBridge;
};

export function hasNativeAuthBridge(): boolean {
  if (typeof window === 'undefined') return false;
  const bridge = (window as WindowWithNativeBridge).ReactNativeWebView;
  return typeof bridge?.postMessage === 'function';
}

export function postNativeAuthMessage(type: 'BIB_AUTH_GOOGLE_SIGN_IN'): boolean {
  if (!hasNativeAuthBridge()) return false;
  const bridge = (window as WindowWithNativeBridge).ReactNativeWebView;
  bridge?.postMessage(JSON.stringify({ type }));
  return true;
}
