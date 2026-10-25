import { useState, type ReactNode } from 'react'
import { Alert, Button, Drawer, StatusPill, Textarea } from '@aechak/design-system/web'
import {
  CLAIM_APPROVE_LABEL,
  CLAIM_HISTORY_EVENT_LABEL,
  CLAIM_SELLER_MEMO_MAX,
  CLAIM_SETTLEMENT_STATUS_LABEL,
  CLAIM_TYPE_LABEL,
  CLAIM_TYPE_VARIANT,
  ORDER_ITEM_STATUS_LABEL,
  ORDER_STATUS_LABEL,
  REFUND_STATUS_LABEL,
  claimDetailAction,
  claimDisplayStatus,
  claimErrorMessage,
  claimReasonDetailText,
  claimReasonText,
  claimRefundText,
  formatClaimDateTime,
  returnCostText,
  type SellerClaimDetailData,
  type SellerClaimSummary,
} from '../claims.contract'
import { useClaimDetail } from '../claims.queries'

interface ClaimDetailDrawerProps {
  claimPublicId: string | null
  /** 처리 중에는 Drawer 안 버튼도 함께 잠근다(목록 행과 같은 값). */
  isMutating: boolean
  isSavingMemo: boolean
  onClose: () => void
  onApprove: (claim: SellerClaimSummary) => void
  onReject: (claim: SellerClaimSummary) => void
  onStartCollection: (claim: SellerClaimSummary) => void
  onCompleteCollection: (claim: SellerClaimSummary) => void
  onReship: (claim: SellerClaimSummary) => void
  onSaveMemo: (claim: SellerClaimSummary, sellerMemo: string) => void
}

function DetailField({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5">
      <span className="flex-none text-caption text-text-tertiary">{label}</span>
      <span className="min-w-0 text-right text-body-sm text-text-primary">{value}</span>
    </div>
  )
}

function DrawerSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-border-subtle pt-3.5">
      <h3 className="text-label font-semibold text-text-secondary">{title}</h3>
      <div className="mt-1.5">{children}</div>
    </section>
  )
}

/**
 * 클레임 상세. 목록이 가를 수 없는 **회수 단계**를 여기서 가른다 — 이력의 `COLLECTION_STARTED`
 * 유무가 송장 등록 대기와 완료 처리 대기를 나누는 유일한 응답 근거다(목록 행에는
 * collectionStartedAt이 없다).
 *
 * 수령인·연락처·주소는 서버가 복호 평문으로 준다. 회수 송장을 끊고 재발송을 보내려면 셀러가 그
 * 값을 그대로 써야 해서 가리지 않고 보여 주되, 목록에는 싣지 않고 이 Drawer에서만 노출한다.
 */
export function ClaimDetailDrawer({
  claimPublicId,
  isMutating,
  isSavingMemo,
  onClose,
  onApprove,
  onReject,
  onStartCollection,
  onCompleteCollection,
  onReship,
  onSaveMemo,
}: ClaimDetailDrawerProps) {
  const detail = useClaimDetail(claimPublicId)

  return (
    <Drawer open={claimPublicId != null} onClose={onClose} title="클레임 상세" width="lg">
      <div className="flex flex-col gap-3.5 pb-6">
        {detail.isPending && <p className="py-6 text-center text-body-sm text-text-tertiary">불러오는 중</p>}

        {detail.isError && (
          <Alert variant="error">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <span className="min-w-0 flex-1">{claimErrorMessage(detail.error)}</span>
              <Button
                variant="secondary"
                size="sm"
                loading={detail.isFetching}
                onClick={() => void detail.refetch()}
              >
                다시 시도
              </Button>
            </div>
          </Alert>
        )}

        {detail.data && (
          <ClaimDetailBody
            detail={detail.data}
            isMutating={isMutating}
            isSavingMemo={isSavingMemo}
            onApprove={onApprove}
            onReject={onReject}
            onStartCollection={onStartCollection}
            onCompleteCollection={onCompleteCollection}
            onReship={onReship}
            onSaveMemo={onSaveMemo}
          />
        )}
      </div>
    </Drawer>
  )
}

