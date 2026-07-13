import { createFileRoute } from '@tanstack/react-router'
import { MyReviewsScreen } from '@/features/review'

export interface MyReviewsSearch {
  /** 리뷰 등록 직후 진입 시 true — 완료 탭 + 등록 완료 토스트. */
  submitted?: boolean
}

// 내 리뷰 / 작성 대기(b4-st-6).
export const Route = createFileRoute('/reviews/mine')({
  validateSearch: (search: Record<string, unknown>): MyReviewsSearch => ({
    submitted: search.submitted === true || search.submitted === 'true',
  }),
  component: MyReviewsRoute,
})

function MyReviewsRoute() {
  const { submitted } = Route.useSearch()
  return <MyReviewsScreen submitted={submitted} />
}
