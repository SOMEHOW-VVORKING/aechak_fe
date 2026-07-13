import type { Product } from '@aechak/domain'
import { findProduct, isFreeShipping, mainCategoryLabel, placeholderImage, type CatalogProduct } from '@/shared/catalog'

export interface ProductSpec {
  label: string
  value: string
}

export interface ProductReviewEntry {
  author: string
  rating: 1 | 2 | 3 | 4 | 5
  date: string
  content: string
  option?: string
  verifiedPurchase?: boolean
  images?: string[]
}

export interface ProductReviewSummary {
  average: number
  total: number
  // 5★→1★ 순 비율(%). 합이 100에 가깝게 구성.
  distribution: [number, number, number, number, number]
}

// 도메인 `Product`를 상세 화면용으로 확장한 뷰모델(임의 병렬 타입 아님 — Product를 그대로 상속).
export interface ProductDetail extends Product {
  images: string[]
  breadcrumb: string[]
  // 무료배송 여부는 shared/catalog의 isFreeShipping이 단일 원본(검색 무료배송 필터와 동일 규칙).
  freeShipping: boolean
  deliveryFee: number
  remoteAreaFee: number
  options: string[]
  stockCount: number
  specs: ProductSpec[]
  reviewSummary: ProductReviewSummary
  reviews: ProductReviewEntry[]
}

const FEEDER_SPECS: ProductSpec[] = [
  { label: '용량', value: '5L / 대용량' },
  { label: '급여 방식', value: '앱 타이머 / 하루 최대 6회' },
  { label: '전원', value: 'USB-C / 배터리 겸용' },
  { label: '제조국', value: '대한민국' },
]

const GENERIC_SPECS: ProductSpec[] = [
  { label: '구성', value: '본품 1개' },
  { label: '소재', value: '식품용 실리콘 / ABS' },
  { label: '원산지', value: '대한민국' },
  { label: '보관 방법', value: '직사광선을 피해 보관' },
]

const OPTIONS_BY_ID: Record<string, string[]> = {
  'p-feeder-5l': ['용량 5L / 화이트', '용량 5L / 그레이', '용량 8L / 화이트'],
}

const SPECS_BY_ID: Record<string, ProductSpec[]> = {
  'p-feeder-5l': FEEDER_SPECS,
  'p-feeder-6l': FEEDER_SPECS,
  'p-feeder-steel': FEEDER_SPECS,
}

function sampleReviews(product: Product): ProductReviewEntry[] {
  const option = OPTIONS_BY_ID[product.id]?.[0] ?? '기본 구성'
  return [
    {
      author: '코코****',
      rating: 5,
      date: '2026.06.10',
      content: '급식 시간 잘 맞춰주고 앱 알림도 편해요. 우리 아이가 잘 먹어요!',
      option,
      verifiedPurchase: true,
      images: [placeholderImage(40), placeholderImage(120)],
    },
    {
      author: '멍멍****',
      rating: 4,
      date: '2026.06.08',
      content: '조립이 쉽고 청소도 편해요. 배송도 빨랐습니다.',
      option,
      verifiedPurchase: true,
    },
    {
      author: '하늘****',
      rating: 5,
      date: '2026.06.05',
      content: '설정이 직관적이라 좋아요. 재구매 의사 있어요.',
      option,
    },
    // 4번째 이후 리뷰는 상세에서 최대 3개까지만 미리보기로 노출되고 "전체보기"에서만 보인다.
    {
      author: '보리****',
      rating: 4,
      date: '2026.06.02',
      content: '무난하게 잘 쓰고 있어요. 전체보기에서만 보이는 리뷰예요.',
      option,
    },
  ]
}

function buildDetail(base: CatalogProduct): ProductDetail {
  const total = base.reviewCount ?? 0
  return {
    ...base,
    images: [
      base.thumbnailUrl ?? placeholderImage(30),
      placeholderImage(90),
      placeholderImage(170),
      placeholderImage(260),
    ],
    breadcrumb: ['반려동물용품', mainCategoryLabel(base.mainCategory), base.category],
    freeShipping: isFreeShipping(base),
    deliveryFee: 3000,
    remoteAreaFee: 5000,
    options: OPTIONS_BY_ID[base.id] ?? ['기본 구성'],
    stockCount: base.isSoldOut ? 0 : 12,
    specs: SPECS_BY_ID[base.id] ?? GENERIC_SPECS,
    reviewSummary: {
      average: base.rating ?? 0,
      total,
      distribution: total > 0 ? [84, 11, 3, 1, 1] : [0, 0, 0, 0, 0],
    },
    reviews: total > 0 ? sampleReviews(base) : [],
  }
}

// 알 수 없는 id는 첫 상품으로 조용히 대체하지 않고 null을 반환한다 — 소비 측에서
// not-found 상태를 렌더링하게 해 잘못된 URL에 엉뚱한 상품/찜 상태가 보이지 않게 한다.
export function getProductDetailMock(id: string): ProductDetail | null {
  const found = findProduct(id)
  return found ? buildDetail(found) : null
}

export function fetchProductDetail(id: string): Promise<ProductDetail | null> {
  return new Promise(resolve => {
    setTimeout(() => resolve(getProductDetailMock(id)), 300)
  })
}
