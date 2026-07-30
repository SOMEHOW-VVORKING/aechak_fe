import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Check, ChevronDown, SearchX, SlidersHorizontal, Star } from 'lucide-react'
import {
  BottomSheet,
  Button,
  Checkbox,
  MobileScreen,
  SearchInput,
  Skeleton,
} from '@aechak/design-system/web'
import { BackAppBar } from '@/shared/components/BackAppBar'
import { useSafeBack } from '@/shared/useSafeBack'
import { ProductGrid, type CatalogProduct } from '@/shared/catalog'
import { LoginGate, useLoginGate } from '@/shared/auth'
import { useSearchResults } from '../search.queries'
import {
  DEFAULT_FILTERS,
  RESULT_SORTS,
  activeFilterCount,
  buildSearchResults,
  type ResultSort,
  type SearchFilters,
} from '../search.mock'

interface PricePreset {
  label: string
  min: number
  max: number
}

const PRICE_PRESETS: PricePreset[] = [
  { label: '전체', min: DEFAULT_FILTERS.minPrice, max: DEFAULT_FILTERS.maxPrice },
  { label: '3만원 이하', min: 0, max: 30000 },
  { label: '3~6만원', min: 30000, max: 60000 },
  { label: '6만원 이상', min: 60000, max: DEFAULT_FILTERS.maxPrice },
]

const RATING_PRESETS: { label: string; value: number }[] = [
  { label: '전체', value: 0 },
  { label: '3.0↑', value: 3 },
  { label: '4.0↑', value: 4 },
  { label: '4.5↑', value: 4.5 },
]

