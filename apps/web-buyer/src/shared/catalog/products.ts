import type { Product } from '@aechak/domain'
import type { MainCategory } from './categories'
import { placeholderImage } from './placeholder'
import { getRegistered } from './registry'

// 구매자 화면 전 공용 mock 상품 카탈로그. 도메인 `Product`를 그대로 쓰되(임의 병렬 타입 금지),
// 필터링에 필요한 대분류(mainCategory)만 뷰용으로 얹은 `CatalogProduct`로 확장한다.
// 홈/카테고리/검색/찜/상세가 모두 이 단일 원본을 읽어 한 화면에서 찜한 상품이 다른 화면에도
// 그대로 반영된다(찜 상태는 wishlist.store가 별도 관리).
export interface CatalogProduct extends Product {
  mainCategory: MainCategory
}

interface ProductSeed {
  id: string
  name: string
  price: number
  originalPrice?: number
  storeName: string
  category: string
  mainCategory: MainCategory
  rating: number
  reviewCount: number
  isSoldOut?: boolean
  createdAt: string
  tone: number
}

function make(seed: ProductSeed): CatalogProduct {
  const sold = seed.isSoldOut ?? false
  return {
    id: seed.id,
    sellerId: `seller-${seed.storeName}`,
    code: seed.id,
    name: seed.name,
    category: seed.category,
    price: seed.price,
    stock: sold ? 0 : 24,
    status: sold ? 'sold_out' : 'selling',
    inspectionStatus: 'approved',
    createdAt: seed.createdAt,
    originalPrice: seed.originalPrice,
    storeName: seed.storeName,
    thumbnailUrl: placeholderImage(seed.tone),
    rating: seed.rating,
    reviewCount: seed.reviewCount,
    isSoldOut: sold,
    mainCategory: seed.mainCategory,
  }
}

// 날짜가 클수록 신상품(신상품 정렬 기준). tone은 썸네일 색 구분용.
const SEEDS: ProductSeed[] = [
  { id: 'p-feeder-5l', name: '고양이 자동 급식기 스마트 5L 앱 연동 타이머', price: 64000, originalPrice: 89000, storeName: '냥이상점', category: '식기/급수기', mainCategory: 'cat', rating: 4.8, reviewCount: 1204, createdAt: '2026-06-13', tone: 30 },
  { id: 'p-feeder-6l', name: '앱 연동 자동 급식기 6L 듀얼 호퍼', price: 78000, storeName: '스마트펫', category: '식기/급수기', mainCategory: 'common', rating: 4.7, reviewCount: 812, createdAt: '2026-06-11', tone: 200 },
  { id: 'p-feeder-steel', name: '스테인리스 급식기 타이머형', price: 45000, originalPrice: 50000, storeName: '코코펫', category: '식기/급수기', mainCategory: 'common', rating: 4.6, reviewCount: 430, createdAt: '2026-06-02', tone: 140 },
  { id: 'p-feeder-wet', name: '습식 자동 급식기 보냉형', price: 52000, storeName: '멍멍마트', category: '식기/급수기', mainCategory: 'common', rating: 4.5, reviewCount: 267, createdAt: '2026-05-28', tone: 90 },
  { id: 'p-leash-5m', name: '자동 리드줄 5m 대형견용', price: 24000, originalPrice: 33000, storeName: '멍멍마트', category: '산책용품', mainCategory: 'dog', rating: 4.4, reviewCount: 356, createdAt: '2026-06-09', tone: 12 },
  { id: 'p-harness-y', name: 'Y자 가슴줄 하네스 푸르름', price: 19900, storeName: '코코펫', category: '산책용품', mainCategory: 'dog', rating: 4.6, reviewCount: 221, createdAt: '2026-06-07', tone: 220 },
  { id: 'p-water-550', name: '휴대용 산책 물병 550ml', price: 12500, storeName: '댕댕상회', category: '산책용품', mainCategory: 'dog', rating: 4.3, reviewCount: 98, createdAt: '2026-06-01', tone: 180 },
  { id: 'p-raincoat', name: '발수 강아지 우비 3종 세트', price: 27000, originalPrice: 32000, storeName: '멍멍마트', category: '의류/악세서리', mainCategory: 'dog', rating: 4.2, reviewCount: 143, createdAt: '2026-05-30', tone: 320 },
  { id: 'p-litter-85', name: '대용량 모래 8.5L 벤토나이트', price: 16000, originalPrice: 18900, storeName: '스마트펫', category: '위생/미용', mainCategory: 'cat', rating: 4.7, reviewCount: 940, createdAt: '2026-06-12', tone: 45 },
  { id: 'p-scratcher', name: '스크래쳐 하우스 2종 세트', price: 29000, storeName: '멍멍마트', category: '침구/하우스', mainCategory: 'cat', rating: 4.5, reviewCount: 512, isSoldOut: true, createdAt: '2026-06-05', tone: 60 },
  { id: 'p-joint-90', name: '관절 영양제 코코넛맛 90정', price: 32000, storeName: '코코펫', category: '건강/영양제', mainCategory: 'common', rating: 4.8, reviewCount: 623, createdAt: '2026-06-10', tone: 110 },
  { id: 'p-dental', name: '덴탈껌 오리지널 30개입', price: 14900, originalPrice: 17000, storeName: '댕댕상회', category: '건강/영양제', mainCategory: 'dog', rating: 4.4, reviewCount: 388, createdAt: '2026-06-03', tone: 160 },
  { id: 'p-salmon-food', name: '강아지 사료 연어 2kg', price: 28000, storeName: '냥이상점', category: '사료/간식', mainCategory: 'dog', rating: 4.6, reviewCount: 705, createdAt: '2026-06-08', tone: 20 },
  { id: 'p-churu', name: '츄르 참치맛 40개입', price: 13900, originalPrice: 16000, storeName: '냥이상점', category: '사료/간식', mainCategory: 'cat', rating: 4.9, reviewCount: 1580, createdAt: '2026-06-06', tone: 340 },
  { id: 'p-cattower', name: '원목 캣타워 3단 대형', price: 89000, storeName: '스마트펫', category: '침구/하우스', mainCategory: 'cat', rating: 4.5, reviewCount: 176, createdAt: '2026-05-25', tone: 75 },
  { id: 'p-coolmat', name: '여름 쿨매트 젤 방석 L', price: 21000, originalPrice: 26000, storeName: '멍멍마트', category: '침구/하우스', mainCategory: 'common', rating: 4.3, reviewCount: 254, createdAt: '2026-06-04', tone: 190 },
  { id: 'p-stroller', name: '반려동물 이동장 유모차 겸용', price: 132000, storeName: '코코펫', category: '이동장/유모차', mainCategory: 'common', rating: 4.6, reviewCount: 132, createdAt: '2026-05-27', tone: 260 },
  { id: 'p-clicker', name: '훈련용 클리커 + 간식 파우치', price: 9900, storeName: '댕댕상회', category: '훈련/행동', mainCategory: 'dog', rating: 4.1, reviewCount: 76, createdAt: '2026-05-22', tone: 130 },
  { id: 'p-nose-toy', name: '노즈워크 담요 장난감', price: 18000, originalPrice: 22000, storeName: '멍멍마트', category: '장난감', mainCategory: 'common', rating: 4.4, reviewCount: 298, createdAt: '2026-06-01', tone: 300 },
  { id: 'p-brush', name: '슬리커 브러시 이중모용', price: 11000, storeName: '코코펫', category: '위생/미용', mainCategory: 'common', rating: 4.5, reviewCount: 410, createdAt: '2026-05-29', tone: 100 },
]

