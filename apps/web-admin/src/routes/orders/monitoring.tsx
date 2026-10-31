import { useEffect, useMemo, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import {
  AlertTriangle,
  Ban,
  Bell,
  CheckCircle,
  Clock,
  CreditCard,
  PackageCheck,
  RotateCcw,
  Truck,
  XCircle,
} from 'lucide-react'
import {
  Alert,
  Button,
  DataTable,
  Drawer,
  FilterBar,
  MetricCard,
  Modal,
  SearchInput,
  StatusPill,
  Textarea,
  Timeline,
  Toast,
} from '@aechak/design-system/web'
import type { Column } from '@aechak/design-system/web'
import {
  detailErrorMessage,
  listErrorMessage,
  metricsErrorMessage,
  nudgeErrorMessage,
  useAdminOrderDetail,
  useAdminOrderMonitorList,
  useAdminOrderMonitorMetrics,
  useNudgeOrderDispatch,
  type AdminOrderMonitorRow,
  type AdminOrderStatus,
  type AdminOrderStatusFilterValue,
} from '@/features/order-monitoring'
import { DetailDrawerBody } from '@/shared/components/DetailDrawerBody'
import { DetailField } from '@/shared/components/DetailField'
import { DrawerSummaryCard } from '@/shared/components/DrawerSummaryCard'
import { FilterSelect } from '@/shared/components/FilterSelect'
import { HistoryList } from '@/shared/components/HistoryList'
import { PageIntro } from '@/shared/components/PageIntro'
import { RowLinkButton } from '@/shared/components/RowLinkButton'
import { StatusMetaPill } from '@/shared/components/StatusMetaPill'
import type { StatusMeta } from '@/shared/components/StatusMetaPill'
import { SummaryGrid } from '@/shared/components/SummaryGrid'

// admin 모듈의 주문 모니터링 경로 넷(`GET /admin/orders`·`/metrics`·`/{orderId}`,
// `POST /admin/orders/{orderId}/dispatch-nudges`)에 붙은 실연동 화면이다(SCRUM-339).
// 예시 데이터 시절의 띠·nav 꼬리표는 함께 걷었다 — 실데이터 화면에 띠를 붙이면 거꾸로 속인다.
export const Route = createFileRoute('/orders/monitoring')({
  component: OrdersMonitoringPage,
})

// 서버 OrderStatus 8값 1:1. 결제대기는 목록 응답에 나오지 않지만(서버가 모니터링 대상에서 뺀다)
// pill은 8값을 다 채운다 — 비면 어떤 주문인지 읽을 수 없다.
const statusMeta: Record<AdminOrderStatus, StatusMeta> = {
  pendingPayment: { label: '결제 대기', variant: 'muted', icon: CreditCard },
  paid: { label: '결제 완료', variant: 'info', icon: CheckCircle },
  preparing: { label: '상품 준비', variant: 'warning', icon: Clock },
  dispatchPending: { label: '발송 대기', variant: 'warning', icon: PackageCheck },
  shipping: { label: '배송 중', variant: 'brand', icon: Truck },
  delivered: { label: '배송 완료', variant: 'success', icon: PackageCheck },
  confirmed: { label: '구매 확정', variant: 'muted', icon: CheckCircle },
  cancelled: { label: '주문 취소', variant: 'error', icon: XCircle },
}

// 결제대기는 지정하면 서버가 400(90001)으로 끊으므로 고를 수 있게 두지 않는다.
const statusFilterOptions: { value: AdminOrderStatusFilterValue; label: string }[] = [
  { value: 'all', label: '주문 상태 전체' },
  { value: 'paid', label: statusMeta.paid.label },
  { value: 'preparing', label: statusMeta.preparing.label },
  { value: 'dispatchPending', label: statusMeta.dispatchPending.label },
  { value: 'shipping', label: statusMeta.shipping.label },
  { value: 'delivered', label: statusMeta.delivered.label },
  { value: 'confirmed', label: statusMeta.confirmed.label },
  { value: 'cancelled', label: statusMeta.cancelled.label },
]

const DELAY_ANY = 'any'
const DELAY_ONLY = 'delayed'

const delayFilterOptions = [
  { value: DELAY_ANY, label: '지연 여부 전체' },
  { value: DELAY_ONLY, label: '지연 신호만' },
]

const won = (amount: number) => `${amount.toLocaleString('ko-KR')}원`

function makeOrderColumns(
  onOpenDetail: (row: AdminOrderMonitorRow) => void,
): Column<AdminOrderMonitorRow>[] {
  return [
    {
      key: 'orderId',
      label: '주문번호',
      render: row => (
        <div className="min-w-0">
          <RowLinkButton onClick={() => onOpenDetail(row)} numeric>
            {row.orderId}
          </RowLinkButton>
          <p className="mt-0.5 text-caption text-text-tertiary tabular-nums">
            {row.orderedAtLabel}
          </p>
        </div>
      ),
    },
    {
      key: 'itemSummary',
      label: '상품',
      render: row => (
        <div className="min-w-0">
          <p className="truncate text-body-sm text-text-primary">{row.itemSummary}</p>
          <p className="mt-0.5 text-caption text-text-tertiary">
            {row.sellerName} / {row.buyerNickname}
          </p>
        </div>
      ),
    },
    {
      key: 'payableAmount',
      label: '결제 금액',
      align: 'right',
      render: row => <span className="tabular-nums">{won(row.payableAmount)}</span>,
    },
    {
      key: 'courierName',
      label: '배송',
      render: row =>
        row.courierName ? (
          <div className="min-w-0">
            <p className="text-body-sm text-text-primary">{row.courierName}</p>
            <p className="mt-0.5 text-caption text-text-tertiary tabular-nums">
              {row.trackingNumber}
            </p>
          </div>
        ) : (
          <span className="text-body-sm text-text-tertiary">송장 미등록</span>
        ),
    },
    {
      key: 'status',
      label: '주문 상태',
      // pill + 보조텍스트 컬럼은 center 금지(pill과 좌측이 어긋난다).
      render: row => (
        <div className="min-w-0">
          <StatusMetaPill meta={statusMeta[row.status]} />
          {/* 클레임은 주문 상태와 별개 축이라 pill을 덮지 않고 아래 줄에 적는다. */}
          {row.claimLabel && (
            <p className="mt-1.5 pl-2.5 text-caption text-text-secondary">{row.claimLabel}</p>
          )}
          {row.delayed && <p className="mt-1.5 pl-2.5 text-caption text-warning-fg">지연 신호</p>}
        </div>
      ),
    },
  ]
}

function OrdersMonitoringPage() {
  const [statusFilter, setStatusFilter] = useState<AdminOrderStatusFilterValue>('all')
  const [delayFilter, setDelayFilter] = useState(DELAY_ANY)
  const [search, setSearch] = useState('')

  const list = useAdminOrderMonitorList({
    status: statusFilter,
    delayedOnly: delayFilter === DELAY_ONLY,
    keyword: search,
  })
  const metrics = useAdminOrderMonitorMetrics()

  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null)
  const detail = useAdminOrderDetail(selectedOrderId)
  const nudge = useNudgeOrderDispatch()

  const [confirmOpen, setConfirmOpen] = useState(false)
  // 성공과 실패를 같은 variant로 띄우면 DS가 role까지 같게 그려(success·info는 status, error는
  // alert) 실패가 조용히 지나간다 — 문구와 variant를 한 값으로 묶는다.
  const [toast, setToast] = useState<{ message: string; variant: 'info' | 'error' } | null>(null)
  const [nudgeMemo, setNudgeMemo] = useState('')

  const order = detail.detail?.order ?? null
  // 상세가 도착한 뒤 한 번만 시드한다 — 매 렌더 재시딩하면 운영자가 적던 메모가 되돌아간다.
  useEffect(() => {
    setNudgeMemo('')
  }, [order?.orderId])

  const orderColumns = useMemo(
    () => makeOrderColumns(row => setSelectedOrderId(row.orderId)),
    [],
  )

  /**
   * 조회가 실패한 동안에는 독촉을 잠근다(AGENTS 6-7).
   *
   * 재조회가 실패해도 react-query는 직전 데이터를 들고 있어 행과 상세가 그대로 남는데, 확인
   * Modal은 **그 낡은 값**으로 만들어진다 — 이미 발송된 주문에 독촉을 지시하거나(409/50500)
   * 권한이 끊긴 채로 요청을 쌓는다. 행은 지우지 않고(마지막으로 본 내용은 정보다) 처리만 잠그며,
   * 상세 Drawer를 여는 읽기 버튼은 예외다(상세가 스스로 다시 조회한다).
   */
  const staleView = list.isError || detail.isError
  /**
   * 독촉을 걸 수 없는 사유. `canNudge`와 나눠 두는 이유는 **확인 Modal이 열린 뒤에도** 같은
   * 판정을 다시 해야 하기 때문이다 — Drawer 버튼만 잠그면 모달을 연 동안 재조회가 실패하거나
   * 상세 상태가 발송 이후로 바뀌어도 확인 버튼이 그대로 눌린다(교차검토 지적).
   */
  const nudgeBlockedReason =
    order == null
      ? null
      : !order.nudgeable
        ? '발송 전 상태의 주문만 독촉을 기록할 수 있어요.'
        : staleView
          ? '조회가 실패해 화면이 낡았어요. 목록을 다시 불러온 뒤에 독촉할 수 있어요.'
          : null
  const canNudge = order != null && nudgeBlockedReason == null && !nudge.isPending

  function closeDrawer() {
    // 요청 중에는 닫지 않는다 — Drawer도 Esc·스크림으로 이 함수를 부르고, 닫히면 운영자가
    // 무엇을 지시했는지 모르는 채 요청만 날아간다(교차검토 지적).
    if (nudge.isPending) return
    setSelectedOrderId(null)
    setConfirmOpen(false)
  }

  function submitNudge() {
    // 같은 버튼을 두 번 눌러 요청이 두 번 나가지 않게 한다 — 서버 쿨다운(6시간)이 두 번째를
    // 409로 끊지만, 그러면 운영자는 자기가 만든 실패 토스트를 본다.
    if (!canNudge || order == null) return
    nudge.mutate(
      { orderId: order.orderId, memo: nudgeMemo },
      {
        onSuccess: () => {
          setToast({
            message: '독촉 기록을 남겼어요. 셀러에게 알림이 가지는 않아요.',
            variant: 'info',
          })
          closeDrawer()
        },
        onError: error => {
          setToast({ message: nudgeErrorMessage(error), variant: 'error' })
          setConfirmOpen(false)
        },
      },
    )
  }

  return (
    <div className="p-6">
      <PageIntro
        title="주문 배송 모니터링"
        description="플랫폼 전체 주문과 배송 상태를 모니터링해요."
      />

      {/* 목록 실패는 빈 상태로 떨어뜨리지 않는다 — "주문 없음"과 "못 불러옴"이 구분되지 않는다. */}
      {list.isError && (
        <Alert variant="error" title="목록을 불러오지 못했어요" className="mb-5">
          <p>{listErrorMessage(list.error)}</p>
        </Alert>
      )}

      {metrics.isError && (
        <Alert variant="warning" title="지표를 불러오지 못했어요" className="mb-5">
          <p>{metricsErrorMessage(metrics.error)}</p>
        </Alert>
      )}

      {/*
        카드 라벨은 서버 응답 필드 이름에 맞춘다. 금액은 서버가 계산한 값을 그대로 쓴다 —
        `totalPaymentAmount`는 취소 주문이 빠져 목록 행을 더해 재현할 수 없고, 뜻이 바뀌면
        서버가 바꾼다. 조회가 실패하면 숫자를 비운다(옛 숫자는 서버에 없는 건수가 된다).
      */}
      <div className="mb-3.5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard
          label="발송 대기"
          value={metrics.metrics ? `${metrics.metrics.awaitingDispatchCount}건` : '-'}
          icon={<Clock className="size-full" />}
        />
        <MetricCard
          label="배송 중"
          value={metrics.metrics ? `${metrics.metrics.shippingCount}건` : '-'}
          icon={<Truck className="size-full" />}
        />
        <MetricCard
          label="지연"
          value={metrics.metrics ? `${metrics.metrics.delayedCount}건` : '-'}
          icon={<AlertTriangle className="size-full" />}
          variant={metrics.metrics && metrics.metrics.delayedCount > 0 ? 'urgent' : 'default'}
        />
        <MetricCard
          label="조회 범위 결제액"
          value={metrics.metrics ? won(metrics.metrics.totalPaymentAmount) : '-'}
          variant="quiet"
        />
      </div>

      <FilterBar className="mb-3.5">
        <FilterSelect
          options={statusFilterOptions}
          value={statusFilter}
          onChange={value => setStatusFilter(value as AdminOrderStatusFilterValue)}
        />
        <FilterSelect
          options={delayFilterOptions}
          value={delayFilter}
          onChange={setDelayFilter}
          narrow
        />
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="주문번호 / 셀러 / 구매자 검색"
          className="w-72"
        />
      </FilterBar>

      <DataTable
        columns={orderColumns}
        rows={list.rows}
        rowKey={row => row.orderId}
        onRowClick={row => setSelectedOrderId(row.orderId)}
        loading={list.isLoading}
        emptyLabel={
          list.isError
            ? '목록을 불러오지 못했어요.'
            : '조건에 맞는 주문이 없어요. 아직 주문이 들어오지 않았을 수도 있어요.'
        }
      />

      {list.hasNext && (
        <div className="mt-3.5 flex justify-center">
          <Button
            variant="secondary"
            onClick={list.fetchNextPage}
            disabled={list.isFetchingNextPage}
          >
            {list.isFetchingNextPage ? '불러오는 중' : '더 보기'}
          </Button>
        </div>
      )}

      <Drawer
        open={selectedOrderId !== null}
        onClose={closeDrawer}
        title="주문 상세"
        width="lg"
      >
        {detail.isLoading && (
          <p className="text-body-sm text-text-tertiary">주문 정보를 불러오고 있어요.</p>
        )}
        {detail.isError && (
          <Alert variant="error" title="상세를 불러오지 못했어요">
            <p>{detailErrorMessage(detail.error)}</p>
          </Alert>
        )}
        {detail.detail && order && (
          <DetailDrawerBody
            subtitle={`${order.orderId} / ${order.sellerName}`}
            actions={
              <Button
                variant="secondary"
                leftIcon={<Bell className="size-4" />}
                onClick={() => setConfirmOpen(true)}
                disabled={!canNudge}
              >
                셀러 발송 독촉
              </Button>
            }
          >
            <DrawerSummaryCard
              pills={
                <>
                  <StatusMetaPill meta={statusMeta[order.status]} />
                  {order.courierName ? (
                    <StatusPill variant="neutral">
                      <Truck className="size-3" />
                      {order.courierName}
                    </StatusPill>
                  ) : (
                    <StatusPill variant="muted">
                      <Ban className="size-3" />
                      송장 미등록
                    </StatusPill>
                  )}
                  {order.claimLabel && (
                    <StatusPill variant="error">
                      <RotateCcw className="size-3" />
                      {order.claimLabel}
                    </StatusPill>
                  )}
                </>
              }
            >
              <SummaryGrid
                items={[
                  { label: '구매자', value: order.buyerNickname },
                  { label: '셀러', value: order.sellerName },
                  { label: '결제 금액', value: won(order.payableAmount) },
                  { label: '주문 시각', value: order.orderedAtLabel },
                  { label: '주문 묶음', value: detail.detail.orderGroupId },
                ]}
              />
            </DrawerSummaryCard>

            {order.delayNote && (
              <div className="rounded-md border border-warning-border bg-warning-surface px-3 py-2.5 text-body-sm text-warning-fg">
                {order.delayNote}
              </div>
            )}

            <DetailField label={`주문 품목 / ${detail.detail.items.length}건`}>
              <ul className="space-y-1.5">
                {detail.detail.items.map(item => (
                  <li key={item.orderItemId} className="text-body-sm text-text-primary">
                    {item.productName}
                    {item.optionName ? ` / ${item.optionName}` : ''} ({item.quantity}개)
                    <span className="ml-1.5 text-caption text-text-tertiary tabular-nums">
                      {won(item.unitPrice)} / {item.itemStatusLabel}
                    </span>
                  </li>
                ))}
              </ul>
            </DetailField>

            <DetailField label="배송 진행">
              <Timeline steps={detail.detail.stages} />
            </DetailField>

            <DetailField
              label={`독촉 기록 / ${detail.detail.nudges.length}건`}
              visibility="internal-only"
            >
              <HistoryList
                items={detail.detail.nudges}
                renderDescription={item => item.memo}
                emptyLabel="독촉 기록이 없어요."
              />
            </DetailField>

            <DetailField label="독촉 메모" visibility="internal-only">
              <Textarea
                value={nudgeMemo}
                onChange={setNudgeMemo}
                maxLength={300}
                rows={3}
                placeholder="독촉 기록에 남길 사유를 입력하세요."
                disabled={nudgeBlockedReason != null}
              />
              {nudgeBlockedReason && (
                <p className="mt-1.5 text-caption text-warning-fg">{nudgeBlockedReason}</p>
              )}
            </DetailField>
          </DetailDrawerBody>
        )}
      </Drawer>

      {order && (
        <Modal
          open={confirmOpen}
          // 요청 중에는 닫히지 않게 한다 — 스크림·Esc·취소가 닫아도 요청은 계속 날아가고
          // 성공 토스트가 뜰 자리가 사라진다.
          onClose={() => {
            if (!nudge.isPending) setConfirmOpen(false)
          }}
          title="셀러 발송 독촉을 기록할까요?"
          // 서버는 알림도 메일도 보내지 않는다 — 어드민 실행 모듈이 발송 어댑터를 조립하지 않는다.
          // "알림이 나간다"고 적으면 운영자가 셀러에게 연락이 갔다고 믿고 후속 조치를 멈춘다.
          description="독촉 이력이 주문에 남아요. 셀러센터 알림과 메일은 나가지 않아요."
          confirmLabel="독촉 기록"
          loading={nudge.isPending}
          // 잠긴 동안에는 확인 버튼을 아예 두지 않는다 — 눌러도 아무 일도 없는 버튼은 장식 UI고,
          // DS Modal은 onConfirm이 없으면 버튼을 그리지 않는다. 요청 중에는 loading이 잠근다.
          onConfirm={nudgeBlockedReason != null && !nudge.isPending ? undefined : submitNudge}
        >
          {nudgeBlockedReason != null && !nudge.isPending && (
            <Alert variant="warning" title="지금은 독촉을 기록할 수 없어요" className="mb-2.5">
              <p>{nudgeBlockedReason}</p>
            </Alert>
          )}
          <SummaryGrid
            items={[
              { label: '주문', value: order.orderId },
              { label: '셀러', value: order.sellerName },
            ]}
          />
        </Modal>
      )}

      {toast && (
        <Toast
          open
          onClose={() => setToast(null)}
          message={toast.message}
          variant={toast.variant}
        />
      )}
    </div>
  )
}
