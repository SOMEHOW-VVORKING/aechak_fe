import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  approveAdminProductInspection,
  getAdminProducts,
  rejectAdminProductInspection,
  resumeAdminProductSale,
  suspendAdminProductSale,
  type AdminProductListData,
  type GetAdminProductsParams,
} from '@aechak/api'
import type {
  ProductCatalogInspectionStatus,
  ProductCatalogItem,
  ProductCatalogSaleStatus,
} from '@aechak/domain'
import {
  inspectionStatusToWire,
  saleStatusToWire,
  toProductCatalogItem,
  type ProductCatalogAction,
} from './product-catalog.map'

// 어드민 상품 카탈로그를 실서버에 붙이는 얇은 어댑터. 생성된 react-query 훅이 아니라 fetcher만
// 소비한다(AGENTS 6-2). 목록 하나로 상세까지 그리는 이유는 상세 조회 엔드포인트가 없고 사유·막은
// 시각까지 목록 행에 실려 있기 때문이다.

export const PRODUCT_CATALOG_QUERY_KEY = ['admin-products'] as const

/** 서버 기본값과 같은 페이지 크기. 서버는 1~100으로 절삭한다(상한을 넘겨도 400이 아니다). */
export const DEFAULT_PAGE_SIZE = 20

export const ALL = 'all'

export interface ProductCatalogListParams {
  inspectionStatus: ProductCatalogInspectionStatus | typeof ALL
  saleStatus: ProductCatalogSaleStatus | typeof ALL
  /** 상품명 또는 셀러 상호명 부분일치. 서버가 둘을 가르지 않는다. */
  keyword: string
  page: number
}

/**
 * 빈 값은 키째 뺀다(AGENTS 6-6). 서버는 공백뿐인 keyword를 조건 없음으로 보지만, 알 수 없는
 * 상태 값도 **400이 아니라 조건 없음**으로 보기 때문에 오타가 전체 조회로 조용히 번진다 —
 * 그래서 전체는 센티넬('all')로 두고 매퍼를 거친 서버 열거 이름만 보낸다.
 */
function listParams(params: ProductCatalogListParams): GetAdminProductsParams {
  const keyword = params.keyword.trim()
  return {
    ...(params.inspectionStatus === ALL
      ? {}
      : { inspectionStatus: inspectionStatusToWire(params.inspectionStatus) }),
    ...(params.saleStatus === ALL ? {} : { saleStatus: saleStatusToWire(params.saleStatus) }),
    ...(keyword === '' ? {} : { keyword }),
    page: params.page,
    size: DEFAULT_PAGE_SIZE,
  }
}

export interface ProductCatalogListResult {
  items: ProductCatalogItem[]
  /** 필터 기준 전체 행 수. 목록 길이로 세면 한 페이지만 센다. */
  totalCount: number
  isLoading: boolean
  isError: boolean
  error: unknown
}

export function useProductCatalog(params: ProductCatalogListParams): ProductCatalogListResult {
  const query = useQuery<AdminProductListData>({
    queryKey: [...PRODUCT_CATALOG_QUERY_KEY, 'list', listParams(params)],
    queryFn: ({ signal }) =>
      getAdminProducts(listParams(params), signal).then(response => response.data),
    placeholderData: keepPreviousData,
  })
  return {
    items: (query.data?.items ?? []).map(toProductCatalogItem),
    totalCount: query.data?.totalCount ?? 0,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
  }
}

export interface ProductCatalogWriteInput {
  productId: string
  action: ProductCatalogAction
  /** 반려·중지는 필수, 재개는 선택, 검수 승인은 본문 자체가 없다. */
  reason: string
}

/**
 * 처리 넷. 전부 204 본문 없음이라 낙관적 갱신이 아니라 **무효화 후 재조회**로 반영한다 —
 * 특히 재개는 막기 직전 상태로 되돌리므로(재고에 따라 ON_SALE·OUT_OF_STOCK·SUSPENDED) 응답만
 * 보고 판매중을 단정할 수 없다. 실패해도 무효화하는 이유는 409·404가 전부 화면이 낡았다는
 * 신호라 그 자리에서 최신 행을 받아야 하기 때문이다.
 *
 * 검수 승인·반려는 검토 큐의 모수도 바꾸지만 그 화면의 쿼리 키를 여기서 무효화하지 않는다 —
 * feature 경계를 넘는 import가 금지되어 있고(AGENTS 1-1), 큐는 자기 쿼리(staleTime 1분)가
 * 다시 받는다.
 */
export function useWriteProductCatalog() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ productId, action, reason }: ProductCatalogWriteInput) => {
      const trimmed = reason.trim()
      if (action === 'approve') return approveAdminProductInspection(productId)
      if (action === 'resume') {
        // 공백뿐인 사유는 적지 않은 것과 같다 — 서버도 그렇게 보고, 본문 자체를 생략할 수 있다.
        return resumeAdminProductSale(productId, trimmed === '' ? undefined : { reason: trimmed })
      }
      if (trimmed === '') {
        // 화면이 버튼을 잠그지만, 요청을 만들 수 있는 자리에서도 끊는다(400을 받아 오지 않는다).
        return Promise.reject(new Error('처리 사유를 입력해 주세요.'))
      }
      return action === 'reject'
        ? rejectAdminProductInspection(productId, { reason: trimmed })
        : suspendAdminProductSale(productId, { reason: trimmed })
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: PRODUCT_CATALOG_QUERY_KEY }),
  })
}
