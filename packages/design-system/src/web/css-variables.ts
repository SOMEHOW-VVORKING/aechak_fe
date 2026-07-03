import { colorPrimitives, colors, colorsDark, elevation, motion, zIndex, radius, typography } from '../tokens'

const fontSans = typography.fontFamily.sans.map(f => f.includes(' ') ? `"${f}"` : f).join(', ')

const lightVars: Record<string, string> = {
  // Fonts
  '--font-sans': fontSans,
  '--font-numeric': fontSans,
  '--weight-regular': typography.fontWeight.regular,
  '--weight-medium': typography.fontWeight.medium,
  '--weight-semibold': typography.fontWeight.semibold,
  '--weight-bold': typography.fontWeight.bold,

  // Color primitives (for cross-reference in component CSS)
  '--green-50': colorPrimitives.green[50],
  '--green-100': colorPrimitives.green[100],
  '--green-200': colorPrimitives.green[200],
  '--green-300': colorPrimitives.green[300],
  '--green-400': colorPrimitives.green[400],
  '--green-500': colorPrimitives.green[500],
  '--green-600': colorPrimitives.green[600],
  '--green-700': colorPrimitives.green[700],
  '--green-800': colorPrimitives.green[800],
  '--green-900': colorPrimitives.green[900],
  '--neutral-0': colorPrimitives.neutral[0],
  '--neutral-50': colorPrimitives.neutral[50],
  '--neutral-100': colorPrimitives.neutral[100],
  '--neutral-200': colorPrimitives.neutral[200],
  '--neutral-300': colorPrimitives.neutral[300],
  '--neutral-400': colorPrimitives.neutral[400],
  '--neutral-500': colorPrimitives.neutral[500],
  '--neutral-600': colorPrimitives.neutral[600],
  '--neutral-700': colorPrimitives.neutral[700],
  '--neutral-800': colorPrimitives.neutral[800],
  '--neutral-900': colorPrimitives.neutral[900],

  // Surfaces
  '--surface-base': colors.surface.base,
  '--surface-raised': colors.surface.raised,
  '--surface-sunken': colors.surface.sunken,
  '--surface-overlay': colors.surface.overlay,
  '--surface-inverse': colors.surface.inverse,
  '--surface-hover': colors.surface.hover,
  '--surface-pressed': colors.surface.pressed,
  '--surface-selected': colors.surface.selected,
  '--surface-disabled': colors.surface.disabled,
  '--scrim': colors.surface.scrim,

  // Borders
  '--border-subtle': colors.border.subtle,
  '--border-default': colors.border.default,
  '--border-strong': colors.border.strong,
  '--border-focus': colors.border.focus,
  '--border-inverse': colors.border.inverse,

  // Text
  '--text-primary': colors.text.primary,
  '--text-secondary': colors.text.secondary,
  '--text-tertiary': colors.text.tertiary,
  '--text-placeholder': colors.text.placeholder,
  '--text-disabled': colors.text.disabled,
  '--text-inverse': colors.text.inverse,
  '--text-link': colors.text.link,
  '--text-brand': colors.text.brand,
  '--text-accent': colors.text.accent,
  '--text-price': colors.text.price,
  '--text-discount': colors.text.discount,

  // Icons
  '--icon-default': colors.icon.default,
  '--icon-muted': colors.icon.muted,

  // Brand
  '--brand': colors.brand.default,
  '--brand-hover': colors.brand.hover,
  '--brand-pressed': colors.brand.pressed,
  '--brand-subtle': colors.brand.subtle,
  '--brand-subtle-hover': colors.brand.subtleHover,
  '--brand-border': colors.brand.border,
  '--on-brand': colors.brand.on,

  // Accent
  '--accent': colors.accent.default,
  '--accent-hover': colors.accent.hover,
  '--accent-subtle': colors.accent.subtle,
  '--accent-border': colors.accent.border,
  '--on-accent': colors.accent.on,

  // Success
  '--success-surface': colors.success.surface,
  '--success-border': colors.success.border,
  '--success-fg': colors.success.fg,
  '--success-solid': colors.success.solid,
  '--on-success': colors.success.on,

  // Warning
  '--warning-surface': colors.warning.surface,
  '--warning-border': colors.warning.border,
  '--warning-fg': colors.warning.fg,
  '--warning-solid': colors.warning.solid,
  '--on-warning': colors.warning.on,

  // Error
  '--error-surface': colors.error.surface,
  '--error-border': colors.error.border,
  '--error-fg': colors.error.fg,
  '--error-solid': colors.error.solid,
  '--on-error': colors.error.on,

  // Danger
  '--danger-surface': colors.danger.surface,
  '--danger-border': colors.danger.border,
  '--danger-fg': colors.danger.fg,
  '--danger-solid': colors.danger.solid,
  '--danger-strong': colors.danger.strong,
  '--on-danger': colors.danger.on,

  // Info
  '--info-surface': colors.info.surface,
  '--info-border': colors.info.border,
  '--info-fg': colors.info.fg,
  '--info-solid': colors.info.solid,
  '--on-info': colors.info.on,

  // Neutral status
  '--neutral-surface': colors.neutral.surface,
  '--neutral-border': colors.neutral.border,
  '--neutral-fg': colors.neutral.fg,
  '--neutral-solid': colors.neutral.solid,
  '--on-neutral': colors.neutral.on,

  // Muted
  '--muted-surface': colors.muted.surface,
  '--muted-border': colors.muted.border,
  '--muted-fg': colors.muted.fg,
  '--on-muted': colors.muted.on,

  // Social
  '--social-active': colors.social.active,
  '--social-active-hover': colors.social.activeHover,
  '--social-active-subtle': colors.social.activeSubtle,
  '--social-active-border': colors.social.activeBorder,
  '--social-idle': colors.social.idle,
  '--on-social': colors.social.on,

  // Domain status shortcuts
  '--status-new': colors.brand.default,
  '--status-sale': colors.accent.default,
  '--status-like': colors.social.active,
  '--status-blind': colors.muted.fg,
  '--status-banned': colors.danger.solid,

  // Focus rings
  '--focus-ring': '0 0 0 3px rgba(30,110,86,0.32)',
  '--focus-ring-danger': '0 0 0 3px rgba(197,54,44,0.30)',
  '--focus-ring-inverse': '0 0 0 3px rgba(255,255,255,0.55)',

  // Elevation
  '--elevation-0': elevation[0],
  '--elevation-card': elevation.card,
  '--elevation-sticky': elevation.sticky,
  '--elevation-dropdown': elevation.dropdown,
  '--elevation-toast': elevation.toast,
  '--elevation-bottomsheet': elevation.bottomsheet,
  '--elevation-modal': elevation.modal,
  '--elevation-inset': elevation.inset,

  // Motion — duration
  '--duration-instant': motion.duration.instant,
  '--duration-fast': motion.duration.fast,
  '--duration-base': motion.duration.base,
  '--duration-moderate': motion.duration.moderate,
  '--duration-slow': motion.duration.slow,
  '--duration-skeleton': motion.duration.skeleton,

  // Motion — easing
  '--ease-standard': motion.ease.standard,
  '--ease-decelerate': motion.ease.decelerate,
  '--ease-accelerate': motion.ease.accelerate,
  '--ease-emphasized': motion.ease.emphasized,
  '--ease-overshoot': motion.ease.overshoot,
  '--ease-linear': motion.ease.linear,

  // Motion — component bundles
  '--motion-toast-in': `${motion.duration.base} ${motion.ease.decelerate}`,
  '--motion-toast-out': `${motion.duration.fast} ${motion.ease.accelerate}`,
  '--motion-bottomsheet-in': `${motion.duration.moderate} ${motion.ease.emphasized}`,
  '--motion-bottomsheet-out': `240ms ${motion.ease.accelerate}`,
  '--motion-modal-in': `${motion.duration.base} ${motion.ease.decelerate}`,
  '--motion-modal-out': `${motion.duration.fast} ${motion.ease.accelerate}`,
  '--motion-like': `180ms ${motion.ease.overshoot}`,
  '--motion-chip': `${motion.duration.fast} ${motion.ease.standard}`,

  // Z-index
  '--z-base': String(zIndex.base),
  '--z-raised': String(zIndex.raised),
  '--z-sticky': String(zIndex.sticky),
  '--z-dropdown': String(zIndex.dropdown),
  '--z-bottomsheet': String(zIndex.bottomsheet),
  '--z-modal': String(zIndex.modal),
  '--z-toast': String(zIndex.toast),
  '--z-global-overlay': String(zIndex.globalOverlay),

  // Radius
  '--radius-button': radius.button,
  '--radius-chip': radius.chip,
  '--radius-badge': radius.badge,
  '--radius-card': radius.card,
  '--radius-image': radius.image,
  '--radius-input': radius.input,
  '--radius-modal': radius.modal,
  '--radius-bottomsheet': radius.bottomsheet,
  '--radius-searchbar': radius.searchbar,
  '--radius-message': radius.message,

  // Typography role shorthands (font shorthand: weight size/line-height family)
  '--type-display': `${typography.fontWeight.bold} 32px/40px var(--font-sans)`,
  '--type-title': `${typography.fontWeight.bold} 24px/32px var(--font-sans)`,
  '--type-heading': `${typography.fontWeight.semibold} 20px/28px var(--font-sans)`,
  '--type-subheading': `${typography.fontWeight.semibold} 16px/24px var(--font-sans)`,
  '--type-body-lg': `${typography.fontWeight.regular} 16px/26px var(--font-sans)`,
  '--type-body': `${typography.fontWeight.regular} 15px/23px var(--font-sans)`,
  '--type-body-sm': `${typography.fontWeight.regular} 14px/20px var(--font-sans)`,
  '--type-caption': `${typography.fontWeight.regular} 12px/16px var(--font-sans)`,
  '--type-label': `${typography.fontWeight.medium} 13px/18px var(--font-sans)`,
  '--type-price': `${typography.fontWeight.bold} 18px/24px var(--font-numeric)`,
  '--type-price-lg': `${typography.fontWeight.bold} 22px/28px var(--font-numeric)`,
  '--type-price-sm': `${typography.fontWeight.bold} 14px/20px var(--font-numeric)`,
  '--type-badge': `${typography.fontWeight.semibold} 11px/14px var(--font-sans)`,
  '--type-button': `${typography.fontWeight.semibold} 15px/20px var(--font-sans)`,
  '--type-table-header': `${typography.fontWeight.semibold} 13px/18px var(--font-sans)`,
  '--type-table-cell': `${typography.fontWeight.regular} 13px/20px var(--font-numeric)`,
}

