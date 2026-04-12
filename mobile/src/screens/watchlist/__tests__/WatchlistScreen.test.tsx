// @ts-nocheck
const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const Module = require('module');

const React = require('react');
const TestRenderer = require('react-test-renderer');

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const originalConsoleError = console.error;

const mockUseWatchlist = jest.fn();
const mockRefresh = jest.fn();

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
  FlatList: ({ data = [], renderItem, ListHeaderComponent }) => {
    const children = [];

    if (ListHeaderComponent) {
      children.push(
        React.createElement(ListHeaderComponent.type ?? ListHeaderComponent, {
          ...ListHeaderComponent.props,
        }),
      );
    }

    data.forEach((item, index) => {
      const rendered = renderItem({ index, item });

      children.push(
        React.createElement(rendered.type ?? rendered, {
          ...rendered.props,
          key: rendered.key ?? `${index}`,
        }),
      );
    });

    return React.createElement('FlatList', {}, children);
  },
  Image: createHostComponent('Image'),
  Pressable: createHostComponent('Pressable'),
  RefreshControl: createHostComponent('RefreshControl'),
  SafeAreaView: createHostComponent('SafeAreaView'),
  StyleSheet: {
    create: (styles) => styles,
    hairlineWidth: 1,
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

    if (request === '../../hooks/useWatchlist') {
      return {
        useWatchlist: () => mockUseWatchlist(),
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

const { WatchlistScreen } = loadTranspiledModule(
  path.join(__dirname, '..', 'WatchlistScreen.tsx'),
);

let consoleErrorSpy;

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

function findPressableByLabel(root, matcher) {
  return root.find((node) => {
    if (typeof node.props?.onPress !== 'function') {
      return false;
    }

    return typeof node.props?.accessibilityLabel === 'string'
      && matcher.test(node.props.accessibilityLabel);
  });
}

describe('WatchlistScreen', () => {
  beforeEach(() => {
    mockUseWatchlist.mockReset();
    mockRefresh.mockReset();
    mockUseWatchlist.mockReturnValue({
      addItem: jest.fn(),
      error: null,
      items: [],
      loading: false,
      pendingIds: [],
      refresh: mockRefresh,
      refreshing: false,
      removeItem: jest.fn(),
    });
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

  it('shows the empty state and sends the user back to Discover', () => {
    const navigation = {
      navigate: jest.fn(),
    };

    let renderer;

    TestRenderer.act(() => {
      renderer = TestRenderer.create(
        React.createElement(WatchlistScreen, { navigation }),
      );
    });

    const root = renderer.root;

    expect(findText(root, /your watchlist is empty/i)).toBeTruthy();
    expect(findText(root, /nothing is saved yet/i)).toBeTruthy();

    TestRenderer.act(() => {
      findPressableByLabel(root, /back to discover/i).props.onPress();
    });

    expect(navigation.navigate).toHaveBeenCalledWith('DiscoverTab', { screen: 'Discover' });
  });

  it('shows the loading state while the first watchlist request is in flight', () => {
    const navigation = {
      navigate: jest.fn(),
    };

    mockUseWatchlist.mockReturnValue({
      addItem: jest.fn(),
      error: null,
      items: [],
      loading: true,
      pendingIds: [],
      refresh: mockRefresh,
      refreshing: false,
      removeItem: jest.fn(),
    });

    let renderer;

    TestRenderer.act(() => {
      renderer = TestRenderer.create(
        React.createElement(WatchlistScreen, { navigation }),
      );
    });

    expect(findText(renderer.root, /loading watchlist/i)).toBeTruthy();
  });

  it('shows a blocking error when loading fails with no saved items', () => {
    const navigation = {
      navigate: jest.fn(),
    };

    mockUseWatchlist.mockReturnValue({
      addItem: jest.fn(),
      error: new Error('Session expired'),
      items: [],
      loading: false,
      pendingIds: [],
      refresh: mockRefresh,
      refreshing: false,
      removeItem: jest.fn(),
    });

    let renderer;

    TestRenderer.act(() => {
      renderer = TestRenderer.create(
        React.createElement(WatchlistScreen, { navigation }),
      );
    });

    const root = renderer.root;

    expect(findText(root, /could not load saved titles/i)).toBeTruthy();
    expect(findText(root, /session expired/i)).toBeTruthy();

    TestRenderer.act(() => {
      findPressableByLabel(root, /retry watchlist/i).props.onPress();
    });

    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  it('shows an inline error while preserving saved items', () => {
    const navigation = {
      navigate: jest.fn(),
    };

    mockUseWatchlist.mockReturnValue({
      addItem: jest.fn(),
      error: new Error('Delete failed'),
      items: [
        {
          addedAt: '2026-03-20T12:00:00.000Z',
          id: 'entry-arrival',
          mediaType: 'movie',
          posterPath: '/arrival.jpg',
          title: 'Arrival',
          tmdbId: 101,
        },
      ],
      loading: false,
      pendingIds: [],
      refresh: mockRefresh,
      refreshing: false,
      removeItem: jest.fn(),
    });

    let renderer;

    TestRenderer.act(() => {
      renderer = TestRenderer.create(
        React.createElement(WatchlistScreen, { navigation }),
      );
    });

    const root = renderer.root;

    expect(findText(root, /watchlist update failed/i)).toBeTruthy();
    expect(findText(root, /delete failed/i)).toBeTruthy();
    expect(findText(root, /arrival/i)).toBeTruthy();
  });

  it('renders saved titles and opens the matching detail routes', () => {
    const navigation = {
      navigate: jest.fn(),
    };

    mockUseWatchlist.mockReturnValue({
      addItem: jest.fn(),
      error: null,
      items: [
        {
          addedAt: '2026-03-20T12:00:00.000Z',
          id: 'entry-arrival',
          mediaType: 'movie',
          posterPath: '/arrival.jpg',
          title: 'Arrival',
          tmdbId: 101,
        },
        {
          addedAt: '2026-03-21T12:00:00.000Z',
          id: 'entry-severance',
          mediaType: 'tv',
          posterPath: '/severance.jpg',
          title: 'Severance',
          tmdbId: 202,
        },
      ],
      loading: false,
      pendingIds: [],
      refresh: mockRefresh,
      refreshing: false,
      removeItem: jest.fn(),
    });

    let renderer;

    TestRenderer.act(() => {
      renderer = TestRenderer.create(
        React.createElement(WatchlistScreen, { navigation }),
      );
    });

    const root = renderer.root;

    expect(findText(root, /arrival/i)).toBeTruthy();
    expect(findText(root, /severance/i)).toBeTruthy();

    TestRenderer.act(() => {
      findPressableByLabel(root, /open movie arrival/i).props.onPress();
      findPressableByLabel(root, /open tv severance/i).props.onPress();
    });

    expect(navigation.navigate).toHaveBeenCalledWith('DiscoverTab', {
      params: { tmdbId: 101 },
      screen: 'MovieDetail',
    });
    expect(navigation.navigate).toHaveBeenCalledWith('DiscoverTab', {
      params: { tmdbId: 202 },
      screen: 'ShowDetail',
    });
  });

  it('wires the remove action to removeItem and reflects pending removal state', () => {
    const navigation = {
      navigate: jest.fn(),
    };
    const removeItem = jest.fn();

    mockUseWatchlist.mockReturnValue({
      addItem: jest.fn(),
      error: null,
      items: [
        {
          addedAt: '2026-03-20T12:00:00.000Z',
          id: 'entry-arrival',
          mediaType: 'movie',
          posterPath: '/arrival.jpg',
          title: 'Arrival',
          tmdbId: 101,
        },
      ],
      loading: false,
      pendingIds: ['entry-arrival'],
      refresh: mockRefresh,
      refreshing: false,
      removeItem,
    });

    let renderer;

    TestRenderer.act(() => {
      renderer = TestRenderer.create(
        React.createElement(WatchlistScreen, { navigation }),
      );
    });

    const root = renderer.root;
    const removeButton = findPressableByLabel(root, /remove arrival from watchlist/i);

    expect(findText(root, /removing/i)).toBeTruthy();
    expect(removeButton.props.disabled).toBe(true);

    mockUseWatchlist.mockReturnValue({
      addItem: jest.fn(),
      error: null,
      items: [
        {
          addedAt: '2026-03-20T12:00:00.000Z',
          id: 'entry-arrival',
          mediaType: 'movie',
          posterPath: '/arrival.jpg',
          title: 'Arrival',
          tmdbId: 101,
        },
      ],
      loading: false,
      pendingIds: [],
      refresh: mockRefresh,
      refreshing: false,
      removeItem,
    });

    TestRenderer.act(() => {
      renderer.update(React.createElement(WatchlistScreen, { navigation }));
    });

    TestRenderer.act(() => {
      findPressableByLabel(renderer.root, /remove arrival from watchlist/i).props.onPress();
    });

    expect(removeItem).toHaveBeenCalledWith('entry-arrival');
    expect(navigation.navigate).not.toHaveBeenCalled();
  });
});
