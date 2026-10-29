import { useState } from 'react'
import { Button, Card, ReviewCard, StatusPill, Textarea } from '@aechak/design-system/web'
import type { SampleReview } from '../reviews.mock'

interface ReviewReplyListProps {
  reviews: SampleReview[]
  /** 예시 화면에서는 저장하지 않고 토스트만 띄운다(호출부가 문구를 소유한다). */
  onReply: () => void
  onReport: () => void
}

// 리뷰 본문은 DS ReviewCard를 그대로 쓰고, 셀러 답글만 아래에 덧붙인다(DS를 고치지 않는다).
export function ReviewReplyList({ reviews, onReply, onReport }: ReviewReplyListProps) {
  // 어느 리뷰의 답글 폼을 열었는지와 그 초안. 리뷰마다 폼을 늘 펼치면 목록이 읽히지 않는다.
  const [openId, setOpenId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')

  if (reviews.length === 0) {
    return (
      <Card padding="md">
        <p className="py-6 text-center text-body-sm text-text-tertiary">조건에 맞는 리뷰가 없어요.</p>
      </Card>
    )
  }

  return (
    <ul className="flex flex-col gap-3">
      {reviews.map(review => {
        const isOpen = openId === review.reviewPublicId
        return (
          <li key={review.reviewPublicId}>
            <Card padding="md">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="text-body-sm font-medium text-text-primary">{review.productName}</span>
                {review.photoCount > 0 && (
                  <StatusPill variant="info" size="sm">
                    사진 {review.photoCount}장
                  </StatusPill>
                )}
                {review.reported && (
                  <StatusPill variant="danger" size="sm">
                    신고 접수
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
                author={review.authorMasked}
                rating={review.rating}
                date={review.writtenAt}
                content={review.content}
                verifiedPurchase
              />

              {review.reply != null && (
                <div className="mt-2.5 rounded-card border border-border-subtle bg-surface-sunken p-3.5">
                  <p className="text-caption text-text-tertiary">
                    내 답글 / {review.reply.repliedAt}
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
                    maxLength={500}
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
                      disabled={draft.trim() === ''}
                      onClick={() => {
                        setOpenId(null)
                        onReply()
                      }}
                    >
                      답글 등록
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="mt-2.5 flex justify-end gap-2">
                  {!review.reported && (
                    <Button variant="ghost" size="sm" onClick={onReport}>
                      신고
                    </Button>
                  )}
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setOpenId(review.reviewPublicId)
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
