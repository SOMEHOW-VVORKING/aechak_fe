import { useMemo, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import type { Claim, ClaimType } from '@aechak/domain'
import { PageHeader, Tabs } from '@aechak/design-system/web'
import {
  CLAIM_TYPE_LABEL,
  ClaimActionConfirmModal,
  ClaimsTable,
  RefundConfirmModal,
  useApproveClaim,
  useClaims,
  useRejectClaim,
  useUpdateClaimMemo,
  type ClaimActionTarget,
} from '@/features/claims'
import { UnavailableScreen } from '@/shared/components/UnavailableScreen'

export const Route = createFileRoute('/claims/')({
  component: ClaimsGate,
})

// 운영 진입 차단 스위치. seller 모듈에 클레임 API가 없어 승인·거부·환불·메모가 전부 목업이다 —
// 주소로 들어와도 열지 않는다. 아래 ClaimsRoute는 서버가 생기면 queries 층만 바꿔 그대로 살릴 배선.
const SERVER_CLAIMS_AVAILABLE = false

function ClaimsGate() {
  if (!SERVER_CLAIMS_AVAILABLE) {
    return (
      <UnavailableScreen
        title="취소/반품/교환"
        message="취소/반품/교환 관리는 준비 중이에요"
        description="클레임 승인·거부·환불 확정은 서버가 준비되면 열어 둘게요."
      />
    )
  }
  return <ClaimsRoute />
}

const TAB_TYPES: ClaimType[] = ['cancel', 'return', 'exchange', 'dispute']

function ClaimsRoute() {
  const { data: claims = [], isLoading } = useClaims()
  const [activeType, setActiveType] = useState<ClaimType>('cancel')
  const [refundTarget, setRefundTarget] = useState<Claim | null>(null)
  const [actionTarget, setActionTarget] = useState<ClaimActionTarget | null>(null)

  const approveClaim = useApproveClaim()
  const rejectClaim = useRejectClaim()
  const updateMemo = useUpdateClaimMemo()

  const tabs = useMemo(
    () =>
      TAB_TYPES.map(type => ({
        key: type,
        label: CLAIM_TYPE_LABEL[type],
        badge: claims.filter(c => c.type === type).length,
      })),
    [claims],
  )

  const filtered = useMemo(() => claims.filter(c => c.type === activeType), [claims, activeType])
  const isMutating = approveClaim.isPending || rejectClaim.isPending

  return (
    <div className="p-6">
      <PageHeader title="취소/반품/교환" />
      <p className="-mt-3 mb-4 text-body-sm text-text-secondary">
        배송 전이면 취소, 배송이 시작되면 반품/교환으로 이어져요. 배송비 부담 주체에 따라 정산/환불 금액이
        달라져요.
      </p>

      <Tabs tabs={tabs} activeKey={activeType} onSelect={key => setActiveType(key as ClaimType)} className="mb-4" />

      <ClaimsTable
        claims={filtered}
        isLoading={isLoading}
        isMutating={isMutating}
        onApprove={claim => setActionTarget({ claim, action: 'approve' })}
        onReject={claim => setActionTarget({ claim, action: 'reject' })}
        onConfirmRefund={setRefundTarget}
        onMemoChange={(claim, memo) => updateMemo.mutate({ claimId: claim.id, memo })}
      />

      <p className="mt-3.5 text-caption text-text-tertiary">
        비고 메모는 내부 운영용이며 구매자에게 노출되지 않아요. 환불을 확정하면 되돌릴 수 없으니 검수 결과를
        먼저 확인하세요.
      </p>

      <RefundConfirmModal claim={refundTarget} onClose={() => setRefundTarget(null)} />

      <ClaimActionConfirmModal
        target={actionTarget}
        loading={isMutating}
        onClose={() => setActionTarget(null)}
        onConfirm={() => {
          if (!actionTarget) return
          const mutation = actionTarget.action === 'approve' ? approveClaim : rejectClaim
          mutation.mutate(actionTarget.claim.id, { onSuccess: () => setActionTarget(null) })
        }}
      />
    </div>
  )
}
