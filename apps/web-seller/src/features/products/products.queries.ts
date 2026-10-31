import { keepPreviousData, skipToken, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  changeSellerProductOptionCombination,
  changeSellerProductSaleStatus,
  createSellerProductDraft,
  deleteSellerProductDraft,
  getCategories,
  getSellerProductDetail,
  getSellerProductDraft,
  getSellerProductDrafts,
  getSellerProductOptions,
  getSellerProducts,
  registerSellerProduct,
  updateSellerProduct,
  updateSellerProductDraft,
  type SellerAssignableSaleStatus,
} from '@aechak/api'
import type {
  OptionCombinationChangeRequest,
  SellerProductListResponse,
  ProductDraftRequest,
  ProductRegisterRequest,
  ProductUpdateRequest,
  SellerProductSearchParams,
} from './products.contract'
// 생성된 react-query 훅은 쓰지 않고 fetcher만 소비하고(breeds·store-settings 관례) 이 파일이 자체
// useQuery/useMutation으로 감싼다. fetcher는 `{ data }` 한 겹(ApiResponse)을 돌려주므로 여기서 벗긴다.
// 호스트는 공유 클라이언트가 경로 접두로 가른다 — `/sellers/**`는 seller 모듈(8081), `/categories`와
// `/files/presigned-url`은 api 모듈(8080)이다.
// 이 파일의 모든 훅은 실서버로 나간다 — 목업(products.mock.ts)은 테스트 전용이고 여기서 쓰지 않는다.

// 목록/옵션/상세/임시저장이 전부 이 접두를 공유한다 — 변경 후 접두 무효화 한 번으로 목록, 열린 재고
// Drawer, 임시저장 수까지 갱신된다(main.tsx staleTime 60초라 무효화가 필수).
export const PRODUCTS_QUERY_KEY = ['products'] as const

/**
 * 화면 필터 상태 그대로의 목록 파라미터 — '전체'를 빈 문자열로, 미선택을 빈 배열로 들고 있어도 된다.
 * 와이어 모양으로 좁히는 일은 화면이 아니라 `normalizeSearchParams`가 한 곳에서 책임진다.
 */
export type SellerProductSearchInput = {
  [K in keyof SellerProductSearchParams]?: NonNullable<SellerProductSearchParams[K]> | ''
}

/**
 * 빈 값 파라미터를 키째 빼고 문자열을 trim한다.
 *
 * BE는 값이 빈 파라미터를 "미입력"으로 보지 않고 형식 오류(400 errorCode 90001)로 거절한다 —
 * `?stock=`·`?createdFrom=`·`?createdTo=`가 그렇고(SellerProductListIntegrationTest가 문구까지
 * 고정한다) `?saleStatus=`·`?inspectionStatus=`·`?sort=`도 parseEnum/parseSort에서 같은 400이 된다.
 * `keyword`(trim 후 빈 값은 null)와 `category`(Long? 빈 값은 null)만 예외지만 그 둘도 함께 뺀다 —
 * `{ keyword: '' }`와 `{}`가 같은 요청이므로 캐시 키도 같아야 한다. 화면 필터는 '전체'를 빈 문자열로
 * 들고 있으므로 그대로 넘기면 전 목록 조회가 400으로 깨진다. 숫자 0(`page=0`)과 `false`는 값이
 * 있는 것이므로 남긴다.
 *
 * 배열(saleStatus·inspectionStatus)은 비면 키째 뺀다 — 공유 클라이언트의 `paramsSerializer`가 반복
 * 파라미터로 직렬화하므로 값이 있는 배열은 그대로 넘기면 `?saleStatus=A&saleStatus=B`가 된다.
 */
export function normalizeSearchParams(params: SellerProductSearchInput): SellerProductSearchParams {
  const normalized: Record<string, unknown> = {}
  // 값 타입이 필드마다 다르므로 unknown으로 받아 모양으로 가른다(enum 배열 원소와 '' 비교가 안 된다).
  for (const [key, value] of Object.entries(params) as [string, unknown][]) {
    if (value == null) continue
    if (typeof value === 'string') {
      const trimmed = value.trim()
      if (trimmed !== '') normalized[key] = trimmed
      continue
    }
    if (Array.isArray(value)) {
      const kept = value.filter(item => item != null && item !== '')
      if (kept.length > 0) normalized[key] = kept
      continue
    }
    normalized[key] = value
  }
  return normalized as SellerProductSearchParams
}

export const useProducts = (params: SellerProductSearchInput) => {
  // 정규화한 값으로 키를 만든다 — `{ keyword: '' }`와 `{}`가 같은 요청이므로 캐시도 같아야 한다.
  const query = normalizeSearchParams(params)
  // 제네릭을 명시한다 — `placeholderData: keepPreviousData`와 `queryFn`의 구조 분해(`{ signal }`)가
  // 겹치면 추론이 TData에 keepPreviousData의 함수 타입까지 섞어 넣어 `data.totalPages`가 깨진다.
  return useQuery<SellerProductListResponse>({
    queryKey: [...PRODUCTS_QUERY_KEY, 'list', query],
    queryFn: ({ signal }) => getSellerProducts(query, signal).then(r => r.data),
    // 필터/페이지를 바꾸는 동안 표가 비지 않게 이전 결과를 유지한다.
    placeholderData: keepPreviousData,
  })
}

