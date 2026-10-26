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
  toFormValues,
  toRegisterRequest,
  useProductCategories,
  useProductDraft,
  useRegisterProduct,
} from '@/features/products'
import { ShippingPolicySummary } from '@/features/shipping-policy'

/**
 * 임시저장 진입점(임시저장 버튼·목록의 초안 Drawer)은 BE에 임시저장 개념이 없어서(`ProductDraft`
 * grep 0건) 숨겼다 — `onSaveDraft`를 넘기지 않으면 에디터가 버튼을 그리지 않는다. 이어쓰기 배선은
 * 남겨 두어(`?draftId=`) 목업 구현과 프리필 테스트가 그대로 돌아간다. BE에 임시저장이 생기면
 * `useSaveProductDraft`를 실 fetcher로 바꾸고 버튼만 다시 연결하면 된다.
 */
export interface ProductNewSearch {
  draftId?: string
}

export const Route = createFileRoute('/products/new')({
  validateSearch: (search: Record<string, unknown>): ProductNewSearch =>
    typeof search['draftId'] === 'string' ? { draftId: search['draftId'] } : {},
  component: ProductNewRoute,
})

function ProductNewRoute() {
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  // 로딩 게이트는 진입 시점 draftId만 본다 — 첫 임시저장으로 URL에 draftId가 붙어도 에디터를 다시 마운트하지 않는다.
  const [initialDraftId, setInitialDraftId] = useState(search.draftId)
  const categoriesQuery = useProductCategories()
  const categories = categoriesQuery.data
  const draft = useProductDraft(initialDraftId)
  const register = useRegisterProduct()
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
      {/* 임시저장 버튼(onSaveDraft·draftSaving)은 위 주석대로 넘기지 않는다 — BE에 임시저장이 없다.
          배송 정책 칸도 목업 요약 대신 준비 중 안내만 싣는다(seller 모듈에 정책 API 없음). */}
      <ProductEditor
        mode="create"
        initial={
          draft.data ? toFormValues(draft.data, categories, key => productImageUrl(key) ?? '') : emptyProductForm()
        }
        categories={categories}
        shippingSummary={<ShippingPolicySummary />}
        submitting={register.isPending}
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
