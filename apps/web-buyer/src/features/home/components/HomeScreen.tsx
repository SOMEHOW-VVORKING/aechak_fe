import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { ChevronRight, PawPrint } from 'lucide-react'
import { Button, EmptyState, ProductCard, Skeleton, StatusPill } from '@aechak/design-system/web'
import { MarketAppBar } from '@/shared/components/MarketAppBar'
import { formatKRW } from '@/shared/formatKRW'
import { truncateText } from '@/shared/truncate'
import { useCartCount } from '@/shared/cart'
import { placeholderImage, toggleWishlist, useWishedIds, type CatalogProduct } from '@/shared/catalog'
import { LoginGate, useLoginGate } from '@/shared/auth'
import { useHomeFeed } from '../home.queries'
import { ALL_CATEGORY_LABEL, filterRankingByCategory, type HomeRankingItem } from '../home.mock'

// 홈(b1-st-1). _tabs 레이아웃의 MobileScreen 안(스크롤 영역)에 렌더되므로 여기서 다시
// MobileScreen으로 감싸지 않는다. 상단 앱바만 sticky로 고정한다.
export function HomeScreen() {
  const navigate = useNavigate()
  const { data, isLoading, isError, refetch } = useHomeFeed()
  const cartCount = useCartCount()
  const { gateOpen, gateFeature, requireAuth, closeGate } = useLoginGate()

  // 상단 카테고리 칩 = 인플레이스 필터(화면 이동 없이 아래 인기 랭킹만 좁힘). 기본 '전체'.
  const [selectedCategory, setSelectedCategory] = useState<string>(ALL_CATEGORY_LABEL)

  const goProduct = (product: CatalogProduct) =>
    navigate({ to: '/products/$productId', params: { productId: product.id } })

  // 추천 캐러셀 하트 — 반드시 비회원 로그인 게이트를 거친 뒤에만 토글한다(ProductGrid의 wishGuard와
  // 동일 목적: 게이트 우회 버그 재발 방지). 게이트 없는 bare toggleWishlist 호출 금지.
  // toggleWishlist는 mock 상품(현재 홈은 전부 mock)이면 클라이언트 토글만, 실 상품이면 서버 동기화.
  const toggleWishGated = (product: CatalogProduct) =>
    requireAuth('wish', () => toggleWishlist(product.id))

  // "마켓에서 더 보기" — 선택된 칩이 있으면 그 카테고리가 열린 마켓으로, '전체'면 마켓 홈으로.
  const goMarket = () =>
    selectedCategory === ALL_CATEGORY_LABEL
      ? navigate({ to: '/market' })
      : navigate({ to: '/market', search: { category: selectedCategory } })

  return (
    <div className="flex flex-col pb-6">
      <div className="sticky top-0 z-10 bg-surface-base">
        <MarketAppBar
          title="애착"
          onSearch={() => navigate({ to: '/search' })}
          onCart={() => navigate({ to: '/cart' })}
          cartCount={cartCount}
          hasNotification
        />
      </div>

      {/* 카테고리 칩 레일 — 화면 이동 없이 아래 인기 랭킹을 그 자리에서 좁히는 인플레이스 필터 */}
      <div className="flex gap-2 overflow-x-auto px-4 pb-1 pt-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {(data?.categoryChips ?? []).map(chip => {
          const selected = chip.label === selectedCategory
          return (
            <button
              key={chip.key}
              type="button"
              onClick={() => setSelectedCategory(chip.label)}
              aria-pressed={selected}
              className={[
                'h-8 flex-none rounded-chip border px-3.5 text-body-sm transition-colors',
                selected
                  ? 'border-brand bg-brand font-semibold text-brand-on'
                  : 'border-border bg-surface-base text-text-secondary',
              ].join(' ')}
            >
              {chip.label}
            </button>
          )
        })}
      </div>

      {isError ? (
        // 로드 실패는 영구 스켈레톤이 아니라 재시도 가능한 에러로 구분한다.
        <div className="flex flex-col items-center px-6 py-16">
          <EmptyState
            title="홈을 불러오지 못했어요"
            description="네트워크 상태를 확인하고 다시 시도해 주세요."
            action={{ label: '다시 시도', onClick: () => void refetch() }}
          />
        </div>
      ) : isLoading || !data ? (
        <div className="flex flex-col gap-4 p-4">
          <Skeleton variant="rect" className="h-24 w-full rounded-card" />
          <Skeleton variant="rect" className="h-40 w-full rounded-card" />
        </div>
      ) : (
        <div className="flex flex-col gap-5 pt-4">
          {/* 프로모션 배너 */}
          <div className="px-4">
            <div className="flex items-center justify-between gap-3 rounded-card bg-surface-sunken p-4">
              <div>
                <StatusPill variant="accent" size="sm">
                  {data.promo.badge}
                </StatusPill>
                <p className="mt-2 whitespace-pre-line text-heading font-bold leading-snug text-text-primary">
                  {data.promo.title}
                </p>
                <p className="mt-1.5 text-caption text-text-brand">{data.promo.period}</p>
              </div>
              {/* 목업에 배너 이미지가 없어, 앱 전반의 placeholder 언어인 실루엣 SVG(브랜드 톤)로
                  채워 "깨진 이미지" 느낌을 없앤다 — 상품 카드/주문/리뷰 썸네일과 같은 계열. */}
              <img
                src={placeholderImage(137)}
                alt=""
                className="size-[76px] flex-none rounded-image object-cover"
              />
            </div>
          </div>

          {/* 추천 상품 캐러셀 — SALE 배너 아래, 인기 랭킹 위. 비개인화 큐레이션(AI/펫 이름 없음).
              두 펫 상태(등록/미등록) 모두에서 노출해 홈을 채운다. */}
          <RecommendedSection
            products={data.recommended}
            onSelect={goProduct}
            onWishToggle={toggleWishGated}
          />

          {/* 펫 미등록(1-B) 유도 CTA — 등록된 상태(1-A)면 표시하지 않는다 */}
          {data.pet == null && (
            <section className="px-4">
              <h2 className="mb-2.5 text-subheading font-semibold text-text-primary">
                우리 아이 정보를 등록해 보세요
              </h2>
              <div className="flex items-center gap-3.5 rounded-card border border-border-subtle bg-surface-raised p-4">
                <span className="flex size-12 flex-none items-center justify-center rounded-full bg-surface-sunken text-icon-muted">
                  <PawPrint className="size-6" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-label font-semibold text-text-primary">반려동물을 등록해 주세요</p>
                  <p className="mt-1 text-caption text-text-tertiary">
                    펫 프로필을 등록하고 우리 아이 정보를 관리해 보세요.
                  </p>
                </div>
                <Button size="sm" variant="secondary" onClick={() => navigate({ to: '/mypage' })}>
                  펫 등록
                </Button>
              </div>
            </section>
          )}

          {/* 인기 상품 랭킹 — 선택된 카테고리 칩으로 그 자리에서 좁힌다 */}
          <RankingSection
            ranking={filterRankingByCategory(data.ranking, selectedCategory)}
            selectedCategory={selectedCategory}
            onSelect={goProduct}
            onMore={goMarket}
          />
        </div>
      )}

      <LoginGate open={gateOpen} feature={gateFeature} onClose={closeGate} />
    </div>
  )
}

