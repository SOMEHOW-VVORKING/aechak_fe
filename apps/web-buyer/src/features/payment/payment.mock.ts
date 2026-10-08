import type { PaymentMethod } from '@aechak/domain'

// 결제 진행/완료/실패(b1-st-5) 목업. 실제 PG 연동은 범위 밖 — 순수 목업 분기.

export interface PaymentResult {
  ok: boolean
  orderNo: string
  amount: number
  method: PaymentMethod
  failReason?: string
}

// 결정적 분기: 신용/체크카드는 항상 한도 초과로 실패, 나머지(카카오/토스)는 성공한다.
// 실제 PG가 없어 재현 가능한 규칙이 필요해 결제수단으로 성공/실패를 가른다 —
// 리뷰 시 카카오페이(기본)로 성공, 신용/체크카드로 실패 흐름을 그대로 재현할 수 있다.
export function willPaymentFail(method: PaymentMethod): boolean {
  return method === 'card'
}

// 목업 주문번호(YYYYMMDD-####). 모듈 카운터로 매 호출마다 유일한 번호를 만든다 —
// 금액에서 파생하던 예전 방식은 "금액만 같은 서로 다른 주문"이 같은 번호로 충돌해 한 주문이
// 다른 주문을 조용히 덮어쓰는 버그가 있었다. 유일성은 여기서 보장하고, "같은 결제의 StrictMode
// 이중 실행"은 결제 화면이 이 번호를 인스턴스당 한 번만(useState lazy init) 생성·재사용해
// 처리한다(같은 번호 → 주문 스토어 upsert 1건). 결제 화면이 이 번호를 생성해 processPayment와
// 주문 생성에 함께 넘긴다.
let orderSeq = 1999

export function generateOrderNo(): string {
  orderSeq += 1
  return `20260710-${String(orderSeq).padStart(4, '0')}`
}

export function processPayment(input: {
  amount: number
  method: PaymentMethod
  /** 결제 화면이 인스턴스당 한 번 만든 주문번호(generateOrderNo). 결제 결과와 주문 생성이 같은 번호를 쓴다. */
  orderNo: string
}): Promise<PaymentResult> {
  const fail = willPaymentFail(input.method)
  return new Promise(resolve => {
    setTimeout(() => {
      resolve({
        ok: !fail,
        orderNo: input.orderNo,
        amount: input.amount,
        method: input.method,
        failReason: fail ? '카드 한도를 확인한 뒤 다시 시도해 주세요.' : undefined,
      })
    }, 1200)
  })
}
