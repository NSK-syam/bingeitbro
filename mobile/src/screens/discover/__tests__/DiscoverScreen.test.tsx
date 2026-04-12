// @ts-nocheck
const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const Module = require('module');

const React = require('react');
const TestRenderer = require('react-test-renderer');

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mockUseDiscoverFeed = jest.fn();
const mockRefresh = jest.fn();

const defaultItems = [
  {
    backdropPath: '/arrival-backdrop.jpg',
    backdropUrl: 'https://image.tmdb.org/t/p/original/arrival-backdrop.jpg',
    kind: 'movie',
    language: 'English',
    posterPath: '/arrival-poster.jpg',
    posterUrl: 'https://image.tmdb.org/t/p/w500/arrival-poster.jpg',
    rating: 7.6,
    synopsis: 'A linguist is recruited after alien ships land on Earth.',
    title: 'Arrival',
    tmdbId: 101,
    year: 2016,
  },
  {
    backdropPath: '/severance-backdrop.jpg',
    backdropUrl: 'https://image.tmdb.org/t/p/original/severance-backdrop.jpg',
    kind: 'tv',
    language: 'English',
    posterPath: '/severance-poster.jpg',
    posterUrl: 'https://image.tmdb.org/t/p/w500/severance-poster.jpg',
    rating: 8.7,
    synopsis: 'A severed workforce tries to uncover the truth behind their employer.',
    title: 'Severance',
    tmdbId: 202,
    year: 2022,
  },
];

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
  FlatList: ({ ListHeaderComponent, data = [], renderItem }) => {
    const children = [];

    if (ListHeaderComponent) {
      children.push(
        React.createElement(ListHeaderComponent.type ?? ListHeaderComponent, {
          ...ListHeaderComponent.props,
        }),
      );
    }

    data.forEach((item, index) => {
      const rendered = renderItem({ item, index });

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
  Modal: ({ children, visible, ...props }) => (
    visible ? React.createElement('Modal', props, children) : null
  ),
  Pressable: createHostComponent('Pressable'),
  RefreshControl: createHostComponent('RefreshControl'),
  SafeAreaView: createHostComponent('SafeAreaView'),
  ScrollView: createHostComponent('ScrollView'),
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

    if (request === '../../hooks/useDiscoverFeed') {
      return {
        useDiscoverFeed: (...args) => mockUseDiscoverFeed(...args),
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

const { DiscoverScreen } = loadTranspiledModule(
  path.join(__dirname, '..', 'DiscoverScreen.tsx'),
);

describe('DiscoverScreen', () => {
  beforeEach(() => {
    mockUseDiscoverFeed.mockReset();
    mockRefresh.mockReset();
    mockUseDiscoverFeed.mockImplementation((country, contentType, filters = {}) => {
      const isQueryChange = country === 'US' || contentType === 'tv' || Boolean(filters.sortBy);

      return {
        error: null,
        items: defaultItems,
        lastGoodItems: defaultItems,
        loading: isQueryChange,
        refresh: mockRefresh,
        refreshing: false,
      };
    });
  });

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
      if (typeof node.props?.onPress !== 'function') {
        return false;
      }

      return typeof node.props?.accessibilityLabel === 'string'
        && matcher.test(node.props.accessibilityLabel);
    });
  }

  function findText(root, matcher) {
    return root.find((node) => matcher.test(collectTextContent(node)));
  }

  it('renders title cards and navigates to the matching detail routes', () => {
    const navigation = {
      navigate: jest.fn(),
    };

    let renderer;

    TestRenderer.act(() => {
      renderer = TestRenderer.create(
        React.createElement(DiscoverScreen, { navigation }),
      );
    });

    const root = renderer.root;

    expect(findText(root, /discover/i)).toBeTruthy();
    expect(findText(root, /arrival/i)).toBeTruthy();
    expect(findText(root, /show/i)).toBeTruthy();

    TestRenderer.act(() => {
      findPressableByLabel(root, /open movie arrival/i).props.onPress();
      findPressableByLabel(root, /open tv severance/i).props.onPress();
    });

    expect(navigation.navigate).toHaveBeenCalledWith('MovieDetail', { tmdbId: 101 });
    expect(navigation.navigate).toHaveBeenCalledWith('ShowDetail', { tmdbId: 202 });
  });

  it('shows a blocking error and no stale titles when a query change fails', async () => {
    const navigation = {
      navigate: jest.fn(),
    };

    mockUseDiscoverFeed.mockImplementation((country, contentType) => {
      if (contentType === 'tv') {
        return {
          error: new Error('query failed'),
          items: [],
          lastGoodItems: defaultItems,
          loading: false,
          refresh: mockRefresh,
          refreshing: false,
        };
      }

      return {
        error: null,
        items: defaultItems,
        lastGoodItems: defaultItems,
        loading: false,
        refresh: mockRefresh,
        refreshing: false,
      };
    });

    let renderer;

    TestRenderer.act(() => {
      renderer = TestRenderer.create(
        React.createElement(DiscoverScreen, { navigation }),
      );
    });

    const root = renderer.root;

    expect(findText(root, /arrival/i)).toBeTruthy();

    await TestRenderer.act(async () => {
      findPressableByLabel(root, /shows segment/i).props.onPress();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const updatedRoot = renderer.root;

    expect(mockUseDiscoverFeed.mock.calls.at(-1)).toEqual(['IN', 'tv', {}]);
    expect(findText(updatedRoot, /could not load titles/i)).toBeTruthy();
    expect(findText(updatedRoot, /query failed/i)).toBeTruthy();
    expect(() => findText(updatedRoot, /arrival/i)).toThrow();
  });

  it('shows loading immediately when the query changes during an in-flight refresh', async () => {
    const navigation = {
      navigate: jest.fn(),
    };

    mockUseDiscoverFeed.mockImplementation((country, contentType) => {
      if (contentType === 'tv') {
        return {
          error: null,
          items: defaultItems,
          lastGoodItems: defaultItems,
          loading: false,
          refresh: mockRefresh,
          refreshing: true,
        };
      }

      return {
        error: null,
        items: defaultItems,
        lastGoodItems: defaultItems,
        loading: false,
        refresh: mockRefresh,
        refreshing: false,
      };
    });

    let renderer;

    TestRenderer.act(() => {
      renderer = TestRenderer.create(
        React.createElement(DiscoverScreen, { navigation }),
      );
    });

    const root = renderer.root;

    expect(findText(root, /arrival/i)).toBeTruthy();

    await TestRenderer.act(async () => {
      findPressableByLabel(root, /shows segment/i).props.onPress();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const updatedRoot = renderer.root;

    expect(updatedRoot.findAll((node) => node.type === 'ActivityIndicator').length).toBeGreaterThan(0);
    expect(() => findText(updatedRoot, /arrival/i)).toThrow();
  });

  it('wires filter modal close behavior for Android back', () => {
    const navigation = {
      navigate: jest.fn(),
    };

    let renderer;

    TestRenderer.act(() => {
      renderer = TestRenderer.create(
        React.createElement(DiscoverScreen, { navigation }),
      );
    });

    const root = renderer.root;

    TestRenderer.act(() => {
      findPressableByLabel(root, /open filters/i).props.onPress();
    });

    const modal = renderer.root.find((node) => node.type === 'Modal');

    expect(typeof modal.props.onRequestClose).toBe('function');
  });

  it('keeps the list visible when a refresh fails', () => {
    const navigation = {
      navigate: jest.fn(),
    };

    let renderer;

    TestRenderer.act(() => {
      renderer = TestRenderer.create(
        React.createElement(DiscoverScreen, { navigation }),
      );
    });

    mockUseDiscoverFeed.mockImplementation(() => ({
      error: new Error('refresh failed'),
      items: defaultItems,
      lastGoodItems: defaultItems,
      loading: false,
      refresh: mockRefresh,
      refreshing: false,
    }));

    TestRenderer.act(() => {
      renderer.update(React.createElement(DiscoverScreen, { navigation }));
    });

    const root = renderer.root;

    expect(findText(root, /refresh failed/i)).toBeTruthy();
    expect(findText(root, /arrival/i)).toBeTruthy();
  });

  it('shows the empty retry state when the feed has no titles', () => {
    const navigation = {
      navigate: jest.fn(),
    };

    mockUseDiscoverFeed.mockImplementation(() => ({
      error: null,
      items: [],
      lastGoodItems: [],
      loading: false,
      refresh: mockRefresh,
      refreshing: false,
    }));

    let renderer;

    TestRenderer.act(() => {
      renderer = TestRenderer.create(
        React.createElement(DiscoverScreen, { navigation }),
      );
    });

    const root = renderer.root;

    expect(findText(root, /nothing to show/i)).toBeTruthy();

    TestRenderer.act(() => {
      findPressableByLabel(root, /retry/i).props.onPress();
    });

    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });
});
