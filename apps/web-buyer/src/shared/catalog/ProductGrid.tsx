import type { ReactNode } from 'react'
import { ProductCard } from '@aechak/design-system/web'
import type { CatalogProduct } from './products'
import { registerProducts } from './registry'
import { toggleWish, useWishedIds } from './wishlist.store'

export interface ProductGridProps {
  products: CatalogProduct[]
  /** 카드(상품) 탭 시 호출 — 보통 상세로 navigate. */
  onSelect: (product: CatalogProduct) => void
  /** 하트 토글 후 호출(변경된 wished 값 전달) — 찜 해제 토스트 등에 사용. */
  onWishChange?: (product: CatalogProduct, wished: boolean) => void
  /** 하트 오버레이 표시 여부. 기본 true. */
  showWish?: boolean
  /** 각 카드 하단에 덧붙일 요소(예: 품절 상품 재입고 알림 버튼). */
  renderExtra?: (product: CatalogProduct) => ReactNode
  /**
   * 하트 토글을 실행하기 전에 통과시키는 게이트. 주면 실제 토글(`proceed`)을 이 함수가
   * 감싼다 — 비회원 로그인 게이트(`shared/auth`)를 상위 feature 화면에서 주입하는 통로다.
   * `shared/catalog`는 `shared/auth`를 직접 import할 수 없어(ESLint boundaries) 이렇게
   * 콜백으로 주입받는다. 안 주면 기존과 동일하게 즉시 토글한다(하위 호환).
   */
  wishGuard?: (proceed: () => void) => void
}

// 구매자 화면 공용 2열 상품 그리드. ProductCard(디자인 시스템)를 찜 스토어·네비게이션에
// 배선하는 얇은 래퍼 — 카테고리/검색결과/찜목록이 모두 재사용한다(중복 구현 금지).
export function ProductGrid({
  products,
  onSelect,
  onWishChange,
  showWish = true,
  renderExtra,
  wishGuard,
}: ProductGridProps) {
  const wished = useWishedIds()

  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-5">
      {products.map(product => (
        <div key={product.id} className="flex flex-col">
          <ProductCard
            image={product.thumbnailUrl ?? ''}
            storeName={product.storeName}
            name={product.name}
            price={product.price}
            originalPrice={product.originalPrice}
            isSold={product.isSoldOut}
            onClick={
              product.isSoldOut
                ? undefined
                : () => {
                    registerProducts([product])
                    onSelect(product)
                  }
            }
            wished={showWish ? wished.has(product.id) : undefined}
            onWishToggle={
              showWish
                ? () => {
                    const proceed = () => {
                      registerProducts([product])
                      toggleWish(product.id)
                      onWishChange?.(product, !wished.has(product.id))
                    }
                    if (wishGuard) wishGuard(proceed)
                    else proceed()
                  }
                : undefined
            }
          />
          {renderExtra?.(product)}
        </div>
      ))}
    </div>
  )
}
