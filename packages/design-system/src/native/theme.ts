import { colors, radius, spacing, typography } from '../tokens'

export const theme = {
  colors: {
    primary: colors.primary[500],
    primaryDark: colors.primary[700],
    primaryLight: colors.primary[200],
    success: colors.success.default,
    warning: colors.warning.default,
    error: colors.error.default,
    background: colors.gray[50],
    surface: '#ffffff',
    text: colors.gray[900],
    textSecondary: colors.gray[500],
    border: colors.gray[200],
  },
  spacing: {
    xs: parseInt(spacing[1]),
    sm: parseInt(spacing[2]),
    md: parseInt(spacing[4]),
    lg: parseInt(spacing[6]),
    xl: parseInt(spacing[8]),
    '2xl': parseInt(spacing[12]),
  },
  radius: {
    sm: parseInt(radius.sm),
    md: parseInt(radius.md),
    lg: parseInt(radius.lg),
    full: 9999,
  },
  typography: {
    fontFamily: typography.fontFamily.sans[0],
    sizes: {
      xs: parseInt(typography.fontSize.xs),
      sm: parseInt(typography.fontSize.sm),
      base: parseInt(typography.fontSize.base),
      lg: parseInt(typography.fontSize.lg),
      xl: parseInt(typography.fontSize.xl),
    },
  },
} as const

export type Theme = typeof theme
