import { useNavigate } from '@tanstack/react-router'
import { BottomSheet, Button, Card } from '@aechak/design-system/web'
import { ProductCarousel, ProductThumbnail } from '@/shared/catalog'
import { useCartItems } from '@/shared/cart'
import { useProductDetail } from '../product.queries'
import { getCartRecommendations } from '../recommendation.mock'

// 장바구니 담기 확인 바텀시트. 기존 하단 중앙 토스트가 하단 액션바를 덮던 문제를 근본 해소한다 —
// 토스트 대신 시트를 올려 담긴 사실 + "함께 보면 좋은 상품" 추천을 보여준다. 방금 담은 라인(옵션/
// 수량)은 담기 직후 장바구니 스토어에서 읽는다(props로 옵션/수량을 받지 않고 productId만으로 요약을 구성).
export function AddedToCartSheet({
  open,
  productId,
  onClose,
  onViewCart,
}: {
  open: boolean
  productId: string
  onClose: () => void
  onViewCart: () => void
}) {
  const navigate = useNavigate()
  const { data } = useProductDetail(productId)

  // 방금 담은 라인 — 같은 상품에 여러 옵션이 담겨 있을 수 있어 productId가 일치하는 마지막(가장
  // 최근) 라인을 방금 담은 것으로 본다.
  const items = useCartItems()
  const line = [...items].reverse().find(i => i.productId === productId)

  const recommended = getCartRecommendations(productId)

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
                  {line.option} / 수량 {line.quantity}개
                </p>
              )}
            </div>
          </Card>
        )}

        {/* (b) 함께 보면 좋은 상품 — 섹션 헤더 + 가로 스크롤 캐러셀(홈 추천 섹션과 같은 ProductCarousel, 하트 없음) */}
        {recommended.length > 0 && (
          <section className="flex flex-col gap-2.5">
            <h3 className="text-subheading font-semibold text-text-primary">함께 보면 좋은 상품</h3>
            <ProductCarousel
              products={recommended}
              showWish={false}
              onSelect={product =>
                navigate({ to: '/products/$productId', params: { productId: product.id } })
              }
            />
          </section>
        )}

        {/* (c) 하단 버튼 행 — children 안에 배치(OptionSheet 컨벤션) */}
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
