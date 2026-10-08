import { useEffect, useMemo, useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Image as ImageIcon, Plus } from 'lucide-react'
import {
  Button,
  DataTable,
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
  InventoryDrawer,
  KEYWORD_MAX,
  SALE_STATUS_LABEL,
  productErrorMessage,
  productImageUrl,
  useChangeSaleStatus,
  useDeleteProduct,
  useProductCategories,
  useProductDrafts,
  useProducts,
  type CategoryNode,
  type SellerProductSearchParams,
  type SellerProductSort,
  type SellerProductSummary,
  type WireInspectionStatus,
  type WireSaleStatus,
} from '@/features/products'

export interface ProductsSearch {
  saved?: 'created' | 'updated'
}

export const Route = createFileRoute('/products/')({
  validateSearch: (search: Record<string, unknown>): ProductsSearch =>
    search['saved'] === 'created' || search['saved'] === 'updated' ? { saved: search['saved'] } : {},
  component: ProductsRoute,
})

const SALE_STATUS_VARIANT: Record<WireSaleStatus, StatusPillVariant> = {
  ON_SALE: 'success',
  OUT_OF_STOCK: 'muted',
  SUSPENDED: 'danger',
  ENDED: 'muted',
}

const INSPECTION_STATUS_VARIANT: Record<WireInspectionStatus, StatusPillVariant> = {
  DRAFT: 'neutral',
  PENDING: 'neutral',
  APPROVED: 'brand',
  REJECTED: 'error',
}

const withAll = (labels: Record<string, string>) => [
  { value: '', label: '전체' },
  ...Object.entries(labels).map(([value, label]) => ({ value, label })),
]
const SALE_STATUS_OPTIONS = withAll(SALE_STATUS_LABEL)
const INSPECTION_STATUS_OPTIONS = withAll(INSPECTION_STATUS_LABEL)
const SORT_OPTIONS: { value: SellerProductSort; label: string }[] = [
  { value: 'latest', label: '최신순' },
  { value: 'price_asc', label: '가격 낮은순' },
  { value: 'price_desc', label: '가격 높은순' },
]

// BE category 파라미터는 어느 깊이든 받고 하위 카테고리 상품까지 포함한다.
const flattenCategories = (nodes: CategoryNode[], prefix = ''): { value: string; label: string }[] =>
  nodes.flatMap(n => {
    const label = prefix ? `${prefix} > ${n.name}` : n.name
    return [{ value: String(n.categoryId), label }, ...flattenCategories(n.children, label)]
  })

const SAVED_MESSAGE = { created: '상품을 등록했어요.', updated: '상품을 수정했어요.' } as const

type ConfirmKind = 'suspend' | 'delete'

const CONFIRM_COPY: Record<
  ConfirmKind,
  { title: string; description: string; confirmLabel: string; confirmVariant: 'primary' | 'danger' }
> = {
  // 되돌릴 수 있는 전환이라 primary.
  suspend: {
    title: '판매를 중지할까요?',
    description: '구매자 검색과 목록에서 바로 숨겨져요. 이미 받은 주문은 그대로 처리되고 언제든 다시 판매할 수 있어요.',
    confirmLabel: '판매 중지',
    confirmVariant: 'primary',
  },
  delete: {
    title: '상품을 삭제할까요?',
    description: '삭제한 상품은 되돌릴 수 없어요.',
    confirmLabel: '삭제',
    confirmVariant: 'danger',
  },
}

interface Filters {
  keyword: string
  category: string
  saleStatus: string
  inspectionStatus: string
  sort: SellerProductSort
  page: number
}

const EMPTY_FILTERS: Filters = { keyword: '', category: '', saleStatus: '', inspectionStatus: '', sort: 'latest', page: 0 }