// 추천 상품 가로 캐러셀 — ProductGrid(2열 고정)는 못 쓰므로 ProductCard를 가로 스크롤 스트립으로
// 직접 배치한다. 각 카드 고정 폭(~152px). 하트는 상위에서 게이트로 감싼 onWishToggle을 받는다.
function RecommendedSection({
  products,
  onSelect,
  onWishToggle,
}: {
  products: CatalogProduct[]
  onSelect: (product: CatalogProduct) => void
  onWishToggle: (product: CatalogProduct) => void
}) {
  const wished = useWishedIds()

  if (products.length === 0) return null

  return (
    <section>
      <h2 className="mb-2.5 px-4 text-subheading font-semibold text-text-primary">
        이런 상품은 어때요?
      </h2>
      <div className="flex gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {products.map(product => (
          <div key={product.id} className="w-[152px] flex-none">
            <ProductCard
              image={product.thumbnailUrl ?? ''}
              storeName={product.storeName}
              name={product.name}
              price={product.price}
              originalPrice={product.originalPrice}
              isSold={product.isSoldOut}
              onClick={product.isSoldOut ? undefined : () => onSelect(product)}
              wished={wished.has(product.id)}
              onWishToggle={() => onWishToggle(product)}
            />
          </div>
        ))}
      </div>
    </section>
  )
}

