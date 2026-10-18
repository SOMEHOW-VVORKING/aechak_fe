import { beforeEach, describe, expect, it } from 'vitest'
import {
  ORDER_ATTEMPT_STORAGE_KEY,
  buildOrderFingerprint,
  ensureOrderAttempt,
  isOrderAttemptReenterable,
  markOrderAttemptCreated,
  orderAttemptLinesInCart,
  readOrderAttempt,
  readReenterableOrderAttempt,
  resetOrderAttempt,
  type OrderSnapshot,
} from '../order-attempt.store'

// 주문 시도 기록(sessionStorage) — 같은 본문은 같은 멱등키, 만료 전 주문그룹은 스냅샷으로 재진입, 다르면 새 시도.
const BASE = {
  cartItemIds: [3, 1, 2],
  deliveryAddressId: 7,
  usedPoint: 0,
  expectedFinalAmount: 67000,
}
const NOW = Date.parse('2026-10-17T10:00:00+09:00')
const SNAPSHOT: OrderSnapshot = {
  method: 'tosspay',
  orderName: '자동 급식기 외 2건',
  cartItemIds: [1, 2, 3],
  lineCount: 3,
  totalProductAmount: 70000,
  totalShippingFee: 0,
  usedPoint: 3000,
  finalPaymentAmount: 67000,
}

function createdAt(now: number) {
  return { orderGroupId: 'OG-1', expiresAt: new Date(now + 10 * 60_000).toISOString() }
}

