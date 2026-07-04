import type { ReactNode } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { theme } from '../theme'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md' | 'lg'

export interface ButtonProps {
  variant?: ButtonVariant
  size?: ButtonSize
  fullWidth?: boolean
  loading?: boolean
  disabled?: boolean
  leftIcon?: ReactNode
  rightIcon?: ReactNode
  onPress?: () => void
  children: ReactNode
}

const variantStyle: Record<ButtonVariant, { bg: string; fg: string; border?: string }> = {
  primary: { bg: theme.colors.brand, fg: theme.colors.onBrand },
  secondary: { bg: theme.colors.surface, fg: theme.colors.textPrimary, border: theme.colors.borderDefault },
  ghost: { bg: 'transparent', fg: theme.colors.textPrimary },
  danger: { bg: theme.colors.dangerFg, fg: theme.colors.white },
}

const sizeStyle: Record<ButtonSize, { height: number; paddingHorizontal: number; fontSize: number; gap: number }> = {
  sm: { height: 32, paddingHorizontal: 12, fontSize: theme.typography.fontSize.label, gap: 6 },
  md: { height: 40, paddingHorizontal: 16, fontSize: theme.typography.fontSize.button, gap: 8 },
  lg: { height: 48, paddingHorizontal: 24, fontSize: theme.typography.fontSize.button, gap: 10 },
}

export function Button({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  loading = false,
  disabled = false,
  leftIcon,
  rightIcon,
  onPress,
  children,
}: ButtonProps) {
  const v = variantStyle[variant]
  const s = sizeStyle[size]
  const isDisabled = disabled || loading

  return (
    <Pressable
      onPress={isDisabled ? undefined : onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: isDisabled ? theme.colors.surfaceDisabled : v.bg,
          borderColor: v.border,
          borderWidth: v.border ? 1 : 0,
          height: s.height,
          paddingHorizontal: s.paddingHorizontal,
          gap: s.gap,
          opacity: pressed && !isDisabled ? 0.85 : 1,
        },
        fullWidth && styles.fullWidth,
      ]}
    >
      {loading && (
        <ActivityIndicator size="small" color={isDisabled ? theme.colors.textDisabled : v.fg} />
      )}
      {!loading && leftIcon && <View>{leftIcon}</View>}
      <Text
        style={[
          styles.label,
          { color: isDisabled ? theme.colors.textDisabled : v.fg, fontSize: s.fontSize },
        ]}
      >
        {children}
      </Text>
      {!loading && rightIcon && <View>{rightIcon}</View>}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radius.button,
    alignSelf: 'flex-start',
  },
  fullWidth: {
    alignSelf: 'stretch',
  },
  label: {
    fontWeight: theme.typography.fontWeight.semibold,
  },
})
