import { createFileRoute } from '@tanstack/react-router'
import { AiReviewQueuePage } from '@/features/ai-review-queue'

// admin 모듈의 상품 검토 큐 API(/admin/product-inspections)에 붙은 실연동 화면. 진입 스위치는 SCRUM-308이 걷어냈다.
export const Route = createFileRoute('/products/ai-queue')({
  component: AiReviewQueuePage,
})
