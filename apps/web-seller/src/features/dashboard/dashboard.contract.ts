// 셀러 대시보드 집계 BE(origin/develop `boot/seller/.../dashboard/**`, SCRUM-269·SCRUM-278)와
// 화면 사이의 순수 타입·매핑·규칙. 와이어 타입은 전부 생성물(@aechak/api)에서 가져오고 이 파일은
// FE 쪽 이름과 표시 규칙만 붙인다 — OpenAPI 스펙이 바뀌면 생성물을 재생성하는 것만으로 여기서
// 타입 오류가 드러난다(products.contract·store-settings.contract 관례).
import { errorResponse } from '@aechak/api'
import type {
  ClaimType,
  SellerClaimPendingStage,
  SellerDashboardMetric,
  SellerDashboardMetrics,
  SellerDashboardPeriod,
  SellerDashboardSummaryData,
  SellerOrderStatusFilter,
} from '@aechak/api'

export type {
  SellerDashboardMetric,
  SellerDashboardMetrics,
  SellerDashboardPeriod,
  SellerDashboardProductStatuses,
  SellerDashboardSettlementSummary,
  SellerDashboardSummaryData,
} from '@aechak/api'

/** 응답 `metrics`의 키 그대로. 지표가 늘면 아래 표(Record)에서 키 누락으로 컴파일 오류가 난다. */
export type DashboardMetricKey = keyof SellerDashboardMetrics

// ─── 기간 필터 ───────────────────────────────────────────────────────────────
// 서버 기간은 응답 기준 시각(now)을 끝으로 하는 시각 단위 반개구간이다(`7d` = `[now-7일, now)`).
// 목록 화면의 기간 필터는 날짜 단위라 이 구간을 그대로 재현할 수 없다 — 그래서 카드에서 목록으로
// 넘어갈 때 기간을 넘기지 않는다(아래 MetricTarget 주석).

export const DASHBOARD_PERIOD_OPTIONS: { value: SellerDashboardPeriod; label: string }[] = [
  { value: 'all', label: '전체 기간' },
  { value: '7d', label: '최근 7일' },
  { value: '30d', label: '최근 30일' },
  { value: '90d', label: '최근 90일' },
]

/** 직전 구간을 말로 가리킬 때 쓰는 길이 — `all`은 직전 구간이 없어 빠진다. */
const PERIOD_LENGTH_LABEL: Record<Exclude<SellerDashboardPeriod, 'all'>, string> = {
  '7d': '7일',
  '30d': '30일',
  '90d': '90일',
}

// ─── 목적지 목록 화면이 받는 쿼리 어휘 ──────────────────────────────────────
// 주문·클레임 목록 화면의 코드는 읽지 않는다(feature → feature import 금지) — 어휘는 **생성물**에서
// 가져온다. 두 목록이 실서버에 붙으면서 `/sellers/me/orders`·`/sellers/me/claims`가 스펙에 올라와
// `SellerOrderStatusFilter`·`SellerClaimPendingStage`·`ClaimType`이 생성물에 있다(손으로 옮겨 적은
// 유니온을 여기서 지웠다).
//
// 손으로 옮긴 어휘를 남겨 두면 서버가 세그먼트 이름을 바꿔도 이 파일은 깨지지 않고, 카드가 낡은
// 값을 주소에 실어 목록의 validateSearch가 그 값을 버린다 — "카드를 누르면 그 단계의 목록이 열려요"가
// 조용히 거짓이 되는 자리다(SCRUM-300 b270200이 고친 결함과 같은 모양). 생성물을 보면 재생성만으로
// 여기서 타입 오류가 난다.

/** `GET /sellers/me/orders`의 `status` 세그먼트 어휘. 한 세그먼트가 주문 상태 여러 개를 묶는다. */
export type SellerOrderStatusSegment = SellerOrderStatusFilter

/** `GET /sellers/me/claims`의 `claimType`. */
export type SellerClaimTypeCode = ClaimType

/**
 * 카드를 눌렀을 때 열 목록과 그 목록에 실어 보낼 쿼리.
 *
 * **기간을 싣지 않는다.** 카드의 기간 축은 `now` 기준 시각 단위 반개구간이고 목록 필터
 * (`orderedFrom`/`orderedTo`·`requestedFrom`/`requestedTo`)는 날짜 단위(시작일 00:00 ~ 종료일
 * 다음 날 00:00)라, 기간을 함께 넘기면 목록이 양쪽 경계에서 더 넓게 잡아 카드 숫자와 어긋난다.
 * 단계·상태 축만 넘기면 판정이 서버 한 곳(`SellerClaimPendingStage`)에서 나오므로 어긋나지 않는다.
 * 대신 기간을 고른 상태에서 카드를 누르면 목록이 카드보다 많이 보이므로, 화면이 그 사실을 미리 알린다.
 *
 * `target`이 null이면 목적지가 없는 지표다(집계 불가 — 카드를 누를 수 없다).
 */
