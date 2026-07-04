import { colorPrimitives, colors, radius, typography, zIndex, motion } from '../tokens'

export const theme = {
  colors: {
    // Surfaces
    background: colors.surface.base,
    surface: colors.surface.raised,
    surfaceSunken: colors.surface.sunken,
    surfaceHover: colors.surface.hover,
    surfacePressed: colors.surface.pressed,
    surfaceSelected: colors.surface.selected,
    surfaceDisabled: colors.surface.disabled,
    surfaceInverse: colors.surface.inverse,

    // Text
    textPrimary: colors.text.primary,
    textSecondary: colors.text.secondary,
    textTertiary: colors.text.tertiary,
    textPlaceholder: colors.text.placeholder,
    textDisabled: colors.text.disabled,
    textInverse: colors.text.inverse,
    textLink: colors.text.link,
    textAccent: colors.text.accent,

    // Borders
    borderSubtle: colors.border.subtle,
    borderDefault: colors.border.default,
    borderStrong: colors.border.strong,
    borderFocus: colors.border.focus,

    // Brand
    brand: colors.brand.default,
    brandHover: colors.brand.hover,
    brandSubtle: colors.brand.subtle,
    brandBorder: colors.brand.border,
    onBrand: colors.brand.on,

    // Accent (sale/discount)
    accent: colors.accent.default,
    accentSubtle: colors.accent.subtle,
    onAccent: colors.accent.on,

    // Status
    successFg: colors.success.fg,
    successSurface: colors.success.surface,
    warningFg: colors.warning.fg,
    warningSurface: colors.warning.surface,
    warningSolid: colors.warning.solid,
    errorFg: colors.error.fg,
    errorSurface: colors.error.surface,
    infoFg: colors.info.fg,
    infoSurface: colors.info.surface,
    dangerFg: colors.danger.fg,
    dangerSurface: colors.danger.surface,

    // Muted
    mutedFg: colors.muted.fg,
    mutedSurface: colors.muted.surface,

    // Social (SNS)
    socialActive: colors.social.active,
    socialSubtle: colors.social.activeSubtle,

    // Primitive access for special cases
    white: colorPrimitives.neutral[0],
    black: colorPrimitives.neutral[900],
  },
  spacing: {
    0: 0,
    '0.5': 2,
    1: 4,
    2: 8,
    3: 12,
    4: 16,
    5: 20,
    6: 24,
    7: 28,
    8: 32,
    10: 40,
    12: 48,
    14: 56,
    16: 64,
    20: 80,
    24: 96,
  },
  radius: {
    none: 0,
    xs: 4,
    sm: 6,
    md: parseInt(radius.md),
    lg: parseInt(radius.lg),
    xl: parseInt(radius.xl),
    '2xl': 20,
    full: 9999,
    // Component aliases
    button: parseInt(radius.button),
    chip: 9999,
    card: parseInt(radius.card),
    image: parseInt(radius.image),
    input: parseInt(radius.input),
    modal: parseInt(radius.modal),
    bottomsheet: parseInt(radius.bottomsheet),
    message: parseInt(radius.message),
  },
  typography: {
    fontFamily: typography.fontFamily.sans[0],
    fontSize: {
      display: 32,
      title: 24,
      heading: 20,
      subheading: 16,
      bodyLg: 16,
      body: 15,
      bodySm: 14,
      caption: 12,
      label: 13,
      price: 18,
      priceLg: 22,
      priceSm: 14,
      badge: 11,
      button: 15,
    },
    fontWeight: {
      regular: '400' as const,
      medium: '500' as const,
      semibold: '600' as const,
      bold: '700' as const,
    },
  },
  zIndex,
  motion: {
    durationFast: 120,
    durationBase: 200,
    durationModerate: 280,
    durationSlow: 400,
    easeStandard: motion.ease.standard,
    easeDecelerate: motion.ease.decelerate,
    easeAccelerate: motion.ease.accelerate,
    easeOvershoot: motion.ease.overshoot,
  },
} as const

export type Theme = typeof theme
