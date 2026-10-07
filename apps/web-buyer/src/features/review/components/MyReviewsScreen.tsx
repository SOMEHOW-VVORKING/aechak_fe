import { useState, type ReactNode } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Gift, Image as ImageIcon, ListChecks } from 'lucide-react'
import type { ReviewStatus } from '@aechak/api'
import {
  Button,
  EmptyState,
  MobileScreen,
  Modal,
  SegmentedControl,
  Skeleton,
} from '@aechak/design-system/web'
import { AppToast } from '@/shared/components/AppToast'
import { BackAppBar } from '@/shared/components/BackAppBar'
import { useSafeBack } from '@/shared/useSafeBack'
import { ImageLightbox } from '@/shared/components/ImageLightbox'
import { useAccount } from '@/shared/account'
import {
  reviewErrorMessage,
  serverReviewId,
  useDeleteReview,
  useMyReviews,
  type MyReviewTabView,
  type MyWrittenReview,
} from '../review.queries'
import { REVIEW_REWARD, type PendingReview } from '../review.mock'
import { MyReviewCard } from './MyReviewCard'

type MyReviewTab = 'pending' | 'completed'

// 운영 조치로 다른 구매자에게 원문 그대로 보이지 않는 내 리뷰에 붙이는 안내(BE가 상태를 그대로 내려준다).
// 문구는 기획 screens.html의 b4-st-3(가려졌어요)/b9-st-11(일부 표현 가림, 리뷰 비노출)/블라인드 통보 문구를 따른다.
// MASKED: 금지어만 *로 바꾼 본문이 내려온다. BLOCKED: 금지어 비율 초과로 저장은 되지만 비노출.
// HIDDEN: 신고 누적/운영자 블라인드(CRQ-RPT-02, ADM-02) 자리. BE에 아직 이 상태로 바꾸는 경로는 없다.
const STATUS_NOTICE: Partial<Record<ReviewStatus, string>> = {
  MASKED: '커뮤니티 정책에 따라 일부 표현이 가려졌어요.',
  BLOCKED: '정책 위반 표현이 포함되어 블라인드됐어요. 다른 구매자에게는 보이지 않아요.',
  HIDDEN: '커뮤니티 정책에 따라 블라인드 처리됐어요. 다른 구매자에게는 보이지 않아요.',
}

const tabLabel = (label: string, count: number | null) => (count == null ? label : `${label} ${count}`)

