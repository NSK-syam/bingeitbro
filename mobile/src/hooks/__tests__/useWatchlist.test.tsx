// @ts-nocheck
const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const Module = require('module');
const React = require('react');
const TestRenderer = require('react-test-renderer');

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const originalConsoleError = console.error;

const compilerOptions = {
  esModuleInterop: true,
  jsx: ts.JsxEmit.React,
  module: ts.ModuleKind.CommonJS,
  target: ts.ScriptTarget.ES2020,
};

const mockListWatchlist = jest.fn();
const mockAddWatchlistItem = jest.fn();
const mockRemoveWatchlistItem = jest.fn();
const mockUseSession = jest.fn();

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

    if (request === '../lib/watchlist') {
      return {
        addWatchlistItem: (...args) => mockAddWatchlistItem(...args),
        listWatchlist: (...args) => mockListWatchlist(...args),
        removeWatchlistItem: (...args) => mockRemoveWatchlistItem(...args),
      };
    }

    if (request === './useSession') {
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

const { useWatchlistState } = loadTranspiledModule(
  path.join(__dirname, '..', 'useWatchlist.ts'),
);

async function flush() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function createDeferred() {
  let resolve;
  let reject;

  const promise = new Promise((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });

  return { promise, reject, resolve };
}

let latestHookValue = null;
let consoleErrorSpy;
let sessionState;

function WatchlistProbe() {
  latestHookValue = useWatchlistState();
  return React.createElement('watchlist-probe', {
    state: latestHookValue.loading ? 'loading' : 'ready',
  });
}

describe('useWatchlist', () => {
  const arrival = {
    addedAt: '2026-03-20T12:00:00.000Z',
    id: 'entry-arrival',
    mediaType: 'movie',
    posterPath: '/arrival.jpg',
    title: 'Arrival',
    tmdbId: 101,
  };

  beforeEach(() => {
    latestHookValue = null;
    mockListWatchlist.mockReset();
    mockAddWatchlistItem.mockReset();
    mockRemoveWatchlistItem.mockReset();
    mockUseSession.mockReset();
    sessionState = {
      loading: false,
      session: {
        access_token: 'session-token',
      },
    };
    mockUseSession.mockImplementation(() => sessionState);
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

  it('loads the authenticated watchlist on mount', async () => {
    mockListWatchlist.mockResolvedValueOnce([arrival]);

    await TestRenderer.act(async () => {
      TestRenderer.create(React.createElement(WatchlistProbe));
      await flush();
      await flush();
    });

    expect(mockListWatchlist).toHaveBeenCalledWith('session-token');
    expect(latestHookValue.items).toEqual([arrival]);
    expect(latestHookValue.error).toBeNull();
    expect(latestHookValue.loading).toBe(false);
  });

  it('unwraps wrapped watchlist responses returned by the backend contract', async () => {
    mockListWatchlist.mockResolvedValueOnce({ items: [arrival] });

    await TestRenderer.act(async () => {
      TestRenderer.create(React.createElement(WatchlistProbe));
      await flush();
      await flush();
    });

    expect(latestHookValue.items).toEqual([arrival]);
    expect(Array.isArray(latestHookValue.items)).toBe(true);
    expect(latestHookValue.error).toBeNull();
  });

  it('adds an item optimistically and replaces it with the saved row on success', async () => {
    mockListWatchlist.mockResolvedValueOnce([arrival]);

    const severanceDraft = {
      mediaType: 'tv',
      posterPath: '/severance.jpg',
      title: 'Severance',
      tmdbId: 202,
    };
    const severanceSaved = {
      addedAt: '2026-03-21T12:00:00.000Z',
      id: 'entry-severance',
      ...severanceDraft,
    };

    let resolveAdd;
    mockAddWatchlistItem.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveAdd = resolve;
        }),
    );

    await TestRenderer.act(async () => {
      TestRenderer.create(React.createElement(WatchlistProbe));
      await flush();
      await flush();
    });

    let addPromise;

    await TestRenderer.act(async () => {
      addPromise = latestHookValue.addItem(severanceDraft);
      await flush();
    });

    expect(latestHookValue.items[0]).toMatchObject(severanceDraft);
    expect(String(latestHookValue.items[0].id)).toContain('optimistic');
    expect(latestHookValue.items[1]).toEqual(arrival);

    await TestRenderer.act(async () => {
      resolveAdd(severanceSaved);
      await addPromise;
      await flush();
    });

    expect(mockAddWatchlistItem).toHaveBeenCalledWith('session-token', severanceDraft);
    expect(latestHookValue.items).toEqual([severanceSaved, arrival]);
    expect(latestHookValue.error).toBeNull();
  });

  it('collapses duplicate optimistic saves when the backend returns the same persisted row', async () => {
    mockListWatchlist.mockResolvedValueOnce([]);

    const duneDraft = {
      mediaType: 'movie',
      posterPath: '/dune.jpg',
      title: 'Dune',
      tmdbId: 303,
    };
    const duneSaved = {
      addedAt: '2026-03-22T12:00:00.000Z',
      id: 'entry-dune',
      ...duneDraft,
    };

    const firstAdd = createDeferred();
    const secondAdd = createDeferred();
    mockAddWatchlistItem
      .mockImplementationOnce(() => firstAdd.promise)
      .mockImplementationOnce(() => secondAdd.promise);

    await TestRenderer.act(async () => {
      TestRenderer.create(React.createElement(WatchlistProbe));
      await flush();
      await flush();
    });

    let firstPromise;
    let secondPromise;

    await TestRenderer.act(async () => {
      firstPromise = latestHookValue.addItem(duneDraft);
      secondPromise = latestHookValue.addItem(duneDraft);
      await flush();
    });

    expect(latestHookValue.items).toHaveLength(2);
    expect(latestHookValue.items[0]).toMatchObject(duneDraft);
    expect(latestHookValue.items[1]).toMatchObject(duneDraft);

    await TestRenderer.act(async () => {
      firstAdd.resolve({ item: duneSaved });
      await firstPromise;
      await flush();
    });

    expect(latestHookValue.items).toEqual([duneSaved]);

    await TestRenderer.act(async () => {
      secondAdd.resolve({ item: duneSaved });
      await secondPromise;
      await flush();
    });

    expect(latestHookValue.items).toEqual([duneSaved]);
  });

  it('rolls back an optimistic add when the save fails', async () => {
    mockListWatchlist.mockResolvedValueOnce([arrival]);

    const interstellarDraft = {
      mediaType: 'movie',
      posterPath: '/interstellar.jpg',
      title: 'Interstellar',
      tmdbId: 303,
    };

    let rejectAdd;
    mockAddWatchlistItem.mockImplementation(
      () =>
        new Promise((_, reject) => {
          rejectAdd = reject;
        }),
    );

    await TestRenderer.act(async () => {
      TestRenderer.create(React.createElement(WatchlistProbe));
      await flush();
      await flush();
    });

    let addPromise;

    await TestRenderer.act(async () => {
      addPromise = latestHookValue.addItem(interstellarDraft);
      await flush();
    });

    expect(latestHookValue.items[0]).toMatchObject(interstellarDraft);

    await TestRenderer.act(async () => {
      rejectAdd(new Error('save failed'));
      await expect(addPromise).rejects.toThrow('save failed');
      await flush();
    });

    expect(latestHookValue.items).toEqual([arrival]);
    expect(latestHookValue.error).toBeTruthy();
    expect(latestHookValue.error.message).toBe('save failed');
  });

  it('keeps optimistic add state when a stale refresh resolves afterwards', async () => {
    const createDeferredRefresh = createDeferred();
    mockListWatchlist
      .mockResolvedValueOnce({ items: [arrival] })
      .mockImplementationOnce(() => createDeferredRefresh.promise);

    const createDeferredAdd = createDeferred();
    const severanceDraft = {
      mediaType: 'tv',
      posterPath: '/severance.jpg',
      title: 'Severance',
      tmdbId: 202,
    };
    const severanceSaved = {
      addedAt: '2026-03-21T12:00:00.000Z',
      id: 'entry-severance',
      ...severanceDraft,
    };

    mockAddWatchlistItem.mockImplementation(() => createDeferredAdd.promise);

    await TestRenderer.act(async () => {
      TestRenderer.create(React.createElement(WatchlistProbe));
      await flush();
      await flush();
    });

    let refreshPromise;
    let addPromise;

    await TestRenderer.act(async () => {
      refreshPromise = latestHookValue.refresh();
      await flush();
    });

    await TestRenderer.act(async () => {
      addPromise = latestHookValue.addItem(severanceDraft);
      await flush();
    });

    expect(latestHookValue.items[0]).toMatchObject(severanceDraft);
    expect(latestHookValue.items[1]).toEqual(arrival);

    await TestRenderer.act(async () => {
      createDeferredRefresh.resolve({ items: [arrival] });
      await refreshPromise;
      await flush();
    });

    expect(latestHookValue.items[0]).toMatchObject(severanceDraft);
    expect(latestHookValue.items[1]).toEqual(arrival);

    await TestRenderer.act(async () => {
      createDeferredAdd.resolve({ item: severanceSaved });
      await addPromise;
      await flush();
    });

    expect(latestHookValue.items).toEqual([severanceSaved, arrival]);
  });

  it('does not let a stale load repopulate items after logout', async () => {
    const deferredList = createDeferred();
    mockListWatchlist.mockImplementationOnce(() => deferredList.promise);

    let renderer;

    await TestRenderer.act(async () => {
      renderer = TestRenderer.create(React.createElement(WatchlistProbe));
      await flush();
    });

    expect(latestHookValue.loading).toBe(true);

    await TestRenderer.act(async () => {
      sessionState = {
        loading: false,
        session: null,
      };
      renderer.update(React.createElement(WatchlistProbe));
      await flush();
    });

    expect(latestHookValue.items).toEqual([]);
    expect(latestHookValue.loading).toBe(false);

    await TestRenderer.act(async () => {
      deferredList.resolve({ items: [arrival] });
      await deferredList.promise;
      await flush();
    });

    expect(latestHookValue.items).toEqual([]);
    expect(latestHookValue.error).toBeNull();
  });

  it('keeps newer optimistic items ahead of a rolled back remove', async () => {
    const severance = {
      addedAt: '2026-03-21T12:00:00.000Z',
      id: 'entry-severance',
      mediaType: 'tv',
      posterPath: '/severance.jpg',
      title: 'Severance',
      tmdbId: 202,
    };
    mockListWatchlist.mockResolvedValueOnce({ items: [arrival, severance] });

    const deferredRemove = createDeferred();
    const deferredAdd = createDeferred();
    const duneDraft = {
      mediaType: 'movie',
      posterPath: '/dune.jpg',
      title: 'Dune',
      tmdbId: 303,
    };
    const duneSaved = {
      addedAt: '2026-03-22T12:00:00.000Z',
      id: 'entry-dune',
      ...duneDraft,
    };

    mockRemoveWatchlistItem.mockImplementation(() => deferredRemove.promise);
    mockAddWatchlistItem.mockImplementation(() => deferredAdd.promise);

    await TestRenderer.act(async () => {
      TestRenderer.create(React.createElement(WatchlistProbe));
      await flush();
      await flush();
    });

    let removePromise;
    let addPromise;

    await TestRenderer.act(async () => {
      removePromise = latestHookValue.removeItem(arrival.id);
      await flush();
    });

    await TestRenderer.act(async () => {
      addPromise = latestHookValue.addItem(duneDraft);
      await flush();
    });

    expect(latestHookValue.items[0]).toMatchObject(duneDraft);
    expect(latestHookValue.items[1]).toEqual(severance);

    await TestRenderer.act(async () => {
      deferredRemove.reject(new Error('delete failed'));
      await expect(removePromise).rejects.toThrow('delete failed');
      await flush();
    });

    expect(latestHookValue.items[0]).toMatchObject(duneDraft);
    expect(latestHookValue.items[1]).toEqual(arrival);
    expect(latestHookValue.items[2]).toEqual(severance);

    await TestRenderer.act(async () => {
      deferredAdd.resolve({ item: duneSaved });
      await addPromise;
      await flush();
    });

    expect(latestHookValue.items).toEqual([duneSaved, arrival, severance]);
  });

  it('removes an item optimistically and keeps it removed on success', async () => {
    const severance = {
      addedAt: '2026-03-21T12:00:00.000Z',
      id: 'entry-severance',
      mediaType: 'tv',
      posterPath: '/severance.jpg',
      title: 'Severance',
      tmdbId: 202,
    };
    mockListWatchlist.mockResolvedValueOnce({ items: [arrival, severance] });

    const deferredRemove = createDeferred();
    mockRemoveWatchlistItem.mockImplementation(() => deferredRemove.promise);

    await TestRenderer.act(async () => {
      TestRenderer.create(React.createElement(WatchlistProbe));
      await flush();
      await flush();
    });

    let removePromise;

    await TestRenderer.act(async () => {
      removePromise = latestHookValue.removeItem(arrival.id);
      await flush();
    });

    expect(latestHookValue.items).toEqual([severance]);
    expect(latestHookValue.pendingIds).toEqual([arrival.id]);

    await TestRenderer.act(async () => {
      deferredRemove.resolve({ ok: true });
      await removePromise;
      await flush();
    });

    expect(mockRemoveWatchlistItem).toHaveBeenCalledWith('session-token', arrival.id);
    expect(latestHookValue.items).toEqual([severance]);
    expect(latestHookValue.pendingIds).toEqual([]);
    expect(latestHookValue.error).toBeNull();
  });

  it('rolls back an optimistic remove when the delete fails', async () => {
    const severance = {
      addedAt: '2026-03-21T12:00:00.000Z',
      id: 'entry-severance',
      mediaType: 'tv',
      posterPath: '/severance.jpg',
      title: 'Severance',
      tmdbId: 202,
    };
    mockListWatchlist.mockResolvedValueOnce([arrival, severance]);

    let rejectRemove;
    mockRemoveWatchlistItem.mockImplementation(
      () =>
        new Promise((_, reject) => {
          rejectRemove = reject;
        }),
    );

    await TestRenderer.act(async () => {
      TestRenderer.create(React.createElement(WatchlistProbe));
      await flush();
      await flush();
    });

    let removePromise;

    await TestRenderer.act(async () => {
      removePromise = latestHookValue.removeItem(arrival.id);
      await flush();
    });

    expect(latestHookValue.items).toEqual([severance]);

    await TestRenderer.act(async () => {
      rejectRemove(new Error('delete failed'));
      await expect(removePromise).rejects.toThrow('delete failed');
      await flush();
    });

    expect(mockRemoveWatchlistItem).toHaveBeenCalledWith('session-token', arrival.id);
    expect(latestHookValue.items).toEqual([arrival, severance]);
    expect(latestHookValue.error).toBeTruthy();
    expect(latestHookValue.error.message).toBe('delete failed');
  });
});