function ClaimDetailBody({
  detail,
  isMutating,
  isSavingMemo,
  onApprove,
  onReject,
  onStartCollection,
  onCompleteCollection,
  onReship,
  onSaveMemo,
}: {
  detail: SellerClaimDetailData
} & Omit<ClaimDetailDrawerProps, 'claimPublicId' | 'onClose'>) {
  const { claim, order, items, history } = detail
  const display = claimDisplayStatus(claim)
  const action = claimDetailAction(claim, history)
  const reasonDetail = claimReasonDetailText(claim)
  // 서버 값이 바뀌면(다른 곳에서 메모 수정, 다른 클레임 열기) 입력칸도 그 값에서 다시 시작해야 한다 —
  // 라우트가 claimPublicId로 Drawer를 다시 마운트하지 않으므로 key 대신 상태 초기화를 쓴다.
  const [memo, setMemo] = useState(claim.sellerMemo ?? '')
  const [memoSource, setMemoSource] = useState(claim.sellerMemo ?? '')
  if (memoSource !== (claim.sellerMemo ?? '')) {
    setMemoSource(claim.sellerMemo ?? '')
    setMemo(claim.sellerMemo ?? '')
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill variant={CLAIM_TYPE_VARIANT[claim.claimType]}>
          {CLAIM_TYPE_LABEL[claim.claimType]}
        </StatusPill>
        <StatusPill variant={display.variant}>{display.label}</StatusPill>
        {display.note != null && <span className="text-caption text-text-tertiary">{display.note}</span>}
      </div>

      <div>
        <p className="text-label font-semibold text-text-secondary">구매자 사유</p>
        <p className="mt-1 text-body-sm font-semibold text-text-primary">{claimReasonText(claim)}</p>
        {reasonDetail != null ? (
          <p className="mt-1.5 whitespace-pre-wrap rounded-md bg-surface-sunken px-3 py-2.5 text-body-sm text-text-primary">
            {reasonDetail}
          </p>
        ) : (
          <p className="mt-1 text-caption text-text-tertiary">구매자가 적은 사유 상세는 없어요.</p>
        )}
      </div>

      <DrawerSection title="금액">
        <DetailField label="환불 예정" value={<span className="tabular-nums">{claimRefundText(claim)}</span>} />
        <DetailField label="반품비" value={returnCostText(claim)} />
        <DetailField
          label="내 배송비"
          value={<span className="tabular-nums">{order.sellerShippingFee.toLocaleString()}원</span>}
        />
        {claim.refundStatus != null && (
          <DetailField label="환불 상태" value={REFUND_STATUS_LABEL[claim.refundStatus]} />
        )}
        {claim.settlementStatus != null && (
          <DetailField label="정산" value={CLAIM_SETTLEMENT_STATUS_LABEL[claim.settlementStatus]} />
        )}
      </DrawerSection>

      <DrawerSection title="주문">
        <DetailField label="주문번호" value={<span className="font-semibold">{order.orderPublicId}</span>} />
        <DetailField label="주문 상태" value={ORDER_STATUS_LABEL[order.orderStatus]} />
        <DetailField label="주문일" value={<span className="tabular-nums">{formatClaimDateTime(order.orderedAt)}</span>} />
        <DetailField label="클레임 요청일" value={<span className="tabular-nums">{formatClaimDateTime(claim.requestedAt)}</span>} />
      </DrawerSection>

      <DrawerSection title="수령인">
        <DetailField label="이름" value={order.recipientName} />
        <DetailField label="연락처" value={<span className="tabular-nums">{order.contactNumber}</span>} />
        <DetailField
          label="주소"
          value={`(${order.zipCode}) ${order.baseAddress}${order.detailAddress ? ` ${order.detailAddress}` : ''}`}
        />
        {order.deliveryMemo != null && <DetailField label="배송 요청" value={order.deliveryMemo} />}
        <p className="mt-1 text-caption text-text-tertiary">
          회수/재발송에 쓰는 개인정보예요. 처리 목적 밖으로 쓰지 마세요.
        </p>
      </DrawerSection>

      <DrawerSection title={`대상 품목 (${items.length}개)`}>
        <ul className="flex flex-col gap-2">
          {items.map(item => (
            <li key={item.orderItemId} className="rounded-md bg-surface-sunken px-3 py-2.5">
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 text-body-sm font-semibold text-text-primary">{item.productName}</p>
                <span className="flex-none text-caption text-text-tertiary">
                  {ORDER_ITEM_STATUS_LABEL[item.itemStatus]}
                </span>
              </div>
              <p className="mt-0.5 text-caption text-text-tertiary">
                {item.optionName} / {item.quantity}개
              </p>
              <p className="mt-1 text-caption tabular-nums text-text-secondary">
                단가 {item.unitPrice.toLocaleString()}원 / 환불 {item.refundAmount.toLocaleString()}원
              </p>
            </li>
          ))}
        </ul>
      </DrawerSection>

      {claim.rejectionReason != null && (
        <DrawerSection title="거부 사유">
          <p className="whitespace-pre-wrap text-body-sm text-text-primary">{claim.rejectionReason}</p>
        </DrawerSection>
      )}

      <DrawerSection title="진행 이력">
        <ol className="flex flex-col gap-1.5">
          {history.map(entry => (
            <li key={`${entry.event}-${entry.occurredAt}`} className="flex items-center justify-between gap-3">
              <span className="text-body-sm text-text-primary">{CLAIM_HISTORY_EVENT_LABEL[entry.event]}</span>
              <span className="tabular-nums text-caption text-text-tertiary">
                {formatClaimDateTime(entry.occurredAt)}
              </span>
            </li>
          ))}
        </ol>
      </DrawerSection>

      <DrawerSection title="비고 메모">
        <Textarea
          value={memo}
          onChange={setMemo}
          maxLength={CLAIM_SELLER_MEMO_MAX}
          rows={3}
          placeholder="내부 운영용 메모를 적어 주세요"
          disabled={isSavingMemo}
        />
        <div className="mt-2 flex items-center justify-between gap-3">
          <p className="text-caption text-text-tertiary">구매자에게 보이지 않아요. 비우면 메모가 지워져요.</p>
          <Button
            variant="secondary"
            size="sm"
            loading={isSavingMemo}
            disabled={memo === (claim.sellerMemo ?? '')}
            onClick={() => onSaveMemo(claim, memo)}
          >
            메모 저장
          </Button>
        </div>
      </DrawerSection>

      {action !== 'none' && (
        <div className="flex flex-wrap gap-2 border-t border-border-subtle pt-3.5">
          {action === 'decision' && (
            <>
              <Button variant="primary" size="md" disabled={isMutating} onClick={() => onApprove(claim)}>
                {CLAIM_APPROVE_LABEL[claim.claimType]}
              </Button>
              <Button variant="secondary" size="md" disabled={isMutating} onClick={() => onReject(claim)}>
                거부
              </Button>
            </>
          )}
          {action === 'collection-invoice' && (
            <Button variant="primary" size="md" disabled={isMutating} onClick={() => onStartCollection(claim)}>
              회수 송장 등록
            </Button>
          )}
          {action === 'collection-complete' && (
            <Button variant="primary" size="md" disabled={isMutating} onClick={() => onCompleteCollection(claim)}>
              회수 완료
            </Button>
          )}
          {action === 'reship' && (
            <Button variant="primary" size="md" disabled={isMutating} onClick={() => onReship(claim)}>
              재발송 송장 등록
            </Button>
          )}
        </div>
      )}
    </>
  )
}
