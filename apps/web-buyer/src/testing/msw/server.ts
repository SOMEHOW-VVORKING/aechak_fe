import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { axiosInstance, type ReviewItemResponse } from '@aechak/api'
import {
  ClaimStatus,
  OrderListStatusFilter,
  OrderStatus,
  PaymentMethod,
  type CartItemStatus,
  type ClaimItemResponse,
  type ClaimReasonCatalogResponse,
  type ClaimType,
  type OrderActiveClaimResponse,
  type OrderDeliveryAddressResponse,
  type OrderDetailResponse,
  type OrderItemStatus,
  type OrderShipmentResponse,
  type PaymentCompletionStatus,
  type PreparePaymentResponse,
} from '@aechak/api'
import { CATALOG_PRODUCTS, FREE_SHIPPING_THRESHOLD, placeholderImage } from '@/shared/catalog'
import { snsHandlers } from './sns'
import { productInquiryHandlers } from './product-inquiry'
import { noticeHandlers } from './notices'

// vitest 공용 MSW 서버(test-setup.ts가 수명주기를 관리). 실제 HTTP 경로(URL·쿼리 파라미터·
// envelope 해석)까지 검증하려고 모듈 모킹 대신 네트워크 레벨에서 가로챈다.
// 테스트는 main.tsx를 안 거치므로 baseURL은 client.ts 기본값(http://localhost:8080/api/v1) —
// 문자열을 중복 선언하지 않고 인스턴스에서 읽어 계약 변경에 자동 추종한다.
const base = axiosInstance.defaults.baseURL ?? ''
export const BREEDS_URL = `${base}/breeds`
export const WEB_REFRESH_URL = `${base}/auth/web/refresh`
export const WEB_LOGOUT_URL = `${base}/auth/web/logout`
export const DELIVERY_ADDRESSES_URL = `${base}/delivery-addresses`
export const CATEGORIES_URL = `${base}/categories`
export const PRODUCTS_URL = `${base}/products`
export const PRODUCT_DETAIL_URL = `${base}/products/:productId`
export const PRODUCT_OPTIONS_URL = `${base}/products/:productId/options`
export const PRODUCT_REVIEWS_URL = `${base}/products/:productId/reviews`
export const PRODUCT_REVIEW_SUMMARY_URL = `${base}/products/:productId/review-summary`
export const REVIEWS_URL = `${base}/reviews`
export const REVIEW_DETAIL_URL = `${base}/reviews/:reviewId`
export const REPORTS_URL = `${base}/reports`
export const MY_REVIEWS_URL = `${base}/users/me/reviews`
export const PRODUCT_LIKE_URL = `${base}/products/:productId/like`
export const LIKED_PRODUCTS_URL = `${base}/users/me/liked-products`
export const SEARCH_PRODUCTS_URL = `${base}/search/products`
export const SEARCH_KEYWORDS_URL = `${base}/search/keywords`
export const RECENT_KEYWORDS_URL = `${base}/search/recent-keywords`
export const HOME_URL = `${base}/home`

const SEARCH_RECENT_KEYWORD_FIXTURES = [
  { id: 1, keyword: '자동 급식기', searchedAt: '2026-08-06T09:00:00' },
  { id: 2, keyword: '고양이 모래', searchedAt: '2026-08-05T09:00:00' },
  { id: 3, keyword: '츄르', searchedAt: '2026-08-04T09:00:00' },
  { id: 4, keyword: '스크래쳐', searchedAt: '2026-08-03T09:00:00' },
]
let searchRecentKeywords = [...SEARCH_RECENT_KEYWORD_FIXTURES]

export function resetSearchFixtures(): void {
  searchRecentKeywords = [...SEARCH_RECENT_KEYWORD_FIXTURES]
}

// 카테고리 트리 픽스처 — 대분류 2 + 각 중분류 2. name은 마켓 칩/그리드 라벨로 그대로 쓰인다.
export const CATEGORY_FIXTURES = [
  {
    categoryId: 1,
    name: '강아지',
    iconUrl: null,
    sortOrder: 1,
    children: [
      { categoryId: 11, name: '사료/간식', iconUrl: null, sortOrder: 1, children: [] },
      { categoryId: 12, name: '산책용품', iconUrl: null, sortOrder: 2, children: [] },
    ],
  },
  {
    categoryId: 2,
    name: '고양이',
    iconUrl: null,
    sortOrder: 2,
    children: [
      { categoryId: 21, name: '위생/미용', iconUrl: null, sortOrder: 1, children: [] },
      { categoryId: 22, name: '사료/간식', iconUrl: null, sortOrder: 2, children: [] },
    ],
  },
]

// 중분류 -> 대분류 부모 맵(카테고리 필터의 category.id==it OR parent.id==it 흉내용).
const CATEGORY_PARENT: Record<number, number | undefined> = { 11: 1, 12: 1, 21: 2, 22: 2 }

interface ProductFixture {
  categoryId: number
  product: {
    productId: string
    name: string
    sellerName: string
    thumbnailImageKey: string | null
    regularPrice: number
    discountPrice: number | null
    discountRate: number | null
    saleStatus: 'ON_SALE' | 'OUT_OF_STOCK' | 'SUSPENDED' | 'ENDED'
    averageRating: number | null
    reviewCount: number
    // 찜 목록만 false가 나올 수 있다 — 그 케이스는 이 배열을 고치지 말고 seed 시점에 오버라이드할 것
    // (여기 false 행을 넣으면 카탈로그/검색 핸들러가 서버가 줄 수 없는 응답을 흉내내게 된다).
    isViewable: boolean
    isPurchasable: boolean
  }
}

// 상품 목록 픽스처. categoryId(중분류)로 필터, price_asc면 유효가격 오름차순, 커서는 인덱스(2개씩).
export const PRODUCT_FIXTURES: ProductFixture[] = [
  makeFixture(11, 'p-real-1', '강아지 연어 사료 2kg', 28000, null),
  makeFixture(12, 'p-real-2', '자동 리드줄 5m 대형견용', 33000, 24000),
  makeFixture(21, 'p-real-3', '벤토나이트 고양이 모래 8.5L', 16000, null),
  makeFixture(22, 'p-real-4', '참치 츄르 40개입', 13900, null),
  makeFixture(21, 'p-real-5', '스크래쳐 하우스 2종 세트', 29000, null, 'OUT_OF_STOCK'),
  makeFixture(22, 'p-real-6', '원목 캣타워 3단 대형', 89000, null),
]

function makeFixture(
  categoryId: number,
  productId: string,
  name: string,
  regularPrice: number,
  discountPrice: number | null,
  saleStatus: ProductFixture['product']['saleStatus'] = 'ON_SALE',
): ProductFixture {
  return {
    categoryId,
    product: {
      productId,
      name,
      sellerName: '리얼상점',
      thumbnailImageKey: null,
      regularPrice,
      discountPrice,
      discountRate:
        discountPrice != null ? Math.round((1 - discountPrice / regularPrice) * 100) : null,
      saleStatus,
      averageRating: 4.5,
      reviewCount: 12,
      isViewable: true,
      isPurchasable: saleStatus === 'ON_SALE',
    },
  }
}

// 상품 상세/옵션 실 픽스처(ULID). 이 id만 200이고 나머지(목업 id 포함)는 404 -> 화면 폴백 경로를 탄다.
export const REAL_PRODUCT_ID = '01J000000000000000000TEST'

export const REAL_PRODUCT_DETAIL = {
  productId: REAL_PRODUCT_ID,
  name: '리얼 프리미엄 자동 급식기',
  description: '앱으로 급여 시간을 관리하는 실데이터 급식기예요.',
  representativeImageKey: null,
  images: [],
  regularPrice: 89000,
  discountPrice: 64000,
  discountRate: 28,
  saleStatus: 'ON_SALE' as const,
  shipping: { baseShippingFee: 3000, freeShippingThreshold: 50000 },
  seller: { storeName: '리얼상점', profileImageKey: null },
  review: { reviewCount: 128, averageRating: 4.7 },
  categories: [
    { categoryId: 1, name: '강아지', depth: 1 },
    { categoryId: 11, name: '사료/간식', depth: 2 },
  ],
  isLiked: false,
  isPurchasable: true,
}

export const REAL_PRODUCT_OPTIONS = {
  optionGroups: [
    {
      optionGroupId: 1,
      name: '구성',
      sortOrder: 1,
      values: [
        { optionValueId: 1, name: '기본형', sortOrder: 1 },
        { optionValueId: 2, name: '프리미엄형', sortOrder: 2 },
        { optionValueId: 3, name: '한정형', sortOrder: 3 },
      ],
    },
  ],
  optionCombinations: [
    {
      optionCombinationId: 1,
      name: '기본형',
      additionalPrice: 0,
      optionValueIds: [1],
      remainingStock: 10,
      soldOut: false,
    },
    {
      optionCombinationId: 2,
      name: '프리미엄형',
      additionalPrice: 5000,
      optionValueIds: [2],
      remainingStock: 5,
      soldOut: false,
    },
    {
      optionCombinationId: 3,
      name: '한정형',
      additionalPrice: 0,
      optionValueIds: [3],
      remainingStock: 0,
      soldOut: true,
    },
  ],
}
// 실 상품 리뷰 픽스처(REAL_PRODUCT_ID). id 내림차순=최신순. 사진 있는 리뷰 3건(501/503/505),
// 없는 리뷰 2건(502/504)으로 photoOnly 필터를 검증한다.
// 로컬 인터페이스가 아니라 생성 타입을 쓴다 — 서버 계약에 필수 필드가 늘면(isMine 등) tsc가
// 픽스처 누락을 잡아준다. 로컬 인터페이스면 필드가 빠져도 통과하고 런타임에만 undefined가 샌다.
export const REAL_PRODUCT_REVIEWS: ReviewItemResponse[] = [
  {
    reviewId: 505,
    isMine: false,
    rating: 2,
    content: '소음이 조금 있어요. 기능은 무난해요.',
    optionName: '기본형',
    authorNickname: '냥집사',
    authorProfileImageUrl: null,
    createdAt: '2026-08-10T09:00:00',
    images: [{ imageUrl: placeholderImage(200), sortOrder: 0 }],
    // 셀러 답글이 실린 유일한 행 — 구매자 목록에 답글이 함께 나오는지(SCRUM-315)를 이 행이 고정한다.
    sellerReply: {
      content: '소음은 설치면을 평평하게 두면 줄어요. 불편하셨다면 교환도 도와드릴게요.',
      repliedAt: '2026-08-11T10:00:00',
      updatedAt: '2026-08-11T10:00:00',
    },
  },
  {
    reviewId: 504,
    isMine: false,
    rating: 5,
    content: '두 번째 구매예요. 믿고 쓰는 제품이라 계속 살 것 같아요.',
    optionName: '프리미엄형',
    authorNickname: '하늘**',
    authorProfileImageUrl: null,
    createdAt: '2026-08-09T09:00:00',
    images: [],
  sellerReply: null,
  },
  {
    reviewId: 503,
    isMine: false,
    rating: 3,
    content: '가격 대비 무난해요. 조금 더 컸으면 하는 아쉬움은 있어요.',
    optionName: '기본형',
    authorNickname: '코코****',
    authorProfileImageUrl: null,
    createdAt: '2026-08-08T09:00:00',
    images: [{ imageUrl: placeholderImage(120), sortOrder: 0 }],
  sellerReply: null,
  },
  {
    reviewId: 502,
    isMine: false,
    rating: 4,
    content: '배송도 빠르고 포장도 튼튼했어요. 실물이 더 좋아요.',
    optionName: '프리미엄형',
    authorNickname: '멍토끼',
    authorProfileImageUrl: null,
    createdAt: '2026-08-07T09:00:00',
    images: [],
  sellerReply: null,
  },
  {
    reviewId: 501,
    isMine: false,
    rating: 5,
    content: '기대 이상이에요. 마감도 꼼꼼하고 우리 아이가 잘 써요. 재구매 의사 있어요.',
    optionName: '프리미엄형',
    authorNickname: '집사7**',
    authorProfileImageUrl: null,
    createdAt: '2026-08-06T09:00:00',
    sellerReply: null,
    images: [
      { imageUrl: placeholderImage(40), sortOrder: 0 },
      { imageUrl: placeholderImage(70), sortOrder: 1 },
    ],
  },
]

// 평점 요약 — photoOnly와 무관하게 전체 가시 리뷰 기준(서버 계약과 동일). 없는 별점도 0을 담는다.
function realReviewSummary() {
  const all = REAL_PRODUCT_REVIEWS
  const dist: Record<string, number> = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 }
  for (const r of all) dist[String(r.rating)] = (dist[String(r.rating)] ?? 0) + 1
  const averageRating = all.length
    ? Math.round((all.reduce((s, r) => s + r.rating, 0) / all.length) * 100) / 100
    : null
  return { reviewCount: all.length, averageRating, ratingDistribution: dist }
}

// 내 찜 목록 상태(서버 소유 목록의 축소). seedLikedProducts로 세우고 like/unlike로 갱신한다.
// 카드 형태는 상품 목록과 동일한 ProductSummaryResponse(= ProductFixture['product']).
let likedProductRows: ProductFixture['product'][] = []

