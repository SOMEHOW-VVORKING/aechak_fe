import { http, HttpResponse } from 'msw'
import { adminBase, clampSize, errorBody } from './base'

// `/admin/sellers` 다섯(목록·상세·판매정지·해제·메모)의 서버 흉내. BE `AdminSellerController` +
// `AdminSellerAccountService` + `Seller`·`SellerSanction` 도메인의 판정을 그대로 옮긴다
// (reports.handlers.ts 관례).
//
// **거절을 서버보다 엄하게 만들지 않는다.** 목록 필터의 알 수 없는 값은 서버가 400이 아니라
// **조건 없음으로 보정**하므로(`AdminSellerSearchQuery.of`·`SellerTypeFilter.from`) 여기서도 그렇게
// 받아 준다 — 엄하게 만들면 매퍼가 화면 값(소문자·하이픈)을 그대로 보내도 목록이 비어서 테스트가
// 깨지지만, 운영에서는 **전체 조회가 조용히 돌아온다**(운영자는 거른 줄 알고 안 걸러진 목록을
// 읽는다). 그 어긋남은 "걸러졌는가"로는 말할 수 없어, 테스트가 **나간 쿼리 문자열**을 봐야 한다.
//
// **최근 접속 시각·누적 신고 수 필드를 흉내에도 두지 않는다.** users에 접속 칼럼이 없고 신고 대상
// 종류에 셀러가 없어 서버가 셀 수 없는 값이다 — 더블이 그 자리를 만들면 화면이 다시 칸을 세워도
// 테스트가 통과한다.

export const ADMIN_SELLERS_URL = `${adminBase}/admin/sellers`
export const ADMIN_SELLER_DETAIL_URL = `${ADMIN_SELLERS_URL}/:sellerId`
export const ADMIN_SELLER_SUSPEND_URL = `${ADMIN_SELLER_DETAIL_URL}/suspensions`
export const ADMIN_SELLER_RELEASE_URL = `${ADMIN_SELLER_SUSPEND_URL}/release`
export const ADMIN_SELLER_MEMO_URL = `${ADMIN_SELLER_DETAIL_URL}/memo`

export type WireSellerStatus =
  | 'ACTIVE'
  | 'PAUSED'
  | 'SUSPENDED'
  | 'WITHDRAWAL_REQUESTED'
  | 'WITHDRAWN'
export type WireBusinessType = 'PERSONAL_GENERAL' | 'SOLE_PROPRIETORSHIP' | 'CORPORATE'
export type WireSellerTypeFilter = 'ALL' | 'BUSINESS' | 'INDIVIDUAL'
export type WireSellerSanctionAction = 'SUSPEND' | 'RELEASE'
export type WireSellerSanctionReasonCode =
  | 'FALSE_PRODUCT_INFO'
  | 'REPEATED_REPORT'
  | 'ABNORMAL_TRANSACTION'
  | 'OTHER'

const SELLER_STATUSES: WireSellerStatus[] = [
  'ACTIVE',
  'PAUSED',
  'SUSPENDED',
  'WITHDRAWAL_REQUESTED',
  'WITHDRAWN',
]

const REASON_CODES: WireSellerSanctionReasonCode[] = [
  'FALSE_PRODUCT_INFO',
  'REPEATED_REPORT',
  'ABNORMAL_TRANSACTION',
  'OTHER',
]

/** 거르는 축은 "사업자인가" 둘뿐이라 응답의 세 유형과 1:1이 아니다(`SellerTypeFilter`). */
const TYPE_FILTER_TARGETS: Record<WireSellerTypeFilter, WireBusinessType[]> = {
  ALL: [],
  BUSINESS: ['SOLE_PROPRIETORSHIP', 'CORPORATE'],
  INDIVIDUAL: ['PERSONAL_GENERAL'],
}

