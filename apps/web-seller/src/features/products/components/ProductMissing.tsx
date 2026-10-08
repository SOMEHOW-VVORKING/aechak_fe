import { EmptyState, PageHeader } from '@aechak/design-system/web'

interface ProductMissingProps {
  title: string
  message: string
  /** 조회 실패처럼 사유를 덧붙여야 하는 자리에만 쓴다(대상을 못 찾은 경우는 제목만으로 충분하다). */
  description?: string
  action: { label: string; onClick: () => void }
}

// 등록(임시저장 재조회)/수정 라우트가 대상을 못 찾았거나 필수 조회가 실패했을 때의 빈 화면 — 헤더 + EmptyState.
export function ProductMissing({ title, message, description, action }: ProductMissingProps) {
  return (
    <div className="p-6">
      <PageHeader title={title} />
      <EmptyState title={message} description={description} action={action} />
    </div>
  )
}
