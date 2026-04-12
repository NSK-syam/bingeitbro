// @ts-nocheck
const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const Module = require('module');

const mockSignInAsync = jest.fn();
const mockRandomUUID = jest.fn(() => 'raw-nonce');
const mockDigestStringAsync = jest.fn(() => Promise.resolve('hashed-nonce'));

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
    if (request === 'expo-apple-authentication') {
      return {
        AppleAuthenticationScope: {
          EMAIL: 'EMAIL',
          FULL_NAME: 'FULL_NAME',
        },
        isAvailableAsync: jest.fn(() => Promise.resolve(true)),
        signInAsync: mockSignInAsync,
      };
    }

    if (request === 'expo-crypto') {
      return {
        CryptoDigestAlgorithm: {
          SHA256: 'SHA256',
        },
        digestStringAsync: mockDigestStringAsync,
        randomUUID: mockRandomUUID,
      };
    }

    if (request.endsWith('/http')) {
      return {
        httpRequest: jest.fn(),
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

const { signInWithAppleAsync } = loadTranspiledModule(
  path.join(__dirname, '..', 'apple-auth.ts'),
);

describe('signInWithAppleAsync', () => {
  beforeEach(() => {
    mockSignInAsync.mockReset();
    mockRandomUUID.mockClear();
    mockDigestStringAsync.mockClear();
    mockSignInAsync.mockResolvedValue({
      authorizationCode: 'auth-code',
      email: 'syam@example.com',
      fullName: {
        givenName: 'Syam',
        familyName: 'Kumar',
        middleName: null,
      },
      identityToken: 'identity-token',
      user: 'apple-user-id',
    });
  });

  it('passes a hashed nonce to Apple and returns the raw nonce for Supabase verification', async () => {
    const result = await signInWithAppleAsync();

    expect(mockDigestStringAsync).toHaveBeenCalledWith('SHA256', 'raw-nonce');
    expect(mockSignInAsync).toHaveBeenCalledWith({
      requestedScopes: ['EMAIL', 'FULL_NAME'],
      nonce: 'hashed-nonce',
    });
    expect(result.nonce).toBe('raw-nonce');
    expect(result.identityToken).toBe('identity-token');
  });
});
