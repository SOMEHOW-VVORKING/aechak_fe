import { createFileRoute } from '@tanstack/react-router'
import { UnavailableScreen } from '@/shared/components/UnavailableScreen'

export const Route = createFileRoute('/reviews/')({
  component: ReviewsRoute,
})

/**
 * 셀러 nav에는 "리뷰 관리"가 처음부터 있었지만 라우트 파일은 한 번도
 * 만들어진 적이 없어 메뉴만 되살리면 404로 갔다 — 자리를 만들고 안내를 둔다.
 *
 * BE 실측(2026-10-26, dev 스펙 전수): 리뷰 경로는 구매자 호스트에만 있다
 * (`GET /api/v1/products/{productId}/reviews`·`GET /api/v1/users/me/reviews`). 둘 다 구매자
 * 시점이라 "내가 판 상품 전체의 리뷰"로 묶을 수 없고 셀러 답글 경로도 없다. seller 호스트에는
 * 리뷰 경로가 아예 없다. 셀러용 조회·답글이 생기면 이 안내 대신 실화면을 그린다.
 */
function ReviewsRoute() {
  return (
    <UnavailableScreen
      title="리뷰 관리"
      message="리뷰 관리는 준비 중이에요"
      description="내 상품에 달린 리뷰를 모아 보고 답글을 쓰는 화면이에요. 서버가 준비되면 열어 둘게요."
      upcoming={[
        {
          label: '내 상품 리뷰 목록',
          description: '내가 판 상품에 달린 리뷰를 상품/별점/작성일로 골라 봐요.',
        },
        {
          label: '셀러 답글',
          description: '리뷰에 답글을 쓰고 고쳐요.',
        },
        {
          label: '별점 요약',
          description: '상품별 평균 별점과 별점 분포를 봐요.',
        },
        {
          label: '리뷰 신고',
          description: '허위/비방 리뷰를 운영자에게 신고하고 처리 결과를 봐요.',
        },
      ]}
    />
  )
}
