import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import {
  Bone,
  Car,
  Check,
  ChevronDown,
  Footprints,
  GraduationCap,
  House,
  LayoutGrid,
  PawPrint,
  Pill,
  Scissors,
  Shirt,
  ToyBrick,
  Utensils,
  type LucideIcon,
} from 'lucide-react'
import { EmptyState, SegmentedControl, Skeleton } from '@aechak/design-system/web'
import { MarketAppBar } from '@/shared/components/MarketAppBar'
import { useCartCount } from '@/shared/cart'
import { LoginGate, useLoginGate } from '@/shared/auth'
import {
  CATALOG_SORTS,
  MAIN_CATEGORIES,
  ProductGrid,
  SUB_CATEGORIES,
  mainCategoryLabel,
  type CatalogProduct,
  type CatalogSort,
  type MainCategory,
} from '@/shared/catalog'
import { useCatalog } from '../catalog.queries'

// '브랜드관'은 브랜드 큐레이션 데이터가 없어 눌러도 '전체'와 동일한 전 상품만 보여주던
// 죽은 탭이라 마켓 대분류 탭에서 제외한다. shared의 MAIN_CATEGORIES/MainCategory 정의는
// 다른 소비처(상품 breadcrumb 등) 호환을 위해 그대로 두고 여기서만 걸러낸다.
const MARKET_MAIN_CATEGORIES = MAIN_CATEGORIES.filter(cat => cat.value !== 'brand')

// 중분류별 구분 아이콘(전부 동일 PawPrint였던 것 교체). 매핑 없으면 PawPrint로 폴백.
const SUBCAT_ICONS: Record<string, LucideIcon> = {
  전체: LayoutGrid,
  '사료/간식': Bone,
  장난감: ToyBrick,
  '의류/악세서리': Shirt,
  '위생/미용': Scissors,
  '침구/하우스': House,
  '건강/영양제': Pill,
  산책용품: Footprints,
  '식기/급수기': Utensils,
  '이동장/유모차': Car,
  '훈련/행동': GraduationCap,
}