export const CATALOG_PRODUCTS: CatalogProduct[] = SEEDS.map(make)

// 무료배송 판정의 단일 원본 — 상세 배송 문구와 검색 무료배송 필터, 장바구니/주문서 배송비가
// 같은 규칙을 공유해 화면 간 모순이 생기지 않게 한다(상품 데이터에 별도 플래그가 없어 최소주문
// 임계로 파생). isFreeShipping은 상품 단가뿐 아니라 셀러별 선택 합계에도 그대로 쓸 수 있게
// price 하나만 보는 순수 함수로 둔다.
export const FREE_SHIPPING_THRESHOLD = 30000

// 무료배송 조건 미달 시 셀러별로 부과하는 기본 배송비(상품 상세의 deliveryFee와 동일 값).
export const BASE_SHIPPING_FEE = 3000

export function isFreeShipping(product: Pick<Product, 'price'>): boolean {
  return product.price >= FREE_SHIPPING_THRESHOLD
}

// 실 API 상품(레지스트리) 우선, 없으면 목업 카탈로그 폴백. 실 ULID와 목업 `p-*` id는 충돌하지
// 않아 순서는 안전망이다 — 마켓/상세에서 등록된 실 상품이 장바구니/주문에서 그대로 해석된다.
export function findProduct(id: string): CatalogProduct | undefined {
  return getRegistered(id) ?? CATALOG_PRODUCTS.find(p => p.id === id)
}

// 목업 카탈로그만 조회(레지스트리 제외). 실 상세 404 폴백에 쓴다 — findProduct를 쓰면 목록에서
// 이미 등록된 실 ULID를 되살려 백엔드가 미존재로 판정한 상품을 가짜 상세로 보여주는 회귀가 난다.
// 목업 id만 폴백 대상이므로 레지스트리를 건너뛴다.
export function findMockProduct(id: string): CatalogProduct | undefined {
  return CATALOG_PRODUCTS.find(p => p.id === id)
}

export function productsByIds(ids: string[]): CatalogProduct[] {
  return ids.map(findProduct).filter((p): p is CatalogProduct => p != null)
}
