import { useState } from 'react'
import { Button, Card, ReviewCard, StatusPill, Textarea } from '@aechak/design-system/web'
import {
  photoCountOf,
  REPLY_CONTENT_MAX,
  toDateLabel,
  type SellerReview,
} from '../reviews.contract'

interface ReviewReplyListProps {
  reviews: SellerReview[]
  /** 답글 등록·수정. 등록인지 수정인지는 행의 reply 유무가 정한다(서버도 POST/PUT으로 갈린다). */
  onSubmit: (review: SellerReview, content: string) => void
  onDelete: (review: SellerReview) => void
  /** 처리 중인 리뷰 — 그 행의 버튼만 잠근다. */
  pendingReviewId?: number | null
  /**
   * 목록 조회가 실패한 동안 처리를 잠근다. 재조회 실패 시 react-query가 직전 데이터를 들고 있어
   * 행이 그대로 남는데, 폼은 **그 행의 값**으로 만들어지므로 낡은 행에서 누르면 서버에 없는 상태를
   * 보고 지시하게 된다(AGENTS.md 규약 7). 행 자체는 지우지 않는다 — 마지막으로 본 내용은 정보다.
   */
  locked?: boolean
  /**
   * 빈 상태 문구를 숨긴다. 목록 조회가 **실패**해 행이 없는 경우로, 그때 "조건에 맞는 리뷰가 없어요"를
   * 띄우면 셀러가 서버 오류를 필터 탓으로 읽는다(AGENTS.md 규약 7). 이유는 화면 위 오류 안내가 말한다.
   */
  hideEmptyState?: boolean
}

// 리뷰 본문은 DS ReviewCard를 그대로 쓰고, 셀러 답글만 아래에 덧붙인다(DS를 고치지 않는다).
export function ReviewReplyList({
  reviews,
  onSubmit,
  onDelete,
  pendingReviewId = null,
  locked = false,
  hideEmptyState = false,
}: ReviewReplyListProps) {
  // 어느 리뷰의 답글 폼을 열었는지와 그 초안. 리뷰마다 폼을 늘 펼치면 목록이 읽히지 않는다.
  const [openId, setOpenId] = useState<number | null>(null)
  const [draft, setDraft] = useState('')

  if (reviews.length === 0) {
    if (hideEmptyState) return null
    return (
      <Card padding="md">
        <p className="py-6 text-center text-body-sm text-text-tertiary">
          조건에 맞는 리뷰가 없어요.
        </p>
      </Card>
    )
  }

  return (
    <ul className="flex flex-col gap-3">
      {reviews.map(review => {
        const isOpen = openId === review.reviewId
        const isPending = pendingReviewId === review.reviewId
        const photoCount = photoCountOf(review)
        return (
          <li key={review.reviewId}>
            <Card padding="md">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="text-body-sm font-medium text-text-primary">
                  {review.productName}
                </span>
                {photoCount > 0 && (
                  <StatusPill variant="info" size="sm">
                    사진 {photoCount}장
                  </StatusPill>
                )}
                {review.reply == null ? (
                  <StatusPill variant="warning" size="sm">
                    답글 없음
                  </StatusPill>
                ) : (
                  <StatusPill variant="success" size="sm">
                    답글 완료
                  </StatusPill>
                )}
              </div>

              <ReviewCard
                author={review.authorNickname}
                rating={review.rating}
                date={toDateLabel(review.createdAt)}
                content={review.content}
                verifiedPurchase
              />

              {review.reply != null && (
                <div className="mt-2.5 rounded-card border border-border-subtle bg-surface-sunken p-3.5">
                  <p className="text-caption text-text-tertiary">
                    내 답글 / {toDateLabel(review.reply.repliedAt)}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-body-sm text-text-primary">
                    {review.reply.content}
                  </p>
                </div>
              )}

              {isOpen ? (
                <div className="mt-2.5 flex flex-col gap-2">
                  <Textarea
                    label="셀러 답글"
                    value={draft}
                    maxLength={REPLY_CONTENT_MAX}
                    rows={4}
                    placeholder="구매자에게 보낼 답글을 적어 주세요."
                    onChange={setDraft}
                  />
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setOpenId(null)}>
                      취소
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      disabled={draft.trim() === '' || isPending || locked}
                      onClick={() => {
                        setOpenId(null)
                        onSubmit(review, draft.trim())
                      }}
                    >
                      {review.reply == null ? '답글 등록' : '답글 수정'}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="mt-2.5 flex justify-end gap-2">
                  {review.reply != null && (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={isPending || locked}
                      onClick={() => onDelete(review)}
                    >
                      답글 삭제
                    </Button>
                  )}
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={isPending || locked}
                    onClick={() => {
                      setOpenId(review.reviewId)
                      setDraft(review.reply?.content ?? '')
                    }}
                  >
                    {review.reply == null ? '답글 쓰기' : '답글 수정'}
                  </Button>
                </div>
              )}
            </Card>
          </li>
        )
      })}
    </ul>
  )
}
