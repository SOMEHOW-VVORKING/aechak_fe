import { useNavigate } from '@tanstack/react-router'
import { BottomSheet, Button, ProductCard } from '@aechak/design-system/web'
import type { CatalogProduct } from '@/shared/catalog'
import { useCartQuery } from '@/shared/cart'
import { useProductDetail } from '../product.queries'
import { getCartRecommendations } from '../recommendation.mock'

// 장바구니 담기 확인 바텀시트. 기존 하단 중앙 토스트가 하단 액션바를 덮던 문제를 근본 해소한다 —
// 토스트 대신 시트를 올려 담긴 사실 + "함께 보면 좋은 상품" 추천을 보여준다. 방금 담은 라인(옵션/
// 수량)은 담기 응답의 cartItemId로 서버 장바구니에서 읽는다(같은 옵션 재담기는 수량이 합산되므로
// 요약 수량은 그 라인의 현재 총수량이다 — 의도된 동작).
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
  const navigate = useNavigate()
  const { data } = useProductDetail(productId)

  // 담기 성공 직후 invalidate로 갱신된 서버 장바구니에서 방금 담은 라인을 찾는다.
  const cartQuery = useCartQuery({ enabled: open })
  const line = cartQuery.data?.data.sellerGroups
    .flatMap(g => g.items)
    .find(i => i.cartItemId === cartItemId)

  const recommended = getCartRecommendations(productId)

  return (
    <BottomSheet open={open} onClose={onClose} title="장바구니에 담았어요">
      <div className="flex flex-col gap-4">
        {/* (a) 방금 담은 상품 요약 행 */}
        {data && (
          <div className="flex items-center gap-3 rounded-card border border-border-subtle bg-surface-raised p-3">
            <div className="size-14 flex-none overflow-hidden rounded-image bg-surface-sunken">
              <img
                src={data.thumbnailUrl ?? data.images[0]}
                alt=""
                className="size-full object-cover"
              />
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <p className="truncate text-body-sm font-medium text-text-primary">{data.name}</p>
              {line && (
                <p className="truncate text-caption text-text-tertiary">
                  {line.selectedOptions} / 수량 {line.quantity}개
                </p>
              )}
            </div>
          </div>
        )}

        {/* (b) 함께 보면 좋은 상품 — 섹션 헤더 + 가로 스크롤 캐러셀(HomeScreen RecommendedSection 참고) */}
        {recommended.length > 0 && (
          <section className="flex flex-col gap-2.5">
            <h3 className="text-subheading font-semibold text-text-primary">함께 보면 좋은 상품</h3>
            <RecommendedCarousel
              products={recommended}
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

function RecommendedCarousel({
  products,
  onSelect,
}: {
  products: CatalogProduct[]
  onSelect: (product: CatalogProduct) => void
}) {
  return (
    <div className="flex gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {products.map(product => (
        <div key={product.id} className="w-[152px] flex-none">
          <ProductCard
            image={product.thumbnailUrl ?? ''}
            storeName={product.storeName}
            name={product.name}
            price={product.price}
            originalPrice={product.originalPrice}
            onClick={() => onSelect(product)}
          />
        </div>
      ))}
    </div>
  )
}