export const useProductOptions = (productId: string | null | undefined) =>
  useQuery({
    queryKey: [...PRODUCTS_QUERY_KEY, 'options', productId],
    queryFn: productId
      ? ({ signal }) => getSellerProductOptions(productId, signal).then(r => r.data)
      : skipToken,
  })

// 카테고리는 어드민 마스터 데이터라 세션 중 바뀌지 않는다. 셀러 호스트에는 없어서 api 호스트로 나간다
// (경로 분기가 `/categories`를 api로 보낸다).
export const useProductCategories = () =>
  useQuery({
    queryKey: ['product-categories'],
    queryFn: ({ signal }) => getCategories(signal).then(r => r.data),
    staleTime: Infinity,
  })

/**
 * BE 목록/옵션 응답은 저장 키만 준다. 공개 URL은 BE FileStorageAdapter와 같은
 * `${VITE_MEDIA_BASE_URL}/${key}`로 조립한다. base가 설정돼 있지 않으면 URL을 지어내지 않고 null을
 * 돌려준다 — 화면은 썸네일 자리를 아이콘 플레이스홀더로 채운다.
 */
export function productImageUrl(key: string): string | null {
  const base = import.meta.env['VITE_MEDIA_BASE_URL']
  return base ? `${base.replace(/\/$/, '')}/${key}` : null
}

function useProductsMutation<TVariables, TData>(mutationFn: (variables: TVariables) => Promise<{ data: TData }>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (variables: TVariables) => mutationFn(variables).then(r => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PRODUCTS_QUERY_KEY }),
  })
}

/** 수정 폼 프리필. 단건 조회가 현재 열려 있는 이미지 키만 주므로 응답을 그대로 되돌려 보내도 된다. */
export const useProductDetail = (productId: string | null | undefined) =>
  useQuery({
    queryKey: [...PRODUCTS_QUERY_KEY, 'detail', productId],
    queryFn: productId
      ? ({ signal }) => getSellerProductDetail(productId, signal).then(r => r.data)
      : skipToken,
  })

export const useUpdateProduct = () =>
  useProductsMutation(({ productId, body }: { productId: string; body: ProductUpdateRequest }) =>
    updateSellerProduct(productId, body),
  )

export const useChangeSaleStatus = () =>
  useProductsMutation(
    ({ productId, saleStatus }: { productId: string; saleStatus: SellerAssignableSaleStatus }) =>
      changeSellerProductSaleStatus(productId, { saleStatus }),
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
    }) => changeSellerProductOptionCombination(productId, combinationId, body).then(r => r.data),
    onSuccess: () => {
      setTimeout(
        () => queryClient.invalidateQueries({ queryKey: [...PRODUCTS_QUERY_KEY, 'list'] }),
        SALE_STATUS_SYNC_REFETCH_MS,
      )
      return queryClient.invalidateQueries({ queryKey: PRODUCTS_QUERY_KEY })
    },
  })
}

/**
 * 등록. 이어쓰던 임시저장은 등록이 끝난 뒤 지운다 — 등록 요청에 초안 id를 실을 자리가 없어 두 단계다.
 *
 * 초안 삭제 실패는 등록 실패로 올리지 않는다. 상품은 이미 만들어졌으므로 여기서 reject하면 화면이
 * "등록하지 못했어요"라는 거짓을 띄우고 셀러가 같은 상품을 한 번 더 등록한다. 남은 초안은 목록 무효화
 * 뒤 Drawer에 그대로 보이고 셀러가 지울 수 있다.
 */
export const useRegisterProduct = () =>
  useProductsMutation(async ({ body, draftId }: { body: ProductRegisterRequest; draftId?: string }) => {
    const response = await registerSellerProduct(body)
    if (draftId) await deleteSellerProductDraft(draftId).catch(() => undefined)
    return response
  })

// ─── 임시저장 ─────────────────────────────────────────────────────────────────
// 목록은 상한이 10건이라 페이지네이션이 없다. 저장은 draftId가 있으면 PUT(덮어쓰기), 없으면 POST다 —
// 한 번 저장한 뒤에도 POST로 보내면 저장마다 초안이 쌓여 10건 상한(422/40401)에 걸리므로, 화면은 첫
// 저장이 돌려준 draftId를 들고 있어야 한다.

export const useProductDrafts = () =>
  useQuery({
    queryKey: [...PRODUCTS_QUERY_KEY, 'drafts'],
    queryFn: ({ signal }) => getSellerProductDrafts(signal).then(r => r.data),
  })

export const useProductDraft = (draftId: string | undefined) =>
  useQuery({
    queryKey: [...PRODUCTS_QUERY_KEY, 'drafts', draftId],
    queryFn: draftId ? ({ signal }) => getSellerProductDraft(draftId, signal).then(r => r.data) : skipToken,
    // 등록이 끝나면 이 임시저장은 404가 정상이다 — 재시도로 등록 완료 이동을 늦추지 않는다.
    retry: false,
  })

export const useSaveProductDraft = () =>
  useProductsMutation(({ body, draftId }: { body: ProductDraftRequest; draftId?: string }) =>
    draftId ? updateSellerProductDraft(draftId, body) : createSellerProductDraft(body),
  )

/** 삭제는 되돌릴 수 없다 — 호출부가 확인 한 단계를 두고 부른다. 204라 본문이 없다. */
export const useDeleteProductDraft = () =>
  useProductsMutation(({ draftId }: { draftId: string }) =>
    deleteSellerProductDraft(draftId).then(() => ({ data: null })),
  )
