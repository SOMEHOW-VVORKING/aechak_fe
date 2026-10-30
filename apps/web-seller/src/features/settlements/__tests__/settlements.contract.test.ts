import { describe, expect, it } from 'vitest'
import type { SellerSettlementDetailData } from '@aechak/api'
import {
  ALL_MONTHS,
  SETTLEMENT_STATUS_LABEL,
  SETTLEMENT_STATUS_OPTIONS,
  formatDate,
  formatDateTime,
  formatDeduction,
  formatFeeRate,
  formatMonth,
  formatWon,
  monthSelectOptions,
  settlementDetailErrorMessage,
  settlementItemRows,
  settlementListErrorMessage,
} from '../settlements.contract'
import { normalizeSearchParams } from '../settlements.queries'

// 정산은 조회 전용이라 변환할 폼이 없다 — 이 파일이 지키는 것은 표시 형식과 질의 정규화다.
// 금액을 다시 계산하거나 단위를 바꾸는 코드가 끼어들면 셀러가 보는 금액이 원장과 어긋난다.

describe('normalizeSearchParams', () => {
  it('[AC-SETTLE-CONTRACT-001] 전체 선택(빈 문자열)은 키째 뺀다 — `?month=`는 400이다', () => {
    expect(normalizeSearchParams({ month: '', status: '' })).toEqual({})
  })

  it('[AC-SETTLE-CONTRACT-002] page 0은 값이 있는 것이므로 남긴다', () => {
    expect(normalizeSearchParams({ page: 0, size: 20 })).toEqual({ page: 0, size: 20 })
  })

  it('[AC-SETTLE-CONTRACT-003] 고른 월·상태는 그대로 싣는다', () => {
    expect(normalizeSearchParams({ month: '2026-06', status: 'held', page: 1 })).toEqual({
      month: '2026-06',
      status: 'held',
      page: 1,
    })
  })

  it('[AC-SETTLE-CONTRACT-004] 공백만 있는 값도 미입력으로 본다(캐시 키가 갈리지 않게)', () => {
    expect(normalizeSearchParams({ month: '  ' })).toEqual({})
  })
})

describe('월 선택지', () => {
  it('[AC-SETTLE-CONTRACT-005] 서버가 준 월만 올리고 전체 기간을 맨 앞에 둔다', () => {
    expect(monthSelectOptions(['2026-06', '2026-05'])).toEqual([
      { value: ALL_MONTHS, label: '전체 기간' },
      { value: '2026-06', label: '2026.06' },
      { value: '2026-05', label: '2026.05' },
    ])
  })

  it('[AC-SETTLE-CONTRACT-006] 정산 행이 없으면 전체 기간만 남는다(없는 달을 지어내지 않는다)', () => {
    expect(monthSelectOptions([])).toHaveLength(1)
    expect(monthSelectOptions(undefined)).toHaveLength(1)
  })

  it('[AC-SETTLE-CONTRACT-007] 형식이 다른 월은 서버 값을 그대로 보여 준다', () => {
    expect(formatMonth('2026-6')).toBe('2026-6')
  })
})

describe('상태 어휘', () => {
  it('[AC-SETTLE-CONTRACT-008] 선택지는 전체 + 서버 네 어휘다', () => {
    expect(SETTLEMENT_STATUS_OPTIONS.map(option => option.value)).toEqual([
      '',
      'pending',
      'scheduled',
      'completed',
      'held',
    ])
  })

  it('[AC-SETTLE-CONTRACT-009] 네 상태 모두 한글 라벨이 있다', () => {
    expect(Object.values(SETTLEMENT_STATUS_LABEL)).toEqual([
      '정산 대기',
      '정산 예정',
      '정산 완료',
      '정산 보류',
    ])
  })
})

describe('금액·날짜 표시', () => {
  it('[AC-SETTLE-CONTRACT-010] 금액은 천 단위만 넣고 값을 바꾸지 않는다', () => {
    expect(formatWon(59_088)).toBe('59,088원')
    expect(formatWon(0)).toBe('0원')
  })

  it('[AC-SETTLE-CONTRACT-011] 차감은 0원이면 부호를 붙이지 않는다', () => {
    expect(formatDeduction(1_792)).toBe('-1,792원')
    expect(formatDeduction(0)).toBe('0원')
  })

  it('[AC-SETTLE-CONTRACT-012] LocalDateTime은 날짜만, 구매확정 전(null)은 하이픈으로', () => {
    expect(formatDateTime('2026-06-18T10:00:00')).toBe('2026.06.18')
    expect(formatDateTime(null)).toBe('-')
  })

  it('[AC-SETTLE-CONTRACT-013] LocalDate는 점 구분으로 바꾼다', () => {
    expect(formatDate('2026-06-23')).toBe('2026.06.23')
  })
})

