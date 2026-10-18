import { EmptyState, PageHeader } from '@aechak/design-system/web'

interface UnavailableScreenProps {
  title: string
  message: string
  description?: string
  action?: { label: string; onClick: () => void }
}

// BE 엔드포인트가 아직 없는 화면의 운영 진입 차단 안내 — 헤더 + "준비 중" EmptyState.
// 목업으로 동작하던 화면이 저장되는 것처럼 보이지 않게, 주소로 직접 들어와도 이 안내만 보여준다.
export function UnavailableScreen({ title, message, description, action }: UnavailableScreenProps) {
  return (
    <div className="p-6">
      <PageHeader title={title} />
      <EmptyState title={message} description={description} action={action} />
    </div>
  )
}
