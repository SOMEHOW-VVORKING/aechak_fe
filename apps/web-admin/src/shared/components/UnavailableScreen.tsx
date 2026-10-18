import { EmptyState } from '@aechak/design-system/web'
import { PageIntro } from './PageIntro'

interface UnavailableScreenProps {
  title: string
  description: string
  message: string
}

// admin 모듈에 엔드포인트가 없는 화면의 운영 진입 차단 안내 — 제목/설명 + "준비 중" EmptyState.
// 목업 배열로 동작하던 화면이 처리되는 것처럼 보이지 않게, 주소로 직접 들어와도 이 안내만 보여준다.
export function UnavailableScreen({ title, description, message }: UnavailableScreenProps) {
  return (
    <div className="p-6">
      <PageIntro title={title} description={description} />
      <EmptyState title={message} description="서버가 준비되면 열어 둘게요." />
    </div>
  )
}
