// @ts-nocheck
const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const Module = require('module');
const React = require('react');
const TestRenderer = require('react-test-renderer');

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const compilerOptions = {
  esModuleInterop: true,
  jsx: ts.JsxEmit.React,
  module: ts.ModuleKind.CommonJS,
  target: ts.ScriptTarget.ES2020,
};

const mockBuildTmdbV3Url = jest.fn((pathname, params) => {
  const url = new URL(pathname.startsWith('/3/') ? pathname : `/3/${pathname}`, 'https://api.themoviedb.org');

  Object.entries(params ?? {}).forEach(([key, value]) => {
    if (value !== null && value !== undefined && value !== '') {
      url.searchParams.set(key, String(value));
    }
  });

  return url.toString();
});
const mockFetchTmdbWithProxy = jest.fn();

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

    if (request === '../lib/tmdb-proxy') {
      return {
        buildTmdbV3Url: mockBuildTmdbV3Url,
        fetchTmdbWithProxy: mockFetchTmdbWithProxy,
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

const { useDiscoverFeed } = loadTranspiledModule(
  path.join(__dirname, '..', 'useDiscoverFeed.ts'),
);

async function flush() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

let latestHookValue = null;

function DiscoverFeedProbe(props) {
  latestHookValue = useDiscoverFeed(props.country, props.contentType, props.filters);
  return React.createElement('discover-feed-probe', {
    state: latestHookValue.loading ? 'loading' : 'ready',
  });
}

describe('useDiscoverFeed', () => {
  beforeEach(() => {
    latestHookValue = null;
    mockBuildTmdbV3Url.mockClear();
    mockFetchTmdbWithProxy.mockReset();
  });

  it('preserves the last good list when a refresh fails', async () => {
    const initialPayload = {
      page: 1,
      results: [
        {
          id: 101,
          title: 'Arrival',
          original_title: 'Arrival',
          overview: 'A linguist is recruited after alien ships land on Earth.',
          poster_path: '/arrival-poster.jpg',
          backdrop_path: '/arrival-backdrop.jpg',
          release_date: '2016-11-11',
          vote_average: 7.6,
          vote_count: 17000,
          genre_ids: [18, 878],
          original_language: 'en',
          popularity: 88,
          adult: false,
          video: false,
        },
      ],
      total_pages: 1,
      total_results: 1,
    };

    mockFetchTmdbWithProxy.mockResolvedValueOnce(initialPayload);

    await TestRenderer.act(async () => {
      TestRenderer.create(
        React.createElement(DiscoverFeedProbe, {
          country: 'US',
          contentType: 'movie',
          filters: {},
        }),
      );
      await flush();
      await flush();
    });

    const lastGoodSnapshot = JSON.parse(JSON.stringify(latestHookValue.items));

    mockFetchTmdbWithProxy.mockRejectedValueOnce(new Error('refresh failed'));

    await TestRenderer.act(async () => {
      await latestHookValue.refresh();
    });

    expect(lastGoodSnapshot).toEqual([
      expect.objectContaining({
        tmdbId: 101,
        kind: 'movie',
        title: 'Arrival',
        year: 2016,
        language: 'English',
      }),
    ]);
    expect(latestHookValue.items).toEqual(lastGoodSnapshot);
    expect(latestHookValue.lastGoodItems).toEqual(lastGoodSnapshot);
    expect(latestHookValue.error).toBeTruthy();
    expect(latestHookValue.error.name).toBe('Error');
    expect(latestHookValue.error.message).toBe('refresh failed');
    expect(latestHookValue.loading).toBe(false);
    expect(latestHookValue.refreshing).toBe(false);
  });

  it('clears stale items when an initial query load fails', async () => {
    const initialPayload = {
      page: 1,
      results: [
        {
          id: 101,
          title: 'Arrival',
          original_title: 'Arrival',
          overview: 'A linguist is recruited after alien ships land on Earth.',
          poster_path: '/arrival-poster.jpg',
          backdrop_path: '/arrival-backdrop.jpg',
          release_date: '2016-11-11',
          vote_average: 7.6,
          vote_count: 17000,
          genre_ids: [18, 878],
          original_language: 'en',
          popularity: 88,
          adult: false,
          video: false,
        },
      ],
      total_pages: 1,
      total_results: 1,
    };

    mockFetchTmdbWithProxy.mockResolvedValueOnce(initialPayload);

    let renderer;

    await TestRenderer.act(async () => {
      renderer = TestRenderer.create(
        React.createElement(DiscoverFeedProbe, {
          country: 'US',
          contentType: 'movie',
          filters: {},
        }),
      );
      await flush();
    });

    const lastGoodSnapshot = JSON.parse(JSON.stringify(latestHookValue.items));

    mockFetchTmdbWithProxy.mockRejectedValueOnce(new Error('query failed'));

    await TestRenderer.act(async () => {
      renderer.update(
        React.createElement(DiscoverFeedProbe, {
          country: 'IN',
          contentType: 'movie',
          filters: {},
        }),
      );
      await flush();
      await flush();
    });

    expect(lastGoodSnapshot).toEqual([
      expect.objectContaining({
        tmdbId: 101,
        kind: 'movie',
        title: 'Arrival',
        year: 2016,
        language: 'English',
      }),
    ]);
    expect(latestHookValue.items).toEqual([]);
    expect(latestHookValue.lastGoodItems).toEqual([]);
    expect(latestHookValue.error).toBeTruthy();
    expect(latestHookValue.error.message).toBe('query failed');
    expect(latestHookValue.loading).toBe(false);
    expect(latestHookValue.refreshing).toBe(false);
  });

  it('does not repopulate a previous query after a failed retry on a new query', async () => {
    const initialPayload = {
      page: 1,
      results: [
        {
          id: 101,
          title: 'Arrival',
          original_title: 'Arrival',
          overview: 'A linguist is recruited after alien ships land on Earth.',
          poster_path: '/arrival-poster.jpg',
          backdrop_path: '/arrival-backdrop.jpg',
          release_date: '2016-11-11',
          vote_average: 7.6,
          vote_count: 17000,
          genre_ids: [18, 878],
          original_language: 'en',
          popularity: 88,
          adult: false,
          video: false,
        },
      ],
      total_pages: 1,
      total_results: 1,
    };

    mockFetchTmdbWithProxy.mockResolvedValueOnce(initialPayload);

    let renderer;

    await TestRenderer.act(async () => {
      renderer = TestRenderer.create(
        React.createElement(DiscoverFeedProbe, {
          country: 'US',
          contentType: 'movie',
          filters: {},
        }),
      );
      await flush();
      await flush();
    });

    const previousQueryItems = JSON.parse(JSON.stringify(latestHookValue.items));

    mockFetchTmdbWithProxy.mockRejectedValueOnce(new Error('query failed once'));
    mockFetchTmdbWithProxy.mockRejectedValueOnce(new Error('query failed twice'));

    await TestRenderer.act(async () => {
      renderer.update(
        React.createElement(DiscoverFeedProbe, {
          country: 'IN',
          contentType: 'movie',
          filters: {},
        }),
      );
      await flush();
      await flush();
    });

    expect(previousQueryItems).toEqual([
      expect.objectContaining({
        tmdbId: 101,
        kind: 'movie',
        title: 'Arrival',
      }),
    ]);
    expect(latestHookValue.items).toEqual([]);
    expect(latestHookValue.lastGoodItems).toEqual([]);
    expect(latestHookValue.error).toBeTruthy();
    expect(latestHookValue.error.message).toBe('query failed once');

    await TestRenderer.act(async () => {
      await latestHookValue.refresh();
      await flush();
      await flush();
    });

    expect(latestHookValue.items).toEqual([]);
    expect(latestHookValue.lastGoodItems).toEqual([]);
    expect(latestHookValue.error.message).toBe('query failed twice');
    expect(latestHookValue.refreshing).toBe(false);
  });

  it('clears a stale refresh when a new query starts before it settles', async () => {
    const refreshDeferred = (() => {
      let resolve;
      let reject;
      const promise = new Promise((res, rej) => {
        resolve = res;
        reject = rej;
      });
      return { promise, resolve, reject };
    })();

    const initialPayload = {
      page: 1,
      results: [
        {
          id: 101,
          title: 'Arrival',
          original_title: 'Arrival',
          overview: 'A linguist is recruited after alien ships land on Earth.',
          poster_path: '/arrival-poster.jpg',
          backdrop_path: '/arrival-backdrop.jpg',
          release_date: '2016-11-11',
          vote_average: 7.6,
          vote_count: 17000,
          genre_ids: [18, 878],
          original_language: 'en',
          popularity: 88,
          adult: false,
          video: false,
        },
      ],
      total_pages: 1,
      total_results: 1,
    };

    const nextPayload = {
      page: 1,
      results: [
        {
          id: 202,
          title: 'Severance',
          original_title: 'Severance',
          overview: 'A severed workforce tries to uncover the truth behind their employer.',
          poster_path: '/severance-poster.jpg',
          backdrop_path: '/severance-backdrop.jpg',
          release_date: '2022-02-18',
          vote_average: 8.7,
          vote_count: 8000,
          genre_ids: [18, 9648],
          original_language: 'en',
          popularity: 72,
          adult: false,
          video: false,
        },
      ],
      total_pages: 1,
      total_results: 1,
    };

    mockFetchTmdbWithProxy
      .mockResolvedValueOnce(initialPayload)
      .mockImplementationOnce(() => refreshDeferred.promise)
      .mockResolvedValueOnce(nextPayload);

    let renderer;

    await TestRenderer.act(async () => {
      renderer = TestRenderer.create(
        React.createElement(DiscoverFeedProbe, {
          country: 'US',
          contentType: 'movie',
          filters: {},
        }),
      );
      await flush();
      await flush();
    });

    await TestRenderer.act(async () => {
      void latestHookValue.refresh();
      await flush();
    });

    expect(latestHookValue.refreshing).toBe(true);

    await TestRenderer.act(async () => {
      renderer.update(
        React.createElement(DiscoverFeedProbe, {
          country: 'IN',
          contentType: 'movie',
          filters: {},
        }),
      );
      await flush();
      await flush();
    });

    await TestRenderer.act(async () => {
      refreshDeferred.resolve(nextPayload);
      await flush();
      await flush();
    });

    expect(latestHookValue.loading).toBe(false);
    expect(latestHookValue.refreshing).toBe(false);
    expect(latestHookValue.items).toEqual([
      expect.objectContaining({
        tmdbId: 202,
        kind: 'movie',
        title: 'Severance',
      }),
    ]);
  });
});
