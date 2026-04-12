// @ts-nocheck
const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const Module = require('module');
const React = require('react');
const TestRenderer = require('react-test-renderer');

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

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

const mockCanOpenURL = jest.fn();
const mockOpenURL = jest.fn();

const reactNativeMock = {
  Image: createHostComponent('Image'),
  Linking: {
    canOpenURL: mockCanOpenURL,
    openURL: mockOpenURL,
  },
  Pressable: createHostComponent('Pressable'),
  ScrollView: createHostComponent('ScrollView'),
  StyleSheet: {
    create: (styles) => styles,
  },
  Text: createHostComponent('Text'),
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

const { ProviderList } = loadTranspiledModule(
  path.join(__dirname, '..', 'ProviderList.tsx'),
);

async function flush() {
  await new Promise((resolve) => setTimeout(resolve, 0));
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

function findPressableByLabel(root, matcher) {
  return root.find((node) => {
    if (node.type !== 'Pressable' || typeof node.props?.onPress !== 'function') {
      return false;
    }

    const label = node.props?.accessibilityLabel;
    return typeof label === 'string' && matcher.test(label);
  });
}

describe('ProviderList', () => {
  let consoleErrorSpy;

  beforeEach(() => {
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockCanOpenURL.mockReset();
    mockOpenURL.mockReset();
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('opens the app link when supported and falls back to the browser link when not', async () => {
    mockCanOpenURL.mockImplementation(async (url) => url.startsWith('nflx://'));
    mockOpenURL.mockResolvedValue(undefined);

    const providers = {
      error: null,
      items: [
        {
          platform: 'Netflix',
          availableIn: 'USA',
          appUrl: 'nflx://www.netflix.com/search?q=Se7en',
          browserUrl: 'https://www.netflix.com/search?q=Se7en',
          logoPath: '/netflix.png',
          url: 'https://www.netflix.com/search?q=Se7en',
        },
        {
          platform: 'Prime Video',
          availableIn: 'India',
          appUrl: 'https://app.primevideo.com/search?phrase=Se7en',
          browserUrl: 'https://www.primevideo.com/search?phrase=Se7en',
          logoPath: '/prime.png',
          url: 'https://www.primevideo.com/search?phrase=Se7en',
        },
      ],
      loading: false,
      retry: jest.fn(),
      retrying: false,
    };

    let renderer;

    await TestRenderer.act(async () => {
      renderer = TestRenderer.create(
        React.createElement(ProviderList, {
          providers,
        }),
      );
    });

    const root = renderer.root;

    await TestRenderer.act(async () => {
      findPressableByLabel(root, /open netflix/i).props.onPress();
      await flush();
    });

    expect(mockCanOpenURL).toHaveBeenCalledWith('nflx://www.netflix.com/search?q=Se7en');
    expect(mockOpenURL).toHaveBeenCalledWith('nflx://www.netflix.com/search?q=Se7en');

    await TestRenderer.act(async () => {
      findPressableByLabel(root, /open prime video/i).props.onPress();
      await flush();
    });

    expect(mockCanOpenURL).toHaveBeenCalledWith('https://app.primevideo.com/search?phrase=Se7en');
    expect(mockOpenURL).toHaveBeenCalledWith('https://www.primevideo.com/search?phrase=Se7en');
  });

  it('falls back to the browser link when opening the app link fails', async () => {
    mockCanOpenURL.mockResolvedValue(true);
    mockOpenURL
      .mockRejectedValueOnce(new Error('app unavailable'))
      .mockResolvedValueOnce(undefined);

    const providers = {
      error: null,
      items: [
        {
          platform: 'Netflix',
          availableIn: 'USA',
          appUrl: 'nflx://www.netflix.com/search?q=Se7en',
          browserUrl: 'https://www.netflix.com/search?q=Se7en',
          logoPath: '/netflix.png',
          url: 'https://www.netflix.com/search?q=Se7en',
        },
      ],
      loading: false,
      retry: jest.fn(),
      retrying: false,
    };

    let renderer;

    await TestRenderer.act(async () => {
      renderer = TestRenderer.create(
        React.createElement(ProviderList, {
          providers,
        }),
      );
    });

    const root = renderer.root;

    await TestRenderer.act(async () => {
      findPressableByLabel(root, /open netflix/i).props.onPress();
      await flush();
    });

    expect(mockCanOpenURL).toHaveBeenCalledWith('nflx://www.netflix.com/search?q=Se7en');
    expect(mockOpenURL).toHaveBeenNthCalledWith(1, 'nflx://www.netflix.com/search?q=Se7en');
    expect(mockOpenURL).toHaveBeenNthCalledWith(2, 'https://www.netflix.com/search?q=Se7en');
  });

  it('handles a failed browser fallback without leaving an unhandled async rejection', async () => {
    mockCanOpenURL.mockResolvedValue(false);
    mockOpenURL.mockRejectedValue(new Error('browser blocked'));

    const providers = {
      error: null,
      items: [
        {
          platform: 'Prime Video',
          availableIn: 'India',
          appUrl: 'https://app.primevideo.com/search?phrase=Se7en',
          browserUrl: 'https://www.primevideo.com/search?phrase=Se7en',
          logoPath: '/prime.png',
          url: 'https://www.primevideo.com/search?phrase=Se7en',
        },
      ],
      loading: false,
      retry: jest.fn(),
      retrying: false,
    };

    let renderer;

    await TestRenderer.act(async () => {
      renderer = TestRenderer.create(
        React.createElement(ProviderList, {
          providers,
        }),
      );
    });

    const root = renderer.root;

    await TestRenderer.act(async () => {
      findPressableByLabel(root, /open prime video/i).props.onPress();
      await flush();
    });

    expect(mockCanOpenURL).toHaveBeenCalledWith('https://app.primevideo.com/search?phrase=Se7en');
    expect(mockOpenURL).toHaveBeenCalledWith('https://www.primevideo.com/search?phrase=Se7en');
  });
});
