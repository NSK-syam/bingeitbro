import {
  createContext,
  useContext,
  useMemo,
  type PropsWithChildren,
} from 'react';

const { AuthProvider } = require('./AuthProvider') as {
  AuthProvider: React.ComponentType<PropsWithChildren>;
};
const { WatchlistProvider } = require('../hooks/useWatchlist') as {
  WatchlistProvider: React.ComponentType<PropsWithChildren>;
};
const { useSession } = require('../hooks/useSession') as {
  useSession: () => {
    loading: boolean;
    session?: { access_token?: string | null } | null;
    user?: { id?: string | null } | null;
  };
};

type AppContextValue = {
  isAuthLoading: boolean;
  isAuthenticated: boolean;
};

const AppContext = createContext<AppContextValue | undefined>(undefined);

function AppStateBridge({ children }: PropsWithChildren) {
  const { loading, session, user } = useSession();

  const value = useMemo<AppContextValue>(
    () => ({
      isAuthLoading: loading,
      isAuthenticated: Boolean(session?.access_token && user?.id),
    }),
    [loading, session?.access_token, user?.id],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function AppProviders({ children }: PropsWithChildren) {
  return (
    <AuthProvider>
      <WatchlistProvider>
        <AppStateBridge>{children}</AppStateBridge>
      </WatchlistProvider>
    </AuthProvider>
  );
}

export function useAppState() {
  const value = useContext(AppContext);

  if (!value) {
    throw new Error('useAppState must be used inside AppProviders');
  }

  return value;
}
