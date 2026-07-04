import type { KeyboardEvent } from 'react'

export function getInteractiveDivProps(onClick?: () => void) {
  if (!onClick) return {}

  return {
    role: 'button' as const,
    tabIndex: 0,
    onClick,
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') onClick()
    },
  }
}
