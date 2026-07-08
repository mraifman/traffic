import React from 'react';
import { Platform, StyleSheet, useColorScheme, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { isLiquidGlassAvailable } from 'expo-glass-effect';
import { Tabs } from 'expo-router';
import { Icon, Label, NativeTabs } from 'expo-router/unstable-native-tabs';
import { SymbolView } from 'expo-symbols';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

function NativeTabLayout() {
  return (
    <NativeTabs>
      <NativeTabs.Trigger name="index">
        <Icon sf={{ default: 'camera', selected: 'camera.fill' }} />
        <Label>Counter</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="sessions">
        <Icon sf={{ default: 'list.bullet.clipboard', selected: 'list.bullet.clipboard.fill' }} />
        <Label>Sessions</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="setup">
        <Icon sf={{ default: 'gear', selected: 'gear.circle.fill' }} />
        <Label>Setup</Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

function ClassicTabLayout() {
  const c = useColors();
  const isDark = true; // app is always dark
  const isIOS = Platform.OS === 'ios';
  const isWeb = Platform.OS === 'web';

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.primary,
        tabBarInactiveTintColor: c.mutedForeground,
        tabBarStyle: {
          position: 'absolute',
          backgroundColor: isIOS ? 'transparent' : c.background,
          borderTopWidth: isWeb ? 1 : StyleSheet.hairlineWidth,
          borderTopColor: c.border,
          elevation: 0,
          ...(isWeb ? { height: 84 } : {}),
        },
        tabBarBackground: () =>
          isIOS ? (
            <BlurView
              intensity={80}
              tint="dark"
              style={StyleSheet.absoluteFill}
            />
          ) : isWeb ? (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: c.background }]} />
          ) : null,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Counter',
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="camera" tintColor={color} size={24} />
            ) : (
              <Feather name="camera" size={22} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="sessions"
        options={{
          title: 'Sessions',
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="list.bullet.clipboard" tintColor={color} size={24} />
            ) : (
              <MaterialCommunityIcons name="clipboard-list-outline" size={22} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="setup"
        options={{
          title: 'Setup',
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="gear" tintColor={color} size={24} />
            ) : (
              <Feather name="settings" size={22} color={color} />
            ),
        }}
      />
    </Tabs>
  );
}

export default function TabLayout() {
  if (isLiquidGlassAvailable()) {
    return <NativeTabLayout />;
  }
  return <ClassicTabLayout />;
}