/** 탈퇴·탈퇴 신청은 되돌릴 상태로 보관할 수 없어 정지가 409(10009)다(`Seller.SUSPENDABLE_STATUSES`). */
const SUSPENDABLE: WireSellerStatus[] = ['ACTIVE', 'PAUSED']

/** 서버 `SellerSanctionReasonCode.label` — 가운뎃점은 서버 문구 그대로다(화면 라벨과 다르다). */
const SERVER_REASON_LABELS: Record<WireSellerSanctionReasonCode, string> = {
  FALSE_PRODUCT_INFO: '상품 정보 허위 기재',
  REPEATED_REPORT: '신고 누적',
  ABNORMAL_TRANSACTION: '결제·정산 이상 거래',
  OTHER: '기타',
}

/** `SellerSanctionReasonCode.describe` — 어휘 라벨에 상세를 이어 붙인 한 줄. */
const describeReason = (code: WireSellerSanctionReasonCode, detail: string | null) =>
  detail == null ? SERVER_REASON_LABELS[code] : `${SERVER_REASON_LABELS[code]} — ${detail}`

/** 쓰기가 반영하는 고정 시각 — 테스트가 상태 변경 시각의 변화를 눈으로 확인할 수 있어야 한다. */
const NOW = '2026-11-05T09:00:00'

/** 상세 이력은 최신순 50건까지다(`AdminSellerAccountFacade.SANCTION_HISTORY_LIMIT`). */
export const SANCTION_HISTORY_LIMIT = 50

export interface SellerSanctionHistoryWire {
  sanctionId: number
  action: WireSellerSanctionAction
  /** RELEASE 행은 제재 어휘를 쓰지 않아 늘 null이다. */
  reasonCode: WireSellerSanctionReasonCode | null
  reasonDetail: string | null
  /** **그때 정한** 해제 예정 시각. 무기한 정지와 RELEASE 행은 null이다. */
  effectiveUntil: string | null
  /** 그 조치 시점의 메모 사본 — 현재 메모와 다를 수 있다. */
  memo: string | null
  actedByAdminId: number
  actedAt: string
}

export interface AdminSellerWire {
  sellerId: number
  storeName: string
  status: WireSellerStatus
  /** 입점 신청서가 없는 셀러는 `representativeNameMasked`와 **함께** null이다(left join). */
  businessType: WireBusinessType | null
  representativeNameMasked: string | null
  productCount: number
  cumulativeOrderCount: number
  hasUnsettledAmount: boolean
  statusChangedAt: string
  suspensionUntil: string | null
  /** 아래 넷은 **상세에만** 실린다. 목록 summary가 주면 화면이 상세를 받지 않아도 그려진다. */
  suspensionReasonCode: WireSellerSanctionReasonCode | null
  suspensionReason: string | null
  internalMemo: string | null
  sanctions: SellerSanctionHistoryWire[]
  /**
   * `sellers.previous_status` — **응답에 없다.** 해제가 정지 직전 상태로 되돌리는 자리이고
   * (비어 있으면 ACTIVE), 그 전이가 보이는 곳은 해제 뒤의 `status`뿐이다.
   */
  previousStatus: WireSellerStatus | null
}

let sellers: AdminSellerWire[] = []
let nextSanctionId = 1
/** 마지막 쓰기의 **원문 본문** — 키를 뺐는지(빈 메모·무기한)는 이것으로만 말할 수 있다. */
let lastWrite: { method: string; path: string; body: unknown } | null = null

export function makeAdminSellerWire(overrides: Partial<AdminSellerWire> = {}): AdminSellerWire {
  return {
    sellerId: 2041,
    storeName: '멍멍마켓',
    status: 'ACTIVE',
    businessType: 'SOLE_PROPRIETORSHIP',
    representativeNameMasked: '김*수',
    productCount: 42,
    cumulativeOrderCount: 318,
    hasUnsettledAmount: false,
    statusChangedAt: '2026-09-14T10:20:00',
    suspensionUntil: null,
    suspensionReasonCode: null,
    suspensionReason: null,
    internalMemo: null,
    sanctions: [],
    previousStatus: null,
    ...overrides,
  }
}

