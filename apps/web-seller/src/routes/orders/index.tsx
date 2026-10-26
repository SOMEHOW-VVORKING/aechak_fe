import { useEffect, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import {
  Alert,
  Button,
  DatePicker,
  FilterBar,
  FilterChipGroup,
  Modal,
  PageHeader,
  SearchInput,
} from '@aechak/design-system/web'
import { FieldError } from '@/shared/components/Field'
import { UnavailableScreen } from '@/shared/components/UnavailableScreen'
import { SERVER_ORDERS_AVAILABLE } from '@/shared/serverAvailability'
import { useToast } from '@/shared/hooks/useToast'
import {
  KEYWORD_MAX,
  ORDER_SEGMENTS,
  ORDER_SEGMENT_LABEL,
  OrderDetailDrawer,
  OrdersTable,
  ShipmentModal,
  orderErrorMessage,
  useAcceptOrder,
  useCompleteDelivery,
  useRegisterShipment,
  useSellerOrders,
  type OrderStatusSegment,
  type SellerOrderSearchInput,
  type SellerOrderSummary,
  type ShipmentRegisterRequest,
} from '@/features/orders'

export const Route = createFileRoute('/orders/')({
  component: OrdersGate,
  // 대시보드 카드가 단계 축을 주소로 실어 보낸다(`/orders?status=new`) — 선언하지 않으면 라우터가
  // 그 값을 버려 "카드를 누르면 그 단계의 목록이 열려요"라는 안내가 거짓이 된다(목록은 전체로 열린다).
  // 기간은 일부러 받지 않는다: 카드의 기간은 시각 단위, 목록 필터는 날짜 단위라 함께 넘기면
  // 숫자가 어긋난다(dashboard.contract의 DashboardMetricTarget 주석).
  //
  // 모르는 값은 버리지 말고 **기본값으로 덮어써야** 한다 — 라우터는 validateSearch가 돌려준 키만
  // 덮어쓰고 빠뜨린 키는 주소의 날값을 그대로 통과시킨다. 키를 빼면 `?status=nope`가 그대로 조회에
  // 실려 서버가 400으로 거절한다.
  validateSearch: (search: Record<string, unknown>): { status: OrderStatusSegment } => {
    const status = search['status']
    return {
      status:
        typeof status === 'string' && (ORDER_SEGMENTS as string[]).includes(status)
          ? (status as OrderStatusSegment)
          : 'all',
    }
  },
})

// 운영 진입 차단 스위치는 shared에 있다(`shared/serverAvailability`) — 대시보드 카드처럼 이 화면으로
// 보내는 진입점이 같은 값을 봐야 "목록이 열려요"라고 안내하고 준비 중 화면으로 보내는 일이 생기지
// 않는다. 상수는 올라가 있고(서버가 있다) 분기는 남겨 둔다 — 서버가 내려가면 상수만 내려 운영
// 진입점을 한 번에 닫을 수 있어야 한다.
function OrdersGate() {
  if (!SERVER_ORDERS_AVAILABLE) {
    return (
      <UnavailableScreen
        title="주문/배송 관리"
        message="주문/배송 관리는 준비 중이에요"
        description="주문 조회와 발송 처리는 서버가 준비되면 열어 둘게요."
      />
    )
  }
  return <OrdersRoute />
}

// 셀러 주문 API 5경로가 seller 모듈에 올라와(SCRUM-291) 목업 배선을 걷어냈다.
// 목록·상세·발주확인·송장등록·배송완료가 전부 실서버다. 아직 셀러센터에 없는 처리는 둘이다 —
// · 송장 정정: 서버에 경로가 없다(재등록은 409/50302). 목업 시절의 '송장 수정' 버튼을 지웠다.
// · 클레임 승인·거부: 별 화면(/claims) 소관이라 여기서는 진행 중 클레임을 알리기만 한다.

/**
 * 되돌릴 수 없는 전이 둘은 확인 Modal을 거친다 — 발주 확인은 PAID로 돌아갈 길이 없고(전이표가
 * PREPARING → PAID를 막는다) 배송 완료는 구매확정 시계를 시작한다. 뮤테이션은 Modal이 아니라
 * 라우트가 소유해 그 isPending으로 목록의 다른 행 버튼까지 잠근다(AGENTS 확인 Modal 패턴).
 */
type OrderAction = 'accept' | 'complete-delivery'

const ACTION_CONFIRM: Record<
  OrderAction,
  { title: string; description: string; confirmLabel: string; successMessage: string }
> = {
  accept: {
    title: '발주를 확인할까요?',
    description:
      '주문 상태가 상품준비중으로 바뀌고 되돌릴 수 없어요. 구매자는 이때부터 바로 취소할 수 없고 셀러 승인을 거쳐야 해요.',
    confirmLabel: '발주 확인',
    successMessage: '발주를 확인했어요.',
  },
  'complete-delivery': {
    title: '배송 완료로 처리할까요?',
    description:
      '구매확정 기한이 시작되고 되돌릴 수 없어요. 기한이 지나면 자동으로 구매확정돼요. 실제로 도착한 주문만 처리해 주세요.',
    confirmLabel: '배송 완료',
    successMessage: '배송 완료로 처리했어요.',
  },
}

interface Filters {
  segment: OrderStatusSegment
  keyword: string
  /** YYYY-MM-DD. 양 끝 날짜를 통째로 포함한다(서버가 to+1일 00:00 반개구간으로 바꾼다). */
  orderedFrom: string
  orderedTo: string
  page: number
}

const EMPTY_FILTERS: Filters = {
  segment: 'all',
  keyword: '',
  orderedFrom: '',
  orderedTo: '',
  page: 0,
}

// 빈 값(빈 날짜·빈 검색어)을 여기서 걸러내지 않는다 — 와이어 모양은 queries 층의
// normalizeOrderSearchParams가 한 곳에서 소유한다. 서버는 `?orderedFrom=`처럼 값이 빈 파라미터를
// 미입력이 아니라 형식 오류로 거절한다.
function toParams(f: Filters): SellerOrderSearchInput {
  return {
    status: f.segment,
    keyword: f.keyword,
    orderedFrom: f.orderedFrom,
    orderedTo: f.orderedTo,
    page: f.page,
  }
}

const SEGMENT_OPTIONS = ORDER_SEGMENTS.map(value => ({ value, label: ORDER_SEGMENT_LABEL[value] }))

function OrdersRoute() {
  // 첫 필터만 주소에서 받는다(그 뒤 조작은 화면 상태가 소유한다 — 필터 하나하나를 주소에
  // 동기화하는 것은 이 화면의 범위가 아니다).
  const { status } = Route.useSearch()
  const [filters, setFilters] = useState<Filters>({ ...EMPTY_FILTERS, segment: status })
  const listQuery = useSellerOrders(toParams(filters))
  // `isPlaceholderData`는 "지금 보고 있는 data가 이전 키(이전 페이지·이전 필터)의 응답"이라는
  // 뜻이다. 처리 뒤 무효화나 포커스 복귀로 같은 키를 다시 받는 중에는 false다 — 그래서 이 값으로
  // 잠가도 처리 직후의 재조회까지 함께 잠기지 않는다(클레임·정산 화면과 같은 처리).
  const { data, isLoading, isError, error, isFetching, isPlaceholderData } = listQuery

  const [detailOrderId, setDetailOrderId] = useState<string | null>(null)
  const [shipmentOrder, setShipmentOrder] = useState<SellerOrderSummary | null>(null)
  const [confirmTarget, setConfirmTarget] = useState<{ action: OrderAction; order: SellerOrderSummary } | null>(
    null,
  )

  const acceptOrder = useAcceptOrder()
  const registerShipment = useRegisterShipment()
  const completeDelivery = useCompleteDelivery()
  const toast = useToast()

  // 목록의 모든 행 버튼을 이 값으로 잠근다 — 처리 중에 다른 행을 누르면 어느 주문이 바뀌었는지
  // 알 수 없게 된다.
  const isMutating = acceptOrder.isPending || registerShipment.isPending || completeDelivery.isPending

  // 마지막 페이지의 유일한 주문이 필터/상태 변경으로 빠지면 페이지 이동 버튼도 사라진 빈 페이지에 남는다.
  //
  // `isPlaceholderData`일 때는 보정하지 않는다 — 그때 `data`는 **이전 키의 응답**이라 totalPages가
  // 지금 요청한 필터/페이지의 것이 아니다. 전환 중에 보정하면 방금 누른 페이지를 이전 응답 기준으로
  // 되돌려 버린다.
  const lastPage = Math.max((data?.totalPages ?? 1) - 1, 0)
  useEffect(() => {
    if (data && !isPlaceholderData && filters.page > lastPage) {
      setFilters(prev => ({ ...prev, page: lastPage }))
    }
  }, [data, isPlaceholderData, filters.page, lastPage])

  // 필터를 바꾸면 첫 페이지로 돌아간다.
  const setFilter = (patch: Partial<Omit<Filters, 'page'>>) => setFilters(prev => ({ ...prev, ...patch, page: 0 }))

  const showError = (error: unknown) => toast.show(orderErrorMessage(error), 'error')

  function handleConfirm() {
    if (!confirmTarget) return
    const { action, order } = confirmTarget
    const mutation = action === 'accept' ? acceptOrder : completeDelivery
    mutation.mutate(order.orderId, {
      onSuccess: () => {
        setConfirmTarget(null)
        toast.show(ACTION_CONFIRM[action].successMessage)
      },
      onError: error => {
        setConfirmTarget(null)
        showError(error)
      },
    })
  }

  function handleRegisterShipment(body: ShipmentRegisterRequest) {
    if (!shipmentOrder) return
    registerShipment.mutate(
      { orderPublicId: shipmentOrder.orderId, body },
      {
        onSuccess: () => {
          setShipmentOrder(null)
          toast.show('발송을 확정했어요.')
        },
        // 실패해도 Modal은 닫지 않는다 — 송장번호를 고쳐 바로 다시 보낼 수 있어야 한다.
        onError: showError,
      },
    )
  }

  // DatePicker의 min/max는 피커 UI만 묶는다 — 키보드로 직접 날짜를 쳐 넣으면 역전된 범위가 그대로
  // 상태에 들어오고 BE가 400/90001로 거절한다(be SellerOrderSearchRequest.toQuery). 서버 문구는
  // "입력한 내용을 다시 확인해 주세요"라 어느 칸이 문제인지 알려주지 않으므로 자리를 짚어 준다.
  // ISO yyyy-MM-dd는 사전순이 곧 시간순이라 문자열 비교로 충분하다.
  const dateRangeInverted =
    filters.orderedFrom !== '' && filters.orderedTo !== '' && filters.orderedFrom > filters.orderedTo

  const totalPages = data?.totalPages ?? 0
  // 재조회가 실패해도 keepPreviousData가 직전 페이지를 남긴다 — 그 상태를 안내 문구로 가른다.
  const hasRows = (data?.orders.length ?? 0) > 0

  return (
    <div className="p-6">
      <PageHeader title="주문/배송 관리" />

      <div className="flex flex-col gap-2">
        <FilterBar>
          {/* FilterChipGroup은 다중 토글이라 호출부가 단일 선택으로 좁힌다 — 서버 status 파라미터가
              세그먼트 하나만 받는다. 마지막으로 누른 값을 쓰고, 다 끄면 '전체'로 되돌린다. */}
          <FilterChipGroup
            options={SEGMENT_OPTIONS}
            value={[filters.segment]}
            onChange={next =>
              setFilter({ segment: (next[next.length - 1] as OrderStatusSegment | undefined) ?? 'all' })
            }
          />
        </FilterBar>
        <FilterBar>
          <SearchInput
            value={filters.keyword}
            onChange={keyword => setFilter({ keyword })}
            placeholder="주문번호 / 수령인 / 구매자"
            maxLength={KEYWORD_MAX}
            className="w-60"
          />
          {/* 시작일 > 종료일은 BE가 400/90001로 거절한다 — 서로의 min/max로 애초에 못 고르게 묶는다. */}
          <DatePicker
            label="주문일 시작"
            value={filters.orderedFrom}
            max={filters.orderedTo || undefined}
            state={dateRangeInverted ? 'error' : 'default'}
            onChange={orderedFrom => setFilter({ orderedFrom })}
          />
          <DatePicker
            label="주문일 종료"
            value={filters.orderedTo}
            min={filters.orderedFrom || undefined}
            state={dateRangeInverted ? 'error' : 'default'}
            onChange={orderedTo => setFilter({ orderedTo })}
          />
          <Button variant="ghost" size="md" onClick={() => setFilters(EMPTY_FILTERS)}>
            초기화
          </Button>
        </FilterBar>
        {/* DatePicker는 helperText를 쓰면 FilterBar 한 줄의 높이가 칸마다 달라져 입력칸이 어긋난다 —
            오류 문구는 줄 밖에 따로 둔다(products ProductEditor의 FieldError 관례). */}
        {dateRangeInverted && <FieldError>주문일 시작이 종료보다 늦어요.</FieldError>}
      </div>

      {/* 목록 조회 실패를 표의 빈 상태로 흘리지 않는다 — 실 API에는 403/40006(정지·탈퇴 셀러),
          403/20006(온보딩 미완), 400/90001(날짜 형식), 500이 모두 있고 그 전부가 "조건에 맞는 주문이
          없어요"로 보이면 셀러는 필터를 의심한다. 실패 모양이 두 가지다 — 필터를 바꾼 조회가 실패하면
          placeholderData가 버려져 표가 비고, 같은 조회의 재조회(처리 뒤 무효화·포커스 복귀)가 실패하면
          직전 성공 데이터가 그대로 남는다. 후자를 조용히 두지 않도록 낡은 목록임을 덧붙인다. */}
      {isError && (
        <Alert variant="error" className="mt-4">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className="min-w-0 flex-1">
              {orderErrorMessage(error)}
              {hasRows && ' 아래 목록은 마지막으로 불러온 내용이라 지금과 다를 수 있어요.'}
            </span>
            <Button variant="secondary" size="sm" loading={isFetching} onClick={() => void listQuery.refetch()}>
              다시 시도
            </Button>
          </div>
        </Alert>
      )}

      {/* 전환 중에는 건수를 이전 값으로 두지 않는다 — 필터를 바꾼 직후 `data`는 이전 조건의 응답이라
          그 숫자가 지금 조건의 건수처럼 보이면 셀러가 조건을 잘못 읽는다. 표는 지우지 않고
          (placeholderData의 이점) 이전 결과라는 사실만 밝힌다. */}
      <p className="mt-4 text-caption text-text-tertiary">
        총 {data && !isPlaceholderData ? data.totalCount.toLocaleString() : '—'}건
        {isPlaceholderData && (
          <span className="ml-2">바뀐 조건으로 불러오는 중이에요. 아래 목록은 이전 결과예요.</span>
        )}
      </p>
      <div className="mt-2">
        <OrdersTable
          orders={data?.orders ?? []}
          isLoading={isLoading}
          emptyLabel={isError ? '목록을 불러오지 못했어요.' : '조건에 맞는 주문이 없어요.'}
          isMutating={isMutating}
          onRowClick={order => setDetailOrderId(order.orderId)}
          onAccept={order => setConfirmTarget({ action: 'accept', order })}
          onShip={setShipmentOrder}
          onCompleteDelivery={order => setConfirmTarget({ action: 'complete-delivery', order })}
        />
      </div>
      <p className="mt-2 text-caption text-text-tertiary">
        등록한 송장은 셀러센터에서 바꿀 수 없어요. 취소/반품/교환 요청 처리는 클레임 관리에서 할 수 있어요.
      </p>

      {/* 전환 중에는 양쪽 버튼을 함께 잠근다 — `hasNext`·`totalPages`가 이전 페이지의 값이라
          그대로 믿으면 범위 밖 페이지로 넘어간다(3페이지 목록의 2페이지를 받는 동안 이전 응답의
          hasNext=true로 4페이지까지 갈 수 있고, 그러면 빈 표와 "4 / 3"을 보여 준 뒤 보정으로
          되돌아온다). 눌린 쪽만 잠그면 반대 버튼으로 같은 일이 생긴다. */}
      {totalPages > 1 && (
        <nav aria-label="페이지" className="mt-4 flex items-center justify-center gap-3">
          <Button
            variant="secondary"
            size="sm"
            disabled={filters.page === 0 || isPlaceholderData}
            onClick={() => setFilters(prev => ({ ...prev, page: prev.page - 1 }))}
          >
            이전
          </Button>
          <span className="text-body-sm tabular-nums text-text-secondary">
            {filters.page + 1} / {totalPages}
          </span>
          <Button
            variant="secondary"
            size="sm"
            disabled={!data?.hasNext || isPlaceholderData}
            onClick={() => setFilters(prev => ({ ...prev, page: prev.page + 1 }))}
          >
            다음
          </Button>
        </nav>
      )}

      {/* DS Modal은 ESC·스크림·취소를 `loading`과 무관하게 onClose로 흘린다(design-system/web/Modal).
          되돌릴 수 없는 전이가 날아간 뒤에 창만 닫히면 셀러는 취소된 줄로 읽으므로, 요청이 떠 있는
          동안에는 닫히지 않게 호출부에서 막는다 — 요청 자체는 취소할 수 없다(POST, abort 불가). */}
      {confirmTarget && (
        <Modal
          open
          onClose={() => {
            if (!isMutating) setConfirmTarget(null)
          }}
          title={ACTION_CONFIRM[confirmTarget.action].title}
          description={ACTION_CONFIRM[confirmTarget.action].description}
          confirmLabel={ACTION_CONFIRM[confirmTarget.action].confirmLabel}
          confirmVariant="primary"
          loading={isMutating}
          onConfirm={handleConfirm}
        />
      )}

      {/* 주문이 바뀌면 입력 중이던 송장값을 버리도록 key로 다시 마운트한다. */}
      <ShipmentModal
        key={shipmentOrder?.orderId ?? 'closed'}
        order={shipmentOrder}
        loading={registerShipment.isPending}
        onClose={() => {
          if (!registerShipment.isPending) setShipmentOrder(null)
        }}
        onSubmit={handleRegisterShipment}
      />

      <OrderDetailDrawer orderPublicId={detailOrderId} onClose={() => setDetailOrderId(null)} />

      {toast.element}
    </div>
  )
}
