import { createFileRoute } from '@tanstack/react-router'
import { UnavailableScreen } from '@/shared/components/UnavailableScreen'

export const Route = createFileRoute('/chat-monitoring')({
  component: ChatMonitoringRoute,
})

// 채팅 자체가 BE에 아직 없다(열려 있는 SNS 경로는 `/sns/me`·`/sns/users/{publicId}` 프로필뿐).
// 모니터링은 그 위에 얹히는 기능이라 더 뒤다.
function ChatMonitoringRoute() {
  return (
    <UnavailableScreen
      title="채팅 CS 모니터링"
      description="구매자와 셀러 사이의 채팅 상담을 모니터링해요."
      message="채팅 CS 모니터링은 준비 중이에요"
    />
  )
}