export function seedAdminSellers(rows: AdminSellerWire[] = []): void {
  sellers = rows.map(row => ({ ...row, sanctions: row.sanctions.map(entry => ({ ...entry })) }))
  nextSanctionId = Math.max(0, ...sellers.flatMap(row => row.sanctions.map(e => e.sanctionId))) + 1
  lastWrite = null
}

/** 핸들러가 반영한 현재 셀러 상태 — 테스트가 조치의 부작용을 읽는다. */
export function currentAdminSeller(sellerId: number): AdminSellerWire | null {
  const found = sellers.find(row => row.sellerId === sellerId)
  return found ? { ...found, sanctions: found.sanctions.map(entry => ({ ...entry })) } : null
}

export const lastAdminSellerWrite = () => (lastWrite ? { ...lastWrite } : null)

/** 목록 summary에는 `suspensionReasonCode`·`suspensionReason`·`internalMemo`·`sanctions`가 **없다**. */
const summaryOf = (row: AdminSellerWire) => ({
  sellerId: row.sellerId,
  storeName: row.storeName,
  status: row.status,
  businessType: row.businessType,
  representativeNameMasked: row.representativeNameMasked,
  productCount: row.productCount,
  cumulativeOrderCount: row.cumulativeOrderCount,
  hasUnsettledAmount: row.hasUnsettledAmount,
  statusChangedAt: row.statusChangedAt,
  suspensionUntil: row.suspensionUntil,
})

const detailOf = (row: AdminSellerWire) => ({
  seller: summaryOf(row),
  suspensionReasonCode: row.suspensionReasonCode,
  suspensionReason: row.suspensionReason,
  internalMemo: row.internalMemo,
  // 최신순(이력 id 내림차순)으로 50건까지.
  sanctions: [...row.sanctions]
    .sort((a, b) => b.sanctionId - a.sanctionId)
    .slice(0, SANCTION_HISTORY_LIMIT),
})

/** 알 수 없는 상태는 **조건 없음**이다 — 400이 아니다(`AdminSellerSearchQuery.parseStatus`). */
function parseStatus(raw: string | null): WireSellerStatus | null {
  const stripped = raw?.trim()
  if (!stripped) return null
  return SELLER_STATUSES.find(status => status.toLowerCase() === stripped.toLowerCase()) ?? null
}

/** 알 수 없는 유형도 전체다(`SellerTypeFilter.from`). */
function parseTypeFilter(raw: string | null): WireSellerTypeFilter {
  const stripped = raw?.trim()
  if (!stripped) return 'ALL'
  const found = (Object.keys(TYPE_FILTER_TARGETS) as WireSellerTypeFilter[]).find(
    filter => filter.toLowerCase() === stripped.toLowerCase(),
  )
  return found ?? 'ALL'
}

const findSeller = (raw: string | readonly string[] | undefined): AdminSellerWire | null => {
  const sellerId = Number(Array.isArray(raw) ? raw[0] : raw)
  if (!Number.isFinite(sellerId)) return null
  return sellers.find(row => row.sellerId === sellerId) ?? null
}

const notFound = () =>
  HttpResponse.json(errorBody(10000, '셀러를 찾을 수 없습니다.'), { status: 404 })

/** 공백뿐인 문자열은 서버가 없는 값으로 본다(`strippedOrNull`). */
const asText = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : null

interface SuspendBody {
  reasonCode?: unknown
  reasonDetail?: unknown
  durationDays?: unknown
  memo?: unknown
}

/**
 * `@Valid` 본문 검증 — **서비스보다 먼저** 돈다. 그래서 없는 셀러에 잘못된 본문을 보내면 404가
 * 아니라 400이고, 그 순서를 더블이 뒤집으면 화면의 에러 분기가 실제와 다른 코드를 받는다.
 *
 * 길이 초과(reasonDetail·memo > 500)는 여기서 끊긴다 — 도메인의 10011까지 가지 않는다.
 * 화면은 `maxLength`로 입력 자체를 막으므로 그 경로는 지금 발생하지 않는다.
 */
