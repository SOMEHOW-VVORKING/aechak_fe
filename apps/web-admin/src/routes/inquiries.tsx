import { createFileRoute } from '@tanstack/react-router'
import { UnavailableScreen } from '@/shared/components/UnavailableScreen'

export const Route = createFileRoute('/inquiries')({
  component: InquiriesRoute,
})

// api 호스트의 `/inquiries`는 구매자가 자기 문의를 넣는 경로다 — 운영자가 전체 문의를 조회하고
// 답변하는 admin 경로는 없다. nav에는 "준비 중" 꼬리표로 올려 두고 여기서는 안내만 보여준다.
function InquiriesRoute() {
  return (
    <UnavailableScreen
      title="서비스 문의 관리"
      description="접수된 서비스 문의를 확인하고 답변해요."
      message="서비스 문의 관리는 준비 중이에요"
    />
  )
}
