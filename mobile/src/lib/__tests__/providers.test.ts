// @ts-nocheck
const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const Module = require('module');

const compilerOptions = {
  esModuleInterop: true,
  module: ts.ModuleKind.CommonJS,
  target: ts.ScriptTarget.ES2020,
};

const transpiledModuleCache = new Map();

function resolveRelativeModule(parentFilename, request) {
  const absoluteBase = path.resolve(path.dirname(parentFilename), request);
  const candidates = [
    absoluteBase,
    `${absoluteBase}.ts`,
    path.join(absoluteBase, 'index.ts'),
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
    if (request === './tmdb-proxy') {
      return {
        buildTmdbV3Url: jest.fn(),
        fetchTmdbWithProxy: jest.fn(),
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

const { tmdbWatchProvidersToOttLinks } = loadTranspiledModule(
  path.join(__dirname, '..', 'providers.ts'),
);

describe('tmdbWatchProvidersToOttLinks', () => {
  it('maps OTT provider payloads into deduped launch links across supported regions', () => {
    const samplePayload = {
      results: {
        IN: {
          link: 'https://www.themoviedb.org/movie/123/watch',
          flatrate: [
            {
              provider_id: 8,
              provider_name: 'Netflix',
              logo_path: '/netflix.png',
            },
            {
              provider_id: 119,
              provider_name: 'Prime Video',
              logo_path: '/prime.png',
            },
          ],
        },
        US: {
          link: 'https://www.themoviedb.org/movie/123/watch',
          flatrate: [
            {
              provider_id: 8,
              provider_name: 'Netflix Standard with Ads',
              logo_path: '/netflix-us.png',
            },
          ],
          buy: [
            {
              provider_id: 2,
              provider_name: 'Apple TV',
              logo_path: '/apple.png',
            },
          ],
        },
      },
    };

    const links = tmdbWatchProvidersToOttLinks(samplePayload, 'Inception');

    expect(links).toEqual([
      expect.objectContaining({
        platform: 'Netflix',
        availableIn: 'India & USA',
        logoPath: '/netflix.png',
        browserUrl: 'https://www.netflix.com/search?q=Inception',
        appUrl: 'nflx://www.netflix.com/search?q=Inception',
        url: 'https://www.netflix.com/search?q=Inception',
      }),
      expect.objectContaining({
        platform: 'Prime Video',
        availableIn: 'India',
        browserUrl: 'https://www.primevideo.com/search?phrase=Inception',
        appUrl: 'https://app.primevideo.com/search?phrase=Inception',
      }),
      expect.objectContaining({
        platform: 'Apple TV',
        availableIn: 'USA',
        browserUrl: 'https://tv.apple.com/search?term=Inception',
        appUrl: 'https://tv.apple.com/search?term=Inception',
      }),
    ]);
  });
});
