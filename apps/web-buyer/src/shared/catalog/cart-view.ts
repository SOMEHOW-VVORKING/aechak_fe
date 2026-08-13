import { cartLineKey, type CartItem } from '@aechak/domain'
import {
  BASE_SHIPPING_FEE,
  findProduct,
  isFreeShipping,
  type CatalogProduct,
} from './products'

// 장바구니 라인 원본(CartItem[])을 상품 정보로 해석해 셀러별 그룹·금액·배송비까지 계산하는 파생 로직.
//
// **이 파일이 shared/cart가 아니라 shared/catalog에 있는 이유**: 파생 계산에 상품 데이터
// (findProduct·isFreeShipping·BASE_SHIPPING_FEE)가 필요한데 eslint boundaries가 shared → shared
// 교차 import를 금지한다. 그래서 상품 데이터가 있는 catalog 폴더 안에 두고, 원본 라인 스토어
// (shared/cart)는 catalog에 의존하지 않는 순수 상태로 남긴다. 장바구니·주문서 두 feature가
// 모두 @/shared/catalog에서 이 빌더를 가져다 쓴다(중복 구현 금지). 라인 키(cartLineKey)는
// 서버 카트 전환으로 cart.store가 삭제된 뒤에도 바로구매 경로(buildCartView)가 계속 쓰는 규칙이라
// shared가 아닌 도메인에 그대로 둔다(shared→shared 회피).
//
// **선택(selected)의 두 의미를 분리한다**: 품절 상품도 체크해서 전체 선택/선택 삭제로 한 번에
// 지울 수 있어야 하지만(캡틴 요청), 품절은 주문 대상이 아니므로 주문 금액·주문 가능 판정에는
// 빠져야 한다. 그래서 `selected`(체크박스 상태, 품절 포함)와 `orderable`(=품절 아님)을 나눠,
// (a) 체크/삭제 판정에는 `selected`만, (b) 주문 합계·주문 가능 판정에는 `selected && orderable`을
// 쓴다.

export interface CartLineView {
  key: string
  productId: string
  option: string
  quantity: number
  /** 사용자가 체크한 값(체크박스 상태). 품절 라인도 체크할 수 있다(전체 선택/선택 삭제 대상). */
  selected: boolean
  /** 체크(선택/삭제)가 가능한지. 카탈로그에서 해석된 라인은 품절 포함 항상 true. */
  selectable: boolean
  /** 주문 대상 여부(=품절 아님). 주문 합계·주문 가능 판정은 selected && orderable만 센다. */
  orderable: boolean
  soldOut: boolean
  /** 선택한 옵션 조합의 추가금(원, 단위당). 목업 라인은 0. lineTotal/주문 단가에 반영된다. */
  additionalPrice: number
  lineTotal: number
  product: CatalogProduct
}

export interface CartSellerGroup {
  sellerId: string
  storeName: string
  lines: CartLineView[]
  /** 이 셀러에서 선택된 주문 대상(품절 제외) 상품 합계. */
  selectedSubtotal: number
  /** 주문 대상 선택 항목이 있고 그 합계가 무료배송 임계 미만이면 배송비 부과, 아니면 0. */
  shippingFee: number
  freeShipping: boolean
}

export interface CartView {
  groups: CartSellerGroup[]
  /** 체크 가능한 라인 키 전체(품절 포함). 전체 선택 토글·선택 삭제의 대상. */
  selectableKeys: string[]
  /** 체크 가능한 라인이 모두 선택됐는지(전체 선택 체크 상태, 품절 포함). */
  allSelected: boolean
  /** 체크된 라인 수(품절 포함). 전체 선택 라벨·선택 삭제 판정용. */
  selectedLineCount: number
  /** 체크된 라인 중 주문 대상(=품절 아님) 라인 수. 주문하기 버튼 라벨·활성 판정용. */
  orderableLineCount: number
  /** 체크된 라인에 품절이 하나라도 있으면 true(주문하기 비활성 사유). */
  hasSelectedSoldOut: boolean
  /** 주문 대상(선택 + 품절 아님) 라인 수량 합계(하단바 "총 N개"). */
  selectedQuantity: number
  itemsTotal: number
  shippingTotal: number
  grandTotal: number
  isEmpty: boolean
}

