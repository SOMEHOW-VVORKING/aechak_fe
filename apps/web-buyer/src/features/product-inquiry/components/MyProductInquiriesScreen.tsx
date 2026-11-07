import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Lock } from 'lucide-react'
import {
  Button,
  Card,
  MobileScreen,
  Modal,
  Skeleton,
  StatusPill,
  type ToastVariant,
} from '@aechak/design-system/web'
import type { MyProductInquiryItem } from '@aechak/api'
import { AppToast } from '@/shared/components/AppToast'
import { BackAppBar } from '@/shared/components/BackAppBar'
import { ScreenEmptyState } from '@/shared/components/ScreenEmptyState'
import { useSafeBack } from '@/shared/useSafeBack'
import {
  INQUIRY_CATEGORY_LABEL,
  INQUIRY_STATUS_LABEL,
  INQUIRY_STATUS_VARIANT,
  inquiryDate,
} from '../productInquiry.labels'
import {
  productInquiryErrorMessage,
  useMyProductInquiries,
  useWithdrawProductInquiry,
} from '../productInquiry.queries'
import { LoadMoreInquiries } from './LoadMoreInquiries'

/**
 * 내 상품 문의(SCRUM-340). 등록한 문의를 모아 보고 답변 대기 중인 건을 철회한다.
 *
 * 철회 대상 state를 이 화면이 소유하고 확인 Modal은 대상이 있을 때만 렌더한다(확인 Modal 관례).
 * mutation도 화면이 들고 `loading`으로 내려 준다 — Modal이 스스로 mutation을 만들면 목록의
 * 다른 행 버튼을 함께 잠글 수 없다.
 */
export function MyProductInquiriesScreen() {
  const navigate = useNavigate()
  const inquiries = useMyProductInquiries()
  const withdraw = useWithdrawProductInquiry()
  const [target, setTarget] = useState<MyProductInquiryItem | null>(null)
  const [toast, setToast] = useState<{ open: boolean; message: string; variant: ToastVariant }>({
    open: false,
    message: '',
    variant: 'success',
  })

  const goBack = useSafeBack({ to: '/mypage' })

  const confirmWithdraw = () => {
    if (!target) return
    withdraw.mutate(
      { inquiryId: target.inquiryId, productId: target.productId },
      {
        onSuccess: () => {
          setTarget(null)
          setToast({ open: true, message: '문의를 철회했어요', variant: 'success' })
        },
        // 실패하면 확인창을 닫고 사유를 알린다 — 답변이 달렸거나 이미 철회한 건이라 재시도는 의미가 없다.
        onError: error => {
          setTarget(null)
          setToast({ open: true, message: productInquiryErrorMessage(error), variant: 'error' })
        },
      },
    )
  }

  return (
    <MobileScreen header={<BackAppBar onBack={goBack} title="내 상품 문의" />}>
      {inquiries.isError ? (
        // "문의가 없음"과 "불러오지 못함"을 가른다.
        <ScreenEmptyState
          title="문의를 불러오지 못했어요"
          description="잠시 후 다시 시도해주세요."
          action={{ label: '다시 시도', onClick: inquiries.refetch }}
        />
      ) : inquiries.isLoading ? (
        <div className="flex flex-col gap-3 p-4">
          {[0, 1, 2].map(i => (
            <Skeleton key={i} variant="rect" className="h-28 w-full" />
          ))}
        </div>
      ) : inquiries.items.length === 0 ? (
        <ScreenEmptyState
          title="아직 등록한 문의가 없어요"
          description="상품 상세에서 판매자에게 물어볼 수 있어요."
          action={{ label: '상품 둘러보기', onClick: () => navigate({ to: '/market' }) }}
        />
      ) : (
        <div className="flex flex-col gap-3 p-4">
          <p className="text-body-sm text-text-secondary">
            전체 {inquiries.totalCount.toLocaleString('ko-KR')}건
          </p>
          {inquiries.items.map(item => (
            <MyInquiryCard
              key={item.inquiryId}
              item={item}
              onProductClick={() =>
                navigate({ to: '/products/$productId', params: { productId: item.productId } })
              }
              onWithdrawClick={() => setTarget(item)}
              // 철회가 떠 있는 동안에는 다른 행의 철회도 잠근다(되돌릴 수 없는 조치가 겹치지 않게).
              withdrawDisabled={withdraw.isPending}
            />
          ))}
          {inquiries.hasNextPage && (
            <LoadMoreInquiries
              onClick={inquiries.fetchNextPage}
              loading={inquiries.isFetchingNextPage}
            />
          )}
        </div>
      )}

      {/* 철회 확인. **요청이 떠 있는 동안에는 ESC·스크림·취소로 닫히지 않는다** — 공용 Modal은
          loading과 무관하게 onClose를 부르므로(4개 앱 공용이라 고치지 않는다) 호출부에서 막는다.
          닫히면 되돌릴 수 없는 요청이 떠 있는데 화면은 아무 일도 없던 것처럼 보인다. */}
      {target && (
        <Modal
          open
          onClose={() => {
            if (!withdraw.isPending) setTarget(null)
          }}
          title="문의를 철회할까요?"
          description="철회하면 되돌릴 수 없고, 판매자의 받은 문의 목록에서도 사라져요."
          confirmLabel="철회하기"
          confirmVariant="danger"
          onConfirm={confirmWithdraw}
          loading={withdraw.isPending}
        />
      )}

      <AppToast
        open={toast.open}
        onClose={() => setToast(t => ({ ...t, open: false }))}
        message={toast.message}
        variant={toast.variant}
      />
    </MobileScreen>
  )
}