/** 테스트마다 찜 목록을 세운다. 인자 없이 부르면 빈 목록. */
export function seedLikedProducts(rows: ProductFixture['product'][] = []): void {
  likedProductRows = rows.map(row => ({ ...row }))
}

/** 상태 누수 방지 — test-setup afterEach에서 호출. */
export function resetLikedProducts(): void {
  likedProductRows = []
}

// 카드 응답의 isLiked 판정 — BE는 로그인 사용자면 목록/검색/찜목록 카드마다 찜 여부를 채운다.
// 여기선 seedLikedProducts/like-POST로 쌓인 likedProductRows를 진실 소스로 삼는다(미시드면 전부 false).
function isLikedFixture(productId: string): boolean {
  return likedProductRows.some(row => row.productId === productId)
}

const likedProductHandlers = [
  // 내 찜 목록 — 커서(인덱스) 페이지네이션. 상품 목록과 동일한 ProductListResponse 봉투.
  http.get(LIKED_PRODUCTS_URL, ({ request }) => {
    const url = new URL(request.url)
    const cursor = url.searchParams.get('cursor')
    const size = Number(url.searchParams.get('size') ?? 20)
    const start = cursor ? Number(cursor) : 0
    const page = likedProductRows.slice(start, start + size)
    const nextIndex = start + size
    const hasNext = nextIndex < likedProductRows.length
    return HttpResponse.json({
      data: {
        // 찜 목록 카드는 정의상 전부 찜 상태다.
        products: page.map(product => ({ ...product, isLiked: true })),
        totalCount: start === 0 ? likedProductRows.length : null,
        nextCursor: hasNext ? String(nextIndex) : null,
        hasNext,
      },
    })
  }),
  // 찜하기 — 멱등(이미 찜한 상품도 201). 픽스처에 있으면 목록 앞에 추가한다(undo 재-like 대비).
  http.post(PRODUCT_LIKE_URL, ({ params }) => {
    const id = String(params.productId)
    if (!likedProductRows.some(p => p.productId === id)) {
      const fixture = PRODUCT_FIXTURES.find(f => f.product.productId === id)?.product
      if (fixture) likedProductRows = [fixture, ...likedProductRows]
    }
    return new HttpResponse(null, { status: 201 })
  }),
  // 찜 해제 — 멱등(찜하지 않은 상품도 204).
  http.delete(PRODUCT_LIKE_URL, ({ params }) => {
    const id = String(params.productId)
    likedProductRows = likedProductRows.filter(p => p.productId !== id)
    return new HttpResponse(null, { status: 204 })
  }),
]

export const PETS_URL = `${base}/users/me/pets`
export const PRESIGNED_URL = `${base}/files/presigned-url`
export const POINTS_URL = `${base}/users/me/points`

// 적립금 잔액은 서버가 소유하는 단일 정수(원 단위). 상태로 두어 테스트가 잔액을 세울 수 있게 한다.
let pointBalance = 0

/** 테스트마다 적립금 잔액을 세운다. 인자 없이 부르면 0(미시드 기본값). */
export function seedPointBalance(balance = 0): void {
  pointBalance = balance
}

// 서버 시드(V1__create_and_seed_breeds.sql)의 실제 id·라벨 부분집합. 종별 정렬(가나다순) +
// sentinel('세상에 하나뿐인 믹스'/'기타') 후순 구조를 그대로 축소했다.
export const BREED_FIXTURES = {
  DOG: [
    { breedId: 3, label: '골든 리트리버' },
    { breedId: 279, label: '푸들' },
    { breedId: 298, label: '세상에 하나뿐인 믹스' },
    { breedId: 299, label: '기타' },
  ],
  CAT: [
    { breedId: 369, label: '코리안 숏헤어' },
    { breedId: 385, label: '세상에 하나뿐인 믹스' },
    { breedId: 386, label: '기타' },
  ],
}

// 배송지는 상태가 있는 리소스라 요청 간 값이 이어져야 한다(추가→목록 반영 등).
// 서버가 소유하는 불변식(기본 유일성·개수 제한)은 흉내 내지 않는다. 응답 계약만 재현한다.
// 예외는 삭제 응답의 promotedDefaultAddressId: 화면이 이 값으로 분기하므로 없으면 그 경로가 죽는다.
export interface DeliveryAddressRow {
  addressId: number
  receiverName: string
  contactNumber: string
  zipCode: string
  baseAddress: string
  detailAddress?: string | null
  deliveryMemo?: string | null
  label?: string | null
  isDefault: boolean
}

let deliveryAddressRows: DeliveryAddressRow[] = []
let deliveryAddressSeq = 0

/** 테스트마다 배송지 상태를 세운다. 인자 없이 부르면 빈 목록. */
export function seedDeliveryAddresses(rows: DeliveryAddressRow[] = []): void {
  deliveryAddressRows = rows.map(row => ({ ...row }))
  deliveryAddressSeq = rows.reduce((max, row) => Math.max(max, row.addressId), 0)
}

const deliveryAddressHandlers = [
  http.get(DELIVERY_ADDRESSES_URL, () =>
    HttpResponse.json({
      data: { addresses: deliveryAddressRows, totalCount: deliveryAddressRows.length },
    }),
  ),
  http.post(DELIVERY_ADDRESSES_URL, async ({ request }) => {
    // 서버 한도(DeliveryAddressService.MAX_ACTIVE_DELIVERY_ADDRESSES=10)를 재현한다 — 초과는 422/30500.
    if (deliveryAddressRows.length >= 10) {
      return HttpResponse.json(
        { errorCode: 30500, message: '배송지는 최대 10개까지만 등록할 수 있습니다.' },
        { status: 422 },
      )
    }
    const body = (await request.json()) as Partial<DeliveryAddressRow>
    deliveryAddressSeq += 1
    // 서버는 활성 배송지가 없을 때 첫 건을 기본으로 만든다. 응답 isDefault가 달라지므로 재현한다.
    const isDefault = (body.isDefault ?? false) || deliveryAddressRows.length === 0
    const row = { ...body, addressId: deliveryAddressSeq, isDefault } as DeliveryAddressRow
    deliveryAddressRows = [...deliveryAddressRows, row]
    return HttpResponse.json(
      {
        data: {
          addressId: row.addressId,
          isDefault: row.isDefault,
          totalCount: deliveryAddressRows.length,
        },
      },
      { status: 201 },
    )
  }),
  http.patch(`${DELIVERY_ADDRESSES_URL}/:addressId`, async ({ params, request }) => {
    const id = Number(params['addressId'])
    const body = (await request.json()) as Partial<DeliveryAddressRow>
    deliveryAddressRows = deliveryAddressRows.map(row =>
      row.addressId === id ? { ...row, ...body, addressId: id } : row,
    )
    return HttpResponse.json({ data: { addressId: id, isDefault: body.isDefault ?? false } })
  }),
  http.patch(`${DELIVERY_ADDRESSES_URL}/:addressId/default`, ({ params }) => {
    const id = Number(params['addressId'])
    deliveryAddressRows = deliveryAddressRows.map(row => ({
      ...row,
      isDefault: row.addressId === id,
    }))
    return HttpResponse.json({ data: { addressId: id, isDefault: true } })
  }),
  http.delete(`${DELIVERY_ADDRESSES_URL}/:addressId`, ({ params }) => {
    const id = Number(params['addressId'])
    const wasDefault = deliveryAddressRows.find(row => row.addressId === id)?.isDefault ?? false
    deliveryAddressRows = deliveryAddressRows.filter(row => row.addressId !== id)
    // 서버는 기본을 지웠을 때만 남은 것 중 하나를 승격하고 그 id를 돌려준다.
    const promoted = wasDefault ? (deliveryAddressRows[0]?.addressId ?? null) : null
    if (promoted != null) {
      deliveryAddressRows = deliveryAddressRows.map(row => ({
        ...row,
        isDefault: row.addressId === promoted,
      }))
    }
    return HttpResponse.json({ data: { promotedDefaultAddressId: promoted } })
  }),
]

// 펫도 상태가 있는 리소스다(등록→목록 반영, 대표 전환, 삭제 승격). 배송지와 같은 이유로
// 응답 계약만 재현하고 서버 불변식은 흉내 내지 않는다. 단 화면이 분기에 쓰는 두 가지는 예외:
// 첫 펫 자동 대표(등록 응답 isDefault)와 삭제 응답 promotedDefaultPetId.
export interface PetRow {
  petId: number
  species: 'DOG' | 'CAT'
  name: string
  breedId: number
  breedLabel: string
  birthYearMonth?: string | null
  weight?: number | null
  profileImageKey?: string | null
  isDefault: boolean
  status: 'ACTIVE' | 'DELETED'
  version: number
}

let petRows: PetRow[] = []
let petSeq = 0

/** 테스트마다 펫 상태를 세운다. 인자 없이 부르면 빈 목록. */
export function seedPets(rows: PetRow[] = []): void {
  petRows = rows.map(row => ({ ...row }))
  petSeq = rows.reduce((max, row) => Math.max(max, row.petId), 0)
}

/** 핸들러가 쌓아둔 현재 상태. 테스트가 저장 결과를 단언할 때 읽는다. */
export function currentPets(): PetRow[] {
  return petRows.map(row => ({ ...row }))
}

// 서버는 키 말고 표시용 URL도 같이 내려준다. 도메인은 아무 값이나 되지만 키에서 파생돼야 한다.
function withImageUrl(row: PetRow) {
  return {
    ...row,
    profileImageUrl:
      row.profileImageKey == null ? null : `https://mock-cdn.local/${row.profileImageKey}`,
  }
}

// 서버는 species를 breed에서 파생시킨다. 요청에 실리지 않으므로 여기서도 breedId로 되짚는다.
function speciesOf(breedId: number): 'DOG' | 'CAT' {
  return BREED_FIXTURES.CAT.some(b => b.breedId === breedId) ? 'CAT' : 'DOG'
}

function labelOf(breedId: number): string {
  return (
    [...BREED_FIXTURES.DOG, ...BREED_FIXTURES.CAT].find(b => b.breedId === breedId)?.label ??
    '알 수 없음'
  )
}

const petHandlers = [
  http.get(PETS_URL, () => HttpResponse.json({ data: { pets: petRows.map(withImageUrl) } })),
  http.post(PETS_URL, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>
    petSeq += 1
    // 서버는 첫 펫을 요청값과 무관하게 대표로 만든다. 응답 isDefault가 달라지므로 재현한다.
    const isDefault = (body['isDefault'] as boolean | undefined) === true || petRows.length === 0
    if (isDefault) petRows = petRows.map(row => ({ ...row, isDefault: false }))
    const breedId = Number(body['breedId'])
    const row: PetRow = {
      petId: petSeq,
      species: speciesOf(breedId),
      name: String(body['name']),
      breedId,
      breedLabel: labelOf(breedId),
      birthYearMonth: (body['birthYearMonth'] as string | undefined) ?? null,
      weight: (body['weight'] as number | undefined) ?? null,
      profileImageKey: (body['profileImageKey'] as string | undefined) ?? null,
      isDefault,
      status: 'ACTIVE',
      version: 0,
    }
    petRows = [...petRows, row]
    return HttpResponse.json({ data: { ...withImageUrl(row), userId: 1 } }, { status: 201 })
  }),
  http.patch(`${PETS_URL}/:petId/default`, ({ params }) => {
    const id = Number(params['petId'])
    petRows = petRows.map(row => ({ ...row, isDefault: row.petId === id }))
    return HttpResponse.json({ data: { petId: id, isDefault: true } })
  }),
  http.put(`${PETS_URL}/:petId`, async ({ params, request }) => {
    const id = Number(params['petId'])
    const body = (await request.json()) as Record<string, unknown>
    const breedId = Number(body['breedId'])
    petRows = petRows.map(row =>
      row.petId === id
        ? {
            ...row,
            name: String(body['name']),
            breedId,
            breedLabel: labelOf(breedId),
            birthYearMonth: (body['birthYearMonth'] as string | undefined) ?? null,
            weight: (body['weight'] as number | undefined) ?? null,
            profileImageKey: (body['profileImageKey'] as string | undefined) ?? null,
            version: row.version + 1,
          }
        : row,
    )
    const updated = petRows.find(row => row.petId === id)
    return HttpResponse.json({ data: updated == null ? undefined : withImageUrl(updated) })
  }),
  http.delete(`${PETS_URL}/:petId`, ({ params }) => {
    const id = Number(params['petId'])
    const wasDefault = petRows.find(row => row.petId === id)?.isDefault ?? false
    petRows = petRows.filter(row => row.petId !== id)
    const promoted = wasDefault ? (petRows[0]?.petId ?? null) : null
    if (promoted != null) {
      petRows = petRows.map(row => ({ ...row, isDefault: row.petId === promoted }))
    }
    return HttpResponse.json({ data: { promotedDefaultPetId: promoted } })
  }),
  http.post(PRESIGNED_URL, async ({ request }) => {
    const body = (await request.json()) as { purpose: string; contentType: string }
    // 키 경로에 purpose를 반영해 프로필/펫/리뷰 업로드를 재현한다(서버 UploadPurpose.prefix와 동일).
    const folder =
      body.purpose === 'USER_PROFILE'
        ? 'users/profile'
        : body.purpose === 'REVIEW_IMAGE'
          ? 'reviews/images'
          : 'pets/profile'
    const key = `tmp/1/${folder}/fixture.${body.contentType.split('/')[1]}`
    return HttpResponse.json({ data: { url: `https://fake-s3.local/${key}`, key } })
  }),
  // presigned PUT은 S3 직행이라 baseURL 밖이다. 절대 URL로 따로 가로챈다.
  http.put('https://fake-s3.local/*', () => new HttpResponse(null, { status: 200 })),
]

