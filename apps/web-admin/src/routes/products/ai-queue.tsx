import { createFileRoute } from '@tanstack/react-router'
import { AiReviewQueuePage } from '@/features/ai-review-queue'
import { UnavailableScreen } from '@/shared/components/UnavailableScreen'

export const Route = createFileRoute('/products/ai-queue')({
  component: AiReviewQueueGate,
})

// 운영 진입 차단 스위치. 화면은 admin 모듈의 상품 검토 큐 API(/admin/product-inspections)에 붙어 있다 —
// 그 API가 배포되기 전에 열면 목록 조회가 404로 깨지므로 BE 배포 뒤에 true로 바꾼다.
const SERVER_AI_REVIEW_QUEUE_AVAILABLE = false

function AiReviewQueueGate() {
  if (!SERVER_AI_REVIEW_QUEUE_AVAILABLE) {
    return (
      <UnavailableScreen
        title="AI 검수 큐"
        description="AI가 반려한 상품을 확인해 오탐이면 승인하고, 맞으면 반려를 확정합니다."
        message="AI 검수 큐는 준비 중이에요"
      />
    )
  }
  return <AiReviewQueuePage />
}
