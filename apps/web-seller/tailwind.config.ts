import type { Config } from 'tailwindcss'
import sharedPreset from '@aechak/tailwind-config'
import { tailwindTheme } from '@aechak/design-system/tailwind'

const config: Config = {
  presets: [sharedPreset],
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
    '../../packages/design-system/src/web/**/*.{ts,tsx}',
  ],
  theme: {
    extend: tailwindTheme.extend,
  },
}

export default config
