import { useNavigate } from '@tanstack/react-router'
import { ChevronRight } from 'lucide-react'
import { EmptyState, Skeleton, StatusPill } from '@aechak/design-system/web'
import { MarketAppBar } from '@/shared/components/MarketAppBar'
import { formatKRW } from '@/shared/formatKRW'
import { truncateText } from '@/shared/truncate'
import { useCartCount } from '@/shared/cart'
import { ProductCarousel, ProductThumbnail, registerProducts, type CatalogProduct } from '@/shared/catalog'
import { LoginGate, useLoginGate } from '@/shared/auth'
import { useHomeFeed } from '../home.queries'

// 홈(b1-st-1). _tabs 레이아웃의 MobileScreen 안(스크롤 영역)에 렌더되므로 여기서 다시
// MobileScreen으로 감싸지 않는다. 상단 앱바만 sticky로 고정한다.
// 비회원 화면은 없다 — 라우트 beforeLoad(routes/_tabs/index.tsx)가 세션 없는 방문자를 로그인으로 보낸다.
// 데이터는 GET /home(추천/인기 랭킹)뿐이다. 서버가 주지 않는 목업 섹션(카테고리 칩 인플레이스 필터,
// 프로모션 배너, 펫 등록 CTA)은 실연동하면서 걷어냈다 — 요약 응답에 카테고리가 없어 칩 필터가
// 동작할 수 없고, 배너/펫 상태는 근거 데이터가 없다.
export function HomeScreen() {
  const navigate = useNavigate()
  const { data, isLoading, isError } = useHomeFeed()
  const cartCount = useCartCount()
  const { gateOpen, gateFeature, requireAuth, closeGate } = useLoginGate()

  // 상세/찜처럼 후속 화면이 상품 스냅샷을 실제 소비할 때만 레지스트리에 넣는다(ProductGrid와 동일).
  const goProduct = (product: CatalogProduct) => {
    registerProducts([product])
    navigate({ to: '/products/$productId', params: { productId: product.id } })
  }

  return (
    <div className="flex flex-col pb-6">
      <MarketAppBar
        title="애착"
        onSearch={() => navigate({ to: '/search' })}
        onCart={() => navigate({ to: '/cart' })}
        cartCount={cartCount}
        hasNotification
      />

      {isError ? (
        // 비인증 오류(네트워크/500 등)는 인라인 안내만 한다(401은 인터셉터, 403/20006은 전역 온보딩 유도).
        <div className="flex flex-col items-center px-6 py-16">
          <EmptyState title="홈을 불러오지 못했어요" description="잠시 후 다시 들어와 주세요." />
        </div>
      ) : isLoading || !data ? (
        <div className="flex flex-col gap-4 p-4">
          <Skeleton variant="rect" className="h-40 w-full rounded-card" />
          <Skeleton variant="rect" className="h-24 w-full rounded-card" />
        </div>
      ) : (
        <div className="flex flex-col gap-5 pt-4">
          <RecommendedSection
            products={data.recommended}
            onSelect={goProduct}
            // 추천 캐러셀 하트 — 반드시 비회원 로그인 게이트를 거친 뒤에만 토글한다(ProductGrid와 같은 wishGuard).
            wishGuard={proceed => requireAuth('wish', proceed)}
          />
          <RankingSection
            ranking={data.ranking}
            onSelect={goProduct}
            onMore={() => navigate({ to: '/market' })}
          />
        </div>
      )}

      <LoginGate open={gateOpen} feature={gateFeature} onClose={closeGate} />
    </div>
  )
}

// 추천 상품 가로 캐러셀 — 공용 ProductCarousel(찜/레지스트리/게이트 배선은 ProductGrid와 공유).
function RecommendedSection({
  products,
  onSelect,
  wishGuard,
}: {
  products: CatalogProduct[]
  onSelect: (product: CatalogProduct) => void
  wishGuard: (proceed: () => void) => void
}) {
  if (products.length === 0) return null

  return (
    <section>
      <h2 className="mb-2.5 px-4 text-subheading font-semibold text-text-primary">
        이런 상품은 어때요?
      </h2>
      <ProductCarousel products={products} onSelect={onSelect} wishGuard={wishGuard} className="px-4" />
    </section>
  )
}

// 랭킹 행 상품명 하드 캡(글자수). 가장 넓은 폰 프레임(430px)에서도 한 줄에 들어가는 값이며,
// CSS truncate가 더 좁은 화면을 responsive하게 추가로 잘라준다(이건 결정적 상한).
const RANKING_NAME_MAX = 22

// 인기 랭킹 — 서버가 순서(리뷰 수>찜 수>최신)와 개수(최대 5)를 정해 내려주므로 그대로 그린다.
function RankingSection({
  ranking,
  onSelect,
  onMore,
}: {
  ranking: CatalogProduct[]
  onSelect: (product: CatalogProduct) => void
  onMore: () => void
}) {
  return (
    <section className="px-4">
      <div className="mb-2.5 flex items-center justify-between gap-3">
        <h2 className="min-w-0 truncate text-subheading font-semibold text-text-primary">
          지금 인기 있는 상품
        </h2>
        <button
          type="button"
          onClick={onMore}
          className="flex flex-none items-center gap-0.5 text-caption font-medium text-text-brand"
        >
          마켓에서 더 보기
          <ChevronRight className="size-4" />
        </button>
      </div>
      {ranking.length === 0 ? (
        <EmptyState title="아직 인기 상품이 없어요" description="마켓에서 다양한 상품을 둘러보세요." />
      ) : (
        <div className="flex flex-col">
          {ranking.map((product, i) => (
            <RankingRow
              key={product.id}
              product={product}
              rank={i + 1}
              divider={i < ranking.length - 1}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </section>
  )
}

function RankingRow({
  product,
  rank,
  divider,
  onSelect,
}: {
  product: CatalogProduct
  rank: number
  divider: boolean
  onSelect: (product: CatalogProduct) => void
}) {
  const sold = product.isSoldOut
  const inner = (
    <>
      <span
        className={[
          'w-5 flex-none text-center text-subheading font-bold',
          rank <= 3 ? 'text-brand' : 'text-text-tertiary',
        ].join(' ')}
      >
        {rank}
      </span>
      <ProductThumbnail src={product.thumbnailUrl} dimmed={sold} />
      {/* min-w-0 + truncate가 폭 기준 1줄 말줄임의 정석 가드. 그 위에 글자수 하드 캡(truncateText)을
          더해 아주 긴 이름도 결정적으로 짧게 자른다. */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-body-sm text-text-primary">
          {truncateText(product.name, RANKING_NAME_MAX)}
        </p>
        <div className="mt-1 flex items-center gap-1.5">
          <span
            className={['text-price-sm font-semibold', sold ? 'text-text-tertiary' : 'text-text-price'].join(
              ' ',
            )}
          >
            {formatKRW(product.price)}
          </span>
          {sold && (
            <StatusPill variant="muted" size="sm">
              품절
            </StatusPill>
          )}
        </div>
      </div>
    </>
  )

  const rowClass = ['flex items-center gap-3 py-3', divider ? 'border-b border-border-subtle' : ''].join(' ')

  if (sold) {
    return <div className={`${rowClass} cursor-not-allowed`}>{inner}</div>
  }
  return (
    <button
      type="button"
      onClick={() => onSelect(product)}
      className={`${rowClass} text-left focus-visible:outline-none focus-visible:shadow-focus-ring`}
    >
      {inner}
    </button>
  )
}
