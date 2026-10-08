// 라벨 + 금액(또는 값) 한 줄. 주문서/장바구니 결제 요약, 주문 상세 결제 정보, 취소 환불 예정 금액이 공유한다.
// 총액 행은 화면마다 글자 크기·색이 달라 여기 두지 않는다.
export function PriceRow({
  label,
  value,
  valueClass = 'text-text-primary',
}: {
  label: string
  value: string
  valueClass?: string
}) {
  return (
    <div className="flex items-center justify-between text-body-sm">
      <span className="text-text-secondary">{label}</span>
      <span className={`tabular-nums ${valueClass}`}>{value}</span>
    </div>
  )
}