const darkVars: Record<string, string> = {
  '--surface-base': colorsDark.surface.base,
  '--surface-raised': colorsDark.surface.raised,
  '--surface-sunken': colorsDark.surface.sunken,
  '--surface-overlay': colorsDark.surface.overlay,
  '--surface-inverse': colorsDark.surface.inverse,
  '--surface-hover': colorsDark.surface.hover,
  '--surface-pressed': colorsDark.surface.pressed,
  '--surface-selected': colorsDark.surface.selected,
  '--surface-disabled': colorsDark.surface.disabled,
  '--scrim': colorsDark.surface.scrim,

  '--border-subtle': colorsDark.border.subtle,
  '--border-default': colorsDark.border.default,
  '--border-strong': colorsDark.border.strong,
  '--border-focus': colorsDark.border.focus,
  '--border-inverse': colorsDark.border.inverse,

  '--text-primary': colorsDark.text.primary,
  '--text-secondary': colorsDark.text.secondary,
  '--text-tertiary': colorsDark.text.tertiary,
  '--text-placeholder': colorsDark.text.placeholder,
  '--text-disabled': colorsDark.text.disabled,
  '--text-inverse': colorsDark.text.inverse,
  '--text-link': colorsDark.text.link,
  '--text-brand': colorsDark.text.brand,
  '--text-accent': colorsDark.text.accent,
  '--text-price': colorsDark.text.price,
  '--text-discount': colorsDark.text.discount,

  '--icon-default': colorsDark.icon.default,
  '--icon-muted': colorsDark.icon.muted,

  '--brand': colorsDark.brand.default,
  '--brand-hover': colorsDark.brand.hover,
  '--brand-pressed': colorsDark.brand.pressed,
  '--brand-subtle': colorsDark.brand.subtle,
  '--brand-subtle-hover': colorsDark.brand.subtleHover,
  '--brand-border': colorsDark.brand.border,
  '--on-brand': colorsDark.brand.on,

  '--accent': colorsDark.accent.default,
  '--accent-hover': colorsDark.accent.hover,
  '--accent-subtle': colorsDark.accent.subtle,
  '--accent-border': colorsDark.accent.border,
  '--on-accent': colorsDark.accent.on,

  '--success-surface': colorsDark.success.surface,
  '--success-border': colorsDark.success.border,
  '--success-fg': colorsDark.success.fg,
  '--success-solid': colorsDark.success.solid,
  '--on-success': colorsDark.success.on,

  '--warning-surface': colorsDark.warning.surface,
  '--warning-border': colorsDark.warning.border,
  '--warning-fg': colorsDark.warning.fg,
  '--warning-solid': colorsDark.warning.solid,
  '--on-warning': colorsDark.warning.on,

  '--error-surface': colorsDark.error.surface,
  '--error-border': colorsDark.error.border,
  '--error-fg': colorsDark.error.fg,
  '--error-solid': colorsDark.error.solid,
  '--on-error': colorsDark.error.on,

  '--danger-surface': colorsDark.danger.surface,
  '--danger-border': colorsDark.danger.border,
  '--danger-fg': colorsDark.danger.fg,
  '--danger-solid': colorsDark.danger.solid,
  '--danger-strong': colorsDark.danger.strong,
  '--on-danger': colorsDark.danger.on,

  '--info-surface': colorsDark.info.surface,
  '--info-border': colorsDark.info.border,
  '--info-fg': colorsDark.info.fg,
  '--info-solid': colorsDark.info.solid,
  '--on-info': colorsDark.info.on,

  '--neutral-surface': colorsDark.neutral.surface,
  '--neutral-border': colorsDark.neutral.border,
  '--neutral-fg': colorsDark.neutral.fg,
  '--neutral-solid': colorsDark.neutral.solid,
  '--on-neutral': colorsDark.neutral.on,

  '--muted-surface': colorsDark.muted.surface,
  '--muted-border': colorsDark.muted.border,
  '--muted-fg': colorsDark.muted.fg,
  '--on-muted': colorsDark.muted.on,

  '--social-active': colorsDark.social.active,
  '--social-active-hover': colorsDark.social.activeHover,
  '--social-active-subtle': colorsDark.social.activeSubtle,
  '--social-active-border': colorsDark.social.activeBorder,
  '--social-idle': colorsDark.social.idle,
  '--on-social': colorsDark.social.on,

  '--status-blind': colorsDark.muted.fg,
  '--status-banned': colorsDark.danger.solid,

  '--focus-ring': '0 0 0 3px rgba(67,160,130,0.45)',
  '--focus-ring-danger': '0 0 0 3px rgba(216,74,61,0.45)',

  '--elevation-card': '0 1px 2px rgba(0,0,0,0.40), 0 1px 3px rgba(0,0,0,0.32)',
  '--elevation-sticky': '0 1px 0 rgba(0,0,0,0.50), 0 2px 6px rgba(0,0,0,0.32)',
  '--elevation-dropdown': '0 4px 12px rgba(0,0,0,0.48), 0 2px 4px rgba(0,0,0,0.40)',
  '--elevation-toast': '0 6px 20px rgba(0,0,0,0.56), 0 2px 6px rgba(0,0,0,0.40)',
  '--elevation-bottomsheet': '0 -4px 16px rgba(0,0,0,0.52), 0 -1px 4px rgba(0,0,0,0.36)',
  '--elevation-modal': '0 8px 32px rgba(0,0,0,0.64), 0 2px 8px rgba(0,0,0,0.44)',
}

const globalCss = `
@keyframes aechak-skeleton {
  0%   { background-position: -200% 0; }
  100% { background-position:  200% 0; }
}
@keyframes aechak-spin {
  to { transform: rotate(360deg); }
}
@media (prefers-reduced-motion: reduce) {
  :root {
    --duration-fast: 1ms;
    --duration-base: 1ms;
    --duration-moderate: 1ms;
    --duration-slow: 1ms;
  }
}
`

export const cssVariables = lightVars

// Pre-compute once at module load — no object iteration on every applyCssVariables() call.
const _lightCss = Object.entries(lightVars).map(([k, v]) => `${k}:${v}`).join(';')
const _darkCss = Object.entries(darkVars).map(([k, v]) => `${k}:${v}`).join(';')
const _styleContent = `:root{${_lightCss}}[data-theme="dark"]{${_darkCss}}${globalCss}`

export function applyCssVariables(): void {
  const existing = document.getElementById('__aechak-tokens__')
  // Idempotent: if already injected with same content, skip DOM write.
  if (existing) {
    if (existing.textContent === _styleContent) return
    existing.remove()
  }
  const style = document.createElement('style')
  style.id = '__aechak-tokens__'
  style.textContent = _styleContent
  document.head.appendChild(style)
}
