import type { ReactNode } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { theme } from '../theme'

export type StatusPillVariant =
  | 'success'
  | 'warning'
  | 'error'
  | 'info'
  | 'danger'
  | 'accent'
  | 'brand'
  | 'neutral'
  | 'muted'

interface StatusPillProps {
  variant?: StatusPillVariant
  size?: 'sm' | 'md'
  dot?: boolean
  children: ReactNode
}

const variantColors: Record<StatusPillVariant, { bg: string; fg: string; border: string }> = {
  success: { bg: theme.colors.successSurface, fg: theme.colors.successFg, border: '#9BD4A3' },
  warning: { bg: theme.colors.warningSurface, fg: theme.colors.warningFg, border: '#EFCD79' },
  error:   { bg: theme.colors.errorSurface,   fg: theme.colors.errorFg,   border: '#F0A69E' },
  info:    { bg: theme.colors.infoSurface,    fg: theme.colors.infoFg,    border: '#A1C1ED' },
  danger:  { bg: theme.colors.dangerSurface,  fg: theme.colors.dangerFg,  border: '#E5746A' },
  accent:  { bg: '#FDEFEB', fg: '#BC3F22', border: '#F5B6A4' },
  brand:   { bg: theme.colors.brandSubtle, fg: theme.colors.brand, border: '#A8D8C4' },
  neutral: { bg: '#F4F2EE', fg: '#4D4944', border: '#DAD5CC' },
  muted:   { bg: '#F4F2EE', fg: '#6A645B', border: '#E9E5DF' },
}

export function StatusPill({ variant = 'neutral', size = 'md', dot = false, children }: StatusPillProps) {
  const c = variantColors[variant]
  const isSmall = size === 'sm'

  return (
    <View
      style={[
        styles.base,
        { backgroundColor: c.bg, borderColor: c.border },
        isSmall ? styles.sm : styles.md,
      ]}
    >
      {dot && (
        <View style={[styles.dot, { backgroundColor: c.fg }]} />
      )}
      <Text style={[styles.label, { color: c.fg }, isSmall ? styles.labelSm : undefined]}>
        {children}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: theme.radius.xs,
    alignSelf: 'flex-start',
  },
  md: {
    paddingHorizontal: 10,
    paddingVertical: 2,
    gap: 6,
  },
  sm: {
    paddingHorizontal: 8,
    paddingVertical: 1,
    gap: 4,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  label: {
    fontSize: theme.typography.fontSize.label,
    fontWeight: theme.typography.fontWeight.semibold,
  },
  labelSm: {
    fontSize: theme.typography.fontSize.badge,
  },
})
