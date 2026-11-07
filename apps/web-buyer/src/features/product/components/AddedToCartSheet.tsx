import { BottomSheet, Button, Card } from '@aechak/design-system/web'
import { ProductThumbnail } from '@/shared/catalog'
import { useCartQuery } from '@/shared/cart'
import { useProductDetail } from '../product.queries'

// 장바구니 담기 확인 바텀시트 — 담긴 사실만 알린다. 방금 담은 라인(옵션/수량)은 담기 응답의
// cartItemId로 서버 장바구니에서 읽는다(같은 옵션 재담기는 수량이 합산되므로 요약 수량은 그
// 라인의 현재 총수량이다). "함께 보면 좋은 상품" 추천은 서버에 추천 경로가 없어 목업 카탈로그
// 6개를 깔고 서버에 없는 상세로 보냈다 — 실데이터로 바꿀 수 없어 섹션째로 걷었다.
export function AddedToCartSheet({
  open,
  productId,
  cartItemId,
  onClose,
  onViewCart,
}: {
  open: boolean
  productId: string
  /** 방금 담은 서버 라인 id(담기 응답). null이면 옵션/수량 요약을 생략한다. */
  cartItemId: number | null
  onClose: () => void
  onViewCart: () => void
}) {
  const { data } = useProductDetail(productId)

  // 담기 성공 직후 invalidate로 갱신된 서버 장바구니에서 방금 담은 라인을 찾는다.
  const cartQuery = useCartQuery({ enabled: open })
  const line = cartQuery.data?.data.sellerGroups
    .flatMap(g => g.items)
    .find(i => i.cartItemId === cartItemId)

  return (
    <BottomSheet open={open} onClose={onClose} title="장바구니에 담았어요">
      <div className="flex flex-col gap-4">
        {/* (a) 방금 담은 상품 요약 행 */}
        {data && (
          <Card className="flex items-center gap-3 p-3">
            <ProductThumbnail src={data.thumbnailUrl} className="size-14" />
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <p className="truncate text-body-sm font-medium text-text-primary">{data.name}</p>
              {line && (
                <p className="truncate text-caption text-text-tertiary">
                  {line.selectedOptions} / 수량 {line.quantity}개
                </p>
              )}
            </div>
          </Card>
        )}

        {/* (b) 하단 버튼 행 — children 안에 배치(OptionSheet 컨벤션) */}
        <div className="flex gap-2.5">
          <Button variant="secondary" size="lg" onClick={onClose} className="flex-1">
            닫기
          </Button>
          <Button size="lg" onClick={onViewCart} className="flex-1">
            장바구니 보기
          </Button>
        </div>
      </div>
    </BottomSheet>
  )
}
