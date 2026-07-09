import type { StatusPillVariant } from '@aechak/design-system/web'

export type DashboardMetricIcon =
  | 'shopping-bag'
  | 'package'
  | 'truck'
  | 'x-circle'
  | 'rotate-ccw'
  | 'repeat'
  | 'message-circle'

export type DashboardPeriod = 'all' | '7d' | '30d' | '90d'

export interface DashboardMetricFooter {
  label: string
  pillVariant?: StatusPillVariant
}

export interface DashboardMetricTrend {
  direction: 'up' | 'down'
  percent: number
}

export interface DashboardMetric {
  key: string
  label: string
  icon: DashboardMetricIcon
  value: number
  variant?: 'default' | 'urgent'
  footer: DashboardMetricFooter
  trend?: DashboardMetricTrend
}

export interface DashboardSettlementSummary {
  totalAmount: number
  pendingAmount: number
  onHoldAmount: number
}

export interface DashboardProductStatus {
  key: string
  label: string
  count: number
  variant: StatusPillVariant
}

export interface DashboardSummary {
  metrics: DashboardMetric[]
  settlement: DashboardSettlementSummary
  productStatuses: DashboardProductStatus[]
}

type DashboardMetricKey =
  | 'new-orders'
  | 'awaiting-shipment'
  | 'shipping-delayed'
  | 'cancel-requests'
  | 'return-requests'
  | 'exchange-requests'
  | 'unanswered-inquiries'

interface DashboardMetricMeta {
  key: DashboardMetricKey
  label: string
  icon: DashboardMetricIcon
  variant?: 'default' | 'urgent'
  footer: DashboardMetricFooter
}

// 값(누적 카운트)/증감률만 기간별로 달라지고 라벨·아이콘·footer 문구는 기간과 무관해 메타로 분리.
const DASHBOARD_METRIC_META: DashboardMetricMeta[] = [
  {
    key: 'new-orders',
    label: '신규 주문',
    icon: 'shopping-bag',
    footer: { label: '발주 확인 필요', pillVariant: 'info' },
  },
  {
    key: 'awaiting-shipment',
    label: '발송 대기',
    icon: 'package',
    footer: { label: '오늘 발송 예정' },
  },
  {
    key: 'shipping-delayed',
    label: '배송 지연',
    icon: 'truck',
    variant: 'urgent',
    footer: { label: '지연 처리', pillVariant: 'warning' },
  },
  {
    key: 'cancel-requests',
    label: '취소 요청',
    icon: 'x-circle',
    footer: { label: '배송 전' },
  },
  {
    key: 'return-requests',
    label: '반품 요청',
    icon: 'rotate-ccw',
    footer: { label: '수거 대기' },
  },
  {
    key: 'exchange-requests',
    label: '교환 요청',
    icon: 'repeat',
    footer: { label: '검수 대기' },
  },
  {
    key: 'unanswered-inquiries',
    label: '미응답 문의',
    icon: 'message-circle',
    footer: { label: '응답 필요', pillVariant: 'accent' },
  },
]

type DashboardMetricValue = Pick<DashboardMetric, 'value' | 'trend'>

// 기간이 길수록 누적 카운트가 커지도록 구성 (정산 예정 금액/상품 상태는 "현재 스냅샷"이라
// 기간과 무관하게 DASHBOARD_SETTLEMENT_MOCK/DASHBOARD_PRODUCT_STATUSES_MOCK 하나만 사용).
const DASHBOARD_METRIC_VALUES_BY_PERIOD: Record<DashboardPeriod, Record<DashboardMetricKey, DashboardMetricValue>> = {
  '7d': {
    'new-orders': { value: 8, trend: { direction: 'up', percent: 12 } },
    'awaiting-shipment': { value: 6, trend: { direction: 'down', percent: 5 } },
    'shipping-delayed': { value: 2, trend: { direction: 'up', percent: 8 } },
    'cancel-requests': { value: 3, trend: { direction: 'down', percent: 15 } },
    'return-requests': { value: 1, trend: { direction: 'up', percent: 3 } },
    'exchange-requests': { value: 1, trend: { direction: 'down', percent: 10 } },
    'unanswered-inquiries': { value: 5, trend: { direction: 'up', percent: 25 } },
  },
  '30d': {
    'new-orders': { value: 34, trend: { direction: 'up', percent: 18 } },
    'awaiting-shipment': { value: 21, trend: { direction: 'down', percent: 9 } },
    'shipping-delayed': { value: 5, trend: { direction: 'up', percent: 6 } },
    'cancel-requests': { value: 11, trend: { direction: 'down', percent: 12 } },
    'return-requests': { value: 4, trend: { direction: 'up', percent: 14 } },
    'exchange-requests': { value: 3, trend: { direction: 'down', percent: 7 } },
    'unanswered-inquiries': { value: 14, trend: { direction: 'up', percent: 20 } },
  },
  '90d': {
    'new-orders': { value: 96, trend: { direction: 'up', percent: 22 } },
    'awaiting-shipment': { value: 58, trend: { direction: 'down', percent: 4 } },
    'shipping-delayed': { value: 9, trend: { direction: 'up', percent: 11 } },
    'cancel-requests': { value: 27, trend: { direction: 'down', percent: 8 } },
    'return-requests': { value: 10, trend: { direction: 'up', percent: 9 } },
    'exchange-requests': { value: 8, trend: { direction: 'down', percent: 5 } },
    'unanswered-inquiries': { value: 33, trend: { direction: 'up', percent: 17 } },
  },
  all: {
    'new-orders': { value: 412, trend: { direction: 'up', percent: 9 } },
    'awaiting-shipment': { value: 240, trend: { direction: 'down', percent: 2 } },
    'shipping-delayed': { value: 18, trend: { direction: 'up', percent: 3 } },
    'cancel-requests': { value: 96, trend: { direction: 'down', percent: 4 } },
    'return-requests': { value: 34, trend: { direction: 'up', percent: 5 } },
    'exchange-requests': { value: 22, trend: { direction: 'down', percent: 3 } },
    'unanswered-inquiries': { value: 45, trend: { direction: 'up', percent: 6 } },
  },
}

const DASHBOARD_SETTLEMENT_MOCK: DashboardSettlementSummary = {
  totalAmount: 1_284_000,
  pendingAmount: 312_000,
  onHoldAmount: 48_000,
}

const DASHBOARD_PRODUCT_STATUSES_MOCK: DashboardProductStatus[] = [
  { key: 'awaiting-review', label: '검수 대기', count: 2, variant: 'neutral' },
  { key: 'rejected', label: '반려', count: 1, variant: 'error' },
  { key: 'suspended', label: '판매 중지', count: 1, variant: 'danger' },
  { key: 'sold-out', label: '품절', count: 3, variant: 'muted' },
]

export function getDashboardSummaryMock(period: DashboardPeriod): DashboardSummary {
  const values = DASHBOARD_METRIC_VALUES_BY_PERIOD[period]
  return {
    metrics: DASHBOARD_METRIC_META.map(meta => ({ ...meta, ...values[meta.key] })),
    settlement: DASHBOARD_SETTLEMENT_MOCK,
    productStatuses: DASHBOARD_PRODUCT_STATUSES_MOCK,
  }
}

export const dashboardSummaryEmptyMock: DashboardSummary = {
  metrics: [],
  settlement: { totalAmount: 0, pendingAmount: 0, onHoldAmount: 0 },
  productStatuses: [],
}
