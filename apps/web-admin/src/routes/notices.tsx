import { createFileRoute } from '@tanstack/react-router'
import { UnavailableScreen } from '@/shared/components/UnavailableScreen'

export const Route = createFileRoute('/notices')({
  component: NoticesRoute,
})

// 공지·알림 발송 API가 admin 모듈에 없다. 알림 발송은 되돌릴 수 없는 액션이라 목업으로
// "발송됨"을 보여주는 것이 특히 위험하다 — 안내만 보여준다.
function NoticesRoute() {
  return (
    <UnavailableScreen
      title="알림/공지 관리"
      description="서비스 공지를 등록하고 알림을 발송합니다."
      message="알림/공지 관리는 준비 중이에요"
    />
  )
}
