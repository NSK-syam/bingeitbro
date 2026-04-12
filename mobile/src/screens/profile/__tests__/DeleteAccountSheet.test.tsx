// @ts-nocheck
const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const Module = require('module');

const React = require('react');
const TestRenderer = require('react-test-renderer');

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const originalConsoleError = console.error;

const mockDeleteAccount = jest.fn();
const mockLocalSignOut = jest.fn();
const mockLinkingOpenURL = jest.fn(() => Promise.resolve());
const mockUseSession = jest.fn();

const compilerOptions = {
  esModuleInterop: true,
  jsx: ts.JsxEmit.React,
  module: ts.ModuleKind.CommonJS,
  target: ts.ScriptTarget.ES2020,
};

const transpiledModuleCache = new Map();

const createHostComponent = (displayName) =>
  React.forwardRef((props, ref) =>
    React.createElement(
      displayName,
      {
        ...props,
        ref,
      },
      props.children,
    ),
  );

const reactNativeMock = {
  ActivityIndicator: createHostComponent('ActivityIndicator'),
  Linking: {
    openURL: (...args) => mockLinkingOpenURL(...args),
  },
  Modal: ({ children, visible }) =>
    visible ? React.createElement('Modal', { visible }, children) : null,
  Pressable: createHostComponent('Pressable'),
  SafeAreaView: createHostComponent('SafeAreaView'),
  ScrollView: createHostComponent('ScrollView'),
  StyleSheet: {
    create: (styles) => styles,
    absoluteFillObject: {},
    hairlineWidth: 1,
  },
  Text: createHostComponent('Text'),
  TextInput: createHostComponent('TextInput'),
  View: createHostComponent('View'),
};

function resolveRelativeModule(parentFilename, request) {
  const absoluteBase = path.resolve(path.dirname(parentFilename), request);
  const candidates = [
    absoluteBase,
    `${absoluteBase}.ts`,
    `${absoluteBase}.tsx`,
    path.join(absoluteBase, 'index.ts'),
    path.join(absoluteBase, 'index.tsx'),
  ];

  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
}

function loadTranspiledModule(filename) {
  const resolvedFilename = path.resolve(filename);

  if (transpiledModuleCache.has(resolvedFilename)) {
    return transpiledModuleCache.get(resolvedFilename).exports;
  }

  const source = fs.readFileSync(resolvedFilename, 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions,
    fileName: resolvedFilename,
  });

  const loadedModule = new Module(resolvedFilename, module);
  transpiledModuleCache.set(resolvedFilename, loadedModule);
  loadedModule.filename = resolvedFilename;
  loadedModule.paths = Module._nodeModulePaths(path.dirname(resolvedFilename));
  loadedModule.require = (request) => {
    if (request === 'react') {
      return React;
    }

    if (request === 'react-native') {
      return reactNativeMock;
    }

    if (request === '../../hooks/useSession') {
      return {
        useSession: () => mockUseSession(),
      };
    }

    if (request === '../../lib/account') {
      return {
        deleteAccount: (...args) => mockDeleteAccount(...args),
        getPrivacyPolicyUrl: () => 'https://bingeitbro.com/privacy',
        getSupportUrl: () => 'https://bingeitbro.com/support',
      };
    }

    if (request === '../../lib/supabase') {
      return {
        getSupabaseClient: () => ({
          auth: {
            signOut: (...args) => mockLocalSignOut(...args),
          },
        }),
      };
    }

    const relativeModule = request.startsWith('.')
      ? resolveRelativeModule(resolvedFilename, request)
      : null;

    if (relativeModule) {
      return loadTranspiledModule(relativeModule);
    }

    return require(request);
  };

  loadedModule._compile(outputText, resolvedFilename);
  return loadedModule.exports;
}

const { DeleteAccountSheet } = loadTranspiledModule(
  path.join(__dirname, '..', '..', '..', 'components', 'profile', 'DeleteAccountSheet.tsx'),
);
const { ProfileScreen } = loadTranspiledModule(
  path.join(__dirname, '..', 'ProfileScreen.tsx'),
);

function findPressableByLabel(root, matcher) {
  return root.find((node) => {
    return typeof node.props?.onPress === 'function'
      && typeof node.props?.accessibilityLabel === 'string'
      && matcher.test(node.props.accessibilityLabel);
  });
}

function findTextInput(root) {
  return root.find((node) => typeof node.props?.onChangeText === 'function');
}

function collectTextContent(node) {
  if (typeof node === 'string') {
    return node;
  }

  if (!node || !node.children) {
    return '';
  }

  return node.children.map((child) => collectTextContent(child)).join(' ');
}

function findText(root, matcher) {
  return root.find((node) => matcher.test(collectTextContent(node)));
}

async function flushAsyncState() {
  await Promise.resolve();
  await Promise.resolve();
}

