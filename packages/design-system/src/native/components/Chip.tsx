import type { ReactNode } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { theme } from '../theme'

export type ChipVariant = 'default' | 'outline' | 'brand'

export interface ChipProps {
  label: string
  variant?: ChipVariant
  icon?: ReactNode
  disabled?: boolean
  onPress?: () => void
}

const variantStyle: Record<ChipVariant, { bg: string; fg: string; border?: string }> = {
  default: { bg: theme.colors.surfaceSunken, fg: theme.colors.textSecondary },
  outline: { bg: 'transparent', fg: theme.colors.textSecondary, border: theme.colors.borderDefault },
  brand: { bg: 'transparent', fg: theme.colors.brand, border: theme.colors.brandBorder },
}

export function Chip({ label, variant = 'default', icon, disabled, onPress }: ChipProps) {
  const v = variantStyle[variant]
  const style = [
    styles.chip,
    { backgroundColor: v.bg, borderColor: v.border, borderWidth: v.border ? 1 : 0 },
    disabled && styles.disabled,
  ]

  const content = (
    <>
      {icon && <View>{icon}</View>}
      <Text style={[styles.label, { color: v.fg }]}>{label}</Text>
    </>
  )

  if (onPress) {
    return (
      <Pressable
        onPress={disabled ? undefined : onPress}
        disabled={disabled}
        style={style}
        accessibilityRole="button"
      >
        {content}
      </Pressable>
    )
  }

  return <View style={style}>{content}</View>
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 28,
    paddingHorizontal: 12,
    borderRadius: theme.radius.chip,
    alignSelf: 'flex-start',
  },
  disabled: {
    opacity: 0.5,
  },
  label: {
    fontSize: theme.typography.fontSize.label,
    fontWeight: theme.typography.fontWeight.medium,
  },
})
