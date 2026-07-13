import { useState } from 'react'
import { useNavigate, useRouter } from '@tanstack/react-router'
import { CheckCircle2, Image as ImageIcon } from 'lucide-react'
import type { ProductReportReason } from '@aechak/domain'
import {
  BottomFixedAction,
  EmptyState,
  MobileScreen,
  Radio,
  StatusPill,
  Textarea,
} from '@aechak/design-system/web'
import { BackAppBar } from '@/shared/components/BackAppBar'
import { formatKRW } from '@/shared/formatKRW'
import {
  MAX_REPORT_DETAIL_LENGTH,
  PRODUCT_REPORT_REASONS,
  getReportTargetMock,
  isValidReportReason,
} from '../report.mock'
import { useSubmitReport } from '../report.queries'

// 상품 신고(b8-st-1-product). 목업은 상품 위 BottomSheet지만 우리 앱에서는 전용 full-bleed
// 라우트로 구현한다 — 대상 컨텍스트 카드 + 사유 라디오 5종 + 상세(선택) + 제출 → 접수 완료.
// SNS 게시물/유저 신고는 이번 범위 밖(상품 신고만).
export function ProductReportScreen({ productId }: { productId: string }) {
  const navigate = useNavigate()
  const router = useRouter()
  const target = getReportTargetMock(productId)
  const submit = useSubmitReport()

  const [reason, setReason] = useState<ProductReportReason | ''>('')
  const [detail, setDetail] = useState('')
  const [done, setDone] = useState(false)

  const goBack = () => {
    if (window.history.length > 1) router.history.back()
    else navigate({ to: '/products/$productId', params: { productId } })
  }

  if (!target) {
    return (
      <MobileScreen header={<BackAppBar onBack={goBack} title="상품 신고" />}>
        <div className="flex h-full items-center justify-center p-6">
          <EmptyState
            title="상품을 찾을 수 없어요"
            description="삭제되었거나 주소가 올바르지 않은 상품이에요."
            action={{ label: '상품 둘러보기', onClick: () => navigate({ to: '/market' }) }}
          />
        </div>
      </MobileScreen>
    )
  }

  // 접수 완료 상태.
  if (done) {
    return (
      <MobileScreen
        header={<BackAppBar onBack={goBack} title="상품 신고" />}
        footer={<BottomFixedAction primary={{ label: '확인', onClick: goBack }} />}
      >
        <div className="flex h-full flex-col items-center justify-center gap-4 px-8 text-center">
          <span className="flex size-16 items-center justify-center rounded-full bg-success-surface text-success-fg">
            <CheckCircle2 className="size-10" />
          </span>
          <p className="text-title font-bold text-text-primary">신고가 접수됐어요</p>
          <p className="text-body-sm leading-relaxed text-text-secondary">
            검수 후 정책에 따라 조치할게요.
            <br />
            신고자 정보는 공개되지 않으니 안심하세요.
          </p>
        </div>
      </MobileScreen>
    )
  }

  const canSubmit = isValidReportReason(reason)

  const handleSubmit = () => {
    if (!isValidReportReason(reason)) return
    submit.mutate(
      { productId, reason, detail },
      { onSuccess: () => setDone(true) },
    )
  }

  return (
    <MobileScreen
      header={<BackAppBar onBack={goBack} title="상품 신고" />}
      footer={
        <BottomFixedAction
          primary={{
            label: '상품 신고 제출',
            onClick: handleSubmit,
            disabled: !canSubmit,
            loading: submit.isPending,
          }}
        />
      }
    >
      <div className="flex flex-col gap-4 p-4">
        {/* 신고 대상 컨텍스트 카드 */}
        <div className="flex items-center gap-2.5 rounded-card bg-surface-sunken p-3">
          <div className="flex size-11 flex-none items-center justify-center overflow-hidden rounded-image bg-surface-raised text-icon-muted">
            {target.thumbnailUrl ? (
              <img src={target.thumbnailUrl} alt="" className="size-full object-cover" />
            ) : (
              <ImageIcon className="size-5" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-label text-text-primary">{target.name}</p>
            <p className="truncate text-caption text-text-tertiary">
              {target.storeName} / {formatKRW(target.price)}
            </p>
          </div>
          <StatusPill variant="neutral">상품</StatusPill>
        </div>

        <div className="flex flex-col gap-1">
          <p className="text-subheading font-semibold text-text-primary">
            상품 신고 사유를 선택해 주세요
          </p>
          <p className="text-body-sm text-text-secondary">
            잘못된 상품 정보나 정책 위반 상품을 알려주시면 검수 후 조치해요.
          </p>
        </div>

        {/* 사유 라디오 5종 — 주문 취소 화면과 동일한 테두리 없는 촘촘한 행 디자인(gap-0.5 + min-h-10).
            라디오는 자체 label이라 바깥을 또 label로 감싸지 않고 div로만 감싼다. */}
        <div className="flex flex-col gap-0.5">
          {PRODUCT_REPORT_REASONS.map(r => (
            <div key={r.value} className="flex min-h-10 items-center">
              <Radio
                name="report-reason"
                value={r.value}
                checked={reason === r.value}
                onChange={() => setReason(r.value)}
                label={r.label}
              />
            </div>
          ))}
        </div>

        {/* 상세 내용(선택) */}
        <div className="flex flex-col gap-1.5">
          <span className="text-label font-semibold text-text-primary">
            상세 내용 <span className="font-normal text-text-tertiary">(선택)</span>
          </span>
          <Textarea
            value={detail}
            onChange={setDetail}
            maxLength={MAX_REPORT_DETAIL_LENGTH}
            placeholder="어떤 점이 문제인지 적어주시면 검수에 도움이 돼요."
          />
        </div>
      </div>
    </MobileScreen>
  )
}