// 검색 결과 + 필터(b3-st-3). full-bleed(탭바 없음). query는 라우트 검색 파라미터에서 받는다.
export function SearchResultsScreen({ query }: { query: string }) {
  const navigate = useNavigate()
  const { gateOpen, gateFeature, requireAuth, closeGate } = useLoginGate()
  const goBack = useSafeBack({ to: '/' })

  const [draftQuery, setDraftQuery] = useState(query)
  const [filters, setFilters] = useState<SearchFilters>(DEFAULT_FILTERS)
  const [sort, setSort] = useState<ResultSort>('recommend')
  const [filterOpen, setFilterOpen] = useState(false)
  const [priceOpen, setPriceOpen] = useState(false)
  const [sortOpen, setSortOpen] = useState(false)

  // 같은 라우트로 인페이지 재검색(무결과 화면의 추천어 탭 등) 시 검색창을 새 키워드로 동기화.
  useEffect(() => setDraftQuery(query), [query])

  const { data, isLoading, isError, refetch } = useSearchResults(query, filters, sort)

  const goProduct = (product: CatalogProduct) =>
    navigate({ to: '/products/$productId', params: { productId: product.id } })

  const research = (q: string) => {
    const trimmed = q.trim()
    if (!trimmed) return
    navigate({ to: '/search/results', search: { q: trimmed } })
  }

  const sortLabel = RESULT_SORTS.find(s => s.value === sort)?.label ?? '추천순'
  const filterCount = activeFilterCount(filters)
  const priceActive =
    filters.minPrice !== DEFAULT_FILTERS.minPrice || filters.maxPrice !== DEFAULT_FILTERS.maxPrice
  const activePricePreset = PRICE_PRESETS.find(
    p => p.min === filters.minPrice && p.max === filters.maxPrice,
  )
  // 선택된 가격대가 있으면 그 요약 라벨(예: '3~6만원')을, 없으면 기본 '가격'.
  const priceChipLabel = priceActive && activePricePreset ? activePricePreset.label : '가격'

  const patchFilters = (p: Partial<SearchFilters>) => setFilters(prev => ({ ...prev, ...p }))

  return (
    <MobileScreen
      header={
        <BackAppBar onBack={goBack}>
          <SearchInput
            value={draftQuery}
            onChange={setDraftQuery}
            onClear={() => navigate({ to: '/search' })}
            placeholder="상품, 브랜드 검색"
            onKeyDown={e => {
              if (e.key === 'Enter') research(draftQuery)
            }}
          />
        </BackAppBar>
      }
    >
      <div className="flex flex-col gap-3 py-3">
        {/* 필터바 — 상세 필터 버튼 + 인라인 퀵필터 칩(무료배송 토글/가격/별점 4↑) */}
        <div className="flex items-center gap-2 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <button
            type="button"
            onClick={() => setFilterOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={filterOpen}
            className={[
              'inline-flex h-9 flex-none items-center gap-1.5 rounded-chip border px-3.5 text-body-sm transition-colors',
              filterCount > 0
                ? 'border-brand-border bg-brand-subtle text-brand'
                : 'border-border bg-surface-base text-text-secondary',
            ].join(' ')}
          >
            <SlidersHorizontal className="size-4" />
            필터
            {filterCount > 0 && <span className="font-semibold text-brand">{filterCount}</span>}
          </button>
          {/* 품절 제외는 기본 ON(활성)이라, 스크롤해야 보이는 맨 끝이 아니라 필터 버튼 바로 뒤에 둬
              기본 활성 상태가 처음부터 보이게 한다(폭이 430px를 넘으면 뒤쪽 별점 칩이 대신 스크롤됨). */}
          <FilterChipButton
            selected={filters.excludeSoldOut}
            onClick={() => patchFilters({ excludeSoldOut: !filters.excludeSoldOut })}
          >
            품절 제외
            {filters.excludeSoldOut && <Check className="size-3.5" />}
          </FilterChipButton>
          <FilterChipButton
            selected={filters.freeShippingOnly}
            onClick={() => patchFilters({ freeShippingOnly: !filters.freeShippingOnly })}
          >
            무료배송
            {filters.freeShippingOnly && <Check className="size-3.5" />}
          </FilterChipButton>
          {/* 가격은 즉시 토글이 아니라 가격대 전용 시트를 연다(무료배송/별점과 달리 선택지가 여러 개라서). */}
          <FilterChipButton selected={priceActive} expanded={priceOpen} onClick={() => setPriceOpen(true)}>
            {priceChipLabel}
            <ChevronDown className="size-3.5" />
          </FilterChipButton>
          <FilterChipButton
            selected={filters.minRating >= 4}
            onClick={() => patchFilters({ minRating: filters.minRating >= 4 ? 0 : 4 })}
          >
            별점 4↑
          </FilterChipButton>
        </div>

        {/* 결과 헤더 */}
        <div className="flex items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <span className="text-caption text-text-tertiary">
              <span className="font-semibold text-text-secondary">{(data?.total ?? 0).toLocaleString('ko-KR')}</span>개
            </span>
          </div>
          <button
            type="button"
            onClick={() => setSortOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={sortOpen}
            className="inline-flex items-center gap-1 text-body-sm text-text-secondary"
          >
            {sortLabel}
            <ChevronDown className="size-4 text-icon-muted" />
          </button>
        </div>

        {/* 결과 그리드 / 빈 상태 */}
        <div className="px-4">
          {isError ? (
            // 검색 오류는 빈 결과가 아니라 재시도 가능한 실패로 구분한다(codex UI/UX #4).
            <div className="flex flex-col items-center gap-4 py-16 text-center">
              <div className="flex size-12 items-center justify-center rounded-full bg-surface-sunken text-icon-muted">
                <SearchX className="size-7" />
              </div>
              <div className="space-y-1">
                <p className="text-body font-medium text-text-primary">검색 결과를 불러오지 못했어요</p>
                <p className="text-body-sm text-text-tertiary">네트워크 상태를 확인하고 다시 시도해 주세요.</p>
              </div>
              <Button variant="secondary" size="md" onClick={() => void refetch()}>
                다시 시도
              </Button>
            </div>
          ) : isLoading || !data ? (
            <div className="grid grid-cols-2 gap-x-3 gap-y-5">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex flex-col gap-2">
                  <Skeleton variant="rect" className="aspect-square w-full rounded-image" />
                  <Skeleton variant="text" className="h-4 w-3/4" />
                </div>
              ))}
            </div>
          ) : data.products.length === 0 ? (
            <div className="flex flex-col gap-6 pt-4">
              {/* 카피 관례상 직접 인용부호 금지 — 검색어는 따옴표 대신 브랜드색 강조로 세팅오프한다.
                  DS EmptyState.title은 string이라 마크업을 못 넣어, 그 레이아웃만 그대로 미러링. */}
              <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
                <div className="flex size-12 items-center justify-center rounded-full bg-surface-sunken text-icon-muted">
                  <SearchX className="size-7" />
                </div>
                <div className="space-y-1">
                  <p className="text-body font-medium text-text-primary">
                    <span className="font-semibold text-brand">{query}</span> 검색 결과가 없어요
                  </p>
                  <p className="text-body-sm text-text-tertiary">
                    검색어의 철자를 확인하거나 더 일반적인 단어로 다시 검색해 보세요.
                  </p>
                </div>
              </div>
              <div className="flex flex-col gap-2.5">
                <span className="text-label font-semibold text-text-secondary">이런 검색어는 어때요?</span>
                <div className="flex flex-wrap gap-2">
                  {data.suggestions.map(keyword => (
                    <button
                      key={keyword}
                      type="button"
                      onClick={() => research(keyword)}
                      className="inline-flex h-8 items-center rounded-chip bg-surface-sunken px-3.5 text-body-sm text-text-secondary"
                    >
                      {keyword}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <ProductGrid
              products={data.products}
              onSelect={goProduct}
              wishGuard={proceed => requireAuth('wish', proceed)}
              renderExtra={product =>
                product.rating != null ? (
                  <div className="mt-1 flex items-center gap-1 text-text-tertiary">
                    <Star className="size-3 flex-none text-warning" fill="currentColor" />
                    <span className="text-caption">
                      {product.rating.toFixed(1)} ({(product.reviewCount ?? 0).toLocaleString('ko-KR')})
                    </span>
                  </div>
                ) : null
              }
            />
          )}
        </div>
      </div>

      <FilterSheet
        open={filterOpen}
        query={query}
        sort={sort}
        initial={filters}
        onClose={() => setFilterOpen(false)}
        onApply={next => {
          setFilters(next)
          setFilterOpen(false)
        }}
      />

      <BottomSheet open={sortOpen} onClose={() => setSortOpen(false)} title="정렬">
        <div className="flex flex-col">
          {RESULT_SORTS.map(option => {
            const selected = option.value === sort
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  setSort(option.value)
                  setSortOpen(false)
                }}
                className={[
                  'flex h-12 items-center justify-between text-body',
                  selected ? 'font-semibold text-brand' : 'text-text-primary',
                ].join(' ')}
              >
                {option.label}
                {selected && <Check className="size-4 text-brand" />}
              </button>
            )
          })}
        </div>
      </BottomSheet>

      {/* 가격대 전용 시트 — 가격 칩에서 열림(정렬 시트와 동일하게 선택 즉시 적용 후 닫힘). */}
      <BottomSheet open={priceOpen} onClose={() => setPriceOpen(false)} title="가격대">
        <div className="flex flex-col">
          {PRICE_PRESETS.map(preset => {
            const selected = preset.min === filters.minPrice && preset.max === filters.maxPrice
            return (
              <button
                key={preset.label}
                type="button"
                onClick={() => {
                  patchFilters({ minPrice: preset.min, maxPrice: preset.max })
                  setPriceOpen(false)
                }}
                className={[
                  'flex h-12 items-center justify-between text-body',
                  selected ? 'font-semibold text-brand' : 'text-text-primary',
                ].join(' ')}
              >
                {preset.label}
                {selected && <Check className="size-4 text-brand" />}
              </button>
            )
          })}
        </div>
      </BottomSheet>

      <LoginGate open={gateOpen} feature={gateFeature} onClose={closeGate} />
    </MobileScreen>
  )
}

