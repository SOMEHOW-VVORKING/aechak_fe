import type { Config } from 'tailwindcss'
import sharedPreset from '@aechak/tailwind-config'
import { tailwindTheme } from '@aechak/design-system/web'

const config: Config = {
  presets: [sharedPreset],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: tailwindTheme.extend,
  },
}

export default config