// 홈 인기 상품은 상위 5위까지만 노출한다(캡틴 요청). 카테고리 칩으로 좁혀진 목록에도
// 동일하게 상위 5개만 보여준다 — filterRankingByCategory로 걸러진 뒤 여기서 slice한다.
const RANKING_LIMIT = 5

// 랭킹 행 상품명 하드 캡(글자수). 가장 넓은 폰 프레임(430px)에서도 한 줄에 들어가는 값이며,
// CSS truncate가 더 좁은 화면을 responsive하게 추가로 잘라준다(이건 결정적 상한).
const RANKING_NAME_MAX = 22

function RankingSection({
  ranking,
  selectedCategory,
  onSelect,
  onMore,
}: {
  ranking: HomeRankingItem[]
  selectedCategory: string
  onSelect: (product: CatalogProduct) => void
  onMore: () => void
}) {
  // 헤더에 선택 카테고리 반영. 라벨에 이미 '/'가 들어 있어 가운뎃점 대신 괄호 표기를 쓴다.
  const heading =
    selectedCategory === ALL_CATEGORY_LABEL
      ? '지금 인기 있는 상품'
      : `지금 인기 있는 상품 (${selectedCategory})`

  // 상위 5개만 — 순번(1..5)·divider가 이 잘린 목록 기준으로 자연스럽게 맞물린다.
  const visibleRanking = ranking.slice(0, RANKING_LIMIT)

  return (
    <section className="px-4">
      <div className="mb-2.5 flex items-center justify-between gap-3">
        <h2 className="min-w-0 truncate text-subheading font-semibold text-text-primary">{heading}</h2>
        <button
          type="button"
          onClick={onMore}
          className="flex flex-none items-center gap-0.5 text-caption font-medium text-text-brand"
        >
          마켓에서 더 보기
          <ChevronRight className="size-4" />
        </button>
      </div>
      {visibleRanking.length === 0 ? (
        <EmptyState
          title="이 카테고리 인기 상품이 아직 없어요"
          description="마켓에서 더 많은 상품을 만나보세요."
          action={{ label: '마켓에서 더 보기', onClick: onMore }}
        />
      ) : (
        <div className="flex flex-col">
          {visibleRanking.map((item, i) => (
            <RankingRow
              key={item.product.id}
              item={item}
              rank={i + 1}
              divider={i < visibleRanking.length - 1}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </section>
  )
}

function RankingRow({
  item,
  rank,
  divider,
  onSelect,
}: {
  item: HomeRankingItem
  // 필터된 목록 내 표시 순번(1..n). 카테고리로 좁히면 그 카테고리 안에서의 인기 순위가 된다.
  rank: number
  divider: boolean
  onSelect: (product: CatalogProduct) => void
}) {
  const { product } = item
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
      <div className="size-[52px] flex-none overflow-hidden rounded-image bg-surface-sunken">
        <img
          src={product.thumbnailUrl ?? ''}
          alt=""
          className={['size-full object-cover', sold ? 'opacity-50' : ''].join(' ')}
        />
      </div>
      {/* min-w-0 + truncate가 폭 기준 1줄 말줄임의 정석 가드(flex 자식이 콘텐츠 폭만큼
          커지는 걸 막아 순위/가격 열을 밀지 않게 함). 그 위에 글자수 하드 캡(truncateText)을
          더해 아주 긴 이름도 결정적으로 짧게 자른다 — 캡틴이 요청한 재사용 유틸의 실사용처. */}
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
