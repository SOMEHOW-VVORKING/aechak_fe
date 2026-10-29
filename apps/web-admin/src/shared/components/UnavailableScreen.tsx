import { EmptyState } from '@aechak/design-system/web'
import { PageIntro } from './PageIntro'

interface UnavailableScreenProps {
  title: string
  description: string
  message: string
  /** 지금 열려 있는 화면으로 보내는 바로가기(선택) — 막힌 화면에서 운영자를 세워 두지 않는다. */
  action?: { label: string; onClick: () => void }
}

// admin 모듈에 엔드포인트가 없는 화면의 운영 진입 차단 안내 — 제목/설명 + "준비 중" EmptyState.
// 목업 배열로 동작하던 화면이 처리되는 것처럼 보이지 않게, 주소로 직접 들어와도 이 안내만 보여준다.
// nav 항목은 숨기지 않고 "준비 중" 꼬리표를 달아 둔다(__root.tsx PENDING_TAG) — 숨기면 운영자가
// 어드민이 무엇을 다루는지 알 수 없고, 멀쩡한 화면처럼 보여주면 저장된 줄 안다.
export function UnavailableScreen({
  title,
  description,
  message,
  action,
}: UnavailableScreenProps) {
  return (
    <div className="p-6">
      <PageIntro title={title} description={description} />
      <EmptyState title={message} description="서버가 준비되면 열어 둘게요." action={action} />
    </div>
  )
}
