import { describe, it, expect } from 'vitest'
import {
  DASHBOARD_METRICS,
  DASHBOARD_METRIC_DISPLAY,
  DASHBOARD_METRIC_ORDER,
  DASHBOARD_PERIOD_OPTIONS,
  DASHBOARD_SECTIONS,
  isSellerCenterForbidden,
  previousValueHint,
  type DashboardMetricKey,
  type SellerDashboardMetric,
} from '../dashboard.contract'

const metric = (overrides: Partial<SellerDashboardMetric> = {}): SellerDashboardMetric => ({
  value: 10,
  previousValue: 4,
  supported: true,
  ...overrides,
})

describe('대시보드 지표 표시 규칙', () => {
  it('[AC-SELLER-DASH-002] 서버 지표 10종을 하나도 빠뜨리지 않고 한 번씩만 그린다', () => {
    // 표 자체의 완전성은 **타입이** 지킨다 — DASHBOARD_METRIC_DISPLAY가
    // `Record<DashboardMetricKey, …>`라 생성물에 지표가 늘면 키 누락으로 컴파일 오류가 난다
    // (배열이던 때는 늘어난 지표를 조용히 빠뜨려도 타입·테스트가 모두 통과했다).
    // 그래서 여기서는 타입이 세어 주지 못하는 것만 본다: 개수와, 표를 화면 순서로 옮기는 과정.
    const tableKeys = Object.keys(DASHBOARD_METRIC_DISPLAY) as DashboardMetricKey[]
    expect(tableKeys).toHaveLength(10)
    expect([...DASHBOARD_METRIC_ORDER].sort()).toEqual([...tableKeys].sort())
    expect(new Set(DASHBOARD_METRIC_ORDER).size).toBe(DASHBOARD_METRIC_ORDER.length)
    expect(DASHBOARD_METRICS.map(meta => meta.key)).toEqual([...DASHBOARD_METRIC_ORDER])
  })

  it('[AC-SELLER-DASH-002] 승인 이후 세 단계가 한 칸으로 합쳐지지 않고 각각 카드를 갖는다', () => {
    const afterApproval = DASHBOARD_METRICS.filter(
      meta => meta.section === 'claim-after-approval',
    ).map(meta => meta.key)

    expect(afterApproval).toEqual([
      'collectionInvoicePending',
      'collectionCompletionPending',
      'reshipPending',
    ])
  })

  it('[AC-SELLER-DASH-003] 목적지 쿼리에 기간 파라미터가 섞이지 않는다', () => {
    // 카드 기간은 시각 단위 반개구간, 목록 필터는 날짜 단위라 함께 넘기면 숫자가 어긋난다.
    const periodKeys = ['period', 'orderedFrom', 'orderedTo', 'requestedFrom', 'requestedTo']
    for (const meta of DASHBOARD_METRICS) {
      if (!meta.target) continue
      for (const key of Object.keys(meta.target.search)) {
        expect(periodKeys).not.toContain(key)
      }
    }
  })

  it('[AC-SELLER-DASH-003] 클레임 단계 축과 주문 상태 세그먼트를 서버 어휘 그대로 싣는다', () => {
    const targets = Object.fromEntries(
      DASHBOARD_METRICS.map(meta => [meta.key, meta.target]),
    ) as Record<DashboardMetricKey, (typeof DASHBOARD_METRICS)[number]['target']>

    expect(targets.newOrders).toEqual({ screen: '/orders', search: { status: 'new' } })
    expect(targets.awaitingShipment).toEqual({
      screen: '/orders',
      search: { status: 'awaiting-dispatch' },
    })
    // 발송 지연만 걸러내는 목록 필터가 서버에 없어 발송 대기 목록으로 보낸다(목록이 더 많이 보인다).
    expect(targets.shippingDelayed).toEqual({
      screen: '/orders',
      search: { status: 'awaiting-dispatch' },
    })
    expect(targets.returnRequests).toEqual({
      screen: '/claims',
      search: { pendingStage: 'DECISION_PENDING', claimType: 'RETURN' },
    })
    expect(targets.collectionInvoicePending).toEqual({
      screen: '/claims',
      search: { pendingStage: 'COLLECTION_INVOICE_PENDING' },
    })
    expect(targets.collectionCompletionPending).toEqual({
      screen: '/claims',
      search: { pendingStage: 'COLLECTION_COMPLETION_PENDING' },
    })
    // 단계 조건이 이미 교환으로 좁혀져 있어 유형을 덧붙이지 않는다.
    expect(targets.reshipPending).toEqual({
      screen: '/claims',
      search: { pendingStage: 'RESHIP_PENDING' },
    })
    // 집계 불가 지표는 목적지가 없다.
    expect(targets.unansweredInquiries).toBeNull()
  })

  it('[AC-SELLER-DASH-001] 기간 선택지는 서버 enum 네 가지다', () => {
    expect(DASHBOARD_PERIOD_OPTIONS.map(option => option.value)).toEqual(['all', '7d', '30d', '90d'])
  })

  it('모든 지표가 선언된 섹션에 속한다', () => {
    const sections = new Set(DASHBOARD_SECTIONS.map(section => section.key))
    for (const meta of DASHBOARD_METRICS) {
      expect(sections.has(meta.section)).toBe(true)
    }
  })
})

