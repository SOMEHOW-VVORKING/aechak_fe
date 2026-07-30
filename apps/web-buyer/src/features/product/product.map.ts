import type { ProductDetailResponse, ProductOptionsResponse, SaleStatus } from '@aechak/api'
import type { ProductSaleStatus } from '@aechak/domain'
import { mediaUrl, type CatalogProduct } from '@/shared/catalog'
import type { ProductDetail } from './product.mock'

const SALE_STATUS: Record<SaleStatus, ProductSaleStatus> = {
  ON_SALE: 'selling',
  OUT_OF_STOCK: 'sold_out',
  SUSPENDED: 'suspended',
  ENDED: 'ended',
}

// 서버 상세 응답 -> 공용 CatalogProduct(레지스트리 등록용). 요약 매퍼와 소스 필드가 달라
// (seller.storeName/representativeImageKey) 별도로 둔다. mainCategory는 실 트리에 대응 개념이 없어
// 중립값('all')으로 둔다(마켓 필터는 서버가 하고, 목업 홈의 in-place 필터는 실 상품을 다루지 않는다).
export function toCatalogProduct(res: ProductDetailResponse): CatalogProduct {
  const isSoldOut = res.saleStatus !== 'ON_SALE'
  const category = [...res.categories].sort((a, b) => a.depth - b.depth)
  return {
    id: res.productId,
    sellerId: `seller-${res.seller.storeName}`,
    code: res.productId,
    name: res.name,
    category: category.at(-1)?.name ?? '',
    price: res.discountPrice ?? res.regularPrice,
    stock: isSoldOut ? 0 : 99,
    status: SALE_STATUS[res.saleStatus],
    inspectionStatus: 'approved',
    createdAt: '',
    originalPrice: res.discountPrice != null ? res.regularPrice : undefined,
    storeName: res.seller.storeName,
    thumbnailUrl: mediaUrl(res.representativeImageKey),
    rating: res.review.averageRating ?? undefined,
    reviewCount: res.review.reviewCount,
    isSoldOut,
    mainCategory: 'all',
  }
}

// 서버 상세 응답 -> 상세 화면 뷰모델(ProductDetail). 실 소스가 있는 필드는 직접 매핑하고,
// 서버에 없는 필드(사양표/리뷰 분포/미리보기 리뷰/도서산간비)는 목업 파생값을 유지한다.
export function mapProductDetail(res: ProductDetailResponse): ProductDetail {
  const base = toCatalogProduct(res)
  const total = res.review.reviewCount
  const price = base.price
  const images = res.images.length
    ? [...res.images].sort((a, b) => a.sortOrder - b.sortOrder).map(img => mediaUrl(img.storageKey))
    : [base.thumbnailUrl ?? mediaUrl(res.representativeImageKey)]
  const categoryNames = [...res.categories].sort((a, b) => a.depth - b.depth).map(c => c.name)
  return {
    ...base,
    images,
    breadcrumb: ['반려동물용품', ...categoryNames],
    // 무료배송은 상품별 실 shipping을 쓴다(전역 30000 규칙 아님) — baseShippingFee 0이거나
    // 판매가가 무료배송 임계 이상이면 무료.
    freeShipping:
      res.shipping.baseShippingFee === 0 ||
      (res.shipping.freeShippingThreshold != null && price >= res.shipping.freeShippingThreshold),
    deliveryFee: res.shipping.baseShippingFee,
    // 도서산간비는 실 API 소스가 없어 undefined(화면에서 문구 숨김) — 목업 고정값을 위장하지 않는다.
    remoteAreaFee: undefined,
    // options/stockCount는 실 상품에선 옵션 API(useProductOptions)가 대신하므로 껍데기만 둔다.
    options: [],
    stockCount: base.isSoldOut ? 0 : 1,
    // 사양표/리뷰 분포/리뷰 목록은 실 API 소스가 없다 — 목업을 실데이터로 위장하지 않으려고
    // 비우고(분포는 undefined로 막대 숨김), 신뢰 가능한 집계 요약(건수/평균)만 노출한다(codex 리뷰 #13).
    specs: [],
    reviewSummary: {
      average: res.review.averageRating ?? 0,
      total,
    },
    reviews: [],
    description: res.description ?? undefined,
    isLiked: res.isLiked,
  }
}

// 옵션 선택 뷰모델 — 옵션 조합 하나를 선택 항목 하나로 평탄화한다. 다운스트림 장바구니 라인은
// 단일 option 문자열 하나로 조합을 특정해야 하고, combination.name이 이미 전체 선택을 담은
// 사람이 읽는 라벨이라 이걸 key(=cartLineKey 구성요소)와 라벨로 함께 쓴다.
export interface OptionChoice {
  key: string
  label: string
  additionalPrice: number
  remainingStock: number | null
  soldOut: boolean
  optionCombinationId?: number
}

export interface ProductOptionsView {
  choices: OptionChoice[]
}

export function mapProductOptions(res: ProductOptionsResponse): ProductOptionsView {
  return {
    choices: res.optionCombinations.map(c => ({
      key: c.name,
      label: c.name,
      additionalPrice: c.additionalPrice,
      remainingStock: c.remainingStock,
      soldOut: c.soldOut,
      optionCombinationId: c.optionCombinationId,
    })),
  }
}

// 목업 상세(옵션 API 404 폴백)용 — 목업의 options: string[]을 동일한 선택 항목 형태로 변환한다.
export function mockOptionsFromDetail(detail: ProductDetail): ProductOptionsView {
  return {
    choices: detail.options.map(o => ({
      key: o,
      label: o,
      additionalPrice: 0,
      remainingStock: detail.stockCount,
      soldOut: detail.stockCount <= 0,
    })),
  }
}
