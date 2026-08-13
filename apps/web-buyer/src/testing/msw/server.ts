import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { axiosInstance } from '@aechak/api'
import { CATALOG_PRODUCTS, FREE_SHIPPING_THRESHOLD } from '@/shared/catalog'

// vitest 공용 MSW 서버(test-setup.ts가 수명주기를 관리). 실제 HTTP 경로(URL·쿼리 파라미터·
// envelope 해석)까지 검증하려고 모듈 모킹 대신 네트워크 레벨에서 가로챈다.
// 테스트는 main.tsx를 안 거치므로 baseURL은 client.ts 기본값(http://localhost:8080/api/v1) —
// 문자열을 중복 선언하지 않고 인스턴스에서 읽어 계약 변경에 자동 추종한다.
const base = axiosInstance.defaults.baseURL ?? ''
export const BREEDS_URL = `${base}/breeds`
export const WEB_REFRESH_URL = `${base}/auth/web/refresh`
export const DELIVERY_ADDRESSES_URL = `${base}/delivery-addresses`
export const CATEGORIES_URL = `${base}/categories`
export const PRODUCTS_URL = `${base}/products`
export const PRODUCT_DETAIL_URL = `${base}/products/:productId`
export const PRODUCT_OPTIONS_URL = `${base}/products/:productId/options`
export const PRODUCT_LIKE_URL = `${base}/products/:productId/like`
export const LIKED_PRODUCTS_URL = `${base}/users/me/liked-products`
export const SEARCH_PRODUCTS_URL = `${base}/search/products`
export const SEARCH_KEYWORDS_URL = `${base}/search/keywords`
export const RECENT_KEYWORDS_URL = `${base}/search/recent-keywords`

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
        products: page,
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
    profileImageUrl: row.profileImageKey == null ? null : `https://mock-cdn.local/${row.profileImageKey}`,
  }
}

// 서버는 species를 breed에서 파생시킨다. 요청에 실리지 않으므로 여기서도 breedId로 되짚는다.
function speciesOf(breedId: number): 'DOG' | 'CAT' {
  return BREED_FIXTURES.CAT.some(b => b.breedId === breedId) ? 'CAT' : 'DOG'
}

function labelOf(breedId: number): string {
  return (
    [...BREED_FIXTURES.DOG, ...BREED_FIXTURES.CAT].find(b => b.breedId === breedId)?.label ?? '알 수 없음'
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
    // 키 경로에 purpose를 반영해 프로필(USER_PROFILE)과 펫(PET_PROFILE) 업로드를 재현한다.
    const folder = body.purpose === 'USER_PROFILE' ? 'users/profile' : 'pets/profile'
    const key = `tmp/1/${folder}/fixture.${body.contentType.split('/')[1]}`
    return HttpResponse.json({ data: { url: `https://fake-s3.local/${key}`, key } })
  }),
  // presigned PUT은 S3 직행이라 baseURL 밖이다. 절대 URL로 따로 가로챈다.
  http.put('https://fake-s3.local/*', () => new HttpResponse(null, { status: 200 })),
]

export const USER_ME_URL = `${base}/users/me`
export const USER_PROFILE_URL = `${base}/users/me/profile`

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

/** 테스트마다 내 정보 상태를 세운다. 점유 닉네임·낙관락 옵션도 함께 초기화한다. */
export function seedAccount(overrides: Partial<AccountState> = {}): void {
  account = { ...DEFAULT_ACCOUNT, ...overrides }
  takenNicknames = new Set()
  concurrentModOnce = false
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
      return HttpResponse.json({ errorCode: 90003, message: '다른 곳에서 먼저 수정했습니다.' }, { status: 409 })
    }
    const nfc = body.nickname.normalize('NFC').toLowerCase()
    const keepsOwn = nfc === (account.nickname ?? '').normalize('NFC').toLowerCase()
    if (!keepsOwn && isNicknameTaken(body.nickname)) {
      return HttpResponse.json({ errorCode: 30001, message: '이미 사용 중인 닉네임입니다.' }, { status: 409 })
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
]

