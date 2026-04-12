import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StyleSheet } from 'react-native';
import { DiscoverStack } from './DiscoverStack';
import { WatchlistScreen } from '../screens/watchlist/WatchlistScreen';
import { ProfileScreen } from '../screens/profile/ProfileScreen';
import type { MainTabParamList } from './types';

const Tab = createBottomTabNavigator<MainTabParamList>();

export function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        sceneStyle: styles.scene,
        tabBarActiveTintColor: '#f97316',
        tabBarInactiveTintColor: '#94a3b8',
        tabBarStyle: styles.tabBar,
      }}
    >
      <Tab.Screen component={DiscoverStack} name="DiscoverTab" options={{ title: 'Discover' }} />
      <Tab.Screen component={WatchlistScreen} name="Watchlist" />
      <Tab.Screen component={ProfileScreen} name="Profile" />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  scene: {
    backgroundColor: '#020617',
  },
  tabBar: {
    backgroundColor: '#020617',
    borderTopColor: '#1e293b',
    height: 64,
    paddingBottom: 8,
    paddingTop: 8,
  },
});
