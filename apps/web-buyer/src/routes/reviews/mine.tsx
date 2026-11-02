import { createFileRoute } from '@tanstack/react-router'
import { MyReviewsScreen } from '@/features/review'

export interface MyReviewsSearch {
  /** 리뷰 등록 직후 진입 시 true — 완료 탭 + 등록 완료 토스트. */
  submitted?: boolean
  /** 방금 등록한 리뷰에 사진이 있었는지. 등록 완료 토스트의 적립금(포토 500원, 텍스트 300원)을 가른다. */
  photo?: boolean
}

// 내 리뷰 / 작성 대기(b4-st-6).
export const Route = createFileRoute('/reviews/mine')({
  validateSearch: (search: Record<string, unknown>): MyReviewsSearch => ({
    submitted: search.submitted === true || search.submitted === 'true',
    photo: search.photo === true || search.photo === 'true',
  }),
  component: MyReviewsRoute,
})

function MyReviewsRoute() {
  const { submitted, photo } = Route.useSearch()
  return <MyReviewsScreen submitted={submitted} photo={photo} />
}