export type DashboardMetricTarget =
  | { screen: '/orders'; search: { status: SellerOrderStatusSegment } }
  | {
      screen: '/claims'
      search: { pendingStage: SellerClaimPendingStage; claimType?: SellerClaimTypeCode }
    }

/** 카드가 열 수 있는 목록 화면. 그 화면이 아직 목업 차단 상태면 카드를 누를 수 없게 둔다. */
export type DashboardListScreen = DashboardMetricTarget['screen']

/** 지표가 "언제 생긴 일인지"를 세는 축 — 직전 기간 문구의 낱말이 여기서 갈린다. */
export type DashboardOccurrenceAxis = 'ordered' | 'requested'

export type DashboardMetricIconKey =
  | 'shopping-bag'
  | 'package'
  | 'truck'
  | 'x-circle'
  | 'rotate-ccw'
  | 'repeat'
  | 'scan-line'
  | 'package-check'
  | 'send'
  | 'message-circle'

export type DashboardSectionKey = 'orders' | 'claim-requests' | 'claim-after-approval' | 'inquiries'

export interface DashboardMetricMeta extends DashboardMetricDisplay {
  key: DashboardMetricKey
}

/** 키를 뺀 표시 규칙 — 표가 `Record<DashboardMetricKey, …>`라 키는 표의 자리에서 나온다. */
export interface DashboardMetricDisplay {
  label: string
  icon: DashboardMetricIconKey
  section: DashboardSectionKey
  axis: DashboardOccurrenceAxis
  /** 이 숫자를 줄이려면 셀러가 다음에 할 일. */
  nextAction: string
  /** 발송 기한을 넘긴 건처럼 먼저 눈에 들어와야 하는 지표. */
  urgent?: boolean
  target: DashboardMetricTarget | null
}

/**
 * 지표 10종의 표시 규칙.
 *
 * **Record라서 생성물에 지표가 늘면 여기서 컴파일 오류가 난다** — 배열이면 늘어난 지표를 조용히
 * 빠뜨린 채 타입 검사와 테스트를 모두 통과하고, 화면에서만 사라진다.
 *
 * 승인 이후 세 지표(회수 송장 등록 대기·회수 완료 처리 대기·재발송 대기)를 한 칸에 합치지 않는다 —
 * 회수 중(COLLECTING) 한 상태에 송장 등록과 완료 처리라는 서로 다른 할 일이 들어 있어, 합쳐 세면
 * 셀러가 숫자를 보고도 무엇을 해야 할지 모른다(BE가 단계를 나눠 센 이유와 같다).
 */
