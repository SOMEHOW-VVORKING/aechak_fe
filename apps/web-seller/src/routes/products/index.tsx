import { useEffect, useMemo, useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Image as ImageIcon, Pencil, Plus } from 'lucide-react'
import {
  Alert,
  Button,
  DataTable,
  DatePicker,
  FilterBar,
  Modal,
  PageHeader,
  SearchInput,
  Select,
  StatusPill,
  Toast,
  Toggle,
  type Column,
  type StatusPillVariant,
} from '@aechak/design-system/web'
import {
  INSPECTION_STATUS_LABEL,
  InventoryDrawer,
  KEYWORD_MAX,
  SALE_STATUS_LABEL,
  productErrorMessage,
  productImageUrl,
  useChangeSaleStatus,
  useProductCategories,
  useProducts,
  type CategoryNode,
  type SellerProductSearchInput,
  type SellerProductSort,
  type SellerProductStockFilter,
  type SellerProductSummary,
  type WireInspectionStatus,
  type WireSaleStatus,
} from '@/features/products'

// BE에 없는 기능의 진입점은 이 화면에서 뺐다 — 자세한 사정은 각 자리의 주석에 적었다.
// · 상품 수정: 셀러 단건 조회(GET /sellers/me/products/{productId})가 없어 프리필이 불가능하고,
//   PUT은 이미지 목록을 통째로 교체하므로 부족한 프리필로 보내면 기존 이미지·할인 설정을 잃는다.
// · 임시저장: BE에 개념 자체가 없다(ProductDraft grep 0건). 구현과 테스트는 목업에 남겼다.
// · 삭제: BE에 DELETE가 없고 판매 중지가 노출 제어를 담당한다 — 코드째 지웠다.

export interface ProductsSearch {
  saved?: 'created' | 'updated'
}

export const Route = createFileRoute('/products/')({
  validateSearch: (search: Record<string, unknown>): ProductsSearch =>
    search['saved'] === 'created' || search['saved'] === 'updated' ? { saved: search['saved'] } : {},
  component: ProductsRoute,
})

// AGENTS 4절(디자인 시스템): `danger`는 되돌리기 어려운 제재 전용이고 `muted`는 비활성/휴면 전용이다. 판매 중지는
// 토글 한 번으로 되돌아오는 부정적 결과라 `error`, 품절은 재고를 채우면 풀리는 경고라 `warning`,
// 영구 상태인 판매종료만 `muted`로 둔다(품절과 판매종료가 라벨 말고도 구별된다).
const SALE_STATUS_VARIANT: Record<WireSaleStatus, StatusPillVariant> = {
  ON_SALE: 'success',
  OUT_OF_STOCK: 'warning',
  SUSPENDED: 'error',
  ENDED: 'muted',
}

const INSPECTION_STATUS_VARIANT: Record<WireInspectionStatus, StatusPillVariant> = {
  DRAFT: 'neutral',
  PENDING: 'neutral',
  APPROVED: 'brand',
  REJECTED: 'error',
}

// 미선택 라벨에 필터 이름을 붙인다 — DS Select에는 시각 라벨 슬롯이 없고 aria-label은 눈에
// 보이지 않아서, '전체'로만 두면 필터 다섯 개가 같은 글자만 내보여 어느 자리가 무엇인지 알 수
// 없다(web-admin 심사 목록의 '전체 상태' 선례와 같은 결).
const withAll = (allLabel: string, labels: Record<string, string>) => [
  { value: '', label: allLabel },
  ...Object.entries(labels).map(([value, label]) => ({ value, label })),
]
const SALE_STATUS_OPTIONS = withAll('전체 판매 상태', SALE_STATUS_LABEL)
const INSPECTION_STATUS_OPTIONS = withAll('전체 검수 상태', INSPECTION_STATUS_LABEL)
const SORT_OPTIONS: { value: SellerProductSort; label: string }[] = [
  { value: 'latest', label: '최신순' },
  { value: 'price_asc', label: '가격 낮은순' },
  { value: 'price_desc', label: '가격 높은순' },
]
// BE는 "재고가 남은 활성 조합의 존재 여부"로 가른다 — 재고 10이어도 조합이 전부 비활성이면 품절이다.
const STOCK_OPTIONS: { value: SellerProductStockFilter | ''; label: string }[] = [
  { value: '', label: '전체 재고' },
  { value: 'in_stock', label: '재고 있음' },
  { value: 'sold_out', label: '품절' },
]

