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
const mockProvidersToLinks = jest.fn();

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

    if (request === '../lib/providers') {
      return {
        tmdbWatchProvidersToOttLinks: mockProvidersToLinks,
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

const { useTitleDetail } = loadTranspiledModule(
  path.join(__dirname, '..', 'useTitleDetail.ts'),
);

async function flush() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

let latestHookValue = null;

function TitleDetailProbe(props) {
  latestHookValue = useTitleDetail(props.kind, props.tmdbId);
  return React.createElement('title-detail-probe', {
    state: latestHookValue.loading ? 'loading' : 'ready',
  });
}

describe('useTitleDetail', () => {
  beforeEach(() => {
    latestHookValue = null;
    mockBuildTmdbV3Url.mockClear();
    mockFetchTmdbWithProxy.mockReset();
    mockProvidersToLinks.mockReset();
  });

  it('keeps the title state usable when provider fetch fails and exposes scoped retry state', async () => {
    const moviePayload = {
      id: 7,
      title: 'Se7en',
      original_title: 'Se7en',
      overview: 'Two detectives hunt a serial killer who uses the seven deadly sins.',
      poster_path: '/se7en-poster.jpg',
      backdrop_path: '/se7en-backdrop.jpg',
      release_date: '1995-09-22',
      vote_average: 8.4,
      vote_count: 21000,
      genre_ids: [80, 9648],
      original_language: 'en',
      popularity: 99,
      adult: false,
      video: false,
      genres: [
        { id: 80, name: 'Crime' },
        { id: 9648, name: 'Mystery' },
      ],
      runtime: 127,
      status: 'Released',
      tagline: 'Seven deadly sins. Seven ways to die.',
      spoken_languages: [
        { english_name: 'English', iso_639_1: 'en', name: 'English' },
      ],
    };
    const providerPayload = {
      results: {
        US: {
          link: 'https://www.themoviedb.org/movie/7/watch',
          flatrate: [
            {
              provider_id: 8,
              provider_name: 'Netflix',
              logo_path: '/netflix.png',
            },
          ],
        },
      },
    };

    mockFetchTmdbWithProxy.mockImplementation((url) => {
      if (url.includes('/3/movie/7/watch/providers')) {
        return Promise.reject(new Error('providers offline'));
      }

      if (url.includes('/3/movie/7')) {
        return Promise.resolve(moviePayload);
      }

      throw new Error(`Unexpected url: ${url}`);
    });

    await TestRenderer.act(async () => {
      TestRenderer.create(
        React.createElement(TitleDetailProbe, {
          kind: 'movie',
          tmdbId: 7,
        }),
      );
      await flush();
    });

    expect(latestHookValue.error).toBeNull();
    expect(latestHookValue.title).toMatchObject({
      tmdbId: 7,
      kind: 'movie',
      title: 'Se7en',
      year: 1995,
      language: 'English',
      duration: '2h 7m',
      synopsis: moviePayload.overview,
      providers: [],
    });
    expect(latestHookValue.providers.items).toEqual([]);
    expect(latestHookValue.providers.error).toBeTruthy();
    expect(latestHookValue.providers.error.name).toBe('Error');
    expect(latestHookValue.providers.error.message).toBe('providers offline');
    expect(typeof latestHookValue.providers.retry).toBe('function');

    const scopedProviderLink = {
      platform: 'Netflix',
      url: 'https://www.netflix.com/search?q=Se7en',
      browserUrl: 'https://www.netflix.com/search?q=Se7en',
      appUrl: 'nflx://www.netflix.com/search?q=Se7en',
      availableIn: 'USA',
      logoPath: '/netflix.png',
    };

    mockFetchTmdbWithProxy.mockImplementation((url) => {
      if (url.includes('/3/movie/7/watch/providers')) {
        return Promise.resolve(providerPayload);
      }

      if (url.includes('/3/movie/7')) {
        return Promise.resolve(moviePayload);
      }

      throw new Error(`Unexpected url: ${url}`);
    });
    mockProvidersToLinks.mockReturnValue([scopedProviderLink]);

    await TestRenderer.act(async () => {
      await latestHookValue.providers.retry();
    });

    expect(latestHookValue.error).toBeNull();
    expect(latestHookValue.title).toMatchObject({
      tmdbId: 7,
      title: 'Se7en',
      providers: [scopedProviderLink],
    });
    expect(latestHookValue.providers.items).toEqual([scopedProviderLink]);
    expect(latestHookValue.providers.error).toBeNull();
  });
});
