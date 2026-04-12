import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StyleSheet } from 'react-native';

import { MovieDetailScreen } from '../screens/detail/MovieDetailScreen';
import { ShowDetailScreen } from '../screens/detail/ShowDetailScreen';
import { DiscoverScreen } from '../screens/discover/DiscoverScreen';
import type { DiscoverStackParamList } from './types';

const Stack = createNativeStackNavigator<DiscoverStackParamList>();

export function DiscoverStack() {
  return (
    <Stack.Navigator
      initialRouteName="Discover"
      screenOptions={{
        animation: 'slide_from_right',
        contentStyle: styles.navigatorContent,
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen component={DiscoverScreen} name="Discover" options={{ title: 'Discover' }} />
      <Stack.Screen component={MovieDetailScreen} name="MovieDetail" options={{ title: 'Movie detail' }} />
      <Stack.Screen component={ShowDetailScreen} name="ShowDetail" options={{ title: 'Show detail' }} />
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({
  navigatorContent: {
    backgroundColor: '#020617',
  },
});
