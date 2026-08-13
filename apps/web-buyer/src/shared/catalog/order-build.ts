import {
  buildOrderSnapshot,
  type BuyerOrder,
  type BuyerOrderSellerGroup,
  type CartItem,
  type PaymentMethod,
} from '@aechak/domain'
import { buildCartView } from './cart-view'

// 결제 성공 시 주문 컨텍스트(주문된 라인 + 결제 메타)를 실제 주문(BuyerOrder)으로 조립한다.
//
// **이 파일이 shared/order가 아니라 shared/catalog에 있는 이유**: 주문 상품 스냅샷(이름/단가/
// 셀러/배송비)을 채우려면 상품 데이터와 배송비 규칙(buildCartView)이 필요한데 eslint boundaries가
// shared → shared 교차 import를 금지한다. cart-view와 같은 이유로 상품 데이터가 있는 catalog에
// 두고, 순수 상태인 주문 스토어(shared/order)는 완성된 스냅샷만 받는다.
// 결제 feature가 여기서 주문을 만들어 shared/order의 addOrder로 넣는다.

export interface OrderBuildInput {
  /** 결정적 주문번호(YYYYMMDD-####). StrictMode 이중 실행에도 같은 결제는 같은 번호. */
  orderNo: string
  method: PaymentMethod
  /** 실제 결제 금액(적립금 차감 후). itemsTotal+shippingTotal과의 차이로 사용 적립금을 역산한다. */
  paidAmount: number
  orderedAt: string
  /** 주문된 라인(모두 결제 대상으로 취급 — 호출부에서 선택/바로구매 라인만 넘긴다). */
  items: readonly CartItem[]
}

// 카탈로그에 없는 라인은 제외한다. 유효 라인이 하나도 없으면 null(주문 생성 안 함).
export function buildOrderFromContext(input: OrderBuildInput): BuyerOrder | null {
  const ordered: CartItem[] = input.items.map(i => ({ ...i, selected: true }))
  const view = buildCartView(ordered)
  if (view.isEmpty) return null

  const groups: BuyerOrderSellerGroup[] = view.groups.map(g => ({
    sellerId: g.sellerId,
    storeName: g.storeName,
    shippingFee: g.shippingFee,
    items: g.lines.map(l => ({
      productId: l.productId,
      name: l.product.name,
      option: l.option,
      quantity: l.quantity,
      // 주문 단가에 옵션 조합 추가금을 포함해 주문 스냅샷이 결제 금액과 일치하게 고정한다.
      unitPrice: l.product.price + l.additionalPrice,
      thumbnailUrl: l.product.thumbnailUrl,
    })),
  }))

  // 공통 스냅샷 규칙(pointsUsed 역산·couponDiscount 0·적립 1%·status 'paid')은 도메인 순수 함수가
  // 단일 원본이다 — 장바구니 결제(buildOrderFromCartGroups)와 같은 규칙을 공유한다.
  return buildOrderSnapshot({
    orderNo: input.orderNo,
    method: input.method,
    paidAmount: input.paidAmount,
    orderedAt: input.orderedAt,
    groups,
    itemsTotal: view.itemsTotal,
    shippingTotal: view.shippingTotal,
  })
}