function validateSuspendBody(body: SuspendBody | null) {
  const invalid = () => HttpResponse.json(errorBody(90001, '잘못된 요청입니다.'), { status: 400 })
  if (body == null) return invalid()
  if (!REASON_CODES.includes(body.reasonCode as WireSellerSanctionReasonCode)) return invalid()
  for (const text of [body.reasonDetail, body.memo]) {
    if (text != null && (typeof text !== 'string' || text.length > 500)) return invalid()
  }
  const days = body.durationDays
  if (days != null && (typeof days !== 'number' || days < 1 || days > 365)) return invalid()
  return null
}

const appendSanction = (
  row: AdminSellerWire,
  entry: Omit<SellerSanctionHistoryWire, 'sanctionId' | 'actedByAdminId' | 'actedAt'>,
) => {
  row.sanctions.push({
    sanctionId: nextSanctionId++,
    actedByAdminId: 9001,
    actedAt: NOW,
    ...entry,
  })
}

/** 제재에 딸린 메모는 **비어 있지 않을 때만** 현재 메모를 덮어쓴다(`overwriteMemoIfPresent`). */
const overwriteMemoIfPresent = (row: AdminSellerWire, memo: string | null) => {
  if (memo != null) row.internalMemo = memo
}

/** `until`은 서버 시계로 계산한다 — 고정 NOW에 일수를 더해 테스트가 값을 예측할 수 있게 한다. */
function plusDays(days: number): string {
  const base = new Date(`${NOW}Z`)
  base.setUTCDate(base.getUTCDate() + days)
  return base.toISOString().slice(0, 19)
}

