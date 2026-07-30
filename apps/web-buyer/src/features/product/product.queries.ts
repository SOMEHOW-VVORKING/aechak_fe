import { useQuery } from '@tanstack/react-query'
import { getProductDetail, getProductOptions } from '@aechak/api'
import { findMockProduct, registerProducts } from '@/shared/catalog'
import { getProductDetailMock, type ProductDetail } from './product.mock'
import { mapProductDetail, mapProductOptions, toCatalogProduct, type ProductOptionsView } from './product.map'

// axios는 web-buyer의 직접 의존성이 아니라(@aechak/api의 transitive) import하지 않고 에러 shape로
// 404를 판별한다 — 미존재 상품(404)일 때만 목업으로 폴백하고, 다른 오류(500 등)는 그대로 던진다.
function isNotFound(e: unknown): boolean {
  return (e as { response?: { status?: number } } | null)?.response?.status === 404
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
// 않기 위함(codex 리뷰 #8).
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