export const USER_ME_URL = `${base}/users/me`
export const USER_PROFILE_URL = `${base}/users/me/profile`
export const PHONE_VERIFICATIONS_URL = `${base}/users/me/phone/verifications`
export const PHONE_VERIFICATIONS_CONFIRM_URL = `${base}/users/me/phone/verifications/confirm`

// 닉네임 점유 상태는 프로필 수정(PUT /users/me/profile)과 온보딩 닉네임(check·PUT)이 공유한다.
let takenNicknames = new Set<string>()

/** 다른 사용자가 이미 점유한 닉네임(NFC 정규화·대소문자 무시). 프로필 수정·온보딩 핸들러 공용. */
export function seedTakenNicknames(nicknames: string[] = []): void {
  takenNicknames = new Set(nicknames.map(name => name.normalize('NFC').toLowerCase()))
}

function isNicknameTaken(nickname: string): boolean {
  return takenNicknames.has(nickname.normalize('NFC').toLowerCase())
}

// 내 정보도 상태가 있는 리소스다(프로필 수정 → 조회 반영). GET /users/me는 이 상태를 그대로 내려주고,
// PUT /users/me/profile은 전체 교체(nickname·bio·profileImageKey)를 반영한다. 서버 불변식 중 화면이
// 실제로 분기에 쓰는 것만 재현한다: 닉네임 점유 중복(409/30001)과 낙관락 충돌(409/90003) 옵션.
export interface AccountState {
  status: string
  nickname: string | null
  profileImageUrl: string | null
  profileImageKey: string | null
  bio: string | null
  email: string | null
  phoneNumber: string | null
  isPhoneVerified: boolean
}

const DEFAULT_ACCOUNT: AccountState = {
  status: 'ACTIVE',
  nickname: '코코집사',
  profileImageUrl: 'https://mock-cdn.local/users/profile/seed.png',
  profileImageKey: 'users/profile/seed.png',
  bio: '코코랑 함께하는 집사일기',
  email: 'coco****@aechak.co.kr',
  phoneNumber: null,
  isPhoneVerified: false,
}

let account: AccountState = { ...DEFAULT_ACCOUNT }
let concurrentModOnce = false

// 휴대폰 인증(발송→확인) 상태. 기본 핸들러는 항상 이 고정 코드를 발급하고(응답엔 미노출),
// confirm이 발송 때의 번호 + 코드를 대조한다 — 서버의 30005(불일치)/30009(만료=미발송)를 재현.
export const MSW_PHONE_CODE = '123456'
export const PHONE_CODE_EXPIRES_IN_SECONDS = 180
export const PHONE_RESEND_COOLDOWN_SECONDS = 60
let issuedPhoneCode: { phoneNumber: string } | null = null

// BE PhoneNumberMasker 재현: 하이픈 제거 후 앞 3·뒤 4 사이를 '*'로 가린다('01012345678' → '010-****-5678').
function maskPhoneWire(phoneNumber: string): string {
  const digits = phoneNumber.replace(/-/g, '')
  return `${digits.slice(0, 3)}-${'*'.repeat(Math.max(0, digits.length - 7))}-${digits.slice(-4)}`
}

/** 테스트마다 내 정보 상태를 세운다. 점유 닉네임·낙관락·발송된 인증번호도 함께 초기화한다. */
export function seedAccount(overrides: Partial<AccountState> = {}): void {
  account = { ...DEFAULT_ACCOUNT, ...overrides }
  takenNicknames = new Set()
  concurrentModOnce = false
  issuedPhoneCode = null
}

/** 핸들러가 반영한 현재 내 정보. 테스트가 저장 결과를 단언할 때 읽는다. */
export function currentAccount(): AccountState {
  return { ...account }
}

/** 다음 프로필 수정 1회를 낙관락 충돌(409/90003)로 시뮬레이션한다. */
export function seedConcurrentModification(): void {
  concurrentModOnce = true
}

const accountHandlers = [
  http.get(USER_ME_URL, () => HttpResponse.json({ data: account })),
  http.put(USER_PROFILE_URL, async ({ request }) => {
    const body = (await request.json()) as {
      nickname: string
      bio: string | null
      profileImageKey: string | null
    }
    if (concurrentModOnce) {
      concurrentModOnce = false
      return HttpResponse.json(
        { errorCode: 90003, message: '다른 곳에서 먼저 수정했습니다.' },
        { status: 409 },
      )
    }
    const nfc = body.nickname.normalize('NFC').toLowerCase()
    const keepsOwn = nfc === (account.nickname ?? '').normalize('NFC').toLowerCase()
    if (!keepsOwn && isNicknameTaken(body.nickname)) {
      return HttpResponse.json(
        { errorCode: 30001, message: '이미 사용 중인 닉네임입니다.' },
        { status: 409 },
      )
    }
    // 전체 교체. 저장한 키에서 표시용 URL을 파생한다(키가 null이면 사진 제거).
    account = {
      ...account,
      nickname: body.nickname.normalize('NFC'),
      bio: body.bio,
      profileImageKey: body.profileImageKey,
      profileImageUrl:
        body.profileImageKey == null ? null : `https://mock-cdn.local/${body.profileImageKey}`,
    }
    return HttpResponse.json({ data: account })
  }),
  http.post(PHONE_VERIFICATIONS_URL, async ({ request }) => {
    const body = (await request.json()) as { phoneNumber: string }
    issuedPhoneCode = { phoneNumber: body.phoneNumber }
    return HttpResponse.json({
      data: {
        expiresInSeconds: PHONE_CODE_EXPIRES_IN_SECONDS,
        resendCooldownSeconds: PHONE_RESEND_COOLDOWN_SECONDS,
      },
    })
  }),
  http.post(PHONE_VERIFICATIONS_CONFIRM_URL, async ({ request }) => {
    const body = (await request.json()) as { phoneNumber: string; code: string }
    if (issuedPhoneCode == null) {
      return HttpResponse.json(
        { errorCode: 30009, message: '인증번호가 만료되었습니다. 재발송 시도해 주세요.' },
        { status: 400 },
      )
    }
    // 코드·번호 불일치는 서버가 의도적으로 구분하지 않는다(둘 다 30005).
    if (body.code !== MSW_PHONE_CODE || body.phoneNumber !== issuedPhoneCode.phoneNumber) {
      return HttpResponse.json(
        { errorCode: 30005, message: '인증번호가 올바르지 않습니다.' },
        { status: 400 },
      )
    }
    issuedPhoneCode = null
    account = { ...account, phoneNumber: maskPhoneWire(body.phoneNumber), isPhoneVerified: true }
    return HttpResponse.json({ data: account })
  }),
]

// ── 온보딩(약관·동의·닉네임) ──────────────────────────────────────────────────
// 서버 불변식(필수 동의 게이트·닉네임 중복/형식·PENDING→ACTIVE 전이)을 상태로 재현한다.
// 각 시더가 자신의 슬라이스와 온보딩 전이 상태를 리셋해 테스트 간 누수를 막는다.
export const TERMS_URL = `${base}/terms`
export const CONSENTS_URL = `${base}/users/me/consents`
export const NICKNAME_CHECK_URL = `${base}/users/nickname/check`
export const NICKNAME_URL = `${base}/users/me/nickname`
export const INQUIRIES_URL = `${base}/inquiries`
export const WITHDRAWAL_CHECK_URL = `${base}/users/me/withdrawal/check`

export interface TermRow {
  termId: number
  type: 'SERVICE' | 'PRIVACY' | 'LOCATION' | 'MARKETING' | 'AGE_OVER_14'
  isRequired: boolean
  version: string
  title: string
  body: string
  effectiveAt: string
}

// 시드 약관: 필수 4 + 선택(마케팅) 1. title은 화면 라벨로 그대로 쓰인다.
export const DEFAULT_TERMS: TermRow[] = [
  {
    termId: 1,
    type: 'AGE_OVER_14',
    isRequired: true,
    version: '1.0',
    title: '만 14세 이상이에요',
    body: '만 14세 이상 확인',
    effectiveAt: '2026-01-01T00:00:00Z',
  },
  {
    termId: 2,
    type: 'SERVICE',
    isRequired: true,
    version: '1.0',
    title: '서비스 이용약관',
    body: '서비스 이용약관 본문',
    effectiveAt: '2026-01-01T00:00:00Z',
  },
  {
    termId: 3,
    type: 'PRIVACY',
    isRequired: true,
    version: '1.0',
    title: '개인정보 처리방침',
    body: '개인정보 처리방침 본문',
    effectiveAt: '2026-01-01T00:00:00Z',
  },
  {
    termId: 4,
    type: 'LOCATION',
    isRequired: true,
    version: '1.0',
    title: '위치기반 서비스 약관',
    body: '위치기반 서비스 약관 본문',
    effectiveAt: '2026-01-01T00:00:00Z',
  },
  {
    termId: 5,
    type: 'MARKETING',
    isRequired: false,
    version: '1.0',
    title: '마케팅 정보 수신 동의',
    body: '마케팅 정보 수신 동의 본문',
    effectiveAt: '2026-01-01T00:00:00Z',
  },
]

const NICKNAME_PATTERN = /^[가-힣a-zA-Z0-9]{2,12}$/

interface SubmittedConsent {
  termId: number
  isAgreed: boolean
}

let termRows: TermRow[] = []
let submittedConsents: SubmittedConsent[] = []
let requiredConsentSatisfied = false
let onboardingCompleted = false

/** 약관 목록을 세우고 온보딩 전이 상태를 초기(PENDING·미동의)로 리셋한다. */
export function seedTerms(rows: TermRow[] = DEFAULT_TERMS): void {
  termRows = rows.map(row => ({ ...row }))
  submittedConsents = []
  requiredConsentSatisfied = false
  onboardingCompleted = false
}

/** 필수 동의를 이미 마친 상태로 세운다(닉네임 단독 테스트용). 온보딩 전이도 초기화. */
export function seedConsentsSubmitted(satisfied = true): void {
  requiredConsentSatisfied = satisfied
  onboardingCompleted = false
}

/** 핸들러가 기록한 제출 동의. 테스트가 전송 payload를 단언할 때 읽는다. */
export function currentConsents(): SubmittedConsent[] {
  return submittedConsents.map(item => ({ ...item }))
}

const onboardingHandlers = [
  http.get(TERMS_URL, () => HttpResponse.json({ data: termRows })),
  http.post(CONSENTS_URL, async ({ request }) => {
    if (onboardingCompleted) {
      return HttpResponse.json(
        { errorCode: 30004, message: '이미 온보딩이 완료된 계정입니다.' },
        { status: 409 },
      )
    }
    const body = (await request.json()) as { items?: SubmittedConsent[] }
    const items = body.items ?? []
    if (items.length === 0) {
      return HttpResponse.json(
        { errorCode: 90001, message: '동의 항목이 비었습니다.' },
        { status: 400 },
      )
    }
    const ids = items.map(item => item.termId)
    if (new Set(ids).size !== ids.length) {
      return HttpResponse.json(
        { errorCode: 90001, message: 'termId가 중복됩니다.' },
        { status: 400 },
      )
    }
    if (ids.some(id => !termRows.some(term => term.termId === id))) {
      return HttpResponse.json(
        { errorCode: 30400, message: '비활성이거나 알 수 없는 약관입니다.' },
        { status: 400 },
      )
    }
    // 활성 필수 약관은 전부 isAgreed=true로 포함돼야 한다.
    const requiredOk = termRows
      .filter(term => term.isRequired)
      .every(term => items.some(item => item.termId === term.termId && item.isAgreed))
    if (!requiredOk) {
      return HttpResponse.json(
        { errorCode: 30300, message: '필수 약관에 동의해야 합니다.' },
        { status: 403 },
      )
    }
    submittedConsents = items.map(item => ({ ...item }))
    requiredConsentSatisfied = true
    return new HttpResponse(null, { status: 204 })
  }),
  http.get(NICKNAME_CHECK_URL, ({ request }) => {
    const nickname = new URL(request.url).searchParams.get('nickname')
    if (nickname == null || nickname.length === 0) {
      return HttpResponse.json(
        { errorCode: 90001, message: 'nickname 파라미터가 필요합니다.' },
        { status: 400 },
      )
    }
    if (!NICKNAME_PATTERN.test(nickname.normalize('NFC'))) {
      return HttpResponse.json(
        { errorCode: 30002, message: '닉네임 형식이 올바르지 않습니다.' },
        { status: 400 },
      )
    }
    return HttpResponse.json({ data: { available: !isNicknameTaken(nickname) } })
  }),
  http.put(NICKNAME_URL, async ({ request }) => {
    if (onboardingCompleted) {
      return HttpResponse.json(
        { errorCode: 30004, message: '이미 온보딩이 완료된 계정입니다.' },
        { status: 409 },
      )
    }
    const body = (await request.json()) as { nickname?: string }
    const nickname = (body.nickname ?? '').normalize('NFC')
    if (!NICKNAME_PATTERN.test(nickname)) {
      return HttpResponse.json(
        { errorCode: 30002, message: '닉네임 형식이 올바르지 않습니다.' },
        { status: 400 },
      )
    }
    if (!requiredConsentSatisfied) {
      return HttpResponse.json(
        { errorCode: 30300, message: '필수 약관 동의가 필요합니다.' },
        { status: 403 },
      )
    }
    // 커밋 시점 최종 판정: 중복이면 409 30001.
    if (isNicknameTaken(nickname)) {
      return HttpResponse.json(
        { errorCode: 30001, message: '이미 사용 중인 닉네임입니다.' },
        { status: 409 },
      )
    }
    onboardingCompleted = true
    return HttpResponse.json({
      data: {
        status: 'ACTIVE',
        nickname,
        profileImageUrl: null,
        profileImageKey: null,
        bio: null,
        email: null,
        phoneNumber: null,
        isPhoneVerified: false,
      },
    })
  }),
]

