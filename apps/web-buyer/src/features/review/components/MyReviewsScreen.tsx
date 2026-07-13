import { useState } from 'react'
import { useNavigate, useRouter } from '@tanstack/react-router'
import { Gift, Image as ImageIcon, ListChecks } from 'lucide-react'
import type { Review } from '@aechak/domain'
import {
  Button,
  EmptyState,
  MobileScreen,
  Modal,
  SegmentedControl,
} from '@aechak/design-system/web'
import { AppToast } from '@/shared/components/AppToast'
import { BackAppBar } from '@/shared/components/BackAppBar'
import { ImageLightbox } from '@/shared/components/ImageLightbox'
import { useAccount } from '@/shared/account'
import { findProduct } from '@/shared/catalog'
import { useDeleteReview, useMyReviews } from '../review.queries'
import { REVIEW_REWARD, type PendingReview } from '../review.mock'
import { MyReviewCard } from './MyReviewCard'

type MyReviewTab = 'pending' | 'completed'

// 내 리뷰(b4-st-6). 작성 대기(배송완료·구매확정 미작성) / 작성 완료 탭 + 등록 완료 토스트.
export function MyReviewsScreen({ submitted = false }: { submitted?: boolean }) {
  const navigate = useNavigate()
  const router = useRouter()
  const { pending, completed } = useMyReviews()
  const { nickname } = useAccount()
  const deleteReview = useDeleteReview()

  // 방금 리뷰를 등록하고 돌아왔으면 완료 탭을 먼저 보여주고 성공 토스트를 띄운다.
  const [tab, setTab] = useState<MyReviewTab>(submitted ? 'completed' : 'pending')
  const [toast, setToast] = useState<{ open: boolean; message: string }>({
    open: submitted,
    message: submitted ? `리뷰가 등록됐어요. 적립금 ${REVIEW_REWARD.toLocaleString('ko-KR')}원 지급 예정` : '',
  })
  const [deleteTarget, setDeleteTarget] = useState<Review | null>(null)
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null)

  const goBack = () => {
    if (window.history.length > 1) router.history.back()
    else navigate({ to: '/' })
  }

  const writeReview = (productId: string, orderId: string) =>
    navigate({ to: '/reviews/write', search: { productId, orderId } })

  const editReview = (review: Review) =>
    navigate({ to: '/reviews/write', search: { reviewId: review.id } })

  const handleDelete = () => {
    if (!deleteTarget) return
    deleteReview.mutate(deleteTarget.id, {
      onSuccess: () => {
        setDeleteTarget(null)
        setToast({ open: true, message: '리뷰를 삭제했어요.' })
      },
    })
  }

  return (
    <MobileScreen header={<BackAppBar onBack={goBack} title="내 리뷰" />}>
      <div className="flex flex-col gap-3 p-4">
        <SegmentedControl
          options={[
            { value: 'pending', label: `작성 대기 ${pending.length}` },
            { value: 'completed', label: `작성 완료 ${completed.length}` },
          ]}
          value={tab}
          onChange={value => setTab(value as MyReviewTab)}
        />

        {tab === 'pending' ? (
          pending.length === 0 ? (
            <EmptyPanel
              title="작성할 리뷰가 없어요"
              description="배송이 완료되면 여기에서 리뷰를 남길 수 있어요."
            />
          ) : (
            pending.map(item => (
              <PendingCard
                key={`${item.orderId}-${item.productId}`}
                item={item}
                onWrite={() => writeReview(item.productId, item.orderId)}
              />
            ))
          )
        ) : completed.length === 0 ? (
          <EmptyPanel
            title="작성한 리뷰가 없어요"
            description="상품을 사용해 보고 첫 리뷰를 남겨 보세요."
          />
        ) : (
          completed.map(review => {
            const product = findProduct(review.productId)
            return (
              <MyReviewCard
                key={review.id}
                review={review}
                nickname={nickname}
                productName={product?.name}
                thumbnailUrl={product?.thumbnailUrl}
                onEdit={() => editReview(review)}
                onDelete={() => setDeleteTarget(review)}
                onImageOpen={setLightboxSrc}
              />
            )
          })
        )}
      </div>

      <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} alt="리뷰 사진" />

      <Modal
        open={deleteTarget != null}
        onClose={() => setDeleteTarget(null)}
        title="리뷰를 삭제할까요?"
        description="삭제하면 되돌릴 수 없고 지급된 적립금이 회수될 수 있어요."
        confirmLabel="삭제하기"
        cancelLabel="닫기"
        confirmVariant="danger"
        onConfirm={handleDelete}
        loading={deleteReview.isPending}
      />

      <AppToast
        open={toast.open}
        onClose={() => setToast(t => ({ ...t, open: false }))}
        message={toast.message}
        variant="success"
      />
    </MobileScreen>
  )
}

function PendingCard({ item, onWrite }: { item: PendingReview; onWrite: () => void }) {
  return (
    <div className="flex flex-col gap-3 rounded-card border border-border-subtle bg-surface-raised p-4">
      <div className="flex items-center gap-3">
        <div className="size-14 flex-none overflow-hidden rounded-image bg-surface-sunken">
          {item.thumbnailUrl ? (
            <img src={item.thumbnailUrl} alt="" className="size-full object-cover" />
          ) : (
            <div className="flex size-full items-center justify-center text-icon-muted">
              <ImageIcon className="size-6" />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-body-sm text-text-primary">{item.name}</p>
          <p className="mt-0.5 text-caption text-text-tertiary">{item.since}</p>
        </div>
      </div>
      <div className="flex items-center justify-between rounded-md bg-neutral-surface px-3 py-2">
        <span className="flex items-center gap-1 text-caption text-text-secondary">
          <Gift className="size-3.5" />
          포토 리뷰 적립금 {REVIEW_REWARD.toLocaleString('ko-KR')}원
        </span>
        <Button variant="primary" size="sm" onClick={onWrite} className="flex-none">
          리뷰 쓰기
        </Button>
      </div>
    </div>
  )
}

function EmptyPanel({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-1 items-center justify-center py-16">
      <EmptyState icon={<ListChecks className="size-8" />} title={title} description={description} />
    </div>
  )
}
