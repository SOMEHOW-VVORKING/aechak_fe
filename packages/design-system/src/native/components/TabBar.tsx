import { type ReactNode } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { theme } from '../theme'

export interface TabItem {
  key: string
  label: string
  icon: (isActive: boolean) => ReactNode
}

export interface TabBarProps {
  tabs: TabItem[]
  activeKey: string
  onSelect: (key: string) => void
  bottomInset?: number
}

export function TabBar({ tabs, activeKey, onSelect, bottomInset = 0 }: TabBarProps) {
  return (
    <View style={[styles.container, { paddingBottom: bottomInset + 8 }]}>
      {tabs.map(tab => {
        const isActive = tab.key === activeKey
        return (
          <Pressable
            key={tab.key}
            style={styles.item}
            onPress={() => onSelect(tab.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={tab.label}
            hitSlop={4}
          >
            <View style={isActive ? styles.iconActive : styles.icon}>
              {tab.icon(isActive)}
            </View>
            <Text style={[styles.label, isActive && styles.labelActive]}>
              {tab.label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: theme.colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.borderSubtle,
    paddingTop: 8,
  },
  item: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
  },
  icon: {
    opacity: 1,
    tintColor: theme.colors.textTertiary,
  },
  iconActive: {
    opacity: 1,
    tintColor: theme.colors.brand,
  },
  label: {
    fontSize: theme.typography.fontSize.badge,
    color: theme.colors.textTertiary,
    letterSpacing: 0,
  },
  labelActive: {
    color: theme.colors.brand,
    fontWeight: theme.typography.fontWeight.semibold,
  },
})
