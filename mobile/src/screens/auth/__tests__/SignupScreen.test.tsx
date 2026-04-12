// @ts-nocheck
const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const Module = require('module');

const React = require('react');
const TestRenderer = require('react-test-renderer');

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mockSignUp = jest.fn();
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
  Linking: {
    openURL: jest.fn(() => Promise.resolve()),
  },
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

let runtimeConfig = {
  siteUrl: 'https://bingeitbro.com',
  turnstileSiteKey: '',
};

const configMock = {
  getRuntimeConfig: () => runtimeConfig,
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

    if (request === 'react-native-webview') {
      return {
        WebView: createHostComponent('WebView'),
      };
    }

    if (request.endsWith('/hooks/useSession')) {
      return {
        useSession: () => mockUseSession(),
      };
    }

    if (request.endsWith('/lib/config')) {
      return configMock;
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

const { SignupScreen } = loadTranspiledModule(
  path.join(__dirname, '..', 'SignupScreen.tsx'),
);

function findByLabel(root, matcher) {
  return root.find((node) => {
    const label = node.props?.accessibilityLabel;

    return typeof label === 'string' && matcher.test(label);
  });
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

function findPressableByText(root, matcher) {
  return root.find((node) => {
    if (node.type !== 'Pressable' || typeof node.props?.onPress !== 'function') {
      return false;
    }

    return matcher.test(collectTextContent(node));
  });
}

function findText(root, matcher) {
  return root.find((node) => {
    const text = collectTextContent(node);

    return typeof text === 'string' && matcher.test(text);
  });
}

function findNode(root, predicate) {
  return root.find((node) => predicate(node));
}

describe('SignupScreen', () => {
  let consoleErrorSpy;

  beforeEach(() => {
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    runtimeConfig = {
      siteUrl: 'https://bingeitbro.com',
      turnstileSiteKey: '',
    };
    mockSignUp.mockReset();
    mockUseSession.mockReset();
    mockSignUp.mockResolvedValue({
      error: null,
      needsEmailConfirmation: false,
    });
    mockUseSession.mockReturnValue({
      loading: false,
      signUp: mockSignUp,
    });
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('submits without birthday because birthday is optional', async () => {
    const navigation = {
      goBack: jest.fn(),
      navigate: jest.fn(),
    };
    let renderer;

    await TestRenderer.act(async () => {
      renderer = TestRenderer.create(React.createElement(SignupScreen, { navigation }));
    });

    const root = renderer.root;

    await TestRenderer.act(async () => {
      findByLabel(root, /your name/i).props.onChangeText('Syam');
    });

    await TestRenderer.act(async () => {
      findByLabel(root, /username/i).props.onChangeText('syam');
    });

    await TestRenderer.act(async () => {
      findByLabel(root, /^email$/i).props.onChangeText('syam@example.com');
    });

    await TestRenderer.act(async () => {
      findByLabel(root, /password/i).props.onChangeText('12345678');
    });

    await TestRenderer.act(async () => {
      findPressableByText(root, /create account/i).props.onPress();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(mockSignUp).toHaveBeenCalledWith({
      birthdate: null,
      email: 'syam@example.com',
      name: 'Syam',
      password: '12345678',
      username: 'syam',
    });

    expect(() =>
      root.find((node) => {
        const text = Array.isArray(node.props?.children)
          ? node.props.children.join(' ')
          : node.props?.children;

        return typeof text === 'string' && /complete a valid birthday/i.test(text);
      })
    ).toThrow();
  });

  it('blocks signup until Turnstile verification completes when configured', async () => {
    runtimeConfig = {
      siteUrl: 'https://bingeitbro.com',
      turnstileSiteKey: 'site-key',
    };

    const navigation = {
      goBack: jest.fn(),
      navigate: jest.fn(),
    };
    let renderer;

    await TestRenderer.act(async () => {
      renderer = TestRenderer.create(React.createElement(SignupScreen, { navigation }));
    });

    const root = renderer.root;

    await TestRenderer.act(async () => {
      findByLabel(root, /your name/i).props.onChangeText('Syam');
    });

    await TestRenderer.act(async () => {
      findByLabel(root, /username/i).props.onChangeText('syam');
    });

    await TestRenderer.act(async () => {
      findByLabel(root, /^email$/i).props.onChangeText('syam@example.com');
    });

    await TestRenderer.act(async () => {
      findByLabel(root, /password/i).props.onChangeText('12345678');
    });

    await TestRenderer.act(async () => {
      findPressableByText(root, /create account/i).props.onPress();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(mockSignUp).not.toHaveBeenCalled();
    expect(findText(root, /please complete the verification challenge/i)).toBeTruthy();
  });

  it('clears rejected Turnstile tokens and exposes recovery controls', async () => {
    runtimeConfig = {
      siteUrl: 'https://bingeitbro.com',
      turnstileSiteKey: 'site-key',
    };
    mockSignUp.mockResolvedValue({
      error: new Error('Verification failed. Please retry.'),
      needsEmailConfirmation: false,
    });

    const navigation = {
      goBack: jest.fn(),
      navigate: jest.fn(),
    };
    let renderer;

    await TestRenderer.act(async () => {
      renderer = TestRenderer.create(React.createElement(SignupScreen, { navigation }));
    });

    const root = renderer.root;

    await TestRenderer.act(async () => {
      findByLabel(root, /your name/i).props.onChangeText('Syam');
    });

    await TestRenderer.act(async () => {
      findByLabel(root, /username/i).props.onChangeText('syam');
    });

    await TestRenderer.act(async () => {
      findByLabel(root, /^email$/i).props.onChangeText('syam@example.com');
    });

    await TestRenderer.act(async () => {
      findByLabel(root, /password/i).props.onChangeText('12345678');
    });

    await TestRenderer.act(async () => {
      findNode(root, (node) => typeof node.props?.onMessage === 'function').props.onMessage({
        nativeEvent: {
          data: JSON.stringify({
            type: 'turnstile-token',
            token: 'captcha-token',
          }),
        },
      });
    });

    await TestRenderer.act(async () => {
      findPressableByText(root, /create account/i).props.onPress();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(mockSignUp).toHaveBeenCalledWith({
      birthdate: null,
      captchaToken: 'captcha-token',
      email: 'syam@example.com',
      name: 'Syam',
      password: '12345678',
      username: 'syam',
    });
    expect(findText(root, /reload verification/i)).toBeTruthy();
    expect(findText(root, /verification failed\. reload the challenge and try again\./i)).toBeTruthy();

    await TestRenderer.act(async () => {
      findPressableByText(root, /create account/i).props.onPress();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(mockSignUp).toHaveBeenCalledTimes(1);
    expect(findText(root, /please complete the verification challenge/i)).toBeTruthy();
  });
});