function toParams(f: Filters): SellerProductSearchParams {
  return {
    // BE가 keyword를 trim하고 빈 값은 검색어 없음으로 본다.
    ...(f.keyword && { keyword: f.keyword }),
    ...(f.category && { category: Number(f.category) }),
    ...(f.saleStatus && { saleStatus: [f.saleStatus as WireSaleStatus] }),
    ...(f.inspectionStatus && { inspectionStatus: [f.inspectionStatus as WireInspectionStatus] }),
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
  const { data, isLoading } = useProducts(toParams(filters))
  const { data: categories = [] } = useProductCategories()
  const { data: drafts = [] } = useProductDrafts()
  const changeSaleStatus = useChangeSaleStatus()
  const deleteProduct = useDeleteProduct()

  const [confirmTarget, setConfirmTarget] = useState<{ kind: ConfirmKind; product: SellerProductSummary } | null>(
    null,
  )
  const [inventoryProductId, setInventoryProductId] = useState<string | null>(null)
  const [draftsOpen, setDraftsOpen] = useState(false)
  // 등록/수정 완료 알림은 state로 옮기고 URL에서 바로 지운다 — URL에 남기면 다른 토스트가 닫힌 뒤 다시 뜬다.
  const toast = useToast(saved ? { message: SAVED_MESSAGE[saved], variant: 'success' } : null)
  useEffect(() => {
    if (saved) void navigate({ search: {}, replace: true })
  }, [saved, navigate])

  // 마지막 페이지의 유일한 상품이 삭제/상태 변경으로 빠지면 페이지 이동 버튼도 사라진 빈 페이지에 남는다.
  const lastPage = Math.max((data?.totalPages ?? 1) - 1, 0)
  useEffect(() => {
    if (data && filters.page > lastPage) setFilters(prev => ({ ...prev, page: lastPage }))
  }, [data, filters.page, lastPage])

  // 목록의 다른 행 토글/버튼도 이 값으로 잠근다(확인 Modal 패턴).
  const isMutating = changeSaleStatus.isPending || deleteProduct.isPending

  const categoryOptions = useMemo(
    () => [{ value: '', label: '전체' }, ...flattenCategories(categories)],
    [categories],
  )

  // 필터를 바꾸면 첫 페이지로 돌아간다.
  const setFilter = (patch: Partial<Omit<Filters, 'page'>>) => setFilters(prev => ({ ...prev, ...patch, page: 0 }))

  const showError = (error: unknown) => toast.show(productErrorMessage(error), 'error')

  function handleToggle(product: SellerProductSummary, next: boolean) {
    if (!next) {
      setConfirmTarget({ kind: 'suspend', product })
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

  function handleConfirm() {
    if (!confirmTarget) return
    const { kind, product } = confirmTarget
    const done = (message: string) => () => {
      setConfirmTarget(null)
      toast.show(message)
    }
    const fail = (error: unknown) => {
      setConfirmTarget(null)
      showError(error)
    }
    if (kind === 'suspend') {
      changeSaleStatus.mutate(
        { productId: product.productId, saleStatus: 'SUSPENDED' },
        { onSuccess: done('판매를 중지했어요.'), onError: fail },
      )
    } else {
      deleteProduct.mutate(product.productId, { onSuccess: done('상품을 삭제했어요.'), onError: fail })
    }
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
      render: p => (
        <Button
          variant="ghost"
          size="sm"
          className="tabular-nums"
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
      key: 'actions',
      label: '처리',
      render: p => (
        <div className="flex justify-end gap-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={isMutating}
            onClick={() => navigate({ to: '/products/$productId/edit', params: { productId: p.productId } })}
          >
            수정
          </Button>
          {/* 삭제는 BE 엔드포인트가 없어 목업으로만 동작한다. */}
          <Button
            variant="ghost"
            size="sm"
            disabled={isMutating}
            onClick={() => setConfirmTarget({ kind: 'delete', product: p })}
          >
            삭제
          </Button>
        </div>
      ),
    },
  ]

  const confirmCopy = confirmTarget ? CONFIRM_COPY[confirmTarget.kind] : null
  const totalPages = data?.totalPages ?? 0

  return (
    <div className="p-6">
      <PageHeader
        title="상품 관리"
        actions={
          <div className="flex gap-2">
            {drafts.length > 0 && (
              <Button variant="secondary" size="sm" onClick={() => setDraftsOpen(true)}>
                임시저장 {drafts.length}
              </Button>
            )}
            <Button size="sm" leftIcon={<Plus className="size-4" />} onClick={() => navigate({ to: '/products/new' })}>
              상품 등록
            </Button>
          </div>
        }
      />

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
          onChange={saleStatus => setFilter({ saleStatus })}
        />
        <Select
          aria-label="검수 상태"
          options={INSPECTION_STATUS_OPTIONS}
          value={filters.inspectionStatus}
          onChange={inspectionStatus => setFilter({ inspectionStatus })}
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

      <p className="mt-4 text-caption text-text-tertiary">총 {(data?.totalCount ?? 0).toLocaleString()}개</p>
      <div className="mt-2">
        <DataTable
          columns={columns}
          rows={data?.products ?? []}
          rowKey={p => p.productId}
          loading={isLoading}
          emptyLabel="조건에 맞는 상품이 없어요."
        />
      </div>

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

      {confirmTarget && confirmCopy && (
        <Modal
          open
          onClose={() => setConfirmTarget(null)}
          title={confirmCopy.title}
          description={confirmCopy.description}
          confirmLabel={confirmCopy.confirmLabel}
          confirmVariant={confirmCopy.confirmVariant}
          loading={isMutating}
          onConfirm={handleConfirm}
        />
      )}

      {/* 상품이 바뀌면 입력 중이던 재고 편집값을 버리도록 key로 다시 마운트한다. */}
      <InventoryDrawer
        key={inventoryProductId ?? 'closed'}
        productId={inventoryProductId}
        onClose={() => setInventoryProductId(null)}
        onSaved={message => toast.show(message)}
      />

      <DraftListDrawer
        open={draftsOpen}
        drafts={drafts}
        onClose={() => setDraftsOpen(false)}
        onSelect={draftId => navigate({ to: '/products/new', search: { draftId } })}
      />

      {toast.element}
    </div>
  )
}
