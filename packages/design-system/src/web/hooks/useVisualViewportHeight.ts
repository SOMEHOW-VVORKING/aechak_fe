import { useEffect, useState } from 'react'

// Mobile browsers don't shrink `100dvh` when the on-screen keyboard opens (most
// notably iOS Safari), which lets a fixed/flex-end footer end up hidden behind
// the keyboard. `window.visualViewport` reports the actually-visible area, so
// tracking it and sizing the screen container to it keeps sticky footers and
// focused inputs above the keyboard on every mobile browser (WebView included).
export function useVisualViewportHeight(): string {
  const [height, setHeight] = useState<string>(() =>
    typeof window !== 'undefined' && window.visualViewport
      ? `${window.visualViewport.height}px`
      : '100dvh',
  )

  useEffect(() => {
    const viewport = window.visualViewport
    if (!viewport) return

    const update = () => setHeight(`${viewport.height}px`)
    update()

    viewport.addEventListener('resize', update)
    return () => viewport.removeEventListener('resize', update)
  }, [])

  return height
}
