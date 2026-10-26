import { createFileRoute } from '@tanstack/react-router'
import { UnavailableScreen } from '@/shared/components/UnavailableScreen'

export const Route = createFileRoute('/claims')({
  component: ClaimsRoute,
})

// 클레임 처리는 seller 호스트(`/sellers/me/claims`, 셀러가 자기 건을 처리)와 api 호스트
// (`/orders/{orderPublicId}/claims`, 구매자가 자기 건을 요청)에만 있다. 운영자가 끼어들어
// 중재하는 admin 경로는 없다.
function ClaimsRoute() {
  return (
    <UnavailableScreen
      title="취소/반품/교환"
      description="셀러와 구매자 사이의 클레임을 확인하고 중재해요."
      message="취소/반품/교환 관리는 준비 중이에요"
    />
  )
}