describe('order-attempt.store', () => {
  beforeEach(() => {
    resetOrderAttempt()
  })

  it('[AC-ORDER-ATTEMPT-001] fingerprint는 cartItemIds 순서·중복과 무관하게 같은 본문이면 같다', () => {
    const a = buildOrderFingerprint(BASE)
    const b = buildOrderFingerprint({ ...BASE, cartItemIds: [1, 2, 3, 2] })
    expect(a).toBe(b)
    expect(buildOrderFingerprint({ ...BASE, usedPoint: 1000 })).not.toBe(a)
    expect(buildOrderFingerprint({ ...BASE, deliveryAddressId: 8 })).not.toBe(a)
    expect(buildOrderFingerprint({ ...BASE, expectedFinalAmount: 66000 })).not.toBe(a)
  })

  it('[AC-ORDER-ATTEMPT-002] 같은 fingerprint면 저장된 키를 재사용하고 다르면 새 키를 발급한다', () => {
    const fp = buildOrderFingerprint(BASE)
    const first = ensureOrderAttempt(fp, NOW)
    expect(first.idempotencyKey.length).toBeGreaterThan(0)
    expect(first.idempotencyKey.length).toBeLessThanOrEqual(100)
    expect(first.orderGroupId).toBeNull()
    expect(first.snapshot).toBeNull()

    const again = ensureOrderAttempt(fp, NOW + 1000)
    expect(again.attemptId).toBe(first.attemptId)
    expect(again.idempotencyKey).toBe(first.idempotencyKey)

    const other = ensureOrderAttempt(buildOrderFingerprint({ ...BASE, usedPoint: 1000 }), NOW)
    expect(other.attemptId).not.toBe(first.attemptId)
    expect(other.idempotencyKey).not.toBe(first.idempotencyKey)
    expect(readOrderAttempt()?.attemptId).toBe(other.attemptId)
  })

  it('[AC-ORDER-ATTEMPT-003] 주문그룹을 기록하면 만료 전(여유 30초 이상)에만 재진입 가능하다', () => {
    const fp = buildOrderFingerprint(BASE)
    const attempt = ensureOrderAttempt(fp, NOW)
    const created = markOrderAttemptCreated(attempt.attemptId, {
      ...createdAt(NOW),
      snapshot: SNAPSHOT,
    })

    expect(created?.orderGroupId).toBe('OG-1')
    expect(readOrderAttempt()?.orderGroupId).toBe('OG-1')
    expect(isOrderAttemptReenterable(created!, NOW + 60_000)).toBe(true)
    expect(isOrderAttemptReenterable(created!, NOW + 10 * 60_000 - 10_000)).toBe(false)
    expect(isOrderAttemptReenterable(created!, NOW + 11 * 60_000)).toBe(false)
    // 다른 시도 id로는 기록되지 않는다(저장된 시도가 바뀐 뒤 늦게 온 응답).
    expect(
      markOrderAttemptCreated('stale', {
        orderGroupId: 'OG-2',
        expiresAt: createdAt(NOW).expiresAt,
        snapshot: SNAPSHOT,
      }),
    ).toBeNull()
    expect(readOrderAttempt()?.orderGroupId).toBe('OG-1')
  })

  it('[AC-ORDER-ATTEMPT-004] 같은 fingerprint라도 주문그룹이 만료됐으면 새 키의 새 시도를 만든다', () => {
    const fp = buildOrderFingerprint(BASE)
    const attempt = ensureOrderAttempt(fp, NOW)
    markOrderAttemptCreated(attempt.attemptId, { ...createdAt(NOW), snapshot: SNAPSHOT })

    const alive = ensureOrderAttempt(fp, NOW + 60_000)
    expect(alive.orderGroupId).toBe('OG-1')
    expect(alive.idempotencyKey).toBe(attempt.idempotencyKey)

    const renewed = ensureOrderAttempt(fp, NOW + 11 * 60_000)
    expect(renewed.orderGroupId).toBeNull()
    expect(renewed.snapshot).toBeNull()
    expect(renewed.idempotencyKey).not.toBe(attempt.idempotencyKey)
  })

  it('[AC-ORDER-ATTEMPT-005] 깨진 저장값은 무시하고 reset은 기록을 지운다', () => {
    window.sessionStorage.setItem(ORDER_ATTEMPT_STORAGE_KEY, '{not json')
    expect(readOrderAttempt()).toBeNull()
    window.sessionStorage.setItem(ORDER_ATTEMPT_STORAGE_KEY, JSON.stringify({ attemptId: 1 }))
    expect(readOrderAttempt()).toBeNull()

    ensureOrderAttempt(buildOrderFingerprint(BASE), NOW)
    expect(readOrderAttempt()).not.toBeNull()
    resetOrderAttempt()
    expect(readOrderAttempt()).toBeNull()
    expect(window.sessionStorage.getItem(ORDER_ATTEMPT_STORAGE_KEY)).toBeNull()
  })

  it('[AC-ORDER-ATTEMPT-006] 주문그룹 기록은 주문 스냅샷(수단·주문명·금액·라인)을 함께 저장하고 복원한다', () => {
    const attempt = ensureOrderAttempt(buildOrderFingerprint(BASE), NOW)
    markOrderAttemptCreated(attempt.attemptId, { ...createdAt(NOW), snapshot: SNAPSHOT })

    const restored = readOrderAttempt()
    expect(restored?.snapshot).toEqual(SNAPSHOT)
    // 저장값은 토큰·개인정보 없이 스냅샷 필드만 담는다.
    const raw = JSON.parse(window.sessionStorage.getItem(ORDER_ATTEMPT_STORAGE_KEY)!) as Record<
      string,
      unknown
    >
    expect(Object.keys(raw).sort()).toEqual(
      [
        'attemptId',
        'idempotencyKey',
        'fingerprint',
        'orderGroupId',
        'expiresAt',
        'snapshot',
        'createdAt',
      ].sort(),
    )
    expect(readReenterableOrderAttempt(NOW + 60_000)?.snapshot?.method).toBe('tosspay')
    expect(readReenterableOrderAttempt(NOW + 11 * 60_000)).toBeNull()
  })

  it('[AC-ORDER-ATTEMPT-007] 스냅샷이 없거나 깨진 주문그룹 기록은 재진입 대상이 아니다', () => {
    const attempt = ensureOrderAttempt(buildOrderFingerprint(BASE), NOW)
    // 스냅샷 없이 저장된 옛 형식 — 금액·수단을 보여줄 수 없어 재진입하지 않는다.
    window.sessionStorage.setItem(
      ORDER_ATTEMPT_STORAGE_KEY,
      JSON.stringify({ ...attempt, ...createdAt(NOW), snapshot: null }),
    )
    expect(readOrderAttempt()?.orderGroupId).toBe('OG-1')
    expect(readReenterableOrderAttempt(NOW + 60_000)).toBeNull()

    // 스냅샷 필드가 깨졌으면 기록 전체를 버린다.
    window.sessionStorage.setItem(
      ORDER_ATTEMPT_STORAGE_KEY,
      JSON.stringify({
        ...attempt,
        ...createdAt(NOW),
        snapshot: { ...SNAPSHOT, method: 'bitcoin', finalPaymentAmount: '67000' },
      }),
    )
    expect(readOrderAttempt()).toBeNull()
  })

  it('[AC-ORDER-ATTEMPT-008] 스냅샷 라인이 장바구니에 하나라도 남아 있어야 진행 중인 주문으로 본다', () => {
    const attempt = ensureOrderAttempt(buildOrderFingerprint(BASE), NOW)
    const created = markOrderAttemptCreated(attempt.attemptId, {
      ...createdAt(NOW),
      snapshot: SNAPSHOT,
    })!

    expect(orderAttemptLinesInCart(created, [1, 9])).toBe(true)
    expect(orderAttemptLinesInCart(created, [9, 10])).toBe(false)
    expect(orderAttemptLinesInCart(created, [])).toBe(false)
    expect(orderAttemptLinesInCart(attempt, [1, 2, 3])).toBe(false)
  })
})