// ─────────────────────────────────────────────────────────────────────────────
// 장바구니 · 주문그룹 · 결제 — 구매 퍼널의 상태형 핸들러. 배송지와 같은 원칙으로 응답 계약만 재현하고
// 화면 분기가 실제로 의존하는 서버 규칙만 흉내 낸다(수량 합산, 재고 50201, 멱등키 재반환, 50106 금액
// 대조, 커서 페이지네이션, complete 순서, PAID 시 장바구니 정리).
// ─────────────────────────────────────────────────────────────────────────────
export const CART_URL = `${base}/carts`
export const CART_ITEMS_URL = `${base}/carts/items`
export const CART_ITEM_URL = `${base}/carts/items/:cartItemId`
export const ORDER_GROUPS_URL = `${base}/order-groups`
export const ORDER_DETAIL_URL = `${base}/orders/:orderId`
export const ORDER_CONFIRM_URL = `${base}/orders/:orderPublicId/confirm`
export const PAYMENT_PREPARE_URL = `${base}/order-groups/:orderGroupId/payment/prepare`
export const PAYMENT_COMPLETE_URL = `${base}/order-groups/:orderGroupId/payment/complete`

const errorJson = (status: number, errorCode: number, message: string) =>
  HttpResponse.json({ errorCode, message }, { status })

const CART_QUANTITY_MAX = 99
const CART_LINE_LIMIT = 100
const MIN_POINT_USAGE = 1000
const MIN_PAYMENT_AMOUNT = 100
export const PAYMENT_WINDOW_MINUTES = 10

const isValidQuantity = (value: unknown): value is number =>
  Number.isInteger(value) && (value as number) >= 1 && (value as number) <= CART_QUANTITY_MAX

// Crockford base32 26자 — BE public_id(ULID) 모양. 시각 10자 + 난수 16자.
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
function ulid(): string {
  let time = Date.now()
  let head = ''
  for (let i = 0; i < 10; i += 1) {
    head = CROCKFORD[time % 32] + head
    time = Math.floor(time / 32)
  }
  let tail = ''
  for (let i = 0; i < 16; i += 1) tail += CROCKFORD[Math.floor(Math.random() * 32)]
  return head + tail
}

// ---- 장바구니 ------------------------------------------------------------------
export interface CartLineRow {
  cartItemId: number
  optionCombinationId: number
  productId: string
  productName: string
  selectedOptions: string
  quantity: number
  /** 할인 전 단가(정가+옵션 추가금). 서버가 역산 대신 직접 내려준다. */
  originalPrice: number
  /** 판매가+옵션 추가금 합산 단가(서버 계약). 주문 금액 계산의 기준. */
  price: number
  remainingStock: number
  itemStatus: CartItemStatus
  thumbnail?: string | null
  discountRate?: number | null
  sellerId: number
  storeName: string
  baseShippingFee: number
  freeShippingThreshold: number | null
}

let cartRows: CartLineRow[] = []
let cartSeq = 0

/** 테스트마다 장바구니 상태를 세운다. 인자 없이 부르면 빈 장바구니. 배열 순서가 응답 순서(최신 담김순). */
export function seedCart(rows: CartLineRow[] = []): void {
  cartRows = rows.map(row => ({ ...row }))
  cartSeq = rows.reduce((max, row) => Math.max(max, row.cartItemId), 0)
}

/** 핸들러가 쌓아둔 현재 상태. 테스트가 담기/삭제/결제 후 정리 결과를 단언할 때 읽는다. */
export function currentCart(): CartLineRow[] {
  return cartRows.map(row => ({ ...row }))
}

/** REAL_PRODUCT 기준 장바구니 라인 픽스처 헬퍼 — 단가는 할인가(64,000)+옵션 추가금. */
export function makeCartRow(overrides: Partial<CartLineRow> & { cartItemId: number }): CartLineRow {
  return {
    optionCombinationId: 1,
    productId: REAL_PRODUCT_ID,
    productName: REAL_PRODUCT_DETAIL.name,
    selectedOptions: '기본형',
    quantity: 1,
    originalPrice: 89000,
    price: 64000,
    remainingStock: 10,
    itemStatus: 'ACTIVE',
    thumbnail: null,
    discountRate: 28,
    sellerId: 1,
    storeName: REAL_PRODUCT_DETAIL.seller.storeName,
    baseShippingFee: REAL_PRODUCT_DETAIL.shipping.baseShippingFee,
    freeShippingThreshold: REAL_PRODUCT_DETAIL.shipping.freeShippingThreshold,
    ...overrides,
  }
}

const findRealCombo = (optionCombinationId: unknown) =>
  REAL_PRODUCT_OPTIONS.optionCombinations.find(c => c.optionCombinationId === optionCombinationId)

/** 셀러별로 묶되 첫 등장 순서를 지킨다(BE 응답과 같은 그룹 순서). */
function groupBySeller(rows: CartLineRow[]): CartLineRow[][] {
  const order: number[] = []
  const bySeller = new Map<number, CartLineRow[]>()
  for (const row of rows) {
    const bucket = bySeller.get(row.sellerId)
    if (bucket) bucket.push(row)
    else {
      bySeller.set(row.sellerId, [row])
      order.push(row.sellerId)
    }
  }
  return order.map(sellerId => bySeller.get(sellerId) ?? [])
}

function cartResponseBody() {
  return {
    data: {
      sellerGroups: groupBySeller(cartRows).map(rows => {
        const first = rows[0] as CartLineRow
        return {
          sellerId: first.sellerId,
          storeName: first.storeName,
          baseShippingFee: first.baseShippingFee,
          freeShippingThreshold: first.freeShippingThreshold,
          items: rows.map(r => ({
            cartItemId: r.cartItemId,
            productId: r.productId,
            optionCombinationId: r.optionCombinationId,
            productName: r.productName,
            thumbnail: r.thumbnail ?? null,
            selectedOptions: r.selectedOptions,
            quantity: r.quantity,
            originalPrice: r.originalPrice,
            price: r.price,
            discountRate: r.discountRate ?? null,
            remainingStock: r.remainingStock,
            itemStatus: r.itemStatus,
            isOrderable: r.itemStatus === 'ACTIVE',
          })),
        }
      }),
    },
  }
}

const cartHandlers = [
  http.get(CART_URL, () => HttpResponse.json(cartResponseBody())),
  http.post(CART_ITEMS_URL, async ({ request }) => {
    const body = (await request.json()) as { optionCombinationId?: number; quantity?: number }
    if (!isValidQuantity(body.quantity)) {
      return errorJson(400, 90001, '수량은 1개 이상 99개 이하여야 합니다.')
    }
    const combo = findRealCombo(body.optionCombinationId)
    if (!combo) return errorJson(404, 50207, '상품을 찾을 수 없습니다.')
    const existing = cartRows.find(r => r.optionCombinationId === combo.optionCombinationId)
    // 요청 수량이 아니라 누적 결과를 상한·재고와 견준다(BE CartService.addItem).
    const nextQuantity = (existing?.quantity ?? 0) + body.quantity
    if (nextQuantity > CART_QUANTITY_MAX) {
      return errorJson(400, 90001, '수량은 99개를 넘을 수 없습니다.')
    }
    if (nextQuantity > combo.remainingStock) return errorJson(409, 50201, '재고가 부족합니다.')
    if (!existing && cartRows.length >= CART_LINE_LIMIT) {
      return errorJson(422, 50203, '장바구니에 담을 수 있는 품목 수를 초과했습니다.')
    }
    let row: CartLineRow
    if (existing) {
      row = { ...existing, quantity: nextQuantity }
      cartRows = cartRows.map(r => (r.cartItemId === existing.cartItemId ? row : r))
    } else {
      cartSeq += 1
      row = makeCartRow({
        cartItemId: cartSeq,
        optionCombinationId: combo.optionCombinationId,
        selectedOptions: combo.name,
        quantity: body.quantity,
        originalPrice: 89000 + combo.additionalPrice,
        price: 64000 + combo.additionalPrice,
        remainingStock: combo.remainingStock,
      })
      // 최신 담김이 맨 앞(BE 정렬: created_at DESC).
      cartRows = [row, ...cartRows]
    }
    return HttpResponse.json(
      {
        data: {
          cartItemId: row.cartItemId,
          productId: row.productId,
          optionCombinationId: row.optionCombinationId,
          quantity: row.quantity,
          itemStatus: row.itemStatus,
        },
      },
      { status: 201 },
    )
  }),
  http.patch(CART_ITEM_URL, async ({ params, request }) => {
    const id = Number(params['cartItemId'])
    const body = (await request.json()) as {
      quantity?: number | null
      optionCombinationId?: number | null
    }
    if (body.quantity == null && body.optionCombinationId == null) {
      return errorJson(400, 90001, '잘못된 요청입니다.')
    }
    if (body.quantity != null && !isValidQuantity(body.quantity)) {
      return errorJson(400, 90001, '수량은 1개 이상 99개 이하여야 합니다.')
    }
    const row = cartRows.find(r => r.cartItemId === id)
    if (!row) return errorJson(404, 50205, '장바구니 항목을 찾을 수 없습니다.')
    // quantity는 증감이 아니라 대입(절대값).
    const quantity = body.quantity ?? row.quantity
    const targetComboId =
      body.optionCombinationId != null && body.optionCombinationId !== row.optionCombinationId
        ? body.optionCombinationId
        : null
    if (targetComboId == null) {
      // 수량을 늘릴 때만 재고를 본다(깎거나 유지하면 카탈로그를 조회하지 않는 BE 계약).
      if (quantity > row.quantity && quantity > row.remainingStock) {
        return errorJson(409, 50201, '재고가 부족합니다.')
      }
      cartRows = cartRows.map(r => (r.cartItemId === id ? { ...r, quantity } : r))
      return HttpResponse.json({
        data: {
          cartItemId: id,
          quantity,
          optionCombinationId: row.optionCombinationId,
          merged: false,
        },
      })
    }
    const combo = findRealCombo(targetComboId)
    if (!combo) return errorJson(404, 50207, '상품을 찾을 수 없습니다.')
    if (row.productId !== REAL_PRODUCT_ID) {
      return errorJson(400, 90001, '같은 상품의 옵션으로만 바꿀 수 있습니다.')
    }
    const sibling = cartRows.find(
      r => r.cartItemId !== id && r.optionCombinationId === combo.optionCombinationId,
    )
    if (sibling) {
      // 같은 조합 라인이 이미 있으면 그쪽으로 흡수(merged=true, cartItemId는 살아남은 라인).
      const merged = sibling.quantity + quantity
      if (merged > CART_QUANTITY_MAX)
        return errorJson(400, 90001, '수량은 99개를 넘을 수 없습니다.')
      if (merged > combo.remainingStock) return errorJson(409, 50201, '재고가 부족합니다.')
      cartRows = cartRows
        .filter(r => r.cartItemId !== id)
        .map(r => (r.cartItemId === sibling.cartItemId ? { ...r, quantity: merged } : r))
      return HttpResponse.json({
        data: {
          cartItemId: sibling.cartItemId,
          quantity: merged,
          optionCombinationId: combo.optionCombinationId,
          merged: true,
        },
      })
    }
    if (quantity > combo.remainingStock) return errorJson(409, 50201, '재고가 부족합니다.')
    cartRows = cartRows.map(r =>
      r.cartItemId === id
        ? {
            ...r,
            quantity,
            optionCombinationId: combo.optionCombinationId,
            selectedOptions: combo.name,
            originalPrice: 89000 + combo.additionalPrice,
            price: 64000 + combo.additionalPrice,
            remainingStock: combo.remainingStock,
          }
        : r,
    )
    return HttpResponse.json({
      data: {
        cartItemId: id,
        quantity,
        optionCombinationId: combo.optionCombinationId,
        merged: false,
      },
    })
  }),
  http.delete(CART_ITEMS_URL, async ({ request }) => {
    const body = (await request.json()) as { cartItemIds?: number[] }
    if (!Array.isArray(body.cartItemIds)) return errorJson(400, 90001, '잘못된 요청입니다.')
    const idSet = new Set(body.cartItemIds)
    const before = cartRows.length
    // 서버 규칙: 내 장바구니에 없는 id는 무시(멱등 삭제).
    cartRows = cartRows.filter(r => !idSet.has(r.cartItemId))
    return HttpResponse.json({ data: { deletedCount: before - cartRows.length } })
  }),
]

