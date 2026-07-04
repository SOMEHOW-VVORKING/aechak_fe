import type { ReactNode } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { theme } from '../theme'

export interface CardProps {
  children: ReactNode
  selected?: boolean
  padding?: 'none' | 'md'
  onPress?: () => void
}

export function Card({ children, selected, padding = 'none', onPress }: CardProps) {
  const isInteractive = !!onPress
  const style = [
    styles.base,
    { borderColor: selected ? theme.colors.brandBorder : theme.colors.borderSubtle },
    padding === 'md' && styles.padded,
  ]

  if (isInteractive) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [...style, pressed && styles.pressed]}
        accessibilityRole="button"
      >
        {children}
      </Pressable>
    )
  }

  return <View style={style}>{children}</View>
}

const styles = StyleSheet.create({
  base: {
    borderRadius: theme.radius.card,
    borderWidth: 1,
    backgroundColor: theme.colors.surface,
  },
  padded: {
    padding: 14,
  },
  pressed: {
    backgroundColor: theme.colors.surfaceHover,
  },
})