function resolveLine(item: CartItem): CartLineView | null {
  const product = findProduct(item.productId)
  if (!product) return null
  const soldOut = product.isSoldOut ?? false
  const additionalPrice = item.additionalPrice ?? 0
  return {
    key: cartLineKey(item.productId, item.option),
    productId: item.productId,
    option: item.option,
    quantity: item.quantity,
    // 체크박스 상태 자체는 원본 그대로 — 품절도 체크 가능(전체 선택/일괄 삭제 대상).
    selected: item.selected,
    selectable: true,
    // 주문 대상은 품절이 아닌 라인뿐 — 주문 합계·주문 가능 판정에만 쓴다.
    orderable: !soldOut,
    soldOut,
    additionalPrice,
    // 조합 추가금을 단가에 더해 합계에 반영한다(상품 기본가 + 조합 추가금) * 수량.
    lineTotal: (product.price + additionalPrice) * item.quantity,
    product,
  }
}

export function buildCartView(items: readonly CartItem[]): CartView {
  const lines = items
    .map(resolveLine)
    .filter((l): l is CartLineView => l !== null)

  // 셀러별 그룹(첫 등장 순서 유지).
  const order: string[] = []
  const byseller = new Map<string, CartLineView[]>()
  for (const line of lines) {
    const sid = line.product.sellerId
    if (!byseller.has(sid)) {
      byseller.set(sid, [])
      order.push(sid)
    }
    byseller.get(sid)!.push(line)
  }

  const groups: CartSellerGroup[] = order.map(sid => {
    const groupLines = byseller.get(sid)!
    // 주문 대상(선택 + 품절 아님)만 합계·배송비 계산에 넣는다 — 품절은 체크돼도 금액에서 제외.
    const orderableSelected = groupLines.filter(l => l.selected && l.orderable)
    const selectedSubtotal = orderableSelected.reduce((sum, l) => sum + l.lineTotal, 0)
    const hasSelected = orderableSelected.length > 0
    const freeShipping = isFreeShipping({ price: selectedSubtotal })
    return {
      sellerId: sid,
      storeName: groupLines[0]?.product.storeName ?? '',
      lines: groupLines,
      selectedSubtotal,
      // 주문 대상 선택 항목이 없는 셀러는 배송비를 매기지 않는다.
      shippingFee: hasSelected && !freeShipping ? BASE_SHIPPING_FEE : 0,
      freeShipping,
    }
  })

  // 체크(선택/삭제) 가능한 라인 = 해석된 라인 전체(품절 포함).
  const selectableKeys = lines.map(l => l.key)
  const selectedLines = lines.filter(l => l.selected)
  // 주문 대상(선택 + 품절 아님) — 주문하기 활성/수량/금액 판정용.
  const orderableSelectedLines = selectedLines.filter(l => l.orderable)
  const itemsTotal = groups.reduce((sum, g) => sum + g.selectedSubtotal, 0)
  const shippingTotal = groups.reduce((sum, g) => sum + g.shippingFee, 0)

  return {
    groups,
    selectableKeys,
    allSelected: lines.length > 0 && selectedLines.length === lines.length,
    selectedLineCount: selectedLines.length,
    orderableLineCount: orderableSelectedLines.length,
    hasSelectedSoldOut: selectedLines.some(l => l.soldOut),
    selectedQuantity: orderableSelectedLines.reduce((sum, l) => sum + l.quantity, 0),
    itemsTotal,
    shippingTotal,
    grandTotal: itemsTotal + shippingTotal,
    isEmpty: lines.length === 0,
  }
}
