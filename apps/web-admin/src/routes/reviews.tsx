import { createFileRoute } from '@tanstack/react-router'
import { UnavailableScreen } from '@/shared/components/UnavailableScreen'

export const Route = createFileRoute('/reviews')({
  component: ReviewsRoute,
})

// api 호스트의 `/reviews`는 구매자가 자기 리뷰를 쓰고 고치는 경로다 — 운영자가 전체 리뷰를
// 조회하고 숨기는 admin 경로는 없다.
function ReviewsRoute() {
  return (
    <UnavailableScreen
      title="리뷰 관리"
      description="등록된 리뷰를 확인하고 부적절한 리뷰를 숨겨요."
      message="리뷰 관리는 준비 중이에요"
    />
  )
}
