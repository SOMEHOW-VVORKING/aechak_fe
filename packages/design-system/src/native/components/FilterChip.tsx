import { type ReactNode } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { theme } from '../theme'

export interface FilterChipProps {
  label: string
  selected?: boolean
  onPress?: () => void
  icon?: ReactNode
}

export function FilterChip({ label, selected = false, onPress, icon }: FilterChipProps) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, selected && styles.chipSelected]}
      accessibilityRole="button"
      accessibilityState={{ selected }}
    >
      {icon && <View>{icon}</View>}
      <Text style={[styles.label, selected && styles.labelSelected]}>{label}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    height: 34,
    paddingHorizontal: 12,
    borderRadius: theme.radius.chip,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.borderDefault,
  },
  chipSelected: {
    backgroundColor: theme.colors.brandSubtle,
    borderColor: '#A8D8C4',
  },
  label: {
    fontSize: theme.typography.fontSize.label,
    color: theme.colors.textSecondary,
  },
  labelSelected: {
    color: theme.colors.brand,
    fontWeight: theme.typography.fontWeight.semibold,
  },
})
