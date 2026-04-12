// @ts-nocheck
const fs = require('fs');
const ts = require('typescript');

const transpileTsModule = (module, filename) => {
  const source = fs.readFileSync(filename, 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      jsx: ts.JsxEmit.React,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
    fileName: filename,
  });

  module._compile(outputText, filename);
};

require.extensions['.ts'] = transpileTsModule;
require.extensions['.tsx'] = transpileTsModule;

const React = require('react');
const TestRenderer = require('react-test-renderer');

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mockGetSession = jest.fn(() => new Promise(() => {}));
const mockOnAuthStateChange = jest.fn(() => ({
  data: {
    subscription: {
      unsubscribe: jest.fn(),
    },
  },
}));
const mockExchangeCodeForSession = jest.fn();
const mockSetSession = jest.fn();
const mockSignInWithOAuth = jest.fn();
const mockSignInWithIdToken = jest.fn();
const mockUpdateUser = jest.fn();
const mockCaptureAppleProviderCredential = jest.fn(() => Promise.resolve());
const mockSignInWithAppleAsync = jest.fn();
const mockIsAppleSignInAvailable = jest.fn(() => Promise.resolve(true));
const mockOpenAuthSessionAsync = jest.fn();

jest.mock('../../lib/supabase', () => ({
  getSupabaseClient: jest.fn(() => ({
    auth: {
      exchangeCodeForSession: mockExchangeCodeForSession,
      getSession: mockGetSession,
      onAuthStateChange: mockOnAuthStateChange,
      signInWithIdToken: mockSignInWithIdToken,
      signInWithOAuth: mockSignInWithOAuth,
      setSession: mockSetSession,
      updateUser: mockUpdateUser,
    },
  })),
}));

jest.mock('../../lib/apple-auth', () => ({
  captureAppleProviderCredential: mockCaptureAppleProviderCredential,
  formatAppleFullName: jest.fn(() => null),
  isAppleSignInAvailable: mockIsAppleSignInAvailable,
  signInWithAppleAsync: mockSignInWithAppleAsync,
}));

jest.mock('../../lib/config', () => ({
  getRuntimeConfig: jest.fn(() => ({
    appScheme: 'bingeitbro',
    siteUrl: 'https://bingeitbro.com',
  })),
  isSupabaseConfigured: jest.fn(() => true),
}));

jest.mock('../../lib/http', () => ({
  httpRequest: jest.fn(),
}));

jest.mock('expo-web-browser', () => ({
  maybeCompleteAuthSession: jest.fn(),
  openAuthSessionAsync: mockOpenAuthSessionAsync,
}));

jest.mock('expo-auth-session', () => ({
  makeRedirectUri: jest.fn(() => 'bingeitbro://auth/callback'),
}));

const { AuthProvider } = require('../AuthProvider');
const { useSession } = require('../../hooks/useSession');

let latestSessionValue = null;

function SessionProbe() {
  latestSessionValue = useSession();
  const { loading } = latestSessionValue;

  return React.createElement('auth-session-probe', {
    state: loading ? 'loading' : 'ready',
  });
}

describe('AuthProvider', () => {
  beforeEach(() => {
    latestSessionValue = null;
    mockGetSession.mockReset();
    mockOnAuthStateChange.mockClear();
    mockExchangeCodeForSession.mockReset();
    mockSetSession.mockReset();
    mockSignInWithOAuth.mockReset();
    mockSignInWithIdToken.mockReset();
    mockUpdateUser.mockReset();
    mockCaptureAppleProviderCredential.mockReset();
    mockSignInWithAppleAsync.mockReset();
    mockIsAppleSignInAvailable.mockReset();
    mockOpenAuthSessionAsync.mockReset();

    mockGetSession.mockImplementation(() => new Promise(() => {}));
    mockOnAuthStateChange.mockImplementation(() => ({
      data: {
        subscription: {
          unsubscribe: jest.fn(),
        },
      },
    }));
    mockCaptureAppleProviderCredential.mockResolvedValue(undefined);
    mockIsAppleSignInAvailable.mockResolvedValue(true);
    mockExchangeCodeForSession.mockResolvedValue({ error: null });
    mockSetSession.mockResolvedValue({ error: null });
    mockSignInWithOAuth.mockResolvedValue({ data: { url: 'https://accounts.google.com/o/oauth2/auth' }, error: null });
    mockOpenAuthSessionAsync.mockResolvedValue({
      type: 'success',
      url: 'bingeitbro://auth/callback?access_token=access-token&refresh_token=refresh-token',
    });
  });

  it('exposes a loading session state while auth bootstrap is in flight', () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    let renderer;

    TestRenderer.act(() => {
      renderer = TestRenderer.create(
        React.createElement(
          AuthProvider,
          null,
          React.createElement(SessionProbe),
        ),
      );
    });

    expect(renderer.root.findByType('auth-session-probe').props.state).toBe('loading');
    consoleErrorSpy.mockRestore();
  });

  it('treats Apple provider capture failure as a successful sign-in', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    let renderer;

    mockSignInWithAppleAsync.mockResolvedValue({
      identityToken: 'apple-id-token',
      nonce: 'nonce-value',
      fullName: null,
    });
    mockSignInWithIdToken.mockResolvedValue({ error: null });
    mockGetSession.mockResolvedValue({
      data: {
        session: {
          access_token: 'session-token',
        },
      },
    });
    mockCaptureAppleProviderCredential.mockRejectedValue(new Error('storage offline'));

    await TestRenderer.act(async () => {
      renderer = TestRenderer.create(
        React.createElement(
          AuthProvider,
          null,
          React.createElement(SessionProbe),
        ),
      );
    });

    let result;
    await TestRenderer.act(async () => {
      result = await latestSessionValue.signInWithApple();
    });

    expect(result).toEqual({ error: null });
    expect(mockSignInWithIdToken).toHaveBeenCalledWith({
      provider: 'apple',
      token: 'apple-id-token',
      nonce: 'nonce-value',
    });
    expect(mockCaptureAppleProviderCredential).toHaveBeenCalledWith('session-token');
    expect(renderer.root.findByType('auth-session-probe').props.state).toBe('ready');
    consoleErrorSpy.mockRestore();
  });

  it('completes Google sign-in on iOS by setting the session from callback tokens', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    let renderer;

    await TestRenderer.act(async () => {
      renderer = TestRenderer.create(
        React.createElement(
          AuthProvider,
          null,
          React.createElement(SessionProbe),
        ),
      );
    });

    let result;
    await TestRenderer.act(async () => {
      result = await latestSessionValue.signInWithGoogle();
    });

    expect(result).toEqual({ error: null });
    expect(mockSignInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: {
        redirectTo: 'https://bingeitbro.com/auth/callback?native_app=1',
        skipBrowserRedirect: true,
        queryParams: {
          access_type: 'offline',
          prompt: 'select_account',
        },
      },
    });
    expect(mockOpenAuthSessionAsync).toHaveBeenCalledWith(
      'https://accounts.google.com/o/oauth2/auth',
      'bingeitbro://auth/callback',
    );
    expect(mockSetSession).toHaveBeenCalledWith({
      access_token: 'access-token',
      refresh_token: 'refresh-token',
    });
    consoleErrorSpy.mockRestore();
  });
});
