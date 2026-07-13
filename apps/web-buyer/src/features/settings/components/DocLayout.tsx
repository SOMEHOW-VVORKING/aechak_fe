import type { ReactNode } from 'react'

// 정책·안내 문서(개인정보 처리방침/커뮤니티 가이드라인/계정 삭제 안내)가 공유하는 섹션 블록.
export function DocSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-subheading font-semibold text-text-primary">{title}</h2>
      {children}
    </section>
  )
}

export function DocParagraph({ children }: { children: ReactNode }) {
  return <p className="text-body-sm leading-relaxed text-text-secondary">{children}</p>
}
