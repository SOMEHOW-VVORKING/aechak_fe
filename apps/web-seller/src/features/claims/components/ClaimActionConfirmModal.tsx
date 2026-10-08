import type { Claim } from '@aechak/domain'
import { Modal } from '@aechak/design-system/web'
import { APPROVE_LABEL } from './ClaimsTable'
import { ClaimSummaryBox } from './ClaimSummaryBox'

export type ClaimActionType = 'approve' | 'reject'

export interface ClaimActionTarget {
  claim: Claim
  action: ClaimActionType
}

interface ClaimActionConfirmModalProps {
  target: ClaimActionTarget | null
  loading: boolean
  onClose: () => void
  onConfirm: () => void
}

export function ClaimActionConfirmModal({ target, loading, onClose, onConfirm }: ClaimActionConfirmModalProps) {
  if (!target) return null

  const { claim, action } = target
  const isApprove = action === 'approve'

  return (
    <Modal
      open
      onClose={onClose}
      title={isApprove ? `${APPROVE_LABEL[claim.type]}할까요?` : '거부할까요?'}
      description={
        isApprove
          ? '승인하면 구매자에게 바로 안내되고, 이후 되돌릴 수 없어요.'
          : '거부하면 구매자에게 거부 사유가 안내되고, 이후 되돌릴 수 없어요.'
      }
      cancelLabel="취소"
      confirmLabel={isApprove ? APPROVE_LABEL[claim.type] : '거부'}
      loading={loading}
      onConfirm={onConfirm}
    >
      <ClaimSummaryBox
        rows={[
          { label: '주문번호', value: claim.orderId, mono: true },
          { label: '사유', value: claim.reason },
        ]}
      />
    </Modal>
  )
}
