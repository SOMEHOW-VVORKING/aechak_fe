import { createFileRoute, useNavigate } from '@tanstack/react-router'
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

/**
 * 운영 진입 차단 스위치.
 *
 * BE에 셀러 단건 조회(`GET /sellers/me/products/{productId}`)가 없다. 목록 응답과 옵션 응답을 합쳐도
 * `categoryId`·`description`·할인 기간·추가/상세 이미지 키를 복원할 수 없는데, `PUT`은 이미지 목록을
 * 통째로 교체하고 할인 세 필드를 함께 받는다 — 부족한 프리필로 저장하면 **기존 이미지와 할인 설정을
 * 잃는다.** 그래서 목록에서 이 화면으로 가는 버튼을 없애고, 주소를 직접 쳐서 들어와도 폼을 열지 않는다.
 *
 * 아래 `ProductEditForm`과 queries 층의 `useUpdateProduct` 배선은 지우지 않았다. 서버 단건 조회가
 * 생기면 `useProductDetail`의 목업을 그 fetcher로 바꾸고 이 상수를 올리면 그대로 살아난다.
 */
const SERVER_PRODUCT_DETAIL_AVAILABLE = false

function ProductEditRoute() {
  const navigate = useNavigate()
  if (!SERVER_PRODUCT_DETAIL_AVAILABLE) {
    return (
      <ProductMissing
        title="상품 수정"
        message="상품 수정은 아직 준비 중이에요"
        description="지금은 재고와 판매 상태만 바꿀 수 있어요. 수정 기능은 준비가 끝나면 열어 둘게요."
        action={{ label: '목록으로', onClick: () => void navigate({ to: '/products' }) }}
      />
    )
  }
  return <ProductEditForm />
}

/** 서버 단건 조회가 생기면 그대로 쓸 수정 폼. 지금은 위 스위치가 내려가 있어 렌더되지 않는다. */
function ProductEditForm() {
  const { productId } = Route.useParams()
  const navigate = useNavigate()
  const { data: categories } = useProductCategories()
  // 프리필용 단건 조회는 BE에 없어 목업으로만 동작한다(products.mock `BE 엔드포인트 없음` 구역).
  const detail = useProductDetail(productId)
  const updateProduct = useUpdateProduct()
  const toast = useToast()

  if (!detail.data && detail.isError) {
    return (
      <ProductMissing
        title="상품 수정"
        message="상품을 찾을 수 없어요"
        action={{ label: '목록으로', onClick: () => void navigate({ to: '/products' }) }}
      />
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
