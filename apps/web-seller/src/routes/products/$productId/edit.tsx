import { useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { EmptyState, PageHeader, Toast } from '@aechak/design-system/web'
import {
  ProductEditor,
  productErrorMessage,
  productImageUrl,
  toFormValues,
  toUpdateRequest,
  useProductCategories,
  useProductDetail,
  useUpdateProduct,
} from '@/features/products'
import { ShippingPolicySummary } from '@/features/shipping-policy'

export const Route = createFileRoute('/products/$productId/edit')({
  component: ProductEditRoute,
})

function ProductEditRoute() {
  const { productId } = Route.useParams()
  const navigate = useNavigate()
  const { data: categories } = useProductCategories()
  // 프리필용 단건 조회는 BE에 없어 목업으로만 동작한다(products.mock `BE 엔드포인트 없음` 구역).
  const detail = useProductDetail(productId)
  const updateProduct = useUpdateProduct()
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  if (!detail.data && detail.isError) {
    return (
      <div className="p-6">
        <PageHeader title="상품 수정" />
        <EmptyState
          title="상품을 찾을 수 없어요"
          action={{ label: '목록으로', onClick: () => navigate({ to: '/products' }) }}
        />
      </div>
    )
  }
  if (!categories || !detail.data) return null

  return (
    <>
      <ProductEditor
        mode="edit"
        productId={productId}
        initial={toFormValues(detail.data, categories, key => productImageUrl(key) ?? '')}
        categories={categories}
        shippingSummary={<ShippingPolicySummary />}
        submitting={updateProduct.isPending}
        onSubmit={values =>
          // 남겨 둔 기존 이미지는 저장 키를 그대로, 새 이미지는 tmp 키를 보낸다(PUT은 목록 통째 교체).
          updateProduct.mutate(
            { productId, body: toUpdateRequest(values) },
            {
              onSuccess: () => navigate({ to: '/products', search: { saved: 'updated' }, replace: true }),
              onError: error => setErrorMessage(productErrorMessage(error)),
            },
          )
        }
      />
      {errorMessage && <Toast open variant="error" message={errorMessage} onClose={() => setErrorMessage(null)} />}
    </>
  )
}
