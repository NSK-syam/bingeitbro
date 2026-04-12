// @ts-nocheck
const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const Module = require('module');

const React = require('react');
const TestRenderer = require('react-test-renderer');

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mockSignIn = jest.fn();
const mockSignInWithApple = jest.fn();
const mockSignInWithGoogle = jest.fn();
const mockUseSession = jest.fn();

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
  KeyboardAvoidingView: createHostComponent('KeyboardAvoidingView'),
  Platform: {
    OS: 'ios',
    select: (options) => options.ios ?? options.default,
  },
  Pressable: createHostComponent('Pressable'),
  SafeAreaView: createHostComponent('SafeAreaView'),
  ScrollView: createHostComponent('ScrollView'),
  StyleSheet: {
    create: (styles) => styles,
    hairlineWidth: 1,
  },
  Text: createHostComponent('Text'),
  TextInput: createHostComponent('TextInput'),
  View: createHostComponent('View'),
};

const compilerOptions = {
  esModuleInterop: true,
  jsx: ts.JsxEmit.React,
  module: ts.ModuleKind.CommonJS,
  target: ts.ScriptTarget.ES2020,
};

const transpiledModuleCache = new Map();

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

    if (request.endsWith('/hooks/useSession')) {
      return {
        useSession: () => mockUseSession(),
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

const { LoginScreen } = loadTranspiledModule(
  path.join(__dirname, '..', 'LoginScreen.tsx'),
);

function collectTextContent(node) {
  if (typeof node === 'string') {
    return node;
  }

  if (!node || !node.children) {
    return '';
  }

  return node.children.map((child) => collectTextContent(child)).join(' ');
}

function findPressableByText(root, matcher) {
  return root.find((node) => {
    if (node.type !== 'Pressable' || typeof node.props?.onPress !== 'function') {
      return false;
    }

    return matcher.test(collectTextContent(node));
  });
}

describe('LoginScreen', () => {
  let consoleErrorSpy;

  beforeEach(() => {
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockSignIn.mockReset();
    mockSignInWithApple.mockReset();
    mockSignInWithGoogle.mockReset();
    mockUseSession.mockReset();

    mockSignIn.mockResolvedValue({ error: null });
    mockSignInWithApple.mockResolvedValue({ error: null });
    mockSignInWithGoogle.mockResolvedValue({ error: null });

    mockUseSession.mockReturnValue({
      loading: false,
      signIn: mockSignIn,
      signInWithApple: mockSignInWithApple,
      signInWithGoogle: mockSignInWithGoogle,
    });
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('shows Google sign-in on iOS and triggers the Google auth action', async () => {
    const navigation = {
      navigate: jest.fn(),
    };
    let renderer;

    await TestRenderer.act(async () => {
      renderer = TestRenderer.create(React.createElement(LoginScreen, { navigation }));
    });

    const root = renderer.root;

    expect(() => findPressableByText(root, /continue with apple/i)).not.toThrow();
    const googleButton = findPressableByText(root, /continue with google/i);

    await TestRenderer.act(async () => {
      googleButton.props.onPress();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(mockSignInWithGoogle).toHaveBeenCalledTimes(1);
  });
});
