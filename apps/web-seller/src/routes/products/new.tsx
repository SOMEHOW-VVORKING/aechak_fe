import { useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { EmptyState, PageHeader, Toast } from '@aechak/design-system/web'
import {
  ProductEditor,
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

export interface ProductNewSearch {
  draftId?: string
}

export const Route = createFileRoute('/products/new')({
  validateSearch: (search: Record<string, unknown>): ProductNewSearch =>
    typeof search['draftId'] === 'string' ? { draftId: search['draftId'] } : {},
  component: ProductNewRoute,
})

interface ToastState {
  message: string
  variant: 'success' | 'error'
}

function ProductNewRoute() {
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  // 로딩 게이트는 진입 시점 draftId만 본다 — 첫 임시저장으로 URL에 draftId가 붙어도 에디터를 다시 마운트하지 않는다.
  const [initialDraftId, setInitialDraftId] = useState(search.draftId)
  const { data: categories } = useProductCategories()
  const draft = useProductDraft(initialDraftId)
  const register = useRegisterProduct()
  const saveDraft = useSaveProductDraft()
  const [toast, setToast] = useState<ToastState | null>(null)

  const showError = (error: unknown) => setToast({ message: productErrorMessage(error), variant: 'error' })

  // 승격 후 임시저장 재조회가 404여도 이미 받은 data가 남아 있으면 에디터를 유지한다.
  if (initialDraftId && !draft.data && draft.isError) {
    return (
      <div className="p-6">
        <PageHeader title="상품 등록" />
        <EmptyState
          title="임시저장한 상품을 찾을 수 없어요"
          action={{
            label: '새로 등록하기',
            onClick: () => {
              setInitialDraftId(undefined)
              navigate({ search: {}, replace: true })
            },
          }}
        />
      </div>
    )
  }
  if (!categories || (initialDraftId && !draft.data)) return null

  return (
    <>
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
              onSuccess: res => {
                setToast({ message: '임시저장했어요.', variant: 'success' })
                navigate({ search: { draftId: res.productId }, replace: true })
              },
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
      {toast && <Toast open message={toast.message} variant={toast.variant} onClose={() => setToast(null)} />}
    </>
  )
}
