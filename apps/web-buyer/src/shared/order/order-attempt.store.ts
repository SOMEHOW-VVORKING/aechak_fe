import type { PaymentMethod } from '@aechak/domain'

// 주문 시도(attempt) 기록 — sessionStorage. POST /order-groups의 Idempotency-Key와 만들어진 주문그룹을
// 요청 fingerprint에 묶어 두어, 응답 유실·새로고침 뒤 재제출이 같은 키를 다시 쓰고(서버가 최초 결과를
// 재반환) 만료 전 주문그룹이 있으면 새 주문 없이 그 그룹의 스냅샷(금액·수단)으로 결제 단계에 재진입한다.
// 토큰·개인정보는 담지 않는다.

export const ORDER_ATTEMPT_STORAGE_KEY = 'aechak.orderAttempt'

/** 주문그룹 생성 응답과 그때 고른 결제수단 — 재진입 화면은 live 장바구니가 아니라 이 값을 보여준다. */
export interface OrderSnapshot {
  method: PaymentMethod
  orderName: string
  cartItemIds: number[]
  lineCount: number
  totalProductAmount: number
  totalShippingFee: number
  usedPoint: number
  finalPaymentAmount: number
}

export interface OrderAttempt {
  attemptId: string
  idempotencyKey: string
  /** 정렬된 cartItemIds + deliveryAddressId + usedPoint + expectedFinalAmount. */
  fingerprint: string
  orderGroupId: string | null
  /** 주문그룹 결제 가능 시한(ISO). orderGroupId가 없으면 null. */
  expiresAt: string | null
  /** 주문그룹이 만들어졌을 때의 주문 스냅샷. orderGroupId가 없으면 null. */
  snapshot: OrderSnapshot | null
  createdAt: string
}

export interface OrderFingerprintInput {
  cartItemIds: readonly number[]
  deliveryAddressId: number
  usedPoint: number
  expectedFinalAmount: number
}

// 만료 직전 그룹으로 결제창을 열면 prepare·결제창 사이에 만료(60009)되기 쉬워 이만큼은 남아 있어야 재진입한다.
const REENTER_MARGIN_MS = 30_000

const PAYMENT_METHODS: readonly PaymentMethod[] = ['kakaopay', 'tosspay', 'card']

export function buildOrderFingerprint(input: OrderFingerprintInput): string {
  const ids = [...new Set(input.cartItemIds)].sort((a, b) => a - b).join(',')
  return `${ids}|${input.deliveryAddressId}|${input.usedPoint}|${input.expectedFinalAmount}`
}

function randomId(): string {
  const c = globalThis.crypto
  if (c && typeof c.randomUUID === 'function') return c.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
}

function storage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.sessionStorage : null
  } catch {
    return null
  }
}

function isNonNegativeInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

function isOrderSnapshot(value: unknown): value is OrderSnapshot {
  if (typeof value !== 'object' || value == null) return false
  const v = value as Record<string, unknown>
  return (
    PAYMENT_METHODS.includes(v['method'] as PaymentMethod) &&
    typeof v['orderName'] === 'string' &&
    Array.isArray(v['cartItemIds']) &&
    v['cartItemIds'].every(isNonNegativeInt) &&
    isNonNegativeInt(v['lineCount']) &&
    isNonNegativeInt(v['totalProductAmount']) &&
    isNonNegativeInt(v['totalShippingFee']) &&
    isNonNegativeInt(v['usedPoint']) &&
    isNonNegativeInt(v['finalPaymentAmount'])
  )
}

function isOrderAttempt(value: unknown): value is OrderAttempt {
  if (typeof value !== 'object' || value == null) return false
  const v = value as Record<string, unknown>
  return (
    typeof v['attemptId'] === 'string' &&
    typeof v['idempotencyKey'] === 'string' &&
    typeof v['fingerprint'] === 'string' &&
    (v['orderGroupId'] == null || typeof v['orderGroupId'] === 'string') &&
    (v['expiresAt'] == null || typeof v['expiresAt'] === 'string') &&
    (v['snapshot'] == null || isOrderSnapshot(v['snapshot'])) &&
    typeof v['createdAt'] === 'string'
  )
}

