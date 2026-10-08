import { useEffect, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import {
  Bone,
  Car,
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
import type { CategoryResponse } from '@aechak/api'
import { Button, EmptyState, SegmentedControl, Skeleton } from '@aechak/design-system/web'
import { MarketAppBar } from '@/shared/components/MarketAppBar'
import { useCartCount } from '@/shared/cart'
import { LoginGate, useIsLoggedIn, useLoginGate } from '@/shared/auth'
import { CATALOG_SORTS, ProductGrid, type CatalogProduct, type CatalogSort } from '@/shared/catalog'
import { useCategoryTree, useProductList } from '../catalog.queries'

// 중분류 아이콘 — 서버 카테고리명 기준. 매칭 없으면 PawPrint 폴백(실 taxonomy 명이 이 맵과 다를 수
// 있으므로 안전망). 서버 iconUrl은 S3 key라 <img>로 못 써 lucide를 유지한다.
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

// 트리에서 이름이 같은 노드의 경로(대>중>소 id)를 depth 무관 재귀로 찾는다(기존엔 depth 2까지만 봐
// depth-3 라벨을 놓쳤다). 첫 DFS 매치를 반환한다(라벨 중복은 categoryId를
// URL에 싣는 후속 작업에서 해소 — 이번 배치 범위 밖).
function findCategoryPath(nodes: CategoryResponse[], label: string): number[] | null {
  for (const node of nodes) {
    if (node.name === label) return [node.categoryId]
    const childPath = findCategoryPath(node.children, label)
    if (childPath) return [node.categoryId, ...childPath]
  }
  return null
}

// id로 카테고리명을 depth 무관 재귀로 찾는다 — 선택이 depth-3 리프라 중분류 타일과 매칭되지 않아도
// 활성 필터 이름을 pill로 보여주기 위함.
function findCategoryName(nodes: CategoryResponse[], id: number): string | null {
  for (const node of nodes) {
    if (node.categoryId === id) return node.name
    const childName = findCategoryName(node.children, id)
    if (childName) return childName
  }
  return null
}

// 카테고리 탐색(b3-st-1). _tabs 레이아웃 안(스크롤 영역)에 렌더되므로 MobileScreen을 다시 씌우지 않는다.
// 카테고리 트리 + 상품 목록을 실 API(GET /categories, GET /products)로 구동한다.
// initialSubCategory: 홈 칩/breadcrumb의 ?category=<라벨>로 진입 시, 트리에서 이름이 같은 노드를
// 찾아 초기 선택을 세팅한다(못 찾으면 전체 — 홈/검색이 아직 목업이라 이름이 안 맞을 수 있다).
export function CatalogScreen({ initialSubCategory }: { initialSubCategory?: string } = {}) {
  const navigate = useNavigate()
  const cartCount = useCartCount()
  const isLoggedIn = useIsLoggedIn()
  const { gateOpen, gateFeature, requireAuth, closeGate } = useLoginGate()

  const [selectedMainId, setSelectedMainId] = useState<number | null>(null)
  const [selectedSubId, setSelectedSubId] = useState<number | null>(null)
  const [sort, setSort] = useState<CatalogSort>('latest')
  const [categoryOpen, setCategoryOpen] = useState(false)

  // /categories는 인증 필요라 로그아웃 상태면 트리 요청을 막는다(비회원 트랩 방지). 이때 대분류는
  // 전체만 남고 상품 목록(permitAll)은 그대로 뜬다.
  const tree = useCategoryTree(isLoggedIn)
  const mains = tree.data ?? []
  const activeMain = mains.find(m => m.categoryId === selectedMainId)
  const subs = activeMain?.children ?? []

  const categoryId = selectedSubId ?? selectedMainId ?? undefined
  const list = useProductList({ category: categoryId, sort })
  const products = list.data?.products ?? []
  const totalCount = list.data?.totalCount ?? products.length

  // ?category=<라벨> 반영. 트리 로드 후 이름이 같은 노드를 depth 무관 재귀로 찾아 대분류+중분류를
  // 선택한다. 마지막 적용 라벨을 ref로 기억해, 같은 마운트에서 URL category가 바뀌면 다시 반영하고
  // 사용자가 수동 선택한 뒤 같은 라벨로는 덮지 않는다.
  const lastAppliedLabel = useRef<string | undefined>(undefined)
  useEffect(() => {
    // URL category가 비면 마지막 적용 라벨을 리셋해 A -> 없음 -> A 재진입 시 다시 반영되게 한다.
    if (!initialSubCategory) {
      lastAppliedLabel.current = undefined
      return
    }
    if (initialSubCategory === lastAppliedLabel.current) return
    const data = tree.data
    if (!data) return
    const path = findCategoryPath(data, initialSubCategory)
    lastAppliedLabel.current = initialSubCategory
    if (!path) return
    // path[0]=대분류, 마지막=매치 노드. 매치 노드 id로 필터해 정확히 그 카테고리(+하위)만 거른다 —
    // depth-3 리프 딥링크가 depth-2 형제 상품까지 끌어오지 않게 한다.
    setSelectedMainId(path[0] ?? null)
    setSelectedSubId(path.length >= 2 ? (path[path.length - 1] ?? null) : null)
    setCategoryOpen(true)
  }, [initialSubCategory, tree.data])

  const goProduct = (product: CatalogProduct) =>
    navigate({ to: '/products/$productId', params: { productId: product.id } })

  const selectMain = (id: number | null) => {
    setSelectedMainId(id)
    setSelectedSubId(null)
    setCategoryOpen(id != null)
  }

  // 선택 카테고리명은 트리에서 id로 조회한다(중분류 타일에 없는 depth-3 리프도 이름을 보여주려고).
  const selectedCategoryName = selectedSubId != null ? findCategoryName(mains, selectedSubId) : null
  const collapsedLabel = activeMain ? (selectedCategoryName ?? activeMain.name) : null

  return (
    <div className="flex flex-col pb-6">
      <MarketAppBar
        title="마켓"
        onSearch={() => navigate({ to: '/search' })}
        onCart={() => navigate({ to: '/cart' })}
        cartCount={cartCount}
        hasNotification
      />

      {/* 대분류 칩 — [전체] + 트리 depth-1. 트리 로딩 중엔 칩 스켈레톤을 보여 "카테고리 없음"과 구분한다.
          트리 실패 시엔 전체만 남고 상품 목록은 독립적으로 그대로 뜬다. */}
      <div className="flex gap-2 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <MainChip label="전체" selected={selectedMainId === null} onClick={() => selectMain(null)} />
        {tree.isLoading
          ? Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} variant="rect" className="h-9 w-16 flex-none rounded-chip" />
            ))
          : mains.map(main => (
              <MainChip
                key={main.categoryId}
                label={main.name}
                selected={main.categoryId === selectedMainId}
                onClick={() => selectMain(main.categoryId)}
              />
            ))}
      </div>

      {/* 중분류 아이콘 그리드 — 대분류 선택 시에만, 접기/펼치기 토글 */}
      {activeMain && subs.length > 0 && (
        <div className="border-y border-border-subtle">
          <button
            type="button"
            onClick={() => setCategoryOpen(open => !open)}
            aria-expanded={categoryOpen}
            className="flex w-full items-center justify-between px-4 py-2.5 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-border"
          >
            <span className="flex items-center gap-2 text-body-sm text-text-secondary">
              카테고리
              {!categoryOpen && collapsedLabel && (
                <span className="rounded-chip bg-brand-subtle px-2 py-0.5 text-caption font-semibold text-brand">
                  {collapsedLabel}
                </span>
              )}
            </span>
            <ChevronDown
              aria-hidden
              className={['size-5 text-icon-muted transition-transform', categoryOpen ? 'rotate-180' : ''].join(' ')}
            />
          </button>
          {categoryOpen && (
            <div className="grid grid-cols-5 gap-y-3 px-2 pb-3">
              <SubTile label="전체" selected={selectedSubId === null} onClick={() => setSelectedSubId(null)} />
              {subs.map(sub => (
                <SubTile
                  key={sub.categoryId}
                  label={sub.name}
                  selected={sub.categoryId === selectedSubId}
                  onClick={() => setSelectedSubId(sub.categoryId)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* 정렬 — full-width로 두 칩이 균등 분배 */}
      <div className="px-4 pt-3">
        <SegmentedControl
          className="w-full"
          options={CATALOG_SORTS}
          value={sort}
          onChange={value => setSort(value as CatalogSort)}
        />
      </div>

      {/* 결과 헤더 — 로드된 데이터가 있을 때만 카운트 표시(첫 로딩/첫 페이지 에러 중 "0개" 모순 방지).
          다음 페이지 실패로 list.isError가 참이 돼도 이미 로드된 그리드가 있으면 카운트를 유지한다. */}
      {list.data != null && (
        <div className="px-4 pb-3 pt-3.5">
          <p className="text-caption text-text-tertiary">
            <span className="font-semibold text-text-secondary">{totalCount}</span>개
          </p>
        </div>
      )}

      <div className="px-4">
        {list.isLoading ? (
          <div className="grid grid-cols-2 gap-x-3 gap-y-5">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex flex-col gap-2">
                <Skeleton variant="rect" className="aspect-square w-full rounded-image" />
                <Skeleton variant="text" className="h-3 w-1/2" />
                <Skeleton variant="text" className="h-4 w-3/4" />
              </div>
            ))}
          </div>
        ) : list.isError && products.length === 0 ? (
          // 첫 페이지 실패만 전체 에러로 — 이미 로드된 상품이 있으면(다음 페이지 실패) 그리드를 지우지
          // 않는다. 서버/네트워크 오류를 "상품 없음"과 구분한다.
          <EmptyState
            title="상품을 불러오지 못했어요"
            description="네트워크 상태를 확인하고 다시 시도해 주세요."
            action={{ label: '다시 시도', onClick: () => void list.refetch() }}
          />
        ) : products.length === 0 ? (
          <EmptyState
            title="상품이 없어요"
            description="다른 카테고리를 선택해 보세요."
            action={{
              label: '전체 보기',
              onClick: () => {
                setSelectedMainId(null)
                setSelectedSubId(null)
              },
            }}
          />
        ) : (
          <>
            <ProductGrid
              products={products}
              onSelect={goProduct}
              wishGuard={proceed => requireAuth('wish', proceed)}
            />
            {list.hasNextPage && (
              <div className="pt-5">
                <Button
                  variant="secondary"
                  fullWidth
                  loading={list.isFetchingNextPage}
                  onClick={() => list.fetchNextPage()}
                >
                  더보기
                </Button>
                {list.isFetchNextPageError && (
                  <p className="mt-2 text-center text-caption text-error-fg">
                    더 불러오지 못했어요. 다시 눌러 주세요.
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </div>

      <LoginGate open={gateOpen} feature={gateFeature} onClose={closeGate} />
    </div>
  )
}

function MainChip({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={[
        'h-9 flex-none rounded-chip border px-4 text-body-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brand-border',
        selected
          ? 'border-brand bg-brand font-semibold text-brand-on'
          : 'border-border bg-surface-base text-text-secondary',
      ].join(' ')}
    >
      {label}
    </button>
  )
}

function SubTile({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  const Icon = SUBCAT_ICONS[label] ?? PawPrint
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className="flex flex-col items-center gap-1.5 rounded-lg px-1 py-1 outline-none focus-visible:ring-2 focus-visible:ring-brand-border"
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
        {label}
      </span>
    </button>
  )
}
