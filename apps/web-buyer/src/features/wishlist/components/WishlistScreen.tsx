import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Heart } from 'lucide-react'
import { EmptyState, MobileScreen } from '@aechak/design-system/web'
import { AppToast } from '@/shared/components/AppToast'
import { BackAppBar } from '@/shared/components/BackAppBar'
import { useSafeBack } from '@/shared/useSafeBack'
import { addWish, type CatalogProduct, ProductGrid } from '@/shared/catalog'
import { LoginGate, useLoginGate } from '@/shared/auth'
import { useWishlistProducts } from '../wishlist.queries'

// 찜 목록(b3-st-4). 상품 찜 탭만(스토어 찜 탭 OFF). 하트 해제 시 실행 취소 토스트.
export function WishlistScreen() {
  const navigate = useNavigate()
  const products = useWishlistProducts()
  const { gateOpen, gateFeature, requireAuth, closeGate } = useLoginGate()

  const [toastOpen, setToastOpen] = useState(false)
  const [lastRemoved, setLastRemoved] = useState<CatalogProduct | null>(null)

  const goBack = useSafeBack({ to: '/' })

  return (
    <MobileScreen header={<BackAppBar onBack={goBack} title="찜" />}>
      {/* 스토어 찜 탭이 컷돼 전환할 탭이 없으므로 Tabs 대신 단일 섹션 헤더로 둔다. */}
      {products.length > 0 && (
        <div className="flex items-baseline gap-2 px-4 pt-4">
          <h2 className="text-subheading font-semibold text-text-primary">찜한 상품</h2>
          <span className="text-body-sm font-medium text-text-tertiary">{products.length}</span>
        </div>
      )}

      {products.length === 0 ? (
        <div className="flex h-full items-center justify-center">
          <EmptyState
            icon={<Heart className="size-7 text-icon-muted" />}
            title="아직 찜한 상품이 없어요"
            description="마음에 드는 상품의 하트를 누르면 여기에 모아둘 수 있어요."
            action={{ label: '상품 둘러보기', onClick: () => navigate({ to: '/market' }) }}
          />
        </div>
      ) : (
        <div className="p-4">
          <ProductGrid
            products={products}
            wishGuard={proceed => requireAuth('wish', proceed)}
            onSelect={product =>
              navigate({ to: '/products/$productId', params: { productId: product.id } })
            }
            onWishChange={(product, wished) => {
              if (!wished) {
                setLastRemoved(product)
                setToastOpen(true)
              }
            }}
          />
        </div>
      )}

      <AppToast
        open={toastOpen}
        onClose={() => setToastOpen(false)}
        variant="info"
        message={
          // 실행 취소(undo) 액션이 붙는 예외적 토스트 — 텍스트 + 버튼을 한 행에 둔다.
          // AppToast가 message를 nowrap으로 감싸므로 별도 nowrap은 붙이지 않는다.
          <span className="flex items-center gap-3">
            <span>찜을 해제했어요.</span>
            <button
              type="button"
              onClick={() => {
                if (lastRemoved) addWish(lastRemoved.id)
                setToastOpen(false)
              }}
              className="flex-none font-semibold text-text-link"
            >
              실행 취소
            </button>
          </span>
        }
      />

      <LoginGate open={gateOpen} feature={gateFeature} onClose={closeGate} />
    </MobileScreen>
  )
}