export const DASHBOARD_METRIC_DISPLAY: Record<DashboardMetricKey, DashboardMetricDisplay> = {
  newOrders: {
    label: '신규 주문',
    icon: 'shopping-bag',
    section: 'orders',
    axis: 'ordered',
    nextAction: '발주 확인',
    target: { screen: '/orders', search: { status: 'new' } },
  },
  awaitingShipment: {
    label: '발송 대기',
    icon: 'package',
    section: 'orders',
    axis: 'ordered',
    nextAction: '송장 등록',
    target: { screen: '/orders', search: { status: 'awaiting-dispatch' } },
  },
  shippingDelayed: {
    // 발송 기한을 넘긴 건이고 발송 대기의 부분집합이다 — 두 카드의 합은 전체가 아니다.
    // 목록에는 지연만 걸러내는 필터가 없어 같은 발송 대기 목록으로 보낸다(숫자가 더 많다).
    label: '발송 지연',
    icon: 'truck',
    section: 'orders',
    axis: 'ordered',
    nextAction: '지연 처리',
    urgent: true,
    target: { screen: '/orders', search: { status: 'awaiting-dispatch' } },
  },
  cancelRequests: {
    label: '취소 요청',
    icon: 'x-circle',
    section: 'claim-requests',
    axis: 'requested',
    nextAction: '승인 여부 판단',
    target: {
      screen: '/claims',
      search: { pendingStage: 'DECISION_PENDING', claimType: 'CANCEL' },
    },
  },
  returnRequests: {
    label: '반품 요청',
    icon: 'rotate-ccw',
    section: 'claim-requests',
    axis: 'requested',
    nextAction: '승인 여부 판단',
    target: {
      screen: '/claims',
      search: { pendingStage: 'DECISION_PENDING', claimType: 'RETURN' },
    },
  },
  exchangeRequests: {
    label: '교환 요청',
    icon: 'repeat',
    section: 'claim-requests',
    axis: 'requested',
    nextAction: '승인 여부 판단',
    target: {
      screen: '/claims',
      search: { pendingStage: 'DECISION_PENDING', claimType: 'EXCHANGE' },
    },
  },
  collectionInvoicePending: {
    label: '회수 송장 등록 대기',
    icon: 'scan-line',
    section: 'claim-after-approval',
    axis: 'requested',
    nextAction: '회수 송장 등록',
    target: { screen: '/claims', search: { pendingStage: 'COLLECTION_INVOICE_PENDING' } },
  },
  collectionCompletionPending: {
    label: '회수 완료 처리 대기',
    icon: 'package-check',
    section: 'claim-after-approval',
    axis: 'requested',
    nextAction: '물건 도착 확정',
    target: { screen: '/claims', search: { pendingStage: 'COLLECTION_COMPLETION_PENDING' } },
  },
  reshipPending: {
    // 단계 조건에 교환이 이미 들어 있어(반품의 환불 대기는 셀러가 할 일이 없다) 유형을 덧붙이지 않는다.
    label: '재발송 대기',
    icon: 'send',
    section: 'claim-after-approval',
    axis: 'requested',
    nextAction: '교환품 재발송',
    target: { screen: '/claims', search: { pendingStage: 'RESHIP_PENDING' } },
  },
  unansweredInquiries: {
    // supported=false로 내려온다 — 셀러에 귀속되는 문의 모델이 아직 없다(admin_inquiries는 어드민용).
    // 목적지 화면도 없어 카드를 누를 수 없다.
    label: '미응답 문의',
    icon: 'message-circle',
    section: 'inquiries',
    axis: 'requested',
    nextAction: '문의 답변',
    target: null,
  },
}

/**
 * 화면에 그리는 순서. 표의 키를 빠짐없이 한 번씩 담는지는 contract 테스트가 검사한다 —
 * 순서까지 타입으로 강제하려면 "모든 키를 정확히 한 번" 담는 튜플 타입이 필요해 읽기가 더 나빠진다.
 */
export const DASHBOARD_METRIC_ORDER: readonly DashboardMetricKey[] = [
  'newOrders',
  'awaitingShipment',
  'shippingDelayed',
  'cancelRequests',
  'returnRequests',
  'exchangeRequests',
  'collectionInvoicePending',
  'collectionCompletionPending',
  'reshipPending',
  'unansweredInquiries',
]

/** 표와 순서를 합친 화면용 목록. 순서가 화면 순서다. */
export const DASHBOARD_METRICS: DashboardMetricMeta[] = DASHBOARD_METRIC_ORDER.map(key => ({
  key,
  ...DASHBOARD_METRIC_DISPLAY[key],
}))

export interface DashboardSectionMeta {
  key: DashboardSectionKey
  title: string
  description?: string
}

export const DASHBOARD_SECTIONS: DashboardSectionMeta[] = [
  { key: 'orders', title: '주문', description: '발송 지연은 발송 대기 가운데 기한을 넘긴 건이에요.' },
  { key: 'claim-requests', title: '요청 대기', description: '승인 여부를 아직 판단하지 않은 건이에요.' },
  {
    key: 'claim-after-approval',
    title: '승인 이후 처리 대기',
    description: '승인한 뒤로도 회수 송장 등록 / 회수 완료 처리 / 재발송이 차례로 셀러 몫이에요.',
  },
  { key: 'inquiries', title: '문의' },
]

// ─── 증감 표기 ───────────────────────────────────────────────────────────────

/**
 * 직전 기간 값 설명 문구. **증감률을 만들지 않는다.**
 *
 * `previousValue`는 "직전 기간 말에 남아 있던 잔량"이 아니라 "직전 구간에 발생했고 **지금도** 그
 * 단계인 건수"다. 집계 스냅샷 테이블이 없어 서버가 지금 상태를 기간만 과거로 옮겨 다시 세기 때문이다.
 * 그래서 두 값의 비율은 업무 흐름과 방향이 거꾸로다 — 셀러가 묵은 건을 전부 처리하면 직전 값이 0으로
 * 내려가 증감률이 폭등하고, 반대로 묵은 건을 방치하면 증감률이 얌전해진다. "지난주보다 N% 늘었어요"로
 * 읽히는 표기는 뜻이 틀리므로 비율·화살표를 쓰지 않고, 그 숫자가 실제로 가리키는 것(**아직 처리되지
 * 않은 묵은 건수**)을 그대로 적는다.
 *
 * null이면 표시할 것이 없다 — `period=all`은 비교할 직전 구간이 없어 `previousValue`도 null이다
 * (0으로 내려오지 않으므로 "직전에 0건"과 혼동되지 않는다).
 */
