import { StyleSheet, Text, View } from 'react-native'
import { theme } from '../theme'

export interface BadgeProps {
  count?: number
  dot?: boolean
  max?: number
}

export function Badge({ count, dot = false, max = 99 }: BadgeProps) {
  if (dot) {
    return <View style={styles.dot} accessibilityElementsHidden />
  }
  if (count == null || count <= 0) return null

  return (
    <View style={styles.badge}>
      <Text style={styles.label}>{count > max ? `${max}+` : count}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.accent,
  },
  badge: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 6,
    borderRadius: 10,
    backgroundColor: theme.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: theme.typography.fontSize.badge,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.onAccent,
  },
})