// ── 온보딩(약관·동의·닉네임) ──────────────────────────────────────────────────
// 서버 불변식(필수 동의 게이트·닉네임 중복/형식·PENDING→ACTIVE 전이)을 상태로 재현한다.
// 각 시더가 자신의 슬라이스와 온보딩 전이 상태를 리셋해 테스트 간 누수를 막는다.
export const TERMS_URL = `${base}/terms`
export const CONSENTS_URL = `${base}/users/me/consents`
export const NICKNAME_CHECK_URL = `${base}/users/nickname/check`
export const NICKNAME_URL = `${base}/users/me/nickname`

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
  { termId: 1, type: 'AGE_OVER_14', isRequired: true, version: '1.0', title: '만 14세 이상이에요', body: '만 14세 이상 확인', effectiveAt: '2026-01-01T00:00:00Z' },
  { termId: 2, type: 'SERVICE', isRequired: true, version: '1.0', title: '서비스 이용약관', body: '서비스 이용약관 본문', effectiveAt: '2026-01-01T00:00:00Z' },
  { termId: 3, type: 'PRIVACY', isRequired: true, version: '1.0', title: '개인정보 처리방침', body: '개인정보 처리방침 본문', effectiveAt: '2026-01-01T00:00:00Z' },
  { termId: 4, type: 'LOCATION', isRequired: true, version: '1.0', title: '위치기반 서비스 약관', body: '위치기반 서비스 약관 본문', effectiveAt: '2026-01-01T00:00:00Z' },
  { termId: 5, type: 'MARKETING', isRequired: false, version: '1.0', title: '마케팅 정보 수신 동의', body: '마케팅 정보 수신 동의 본문', effectiveAt: '2026-01-01T00:00:00Z' },
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
      return HttpResponse.json({ errorCode: 30004, message: '이미 온보딩이 완료된 계정입니다.' }, { status: 409 })
    }
    const body = (await request.json()) as { items?: SubmittedConsent[] }
    const items = body.items ?? []
    if (items.length === 0) {
      return HttpResponse.json({ errorCode: 90001, message: '동의 항목이 비었습니다.' }, { status: 400 })
    }
    const ids = items.map(item => item.termId)
    if (new Set(ids).size !== ids.length) {
      return HttpResponse.json({ errorCode: 90001, message: 'termId가 중복됩니다.' }, { status: 400 })
    }
    if (ids.some(id => !termRows.some(term => term.termId === id))) {
      return HttpResponse.json({ errorCode: 30400, message: '비활성이거나 알 수 없는 약관입니다.' }, { status: 400 })
    }
    // 활성 필수 약관은 전부 isAgreed=true로 포함돼야 한다.
    const requiredOk = termRows
      .filter(term => term.isRequired)
      .every(term => items.some(item => item.termId === term.termId && item.isAgreed))
    if (!requiredOk) {
      return HttpResponse.json({ errorCode: 30300, message: '필수 약관에 동의해야 합니다.' }, { status: 403 })
    }
    submittedConsents = items.map(item => ({ ...item }))
    requiredConsentSatisfied = true
    return new HttpResponse(null, { status: 204 })
  }),
  http.get(NICKNAME_CHECK_URL, ({ request }) => {
    const nickname = new URL(request.url).searchParams.get('nickname')
    if (nickname == null || nickname.length === 0) {
      return HttpResponse.json({ errorCode: 90001, message: 'nickname 파라미터가 필요합니다.' }, { status: 400 })
    }
    if (!NICKNAME_PATTERN.test(nickname.normalize('NFC'))) {
      return HttpResponse.json({ errorCode: 30002, message: '닉네임 형식이 올바르지 않습니다.' }, { status: 400 })
    }
    return HttpResponse.json({ data: { available: !isNicknameTaken(nickname) } })
  }),
  http.put(NICKNAME_URL, async ({ request }) => {
    if (onboardingCompleted) {
      return HttpResponse.json({ errorCode: 30004, message: '이미 온보딩이 완료된 계정입니다.' }, { status: 409 })
    }
    const body = (await request.json()) as { nickname?: string }
    const nickname = (body.nickname ?? '').normalize('NFC')
    if (!NICKNAME_PATTERN.test(nickname)) {
      return HttpResponse.json({ errorCode: 30002, message: '닉네임 형식이 올바르지 않습니다.' }, { status: 400 })
    }
    if (!requiredConsentSatisfied) {
      return HttpResponse.json({ errorCode: 30300, message: '필수 약관 동의가 필요합니다.' }, { status: 403 })
    }
    // 커밋 시점 최종 판정: 중복이면 409 30001.
    if (isNicknameTaken(nickname)) {
      return HttpResponse.json({ errorCode: 30001, message: '이미 사용 중인 닉네임입니다.' }, { status: 409 })
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

export const CART_URL = `${base}/carts`
export const CART_ITEMS_URL = `${base}/carts/items`
export const CART_ITEM_COUNT_URL = `${base}/carts/items/count`

// 장바구니도 상태가 있는 리소스다(담기→조회 반영, 수량 변경, 삭제). 배송지와 같은 이유로 응답
// 계약만 재현하고 서버 불변식(품목 종류 100 제한 등)은 흉내 내지 않는다. 재현하는 서버 규칙은
// 화면 분기가 실제로 의존하는 것만: 같은 조합 재담기 수량 합산, 재고 초과 50201, 미존재 조합
// 50207, 삭제 시 없는 id 무시, 최신 담김순 정렬.
export interface CartLineRow {
  cartItemId: number
  optionCombinationId: number
  productId: string
  productName: string
  selectedOptions: string
  quantity: number
  /** 할인 전 단가(정가+옵션 추가금). 서버가 역산 대신 직접 내려준다. */
  originalPrice: number
  /** 판매가+옵션 추가금 합산 단가(서버 계약). */
  price: number
  remainingStock: number
  itemStatus: 'ACTIVE' | 'SELLER_UNAVAILABLE' | 'SALE_ENDED' | 'SALE_SUSPENDED' | 'OPTION_UNAVAILABLE' | 'OUT_OF_STOCK'
  thumbnail?: string | null
  discountRate?: number | null
  sellerId: number
  storeName: string
  baseShippingFee: number
  freeShippingThreshold: number | null
}

let cartRows: CartLineRow[] = []
let cartSeq = 0

/** 테스트마다 장바구니 상태를 세운다. 인자 없이 부르면 빈 장바구니. */
export function seedCart(rows: CartLineRow[] = []): void {
  cartRows = rows.map(row => ({ ...row }))
  cartSeq = rows.reduce((max, row) => Math.max(max, row.cartItemId), 0)
}

/** 핸들러가 쌓아둔 현재 상태. 테스트가 담기/삭제 결과를 단언할 때 읽는다. */
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

function cartResponseBody() {
  const order: number[] = []
  const bySeller = new Map<number, CartLineRow[]>()
  for (const row of cartRows) {
    if (!bySeller.has(row.sellerId)) {
      bySeller.set(row.sellerId, [])
      order.push(row.sellerId)
    }
    bySeller.get(row.sellerId)!.push(row)
  }
  return {
    data: {
      sellerGroups: order.map(sellerId => {
        const rows = bySeller.get(sellerId)!
        const first = rows[0]!
        return {
          sellerId,
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
    const body = (await request.json()) as { optionCombinationId: number; quantity: number }
    const combo = REAL_PRODUCT_OPTIONS.optionCombinations.find(
      c => c.optionCombinationId === body.optionCombinationId,
    )
    if (!combo) {
      return HttpResponse.json({ errorCode: 50207, message: '상품을 찾을 수 없습니다.' }, { status: 404 })
    }
    const existing = cartRows.find(r => r.optionCombinationId === body.optionCombinationId)
    const nextQuantity = (existing?.quantity ?? 0) + body.quantity
    if (combo.remainingStock != null && nextQuantity > combo.remainingStock) {
      return HttpResponse.json({ errorCode: 50201, message: '재고가 부족합니다.' }, { status: 409 })
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
        remainingStock: combo.remainingStock ?? 99,
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
  http.patch(`${CART_ITEMS_URL}/:cartItemId`, async ({ params, request }) => {
    const id = Number(params['cartItemId'])
    const body = (await request.json()) as { quantity?: number | null }
    const row = cartRows.find(r => r.cartItemId === id)
    if (!row) {
      return HttpResponse.json(
        { errorCode: 50205, message: '장바구니 항목을 찾을 수 없습니다.' },
        { status: 404 },
      )
    }
    const quantity = body.quantity ?? row.quantity
    // BE CartService 계약: 수량을 늘릴 때만 재고를 검증하고, 깎거나 유지하면 재고를 안 본다.
    if (quantity > row.quantity && quantity > row.remainingStock) {
      return HttpResponse.json({ errorCode: 50201, message: '재고가 부족합니다.' }, { status: 409 })
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
  }),
  http.delete(CART_ITEMS_URL, async ({ request }) => {
    const body = (await request.json()) as { cartItemIds: number[] }
    const idSet = new Set(body.cartItemIds)
    const before = cartRows.length
    // 서버 규칙: 내 장바구니에 없는 id는 무시(멱등 삭제).
    cartRows = cartRows.filter(r => !idSet.has(r.cartItemId))
    return HttpResponse.json({
      data: {
        deletedCount: before - cartRows.length,
      },
    })
  }),
  // 배지 전용 경량 집계. 수량 합계가 아니라 라인 수(품목 종류 수)를 준다.
  // 서버는 목록과 같은 제외 규칙(카탈로그 행 없음, 검수 미승인)을 걸지만 픽스처가 그 상태를
  // 모델링하지 않으므로 여기선 행 수를 그대로 센다 — 제외 분기를 재현할 일이 생기면 그때 넣는다.
  http.get(CART_ITEM_COUNT_URL, () =>
    HttpResponse.json({ data: { cartItemCount: cartRows.length } }),
  ),
]

export const handlers = [
  ...deliveryAddressHandlers,
  ...petHandlers,
  ...accountHandlers,
  ...onboardingHandlers,
  ...likedProductHandlers,
  ...cartHandlers,
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
  // 적립금 잔액 — seedPointBalance로 세운 값을 봉투에 담아 내려준다(미시드면 0).
  http.get(POINTS_URL, () => HttpResponse.json({ data: { balance: pointBalance } })),
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
        products: page,
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
]

export const server = setupServer(...handlers)