// BE category 파라미터는 어느 깊이든 받고 하위 카테고리 상품까지 포함한다.
const flattenCategories = (nodes: CategoryNode[], prefix = ''): { value: string; label: string }[] =>
  nodes.flatMap(n => {
    const label = prefix ? `${prefix} > ${n.name}` : n.name
    return [{ value: String(n.categoryId), label }, ...flattenCategories(n.children, label)]
  })

const SAVED_MESSAGE = { created: '상품을 등록했어요.', updated: '상품을 수정했어요.' } as const

// 되돌릴 수 있는 전환이라 confirmVariant는 primary다.
const SUSPEND_CONFIRM = {
  title: '판매를 중지할까요?',
  description: '구매자 검색과 목록에서 바로 숨겨져요. 이미 받은 주문은 그대로 처리되고 언제든 다시 판매할 수 있어요.',
  confirmLabel: '판매 중지',
} as const

interface ToastState {
  message: string
  variant: 'success' | 'error'
}

interface Filters {
  keyword: string
  category: string
  saleStatus: WireSaleStatus | ''
  inspectionStatus: WireInspectionStatus | ''
  stock: SellerProductStockFilter | ''
  /** YYYY-MM-DD. 양 끝 날짜를 통째로 포함한다(서버가 to+1일 00:00 반개구간으로 바꾼다). */
  createdFrom: string
  createdTo: string
  sort: SellerProductSort
  page: number
}

const EMPTY_FILTERS: Filters = {
  keyword: '',
  category: '',
  saleStatus: '',
  inspectionStatus: '',
  stock: '',
  createdFrom: '',
  createdTo: '',
  sort: 'latest',
  page: 0,
}

// 빈 값('전체'·빈 날짜)을 여기서 걸러내지 않는다 — 와이어 모양은 queries 층의 normalizeSearchParams가
// 한 곳에서 소유한다. 서버는 `?stock=`·`?createdFrom=`처럼 값이 빈 파라미터도 400/90001로 거절한다.
function toParams(f: Filters): SellerProductSearchInput {
  return {
    keyword: f.keyword,
    category: f.category ? Number(f.category) : '',
    saleStatus: f.saleStatus ? [f.saleStatus] : [],
    inspectionStatus: f.inspectionStatus ? [f.inspectionStatus] : [],
    stock: f.stock,
    createdFrom: f.createdFrom,
    createdTo: f.createdTo,
    sort: f.sort,
    page: f.page,
  }
}

// 판매 토글이 켜진 상태. 판매종료도 BE가 ON_SALE 전환을 받으므로 꺼진 토글로 둔다.
const isSelling = (status: WireSaleStatus) => status === 'ON_SALE' || status === 'OUT_OF_STOCK'

