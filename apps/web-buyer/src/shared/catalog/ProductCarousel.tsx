import { WiredProductCard, type ProductGridProps } from './ProductGrid'
import { useWishedIds } from './wishlist.store'

export type ProductCarouselProps = Omit<ProductGridProps, 'renderExtra'> & { className?: string }

// 가로 스크롤 ProductCard 스트립(홈 추천 섹션, 장바구니 담김 시트 추천). 카드 고정 폭 152px.
// 찜/레지스트리/게이트 배선은 ProductGrid와 같은 WiredProductCard를 쓴다.
export function ProductCarousel({
  products,
  onSelect,
  onWishChange,
  showWish = true,
  wishGuard,
  className = '',
}: ProductCarouselProps) {
  const wished = useWishedIds()

  return (
    <div
      className={`flex gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${className}`}
    >
      {products.map(product => (
        <div key={product.id} className="w-[152px] flex-none">
          <WiredProductCard
            product={product}
            wished={wished.has(product.id)}
            onSelect={onSelect}
            onWishChange={onWishChange}
            showWish={showWish}
            wishGuard={wishGuard}
          />
        </div>
      ))}
    </div>
  )
}