function FilterSheet({
  open,
  query,
  sort,
  initial,
  onClose,
  onApply,
}: {
  open: boolean
  query: string
  sort: ResultSort
  initial: SearchFilters
  onClose: () => void
  onApply: (filters: SearchFilters) => void
}) {
  const [draft, setDraft] = useState<SearchFilters>(initial)

  // 시트를 열 때마다 현재 적용값으로 draft 동기화.
  const [syncKey, setSyncKey] = useState(false)
  if (open !== syncKey) {
    setSyncKey(open)
    if (open) setDraft(initial)
  }

  const previewCount = buildSearchResults(query, draft, sort).total

  const patch = (p: Partial<SearchFilters>) => setDraft(prev => ({ ...prev, ...p }))
  const activePricePreset = PRICE_PRESETS.find(p => p.min === draft.minPrice && p.max === draft.maxPrice)

  return (
    <BottomSheet open={open} onClose={onClose} title="필터">
      <div className="flex flex-col gap-5">
        {/* 가격대 */}
        <section className="flex flex-col gap-2.5">
          <span className="text-label font-semibold text-text-primary">가격대</span>
          <div className="flex flex-wrap gap-2">
            {PRICE_PRESETS.map(preset => {
              const selected = activePricePreset?.label === preset.label
              return (
                <FilterChipButton
                  key={preset.label}
                  selected={selected}
                  onClick={() => patch({ minPrice: preset.min, maxPrice: preset.max })}
                >
                  {preset.label}
                </FilterChipButton>
              )
            })}
          </div>
        </section>

        <div className="h-px bg-border-subtle" />

        {/* 무료배송 / 품절 제외 */}
        <div className="flex flex-col gap-3">
          <Checkbox
            checked={draft.freeShippingOnly}
            onChange={v => patch({ freeShippingOnly: v })}
            label="무료배송만 보기"
          />
          <Checkbox
            checked={draft.excludeSoldOut}
            onChange={v => patch({ excludeSoldOut: v })}
            label="품절 상품 제외"
          />
        </div>

        <div className="h-px bg-border-subtle" />

        {/* 최소 평점 */}
        <section className="flex flex-col gap-2.5">
          <span className="text-label font-semibold text-text-primary">최소 평점</span>
          <div className="flex flex-wrap gap-2">
            {RATING_PRESETS.map(preset => (
              <FilterChipButton
                key={preset.label}
                selected={draft.minRating === preset.value}
                onClick={() => patch({ minRating: preset.value })}
              >
                {preset.label}
              </FilterChipButton>
            ))}
          </div>
        </section>

        <div className="flex gap-2.5 pt-1">
          <Button variant="secondary" onClick={() => setDraft(DEFAULT_FILTERS)} className="flex-1">
            초기화
          </Button>
          <Button onClick={() => onApply(draft)} className="flex-[1.6]">
            결과 {previewCount.toLocaleString('ko-KR')}개 보기
          </Button>
        </div>
      </div>
    </BottomSheet>
  )
}

function FilterChipButton({
  selected,
  onClick,
  children,
  expanded,
}: {
  selected: boolean
  onClick: () => void
  children: ReactNode
  /** 시트를 여는 칩이면 열림 상태를 준다 — 토글 칩은 aria-pressed만, 시트 칩은 haspopup/expanded까지. */
  expanded?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      aria-haspopup={expanded === undefined ? undefined : 'dialog'}
      aria-expanded={expanded}
      className={[
        'inline-flex h-9 flex-none items-center gap-1 rounded-chip border px-3.5 text-body-sm transition-colors',
        selected
          ? 'border-brand-border bg-brand-subtle font-semibold text-brand'
          : 'border-border bg-surface-base text-text-secondary',
      ].join(' ')}
    >
      {children}
    </button>
  )
}
