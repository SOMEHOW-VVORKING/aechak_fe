import { EmptyState, PageHeader } from '@aechak/design-system/web'

interface ProductMissingProps {
  title: string
  message: string
  action: { label: string; onClick: () => void }
}

// 등록(임시저장 재조회)/수정 라우트가 대상을 못 찾았을 때의 빈 화면 — 헤더 + EmptyState.
export function ProductMissing({ title, message, action }: ProductMissingProps) {
  return (
    <div className="p-6">
      <PageHeader title={title} />
      <EmptyState title={message} action={action} />
    </div>
  )
}