function ProductsRoute() {
  const navigate = useNavigate({ from: Route.fullPath })
  const { saved } = Route.useSearch()
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
  const listQuery = useProducts(toParams(filters))
  const { data, isLoading, isError, error, isFetching } = listQuery
  // 카테고리는 실패해도 목록 자체는 볼 수 있다 — Select가 '전체'만 남는 완화된 실패라 안내만 띄운다.
  const categoriesQuery = useProductCategories()
  const categories = categoriesQuery.data ?? []
  const changeSaleStatus = useChangeSaleStatus()

  const [suspendTarget, setSuspendTarget] = useState<SellerProductSummary | null>(null)
  const [inventoryProductId, setInventoryProductId] = useState<string | null>(null)
  // 등록/수정 완료 알림은 state로 옮기고 URL에서 바로 지운다 — URL에 남기면 다른 토스트가 닫힌 뒤 다시 뜬다.
  const [toast, setToast] = useState<ToastState | null>(() =>
    saved ? { message: SAVED_MESSAGE[saved], variant: 'success' } : null,
  )
  useEffect(() => {
    if (saved) void navigate({ search: {}, replace: true })
  }, [saved, navigate])

  // 마지막 페이지의 유일한 상품이 필터/상태 변경으로 빠지면 페이지 이동 버튼도 사라진 빈 페이지에 남는다.
  const lastPage = Math.max((data?.totalPages ?? 1) - 1, 0)
  useEffect(() => {
    if (data && filters.page > lastPage) setFilters(prev => ({ ...prev, page: lastPage }))
  }, [data, filters.page, lastPage])

  // 목록의 다른 행 토글/버튼도 이 값으로 잠근다(확인 Modal 패턴).
  const isMutating = changeSaleStatus.isPending

  const categoryOptions = useMemo(
    () => [{ value: '', label: '전체 카테고리' }, ...flattenCategories(categories)],
    [categories],
  )

  // 필터를 바꾸면 첫 페이지로 돌아간다.
  const setFilter = (patch: Partial<Omit<Filters, 'page'>>) => setFilters(prev => ({ ...prev, ...patch, page: 0 }))

  const showError = (error: unknown) => setToast({ message: productErrorMessage(error), variant: 'error' })

  function handleToggle(product: SellerProductSummary, next: boolean) {
    if (!next) {
      setSuspendTarget(product)
      return
    }
    // 다시 판매는 되돌리기 쉬워 확인 없이 바로 바꾼다.
    changeSaleStatus.mutate(
      { productId: product.productId, saleStatus: 'ON_SALE' },
      {
        onSuccess: res =>
          setToast({
            // BE는 판매 가능한 재고가 없으면 ON_SALE 요청에도 OUT_OF_STOCK을 돌려준다.
            message: res.saleStatus === 'OUT_OF_STOCK' ? '재고가 없어 품절로 표시돼요.' : '판매를 다시 시작했어요.',
            variant: 'success',
          }),
        onError: showError,
      },
    )
  }

  function handleConfirmSuspend() {
    if (!suspendTarget) return
    changeSaleStatus.mutate(
      { productId: suspendTarget.productId, saleStatus: 'SUSPENDED' },
      {
        onSuccess: () => {
          setSuspendTarget(null)
          setToast({ message: '판매를 중지했어요.', variant: 'success' })
        },
        onError: error => {
          setSuspendTarget(null)
          showError(error)
        },
      },
    )
  }

  const columns: Column<SellerProductSummary>[] = [
    {
      key: 'name',
      label: '상품',
      render: p => {
        const thumbnail = p.thumbnailImageKey ? productImageUrl(p.thumbnailImageKey) : null
        return (
          <div className="flex items-center gap-3">
            {thumbnail ? (
              <img src={thumbnail} alt="" className="size-9 flex-none rounded-md object-cover" />
            ) : (
              <span className="flex size-9 flex-none items-center justify-center rounded-md bg-surface-sunken text-icon">
                <ImageIcon className="size-4" />
              </span>
            )}
            <p className="min-w-0 truncate font-semibold text-text-primary">{p.name}</p>
          </div>
        )
      },
    },
    { key: 'categoryName', label: '카테고리' },
    {
      key: 'price',
      label: '판매가',
      align: 'right',
      render: p => (
        <div className="tabular-nums">
          <div className="font-semibold">{(p.discountPrice ?? p.regularPrice).toLocaleString()}원</div>
          {p.discountPrice != null && (
            <div className="text-caption text-text-tertiary">
              {p.discountRate}% / <span className="line-through">{p.regularPrice.toLocaleString()}원</span>
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'totalStock',
      label: '재고',
      align: 'right',
      // 옵션별 재고 Drawer로 가는 유일한 진입점이라 평문 숫자와 구별되는 어포던스가 필요하다 —
      // ghost 버튼만으로는 다른 열의 숫자와 똑같이 보인다(점선 밑줄 + 연필 아이콘).
      render: p => (
        <Button
          variant="ghost"
          size="sm"
          className="tabular-nums underline decoration-dotted underline-offset-2"
          rightIcon={<Pencil className="size-3.5" />}
          aria-label={`${p.name} 재고 ${p.totalStock}개 수정`}
          disabled={isMutating}
          onClick={() => setInventoryProductId(p.productId)}
        >
          {p.totalStock.toLocaleString()}
        </Button>
      ),
    },
    {
      key: 'saleStatus',
      label: '판매 상태',
      render: p => (
        <div className="flex items-center gap-2">
          <StatusPill variant={SALE_STATUS_VARIANT[p.saleStatus]}>{SALE_STATUS_LABEL[p.saleStatus]}</StatusPill>
          <Toggle
            ariaLabel={`${p.name} 판매`}
            checked={isSelling(p.saleStatus)}
            disabled={isMutating}
            onChange={next => handleToggle(p, next)}
          />
        </div>
      ),
    },
    {
      key: 'inspectionStatus',
      label: '검수 상태',
      align: 'center',
      render: p => (
        <StatusPill variant={INSPECTION_STATUS_VARIANT[p.inspectionStatus]}>
          {INSPECTION_STATUS_LABEL[p.inspectionStatus]}
        </StatusPill>
      ),
    },
    {
      key: 'createdAt',
      // 등록일 범위 필터를 걸었을 때 결과 행이 그 범위인지 화면에서 확인할 수 있어야 한다.
      // 서버는 LocalDateTime(`2026-10-07T10:00:00`)을 주고 필터는 날짜 단위라 앞 10자만 쓴다.
      label: '등록일',
      align: 'right',
      render: p => <span className="tabular-nums">{p.createdAt.slice(0, 10)}</span>,
    },
    // '처리'(수정·삭제) 열은 뺐다 — 수정은 서버 단건 조회가 없어 막았고 삭제는 BE에 없다.
  ]

  const totalPages = data?.totalPages ?? 0
  // 재조회가 실패해도 keepPreviousData가 직전 페이지를 남긴다 — 그 상태를 안내 문구로 가른다.
  const hasRows = (data?.products.length ?? 0) > 0

  return (
    <div className="p-6">
      <PageHeader
        title="상품 관리"
        actions={
          // 임시저장 개수 버튼은 BE에 임시저장 개념이 없어 숨겼다(목업 구현은 보존).
          <Button size="sm" leftIcon={<Plus className="size-4" />} onClick={() => navigate({ to: '/products/new' })}>
            상품 등록
          </Button>
        }
      />

      <div className="flex flex-col gap-2">
        <FilterBar>
          <SearchInput
            value={filters.keyword}
            onChange={keyword => setFilter({ keyword })}
            placeholder="상품명 검색"
            maxLength={KEYWORD_MAX}
            className="w-60"
          />
          <Select
            aria-label="카테고리"
            options={categoryOptions}
            value={filters.category}
            onChange={category => setFilter({ category })}
          />
          <Select
            aria-label="판매 상태"
            options={SALE_STATUS_OPTIONS}
            value={filters.saleStatus}
            onChange={saleStatus => setFilter({ saleStatus: saleStatus as WireSaleStatus | '' })}
          />
          <Select
            aria-label="검수 상태"
            options={INSPECTION_STATUS_OPTIONS}
            value={filters.inspectionStatus}
            onChange={inspectionStatus =>
              setFilter({ inspectionStatus: inspectionStatus as WireInspectionStatus | '' })
            }
          />
          <Select
            aria-label="재고"
            options={STOCK_OPTIONS}
            value={filters.stock}
            onChange={stock => setFilter({ stock: stock as SellerProductStockFilter | '' })}
          />
          <Select
            aria-label="정렬"
            options={SORT_OPTIONS}
            value={filters.sort}
            onChange={sort => setFilter({ sort: sort as SellerProductSort })}
          />
          <Button variant="ghost" size="md" onClick={() => setFilters(EMPTY_FILTERS)}>
            초기화
          </Button>
        </FilterBar>
        {/* 라벨을 쓴 DatePicker는 루트가 flex-col이라 ~64px인데 FilterBar는 items-center다 — 40px
            컨트롤과 같은 줄에 두면 날짜 입력칸만 아래로 밀린다. DatePicker에는 aria-label prop이
            없어 라벨을 지울 수도 없으니 날짜 둘만 따로 한 줄에 둔다. */}
        <FilterBar>
          <DatePicker
            label="등록일 시작"
            value={filters.createdFrom}
            max={filters.createdTo || undefined}
            onChange={createdFrom => setFilter({ createdFrom })}
          />
          {/* 시작일 > 종료일은 BE가 400/90001로 거절한다 — 서로의 min/max로 애초에 못 고르게 묶는다. */}
          <DatePicker
            label="등록일 종료"
            value={filters.createdTo}
            min={filters.createdFrom || undefined}
            onChange={createdTo => setFilter({ createdTo })}
          />
        </FilterBar>
      </div>

      {/* 목록 조회 실패를 표의 빈 상태로 흘리지 않는다 — 실 API에는 403/40006(정지·탈퇴 셀러),
          403/20006(온보딩 미완), 404/40101(비활성 카테고리 필터), 400/90001, 500이 모두 있고
          그 전부가 "조건에 맞는 상품이 없어요"로 보이면 셀러는 필터를 의심한다. 실패 모양이 두
          가지다 — 필터를 바꾼 조회가 실패하면 placeholderData가 버려져 표가 비고, 같은 조회의
          재조회(뮤테이션 뒤 무효화·포커스 복귀)가 실패하면 직전 성공 데이터가 그대로 남는다.
          후자를 조용히 두지 않도록 낡은 목록이라는 사실을 안내에 덧붙인다. */}
      {isError && (
        <Alert variant="error" className="mt-4">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className="min-w-0 flex-1">
              {productErrorMessage(error)}
              {hasRows && ' 아래 목록은 마지막으로 불러온 내용이라 지금과 다를 수 있어요.'}
            </span>
            <Button variant="secondary" size="sm" loading={isFetching} onClick={() => void listQuery.refetch()}>
              다시 시도
            </Button>
          </div>
        </Alert>
      )}
      {categoriesQuery.isError && (
        <Alert variant="warning" className="mt-2">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className="min-w-0 flex-1">카테고리를 불러오지 못해 카테고리 필터를 쓸 수 없어요.</span>
            <Button
              variant="secondary"
              size="sm"
              loading={categoriesQuery.isFetching}
              onClick={() => void categoriesQuery.refetch()}
            >
              다시 시도
            </Button>
          </div>
        </Alert>
      )}

      <p className="mt-4 text-caption text-text-tertiary">
        총 {data ? data.totalCount.toLocaleString() : '—'}개
      </p>
      <div className="mt-2">
        <DataTable
          columns={columns}
          rows={data?.products ?? []}
          rowKey={p => p.productId}
          loading={isLoading}
          emptyLabel={isError ? '목록을 불러오지 못했어요.' : '조건에 맞는 상품이 없어요.'}
        />
      </div>
      <p className="mt-2 text-caption text-text-tertiary">
        상품 정보 수정은 준비 중이에요. 지금은 등록과 재고/판매 상태 변경만 할 수 있어요.
      </p>

      {totalPages > 1 && (
        <nav aria-label="페이지" className="mt-4 flex items-center justify-center gap-3">
          <Button
            variant="secondary"
            size="sm"
            disabled={filters.page === 0}
            onClick={() => setFilters(prev => ({ ...prev, page: prev.page - 1 }))}
          >
            이전
          </Button>
          <span className="text-body-sm tabular-nums text-text-secondary">
            {filters.page + 1} / {totalPages}
          </span>
          <Button
            variant="secondary"
            size="sm"
            disabled={!data?.hasNext}
            onClick={() => setFilters(prev => ({ ...prev, page: prev.page + 1 }))}
          >
            다음
          </Button>
        </nav>
      )}

      {suspendTarget && (
        <Modal
          open
          onClose={() => setSuspendTarget(null)}
          title={SUSPEND_CONFIRM.title}
          description={SUSPEND_CONFIRM.description}
          confirmLabel={SUSPEND_CONFIRM.confirmLabel}
          confirmVariant="primary"
          loading={isMutating}
          onConfirm={handleConfirmSuspend}
        />
      )}

      {/* 상품이 바뀌면 입력 중이던 재고 편집값을 버리도록 key로 다시 마운트한다. */}
      <InventoryDrawer
        key={inventoryProductId ?? 'closed'}
        productId={inventoryProductId}
        onClose={() => setInventoryProductId(null)}
        onSaved={message => setToast({ message, variant: 'success' })}
      />

      {toast && <Toast open message={toast.message} variant={toast.variant} onClose={() => setToast(null)} />}
    </div>
  )
}
