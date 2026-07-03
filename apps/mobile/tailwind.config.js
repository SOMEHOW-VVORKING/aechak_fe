/** @type {import('tailwindcss').Config} */
// CJS 환경이므로 @aechak/design-system에서 직접 import 불가.
// tokens.ts 의 실제 값을 여기에 동기화해서 유지.
module.exports = {
  content: [
    './app/**/*.{ts,tsx}',
    './features/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    '../../packages/design-system/src/native/**/*.{ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        // Surfaces
        'surface-base': '#FAF9F7',
        'surface-raised': '#FFFFFF',
        'surface-sunken': '#F4F2EE',
        'surface-hover': '#F4F2EE',
        'surface-pressed': '#E9E5DF',
        'surface-selected': '#ECF6F1',
        'surface-disabled': '#F4F2EE',
        'surface-inverse': '#1C1A17',
        // Text
        'text-primary': '#1C1A17',
        'text-secondary': '#4D4944',
        'text-tertiary': '#6A645B',
        'text-placeholder': '#8C857A',
        'text-disabled': '#B6AFA4',
        'text-inverse': '#FFFFFF',
        'text-link': '#185845',
        'text-accent': '#BC3F22',
        // Brand
        brand: '#1E6E56',
        'brand-hover': '#185845',
        'brand-subtle': '#ECF6F1',
        'on-brand': '#FFFFFF',
        // Accent
        accent: '#D9512F',
        'accent-subtle': '#FDEFEB',
        // Status
        'success-fg': '#1F6A33',
        'success-surface': '#E7F5E9',
        'warning-fg': '#946012',
        'warning-surface': '#FBF3DE',
        'error-fg': '#A82A22',
        'error-surface': '#FCEBE9',
        'info-fg': '#1E5093',
        'info-surface': '#EAF1FB',
        'danger-fg': '#84211B',
        'danger-surface': '#F9D2CE',
        // Muted
        'muted-fg': '#6A645B',
        'muted-surface': '#F4F2EE',
        // Border
        'border-default': '#DAD5CC',
        'border-subtle': '#E9E5DF',
        'border-strong': '#B6AFA4',
        // Social
        'social-active': '#F4744F',
        'social-subtle': '#FFF3EE',
      },
      borderRadius: {
        none: '0px',
        xs: '4px',
        sm: '6px',
        md: '8px',
        lg: '12px',
        xl: '16px',
        '2xl': '20px',
        full: '9999px',
        button: '8px',
        chip: '9999px',
        card: '12px',
        input: '8px',
        modal: '16px',
        bottomsheet: '20px',
        message: '12px',
      },
    },
  },
}