// ---- 주문 목록·상세 ----------------------------------------------------------------
export interface OrderLineRow {
  orderItemId: number
  productId: string
  productName: string
  thumbnailUrl: string | null
  optionName: string
  quantity: number
  unitPrice: number
  itemStatus: OrderItemStatus
}

export interface SellerOrderRow {
  orderId: string
  sellerName: string | null
  status: OrderStatus
  /** 상세 payment.sellerShippingFee — 미지정이면 0. */
  sellerShippingFee?: number
  items: OrderLineRow[]
  /** 상세 shipment — 미지정이면 null(송장 미등록). */
  shipment?: OrderShipmentResponse
  /** 상세 activeClaim — 미지정이면 null(진행 중 클레임 없음). */
  activeClaim?: OrderActiveClaimResponse
  /** 상세 purchaseConfirmDueAt — BE는 배송완료 시점에 부여한다(그 전에는 null). */
  purchaseConfirmDueAt?: string
}

export interface OrderGroupRow {
  orderGroupId: string
  orderedAt: string
  totalProductAmount: number
  totalShippingFee: number
  couponDiscountAmount?: number
  usedPoint: number
  finalPaymentAmount: number
  sellerOrders: SellerOrderRow[]
  /** 상세 deliveryAddress — 미지정이면 기본 배송지 스냅샷. 서버는 항상 내려준다(nullable 아님). */
  deliveryAddress?: OrderDeliveryAddressResponse
}

let orderGroupRows: OrderGroupRow[] = []
let orderDetailRows = new Map<string, OrderDetailResponse>()

/** 주문 시점 배송지 스냅샷 기본값(BE OrderDeliveryAddressResponse — 연락처는 숫자만). */
export const ORDER_DELIVERY_ADDRESS: OrderDeliveryAddressResponse = {
  receiverName: '김집사',
  contactNumber: '01012345678',
  zipCode: '04044',
  baseAddress: '서울 마포구 양화로 00',
  detailAddress: '101동 1004호',
  deliveryMemo: '문 앞에 놓아주세요',
}

// orderItemId는 BE에서 품목 PK라 테스트마다 고유해야 한다 — 픽스처가 지정하지 않으면 순번을 쓴다.
let nextOrderItemId = 1

export function makeOrderLineRow(overrides: Partial<OrderLineRow> = {}): OrderLineRow {
  nextOrderItemId += 1
  return {
    orderItemId: nextOrderItemId,
    productId: REAL_PRODUCT_ID,
    productName: REAL_PRODUCT_DETAIL.name,
    thumbnailUrl: null,
    optionName: '기본형',
    quantity: 1,
    unitPrice: 64000,
    itemStatus: 'ORDERED',
    ...overrides,
  }
}

export function makeSellerOrderRow(
  overrides: Partial<SellerOrderRow> & { orderId: string },
): SellerOrderRow {
  return {
    sellerName: REAL_PRODUCT_DETAIL.seller.storeName,
    status: 'PAID',
    sellerShippingFee: 0,
    items: [makeOrderLineRow()],
    ...overrides,
  }
}

/** 셀러 주문 하나(기본 PAID, 64,000원 라인 하나, 배송비 0)를 가진 주문그룹 픽스처. */
export function makeOrderGroupRow(
  overrides: Partial<OrderGroupRow> & { orderGroupId: string },
): OrderGroupRow {
  return {
    orderedAt: '2026-10-10T10:00:00+09:00',
    totalProductAmount: 64000,
    totalShippingFee: 0,
    couponDiscountAmount: 0,
    usedPoint: 0,
    finalPaymentAmount: 64000,
    sellerOrders: [makeSellerOrderRow({ orderId: `${overrides.orderGroupId}-1` })],
    ...overrides,
  }
}

/**
 * 테스트마다 주문 목록 상태를 세운다. 배열 순서가 그대로 응답 순서(최신순으로 넣을 것). 인자 없이 부르면
 * 빈 목록. 주문그룹 생성 기록·멱등키 맵·상세 오버라이드도 함께 비운다.
 */
export function seedOrderGroups(groups: OrderGroupRow[] = []): void {
  orderGroupRows = groups.map(group => ({
    ...group,
    sellerOrders: group.sellerOrders.map(so => ({
      ...so,
      items: so.items.map(item => ({ ...item })),
    })),
  }))
  orderDetailRows = new Map()
  createdOrderGroups = []
  idempotentResponses = new Map()
  resetOrderClaims()
}

/** 핸들러가 보는 현재 주문그룹 목록(결제 PAID로 새로 생긴 그룹 포함). */
export function currentOrderGroups(): OrderGroupRow[] {
  return orderGroupRows.map(group => ({ ...group, sellerOrders: [...group.sellerOrders] }))
}

/** GET /orders/{orderId}를 그룹 시드와 무관하게 세운다(같은 orderId면 그룹 파생보다 우선). */
export function seedOrderDetail(detail: OrderDetailResponse): void {
  orderDetailRows.set(detail.orderId, detail)
}

// BE OrderStatusFilter — 하위 주문 하나라도 해당하면 그룹이 걸린다. ALL에도 결제대기는 없다.
const ORDER_STATUS_FILTERS: Record<OrderListStatusFilter, ReadonlySet<OrderStatus>> = {
  all: new Set(Object.values(OrderStatus).filter(s => s !== OrderStatus.PENDING_PAYMENT)),
  ongoing: new Set([
    OrderStatus.PAID,
    OrderStatus.PREPARING,
    OrderStatus.DISPATCH_PENDING,
    OrderStatus.SHIPPING,
  ]),
  completed: new Set([OrderStatus.DELIVERED, OrderStatus.PURCHASE_CONFIRMED]),
  cancelled: new Set([OrderStatus.CANCELLED]),
}
const isStatusFilter = (value: string): value is OrderListStatusFilter =>
  Object.values(OrderListStatusFilter).includes(value as OrderListStatusFilter)

// 커서는 불투명 문자열 — 인덱스를 base64로 감싼다. 깨진 값은 BE처럼 400 90002.
const encodeCursor = (index: number): string => btoa(String(index))
function decodeCursor(cursor: string): number | null {
  try {
    const index = Number(atob(cursor))
    return Number.isInteger(index) && index >= 0 ? index : null
  } catch {
    return null
  }
}

const sellerOrderResponse = (so: SellerOrderRow) => ({
  orderId: so.orderId,
  sellerName: so.sellerName,
  status: so.status,
  itemCount: so.items.length,
  representativeItem: so.items[0] ?? null,
})

const orderGroupResponse = (group: OrderGroupRow) => ({
  orderGroupId: group.orderGroupId,
  orderedAt: group.orderedAt,
  totalProductAmount: group.totalProductAmount,
  totalShippingFee: group.totalShippingFee,
  couponDiscountAmount: group.couponDiscountAmount ?? 0,
  usedPoint: group.usedPoint,
  finalPaymentAmount: group.finalPaymentAmount,
  sellerOrders: group.sellerOrders.map(sellerOrderResponse),
})

// ---- 주문그룹 생성 -------------------------------------------------------------------
export interface CreatedOrderGroupRecord {
  orderGroupId: string
  idempotencyKey: string
  cartItemIds: number[]
  /** 생성 시점의 장바구니 라인 스냅샷(결제 PAID 때 주문 목록 행을 만드는 재료). */
  lines: CartLineRow[]
  deliveryAddressId: number
  usedPoint: number
  totalProductAmount: number
  totalShippingFee: number
  finalPaymentAmount: number
  expiresAt: string
  paid: boolean
}

let createdOrderGroups: CreatedOrderGroupRecord[] = []
let idempotentResponses = new Map<string, unknown>()

/** POST /order-groups가 만든 그룹들(멱등 재요청은 늘지 않는다). seedOrderGroups()가 비운다. */
export function currentCreatedOrderGroups(): CreatedOrderGroupRecord[] {
  return createdOrderGroups.map(record => ({ ...record, cartItemIds: [...record.cartItemIds] }))
}

/** BE OrderService.shippingFee — 셀러 상품금액이 임계 이상이면 0, 임계가 없으면 항상 기본 배송비. */
function shippingFeeOf(lines: CartLineRow[]): number {
  const first = lines[0] as CartLineRow
  const productAmount = lines.reduce((sum, line) => sum + line.price * line.quantity, 0)
  return first.freeShippingThreshold != null && productAmount >= first.freeShippingThreshold
    ? 0
    : first.baseShippingFee
}

const orderHandlers = [
  http.post(ORDER_GROUPS_URL, async ({ request }) => {
    const key = request.headers.get('Idempotency-Key')
    if (key == null) return errorJson(400, 90001, 'Idempotency-Key: 필수 헤더가 누락되었습니다.')
    if (key.trim() === '' || key.length > 100) {
      return errorJson(400, 90004, '멱등키가 올바르지 않습니다.')
    }
    // 같은 키 재요청은 본문과 무관하게 최초 결과를 201로 재반환(BE는 본문을 대조하지 않는다).
    const replay = idempotentResponses.get(key)
    if (replay) return HttpResponse.json(replay, { status: 201 })

    const body = (await request.json()) as {
      cartItemIds?: number[]
      deliveryAddressId?: number
      usedPoint?: number
      expectedFinalAmount?: number
    }
    const { cartItemIds, deliveryAddressId, usedPoint, expectedFinalAmount } = body
    if (
      !Array.isArray(cartItemIds) ||
      cartItemIds.length === 0 ||
      !Number.isInteger(deliveryAddressId) ||
      !Number.isInteger(usedPoint) ||
      (usedPoint as number) < 0 ||
      !Number.isInteger(expectedFinalAmount) ||
      (expectedFinalAmount as number) < 0
    ) {
      return errorJson(400, 90001, '잘못된 요청입니다.')
    }
    const selected: CartLineRow[] = []
    for (const id of new Set(cartItemIds)) {
      const row = cartRows.find(r => r.cartItemId === id)
      if (!row) return errorJson(404, 50205, '장바구니 항목을 찾을 수 없습니다.')
      selected.push(row)
    }
    if (selected.some(row => row.itemStatus !== 'ACTIVE')) {
      return errorJson(409, 50104, '주문할 수 없는 상품이 포함되어 있습니다.')
    }
    if (selected.some(row => row.quantity > row.remainingStock)) {
      return errorJson(409, 50107, '재고가 부족한 상품이 포함되어 있습니다.')
    }
    const sellerLines = groupBySeller(selected)
    const totalProductAmount = selected.reduce((sum, row) => sum + row.price * row.quantity, 0)
    const totalShippingFee = sellerLines.reduce((sum, lines) => sum + shippingFeeOf(lines), 0)
    const finalPaymentAmount = totalProductAmount + totalShippingFee - (usedPoint as number)
    // FE가 표시한 금액과 서버 계산을 대조 — 어긋나면 생성하지 않는다.
    if (finalPaymentAmount !== expectedFinalAmount) {
      return errorJson(409, 50106, '주문 금액이 변경되었습니다. 주문서를 다시 확인해 주세요.')
    }
    if ((usedPoint as number) !== 0 && (usedPoint as number) < MIN_POINT_USAGE) {
      return errorJson(400, 50103, '적립금은 1,000원 이상부터 사용할 수 있습니다.')
    }
    if ((usedPoint as number) > totalProductAmount + totalShippingFee) {
      return errorJson(422, 50102, '적립금은 결제 금액을 초과해 사용할 수 없습니다.')
    }
    if (finalPaymentAmount < MIN_PAYMENT_AMOUNT) {
      return errorJson(422, 50108, '최소 결제 금액에 미치지 못합니다.')
    }
    const orderGroupId = ulid()
    const expiresAt = new Date(Date.now() + PAYMENT_WINDOW_MINUTES * 60_000).toISOString()
    createdOrderGroups = [
      ...createdOrderGroups,
      {
        orderGroupId,
        idempotencyKey: key,
        cartItemIds: selected.map(row => row.cartItemId),
        lines: selected.map(row => ({ ...row })),
        deliveryAddressId: deliveryAddressId as number,
        usedPoint: usedPoint as number,
        totalProductAmount,
        totalShippingFee,
        finalPaymentAmount,
        expiresAt,
        paid: false,
      },
    ]
    // 주문한 라인은 결제 PAID 때 서버가 지우므로 여기서는 장바구니를 건드리지 않는다.
    const response = {
      data: {
        orderGroupId,
        expiresAt,
        totalProductAmount,
        totalShippingFee,
        usedPoint: usedPoint as number,
        finalPaymentAmount,
      },
    }
    idempotentResponses.set(key, response)
    return HttpResponse.json(response, { status: 201 })
  }),
  http.get(ORDER_GROUPS_URL, ({ request }) => {
    const params = new URL(request.url).searchParams
    const status = params.get('status') ?? OrderListStatusFilter.all
    if (!isStatusFilter(status)) return errorJson(400, 90001, 'status: 잘못된 값입니다.')
    const sizeParam = params.get('size')
    const size = sizeParam == null ? 20 : Number(sizeParam)
    if (!Number.isInteger(size) || size < 1 || size > 100) {
      return errorJson(400, 90001, 'size는 1~100 사이여야 합니다.')
    }
    const cursorParam = params.get('cursor')
    const start = cursorParam == null ? 0 : decodeCursor(cursorParam)
    if (start == null) return errorJson(400, 90002, '유효하지 않은 커서입니다.')
    const statuses = ORDER_STATUS_FILTERS[status]
    const list = orderGroupRows.filter(group =>
      group.sellerOrders.some(so => statuses.has(so.status)),
    )
    const page = list.slice(start, start + size)
    const next = start + size
    const hasNext = next < list.length
    return HttpResponse.json({
      data: {
        orderGroups: page.map(orderGroupResponse),
        // totalCount는 첫 페이지(cursor 없음)에만.
        totalCount: cursorParam == null ? list.length : null,
        nextCursor: hasNext ? encodeCursor(next) : null,
        hasNext,
      },
    })
  }),
  http.get(ORDER_DETAIL_URL, ({ params }) => {
    const orderId = String(params['orderId'])
    const seeded = orderDetailRows.get(orderId)
    if (seeded) return HttpResponse.json({ data: seeded })
    for (const group of orderGroupRows) {
      const so = group.sellerOrders.find(s => s.orderId === orderId)
      if (!so || so.status === OrderStatus.PENDING_PAYMENT) continue
      return HttpResponse.json({ data: orderDetailResponse(group, so) })
    }
    // 없음·남의 것·결제대기는 구분 없이 404 50000.
    return errorJson(404, 50000, '주문을 찾을 수 없습니다.')
  }),
  // BE OrderConfirmService: 배송완료 + 진행 중 클레임 없음만 확정된다. 성공은 204 No Content.
  // 거절은 409 50008(이미 확정) / 409 50007(그 밖에 확정 불가) / 404 50000(없음·결제대기).
  http.post(ORDER_CONFIRM_URL, ({ params }) => {
    const orderId = String(params['orderPublicId'])
    for (const group of orderGroupRows) {
      const so = group.sellerOrders.find(s => s.orderId === orderId)
      if (!so || so.status === OrderStatus.PENDING_PAYMENT) continue
      if (so.status === OrderStatus.PURCHASE_CONFIRMED) {
        return errorJson(409, 50008, '이미 구매확정된 주문입니다.')
      }
      if (so.status !== OrderStatus.DELIVERED || so.activeClaim != null) {
        return errorJson(
          409,
          50007,
          '배송완료 상태이고 진행 중 클레임이 없는 주문만 구매확정할 수 있습니다.',
        )
      }
      // 확정은 비가역 — 시드 상태를 그대로 전이시켜 재조회가 구매확정을 돌려주게 한다.
      so.status = OrderStatus.PURCHASE_CONFIRMED
      delete so.purchaseConfirmDueAt
      return new HttpResponse(null, { status: 204 })
    }
    return errorJson(404, 50000, '주문을 찾을 수 없습니다.')
  }),
]

