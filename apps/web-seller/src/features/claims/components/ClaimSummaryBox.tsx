import type { ReactNode } from 'react'

export interface ClaimSummaryRow {
  label: string
  value: ReactNode
  /** 주문번호/금액처럼 숫자 식별자는 굵게 + tabular. */
  mono?: boolean
}

// 확인 Modal 안의 요약 상자(주문번호/사유/환불 금액) — 승인·거부 Modal과 환불 확정 Modal이 같은 모양을 쓴다.
export function ClaimSummaryBox({ rows }: { rows: ClaimSummaryRow[] }) {
  return (
    <div className="flex flex-col gap-2 rounded-md bg-surface-sunken px-3.5 py-3">
      {rows.map(row => (
        <div key={row.label} className="flex items-center justify-between text-body-sm">
          <span className="text-text-secondary">{row.label}</span>
          <span className={row.mono ? 'font-semibold tabular-nums text-text-primary' : 'text-text-primary'}>
            {row.value}
          </span>
        </div>
      ))}
    </div>
  )
}