/** 내 문의 한 건. 본인 목록이라 비밀글도 본문이 그대로 내려오므로 가리지 않는다. */
function MyInquiryCard({
  item,
  onProductClick,
  onWithdrawClick,
  withdrawDisabled,
}: {
  item: MyProductInquiryItem
  onProductClick: () => void
  onWithdrawClick: () => void
  withdrawDisabled: boolean
}) {
  // 답변 대기(RECEIVED)만 철회할 수 있다 — 서버도 답변 뒤에는 409로 거절한다(120111).
  const canWithdraw = item.status === 'RECEIVED'

  return (
    <Card className="flex flex-col gap-2 p-4">
      <div className="flex items-center gap-1.5">
        <StatusPill variant={INQUIRY_STATUS_VARIANT[item.status]} size="sm">
          {INQUIRY_STATUS_LABEL[item.status]}
        </StatusPill>
        <StatusPill variant="neutral" size="sm">
          {INQUIRY_CATEGORY_LABEL[item.category]}
        </StatusPill>
        {item.secret && (
          <span className="flex items-center gap-0.5 text-caption text-text-tertiary">
            <Lock className="size-3" aria-hidden="true" />
            비밀글
          </span>
        )}
        {/* 기한 지남은 서버 판정값(overdue)을 그대로 쓴다 — 날짜를 다시 빼면 셀러 화면과 어긋난다. */}
        {item.overdue && (
          <StatusPill variant="error" size="sm">
            답변 기한 지남
          </StatusPill>
        )}
      </div>

      <button
        type="button"
        onClick={onProductClick}
        className="self-start text-caption text-text-tertiary underline"
      >
        {item.productName}
      </button>

      <p className="text-label font-semibold text-text-primary">{item.title}</p>
      <p className="whitespace-pre-wrap text-body-sm leading-relaxed text-text-secondary">
        {item.content}
      </p>
      <p className="text-caption text-text-tertiary">{inquiryDate(item.askedAt)}</p>

      {item.answer && (
        <div className="mt-1 rounded-card bg-surface-sunken p-3">
          <p className="text-caption font-semibold text-text-secondary">판매자 답변</p>
          <p className="mt-1 whitespace-pre-wrap text-body-sm leading-relaxed text-text-primary">
            {item.answer.content}
          </p>
          <p className="mt-1.5 text-caption text-text-tertiary">
            {inquiryDate(item.answer.answeredAt)}
          </p>
        </div>
      )}

      {canWithdraw && (
        <Button
          variant="ghost"
          size="sm"
          className="self-end"
          onClick={onWithdrawClick}
          disabled={withdrawDisabled}
        >
          철회하기
        </Button>
      )}
    </Card>
  )
}