// 카테고리 탐색(b3-st-1). _tabs 레이아웃 안(스크롤 영역)에 렌더되므로 MobileScreen을 다시 씌우지 않는다.
// initialSubCategory: 홈 카테고리 칩 바로가기(?category=)로 진입 시 해당 중분류를 초기 선택한다.
export function CatalogScreen({ initialSubCategory }: { initialSubCategory?: string } = {}) {
  const navigate = useNavigate()
  const cartCount = useCartCount()
  const { gateOpen, gateFeature, requireAuth, closeGate } = useLoginGate()
  const [mainCategory, setMainCategory] = useState<MainCategory>('all')
  const [subCategory, setSubCategory] = useState<string>(() =>
    initialSubCategory && SUB_CATEGORIES.includes(initialSubCategory) ? initialSubCategory : '전체',
  )
  const [sort, setSort] = useState<CatalogSort>('popular')
  // 중분류 아이콘 그리드 접기/펼치기. 기본은 닫힘(캡틴 지시 — 첫 진입 시 상단을 덜 차지)
  // — 접힘 상태에서도 선택된 중분류 pill과 펼치기 토글은 그대로 동작한다.
  const [categoryOpen, setCategoryOpen] = useState(false)
  // 품절 제외 토글. 검색 결과 화면(DEFAULT_FILTERS)과 동일하게 기본 on.
  const [excludeSoldOut, setExcludeSoldOut] = useState(true)

  const { data, isLoading } = useCatalog({ mainCategory, subCategory, sort, excludeSoldOut })

  const goProduct = (product: CatalogProduct) =>
    navigate({ to: '/products/$productId', params: { productId: product.id } })

  const headerLabel = buildHeaderLabel(mainCategory, subCategory)

  return (
    <div className="flex flex-col pb-6">
      <div className="sticky top-0 z-10 bg-surface-base">
        <MarketAppBar
          title="마켓"
          onSearch={() => navigate({ to: '/search' })}
          onCart={() => navigate({ to: '/cart' })}
          cartCount={cartCount}
          hasNotification
        />
      </div>

      {/* 대분류 칩 */}
      <div className="flex gap-2 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {MARKET_MAIN_CATEGORIES.map(cat => {
          const selected = cat.value === mainCategory
          return (
            <button
              key={cat.value}
              type="button"
              onClick={() => setMainCategory(cat.value)}
              aria-pressed={selected}
              className={[
                'h-9 flex-none rounded-chip border px-4 text-body-sm transition-colors',
                selected
                  ? 'border-brand bg-brand font-semibold text-brand-on'
                  : 'border-border bg-surface-base text-text-secondary',
              ].join(' ')}
            >
              {cat.label}
            </button>
          )
        })}
      </div>

      {/* 중분류 아이콘 그리드 — 접기/펼치기 토글 */}
      <div className="border-y border-border-subtle">
        <button
          type="button"
          onClick={() => setCategoryOpen(open => !open)}
          aria-expanded={categoryOpen}
          className="flex w-full items-center justify-between px-4 py-2.5"
        >
          <span className="flex items-center gap-2 text-body-sm text-text-secondary">
            카테고리
            {!categoryOpen && subCategory !== '전체' && (
              <span className="rounded-chip bg-brand-subtle px-2 py-0.5 text-caption font-semibold text-brand">
                {subCategory}
              </span>
            )}
          </span>
          <ChevronDown
            aria-hidden
            className={[
              'size-5 text-icon-muted transition-transform',
              categoryOpen ? 'rotate-180' : '',
            ].join(' ')}
          />
        </button>
        {categoryOpen && (
          <div className="grid grid-cols-5 gap-y-3 px-2 pb-3">
            {SUB_CATEGORIES.map(sub => {
              const selected = sub === subCategory
              const Icon = SUBCAT_ICONS[sub] ?? PawPrint
              return (
                <button
                  key={sub}
                  type="button"
                  onClick={() => setSubCategory(sub)}
                  aria-pressed={selected}
                  className="flex flex-col items-center gap-1.5 px-1"
                >
                  <span
                    className={[
                      'flex size-12 items-center justify-center rounded-full border transition-colors',
                      selected
                        ? 'border-brand-border bg-brand-subtle text-brand'
                        : 'border-border-subtle bg-surface-sunken text-icon-muted',
                    ].join(' ')}
                  >
                    <Icon className="size-6" />
                  </span>
                  <span
                    className={[
                      'text-center text-[11px] leading-tight',
                      selected ? 'font-semibold text-text-primary' : 'text-text-secondary',
                    ].join(' ')}
                  >
                    {sub}
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* 정렬 — full-width로 세 칩이 균등 분배돼 라벨이 한 줄로 나온다 */}
      <div className="px-4 pt-3">
        <SegmentedControl
          className="w-full"
          options={CATALOG_SORTS}
          value={sort}
          onChange={value => setSort(value as CatalogSort)}
        />
      </div>

      {/* 결과 헤더 + 그리드 — 품절 제외는 실제로 목록을 거르는 토글 */}
      <div className="flex items-center justify-between px-4 pb-3 pt-3.5">
        <p className="text-caption text-text-tertiary">
          {headerLabel} <span className="font-semibold text-text-secondary">{data?.total ?? 0}</span>개
        </p>
        <button
          type="button"
          onClick={() => setExcludeSoldOut(v => !v)}
          aria-pressed={excludeSoldOut}
          className={[
            'inline-flex h-8 flex-none items-center gap-1 rounded-chip border px-3 text-body-sm transition-colors',
            excludeSoldOut
              ? 'border-brand-border bg-brand-subtle font-semibold text-brand'
              : 'border-border bg-surface-base text-text-secondary',
          ].join(' ')}
        >
          {excludeSoldOut && <Check className="size-3.5" />}
          품절 제외
        </button>
      </div>

      <div className="px-4">
        {isLoading || !data ? (
          <div className="grid grid-cols-2 gap-x-3 gap-y-5">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex flex-col gap-2">
                <Skeleton variant="rect" className="aspect-square w-full rounded-image" />
                <Skeleton variant="text" className="h-3 w-1/2" />
                <Skeleton variant="text" className="h-4 w-3/4" />
              </div>
            ))}
          </div>
        ) : data.products.length === 0 ? (
          <EmptyState
            title="상품이 없어요"
            description="다른 카테고리를 선택해 보세요."
            action={{
              label: '전체 보기',
              onClick: () => {
                setMainCategory('all')
                setSubCategory('전체')
              },
            }}
          />
        ) : (
          <ProductGrid
            products={data.products}
            onSelect={goProduct}
            wishGuard={proceed => requireAuth('wish', proceed)}
          />
        )}
      </div>

      <LoginGate open={gateOpen} feature={gateFeature} onClose={closeGate} />
    </div>
  )
}

function buildHeaderLabel(mainCategory: MainCategory, subCategory: string): string {
  const parts: string[] = []
  if (mainCategory !== 'all') parts.push(mainCategoryLabel(mainCategory))
  if (subCategory !== '전체') parts.push(subCategory)
  return parts.length > 0 ? parts.join(' / ') : '전체'
}
