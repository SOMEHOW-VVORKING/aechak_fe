import { useState } from 'react'
import { Alert, Modal, RadioCard } from '@aechak/design-system/web'
import {
  CLAIM_APPROVE_LABEL,
  CLAIM_TYPE_LABEL,
  claimReasonDetailText,
  claimReasonText,
  claimRefundText,
  returnCostText,
  type ReturnCostBearer,
  type SellerClaimSummary,
} from '../claims.contract'
import { ClaimSummaryBox } from './ClaimSummaryBox'

interface ClaimApproveModalProps {
  claim: SellerClaimSummary
  loading: boolean
  onClose: () => void
  onConfirm: (returnCostBearer: ReturnCostBearer | null) => void
}

const BEARER_OPTIONS: { value: ReturnCostBearer; title: string; description: string }[] = [
  {
    value: 'BUYER',
    title: '구매자 부담',
    description: '단순 변심처럼 구매자 사정으로 생긴 반품/교환일 때 고르세요.',
  },
  {
    value: 'SELLER',
    title: '셀러 부담',
    description: '불량·오배송처럼 내 책임으로 생긴 반품/교환일 때 고르세요.',
  },
]

/**
 * 승인 확인. **반품비 부담 주체는 셀러가 직접 고른다** — 서버는 사유로 유도하지 않고 받은 값을
 * 그대로 저장한다(ApproveClaimRequest.returnCostBearer). 그래서 구매자가 적은 사유를 이 Modal에
 * 그대로 보여 주지 않으면 셀러가 판단할 근거가 없다.
 *
 * 취소에는 반품비가 없어 선택을 묻지 않는다(서버도 CANCEL이면 값을 저장하지 않는다).
 * 자체 useMutation을 만들지 않고 라우트의 loading/onConfirm을 받는다(AGENTS 확인 Modal 패턴).
 */
export function ClaimApproveModal({ claim, loading, onClose, onConfirm }: ClaimApproveModalProps) {
  const [bearer, setBearer] = useState<ReturnCostBearer | null>(null)
  // DS Modal에는 confirm 비활성 prop이 없고(4개 앱 공용이라 고치지 않는다) loading만 버튼을 막는다 —
  // 막힌 확인 클릭 뒤에 사유를 보여 준다(ShipmentModal 선례와 같은 결).
  const [blocked, setBlocked] = useState(false)
  const needsBearer = claim.claimType !== 'CANCEL'
  const reasonDetail = claimReasonDetailText(claim)

  return (
    <Modal
      open
      onClose={onClose}
      title={`${CLAIM_APPROVE_LABEL[claim.claimType]}할까요?`}
      description={
        needsBearer
          ? '승인하면 회수 대기로 넘어가고 구매자에게 안내돼요. 승인 뒤에는 되돌릴 수 없어요.'
          : '승인하면 환불이 진행되고 구매자에게 안내돼요. 승인 뒤에는 되돌릴 수 없어요.'
      }
      cancelLabel="취소"
      confirmLabel={CLAIM_APPROVE_LABEL[claim.claimType]}
      loading={loading}
      onConfirm={() => {
        if (needsBearer && bearer == null) {
          setBlocked(true)
          return
        }
        onConfirm(needsBearer ? bearer : null)
      }}
    >
      <div className="flex flex-col gap-3.5">
        <ClaimSummaryBox
          rows={[
            { label: '주문번호', value: claim.orderPublicId, mono: true },
            { label: '유형', value: CLAIM_TYPE_LABEL[claim.claimType] },
            { label: '구매자 사유', value: claimReasonText(claim) },
            { label: '환불 예정', value: claimRefundText(claim), mono: true },
          ]}
        />

        {/* 구매자가 직접 적은 사유 — 부담 주체를 가르는 유일한 근거라 전문을 보여준다(최대 500자). */}
        {reasonDetail != null ? (
          <div>
            <p className="text-label font-medium text-text-secondary">구매자가 적은 사유</p>
            <p className="mt-1.5 max-h-28 overflow-y-auto whitespace-pre-wrap rounded-md bg-surface-sunken px-3 py-2.5 text-body-sm text-text-primary">
              {reasonDetail}
            </p>
          </div>
        ) : (
          <p className="text-caption text-text-tertiary">구매자가 적은 사유 상세는 없어요.</p>
        )}

        {needsBearer ? (
          <div>
            <p className="text-label font-medium text-text-secondary">반품비 부담 주체</p>
            {/* 금액이 바뀐다고 약속하지 않는다 — BE는 이 값을 Claim에 저장하고 응답으로 되돌려 줄
                뿐이고(Claim.approveBySeller), 환불액 계산(ClaimRefundService.refundAmounts)은
                품목 환불액 합 + 배송비 환불액만 본다. */}
            <p className="mt-1 text-caption text-text-tertiary">
              서버가 사유로 정해 주지 않으니 직접 고르세요. 고른 값은 클레임에 기록되고 환불 금액에서 자동으로
              빠지지는 않아요.
            </p>
            <div className="mt-2 flex flex-col gap-2">
              {BEARER_OPTIONS.map(option => (
                <RadioCard
                  key={option.value}
                  name="returnCostBearer"
                  selected={bearer === option.value}
                  onSelect={() => {
                    setBearer(option.value)
                    setBlocked(false)
                  }}
                  title={option.title}
                  description={option.description}
                  disabled={loading}
                />
              ))}
            </div>
            {blocked && bearer == null && (
              <p className="mt-2 text-caption text-error-fg">반품비 부담 주체를 골라야 승인할 수 있어요.</p>
            )}
          </div>
        ) : (
          <Alert variant="info">{returnCostText(claim)} — 발송 전 취소라 반품비를 정하지 않아요.</Alert>
        )}
      </div>
    </Modal>
  )
}
