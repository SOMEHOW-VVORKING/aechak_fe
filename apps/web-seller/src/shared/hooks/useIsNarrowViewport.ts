import { useEffect, useState } from 'react'

const DEFAULT_BREAKPOINT_PX = 1024 // Tailwind `lg`

// Same shape as design-system's useVisualViewportHeight (matchMedia + a
// `change` listener) — matchMedia only fires on actual breakpoint crossings
// instead of every `resize` pixel, so it's the cheaper choice for a
// boolean breakpoint check.
export function useIsNarrowViewport(breakpointPx: number = DEFAULT_BREAKPOINT_PX): boolean {
  const query = `(max-width: ${breakpointPx - 1}px)`
  const [isNarrow, setIsNarrow] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.matchMedia(query).matches : false,
  )

  useEffect(() => {
    const mql = window.matchMedia(query)
    const update = () => setIsNarrow(mql.matches)
    update()

    mql.addEventListener('change', update)
    return () => mql.removeEventListener('change', update)
  }, [query])

  return isNarrow
}