export function previousValueHint(
  metric: SellerDashboardMetric,
  period: SellerDashboardPeriod,
  axis: DashboardOccurrenceAxis,
): string | null {
  if (!metric.supported) return null
  if (period === 'all' || metric.previousValue == null) return null
  const length = PERIOD_LENGTH_LABEL[period]
  const occurrence = axis === 'ordered' ? '주문분' : '요청분'
  return metric.previousValue === 0
    ? `직전 ${length} ${occurrence}은 남지 않았어요`
    : `직전 ${length} ${occurrence} 중 ${metric.previousValue.toLocaleString('ko-KR')}건 남음`
}

// ─── 조회 실패 분류 ─────────────────────────────────────────────────────────

/**
 * 셀러센터 조회 자격이 없다는 거절인지(403). BE `SellerDashboardFacade.requireDashboardReadableSeller`가
 * ACTIVE·PAUSED·WITHDRAWAL_REQUESTED 밖의 셀러를 `SELLER_CENTER_READ_FORBIDDEN`(errorCode 10003)으로
 * 막는다. 같은 셀러가 다시 보내도 같은 답이므로 **재시도로 풀리지 않는다.**
 *
 * 그래서 화면이 네트워크 실패와 같이 다루면 두 가지가 틀어진다 — (1) 직전에 받은 숫자를 "방금 못
 * 불러왔다"는 안내와 함께 계속 보여주면 자격이 남아 있는 것처럼 읽히고, (2) 재시도 버튼이 영원히
 * 실패하는 버튼이 된다. errorCode가 아니라 status로 가르는 이유는 자격 거절 코드가 10003 하나가
 * 아니기 때문이다(SELLER_NOT_ACTIVE 10002도 403이고, 둘 다 셀러센터를 열 수 없다는 뜻이다).
 * 미로그인 401은 여기 오지 않는다 — 공유 클라이언트가 refresh 뒤 로그인 화면으로 보낸다.
 */
export function isSellerCenterForbidden(error: unknown): boolean {
  return errorResponse(error)?.status === 403
}

/**
 * 그 403이 **왜** 났는지. 상태로 가른 거절 안에 사유가 둘 섞여 있어 문구를 하나로 두면 거짓이 된다 —
 * 온보딩 미완(20006)은 정지·탈퇴가 아니라 구매자 앱에서 약관·닉네임을 마치면 풀리는 상태다.
 *
 * 셀러센터에는 온보딩 화면이 없어 전역 유도 핸들러가 없다(main.tsx가 등록하는 것은 401뿐) —
 * 그래서 이 문구가 유일한 안내다. 로그인 콜백이 `status=PENDING_ONBOARDING`을 보고 로그인 화면에서
 * 먼저 막지만(routes/login/complete.tsx), 그 콜백을 거치지 않고 남아 있던 세션으로 주소를 직접
 * 열면(북마크·새 탭) 이 화면이 받는다. 문구는 products·orders·claims 계약과 같은 문장이다.
 */
export function sellerCenterForbiddenMessage(error: unknown): string {
  if (errorResponse(error)?.data?.errorCode === 20006) {
    return '구매자 앱에서 온보딩(약관/닉네임)을 완료한 뒤 이용할 수 있어요.'
  }
  return '셀러 자격이 정지되거나 탈퇴 처리된 계정이에요. 다시 이용하려면 고객센터에 문의해 주세요.'
}

// ─── 기간 무관 스냅샷 ───────────────────────────────────────────────────────

export interface DashboardProductStatusPill {
  key: keyof SellerDashboardSummaryData['productStatuses']
  label: string
  /** 비활성/휴면이 아닌 대등한 상태에는 muted를 쓰지 않는다(DS 규약). */
  variant: 'neutral' | 'error' | 'danger' | 'warning'
}

/**
 * 상품 상태 4종. 서로 배타적이지 않다 — 판매 중지 상품의 재고가 0이면 중지와 품절에 함께 센다.
 * 합이 상품 수와 같을 필요가 없는 요약이다.
 */
export const DASHBOARD_PRODUCT_STATUSES: DashboardProductStatusPill[] = [
  { key: 'awaitingInspection', label: '검수 대기', variant: 'neutral' },
  { key: 'rejected', label: '반려', variant: 'error' },
  { key: 'suspended', label: '판매 중지', variant: 'danger' },
  { key: 'soldOut', label: '품절', variant: 'warning' },
]

export function formatWon(amount: number): string {
  return `${amount.toLocaleString('ko-KR')}원`
}
