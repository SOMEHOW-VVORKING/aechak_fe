import { colors } from '../tokens'

export const cssVariables = {
  '--color-primary': colors.primary[500],
  '--color-primary-dark': colors.primary[700],
  '--color-primary-light': colors.primary[200],
  '--color-success': colors.success.default,
  '--color-warning': colors.warning.default,
  '--color-error': colors.error.default,
} as const