// sellerShippingFee만 이 셀러 몫이고 나머지 payment 금액은 주문그룹 전체 값(BE OrderDetailResult).
// 배송지는 주문그룹 소유이고, 송장·진행 중 클레임·구매확정 기한은 셀러 주문 단위다.
function orderDetailResponse(group: OrderGroupRow, so: SellerOrderRow): OrderDetailResponse {
  return {
    orderId: so.orderId,
    orderGroupId: group.orderGroupId,
    orderedAt: group.orderedAt,
    status: so.status,
    sellerName: so.sellerName,
    items: so.items,
    payment: {
      sellerShippingFee: so.sellerShippingFee ?? 0,
      totalProductAmount: group.totalProductAmount,
      totalShippingFee: group.totalShippingFee,
      couponDiscountAmount: group.couponDiscountAmount ?? 0,
      usedPoint: group.usedPoint,
      finalPaymentAmount: group.finalPaymentAmount,
    },
    deliveryAddress: group.deliveryAddress ?? ORDER_DELIVERY_ADDRESS,
    shipment: so.shipment ?? null,
    activeClaim: so.activeClaim ?? null,
    purchaseConfirmDueAt: so.purchaseConfirmDueAt ?? null,
  }
}

// ---- 결제 ----------------------------------------------------------------------------
export interface PaymentErrorSeed {
  status: number
  errorCode: number
  message?: string
}
/** complete 한 번의 결과 — 상태 문자열, 상태+failureCode, 또는 에러 응답. */
export type PaymentCompleteStep =
  | PaymentCompletionStatus
  | { status: PaymentCompletionStatus; failureCode?: string | null }
  | { error: PaymentErrorSeed }

export interface PaymentStateSeed {
  /** prepare 201 본문(부분 지정 가능, 나머지는 기본값) 또는 에러. 미지정이면 성공 기본값. */
  prepare?: Partial<PreparePaymentResponse> | { error: PaymentErrorSeed }
  /** complete 호출마다 순서대로 소비하고 마지막 값을 반복. 미지정이면 ['PAID']. */
  completeSequence?: PaymentCompleteStep[]
  finalPaymentAmount?: number
  usedPoint?: number
  /** PAID 때 장바구니에서 지울 행 — POST /order-groups로 만든 그룹이면 그 기록에서 가져오므로 생략 가능. */
  cartItemIds?: number[]
}

// BE PaymentErrorCode 문구 — 시드가 message를 생략하면 여기서 채운다.
export const PAYMENT_ERROR_MESSAGES: Record<number, string> = {
  60005: '결제 게이트웨이 호출에 실패했습니다.',
  60006: '이미 결제가 완료된 건입니다.',
  60007: '결제 금액이 올바르지 않습니다.',
  60008: '주문 정보를 찾을 수 없습니다.',
  60009: '결제 가능 시간이 만료되었습니다.',
  60010: '결제 금액이 주문 금액과 일치하지 않습니다. 고객센터로 문의해 주세요.',
  60011: '지원하지 않는 결제 상태입니다. 고객센터로 문의해 주세요.',
  60012: '만료로 취소된 주문입니다. 결제가 진행되었다면 환불 처리됩니다.',
}

let paymentSeeds: Record<string, PaymentStateSeed> = {}
let paymentCalls = new Map<string, { prepare: number; complete: number }>()

/**
 * orderGroupId별 결제 응답을 세운다. 키 '*'는 POST /order-groups로 만든 그룹 전체의 기본값.
 * 시드도 생성 기록도 없는 그룹은 404 60008. 인자 없이 부르면 전부 비우고 호출 횟수도 리셋.
 */
export function seedPaymentState(states: Record<string, PaymentStateSeed> = {}): void {
  paymentSeeds = { ...states }
  paymentCalls = new Map()
}

/** prepare/complete가 그 그룹에 몇 번 불렸는지 — 동시 발화 억제 검증용. */
export function paymentCallCounts(orderGroupId: string): { prepare: number; complete: number } {
  return { ...(paymentCalls.get(orderGroupId) ?? { prepare: 0, complete: 0 }) }
}

function bumpPaymentCall(orderGroupId: string, kind: 'prepare' | 'complete'): number {
  const counts = paymentCalls.get(orderGroupId) ?? { prepare: 0, complete: 0 }
  const before = counts[kind]
  counts[kind] = before + 1
  paymentCalls.set(orderGroupId, counts)
  return before
}

const isErrorSeed = (value: unknown): value is { error: PaymentErrorSeed } =>
  typeof value === 'object' && value != null && 'error' in value

const paymentErrorJson = ({ status, errorCode, message }: PaymentErrorSeed) =>
  errorJson(status, errorCode, message ?? PAYMENT_ERROR_MESSAGES[errorCode] ?? '결제 오류')

interface ResolvedPaymentState {
  prepare: PreparePaymentResponse | { error: PaymentErrorSeed }
  completeSequence: PaymentCompleteStep[]
  finalPaymentAmount: number
  usedPoint: number
  cartItemIds: number[]
}

function resolvePaymentState(orderGroupId: string): ResolvedPaymentState | null {
  const created = createdOrderGroups.find(record => record.orderGroupId === orderGroupId)
  const seed = paymentSeeds[orderGroupId] ?? (created ? paymentSeeds['*'] : undefined)
  if (!seed && !created) return null
  const finalPaymentAmount = seed?.finalPaymentAmount ?? created?.finalPaymentAmount ?? 0
  const usedPoint = seed?.usedPoint ?? created?.usedPoint ?? 0
  const prepare = isErrorSeed(seed?.prepare)
    ? seed.prepare
    : {
        paymentId: orderGroupId,
        targetAmount: finalPaymentAmount,
        storeId: 'store-test',
        channelKey: 'channel-key-test',
        ...seed?.prepare,
      }
  const completeSequence = seed?.completeSequence?.length
    ? seed.completeSequence
    : ['PAID' as const]
  return {
    prepare,
    completeSequence,
    finalPaymentAmount,
    usedPoint,
    cartItemIds: seed?.cartItemIds ?? created?.cartItemIds ?? [],
  }
}

/** 확정 후처리 — 주문한 장바구니 행 삭제 + 생성 기록이 있으면 주문 목록에 PAID 그룹으로 올린다. */
function markPaid(orderGroupId: string, cartItemIds: number[]): void {
  const idSet = new Set(cartItemIds)
  cartRows = cartRows.filter(row => !idSet.has(row.cartItemId))
  const record = createdOrderGroups.find(r => r.orderGroupId === orderGroupId)
  if (!record || record.paid) return
  record.paid = true
  const group: OrderGroupRow = {
    orderGroupId,
    orderedAt: new Date().toISOString(),
    totalProductAmount: record.totalProductAmount,
    totalShippingFee: record.totalShippingFee,
    couponDiscountAmount: 0,
    usedPoint: record.usedPoint,
    finalPaymentAmount: record.finalPaymentAmount,
    sellerOrders: groupBySeller(record.lines).map(lines => ({
      orderId: ulid(),
      sellerName: (lines[0] as CartLineRow).storeName,
      status: OrderStatus.PAID,
      sellerShippingFee: shippingFeeOf(lines),
      // 결제가 만든 주문 품목에도 서버처럼 품목 id와 상품 공개 id가 실린다(리뷰 작성·상품 링크의 재료).
      items: lines.map(line => {
        nextOrderItemId += 1
        return {
          orderItemId: nextOrderItemId,
          productId: line.productId,
          productName: line.productName,
          thumbnailUrl: line.thumbnail ?? null,
          optionName: line.selectedOptions,
          quantity: line.quantity,
          unitPrice: line.price,
          itemStatus: 'ORDERED' as const,
        }
      }),
    })),
  }
  orderGroupRows = [group, ...orderGroupRows]
}

const paymentHandlers = [
  http.post(PAYMENT_PREPARE_URL, async ({ params, request }) => {
    const orderGroupId = String(params['orderGroupId'])
    const body = (await request.json()) as { method?: string }
    if (!Object.values(PaymentMethod).includes(body.method as PaymentMethod)) {
      return errorJson(400, 90001, '요청 본문을 읽을 수 없습니다.')
    }
    const state = resolvePaymentState(orderGroupId)
    if (!state) return paymentErrorJson({ status: 404, errorCode: 60008 })
    bumpPaymentCall(orderGroupId, 'prepare')
    if (isErrorSeed(state.prepare)) return paymentErrorJson(state.prepare.error)
    return HttpResponse.json({ data: state.prepare }, { status: 201 })
  }),
  http.post(PAYMENT_COMPLETE_URL, ({ params }) => {
    const orderGroupId = String(params['orderGroupId'])
    const state = resolvePaymentState(orderGroupId)
    if (!state) return paymentErrorJson({ status: 404, errorCode: 60008 })
    const call = bumpPaymentCall(orderGroupId, 'complete')
    const step = state.completeSequence[
      Math.min(call, state.completeSequence.length - 1)
    ] as PaymentCompleteStep
    if (isErrorSeed(step)) return paymentErrorJson(step.error)
    const { status, failureCode } =
      typeof step === 'string'
        ? { status: step, failureCode: null }
        : { status: step.status, failureCode: step.failureCode ?? null }
    if (status === 'PAID') markPaid(orderGroupId, state.cartItemIds)
    return HttpResponse.json({
      data: {
        status,
        orderGroupId,
        finalPaymentAmount: state.finalPaymentAmount,
        usedPoint: state.usedPoint,
        failureCode,
      },
    })
  }),
]

