import { useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { PageHeader, Skeleton } from '@aechak/design-system/web'
import { useToast } from '@/shared/hooks/useToast'
import {
  ProductEditor,
  ProductMissing,
  emptyProductForm,
  productErrorMessage,
  productImageUrl,
  toDraftRequest,
  toFormValues,
  toRegisterRequest,
  useProductCategories,
  useProductDraft,
  useRegisterProduct,
  useSaveProductDraft,
} from '@/features/products'
import { ShippingPolicySummary } from '@/features/shipping-policy'

/**
 * 임시저장은 실서버(`/sellers/me/product-drafts`)로 나간다 — 첫 저장은 POST, 그 뒤는 PUT이다.
 * 첫 저장이 돌려준 draftId를 URL(`?draftId=`)에 심어 두는 이유는 두 가지다: 저장을 두 번 눌러도
 * 초안이 둘로 늘지 않고(10건 상한이 422/40401이다), 저장한 뒤 새로고침해도 쓰던 내용으로 돌아온다.
 */
export interface ProductNewSearch {
  draftId?: string
}

export const Route = createFileRoute('/products/new')({
  validateSearch: (search: Record<string, unknown>): ProductNewSearch =>
    typeof search['draftId'] === 'string' ? { draftId: search['draftId'] } : {},
  component: ProductNewRoute,
})

// 저장 시각은 BE LocalDateTime(오프셋 없는 KST)이라 Date로 바꾸지 않고 시:분만 잘라 쓴다.
const savedAtLabel = (localDateTime: string) => localDateTime.slice(11, 16)

function ProductNewRoute() {
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  // 로딩 게이트는 진입 시점 draftId만 본다 — 첫 임시저장으로 URL에 draftId가 붙어도 에디터를 다시 마운트하지 않는다.
  const [initialDraftId, setInitialDraftId] = useState(search.draftId)
  const categoriesQuery = useProductCategories()
  const categories = categoriesQuery.data
  const draft = useProductDraft(initialDraftId)
  const register = useRegisterProduct()
  const saveDraft = useSaveProductDraft()
  const toast = useToast()

  const showError = (error: unknown) => toast.show(productErrorMessage(error), 'error')

  // 승격 후 임시저장 재조회가 404여도 이미 받은 data가 남아 있으면 에디터를 유지한다.
  if (initialDraftId && !draft.data && draft.isError) {
    return (
      <ProductMissing
        title="상품 등록"
        message="임시저장한 상품을 찾을 수 없어요"
        action={{
          label: '새로 등록하기',
          onClick: () => {
            setInitialDraftId(undefined)
            navigate({ search: {}, replace: true })
          },
        }}
      />
    )
  }
  // 카테고리 조회(api 호스트 GET /categories)가 실패하면 등록이 전면 불가다 — 연쇄 Select 3단이
  // 전부 이 트리에서 나온다. 임시저장 실패와 같은 모양으로 사유와 재시도를 준다(이전에는 null을
  // 돌려 오류 문구도 로딩 표시도 없는 백지였고, staleTime: Infinity라 자동 재조회도 없었다).
  if (!categories && categoriesQuery.isError) {
    return (
      <ProductMissing
        title="상품 등록"
        message="카테고리를 불러오지 못했어요"
        description="상품을 등록하려면 카테고리가 필요해요. 잠시 후 다시 시도해 주세요."
        action={{ label: '다시 시도', onClick: () => void categoriesQuery.refetch() }}
      />
    )
  }
  if (!categories || (initialDraftId && !draft.data)) {
    return (
      <div className="p-6">
        <PageHeader title="상품 등록" />
        <div role="status" aria-label="등록 양식을 불러오는 중" className="flex flex-col gap-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-2/3" />
          <Skeleton className="h-40 w-full" />
        </div>
      </div>
    )
  }

  return (
    <>
      {/* 배송 정책 칸은 목업 요약 대신 준비 중 안내만 싣는다(seller 모듈에 정책 API 없음). */}
      <ProductEditor
        mode="create"
        initial={
          draft.data ? toFormValues(draft.data, categories, key => productImageUrl(key) ?? '') : emptyProductForm()
        }
        categories={categories}
        shippingSummary={<ShippingPolicySummary />}
        submitting={register.isPending}
        draftSaving={saveDraft.isPending}
        onSaveDraft={values =>
          saveDraft.mutate(
            { body: toDraftRequest(values), draftId: search.draftId },
            {
              onSuccess: saved => {
                // 다음 저장이 PUT이 되도록 id를 URL에 심는다. replace라 뒤로 가기에 단계가 쌓이지 않는다.
                if (saved.draftId !== search.draftId) {
                  void navigate({ search: { draftId: saved.draftId }, replace: true })
                }
                toast.show(`${savedAtLabel(saved.savedAt)}에 임시저장했어요.`)
              },
              // 저장 실패를 침묵하면 셀러가 저장됐다고 믿고 떠나 작업을 잃는다.
              onError: showError,
            },
          )
        }
        onSubmit={values =>
          register.mutate(
            { body: toRegisterRequest(values), draftId: search.draftId },
            {
              onSuccess: () => navigate({ to: '/products', search: { saved: 'created' }, replace: true }),
              onError: showError,
            },
          )
        }
      />
      {toast.element}
    </>
  )
}
