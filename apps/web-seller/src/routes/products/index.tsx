import { useEffect, useMemo, useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { FileText, Image as ImageIcon, Pencil, Plus } from 'lucide-react'
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
  Toggle,
  type Column,
  type StatusPillVariant,
} from '@aechak/design-system/web'
import { useToast } from '@/shared/hooks/useToast'
import {
  DraftListDrawer,
  INSPECTION_STATUS_LABEL,
  draftLabel,
  InventoryDrawer,
  KEYWORD_MAX,
  SALE_STATUS_LABEL,
  productErrorMessage,
  productImageUrl,
  useChangeSaleStatus,
  useDeleteProductDraft,
  useProductCategories,
  useProductDrafts,
  useProducts,
  type CategoryNode,
  type SellerProductSearchInput,
  type SellerProductSort,
  type SellerProductStockFilter,
  type ProductDraftSummary,
  type SellerProductSummary,
  type WireInspectionStatus,
  type WireSaleStatus,
} from '@/features/products'

// 상품 삭제의 진입점은 이 화면에 없다 — BE에 DELETE가 없고 판매 중지가 노출 제어를 담당한다(코드째 지웠다).
// 상품 수정은 셀러 단건 조회(GET /sellers/me/products/{productId})가 생겨 '처리' 열로 되살렸다.
// 임시저장은 `/sellers/me/product-drafts`가 생겨 머리말 버튼과 초안 Drawer로 되살렸다 — 실서버로 나간다.

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
    // keyword는 다듬지 않고 그대로 넘긴다 — BE가 trim하고 빈 값은 검색어 없음으로 본다.
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
  const [draftsOpen, setDraftsOpen] = useState(false)
  const [draftDeleteTarget, setDraftDeleteTarget] = useState<ProductDraftSummary | null>(null)
  // 초안 수는 머리말 배지의 출처다. 처음 조회가 실패하면 수를 지어내지 않고 버튼을 숨긴다 —
  // Drawer를 열 길이 없어지지만 "0개"라는 거짓을 보여 주는 것보다 낫다. Drawer를 연 뒤 재조회가
  // 실패하면 행은 남으므로(react-query가 직전 데이터를 들고 있다) 그때는 Alert로 드러낸다.
  const draftsQuery = useProductDrafts()
  const drafts = draftsQuery.data?.items ?? []
  const deleteDraft = useDeleteProductDraft()
  // 낡은 행으로 되돌릴 수 없는 삭제를 지시하지 못하게 잠근다(AGENTS 6절 7항). 이어쓰기는 읽기라 남긴다.
  const draftsStale = draftsQuery.isError
  const draftDeleteBlocked = draftsStale || deleteDraft.isPending
  // 등록/수정 완료 알림은 state로 옮기고 URL에서 바로 지운다 — URL에 남기면 다른 토스트가 닫힌 뒤 다시 뜬다.
  const toast = useToast(saved ? { message: SAVED_MESSAGE[saved], variant: 'success' } : null)
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

  const showError = (error: unknown) => toast.show(productErrorMessage(error), 'error')

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
          // BE는 판매 가능한 재고가 없으면 ON_SALE 요청에도 OUT_OF_STOCK을 돌려준다.
          toast.show(res.saleStatus === 'OUT_OF_STOCK' ? '재고가 없어 품절로 표시돼요.' : '판매를 다시 시작했어요.'),
        onError: showError,
      },
    )
  }

  // 삭제 분기가 없어져 확인 Modal은 판매 중지 하나뿐이다(위 주석의 DELETE 부재).
  function handleConfirmSuspend() {
    if (!suspendTarget) return
    changeSaleStatus.mutate(
      { productId: suspendTarget.productId, saleStatus: 'SUSPENDED' },
      {
        onSuccess: () => {
          setSuspendTarget(null)
          toast.show('판매를 중지했어요.')
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
              <img
                src={thumbnail}
                alt=""
                loading="lazy"
                decoding="async"
                className="size-9 flex-none rounded-md object-cover"
              />
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
    {
      // 삭제는 BE에 DELETE가 없어 여전히 없다 — 이 열에는 수정 하나만 둔다.
      key: 'actions',
      label: '처리',
      render: p => (
        <div className="flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            leftIcon={<Pencil className="size-3.5" />}
            aria-label={`${p.name} 수정`}
            disabled={isMutating}
            onClick={() => navigate({ to: '/products/$productId/edit', params: { productId: p.productId } })}
          >
            수정
          </Button>
        </div>
      ),
    },
  ]

  const totalPages = data?.totalPages ?? 0
  // 재조회가 실패해도 keepPreviousData가 직전 페이지를 남긴다 — 그 상태를 안내 문구로 가른다.
  const hasRows = (data?.products.length ?? 0) > 0

  return (
    <div className="p-6">
      <PageHeader
        title="상품 관리"
        actions={
          <>
            {/* 초안이 없으면 버튼을 그리지 않는다 — 열어도 빈 Drawer뿐인 자리를 남기지 않는다.
                등록 화면의 '임시저장'이 이 버튼을 만드는 유일한 입구다. */}
            {drafts.length > 0 && (
              <Button
                variant="secondary"
                size="sm"
                leftIcon={<FileText className="size-4" />}
                onClick={() => setDraftsOpen(true)}
              >
                임시저장 {drafts.length}
              </Button>
            )}
            <Button size="sm" leftIcon={<Plus className="size-4" />} onClick={() => navigate({ to: '/products/new' })}>
              상품 등록
            </Button>
          </>
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
        옵션 구성과 상품 삭제는 아직 바꿀 수 없어요. 옵션별 재고와 판매 여부는 재고 열에서 바꿀 수 있어요.
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
        onSaved={message => toast.show(message)}
      />

      {/* 삭제가 마지막 초안을 지워도 Drawer는 닫지 않는다 — 빈 상태를 보여 주고 셀러가 닫는다. */}
      <DraftListDrawer
        open={draftsOpen}
        drafts={drafts}
        loadError={
          draftsStale ? '임시저장 목록을 다시 불러오지 못해 아래는 마지막으로 본 목록이에요.' : null
        }
        deleteDisabled={draftDeleteBlocked}
        // 확인창이 떠 있는 동안에는 Escape·스크림이 Drawer까지 닫지 않게 한다 — 두 dialog가 각각
        // document에 Escape 핸들러를 걸어 한 번 누르면 둘이 함께 닫힌다.
        onClose={() => {
          if (!draftDeleteTarget) setDraftsOpen(false)
        }}
        onSelect={draftId => {
          setDraftsOpen(false)
          void navigate({ to: '/products/new', search: { draftId } })
        }}
        onRequestDelete={setDraftDeleteTarget}
      />

      {/* 임시저장 삭제는 되돌릴 수 없다. 확인 Modal은 Drawer 밖(라우트)에 둔다 — 안에 중첩하면
          포커스 트랩이 겹쳐 확인창에서 Tab이 뒤쪽 Drawer로 빠진다. */}
      {draftDeleteTarget && (
        <Modal
          open
          onClose={() => setDraftDeleteTarget(null)}
          title="임시저장을 삭제할까요?"
          description={`'${draftLabel(draftDeleteTarget)}'에 적어 둔 내용이 사라져요. 되돌릴 수 없어요.`}
          confirmLabel="삭제"
          confirmVariant="danger"
          loading={draftDeleteBlocked}
          onConfirm={() => {
            const { draftId } = draftDeleteTarget
            setDraftDeleteTarget(null)
            deleteDraft.mutate(
              { draftId },
              { onSuccess: () => toast.show('임시저장을 삭제했어요.'), onError: showError },
            )
          }}
        />
      )}
      {toast.element}
    </div>
  )
}
