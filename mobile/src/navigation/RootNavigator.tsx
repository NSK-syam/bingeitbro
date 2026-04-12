import { DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { LoadingState } from '../components/common/LoadingState';
import { useAppState } from '../providers/AppProviders';
import { AuthNavigator } from './AuthNavigator';
import { MainTabs } from './MainTabs';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

const navigationTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: '#020617',
    border: '#1e293b',
    card: '#020617',
    notification: '#f97316',
    primary: '#f97316',
    text: '#f8fafc',
  },
};

export function RootNavigator() {
  const { isAuthLoading, isAuthenticated } = useAppState();

  if (isAuthLoading) {
    return <LoadingState label="Preparing native app shell..." />;
  }

  return (
    <NavigationContainer theme={navigationTheme}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {isAuthenticated ? (
          <Stack.Screen component={MainTabs} name="Main" />
        ) : (
          <Stack.Screen component={AuthNavigator} name="Auth" />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