describe('formatFeeRate', () => {
  it('[AC-SETTLE-CONTRACT-014] 요율 스냅샷을 백분율로 바꾸고 남는 0은 붙이지 않는다', () => {
    expect(formatFeeRate(0.08)).toBe('8%')
    expect(formatFeeRate(0.028)).toBe('2.8%')
  })

  it('[AC-SETTLE-CONTRACT-015] 부동소수 오차가 자릿수로 새지 않는다', () => {
    // 0.028 * 100 === 2.8000000000000003 — 그대로 쓰면 "2.8000000000000003%"가 된다.
    expect(formatFeeRate(0.028)).not.toContain('0000')
  })

  it('[AC-SETTLE-CONTRACT-016] 서버 정밀도(소수 4자리)까지는 버리지 않는다', () => {
    expect(formatFeeRate(0.0825)).toBe('8.25%')
    expect(formatFeeRate(0.0001)).toBe('0.01%')
  })

  it('[AC-SETTLE-CONTRACT-017] 요율이 바뀐 과거 정산도 그 행의 값으로 표시된다', () => {
    // 요율은 정산 행에 박힌 생성 시점 스냅샷이라 화면이 8%를 하드코딩해서는 안 된다.
    expect(formatFeeRate(0.05)).toBe('5%')
  })
})

const detail = (overrides: Partial<SellerSettlementDetailData> = {}): SellerSettlementDetailData => ({
  orderId: '01JZ0RDER0000000000000001',
  settlementMonth: '2026-06',
  confirmedAt: '2026-06-18T10:00:00',
  expectedPayoutDate: '2026-06-23',
  productAmount: 64_000,
  feeAmount: 6_912,
  finalAmount: 60_088,
  status: 'pending',
  shippingFee: 3_000,
  couponBurden: 0,
  platformFeeAmount: 5_120,
  pgFeeAmount: 1_792,
  refundDeduction: 0,
  platformFeeRate: 0.08,
  pgFeeRate: 0.028,
  items: [
    {
      orderItemId: 11,
      productName: '고양이 자동 급식기 5L',
      quantity: 1,
      grossAmount: 64_000,
      shippingFee: 3_000,
      commission: 5_120,
      pgFee: 1_792,
      sellerCouponBurden: 0,
      refundDeduction: 0,
      netAmount: 60_088,
    },
  ],
  ...overrides,
})

describe('settlementItemRows', () => {
  it('[AC-SETTLE-CONTRACT-018] 상품명·수량이 있으면 그대로 쓴다', () => {
    const [row] = settlementItemRows(detail())

    expect(row?.name).toBe('고양이 자동 급식기 5L')
    expect(row?.quantityLabel).toBe('1개')
  })

  it('[AC-SETTLE-CONTRACT-019] 스냅샷이 유실돼 상품명이 null이면 품목 식별자로 대체한다', () => {
    const rows = settlementItemRows(
      detail({
        items: [{ ...detail().items[0]!, productName: null, quantity: null }],
      }),
    )

    expect(rows[0]?.name).toBe('품목 11')
    expect(rows[0]?.quantityLabel).toBe('-')
  })
})

describe('settlementDetailErrorMessage', () => {
  const axiosLike = (errorCode: number, status: number) => ({
    isAxiosError: true,
    response: { status, data: { errorCode, message: '정산 내역을 찾을 수 없습니다.' } },
  })

  it('[AC-SETTLE-CONTRACT-020] 404/70002와 403/70003을 가른다', () => {
    expect(settlementDetailErrorMessage(axiosLike(70002, 404))).toContain('찾을 수 없어요')
    expect(settlementDetailErrorMessage(axiosLike(70003, 403))).toBe('이 주문의 정산을 볼 권한이 없어요.')
  })

  it('[AC-SETTLE-CONTRACT-021] 서버 격식체 문구를 그대로 싣지 않는다', () => {
    expect(settlementDetailErrorMessage(axiosLike(70002, 404))).not.toContain('없습니다')
  })
})

describe('settlementListErrorMessage (codex 지적)', () => {
  const axiosLike = (errorCode: number, status: number) => ({
    isAxiosError: true,
    response: { status, data: { errorCode, message: '조회 조건이 올바르지 않습니다.' } },
  })

  it('[AC-SETTLE-CONTRACT-022] 목록 실패는 "내역 없음"과 다른 사유를 말한다', () => {
    // 표의 빈 상태 문구만 바뀌면 셀러는 서버 오류를 필터 탓으로 읽는다.
    expect(settlementListErrorMessage(new Error('network'))).toBe(
      '정산 내역을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.',
    )
    expect(settlementListErrorMessage(axiosLike(90001, 400))).toContain('기간과 상태를 다시 골라')
  })

  it('[AC-SETTLE-CONTRACT-023] 서버 격식체 문구를 그대로 싣지 않는다', () => {
    expect(settlementListErrorMessage(axiosLike(90001, 400))).not.toContain('않습니다')
  })
})
