import type { MouseEvent } from 'react'
import { Button, DataTable, type Column } from '@aechak/design-system/web'
import { DoneLabel, PillWithNote, TwoLineCell } from '@/shared/components/TableCells'
import {
  CLAIM_APPROVE_LABEL,
  CLAIM_TYPE_LABEL,
  CLAIM_TYPE_VARIANT,
  claimDisplayStatus,
  claimReasonDetailText,
  claimReasonText,
  claimRefundText,
  claimRowAction,
  formatClaimDate,
  returnCostText,
  type SellerClaimSummary,
} from '../claims.contract'

interface ClaimsTableProps {
  claims: SellerClaimSummary[]
  isLoading: boolean
  isError: boolean
  isMutating: boolean
  onOpenDetail: (claimPublicId: string) => void
  onApprove: (claim: SellerClaimSummary) => void
  onReject: (claim: SellerClaimSummary) => void
  onReship: (claim: SellerClaimSummary) => void
}

/** 행 클릭(상세 Drawer)과 셀 안 버튼이 겹치지 않게 버튼은 전파를 끊는다. */
const stop = (event: MouseEvent<HTMLButtonElement>) => event.stopPropagation()

export function ClaimsTable({
  claims,
  isLoading,
  isError,
  isMutating,
  onOpenDetail,
  onApprove,
  onReject,
  onReship,
}: ClaimsTableProps) {
  const columns: Column<SellerClaimSummary>[] = [
    {
      key: 'order',
      label: '주문 / 상품',
      render: claim => (
        <TwoLineCell
          primary={claim.orderPublicId}
          secondary={
            <span className="block max-w-[260px] truncate" title={claim.productNames.join(' / ')}>
              {claim.productNames.join(' / ') || '상품 정보 없음'}
              {/* 수량 표기만 괄호를 쓴다(카피 규칙) */}
              {claim.itemCount > 1 && ` (${claim.itemCount}개)`}
            </span>
          }
        />
      ),
    },
    {
      key: 'type',
      label: '유형 / 구매자 사유',
      render: claim => {
        const detail = claimReasonDetailText(claim)
        return (
          <PillWithNote
            variant={CLAIM_TYPE_VARIANT[claim.claimType]}
            label={CLAIM_TYPE_LABEL[claim.claimType]}
            note={
              <>
                {claimReasonText(claim)}
                {detail != null && (
                  // 구매자가 적은 사유는 최대 500자라 표에서는 한 줄로 자르고 전문은 상세에서 본다.
                  <span className="block max-w-[260px] truncate text-text-secondary" title={detail}>
                    {detail}
                  </span>
                )}
              </>
            }
          />
        )
      },
    },
    {
      key: 'cost',
      label: '반품비 / 환불',
      render: claim => (
        <div>
          <p className="text-caption text-text-tertiary">{returnCostText(claim)}</p>
          <p className="mt-0.5 tabular-nums text-body-sm text-text-primary">{claimRefundText(claim)}</p>
        </div>
      ),
    },
    {
      key: 'status',
      label: '상태',
      render: claim => {
        const display = claimDisplayStatus(claim)
        return <PillWithNote variant={display.variant} label={display.label} note={display.note} />
      },
    },
    {
      key: 'requestedAt',
      label: '요청일',
      align: 'right',
      render: claim => <span className="tabular-nums">{formatClaimDate(claim.requestedAt)}</span>,
    },
    {
      key: 'memo',
      label: '비고 메모',
      render: claim =>
        claim.sellerMemo ? (
          <span className="block max-w-[180px] truncate text-text-secondary" title={claim.sellerMemo}>
            {claim.sellerMemo}
          </span>
        ) : (
          <span className="text-text-tertiary">—</span>
        ),
    },
    {
      key: 'actions',
      label: '처리',
      render: claim => {
        const action = claimRowAction(claim)
        return (
          <div className="flex justify-end gap-1.5">
            {action === 'decision' && (
              <>
                <Button
                  variant="primary"
                  size="sm"
                  disabled={isMutating}
                  onClick={event => {
                    stop(event)
                    onApprove(claim)
                  }}
                >
                  {CLAIM_APPROVE_LABEL[claim.claimType]}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={isMutating}
                  onClick={event => {
                    stop(event)
                    onReject(claim)
                  }}
                >
                  거부
                </Button>
              </>
            )}
            {/* 회수 중에는 송장 등록 대기와 완료 처리 대기가 섞여 있고 목록 응답에 그것을 가르는
                필드가 없다 — 행에서 단정하지 않고 상세로 보낸다(이력이 단계를 밝힌다). */}
            {action === 'collecting' && (
              <Button
                variant="secondary"
                size="sm"
                disabled={isMutating}
                onClick={event => {
                  stop(event)
                  onOpenDetail(claim.claimPublicId)
                }}
              >
                회수 처리
              </Button>
            )}
            {action === 'reship' && (
              <Button
                variant="primary"
                size="sm"
                disabled={isMutating}
                onClick={event => {
                  stop(event)
                  onReship(claim)
                }}
              >
                재발송 송장 등록
              </Button>
            )}
            {action === 'none' && <DoneLabel />}
          </div>
        )
      },
    },
  ]

  return (
    <DataTable
      columns={columns}
      rows={claims}
      rowKey={claim => claim.claimPublicId}
      loading={isLoading}
      onRowClick={claim => onOpenDetail(claim.claimPublicId)}
      emptyLabel={isError ? '목록을 불러오지 못했어요.' : '조건에 맞는 클레임이 없어요.'}
    />
  )
}
