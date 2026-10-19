import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Alert, PageHeader, Skeleton } from '@aechak/design-system/web'
import { errorResponse } from '@aechak/api'
import { useToast } from '@/shared/hooks/useToast'
import {
  ProductEditor,
  ProductMissing,
  productErrorMessage,
  productImageUrl,
  toFormValues,
  toUpdateRequest,
  useProductCategories,
  useProductDetail,
  useUpdateProduct,
} from '@/features/products'
import { ShippingPolicyNotice } from '@/features/shipping-policy'

export const Route = createFileRoute('/products/$productId/edit')({
  component: ProductEditRoute,
})

/** 없는 상품과 남의 상품을 BE가 같은 404/40000으로 가린다 — 그 둘만 "찾을 수 없어요"로 끝낸다. */
const isNotFound = (error: unknown) => errorResponse(error)?.data?.errorCode === 40000

function ProductEditRoute() {
  const { productId } = Route.useParams()
  const navigate = useNavigate()
  const categoriesQuery = useProductCategories()
  const detail = useProductDetail(productId)
  const updateProduct = useUpdateProduct()
  const toast = useToast()

  const toList = { label: '목록으로', onClick: () => void navigate({ to: '/products' }) }

  if (detail.isError) {
    // 404는 대상이 없는 것이고, 403/40004(휴점·정지 셀러)·5xx·네트워크는 "지금 못 불러온 것"이다 —
    // 둘을 같은 문구로 접으면 운영자가 상품이 사라진 줄 안다.
    return isNotFound(detail.error) ? (
      <ProductMissing title="상품 수정" message="상품을 찾을 수 없어요" action={toList} />
    ) : (
      <ProductMissing
        title="상품 수정"
        message="상품을 불러오지 못했어요"
        description={productErrorMessage(detail.error)}
        action={toList}
      />
    )
  }
  // 카테고리 트리가 없으면 소분류를 복원할 수 없어 폼 자체가 성립하지 않는다(등록 폼과 달리
  // 프리필된 categoryId를 경로로 되돌려야 한다) — 백지 대신 사유와 재시도를 보여준다.
  if (categoriesQuery.isError) {
    return (
      <ProductMissing
        title="상품 수정"
        message="카테고리를 불러오지 못했어요"
        description={productErrorMessage(categoriesQuery.error)}
        action={{ label: '다시 시도', onClick: () => void categoriesQuery.refetch() }}
      />
    )
  }
  if (!categoriesQuery.data || !detail.data) {
    return (
      <div className="p-6">
        <PageHeader title="상품 수정" />
        <div role="status" aria-label="수정 양식을 불러오는 중" className="flex flex-col gap-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-2/3" />
          <Skeleton className="h-40 w-full" />
        </div>
      </div>
    )
  }

  const product = detail.data
  return (
    <>
      {/* 서버는 대표 이미지 행이 없는 상품에 thumbnailImageKey=null을 준다(500이 아니다). 그 상태로는
          저장이 통과하지 못하므로(PUT의 썸네일 키는 필수) 폼을 열어 주되 이유를 먼저 밝힌다. */}
      {product.thumbnailImageKey == null && (
        <div className="px-6 pt-6">
          <Alert variant="warning">대표 썸네일이 없는 상품이에요. 저장하려면 썸네일을 다시 올려 주세요.</Alert>
        </div>
      )}
      <ProductEditor
        mode="edit"
        productId={productId}
        initial={toFormValues(product, categoriesQuery.data, key => productImageUrl(key) ?? '')}
        categories={categoriesQuery.data}
        shippingSummary={<ShippingPolicyNotice />}
        submitting={updateProduct.isPending}
        onSubmit={values =>
          // 남겨 둔 기존 이미지는 저장 키를 그대로, 새 이미지는 tmp 키를 보낸다(PUT은 목록 통째 교체).
          updateProduct.mutate(
            { productId, body: toUpdateRequest(values) },
            {
              onSuccess: () => void navigate({ to: '/products', search: { saved: 'updated' }, replace: true }),
              onError: error => toast.show(productErrorMessage(error), 'error'),
            },
          )
        }
      />
      {toast.element}
    </>
  )
}
