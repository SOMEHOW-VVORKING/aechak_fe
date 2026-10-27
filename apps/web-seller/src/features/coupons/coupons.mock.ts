import type { StatusPillVariant } from '@aechak/design-system/web'

/**
 * 혜택/쿠폰/할인 화면의 예시 데이터 단일 원본 — 화면 파일에 인라인하지 않는다(레포 관례).
 *
 * **BE가 생기면 갈아끼우는 방법**: seller 호스트에 쿠폰 목록(`GET /sellers/me/coupons`)과 생성
 * (`POST /sellers/me/coupons`)이 열리면 `coupons.queries.ts`를 만들어 `SAMPLE_COUPONS` 자리에 그
 * 응답을 넣고, 생성 폼의 `onSubmit`을 그 mutation에 연결한 뒤 라우트에서 `SampleDataNotice`를 떼고
 * `isError` 경로를 더한다(AGENTS.md 규약 7).
 *
 * 실측(2026-10-26): seller 스펙에 쿠폰이라는 말이 든 필드는 있지만 전부 다른 화면 소속이다 —
 * `discountPrice`/`discountStartAt`/`discountEndAt`는 상품 등록·수정 폼 필드(그래서 상품별 할인가는
 * 지금도 설정된다), `couponBurden`/`allocatedCouponDiscount`는 정산·주문 응답의 읽기 전용 금액이다.
 * 쿠폰을 만들고 발급하는 경로 자체가 없다.
 */

export type CouponDiscountType = 'RATE' | 'AMOUNT'
export type CouponStatus = 'SCHEDULED' | 'ACTIVE' | 'ENDED' | 'STOPPED'

export interface SampleCoupon {
  couponPublicId: string
  name: string
  discountType: CouponDiscountType
  /** RATE면 퍼센트, AMOUNT면 원. */
  discountValue: number
  /** 정률 쿠폰의 최대 할인 한도(원). 정액이면 null. */
  maxDiscount: number | null
  minOrderAmount: number
  startAt: string
  endAt: string
  /** 총 발급 수량. null이면 무제한. */
  issueLimit: number | null
  issuedCount: number
  usedCount: number
  /** 쿠폰 할인액 중 셀러가 부담한 금액(원) — 정산 내역의 couponBurden과 맞춰 보는 값이다. */
  sellerBurden: number
  status: CouponStatus
}

export const COUPON_STATUS_LABEL: Record<CouponStatus, string> = {
  SCHEDULED: '발급 예정',
  ACTIVE: '발급 중',
  ENDED: '종료',
  STOPPED: '중단',
}

export const COUPON_STATUS_VARIANT: Record<CouponStatus, StatusPillVariant> = {
  SCHEDULED: 'info',
  ACTIVE: 'success',
  ENDED: 'muted',
  STOPPED: 'neutral',
}

export const COUPON_DISCOUNT_TYPE_LABEL: Record<CouponDiscountType, string> = {
  RATE: '정률(%)',
  AMOUNT: '정액(원)',
}

export const SAMPLE_COUPONS: SampleCoupon[] = [
  {
    couponPublicId: 'CPN-2026-0031',
    name: '첫 구매 10% 할인',
    discountType: 'RATE',
    discountValue: 10,
    maxDiscount: 5_000,
    minOrderAmount: 30_000,
    startAt: '2026-10-01',
    endAt: '2026-12-31',
    issueLimit: 2_000,
    issuedCount: 1_284,
    usedCount: 612,
    sellerBurden: 1_830_000,
    status: 'ACTIVE',
  },
  {
    couponPublicId: 'CPN-2026-0030',
    name: '급식기 3,000원 즉시 할인',
    discountType: 'AMOUNT',
    discountValue: 3_000,
    maxDiscount: null,
    minOrderAmount: 50_000,
    startAt: '2026-10-20',
    endAt: '2026-11-03',
    issueLimit: 500,
    issuedCount: 341,
    usedCount: 128,
    sellerBurden: 384_000,
    status: 'ACTIVE',
  },
  {
    couponPublicId: 'CPN-2026-0029',
    name: '11월 신상 사전 할인 15%',
    discountType: 'RATE',
    discountValue: 15,
    maxDiscount: 10_000,
    minOrderAmount: 70_000,
    startAt: '2026-11-01',
    endAt: '2026-11-14',
    issueLimit: 800,
    issuedCount: 0,
    usedCount: 0,
    sellerBurden: 0,
    status: 'SCHEDULED',
  },
  {
    couponPublicId: 'CPN-2026-0024',
    name: '추석 감사 5,000원',
    discountType: 'AMOUNT',
    discountValue: 5_000,
    maxDiscount: null,
    minOrderAmount: 60_000,
    startAt: '2026-09-18',
    endAt: '2026-10-05',
    issueLimit: 1_000,
    issuedCount: 1_000,
    usedCount: 743,
    sellerBurden: 3_715_000,
    status: 'ENDED',
  },
  {
    couponPublicId: 'CPN-2026-0022',
    name: '재고 정리 20%',
    discountType: 'RATE',
    discountValue: 20,
    maxDiscount: 8_000,
    minOrderAmount: 40_000,
    startAt: '2026-09-01',
    endAt: '2026-09-30',
    issueLimit: null,
    issuedCount: 2_418,
    usedCount: 1_102,
    sellerBurden: 6_240_000,
    status: 'STOPPED',
  },
]

/** 생성 폼이 고르는 적용 범위 — 서버가 생기면 상품 목록 조회로 바뀐다. */
export const SAMPLE_COUPON_SCOPES = [
  { value: 'ALL', label: '내 스토어 전체 상품' },
  { value: 'FEEDER', label: '자동 급식기 5L' },
  { value: 'TOWER', label: '원목 캣타워 3단' },
  { value: 'SNACK', label: '동결건조 간식 100g' },
]

export function couponDiscountText(coupon: SampleCoupon): string {
  if (coupon.discountType === 'AMOUNT') return `${coupon.discountValue.toLocaleString()}원`
  return coupon.maxDiscount == null
    ? `${coupon.discountValue}%`
    : `${coupon.discountValue}% / 최대 ${coupon.maxDiscount.toLocaleString()}원`
}

/**
 * 발급을 멈출 수 있는 쿠폰 — 아직 끝나지 않은 것만이다. 표의 액션 컬럼이 이 판정으로 버튼을
 * 그릴지 정한다(서버가 생기면 `POST /sellers/me/coupons/{id}/stop`이 같은 조건을 쓴다).
 */
export function canStopCoupon(coupon: SampleCoupon): boolean {
  return coupon.status === 'SCHEDULED' || coupon.status === 'ACTIVE'
}

export function couponIssueText(coupon: SampleCoupon): string {
  const limit = coupon.issueLimit == null ? '무제한' : coupon.issueLimit.toLocaleString()
  return `${coupon.issuedCount.toLocaleString()} / ${limit}`
}
