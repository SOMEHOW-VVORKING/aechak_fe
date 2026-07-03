import type { Config } from 'tailwindcss'
import { colors, radius, spacing, typography } from '../tokens'

export const tailwindTheme = {
  extend: {
    colors: {
      primary: colors.primary,
      success: colors.success,
      warning: colors.warning,
      error: colors.error,
    },
    spacing,
    borderRadius: radius,
    fontFamily: {
      sans: [...typography.fontFamily.sans],
      mono: [...typography.fontFamily.mono],
    },
    fontSize: Object.fromEntries(
      Object.entries(typography.fontSize).map(([k, v]) => [k, v]),
    ),
  },
} satisfies { extend: Config['theme'] }