describe('DeleteAccountSheet', () => {
  let consoleErrorSpy;

  beforeEach(() => {
    mockDeleteAccount.mockReset();
    mockLocalSignOut.mockReset();
    mockLinkingOpenURL.mockReset();
    mockUseSession.mockReset();
    mockLinkingOpenURL.mockResolvedValue(undefined);
    mockLocalSignOut.mockResolvedValue({ error: null });
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation((message, ...args) => {
      if (
        typeof message === 'string' &&
        message.includes('react-test-renderer is deprecated')
      ) {
        return;
      }

      originalConsoleError(message, ...args);
    });
  });

  afterEach(() => {
    consoleErrorSpy?.mockRestore();
  });

  it('requires typing DELETE before the destructive action can run', () => {
    const onDelete = jest.fn();

    let renderer;
    TestRenderer.act(() => {
      renderer = TestRenderer.create(
        React.createElement(DeleteAccountSheet, {
          deleting: false,
          errorMessage: null,
          onClose: jest.fn(),
          onDelete,
          visible: true,
        }),
      );
    });

    const root = renderer.root;

    TestRenderer.act(() => {
      findPressableByLabel(root, /delete account and data/i).props.onPress();
    });

    expect(onDelete).not.toHaveBeenCalled();

    TestRenderer.act(() => {
      findTextInput(root).props.onChangeText('delete');
    });

    TestRenderer.act(() => {
      findPressableByLabel(root, /delete account and data/i).props.onPress();
    });

    expect(onDelete).not.toHaveBeenCalled();

    TestRenderer.act(() => {
      findTextInput(root).props.onChangeText('DELETE');
    });

    TestRenderer.act(() => {
      findPressableByLabel(root, /delete account and data/i).props.onPress();
    });

    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('signs out locally after a successful confirmed delete', async () => {
    mockUseSession.mockReturnValue({
      loading: false,
      session: { access_token: 'session-token' },
      signOut: jest.fn(),
      user: {
        email: 'sam@example.com',
        user_metadata: { full_name: 'Sam Example', username: 'samexample' },
      },
    });
    mockDeleteAccount.mockResolvedValue(undefined);

    let renderer;
    TestRenderer.act(() => {
      renderer = TestRenderer.create(React.createElement(ProfileScreen));
    });

    const root = renderer.root;

    TestRenderer.act(() => {
      findPressableByLabel(root, /open delete account sheet/i).props.onPress();
    });

    TestRenderer.act(() => {
      findTextInput(root).props.onChangeText('DELETE');
    });

    await TestRenderer.act(async () => {
      findPressableByLabel(root, /^delete account and data$/i).props.onPress();
      await flushAsyncState();
    });

    expect(mockDeleteAccount).toHaveBeenCalledWith('session-token');
    expect(mockLocalSignOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(findText(renderer.root, /your account has been deleted/i)).toBeTruthy();
  });

  it('keeps the session intact and shows an error when delete fails', async () => {
    const signOut = jest.fn().mockResolvedValue({ error: null });
    mockUseSession.mockReturnValue({
      loading: false,
      session: { access_token: 'session-token' },
      signOut,
      user: {
        email: 'sam@example.com',
        user_metadata: { full_name: 'Sam Example' },
      },
    });
    mockDeleteAccount.mockRejectedValue(new Error('Delete request failed'));

    let renderer;
    TestRenderer.act(() => {
      renderer = TestRenderer.create(React.createElement(ProfileScreen));
    });

    const root = renderer.root;

    TestRenderer.act(() => {
      findPressableByLabel(root, /open delete account sheet/i).props.onPress();
    });

    TestRenderer.act(() => {
      findTextInput(root).props.onChangeText('DELETE');
    });

    await TestRenderer.act(async () => {
      findPressableByLabel(root, /^delete account and data$/i).props.onPress();
      await flushAsyncState();
    });

    expect(mockDeleteAccount).toHaveBeenCalledWith('session-token');
    expect(signOut).not.toHaveBeenCalled();
    expect(findText(root, /delete request failed/i)).toBeTruthy();
  });

  it('shows a local cleanup message if the server delete succeeds but local sign-out fails', async () => {
    mockUseSession.mockReturnValue({
      loading: false,
      session: { access_token: 'session-token' },
      signOut: jest.fn(),
      user: {
        email: 'sam@example.com',
        user_metadata: { full_name: 'Sam Example', username: 'samexample' },
      },
    });
    mockDeleteAccount.mockResolvedValue(undefined);
    mockLocalSignOut.mockResolvedValue({ error: new Error('local cleanup failed') });

    let renderer;
    TestRenderer.act(() => {
      renderer = TestRenderer.create(React.createElement(ProfileScreen));
    });

    const root = renderer.root;

    TestRenderer.act(() => {
      findPressableByLabel(root, /open delete account sheet/i).props.onPress();
    });

    TestRenderer.act(() => {
      findTextInput(root).props.onChangeText('DELETE');
    });

    await TestRenderer.act(async () => {
      findPressableByLabel(root, /^delete account and data$/i).props.onPress();
      await flushAsyncState();
    });

    expect(mockDeleteAccount).toHaveBeenCalledWith('session-token');
    expect(mockLocalSignOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(findText(renderer.root, /account was deleted, but the local session could not be cleared automatically/i)).toBeTruthy();
  });
});
