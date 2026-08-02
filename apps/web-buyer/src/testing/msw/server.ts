import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { axiosInstance } from '@aechak/api'

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
      discountRate: discountPrice != null ? Math.round((1 - discountPrice / regularPrice) * 100) : null,
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
    { optionCombinationId: 1, name: '기본형', additionalPrice: 0, optionValueIds: [1], remainingStock: 10, soldOut: false },
    { optionCombinationId: 2, name: '프리미엄형', additionalPrice: 5000, optionValueIds: [2], remainingStock: 5, soldOut: false },
    { optionCombinationId: 3, name: '한정형', additionalPrice: 0, optionValueIds: [3], remainingStock: 0, soldOut: true },
  ],
}
export const PETS_URL = `${base}/users/me/pets`
export const PRESIGNED_URL = `${base}/files/presigned-url`

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
      { data: { addressId: row.addressId, isDefault: row.isDefault, totalCount: deliveryAddressRows.length } },
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
    deliveryAddressRows = deliveryAddressRows.map(row => ({ ...row, isDefault: row.addressId === id }))
    return HttpResponse.json({ data: { addressId: id, isDefault: true } })
  }),
  http.delete(`${DELIVERY_ADDRESSES_URL}/:addressId`, ({ params }) => {
    const id = Number(params['addressId'])
    const wasDefault = deliveryAddressRows.find(row => row.addressId === id)?.isDefault ?? false
    deliveryAddressRows = deliveryAddressRows.filter(row => row.addressId !== id)
    // 서버는 기본을 지웠을 때만 남은 것 중 하나를 승격하고 그 id를 돌려준다.
    const promoted = wasDefault ? (deliveryAddressRows[0]?.addressId ?? null) : null
    if (promoted != null) {
      deliveryAddressRows = deliveryAddressRows.map(row => ({ ...row, isDefault: row.addressId === promoted }))
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
    const key = `tmp/1/pets/profile/fixture.${body.contentType.split('/')[1]}`
    return HttpResponse.json({ data: { url: `https://fake-s3.local/${key}`, key } })
  }),
  // presigned PUT은 S3 직행이라 baseURL 밖이다. 절대 URL로 따로 가로챈다.
  http.put('https://fake-s3.local/*', () => new HttpResponse(null, { status: 200 })),
]

export const handlers = [
  ...deliveryAddressHandlers,
  ...petHandlers,
  http.get(BREEDS_URL, ({ request }) => {
    const species = new URL(request.url).searchParams.get('species')
    if (species !== 'DOG' && species !== 'CAT') {
      // 서버 계약: 잘못된 species는 400 + CommonErrorCode.INVALID_REQUEST(90002)
      return HttpResponse.json({ errorCode: 90002, message: 'invalid species' }, { status: 400 })
    }
    return HttpResponse.json({ data: BREED_FIXTURES[species] })
  }),
  // 401 시나리오에서 axios 인터셉터의 refresh 재시도가 성공으로 새면 에러 테스트가 조용히
  // 통과해버린다. 기본 핸들러는 반드시 401 고정.
  http.post(WEB_REFRESH_URL, () =>
    HttpResponse.json({ errorCode: 20005, message: '인증이 필요합니다.' }, { status: 401 }),
  ),
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
      list = PRODUCT_FIXTURES.filter(f => f.categoryId === id || CATEGORY_PARENT[f.categoryId] === id)
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
      data: { products: page, totalCount: products.length, nextCursor: hasNext ? String(nextIndex) : null, hasNext },
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