describe('직전 기간 값 문구', () => {
  it('[AC-SELLER-DASH-006] 증감률이 아니라 아직 그 단계인 묵은 건수로 적는다', () => {
    // previousValue는 "직전 기간 말 잔량"이 아니라 "직전 구간에 요청됐고 지금도 그 단계인 건수"다.
    // 비율로 환산하면 묵은 건을 처리할수록 증가율이 폭등해 뜻이 거꾸로 읽힌다.
    expect(previousValueHint(metric({ previousValue: 4 }), '7d', 'requested')).toBe(
      '직전 7일 요청분 중 4건 남음',
    )
    expect(previousValueHint(metric({ previousValue: 4 }), '30d', 'ordered')).toBe(
      '직전 30일 주문분 중 4건 남음',
    )
    // 비율·화살표 기호를 쓰지 않는다.
    expect(previousValueHint(metric(), '90d', 'requested')).not.toMatch(/%|▲|▼/)
  })

  it('[AC-SELLER-DASH-006] 직전 구간에 남은 것이 없으면 0건이 아니라 모두 처리됐다고 적는다', () => {
    expect(previousValueHint(metric({ previousValue: 0 }), '7d', 'requested')).toBe(
      '직전 7일 요청분은 남지 않았어요',
    )
  })

  it('[AC-SELLER-DASH-006] 전체 기간에는 비교할 직전 구간이 없어 문구를 만들지 않는다', () => {
    expect(previousValueHint(metric({ previousValue: null }), 'all', 'requested')).toBeNull()
    // 서버가 all에서도 값을 실어 보내더라도 비교 대상이 없으므로 화면은 쓰지 않는다.
    expect(previousValueHint(metric({ previousValue: 9 }), 'all', 'requested')).toBeNull()
  })

  it('[AC-SELLER-DASH-004] 집계 불가 지표는 직전 값 문구도 만들지 않는다', () => {
    expect(
      previousValueHint(metric({ supported: false, previousValue: 3 }), '7d', 'requested'),
    ).toBeNull()
  })
})

describe('조회 실패 분류', () => {
  // axios 에러 모양(`response.status`)으로 판정한다 — 공유 클라이언트의 errorResponse가 그 자리다.
  const axiosError = (status: number, errorCode: number) =>
    Object.assign(new Error('x'), {
      isAxiosError: true,
      response: { status, data: { errorCode, message: 'x' } },
    })

  it('[AC-SELLER-DASH-005] 403은 자격 거절로 가른다 — 재시도로 풀리지 않는다', () => {
    expect(isSellerCenterForbidden(axiosError(403, 10003))).toBe(true)
    // 자격 거절 코드가 10003 하나가 아니다(SELLER_NOT_ACTIVE 10002도 403이고 뜻이 같다).
    expect(isSellerCenterForbidden(axiosError(403, 10002))).toBe(true)
  })

  it('[AC-SELLER-DASH-005] 서버 오류·네트워크 단절은 자격 거절이 아니다', () => {
    expect(isSellerCenterForbidden(axiosError(500, 90000))).toBe(false)
    expect(isSellerCenterForbidden(axiosError(400, 90001))).toBe(false)
    // 응답 자체가 없는 경우(단절·취소)도 재시도할 수 있는 실패다.
    expect(isSellerCenterForbidden(new Error('Network Error'))).toBe(false)
    expect(isSellerCenterForbidden(undefined)).toBe(false)
  })
})