export const sellerHandlers = [
  http.get(ADMIN_SELLERS_URL, ({ request }) => {
    const params = new URL(request.url).searchParams
    const status = parseStatus(params.get('status'))
    const typeFilter = parseTypeFilter(params.get('sellerType'))
    const keyword = params.get('keyword')?.trim() || null
    const size = clampSize(params.get('size'))
    const page = Math.max(0, Math.trunc(Number(params.get('page') ?? 0)) || 0)
    const targets = TYPE_FILTER_TARGETS[typeFilter]

    const matched = sellers
      .filter(row => status == null || row.status === status)
      // ALL이 아니면 유형을 모르는 셀러(businessType=null)가 어느 쪽으로도 세지지 않아 **빠진다**.
      .filter(row => targets.length === 0 || (row.businessType != null && targets.includes(row.businessType)))
      .filter(row => keyword == null || row.storeName.includes(keyword))
    // 셀러 식별자 내림차순 고정(개점 역순) — 정렬 파라미터가 없다.
    const sorted = [...matched].sort((a, b) => b.sellerId - a.sellerId)

    return HttpResponse.json({
      data: {
        items: sorted.slice(page * size, page * size + size).map(summaryOf),
        // 페이지 크기가 아니라 현재 필터 기준 전체 행 수다.
        totalCount: matched.length,
      },
    })
  }),

  http.get(ADMIN_SELLER_DETAIL_URL, ({ params }) => {
    const found = findSeller(params['sellerId'])
    if (found == null) return notFound()
    return HttpResponse.json({ data: detailOf(found) })
  }),

  http.post(ADMIN_SELLER_SUSPEND_URL, async ({ params, request }) => {
    const body = (await request.json().catch(() => null)) as SuspendBody | null
    lastWrite = { method: 'POST', path: 'suspensions', body }
    const invalid = validateSuspendBody(body)
    if (invalid) return invalid

    const found = findSeller(params['sellerId'])
    if (found == null) return notFound()

    const reasonCode = body!.reasonCode as WireSellerSanctionReasonCode
    const reasonDetail = asText(body!.reasonDetail)
    // 10010은 이력 행 생성 단계라 **상태 가드보다 먼저** 돈다(`SellerSanction.suspend`가
    // `seller.suspend` 앞에 있다) — 이미 정지된 셀러에 상세 없는 기타를 보내면 10007이 아니라 10010이다.
    if (reasonCode === 'OTHER' && reasonDetail == null) {
      return HttpResponse.json(errorBody(10010, '기타 사유를 고르면 상세 사유가 필수입니다.'), {
        status: 400,
      })
    }
    if (found.status === 'SUSPENDED') {
      return HttpResponse.json(errorBody(10007, '이미 판매정지된 셀러입니다.'), { status: 409 })
    }
    if (!SUSPENDABLE.includes(found.status)) {
      return HttpResponse.json(
        errorBody(10009, '현재 셀러 상태에서 허용되지 않는 전이입니다.'),
        { status: 409 },
      )
    }

    const days = typeof body!.durationDays === 'number' ? body!.durationDays : null
    const until = days == null ? null : plusDays(days)
    appendSanction(found, {
      action: 'SUSPEND',
      reasonCode,
      reasonDetail,
      effectiveUntil: until,
      memo: asText(body!.memo),
    })
    found.previousStatus = found.status
    found.status = 'SUSPENDED'
    found.suspensionReasonCode = reasonCode
    found.suspensionReason = describeReason(reasonCode, reasonDetail)
    found.suspensionUntil = until
    found.statusChangedAt = NOW
    overwriteMemoIfPresent(found, asText(body!.memo))
    // 성공은 204 No Content(본문 없음)다.
    return new HttpResponse(null, { status: 204 })
  }),

  http.post(ADMIN_SELLER_RELEASE_URL, async ({ params, request }) => {
    // 본문 전체를 생략할 수 있다(`@RequestBody(required = false)`) — `{}`도 받는다.
    const body = (await request.json().catch(() => null)) as SuspendBody | null
    lastWrite = { method: 'POST', path: 'suspensions/release', body }

    const found = findSeller(params['sellerId'])
    if (found == null) return notFound()
    // 탈퇴 셀러도 이 경로에서는 10009가 아니라 10008이다 — 정지가 아니라는 판정이 먼저 걸린다.
    if (found.status !== 'SUSPENDED') {
      return HttpResponse.json(errorBody(10008, '판매정지 상태가 아닌 셀러입니다.'), { status: 409 })
    }

    const memo = asText(body?.memo)
    appendSanction(found, {
      action: 'RELEASE',
      // 해제 행은 제재 어휘를 쓰지 않는다.
      reasonCode: null,
      reasonDetail: asText(body?.reasonDetail),
      effectiveUntil: null,
      memo,
    })
    found.status = found.previousStatus ?? 'ACTIVE'
    found.previousStatus = null
    found.suspensionReasonCode = null
    found.suspensionReason = null
    found.suspensionUntil = null
    found.statusChangedAt = NOW
    overwriteMemoIfPresent(found, memo)
    return new HttpResponse(null, { status: 204 })
  }),

  http.put(ADMIN_SELLER_MEMO_URL, async ({ params, request }) => {
    const body = (await request.json().catch(() => null)) as { memo?: unknown } | null
    lastWrite = { method: 'PUT', path: 'memo', body }

    const found = findSeller(params['sellerId'])
    if (found == null) return notFound()
    if (body?.memo != null && (typeof body.memo !== 'string' || body.memo.length > 500)) {
      return HttpResponse.json(errorBody(90001, '잘못된 요청입니다.'), { status: 400 })
    }
    // 덮어쓰기다 — **공백·생략은 메모를 지운다**(제재에 딸린 memo와 규칙이 반대다).
    found.internalMemo = asText(body?.memo)
    // 메모 저장은 제재 이력 행을 남기지 않는다(감사 로그만 받는다).
    return new HttpResponse(null, { status: 204 })
  }),
]