// ─────────────────────────────────────────────────────────────────────────────
// 클레임(취소·반품·교환) — GET·POST /orders/{id}/claims, DELETE .../{claimPublicId},
// GET /claims/reasons. 주문그룹 단건 조회(GET /order-groups/{id})도 여기서 다룬다.
// BE 규칙 중 화면 동작을 가르는 것만 재현한다: 유형별 요청 가능 상태, 중복 차단, 전량 제약,
// 철회 가능 상태, 요청이 품목·activeClaim을 바꾸는 것.
// ─────────────────────────────────────────────────────────────────────────────
export const ORDER_GROUP_DETAIL_URL = `${base}/order-groups/:orderGroupId`
export const ORDER_CLAIMS_URL = `${base}/orders/:orderPublicId/claims`
export const ORDER_CLAIM_URL = `${base}/orders/:orderPublicId/claims/:claimPublicId`
export const CLAIM_REASONS_URL = `${base}/claims/reasons`

/** be ClaimType.requestableFrom — 취소는 발송 전, 반품·교환은 배송완료만. */
const CLAIM_REQUESTABLE_FROM: Record<ClaimType, ReadonlySet<OrderStatus>> = {
  CANCEL: new Set([OrderStatus.PAID, OrderStatus.PREPARING, OrderStatus.DISPATCH_PENDING]),
  RETURN: new Set([OrderStatus.DELIVERED]),
  EXCHANGE: new Set([OrderStatus.DELIVERED]),
}

/** be ClaimStatus.RELEASED — 거부·철회만 품목을 풀어준다. */
const RELEASED_CLAIM_STATUSES: ReadonlySet<ClaimStatus> = new Set([
  ClaimStatus.REJECTED,
  ClaimStatus.WITHDRAWN,
])

/** be ClaimReasonCode.selectableFor(SCRUM-273) — 유형별 선택지와 문구를 서버가 내려준다. */
export const CLAIM_REASON_CATALOG: ClaimReasonCatalogResponse = {
  claimTypes: [
    {
      claimType: 'CANCEL',
      reasons: [
        { code: 'CHANGE_OF_MIND', label: '단순 변심', detailRequired: false },
        { code: 'WRONG_OPTION', label: '옵션을 잘못 선택했어요', detailRequired: false },
        { code: 'PRICE_MISMATCH', label: '가격 조건이 맞지 않아요', detailRequired: false },
        { code: 'DELIVERY_DELAY', label: '배송이 너무 늦어요', detailRequired: false },
        { code: 'OTHER', label: '기타', detailRequired: true },
      ],
    },
    {
      claimType: 'RETURN',
      reasons: [
        { code: 'CHANGE_OF_MIND', label: '단순 변심', detailRequired: false },
        { code: 'DEFECTIVE', label: '상품이 파손되었거나 불량이에요', detailRequired: false },
        { code: 'WRONG_ITEM', label: '주문과 다른 상품이 왔어요', detailRequired: false },
        { code: 'NOT_AS_DESCRIBED', label: '상품 설명과 달라요', detailRequired: false },
        { code: 'OTHER', label: '기타', detailRequired: true },
      ],
    },
    {
      claimType: 'EXCHANGE',
      reasons: [
        { code: 'DEFECTIVE', label: '상품이 파손되었거나 불량이에요', detailRequired: false },
        { code: 'WRONG_ITEM', label: '주문과 다른 상품이 왔어요', detailRequired: false },
        { code: 'WRONG_OPTION', label: '옵션을 잘못 선택했어요', detailRequired: false },
        { code: 'OTHER', label: '기타', detailRequired: true },
      ],
    },
  ],
}

/** orderId → 클레임 내역. seedOrderGroups()가 비운다. */
let orderClaimRows = new Map<string, ClaimItemResponse[]>()
let nextClaimSeq = 1

/**
 * 주문의 클레임 내역을 세운다. 진행 중 건을 심을 때는 셀러 주문의 `activeClaim`도 함께 세울 것 —
 * BE는 두 응답이 같은 사실을 가리키므로 한쪽만 심으면 실제와 다른 조합이 된다.
 */
export function seedOrderClaims(orderId: string, claims: ClaimItemResponse[]): void {
  orderClaimRows.set(
    orderId,
    claims.map(claim => ({ ...claim, items: claim.items.map(item => ({ ...item })) })),
  )
}

export function resetOrderClaims(): void {
  orderClaimRows = new Map()
  nextClaimSeq = 1
}

export function makeClaimItem(
  overrides: Partial<ClaimItemResponse> = {},
): ClaimItemResponse {
  return {
    claimPublicId: `CLAIM${nextClaimSeq++}`,
    claimType: 'RETURN',
    status: 'CLAIM_REQUESTED',
    refundStatus: 'NONE',
    sellerApprovalStatus: 'REQUESTED',
    returnCostBearer: null,
    refundAmount: 64000,
    rejectionReason: null,
    // BE는 LocalDateTime 직렬화라 오프셋이 없다 — 어댑터가 KST로 읽는지 보려면 이 모양이어야 한다.
    requestedAt: '2026-10-20T10:00:00',
    approvedAt: null,
    resolvedAt: null,
    items: [],
    ...overrides,
  }
}

/** 주문그룹을 찾고 그 안에서 셀러 주문을 집는다(결제대기는 상세·클레임 대상이 아니다). */
function findSellerOrder(orderId: string): { group: OrderGroupRow; so: SellerOrderRow } | null {
  for (const group of orderGroupRows) {
    const so = group.sellerOrders.find(s => s.orderId === orderId)
    if (so && so.status !== OrderStatus.PENDING_PAYMENT) return { group, so }
  }
  return null
}

const claimHandlers = [
  // 주문그룹 단건 — 금액·배송지 + 하위 셀러 주문 전부(결제대기 포함, 거르는 것은 화면 몫).
  http.get(ORDER_GROUP_DETAIL_URL, ({ params }) => {
    const groupId = String(params['orderGroupId'])
    const group = orderGroupRows.find(g => g.orderGroupId === groupId)
    if (!group) return errorJson(404, 50109, '주문 정보를 찾을 수 없습니다.')
    return HttpResponse.json({
      data: {
        orderGroupId: group.orderGroupId,
        status: group.sellerOrders.every(so => so.status === OrderStatus.CANCELLED)
          ? 'CANCELLED'
          : 'PAID',
        totalProductAmount: group.totalProductAmount,
        totalShippingFee: group.totalShippingFee,
        usedPoint: group.usedPoint,
        finalPaymentAmount: group.finalPaymentAmount,
        expiresAt: group.orderedAt,
        deliveryAddress: group.deliveryAddress ?? ORDER_DELIVERY_ADDRESS,
        orders: group.sellerOrders.map(so => ({
          orderId: so.orderId,
          status: so.status,
          sellerName: so.sellerName,
          sellerShippingFee: so.sellerShippingFee ?? 0,
          items: so.items,
        })),
      },
    })
  }),

  // 사유 선택지. **SCRUM-273 머지 전 dev에는 이 경로가 없다** — 404를 보는 테스트는 server.use로 덮는다.
  http.get(CLAIM_REASONS_URL, () => HttpResponse.json({ data: CLAIM_REASON_CATALOG })),

  http.get(ORDER_CLAIMS_URL, ({ params }) => {
    const orderId = String(params['orderPublicId'])
    if (!findSellerOrder(orderId)) return errorJson(404, 50000, '주문을 찾을 수 없습니다.')
    return HttpResponse.json({ data: { items: orderClaimRows.get(orderId) ?? [] } })
  }),

  http.post(ORDER_CLAIMS_URL, async ({ params, request }) => {
    const orderId = String(params['orderPublicId'])
    const found = findSellerOrder(orderId)
    if (!found) return errorJson(404, 50000, '주문을 찾을 수 없습니다.')
    const { so } = found
    const body = (await request.json()) as {
      claimType?: ClaimType
      reasonCode?: string
      reasonDetail?: string | null
      items?: { orderItemId: number; quantity: number }[]
    }
    const claimType = body.claimType
    if (claimType == null || body.reasonCode == null || body.reasonCode.trim() === '') {
      return errorJson(400, 90001, '잘못된 요청입니다.')
    }
    if (!CLAIM_REQUESTABLE_FROM[claimType].has(so.status)) {
      return errorJson(409, 50401, '현재 주문 상태에서는 요청할 수 없는 클레임입니다.')
    }
    // 대상 지정이 없으면 주문 전체 전량(be resolveTargets).
    const targets =
      body.items && body.items.length > 0
        ? body.items
        : so.items.map(item => ({ orderItemId: item.orderItemId, quantity: item.quantity }))
    const held = new Set(
      (orderClaimRows.get(orderId) ?? [])
        .filter(claim => !RELEASED_CLAIM_STATUSES.has(claim.status))
        .flatMap(claim => claim.items.map(item => item.orderItemId)),
    )
    for (const target of targets) {
      const line = so.items.find(item => item.orderItemId === target.orderItemId)
      if (!line) return errorJson(404, 50000, '주문을 찾을 수 없습니다.')
      if (target.quantity > line.quantity) {
        return errorJson(422, 50406, '주문한 수량보다 많이 요청할 수 없습니다.')
      }
      if (target.quantity < line.quantity) {
        return errorJson(422, 50410, '주문한 수량 전부를 대상으로만 요청할 수 있습니다.')
      }
      if (held.has(target.orderItemId)) {
        return errorJson(409, 50403, '이미 진행 중인 클레임이 있는 상품입니다.')
      }
    }
    // 환불액은 서버가 확정한다(be ClaimAmountCalculator). 배송비는 **주문 전체를 대상으로 할 때만**
    // 돌려주고, **교환도 같은 계산식을 탄다** — 교환은 실제 환불 집행 대상에서만 빠지므로 응답에는
    // 0이 아닌 금액이 실려 온다. 스텁이 교환을 0으로 내리면 화면이 그 금액을 환불처럼 그려도 드러나지 않는다.
    const itemRefund = targets.reduce((sum, target) => {
      const line = so.items.find(item => item.orderItemId === target.orderItemId)
      return sum + (line ? line.unitPrice * target.quantity : 0)
    }, 0)
    const coversWholeOrder = so.items.every(item =>
      targets.some(
        target => target.orderItemId === item.orderItemId && target.quantity >= item.quantity,
      ),
    )
    const refundAmount = itemRefund + (coversWholeOrder ? (so.sellerShippingFee ?? 0) : 0)

    const claim = makeClaimItem({
      claimType,
      status: 'CLAIM_REQUESTED',
      // be Claim.request는 유형을 가리지 않고 refundStatus=NONE으로 둔다.
      refundStatus: 'NONE',
      sellerApprovalStatus: 'REQUESTED',
      refundAmount,
      items: targets.map(target => {
        const line = so.items.find(item => item.orderItemId === target.orderItemId)
        return {
          orderItemId: target.orderItemId,
          productName: line?.productName ?? '',
          quantity: target.quantity,
          refundAmount: line ? line.unitPrice * target.quantity : 0,
        }
      }),
    })
    orderClaimRows.set(orderId, [...(orderClaimRows.get(orderId) ?? []), claim])
    // 진행 중 클레임은 주문 상세에도 실린다(구매확정·새 요청을 잠그는 근거).
    so.activeClaim = {
      claimPublicId: claim.claimPublicId,
      claimType,
      status: 'CLAIM_REQUESTED',
      refundStatus: claim.refundStatus ?? null,
    }
    // 반품·교환은 요청 시점에 품목이 잡힌다(취소는 환불 집행 때 바뀐다 — be markRequestedItems).
    if (claimType !== 'CANCEL') {
      const itemStatus: OrderItemStatus =
        claimType === 'RETURN' ? 'RETURN_REQUESTED' : 'EXCHANGE_REQUESTED'
      for (const target of targets) {
        const line = so.items.find(item => item.orderItemId === target.orderItemId)
        if (line) line.itemStatus = itemStatus
      }
    }
    return HttpResponse.json(
      {
        data: {
          claimPublicId: claim.claimPublicId,
          claimType,
          status: 'CLAIM_REQUESTED',
          refundAmount,
          sellerApprovalStatus: 'REQUESTED',
          autoApproveDueAt: '2026-10-22T10:00:00',
          requestedAt: '2026-10-20T10:00:00',
        },
      },
      { status: 201 },
    )
  }),

  // 철회 — 셀러가 판단하기 전(CLAIM_REQUESTED)에만. 그 뒤에는 전이가 막혀 409 50402.
  http.delete(ORDER_CLAIM_URL, ({ params }) => {
    const orderId = String(params['orderPublicId'])
    const claimPublicId = String(params['claimPublicId'])
    const found = findSellerOrder(orderId)
    if (!found) return errorJson(404, 50000, '주문을 찾을 수 없습니다.')
    const { so } = found
    const claims = orderClaimRows.get(orderId) ?? []
    const claim = claims.find(c => c.claimPublicId === claimPublicId)
    if (!claim) return errorJson(404, 50400, '클레임을 찾을 수 없습니다.')
    if (claim.status !== 'CLAIM_REQUESTED') {
      return errorJson(409, 50402, '허용되지 않은 클레임 상태 전이입니다.')
    }
    claim.status = 'WITHDRAWN'
    claim.resolvedAt = '2026-10-21T10:00:00'
    if (so.activeClaim?.claimPublicId === claimPublicId) delete so.activeClaim
    // 잡혀 있던 품목을 되돌린다(be revertRequestedItems) — 되돌리지 않으면 다시 요청할 수 없다.
    if (claim.claimType !== 'CANCEL') {
      for (const line of claim.items) {
        const item = so.items.find(i => i.orderItemId === line.orderItemId)
        if (item) item.itemStatus = 'ORDERED'
      }
    }
    return new HttpResponse(null, { status: 204 })
  }),
]

