import type { ReactNode } from 'react'

interface RowLinkButtonProps {
  onClick: () => void
  /** ID 같은 숫자열 컬럼이면 tabular-nums. */
  numeric?: boolean
  children: ReactNode
}

/** DataTable 첫 컬럼의 이름/ID 링크 버튼 — 행 클릭과 같은 openDrawer를 호출한다(멱등). */
export function RowLinkButton({ onClick, numeric, children }: RowLinkButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'font-medium text-text-primary hover:text-brand hover:underline',
        numeric && 'tabular-nums',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </button>
  )
}
