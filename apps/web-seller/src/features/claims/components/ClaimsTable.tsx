import type { Claim, ClaimStatus, ClaimType } from '@aechak/domain'
import { Button, DataTable, StatusPill, type Column, type StatusPillVariant } from '@aechak/design-system/web'
import { DoneLabel, PillWithNote, TwoLineCell } from '@/shared/components/TableCells'
import { CLAIM_STATUS_LABEL, CLAIM_TYPE_LABEL, RESPONSIBLE_PARTY_LABEL } from '../claims.queries'

const TYPE_VARIANT: Record<ClaimType, StatusPillVariant> = {
  cancel: 'neutral',
  return: 'info',
  exchange: 'info',
  dispute: 'danger',
}

const STATUS_VARIANT: Record<ClaimStatus, StatusPillVariant> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'error',
  collecting: 'info',
  refunded: 'success',
}

interface ClaimsTableProps {
  claims: Claim[]
  isLoading: boolean
  isMutating: boolean
  onApprove: (claim: Claim) => void
  onReject: (claim: Claim) => void
  onConfirmRefund: (claim: Claim) => void
  onMemoChange: (claim: Claim, memo: string) => void
}

export const APPROVE_LABEL: Record<ClaimType, string> = {
  cancel: '취소 승인',
  return: '반품 승인',
  exchange: '교환 승인',
  dispute: '검토 완료',
}

export function ClaimsTable({
  claims,
  isLoading,
  isMutating,
  onApprove,
  onReject,
  onConfirmRefund,
  onMemoChange,
}: ClaimsTableProps) {
  const columns: Column<Claim>[] = [
    {
      key: 'order',
      label: '주문 / 상품',
      render: c => <TwoLineCell primary={c.orderId} secondary={c.productName} />,
    },
    {
      key: 'type',
      label: '유형 / 사유',
      render: c => <PillWithNote variant={TYPE_VARIANT[c.type]} label={CLAIM_TYPE_LABEL[c.type]} note={c.reason} />,
    },
    {
      key: 'responsible',
      label: '귀책 / 배송비',
      render: c => (
        <div>
          <p className="text-caption text-text-tertiary">{RESPONSIBLE_PARTY_LABEL[c.responsibleParty]}</p>
          <p className="mt-0.5 text-caption text-text-secondary">{c.shippingFeeNote}</p>
        </div>
      ),
    },
    {
      key: 'status',
      label: '상태',
      align: 'center',
      render: c => <StatusPill variant={STATUS_VARIANT[c.status]}>{CLAIM_STATUS_LABEL[c.status]}</StatusPill>,
    },
    {
      key: 'memo',
      label: '비고 메모',
      render: c => (
        <input
          type="text"
          defaultValue={c.memo ?? ''}
          placeholder="메모 입력…"
          onBlur={e => onMemoChange(c, e.target.value)}
          className="w-full min-w-[180px] rounded-input border border-transparent bg-transparent px-2 py-1 text-body-sm text-text-secondary outline-none placeholder:text-text-placeholder hover:border-border focus:border-border-focus focus:bg-surface-raised"
        />
      ),
    },
    {
      key: 'actions',
      label: '처리',
      render: c => (
        <div className="flex justify-end gap-1.5">
          {c.status === 'pending' && (
            <>
              <Button variant="primary" size="sm" disabled={isMutating} onClick={() => onApprove(c)}>
                {APPROVE_LABEL[c.type]}
              </Button>
              <Button variant="secondary" size="sm" disabled={isMutating} onClick={() => onReject(c)}>
                거부
              </Button>
            </>
          )}
          {c.status === 'collecting' && (
            <Button variant="secondary" size="sm" disabled={isMutating} onClick={() => onConfirmRefund(c)}>
              환불 확정
            </Button>
          )}
          {(c.status === 'approved' || c.status === 'rejected' || c.status === 'refunded') && <DoneLabel />}
        </div>
      ),
    },
  ]

  return <DataTable columns={columns} rows={claims} rowKey={c => c.id} loading={isLoading} />
}
