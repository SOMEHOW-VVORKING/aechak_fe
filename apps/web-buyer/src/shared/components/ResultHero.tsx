import type { ReactNode } from 'react'

const TONE_CLASS = {
  success: 'bg-success-surface text-success-fg',
  error: 'bg-error-surface text-error-fg',
} as const

// 완료/실패 결과 화면의 큰 원형 아이콘 + 제목(+ 설명). 결제 성공/실패, 주문 취소 완료, 신고 접수 완료가 공유한다.
// 설명 문단은 화면마다 색·행간이 달라 children으로 받는다.
export function ResultHero({
  tone,
  icon,
  title,
  children,
}: {
  tone: keyof typeof TONE_CLASS
  icon: ReactNode
  title: string
  children?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <span className={`flex size-16 items-center justify-center rounded-full ${TONE_CLASS[tone]}`}>
        {icon}
      </span>
      <p className="text-title font-bold text-text-primary">{title}</p>
      {children}
    </div>
  )
}
