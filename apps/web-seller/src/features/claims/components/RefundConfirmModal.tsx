import type { Claim } from '@aechak/domain'
import { Modal } from '@aechak/design-system/web'
import { useConfirmRefund } from '../claims.queries'
import { ClaimSummaryBox } from './ClaimSummaryBox'

interface RefundConfirmModalProps {
  claim: Claim | null
  onClose: () => void
}

export function RefundConfirmModal({ claim, onClose }: RefundConfirmModalProps) {
  const confirmRefund = useConfirmRefund()

  if (!claim) return null

  return (
    <Modal
      open
      onClose={onClose}
      title="반품 환불을 확정할까요?"
      description={`검수 결과 확인 후 환불 금액과 반품 배송비가 정산에 함께 반영돼요. (${claim.shippingFeeNote})`}
      cancelLabel="취소"
      confirmLabel="환불 확정"
      loading={confirmRefund.isPending}
      onConfirm={() => confirmRefund.mutate(claim.id, { onSuccess: onClose })}
    >
      <ClaimSummaryBox rows={[{ label: '환불 금액', value: `${claim.amount.toLocaleString()}원`, mono: true }]} />
    </Modal>
  )
}
