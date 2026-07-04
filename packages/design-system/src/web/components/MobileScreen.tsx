import type { CSSProperties, ReactNode } from 'react'
import { useVisualViewportHeight } from '../hooks/useVisualViewportHeight'

export interface MobileScreenProps {
  header?: ReactNode
  footer?: ReactNode
  children: ReactNode
  className?: string
  contentClassName?: string
}

// App-shell layout for mobile-web (and later thin-WebView) screens: a
// non-scrolling frame sized to the *visual* viewport, with an optional
// sticky header/footer and a single independently-scrolling content region
// in between. Safe-area insets only take effect when the page's viewport
// meta tag includes `viewport-fit=cover`.
export function MobileScreen({
  header,
  footer,
  children,
  className = '',
  contentClassName = '',
}: MobileScreenProps) {
  const height = useVisualViewportHeight()

  const contentStyle: CSSProperties = {}
  if (!header) contentStyle.paddingTop = 'env(safe-area-inset-top)'
  if (!footer) contentStyle.paddingBottom = 'env(safe-area-inset-bottom)'

  return (
    <div
      className={['relative flex w-full flex-col overflow-hidden bg-surface-base', className]
        .filter(Boolean)
        .join(' ')}
      style={{
        height,
        paddingLeft: 'env(safe-area-inset-left)',
        paddingRight: 'env(safe-area-inset-right)',
      }}
    >
      {header && (
        <div className="flex-none" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
          {header}
        </div>
      )}
      <div
        className={['min-h-0 flex-1 overflow-y-auto', contentClassName].filter(Boolean).join(' ')}
        style={contentStyle}
      >
        {children}
      </div>
      {footer && <div className="flex-none">{footer}</div>}
    </div>
  )
}
