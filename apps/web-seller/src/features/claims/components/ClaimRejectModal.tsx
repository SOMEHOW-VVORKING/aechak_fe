import { useState } from 'react'
import { Modal, Textarea } from '@aechak/design-system/web'
import {
  CLAIM_REJECTION_REASON_MAX,
  CLAIM_TYPE_LABEL,
  claimReasonDetailText,
  claimReasonText,
  type SellerClaimSummary,
} from '../claims.contract'
import { ClaimSummaryBox } from './ClaimSummaryBox'

interface ClaimRejectModalProps {
  claim: SellerClaimSummary
  loading: boolean
  onClose: () => void
  onConfirm: (rejectionReason: string) => void
}

/**
 * 거부 확인. 거부 사유는 **필수**다 — 구매자에게 그대로 노출되므로 도메인이 공백을 거절한다
 * (400 errorCode 50405). 보내기 전에 화면에서 막아 왕복을 줄인다.
 */
export function ClaimRejectModal({ claim, loading, onClose, onConfirm }: ClaimRejectModalProps) {
  const [reason, setReason] = useState('')
  const [blocked, setBlocked] = useState(false)
  const trimmed = reason.trim()
  const reasonDetail = claimReasonDetailText(claim)

  return (
    <Modal
      open
      onClose={onClose}
      title={`${CLAIM_TYPE_LABEL[claim.claimType]} 요청을 거부할까요?`}
      description="거부 사유가 구매자에게 그대로 보여요. 거부 뒤에는 되돌릴 수 없어요."
      cancelLabel="취소"
      confirmLabel="거부"
      confirmVariant="danger"
      loading={loading}
      onConfirm={() => {
        if (trimmed === '') {
          setBlocked(true)
          return
        }
        onConfirm(trimmed)
      }}
    >
      <div className="flex flex-col gap-3.5">
        <ClaimSummaryBox
          rows={[
            { label: '주문번호', value: claim.orderPublicId, mono: true },
            { label: '구매자 사유', value: claimReasonText(claim) },
          ]}
        />
        {reasonDetail != null && (
          <div>
            <p className="text-label font-medium text-text-secondary">구매자가 적은 사유</p>
            <p className="mt-1.5 max-h-24 overflow-y-auto whitespace-pre-wrap rounded-md bg-surface-sunken px-3 py-2.5 text-body-sm text-text-primary">
              {reasonDetail}
            </p>
          </div>
        )}
        <Textarea
          label="거부 사유"
          value={reason}
          onChange={value => {
            setReason(value)
            setBlocked(false)
          }}
          maxLength={CLAIM_REJECTION_REASON_MAX}
          rows={3}
          placeholder="구매자에게 보일 사유를 적어 주세요"
          state={blocked && trimmed === '' ? 'error' : 'default'}
          helperText={blocked && trimmed === '' ? '거부 사유를 입력해 주세요.' : undefined}
          disabled={loading}
        />
      </div>
    </Modal>
  )
}