/** 저장된 주문 시도. 없거나 깨져 있으면 null. */
export function readOrderAttempt(): OrderAttempt | null {
  const raw = storage()?.getItem(ORDER_ATTEMPT_STORAGE_KEY)
  if (!raw) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    return isOrderAttempt(parsed) ? parsed : null
  } catch {
    return null
  }
}

function writeOrderAttempt(attempt: OrderAttempt): OrderAttempt {
  storage()?.setItem(ORDER_ATTEMPT_STORAGE_KEY, JSON.stringify(attempt))
  return attempt
}

/** 만료 전 주문그룹과 스냅샷을 가진 시도인가(결제 단계 재진입 가능). */
export function isOrderAttemptReenterable(attempt: OrderAttempt, now = Date.now()): boolean {
  if (attempt.orderGroupId == null || attempt.expiresAt == null || attempt.snapshot == null) {
    return false
  }
  const expires = Date.parse(attempt.expiresAt)
  return Number.isFinite(expires) && expires - REENTER_MARGIN_MS > now
}

/** 재진입 가능한 저장 시도. 없거나 만료됐으면 null. */
export function readReenterableOrderAttempt(now = Date.now()): OrderAttempt | null {
  const current = readOrderAttempt()
  return current && isOrderAttemptReenterable(current, now) ? current : null
}

/**
 * 스냅샷 라인이 장바구니에 하나라도 남아 있는가. 결제가 끝나면 서버가 주문 라인을 장바구니에서
 * 지우므로, 하나도 남지 않은 시도는 결제가 끝난 것으로 보고 재진입 대상에서 뺀다.
 */
export function orderAttemptLinesInCart(
  attempt: OrderAttempt,
  cartItemIds: Iterable<number>,
): boolean {
  if (attempt.snapshot == null) return false
  const live = new Set(cartItemIds)
  return attempt.snapshot.cartItemIds.some(id => live.has(id))
}

/**
 * fingerprint에 맞는 시도를 돌려준다 — 같은 fingerprint면 저장된 시도(같은 키·같은 주문그룹)를 재사용하고,
 * 다르거나 주문그룹이 만료됐으면 새 키로 새 시도를 만들어 저장한다.
 */
export function ensureOrderAttempt(fingerprint: string, now = Date.now()): OrderAttempt {
  const current = readOrderAttempt()
  if (current && current.fingerprint === fingerprint) {
    const expired = current.orderGroupId != null && !isOrderAttemptReenterable(current, now)
    if (!expired) return current
  }
  return writeOrderAttempt({
    attemptId: randomId(),
    idempotencyKey: randomId(),
    fingerprint,
    orderGroupId: null,
    expiresAt: null,
    snapshot: null,
    createdAt: new Date(now).toISOString(),
  })
}

/** 주문그룹 생성 성공을 스냅샷과 함께 시도에 기록한다. 저장된 시도가 다른 것으로 바뀌었으면 건드리지 않는다. */
export function markOrderAttemptCreated(
  attemptId: string,
  created: { orderGroupId: string; expiresAt: string; snapshot: OrderSnapshot },
): OrderAttempt | null {
  const current = readOrderAttempt()
  if (!current || current.attemptId !== attemptId) return null
  return writeOrderAttempt({
    ...current,
    orderGroupId: created.orderGroupId,
    expiresAt: created.expiresAt,
    snapshot: { ...created.snapshot, cartItemIds: [...created.snapshot.cartItemIds] },
  })
}

/** 시도 기록을 지운다 — 만료(60009)·이미 결제(60006)·금액 불일치(50106) 뒤, 새 주문으로 시작, 로그아웃·계정 전환, 테스트 격리. */
export function resetOrderAttempt(): void {
  storage()?.removeItem(ORDER_ATTEMPT_STORAGE_KEY)
}
