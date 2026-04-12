import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { LoginScreen } from '../screens/auth/LoginScreen';
import { ResetPasswordScreen } from '../screens/auth/ResetPasswordScreen';
import { SignupScreen } from '../screens/auth/SignupScreen';
import type { AuthStackParamList } from './types';

const Stack = createNativeStackNavigator<AuthStackParamList>();

export function AuthNavigator() {
  return (
    <Stack.Navigator
      initialRouteName="Login"
      screenOptions={{
        animation: 'slide_from_right',
        contentStyle: { backgroundColor: '#020617' },
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen component={LoginScreen} name="Login" options={{ title: 'Login' }} />
      <Stack.Screen component={SignupScreen} name="Signup" options={{ title: 'Create account' }} />
      <Stack.Screen
        component={ResetPasswordScreen}
        name="ResetPassword"
        options={{ title: 'Reset password' }}
      />
    </Stack.Navigator>
  );
}