// 내 리뷰(b4-st-6). 작성 대기(배송완료·구매확정 미작성) / 작성 완료 탭 + 등록 완료 토스트.
export function MyReviewsScreen({ submitted = false }: { submitted?: boolean }) {
  const navigate = useNavigate()
  const { pending, completed } = useMyReviews()
  const { nickname } = useAccount()
  const deleteReview = useDeleteReview()

  // 방금 리뷰를 등록하고 돌아왔으면 완료 탭을 먼저 보여주고 성공 토스트를 띄운다.
  const [tab, setTab] = useState<MyReviewTab>(submitted ? 'completed' : 'pending')
  const [toast, setToast] = useState<{ open: boolean; message: string; variant: 'success' | 'error' }>({
    open: submitted,
    message: submitted ? `리뷰가 등록됐어요. 적립금 ${REVIEW_REWARD.toLocaleString('ko-KR')}원 지급 예정` : '',
    variant: 'success',
  })
  const [deleteTarget, setDeleteTarget] = useState<MyWrittenReview | null>(null)
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null)

  const goBack = useSafeBack({ to: '/' })

  // 서버 작성 대기는 주문 품목 id와 표시용 스냅샷을 넘긴다(작성 화면이 새로고침돼도 그대로 그린다).
  // 목업 주문 항목은 주문 스토어에서 품목을 찾도록 orderId만 넘긴다.
  const writeReview = (item: PendingReview) =>
    navigate({
      to: '/reviews/write',
      search:
        item.orderItemId != null
          ? {
              productId: item.productId,
              orderItemId: item.orderItemId,
              productName: item.name,
              option: item.option,
              thumbnailUrl: item.thumbnailUrl,
            }
          : { productId: item.productId, orderId: item.orderId },
    })

  const editReview = (review: MyWrittenReview) =>
    navigate({ to: '/reviews/write', search: { reviewId: review.id } })

  const handleDelete = () => {
    if (!deleteTarget) return
    deleteReview.mutate(deleteTarget, {
      onSuccess: () => {
        setDeleteTarget(null)
        setToast({ open: true, message: '리뷰를 삭제했어요.', variant: 'success' })
      },
      // 403(본인 리뷰 아님) 등 서버가 거절한 사유를 조용히 삼키지 않고 그대로 알린다.
      onError: error => {
        setDeleteTarget(null)
        setToast({ open: true, message: reviewErrorMessage(error), variant: 'error' })
      },
    })
  }

  return (
    <MobileScreen header={<BackAppBar onBack={goBack} title="내 리뷰" />}>
      <div className="flex flex-col gap-3 p-4">
        <SegmentedControl
          options={[
            { value: 'pending', label: tabLabel('작성 대기', pending.count) },
            { value: 'completed', label: tabLabel('작성 완료', completed.count) },
          ]}
          value={tab}
          onChange={value => setTab(value as MyReviewTab)}
        />

        {tab === 'pending' ? (
          <TabBody
            view={pending}
            empty={
              <EmptyPanel
                title="작성할 리뷰가 없어요"
                description="구매확정한 상품이 있으면 여기에서 리뷰를 남길 수 있어요."
              />
            }
            render={item => (
              <PendingCard
                key={item.orderItemId != null ? `srv-${item.orderItemId}` : `${item.orderId}-${item.productId}`}
                item={item}
                onWrite={() => writeReview(item)}
              />
            )}
          />
        ) : (
          <TabBody
            view={completed}
            empty={
              <EmptyPanel
                title="작성한 리뷰가 없어요"
                description="상품을 사용해 보고 첫 리뷰를 남겨 보세요."
              />
            }
            render={review => (
              <MyReviewCard
                key={review.id}
                review={review}
                nickname={nickname}
                productName={review.productName}
                thumbnailUrl={review.thumbnailUrl}
                notice={review.reviewStatus ? STATUS_NOTICE[review.reviewStatus] : undefined}
                // 수정 API가 없어 서버 리뷰는 삭제만 노출한다(로컬 목업 리뷰만 수정 가능).
                onEdit={serverReviewId(review.id) == null ? () => editReview(review) : undefined}
                onDelete={() => setDeleteTarget(review)}
                onImageOpen={setLightboxSrc}
              />
            )}
          />
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
        variant={toast.variant}
      />
    </MobileScreen>
  )
}

// 탭 본문. 서버 첫 페이지 전에는 스켈레톤, 첫 페이지가 실패하면 안내만 한다(401은 인터셉터가 로그인으로
// 보내고 재시도 버튼은 두지 않는 컨벤션). 이미 받은 목록이 있는데 더보기만 실패하면 목록을 유지하고
// 더보기 버튼으로 다시 시도한다.
function TabBody<T>({
  view,
  empty,
  render,
}: {
  view: MyReviewTabView<T>
  empty: ReactNode
  render: (item: T) => ReactNode
}) {
  if (view.items == null) {
    return view.isError ? (
      <div className="flex flex-1 items-center justify-center py-16">
        <EmptyState
          title="리뷰 목록을 불러오지 못했어요"
          description="네트워크 상태를 확인하고 잠시 후 다시 들어와 주세요."
        />
      </div>
    ) : (
      <div className="flex flex-col gap-3">
        <Skeleton variant="rect" className="h-32 w-full rounded-card" />
        <Skeleton variant="rect" className="h-32 w-full rounded-card" />
      </div>
    )
  }
  if (view.items.length === 0) return <>{empty}</>
  return (
    <>
      {view.items.map(render)}
      {view.hasNextPage && (
        <button
          type="button"
          onClick={view.fetchNextPage}
          disabled={view.isFetchingNextPage}
          className="h-11 w-full rounded-button border border-border bg-surface-base text-body-sm font-medium text-text-secondary transition-colors disabled:opacity-60"
        >
          {view.isFetchingNextPage ? '불러오는 중…' : '더보기'}
        </button>
      )}
    </>
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
          <p className="mt-0.5 text-caption text-text-tertiary">
            {item.reviewableUntil ? `${item.since} / ${item.reviewableUntil}까지 작성` : item.since}
          </p>
        </div>
      </div>
      <div className="flex items-center justify-between rounded-md bg-neutral-surface px-3 py-2">
        <span className="flex items-center gap-1 text-caption text-text-secondary">
          <Gift className="size-3.5" />
          포토 리뷰 적립금 {REVIEW_REWARD.toLocaleString('ko-KR')}원
        </span>
        {item.canReview === false ? (
          <span className="flex-none text-caption text-text-tertiary">작성 기간이 지났어요</span>
        ) : (
          <Button variant="primary" size="sm" onClick={onWrite} className="flex-none">
            리뷰 쓰기
          </Button>
        )}
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
