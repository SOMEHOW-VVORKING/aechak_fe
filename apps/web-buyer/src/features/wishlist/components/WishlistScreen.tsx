import { useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Heart } from 'lucide-react'
import { Button, EmptyState, MobileScreen, Skeleton } from '@aechak/design-system/web'
import { AppToast } from '@/shared/components/AppToast'
import { BackAppBar } from '@/shared/components/BackAppBar'
import { HomeAction } from '@/shared/components/HomeAction'
import { useSafeBack } from '@/shared/useSafeBack'
import { type CatalogProduct, ProductGrid, toggleWishlist, useWishedIds } from '@/shared/catalog'
import { LoginGate, useLoginGate } from '@/shared/auth'
import { useLikedProducts } from '../wishlist.queries'

// 파생 배열의 안정 기본값 — data 미로딩 시 매 렌더 새 []를 만들지 않게 모듈 상수를 쓴다.
const EMPTY_POOL: CatalogProduct[] = []

// 찜 목록(b3-st-4). 상품 찜 탭만(스토어 찜 탭 OFF). 서버(GET /users/me/liked-products) pool을 현재
// 찜 id-set으로 필터해 표시한다 — 하트 해제 시 즉시 사라지고(필터아웃), 실행취소 시 pool에 아직
// 있어 즉시 복귀한다(리페치·캐시수술 없음). 해제/복구는 서버 DELETE/POST(toggleWishlist)를 탄다.
export function WishlistScreen() {
  const navigate = useNavigate()
  const likedQuery = useLikedProducts()
  const wished = useWishedIds()
  const { gateOpen, gateFeature, requireAuth, closeGate } = useLoginGate()

  const [toastOpen, setToastOpen] = useState(false)
  const [lastRemoved, setLastRemoved] = useState<CatalogProduct | null>(null)

  const goBack = useSafeBack({ to: '/' })

  const pool = likedQuery.data ?? EMPTY_POOL
  // pool/wished가 바뀔 때만 재계산한다(토스트·게이트 등 무관 state 변경 시 재필터/재할당 방지).
  const products = useMemo(() => pool.filter(p => wished.has(p.id)), [pool, wished])
  // 한 페이지를 전부 해제해도 다음 페이지가 있으면 빈 상태 대신 더보기를 보여줘야 도달 가능하다.
  const showEmpty = products.length === 0 && !likedQuery.hasNextPage

  return (
    <MobileScreen header={<BackAppBar onBack={goBack} title="찜" actions={<HomeAction />} />}>
      {/* 스토어 찜 탭이 컷돼 단일 섹션 헤더로 둔다(탭이 아님). */}
      {products.length > 0 && (
        <div className="flex items-baseline gap-2 px-4 pt-4">
          <h2 className="text-subheading font-semibold text-text-primary">찜한 상품</h2>
          <span className="text-body-sm font-medium text-text-tertiary">{products.length}</span>
        </div>
      )}

      {likedQuery.isLoading ? (
        <div className="grid grid-cols-2 gap-x-3 gap-y-5 p-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} variant="rect" className="h-56 w-full" />
          ))}
        </div>
      ) : likedQuery.isError && pool.length === 0 ? (
        <div className="flex h-full items-center justify-center">
          <EmptyState
            title="찜 목록을 불러오지 못했어요"
            description="잠시 후 다시 시도해 주세요."
            action={{ label: '다시 시도', onClick: () => void likedQuery.refetch() }}
          />
        </div>
      ) : showEmpty ? (
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
            onWishChange={(product, isWishedNow) => {
              if (!isWishedNow) {
                setLastRemoved(product)
                setToastOpen(true)
              }
            }}
          />
          {likedQuery.hasNextPage && (
            <div className="pt-5">
              <Button
                variant="secondary"
                fullWidth
                loading={likedQuery.isFetchingNextPage}
                onClick={() => void likedQuery.fetchNextPage()}
              >
                더보기
              </Button>
            </div>
          )}
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
                // 서버 재-like. 방금 해제해 id-set에 없을 때만(중복 like 방지) 토글한다.
                if (lastRemoved && !wished.has(lastRemoved.id)) toggleWishlist(lastRemoved.id)
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
