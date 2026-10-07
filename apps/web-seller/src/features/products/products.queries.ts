import { keepPreviousData, skipToken, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  OptionCombinationChangeRequest,
  ProductDraftRequest,
  ProductRegisterRequest,
  ProductUpdateRequest,
  SellerProductSearchParams,
} from './products.contract'
import {
  mockChangeOptionCombination,
  mockChangeSaleStatus,
  mockDeleteProduct,
  mockDeleteProductDraft,
  mockFetchCategories,
  mockFetchProductDetail,
  mockFetchProductDraft,
  mockFetchProductDrafts,
  mockFetchProductOptions,
  mockFetchProducts,
  mockMediaUrl,
  mockRegisterProduct,
  mockSaveProductDraft,
  mockUpdateProduct,
} from './products.mock'

// 목업 fetcher는 실 fetcher처럼 `{ data }`를 돌려주고 여기서 벗긴다(store-settings.queries 관례).
// 실연동은 mock* 호출을 생성 fetcher로 바꾸면 된다.

// 목록/옵션/상세/임시저장이 전부 이 접두를 공유한다 — 변경 후 접두 무효화 한 번으로 목록, 열린 재고
// Drawer, 임시저장 수까지 갱신된다(main.tsx staleTime 60초라 무효화가 필수).
export const PRODUCTS_QUERY_KEY = ['products'] as const

export const useProducts = (params: SellerProductSearchParams) =>
  useQuery({
    queryKey: [...PRODUCTS_QUERY_KEY, 'list', params],
    queryFn: () => mockFetchProducts(params).then(r => r.data),
    // 필터/페이지를 바꾸는 동안 표가 비지 않게 이전 결과를 유지한다.
    placeholderData: keepPreviousData,
  })

export const useProductOptions = (productId: string | null | undefined) =>
  useQuery({
    queryKey: [...PRODUCTS_QUERY_KEY, 'options', productId],
    queryFn: productId ? () => mockFetchProductOptions(productId).then(r => r.data) : skipToken,
  })

// 카테고리는 어드민 마스터 데이터라 세션 중 바뀌지 않는다. 실서버는 api 호스트 GET /categories다
// (셀러 호스트에 없음).
export const useProductCategories = () =>
  useQuery({
    queryKey: ['product-categories'],
    queryFn: () => mockFetchCategories().then(r => r.data),
    staleTime: Infinity,
  })

/** BE 목록/프리필은 저장 키만 준다. 공개 URL은 BE FileStorageAdapter와 같은 `${VITE_MEDIA_BASE_URL}/${key}`. */
export function productImageUrl(key: string): string | null {
  const base = import.meta.env['VITE_MEDIA_BASE_URL']
  return base ? `${base.replace(/\/$/, '')}/${key}` : mockMediaUrl(key)
}

function useProductsMutation<TVariables, TData>(mutationFn: (variables: TVariables) => Promise<{ data: TData }>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (variables: TVariables) => mutationFn(variables).then(r => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PRODUCTS_QUERY_KEY }),
  })
}

export const useUpdateProduct = () =>
  useProductsMutation(({ productId, body }: { productId: string; body: ProductUpdateRequest }) =>
    mockUpdateProduct(productId, body),
  )

export const useChangeSaleStatus = () =>
  useProductsMutation(({ productId, saleStatus }: { productId: string; saleStatus: 'ON_SALE' | 'SUSPENDED' }) =>
    mockChangeSaleStatus(productId, { saleStatus }),
  )

// 옵션 변경 뒤 자동 품절/복귀는 BE가 커밋 후 @Async 리스너로 한다(응답에 판매 상태 없음). 응답 직후
// 무효화로는 반영 전 상태가 올 수 있어 잠시 뒤 목록을 한 번 더 불러온다.
// ponytail: 고정 지연 1회 재조회, 리스너가 이보다 늦으면 다음 refetch(포커스/staleTime)까지 이전 상태가 보인다.
const SALE_STATUS_SYNC_REFETCH_MS = 1000

export const useChangeOptionCombination = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      productId,
      combinationId,
      body,
    }: {
      productId: string
      combinationId: number
      body: OptionCombinationChangeRequest
    }) => mockChangeOptionCombination(productId, combinationId, body).then(r => r.data),
    onSuccess: () => {
      setTimeout(
        () => queryClient.invalidateQueries({ queryKey: [...PRODUCTS_QUERY_KEY, 'list'] }),
        SALE_STATUS_SYNC_REFETCH_MS,
      )
      return queryClient.invalidateQueries({ queryKey: PRODUCTS_QUERY_KEY })
    },
  })
}

// ─── BE 엔드포인트 없음(목업 전용) — products.mock.ts의 같은 구역과 짝 ─────────────

export const useProductDetail = (productId: string | null | undefined) =>
  useQuery({
    queryKey: [...PRODUCTS_QUERY_KEY, 'detail', productId],
    queryFn: productId ? () => mockFetchProductDetail(productId).then(r => r.data) : skipToken,
  })

export const useDeleteProduct = () => useProductsMutation((productId: string) => mockDeleteProduct(productId))

export const useProductDrafts = () =>
  useQuery({
    queryKey: [...PRODUCTS_QUERY_KEY, 'drafts'],
    queryFn: () => mockFetchProductDrafts().then(r => r.data),
  })

export const useProductDraft = (draftId: string | undefined) =>
  useQuery({
    queryKey: [...PRODUCTS_QUERY_KEY, 'drafts', draftId],
    queryFn: draftId ? () => mockFetchProductDraft(draftId).then(r => r.data) : skipToken,
    // 등록이 끝나면 이 임시저장은 404가 정상이다 — 재시도로 등록 완료 이동을 늦추지 않는다.
    retry: false,
  })

export const useSaveProductDraft = () =>
  useProductsMutation(({ body, draftId }: { body: ProductDraftRequest; draftId?: string }) =>
    mockSaveProductDraft(body, draftId),
  )

/** 등록(BE 있음) 뒤 이어쓰던 임시저장을 지운다(목업 전용 단계). 등록 본문은 BE DTO 그대로다. */
export const useRegisterProduct = () =>
  useProductsMutation(async ({ body, draftId }: { body: ProductRegisterRequest; draftId?: string }) => {
    const response = await mockRegisterProduct(body)
    if (draftId) await mockDeleteProductDraft(draftId)
    return response
  })
