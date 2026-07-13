// 구매자 화면 공용 원화 포맷터. 이후 상품 그리드/상세/장바구니/주문 등에서 공통으로 씀.
// 예) formatKRW(64000) === '64,000원'
export function formatKRW(n: number): string {
  return n.toLocaleString('ko-KR') + '원'
}
