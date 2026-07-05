import type { ReactNode } from 'react'
import { Eye, Lock } from 'lucide-react'

interface DetailFieldProps {
  label: string
  visibility?: 'visible-to-user' | 'internal-only'
  children: ReactNode
}

/**
 * Recurring 셀러 안내/보완 요청 내용(visible-to-user) vs 내부 메모(internal-only)
 * field pattern seen across every b9 detail drawer (applications/sellers/members/
 * product review/AI queue).
 */
export function DetailField({ label, visibility, children }: DetailFieldProps) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-label font-medium text-text-secondary">{label}</span>
        {visibility === 'visible-to-user' && (
          <span className="inline-flex items-center gap-1 text-caption text-brand">
            <Eye className="size-3.5" />
            사용자 노출
          </span>
        )}
        {visibility === 'internal-only' && (
          <span className="inline-flex items-center gap-1 text-caption text-text-tertiary">
            <Lock className="size-3.5" />
            비공개
          </span>
        )}
      </div>
      {children}
    </div>
  )
}