export const handlers = [
  ...deliveryAddressHandlers,
  ...cartHandlers,
  ...orderHandlers,
  ...claimHandlers,
  ...paymentHandlers,
  ...petHandlers,
  ...accountHandlers,
  ...onboardingHandlers,
  ...likedProductHandlers,
  ...snsHandlers,
  ...productInquiryHandlers,
  ...noticeHandlers,
  // 탈퇴 — 기본은 BE 현행(WithdrawalFacade가 항상 withdrawable=true)과 같다. 제한/에러는 테스트가 server.use로 덮는다.
  http.get(WITHDRAWAL_CHECK_URL, () => HttpResponse.json({ data: { withdrawable: true } })),
  http.delete(USER_ME_URL, () => new HttpResponse(null, { status: 204 })),
  // POST /inquiries — 접수 성공(RECEIVED). 실제 저장/통지는 BE 소관이라 계약(201 + data)만 재현한다.
  http.post(INQUIRIES_URL, () =>
    HttpResponse.json(
      { data: { status: 'RECEIVED', createdAt: '2026-08-09T20:00:00' } },
      { status: 201 },
    ),
  ),
  http.get(BREEDS_URL, ({ request }) => {
    const species = new URL(request.url).searchParams.get('species')
    if (species !== 'DOG' && species !== 'CAT') {
      // 서버 계약: 잘못된 species는 400 + CommonErrorCode.INVALID_REQUEST(90001)
      return HttpResponse.json({ errorCode: 90001, message: 'invalid species' }, { status: 400 })
    }
    return HttpResponse.json({ data: BREED_FIXTURES[species] })
  }),
  // 401 시나리오에서 axios 인터셉터의 refresh 재시도가 성공으로 새면 에러 테스트가 조용히
  // 통과해버린다. 기본 핸들러는 반드시 401 고정.
  http.post(WEB_REFRESH_URL, () =>
    HttpResponse.json({ errorCode: 20004, message: '인증이 필요합니다.' }, { status: 401 }),
  ),
  // 웹 로그아웃 — 서버 계약이 완전 멱등(쿠키가 없어도 204 No Content, 본문 없음).
  http.post(WEB_LOGOUT_URL, () => new HttpResponse(null, { status: 204 })),
  // 적립금 잔액 — seedPointBalance로 세운 값을 봉투에 담아 내려준다(미시드면 0).
  http.get(POINTS_URL, () => HttpResponse.json({ data: { balance: pointBalance } })),
  // 홈(GET /home) — BE HomeResponse 봉투. 추천은 판매중만(최대 8), 랭킹은 품절 포함 상위 5.
  // 카드 isLiked는 다른 목록과 같이 likedProductRows를 진실 소스로 삼는다.
  http.get(HOME_URL, () => {
    const card = (product: ProductFixture['product']) => ({
      ...product,
      isLiked: isLikedFixture(product.productId),
    })
    const products = PRODUCT_FIXTURES.map(f => f.product)
    return HttpResponse.json({
      data: {
        recommended: products
          .filter(p => p.saleStatus === 'ON_SALE')
          .slice(0, 8)
          .map(card),
        ranking: products.slice(0, 5).map(card),
      },
    })
  }),
  // 카테고리 트리(마켓 대분류/중분류).
  http.get(CATEGORIES_URL, () => HttpResponse.json({ data: CATEGORY_FIXTURES })),
  // 상품 목록 — category 필터 + sort(price_asc) + 커서(인덱스 2개씩) 페이지네이션.
  http.get(PRODUCTS_URL, ({ request }) => {
    const url = new URL(request.url)
    const catParam = url.searchParams.get('category')
    const sort = url.searchParams.get('sort')
    const cursor = url.searchParams.get('cursor')
    let list = PRODUCT_FIXTURES
    if (catParam) {
      const id = Number(catParam)
      list = PRODUCT_FIXTURES.filter(
        f => f.categoryId === id || CATEGORY_PARENT[f.categoryId] === id,
      )
    }
    let products = list.map(f => f.product)
    if (sort === 'price_asc') {
      products = [...products].sort(
        (a, b) => (a.discountPrice ?? a.regularPrice) - (b.discountPrice ?? b.regularPrice),
      )
    }
    const pageSize = 2
    const start = cursor ? Number(cursor) : 0
    const page = products.slice(start, start + pageSize)
    const nextIndex = start + pageSize
    const hasNext = nextIndex < products.length
    return HttpResponse.json({
      data: {
        products: page.map(product => ({ ...product, isLiked: isLikedFixture(product.productId) })),
        totalCount: products.length,
        nextCursor: hasNext ? String(nextIndex) : null,
        hasNext,
      },
    })
  }),
  http.get(SEARCH_KEYWORDS_URL, () =>
    HttpResponse.json({
      data: {
        recentKeywords: searchRecentKeywords,
        recommendedKeywords: [
          { keyword: '여름 쿨매트' },
          { keyword: '덴탈껌' },
          { keyword: '대용량 사료' },
        ],
      },
    }),
  ),
  http.delete(RECENT_KEYWORDS_URL, () => {
    searchRecentKeywords = []
    return new HttpResponse(null, { status: 204 })
  }),
  http.delete(`${RECENT_KEYWORDS_URL}/:id`, ({ params }) => {
    searchRecentKeywords = searchRecentKeywords.filter(item => item.id !== Number(params.id))
    return new HttpResponse(null, { status: 204 })
  }),
  http.get(SEARCH_PRODUCTS_URL, ({ request }) => {
    const params = new URL(request.url).searchParams
    const keyword = (params.get('keyword') ?? '').trim().toLowerCase()
    const minPrice = Number(params.get('minPrice') ?? 0)
    const maxPrice = Number(params.get('maxPrice') ?? Number.MAX_SAFE_INTEGER)
    const minRating = Number(params.get('minRating') ?? 0)
    const freeShipping = params.get('freeShipping') === 'true'
    const excludeSoldOut = params.get('excludeSoldOut') === 'true'
    const sort = params.get('sort') ?? 'popular'
    const cursor = Number(params.get('cursor') ?? 0)
    const size = Number(params.get('size') ?? 20)

    let products = CATALOG_PRODUCTS.filter(product => {
      const haystack = `${product.name} ${product.storeName ?? ''}`.toLowerCase()
      const priceMatches = product.price >= minPrice && product.price <= maxPrice
      const ratingMatches = (product.rating ?? 0) >= minRating
      return (
        haystack.includes(keyword) &&
        priceMatches &&
        ratingMatches &&
        (!freeShipping || product.price >= FREE_SHIPPING_THRESHOLD) &&
        (!excludeSoldOut || !product.isSoldOut)
      )
    })
    if (sort === 'popular')
      products = [...products].sort((a, b) => (b.reviewCount ?? 0) - (a.reviewCount ?? 0))
    if (sort === 'price_asc') products = [...products].sort((a, b) => a.price - b.price)
    if (sort === 'latest')
      products = [...products].sort((a, b) => b.createdAt.localeCompare(a.createdAt))

    const page = products.slice(cursor, cursor + size)
    const next = cursor + size
    const hasNext = next < products.length
    return HttpResponse.json({
      data: {
        products: page.map(product => ({
          productId: product.id,
          name: product.name,
          sellerName: product.storeName ?? '',
          thumbnailImageKey: null,
          regularPrice: product.originalPrice ?? product.price,
          discountPrice: product.originalPrice != null ? product.price : null,
          discountRate:
            product.originalPrice != null
              ? Math.round((1 - product.price / product.originalPrice) * 100)
              : null,
          saleStatus: product.isSoldOut ? 'OUT_OF_STOCK' : 'ON_SALE',
          averageRating: product.rating ?? null,
          reviewCount: product.reviewCount ?? 0,
          isLiked: isLikedFixture(product.id),
          isViewable: true,
          isPurchasable: !product.isSoldOut,
        })),
        totalCount: cursor === 0 ? products.length : null,
        nextCursor: hasNext ? String(next) : null,
        hasNext,
      },
    })
  }),
  // 상품 상세 — 실 픽스처 id만 200, 나머지(목업 id 포함)는 404 -> 화면이 목업으로 폴백.
  http.get(PRODUCT_DETAIL_URL, ({ params }) =>
    params.productId === REAL_PRODUCT_ID
      ? HttpResponse.json({ data: REAL_PRODUCT_DETAIL })
      : new HttpResponse(null, { status: 404 }),
  ),
  // 상품 옵션 — 상세와 동일하게 실 픽스처 id만 200, 나머지는 404 -> 목업 옵션 폴백.
  http.get(PRODUCT_OPTIONS_URL, ({ params }) =>
    params.productId === REAL_PRODUCT_ID
      ? HttpResponse.json({ data: REAL_PRODUCT_OPTIONS })
      : new HttpResponse(null, { status: 404 }),
  ),
  // 리뷰 작성 — 계약(201 + data)만 재현한다. reviewId는 요청 orderItemId에서 결정적으로 만들어
  // 같은 주문 품목을 두 번 보내도 같은 id가 나온다(스토어 upsert 검증에 쓴다).
  http.post(REVIEWS_URL, async ({ request }) => {
    const body = (await request.json()) as {
      orderItemId: number
      rating: number
      content: string
      imageKeys?: string[]
    }
    return HttpResponse.json(
      {
        data: {
          reviewId: 900 + body.orderItemId,
          productId: 1,
          rating: body.rating,
          content: body.content,
          optionName: '기본형',
          createdAt: '2026-08-21T10:00:00',
          images: (body.imageKeys ?? []).map((key, i) => ({
            imageUrl: `https://fake-s3.local/${key}`,
            sortOrder: i,
          })),
        },
      },
      { status: 201 },
    )
  }),
  // 리뷰 삭제 — 계약(204, 본문 없음)만 재현한다. 권한/존재 판정은 서버 소관이라 여기선 항상 성공하고,
  // 403·404 분기는 테스트가 server.use로 갈아끼운다.
  http.delete(REVIEW_DETAIL_URL, () => new HttpResponse(null, { status: 204 })),
  // 내 리뷰 — 기본은 두 탭 모두 빈 목록(서버에 주문/리뷰가 없는 계정). 기존 화면 테스트가 목업 주문/리뷰
  // 개수를 그대로 검증할 수 있게 비워 두고, 서버 항목이 필요한 테스트가 server.use로 갈아끼운다.
  // tab이 없거나 모르는 값이면 BE처럼 400(90001)을 준다.
  http.get(MY_REVIEWS_URL, ({ request }) => {
    const url = new URL(request.url)
    const tab = url.searchParams.get('tab')
    if (tab !== 'written' && tab !== 'unreviewed') {
      return HttpResponse.json({ errorCode: 90001, message: '잘못된 요청입니다.' }, { status: 400 })
    }
    const firstPage = !url.searchParams.has('cursor')
    return HttpResponse.json({
      data: { items: [], totalCount: firstPage ? 0 : null, nextCursor: null, hasNext: false },
    })
  }),
  // 상품 리뷰 목록 — 실 픽스처 id만 200(sort/photoOnly/cursor 반영), 나머지는 404 -> 목업 리뷰 폴백.
  // summary/totalCount는 첫 페이지(cursor 없음)에만. summary는 photoOnly 무관 전체, totalCount는 반영.
  http.get(PRODUCT_REVIEWS_URL, ({ params, request }) => {
    if (params.productId !== REAL_PRODUCT_ID) return new HttpResponse(null, { status: 404 })
    const url = new URL(request.url)
    const sort = url.searchParams.get('sort') ?? 'latest'
    const photoOnly = url.searchParams.get('photoOnly') === 'true'
    const cursor = url.searchParams.get('cursor')
    const size = Number(url.searchParams.get('size') ?? 20)

    let list = [...REAL_PRODUCT_REVIEWS]
    if (photoOnly) list = list.filter(r => r.images.length > 0)
    list.sort((a, b) =>
      sort === 'rating_desc'
        ? b.rating - a.rating || b.reviewId - a.reviewId
        : b.reviewId - a.reviewId,
    )

    const start = cursor ? Number(cursor) : 0
    const page = list.slice(start, start + size)
    const nextIndex = start + size
    const hasNext = nextIndex < list.length
    const firstPage = cursor == null
    return HttpResponse.json({
      data: {
        summary: firstPage ? realReviewSummary() : null,
        reviews: page,
        totalCount: firstPage ? list.length : null,
        nextCursor: hasNext ? String(nextIndex) : null,
        hasNext,
      },
    })
  }),
  // 리뷰 AI 요약. 기본은 실 픽스처 id도 요약 없음(카드 미노출)이고, 요약이 필요한 테스트가 server.use로 갈아끼운다.
  http.get(PRODUCT_REVIEW_SUMMARY_URL, ({ params }) =>
    params.productId === REAL_PRODUCT_ID
      ? HttpResponse.json({ data: { productSummary: null, similarPetSummary: null } })
      : new HttpResponse(null, { status: 404 }),
  ),
]

export const server = setupServer(...handlers)

export * from './sns'
export * from './product-inquiry'
export * from './notices'
