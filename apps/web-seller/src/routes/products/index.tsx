import { useMemo, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import type { Product, ProductInspectionStatus, ProductSaleStatus } from '@aechak/domain'
import {
  Button,
  Checkbox,
  DataTable,
  FilterBar,
  PageHeader,
  SearchInput,
  Select,
  StatusPill,
  type Column,
  type StatusPillVariant,
} from '@aechak/design-system/web'
import {
  INSPECTION_STATUS_LABEL,
  InspectionReviewModal,
  SALE_STATUS_LABEL,
  needsAttention,
  useProducts,
} from '@/features/products'

export const Route = createFileRoute('/products/')({
  component: ProductsRoute,
})

const SALE_STATUS_VARIANT: Record<ProductSaleStatus, StatusPillVariant> = {
  selling: 'success',
  sold_out: 'muted',
  pending: 'neutral',
  ended: 'muted',
  blinded: 'muted',
  suspended: 'danger',
}

const INSPECTION_STATUS_VARIANT: Record<ProductInspectionStatus, StatusPillVariant> = {
  approved: 'brand',
  pending: 'neutral',
  rejected: 'error',
  revision_needed: 'neutral',
}

const SALE_STATUS_OPTIONS = [
  { value: '', label: '전체' },
  ...Object.entries(SALE_STATUS_LABEL).map(([value, label]) => ({ value, label })),
]
const INSPECTION_STATUS_OPTIONS = [
  { value: '', label: '전체' },
  ...Object.entries(INSPECTION_STATUS_LABEL).map(([value, label]) => ({ value, label })),
]

function ProductAction({ product, onReview }: { product: Product; onReview: (p: Product) => void }) {
  if (needsAttention(product)) {
    return (
      <Button
        variant={product.inspectionStatus === 'rejected' ? 'primary' : 'secondary'}
        size="sm"
        onClick={() => onReview(product)}
      >
        사유 확인
      </Button>
    )
  }
  if (product.status === 'ended') {
    return <span className="text-caption text-text-tertiary">이력 보존</span>
  }
  return (
    <Button variant="secondary" size="sm">
      {product.status === 'sold_out' ? '재입고' : '수정'}
    </Button>
  )
}

function ProductsRoute() {
  const { data: products = [], isLoading } = useProducts()
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [saleStatus, setSaleStatus] = useState('')
  const [inspectionStatus, setInspectionStatus] = useState('')
  const [attentionOnly, setAttentionOnly] = useState(false)
  const [reviewProduct, setReviewProduct] = useState<Product | null>(null)

  const categoryOptions = useMemo(
    () => [
      { value: '', label: '전체' },
      ...Array.from(new Set(products.map(p => p.category))).map(c => ({ value: c, label: c })),
    ],
    [products],
  )

  const attentionCount = useMemo(() => products.filter(needsAttention).length, [products])

  const filtered = useMemo(
    () =>
      products.filter(p => {
        if (search && !p.name.includes(search) && !p.code.includes(search)) return false
        if (category && p.category !== category) return false
        if (saleStatus && p.status !== saleStatus) return false
        if (inspectionStatus && p.inspectionStatus !== inspectionStatus) return false
        if (attentionOnly && !needsAttention(p)) return false
        return true
      }),
    [products, search, category, saleStatus, inspectionStatus, attentionOnly],
  )

  const handleResetFilters = () => {
    setSearch('')
    setCategory('')
    setSaleStatus('')
    setInspectionStatus('')
    setAttentionOnly(false)
  }

  const columns: Column<Product>[] = useMemo(() => [
    {
      key: 'name',
      label: '상품',
      render: p => (
        <div>
          <p className="font-semibold text-text-primary">{p.name}</p>
          <p className="text-caption text-text-tertiary">No. {p.code}</p>
        </div>
      ),
    },
    { key: 'category', label: '카테고리' },
    {
      key: 'price',
      label: '판매가',
      align: 'right',
      render: p => <div className="font-semibold tabular-nums">{p.price.toLocaleString()}원</div>,
    },
    {
      key: 'stock',
      label: '재고',
      align: 'right',
      render: p => <div className="tabular-nums">{p.stock}</div>,
    },
    {
      key: 'status',
      label: '판매 상태',
      align: 'center',
      render: p => <StatusPill variant={SALE_STATUS_VARIANT[p.status]}>{SALE_STATUS_LABEL[p.status]}</StatusPill>,
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
        <div className="flex justify-end">
          <ProductAction product={p} onReview={setReviewProduct} />
        </div>
      ),
    },
  ], [])

  return (
    <div className="p-6">
      <PageHeader title="상품 관리" />

      <FilterBar>
        <SearchInput value={search} onChange={setSearch} placeholder="상품명 / 상품번호 검색" className="w-60" />
        <Select placeholder="카테고리" options={categoryOptions} value={category} onChange={setCategory} />
        <Select placeholder="판매 상태" options={SALE_STATUS_OPTIONS} value={saleStatus} onChange={setSaleStatus} />
        <Select
          placeholder="검수 상태"
          options={INSPECTION_STATUS_OPTIONS}
          value={inspectionStatus}
          onChange={setInspectionStatus}
        />
        <Button variant="ghost" size="md" onClick={handleResetFilters}>
          초기화
        </Button>
        <Checkbox
          checked={attentionOnly}
          onChange={setAttentionOnly}
          label={`처리 필요 (${attentionCount})`}
        />
      </FilterBar>

      <div className="mt-4">
        <DataTable columns={columns} rows={filtered} rowKey={p => p.id} loading={isLoading} />
      </div>

      <InspectionReviewModal product={reviewProduct} onClose={() => setReviewProduct(null)} />
    </div>
  )
}
