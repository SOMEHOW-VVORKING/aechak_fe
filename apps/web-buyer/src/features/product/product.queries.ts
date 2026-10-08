import { useQuery } from '@tanstack/react-query'
import { errorResponse, getProductDetail, getProductOptions, getProductReviews } from '@aechak/api'
import { findMockProduct, registerProducts } from '@/shared/catalog'
import { getProductDetailMock, type ProductDetail, type ProductReviewEntry } from './product.mock'
import {
  mapProductDetail,
  mapProductOptions,
  mapReviewPreview,
  toCatalogProduct,
  type ProductOptionsView,
} from './product.map'

// 미존재 상품(404)일 때만 목업으로 폴백하고, 다른 오류(500 등)는 그대로 던진다.
function isNotFound(e: unknown): boolean {
  return errorResponse(e)?.status === 404
}

// 상품 상세 — 실 id는 실 API(GET /products/{id}), mock id는 실 API 404 -> 목업 폴백(홈/검색/찜 등
// 목업 진입점이 안 깨지게). 성공 시 실 상품을 레지스트리에 등록해 장바구니/주문(findProduct)에서
// 해석되게 한다. 404가 아닌 오류(500 등)는 그대로 던져 not-found로 오인하지 않는다.
export function useProductDetail(id: string) {
  return useQuery<ProductDetail | null>({
    queryKey: ['product', 'detail', id],
    enabled: id !== '',
    queryFn: async ({ signal }) => {
      try {
        const res = await getProductDetail(id, signal)
        registerProducts([toCatalogProduct(res.data)])
        return mapProductDetail(res.data)
      } catch (e) {
        if (isNotFound(e)) return getProductDetailMock(id)
        throw e
      }
    },
  })
}

// 상품 옵션 — 옵션 시트를 열 때만(enabled) 조회한다(상세 렌더가 옵션을 기다리지 않게 분리).
// 목업 id의 404만 null을 반환해 화면이 목업 옵션으로 폴백한다. 실 id의 404/기타 오류는 그대로 던져
// (isError) 옵션 시트가 담기/구매를 차단하게 한다 — 실 옵션 실패를 "기본 구성" 기본가로 위장하지
// 않기 위함.
export function useProductOptions(id: string, options: { enabled: boolean }) {
  return useQuery<ProductOptionsView | null>({
    queryKey: ['product', 'options', id],
    enabled: options.enabled && id !== '',
    queryFn: async ({ signal }) => {
      try {
        const res = await getProductOptions(id, signal)
        return mapProductOptions(res.data)
      } catch (e) {
        if (isNotFound(e) && findMockProduct(id)) return null
        throw e
      }
    },
  })
}

/** 상세에서 미리 보여줄 리뷰 개수. 서버 요청 size와 화면 렌더 상한이 같은 값을 봐야 한다. */
export const DETAIL_REVIEW_LIMIT = 3

// 상세 리뷰 미리보기 — 상세 응답에는 평균/건수만 있고 목록이 없어 리뷰 목록 API 첫 페이지를 따로
// 부른다. 목록 API는 permitAll이 아니라 JWT 필수(비로그인 401)이므로 호출부가 로그인 상태를
// enabled로 넘겨 비회원은 아예 호출하지 않는다 — 401이 나면 전역 리다이렉트로 상세를 잃는다.
// 리뷰 목록 화면은 useInfiniteQuery라 캐시 구조가 달라 키를 겹치지 않게 'preview'로 분리한다.
export function useProductReviewPreview(id: string, options: { enabled: boolean }) {
  return useQuery<ProductReviewEntry[]>({
    queryKey: ['reviews', 'product', id, 'preview'],
    enabled: options.enabled && id !== '',
    queryFn: async ({ signal }) => {
      try {
        const res = await getProductReviews(
          id,
          { sort: 'latest', photoOnly: false, size: DETAIL_REVIEW_LIMIT },
          signal,
        )
        return mapReviewPreview(res.data.reviews)
      } catch (e) {
        // 미존재/비노출 상품(404)은 미리보기만 비운다 — 상세 본문은 이미 그려져 있어 화면을
        // not-found로 바꾸지 않는다. 다른 오류(500 등)는 그대로 던져 섹션이 조용히 비지 않게 한다.
        if (isNotFound(e)) return []
        throw e
      }
    },
  })
}
