import { useMemo, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Button, FilterBar, MetricCard, PageHeader, Select, StatusPill } from '@aechak/design-system/web'
import {
  RatingSummaryPanel,
  ReviewReplyList,
  SAMPLE_RATING_SUMMARY,
  SAMPLE_REVIEWS,
  SAMPLE_REVIEW_PRODUCTS,
} from '@/features/reviews'
import { SAMPLE_ACTION_TOAST, SampleDataNotice } from '@/shared/components/SampleDataNotice'
import { useToast } from '@/shared/hooks/useToast'

export const Route = createFileRoute('/reviews/')({
  component: ReviewsRoute,
})

/**
 * 리뷰 관리 — 셀러 nav에 처음부터 있던 항목이고 SCRUM-301이 라우트 파일을 신설했다.
 *
 * SCRUM-307에서 **안내만 있던 화면을 예시 데이터로 채웠다**(`UnavailableScreen` → 별점 요약 + 리뷰
 * 목록 + 답글 폼). 지운 것은 없고, 저장되지 않는다는 사실은 상단 `SampleDataNotice` 띠가 말한다.
 *
 * 예시 데이터와 BE가 생겼을 때의 교체 방법은 `features/reviews/reviews.mock.ts` 머리에 있다.
 */

const PRODUCT_OPTIONS = [
  { value: '', label: '전체 상품' },
  ...SAMPLE_REVIEW_PRODUCTS.map(name => ({ value: name, label: name })),
]

const RATING_OPTIONS = [
  { value: '', label: '전체 별점' },
  ...[5, 4, 3, 2, 1].map(rating => ({ value: String(rating), label: `${rating}점` })),
]

const REPLY_OPTIONS = [
  { value: '', label: '답글 전체' },
  { value: 'NONE', label: '답글 없음' },
  { value: 'DONE', label: '답글 완료' },
]

function ReviewsRoute() {
  const [product, setProduct] = useState('')
  const [rating, setRating] = useState('')
  const [reply, setReply] = useState('')
  const toast = useToast()

  const noReplyCount = SAMPLE_REVIEWS.filter(review => review.reply == null).length
  const reportedCount = SAMPLE_REVIEWS.filter(review => review.reported).length

  // 필터는 예시 배열에 실제로 적용한다 — 눌러도 아무 일 없는 컨트롤은 장식 UI다(AGENTS.md 2절).
  const rows = useMemo(
    () =>
      SAMPLE_REVIEWS.filter(review => {
        if (product !== '' && review.productName !== product) return false
        if (rating !== '' && String(review.rating) !== rating) return false
        if (reply === 'NONE' && review.reply != null) return false
        if (reply === 'DONE' && review.reply == null) return false
        return true
      }),
    [product, rating, reply],
  )

  const notSent = () => toast.show(SAMPLE_ACTION_TOAST, 'info')

  return (
    <div className="p-6">
      <PageHeader title="리뷰 관리" actions={<StatusPill variant="muted">준비 중</StatusPill>} />

      <SampleDataNotice
        replaceWhen={
          <>
            seller 호스트에 <strong>GET /sellers/me/reviews</strong>와 답글 경로가 생기면 내 상품의
            실제 리뷰로 바뀌어요.
          </>
        }
      />

      <RatingSummaryPanel summary={SAMPLE_RATING_SUMMARY} />

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <MetricCard
          label="답글 없는 리뷰"
          value={`${noReplyCount}건`}
          variant={noReplyCount > 0 ? 'urgent' : 'default'}
        />
        <MetricCard
          label="신고 접수"
          value={`${reportedCount}건`}
          variant={reportedCount > 0 ? 'urgent' : 'default'}
        />
        <MetricCard label="최근 30일 리뷰" value="47건" variant="quiet" />
      </div>

      <FilterBar className="mt-4">
        <Select aria-label="상품" options={PRODUCT_OPTIONS} value={product} onChange={setProduct} />
        <Select aria-label="별점" options={RATING_OPTIONS} value={rating} onChange={setRating} />
        <Select aria-label="답글 여부" options={REPLY_OPTIONS} value={reply} onChange={setReply} />
        <Button
          variant="ghost"
          size="md"
          onClick={() => {
            setProduct('')
            setRating('')
            setReply('')
          }}
        >
          초기화
        </Button>
      </FilterBar>

      <p className="mt-4 text-caption text-text-tertiary">총 {rows.length}건</p>

      <div className="mt-2">
        <ReviewReplyList reviews={rows} onReply={notSent} onReport={notSent} />
      </div>

      <p className="mt-3.5 text-caption text-text-tertiary">
        답글은 구매자와 다른 방문자 모두에게 보여요. 허위/비방 리뷰는 신고하면 운영자가 확인해요.
      </p>

      {toast.element}
    </div>
  )
}
