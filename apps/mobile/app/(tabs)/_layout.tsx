import type { ComponentProps, ReactNode } from 'react'
import { useMemo } from 'react'
import { Tabs } from 'expo-router'
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs'
import { Ionicons } from '@expo/vector-icons'
import { TabBar, theme, type TabItem } from '@aechak/design-system/native'

type IoniconsName = ComponentProps<typeof Ionicons>['name']

function makeTabIcon(active: IoniconsName, inactive: IoniconsName) {
  return (isActive: boolean) => (
    <Ionicons
      name={isActive ? active : inactive}
      size={24}
      color={isActive ? theme.colors.brand : theme.colors.textTertiary}
    />
  )
}

const TAB_ICONS: Record<string, (isActive: boolean) => ReactNode> = {
  index: makeTabIcon('home', 'home-outline'),
  'market/index': makeTabIcon('storefront', 'storefront-outline'),
  'sns/index': makeTabIcon('people', 'people-outline'),
  'chat/index': makeTabIcon('chatbubbles', 'chatbubbles-outline'),
  'mypage/index': makeTabIcon('person', 'person-outline'),
}

function AppTabBar({ state, descriptors, navigation, insets }: BottomTabBarProps) {
  const tabs: TabItem[] = useMemo(
    () =>
      state.routes.map(route => ({
        key: route.name,
        label: (descriptors[route.key]?.options.title as string | undefined) ?? route.name,
        icon: TAB_ICONS[route.name] ?? (() => null),
      })),
    [state.routes, descriptors],
  )

  return (
    <TabBar
      tabs={tabs}
      activeKey={state.routes[state.index]?.name ?? ''}
      onSelect={(key: string) => navigation.navigate(key)}
      bottomInset={insets.bottom}
    />
  )
}

export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props: BottomTabBarProps) => <AppTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tabs.Screen name="index" options={{ title: '홈' }} />
      <Tabs.Screen name="market/index" options={{ title: '마켓' }} />
      <Tabs.Screen name="sns/index" options={{ title: 'SNS' }} />
      <Tabs.Screen name="chat/index" options={{ title: '채팅' }} />
      <Tabs.Screen name="mypage/index" options={{ title: '마이' }} />
    </Tabs>
  )
}
