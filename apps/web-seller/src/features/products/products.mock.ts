import {
  buildCombinations,
  discountRate,
  findCategoryPath,
  KEYWORD_MAX,
  DEFAULT_PAGE_SIZE,
  MAX_ADDITIONAL_IMAGES,
  MAX_DETAIL_IMAGES,
  PRODUCT_IMAGE_TYPES,
  STOCK_DELTA_LIMIT,
  STOCK_MAX,
  type CategoryNode,
  type IssuePresignedUrlRequest,
  type OptionCombinationChangeRequest,
  type OptionCombinationChangeResponse,
  type OptionGroupRequest,
  type ProductRegisterRequest,
  type ProductRegisterResponse,
  type ProductUpdateRequest,
  type ProductUpdateResponse,
  type SaleStatusChangeRequest,
  type SaleStatusChangeResponse,
  type SellerOptionCombination,
  type SellerProductListResponse,
  type SellerProductOptionsResponse,
  type SellerProductSearchParams,
  type SellerProductSummary,
  type WireInspectionStatus,
  type WireSaleStatus,
} from './products.contract'

// 셀러 상품 API(origin/develop SellerProductController)를 메모리에서 흉내 낸다(localStorage 없음, 새로고침 시
// 시드로 돌아감). 각 함수는 실 fetcher와 같은 `{ data }`(ApiResponse)를 돌려주고, 실패는 AxiosError와 같은
// 모양(`response.status`, `response.data = { errorCode, message }`)으로 reject한다. 검증 순서/에러 코드/
// 자동 품절 규칙은 BE 코드를 따른다. 이 파일은 테스트 전용이다 — 화면 훅은 전부 실 fetcher로 나간다.

// 테스트에선 업로드 → 등록 → 목록 refetch처럼 여러 호출이 이어져 RTL findBy 1초를 넘기지 않게 0.
const DELAY_MS = import.meta.env.MODE === 'test' ? 0 : 300
// 옵션 변경 뒤 비동기 자동 품절이 늦게 반영되는 BE 동작을 흉내 낸다. 응답 직후 refetch(DELAY_MS)보다 늦다.
const SALE_STATUS_SYNC_DELAY_MS = DELAY_MS * 2

type ApiResponse<T> = { data: T }

function respond<T>(run: () => T): Promise<ApiResponse<T>> {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      try {
        resolve({ data: run() })
      } catch (error) {
        reject(error)
      }
    }, DELAY_MS)
  })
}

function httpError(status: number, errorCode: number, message: string) {
  return Object.assign(new Error(message), { response: { status, data: { errorCode, message } } })
}

// GlobalExceptionHandler: @Valid 실패, 본문 파싱 실패, 파라미터 타입 오류는 전부 400/90001.
const invalid = (message: string) => httpError(400, 90001, message)
const notFound = () => httpError(404, 40000, '상품을 찾을 수 없습니다.')
const optionError = (message: string) => httpError(400, 40005, message)

const isInt = (value: unknown): value is number => Number.isInteger(value)
// Kotlin Long/Int 필드에 범위 밖 정수가 오면 Jackson이 역직렬화에서 거절한다(400/90001).
const isLong = (value: unknown): value is number => isInt(value) && Math.abs(value) < 2 ** 63
const isInt32 = (value: unknown): value is number => isInt(value) && value >= -(2 ** 31) && value <= STOCK_MAX

// ─── 시간 (BE LocalDateTime = 오프셋 없는 KST) ──────────────────────────────

const LOCAL_DATE_TIME = /^(\d{4}-\d{2}-\d{2})T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/
const KST_OFFSET_MS = 9 * 60 * 60 * 1000

const nowLocal = () => new Date(Date.now() + KST_OFFSET_MS).toISOString().slice(0, 23)
const kstMillis = (localDateTime: string) => Date.parse(`${localDateTime}+09:00`)

// 오프셋(+09:00)은 Jackson LocalDateTime 역직렬화가 거절한다. Z는 BE가 UTC 벽시계로 관대하게 받아
// 9시간이 밀리므로 목업은 같이 거절해 FE 실수를 드러낸다.
function checkLocalDateTime(value: string | null | undefined) {
  if (value == null) return
  const date = LOCAL_DATE_TIME.exec(value)?.[1]
  if (!date || !isRealDate(date)) throw invalid('요청 본문을 읽을 수 없습니다.')
}

/** java.time ISO 파서는 STRICT라 2026-02-30을 거절한다. Date.parse는 3월 2일로 넘기므로 되돌려 비교한다. */
function isRealDate(yyyyMmDd: string): boolean {
  const [y, m, d] = yyyyMmDd.split('-').map(Number)
  return new Date(Date.UTC(y!, m! - 1, d)).toISOString().slice(0, 10) === yyyyMmDd
}

// ─── 카테고리 (GET /categories — api 호스트) ─────────────────────────────────

const LARGE_CATEGORIES = ['강아지', '고양이', '공통', '브랜드관']
// CRQ-PRD-07 중분류. 카피 규칙상 가운뎃점은 /로 바꾼다.
const MIDDLE_CATEGORIES = [
  '사료/간식',
  '장난감',
  '의류/악세서리',
  '위생/미용',
  '침구/하우스',
  '이동장/유모차',
  '건강/영양제',
  '산책용품',
  '식기/급수기',
  '훈련/행동용품',
  '기타',
]
// 소분류는 어드민 마스터 데이터라 목업에선 일부만 둔다. 없는 중분류는 '기타' 하나.
const LEAVES: Record<string, string[]> = {
  '고양이 > 식기/급수기': ['자동 급식기', '급수기', '식기'],
  '고양이 > 위생/미용': ['모래', '화장실', '미용 도구'],
  '고양이 > 사료/간식': ['건식 사료', '습식 사료', '동결건조 간식'],
  '고양이 > 침구/하우스': ['캣타워/캣휠', '방석', '하우스'],
  '공통 > 건강/영양제': ['관절 영양제', '유산균', '눈/귀 관리'],
  '강아지 > 산책용품': ['하네스', '리드줄', '배변봉투'],
  '강아지 > 사료/간식': ['건식 사료', '져키/트릿', '동결건조 간식'],
}

const node = (categoryId: number, name: string, sortOrder: number, children: CategoryNode[]): CategoryNode => ({
  categoryId,
  name,
  iconUrl: null,
  sortOrder,
  children,
})

// id 규칙: 대분류 n, 중분류 n*100+i, 소분류 중분류*100+j. 깊이 3(소분류)만 상품에 붙일 수 있다.
// MSW 핸들러(src/testing/msw/server.ts)가 GET /categories 응답으로 이 트리를 그대로 쓴다 — 목업
// 임시저장 시드가 들고 있는 categoryId를 실 API 경로로 프리필할 때 양쪽 id가 같아야 한다.
export const MOCK_CATEGORY_TREE: CategoryNode[] = LARGE_CATEGORIES.map((large, li) => {
  const largeId = li + 1
  return node(
    largeId,
    large,
    li,
    MIDDLE_CATEGORIES.map((middle, mi) => {
      const middleId = largeId * 100 + mi + 1
      const leaves = LEAVES[`${large} > ${middle}`] ?? ['기타']
      return node(middleId, middle, mi, leaves.map((leaf, j) => node(middleId * 100 + j + 1, leaf, j, [])))
    }),
  )
})

/** 라벨 경로로 소분류 id를 찾는다 — 시드와 테스트가 같은 트리를 보게 하는 창구다. */
export function leafIdOf(label: string): number {
  const [large, middle, leaf] = label.split(' > ')
  const found = MOCK_CATEGORY_TREE.find(n => n.name === large)
    ?.children.find(n => n.name === middle)
    ?.children.find(n => n.name === leaf)
  if (!found) throw new Error(`unknown seed category: ${label}`)
  return found.categoryId
}

// ─── 업로드 (POST /files/presigned-url — api 호스트 → S3 PUT) ──────────────────

// 목업 세션의 셀러 userId. 발급 키 `tmp/{userId}/products/...`의 소유 검사(100002)에 쓴다.
const MOCK_USER_ID = 1
const TMP_PREFIX = `tmp/${MOCK_USER_ID}/`
const EXTENSION: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }

/**
 * 메모리 S3 — 올라와 있는 키 집합이다. 승격 검증(100001/100002/100003)이 "이 키가 업로드됐는지"만
 * 보므로 본문은 담지 않는다. 화면 미리보기는 업로드 전 objectURL로 만들고, 저장된 이미지의 공개
 * URL은 products.queries의 productImageUrl이 `${VITE_MEDIA_BASE_URL}/${key}`로 조립한다.
 */
const objects = new Set<string>()
let idSeq = 0
// 외부 노출 id와 저장 키는 26자 ULID다. 목업은 순번으로 같은 길이만 맞춘다.
const newUlid = () => `01JMOCK${String(++idSeq).padStart(19, '0')}`

/**
 * presigned 발급(purpose=PRODUCT) + PUT을 한 번에 흉내 내고 tmp 키를 돌려준다.
 * 실연동은 store-settings.upload처럼 `issuePresignedUrl` → `fetch(url, { method: 'PUT' })`.
 */
export function mockUploadProductImage(file: File): Promise<string> {
  const request: IssuePresignedUrlRequest = { purpose: 'PRODUCT', contentType: file.type }
  return respond(() => {
    if (!PRODUCT_IMAGE_TYPES.includes(request.contentType)) {
      throw httpError(400, 100000, '지원하지 않는 파일 형식입니다.')
    }
    const key = `${TMP_PREFIX}products/${newUlid()}.${EXTENSION[request.contentType]}`
    objects.add(key)
    return key
  }).then(response => response.data)
}

// FileService.verify + FileStorageAdapter.promote: 남의 키 403/100002, 다른 용도 400/100003, 업로드 안 됨 404/100001.
function checkImageKeys(keys: string[], kept: Set<string>) {
  for (const key of keys) {
    if (kept.has(key)) continue
    if (!key.startsWith(TMP_PREFIX)) throw httpError(403, 100002, '접근할 수 없는 파일입니다.')
    if (!key.startsWith(`${TMP_PREFIX}products/`)) throw httpError(400, 100003, '용도가 맞지 않는 파일입니다.')
    if (!objects.has(key)) throw httpError(404, 100001, '파일을 찾을 수 없습니다.')
  }
}

/**
 * FileStorageAdapter.promote: tmp 키를 `products/{같은 파일명}`으로 복사한다(같은 tmp 키 → 같은 저장 키,
 * tmp 원본은 남긴다). 이미 붙어 있던 키는 그대로.
 */
function promote(keys: string[], kept: Set<string>): string[] {
  return keys.map(key => {
    if (kept.has(key)) return key
    const storedKey = `products/${key.split('/').pop()}`
    objects.add(storedKey)
    return storedKey
  })
}

// ─── 상품 저장소 ──────────────────────────────────────────────────────────────

interface MockCombination extends SellerOptionCombination {
  /** 같은 값 집합 판별용(순서 무관). */
  signature: string
}

/**
 * 목업 BE가 들고 있는 상품 저장 모양 — 실 단건 조회 응답 타입(생성물 `SellerProductDetailData`)과
 * 섞지 않는다. 등록이 썸네일 키를 필수(@NotBlank)로 받으므로 이 저장소에는 null 썸네일이 없고,
 * 할인·설명 필드의 nullability도 요청 DTO 쪽(optional nullable)을 따른다.
 */
type MockProductFields = ProductUpdateRequest & { productId: string }

interface MockProduct extends MockProductFields {
  /** 내부 PK. 목록 기본 정렬(latest)이 id desc다. */
  seq: number
  saleStatus: WireSaleStatus
  inspectionStatus: WireInspectionStatus
  createdAt: string
  optionGroups: OptionGroupRequest[]
  combinations: MockCombination[]
}

const products: MockProduct[] = []
let productSeq = 0
let combinationSeq = 0

interface ProductSeed {
  name: string
  category: string
  regularPrice: number
  discount?: { price: number; startAt: string }
  groups?: OptionGroupRequest[]
  /** 곱집합 순서대로(옵션 없으면 1개). */
  stock: number[]
  additionalPrice?: number[]
  inactive?: number[]
  saleStatus: WireSaleStatus
  createdAt: string
}

// 오래된 것부터(= 내부 PK 오름차순). BE는 검수를 쓰지 않아 모두 APPROVED로 만들어진다.
// ENDED는 enum에만 있고 origin/develop에 도달 경로가 없다(SaleStatus.isSellerAssignable). 화면이 이 값을
// 받았을 때의 표시를 확인하려고 남긴 시드다.
const SEEDS: ProductSeed[] = [
  {
    name: '[단종] 캣휠 라지',
    category: '고양이 > 침구/하우스 > 캣타워/캣휠',
    regularPrice: 240000,
    stock: [0],
    saleStatus: 'ENDED',
    createdAt: '2026-01-20T10:00:00',
  },
  {
    name: '산책 하네스 세트',
    category: '강아지 > 산책용품 > 하네스',
    regularPrice: 25000,
    groups: [
      { name: '색상', values: ['레드', '블루'] },
      { name: '사이즈', values: ['S', 'M'] },
    ],
    stock: [5, 0, 3, 2],
    saleStatus: 'SUSPENDED',
    createdAt: '2026-05-20T10:00:00',
  },
  {
    name: '실내 자동 화장실 디럭스',
    category: '고양이 > 위생/미용 > 화장실',
    regularPrice: 189000,
    // 시작 전 할인은 목록 discountPrice/discountRate가 null이다.
    discount: { price: 169000, startAt: '2026-12-01T00:00:00' },
    stock: [3],
    saleStatus: 'ON_SALE',
    createdAt: '2026-06-05T10:00:00',
  },
  {
    name: '관절 영양제 코코넛맛 90정',
    category: '공통 > 건강/영양제 > 관절 영양제',
    regularPrice: 32000,
    stock: [7],
    saleStatus: 'ON_SALE',
    createdAt: '2026-06-08T10:00:00',
  },
  {
    name: '대용량 모래 8.5L 벤토나이트',
    category: '고양이 > 위생/미용 > 모래',
    regularPrice: 18900,
    stock: [0],
    saleStatus: 'OUT_OF_STOCK',
    createdAt: '2026-06-09T10:00:00',
  },
  {
    name: '고양이 자동 급식기 스마트 5L',
    category: '고양이 > 식기/급수기 > 자동 급식기',
    regularPrice: 64000,
    groups: [{ name: '색상', values: ['화이트', '블랙'] }],
    stock: [80, 48],
    saleStatus: 'ON_SALE',
    createdAt: '2026-06-10T10:00:00',
  },
  {
    name: '유기농 동결건조 간식 닭가슴살',
    category: '고양이 > 사료/간식 > 동결건조 간식',
    regularPrice: 15000,
    discount: { price: 12500, startAt: '2026-06-01T00:00:00' },
    groups: [{ name: '용량', values: ['30g', '100g'] }],
    // 판매를 끈 조합의 재고는 목록 totalStock에서 빠진다.
    stock: [54, 12],
    additionalPrice: [0, 18000],
    inactive: [1],
    saleStatus: 'ON_SALE',
    createdAt: '2026-06-12T10:00:00',
  },
]

const signatureOf = (values: string[]) => [...values].sort().join('\u001F')

function toCombinations(requested: ProductRegisterRequest['optionCombinations']) {
  return requested.map<MockCombination>(c => ({
    optionCombinationId: ++combinationSeq,
    // ProductService: 요청 순서대로 ` / `로 잇고, 빈 이름은 `기본`.
    name: c.optionValues.join(' / ') || '기본',
    additionalPrice: c.additionalPrice,
    stockQuantity: c.stockQuantity,
    isActive: true,
    signature: signatureOf(c.optionValues),
  }))
}

function seedProduct(seed: ProductSeed): MockProduct {
  const groups = seed.groups ?? []
  const valueSets = groups.length > 0 ? buildCombinations(groups, []).map(row => row.optionValues) : [[]]
  const thumbnailImageKey = `products/${newUlid()}.png`
  objects.add(thumbnailImageKey)
  const combinations = toCombinations(
    valueSets.map((optionValues, i) => ({
      optionValues,
      additionalPrice: seed.additionalPrice?.[i] ?? 0,
      stockQuantity: seed.stock[i] ?? 0,
    })),
  )
  seed.inactive?.forEach(i => (combinations[i]!.isActive = false))
  return {
    seq: ++productSeq,
    productId: newUlid(),
    categoryId: leafIdOf(seed.category),
    productName: seed.name,
    description: null,
    regularPrice: seed.regularPrice,
    discountPrice: seed.discount?.price ?? null,
    discountStartAt: seed.discount?.startAt ?? null,
    discountEndAt: null,
    thumbnailImageKey,
    additionalImageKeys: [],
    detailImageKeys: [],
    saleStatus: seed.saleStatus,
    inspectionStatus: 'APPROVED',
    createdAt: seed.createdAt,
    optionGroups: groups,
    combinations,
  }
}

/** 시드 상태로 되돌린다. 모든 테스트가 beforeEach에서 부른다. */
export function resetProductsMock(): void {
  objects.clear()
  idSeq = 0
  productSeq = 0
  combinationSeq = 0
  products.splice(0, products.length, ...SEEDS.map(seedProduct))
}

function findProduct(productId: string): MockProduct {
  const product = products.find(p => p.productId === productId)
  if (!product) throw notFound()
  return product
}

// "판매 가능한 재고" = isActive && stockQuantity > 0 (OptionRepositoryAdapter).
const hasActiveStock = (p: MockProduct) => p.combinations.some(c => c.isActive && c.stockQuantity > 0)

/** Product.syncSaleStatusWithStock — SUSPENDED/ENDED는 그대로. */
function syncSaleStatusWithStock(p: MockProduct) {
  const stocked = hasActiveStock(p)
  if (p.saleStatus === 'ON_SALE' && !stocked) p.saleStatus = 'OUT_OF_STOCK'
  else if (p.saleStatus === 'OUT_OF_STOCK' && stocked) p.saleStatus = 'ON_SALE'
}

/** ProductPricing.discountedPriceAt — 기간 밖이면 null. 종료일이 없으면 계속 할인. */
function activeDiscountPrice(p: MockProduct, now: number): number | null {
  if (p.discountPrice == null) return null
  if (p.discountStartAt && kstMillis(p.discountStartAt) > now) return null
  if (p.discountEndAt && kstMillis(p.discountEndAt) < now) return null
  return p.discountPrice
}

// ─── 등록/수정 검증 ───────────────────────────────────────────────────────────

const isBlank = (value: string) => value.trim() === ''

// 생성 타입에서 두 이미지 목록은 nullable이다(스펙 `nullable: true` — BE도 null을 빈 목록으로 본다).
// 검증·개수 제한·승격이 `?? []`를 저마다 흩뿌리지 않도록 여기서 한 번만 좁힌다.
const additionalKeys = (body: ProductUpdateRequest) => body.additionalImageKeys ?? []
const detailKeys = (body: ProductUpdateRequest) => body.detailImageKeys ?? []

/** @Valid(Bean Validation) + 본문 파싱 단계 — 전부 400/90001. */
function checkUpdateBody(body: ProductUpdateRequest, rejectDuplicateKeys: boolean) {
  if (isBlank(body.productName) || body.productName.length > 255) throw invalid('productName')
  if (isBlank(body.thumbnailImageKey) || body.thumbnailImageKey.length > 1024) throw invalid('thumbnailImageKey')
  if (![body.categoryId, body.regularPrice].every(isLong)) throw invalid('요청 본문을 읽을 수 없습니다.')
  if (body.discountPrice != null && !isLong(body.discountPrice)) throw invalid('요청 본문을 읽을 수 없습니다.')
  checkLocalDateTime(body.discountStartAt)
  checkLocalDateTime(body.discountEndAt)
  for (const keys of [additionalKeys(body), detailKeys(body)]) {
    if (keys.some(key => isBlank(key) || key.length > 1024)) throw invalid('imageKeys')
    // 등록은 중복을 거절하지 않는다. 수정만 한 목록 안 중복을 거절한다(두 목록 사이 중복은 허용).
    if (rejectDuplicateKeys && new Set(keys).size !== keys.length) throw invalid('imageKeys')
  }
}

function checkRegisterBody(body: ProductRegisterRequest) {
  checkUpdateBody(body, false)
  if (!Array.isArray(body.optionCombinations)) throw invalid('요청 본문을 읽을 수 없습니다.')
  for (const group of body.optionGroups ?? []) {
    if (isBlank(group.name) || group.name.length > 100) throw invalid('optionGroups.name')
    if (group.values.length === 0 || group.values.some(v => isBlank(v) || v.length > 100)) {
      throw invalid('optionGroups.values')
    }
  }
  for (const c of body.optionCombinations) {
    if (!isLong(c.additionalPrice) || !isInt32(c.stockQuantity)) {
      throw invalid('요청 본문을 읽을 수 없습니다.')
    }
  }
}

/** ProductOptions.of — 전부 400/40005. 전체 곱집합은 요구하지 않는다. */
function checkOptions(groups: OptionGroupRequest[], combinations: ProductRegisterRequest['optionCombinations']) {
  if (combinations.length === 0) throw optionError('옵션 조합이 비어 있습니다.')
  if (new Set(groups.map(g => g.name)).size !== groups.length) throw optionError('옵션 그룹명이 중복됩니다.')
  const allValues = groups.flatMap(g => g.values)
  if (new Set(allValues).size !== allValues.length) throw optionError('옵션값이 중복됩니다.')
  const groupOf = new Map(groups.flatMap((g, i) => g.values.map(v => [v, i] as const)))
  for (const c of combinations) {
    if (c.optionValues.some(v => !groupOf.has(v))) throw optionError('존재하지 않는 옵션값입니다.')
    if (new Set(c.optionValues.map(v => groupOf.get(v))).size !== groups.length) {
      throw optionError('조합이 모든 옵션 그룹을 포함하지 않습니다.')
    }
  }
  if (new Set(combinations.map(c => signatureOf(c.optionValues))).size !== combinations.length) {
    throw optionError('옵션 조합이 중복됩니다.')
  }
}

function checkCategory(categoryId: number) {
  const path = findCategoryPath(MOCK_CATEGORY_TREE, categoryId)
  if (!path) throw httpError(404, 40101, '카테고리를 찾을 수 없습니다.')
  if (path.length !== 3) throw httpError(400, 40100, '소분류 카테고리만 선택할 수 있습니다.')
}

// Product.REGULAR_PRICE_MIN/MAX — FE는 범위를 미리 보지 않고 40001 응답 문구로 안내한다.
const MIN_REGULAR_PRICE = 100
const MAX_REGULAR_PRICE = 100_000_000

/** Product.validatePricing — 날짜가 과거/미래인지는 보지 않는다. */
function checkPrice({ regularPrice, discountPrice, discountStartAt, discountEndAt }: ProductUpdateRequest) {
  const priceError = () => httpError(400, 40001, '상품 가격이 올바르지 않습니다.')
  const periodError = () => httpError(400, 40002, '할인 기간이 올바르지 않습니다.')
  if (regularPrice < MIN_REGULAR_PRICE || regularPrice > MAX_REGULAR_PRICE) throw priceError()
  if (discountPrice != null && (discountPrice < 0 || discountPrice > regularPrice)) throw priceError()
  if (discountPrice != null && !discountStartAt) throw periodError()
  if (discountPrice == null && (discountStartAt || discountEndAt)) throw periodError()
  if (discountStartAt && discountEndAt && kstMillis(discountStartAt) > kstMillis(discountEndAt)) throw periodError()
}

function checkImageCounts(body: ProductUpdateRequest) {
  if (additionalKeys(body).length > MAX_ADDITIONAL_IMAGES || detailKeys(body).length > MAX_DETAIL_IMAGES) {
    throw httpError(400, 40003, '이미지 개수가 올바르지 않습니다.')
  }
}

const allImageKeys = (body: ProductUpdateRequest) => [
  body.thumbnailImageKey,
  ...additionalKeys(body),
  ...detailKeys(body),
]

// ─── 상품 API (/sellers/me/products — 셀러 호스트) ─────────────────────────────

const SALE_STATUSES: WireSaleStatus[] = ['ON_SALE', 'OUT_OF_STOCK', 'SUSPENDED', 'ENDED']
const INSPECTION_STATUSES: WireInspectionStatus[] = ['DRAFT', 'PENDING', 'APPROVED', 'REJECTED']
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

function checkListParams(params: SellerProductSearchParams) {
  const { keyword, saleStatus = [], inspectionStatus = [], createdFrom, createdTo, stock, sort, page = 0 } = params
  const size = params.size ?? DEFAULT_PAGE_SIZE
  if (keyword && keyword.length > KEYWORD_MAX) throw invalid('keyword는 최대 100자입니다.')
  if (saleStatus.some(s => !SALE_STATUSES.includes(s))) throw invalid('saleStatus: 지원하지 않는 값입니다.')
  if (inspectionStatus.some(s => !INSPECTION_STATUSES.includes(s))) {
    throw invalid('inspectionStatus: 지원하지 않는 값입니다.')
  }
  for (const date of [createdFrom, createdTo]) {
    if (date !== undefined && (!ISO_DATE.test(date) || !isRealDate(date))) {
      throw invalid('날짜 형식이 올바르지 않습니다. (YYYY-MM-DD)')
    }
  }
  if (createdFrom && createdTo && createdFrom > createdTo) throw invalid('등록일 시작일은 종료일보다 늦을 수 없습니다.')
  if (stock !== undefined && stock !== 'in_stock' && stock !== 'sold_out') throw invalid('stock')
  if (sort !== undefined && !['latest', 'price_asc', 'price_desc'].includes(sort)) throw invalid('sort')
  if (!isInt(page) || page < 0) throw invalid('page는 0 이상이어야 합니다.')
  if (!isInt(size) || size < 1 || size > 100) throw invalid('size는 1~100 사이여야 합니다.')
}

function toSummary(p: MockProduct, now: number): SellerProductSummary {
  const discounted = activeDiscountPrice(p, now)
  const path = findCategoryPath(MOCK_CATEGORY_TREE, p.categoryId)!
  return {
    productId: p.productId,
    name: p.productName,
    thumbnailImageKey: p.thumbnailImageKey,
    categoryName: path[path.length - 1]!.name,
    regularPrice: p.regularPrice,
    discountPrice: discounted,
    discountRate: discounted == null ? null : discountRate(p.regularPrice, discounted),
    saleStatus: p.saleStatus,
    inspectionStatus: p.inspectionStatus,
    totalStock: p.combinations.reduce((sum, c) => sum + (c.isActive ? c.stockQuantity : 0), 0),
    createdAt: p.createdAt,
  }
}

/** GET /sellers/me/products — 내 상품 전체 상태, 필터/정렬/오프셋 페이지. */
export function mockFetchProducts(
  params: SellerProductSearchParams = {},
): Promise<ApiResponse<SellerProductListResponse>> {
  return respond(() => {
    checkListParams(params)
    const { saleStatus = [], inspectionStatus = [], category, createdFrom, createdTo, stock } = params
    const sort = params.sort ?? 'latest'
    const page = params.page ?? 0
    const size = params.size ?? DEFAULT_PAGE_SIZE
    const keyword = params.keyword?.trim().toLowerCase()
    if (category !== undefined && !findCategoryPath(MOCK_CATEGORY_TREE, category)) {
      throw httpError(404, 40101, '카테고리를 찾을 수 없습니다.')
    }
    const now = Date.now()
    const effectivePrice = (p: MockProduct) => activeDiscountPrice(p, now) ?? p.regularPrice

    const matched = products
      .filter(p => {
        if (keyword && !p.productName.toLowerCase().includes(keyword)) return false
        if (saleStatus.length > 0 && !saleStatus.includes(p.saleStatus)) return false
        if (inspectionStatus.length > 0 && !inspectionStatus.includes(p.inspectionStatus)) return false
        // 하위 트리 포함: 상품의 소분류 경로 어딘가에 그 id가 있으면 된다.
        if (category !== undefined && !findCategoryPath(MOCK_CATEGORY_TREE, p.categoryId)!.some(n => n.categoryId === category)) {
          return false
        }
        const createdDate = p.createdAt.slice(0, 10)
        if (createdFrom && createdDate < createdFrom) return false
        if (createdTo && createdDate > createdTo) return false
        if (stock === 'in_stock' && !hasActiveStock(p)) return false
        if (stock === 'sold_out' && hasActiveStock(p)) return false
        return true
      })
      .sort((a, b) => {
        const byPrice = sort === 'price_asc' ? effectivePrice(a) - effectivePrice(b) : sort === 'price_desc' ? effectivePrice(b) - effectivePrice(a) : 0
        return byPrice || b.seq - a.seq
      })

    const totalCount = matched.length
    const totalPages = Math.ceil(totalCount / size)
    return {
      products: matched.slice(page * size, (page + 1) * size).map(p => toSummary(p, now)),
      totalCount,
      page,
      size,
      totalPages,
      hasNext: page + 1 < totalPages,
    }
  })
}

/** GET /sellers/me/products/{productId}/options — 판매 꺼진 조합 포함, id 오름차순. */
export function mockFetchProductOptions(productId: string): Promise<ApiResponse<SellerProductOptionsResponse>> {
  return respond(() => ({
    optionCombinations: findProduct(productId)
      .combinations.slice()
      .sort((a, b) => a.optionCombinationId - b.optionCombinationId)
      .map(c => ({
        optionCombinationId: c.optionCombinationId,
        name: c.name,
        additionalPrice: c.additionalPrice,
        stockQuantity: c.stockQuantity,
        isActive: c.isActive,
      })),
  }))
}

/** POST /sellers/me/products → 201. 검사 순서는 ProductFacade/ProductService를 따른다. */
export function mockRegisterProduct(body: ProductRegisterRequest): Promise<ApiResponse<ProductRegisterResponse>> {
  return respond(() => {
    checkRegisterBody(body)
    const groups = body.optionGroups ?? []
    checkOptions(groups, body.optionCombinations)
    const noKeptKeys = new Set<string>()
    checkImageKeys(allImageKeys(body), noKeptKeys)
    checkCategory(body.categoryId)
    checkPrice(body)
    checkImageCounts(body)
    // OptionCombination.create: 조합마다 추가금(40201) → 재고(40200) 순으로 본다.
    for (const c of body.optionCombinations) {
      if (c.additionalPrice < 0) throw httpError(400, 40201, '옵션 추가금은 음수일 수 없습니다.')
      if (c.stockQuantity < 0) throw httpError(400, 40200, '옵션 재고는 음수일 수 없습니다.')
    }

    const [thumbnailImageKey, ...rest] = promote(allImageKeys(body), noKeptKeys)
    const additionalCount = additionalKeys(body).length
    const product: MockProduct = {
      seq: ++productSeq,
      productId: newUlid(),
      categoryId: body.categoryId,
      productName: body.productName,
      description: body.description,
      regularPrice: body.regularPrice,
      discountPrice: body.discountPrice,
      discountStartAt: body.discountStartAt,
      discountEndAt: body.discountEndAt,
      thumbnailImageKey: thumbnailImageKey!,
      additionalImageKeys: rest.slice(0, additionalCount),
      detailImageKeys: rest.slice(additionalCount),
      // 등록은 재고를 보지 않는다 — 총재고 0이어도 ON_SALE(자동 품절은 상태 변경/재고 변경 때만).
      saleStatus: 'ON_SALE',
      inspectionStatus: 'APPROVED',
      createdAt: nowLocal(),
      optionGroups: groups.map(g => ({ name: g.name, values: [...g.values] })),
      combinations: toCombinations(body.optionCombinations),
    }
    products.push(product)
    return {
      productId: product.productId,
      saleStatus: product.saleStatus,
      inspectionStatus: product.inspectionStatus,
      versionNo: 1,
      createdAt: product.createdAt,
    }
  })
}

/** PUT /sellers/me/products/{productId} — 옵션/재고/판매 상태는 그대로, 이미지 목록은 통째 교체. */
export function mockUpdateProduct(
  productId: string,
  body: ProductUpdateRequest,
): Promise<ApiResponse<ProductUpdateResponse>> {
  return respond(() => {
    checkUpdateBody(body, true)
    const product = findProduct(productId)
    checkCategory(body.categoryId)
    checkPrice(body)
    checkImageCounts(body)
    // 지금 붙어 있는 저장 키만 승격을 건너뛴다. 예전에 뺀 키를 다시 보내면 tmp가 아니라 100002.
    const kept = new Set(allImageKeys(product))
    checkImageKeys(allImageKeys(body), kept)

    const [thumbnailImageKey, ...rest] = promote(allImageKeys(body), kept)
    const additionalCount = additionalKeys(body).length
    Object.assign(product, {
      categoryId: body.categoryId,
      productName: body.productName,
      description: body.description,
      regularPrice: body.regularPrice,
      discountPrice: body.discountPrice,
      discountStartAt: body.discountStartAt,
      discountEndAt: body.discountEndAt,
      thumbnailImageKey,
      additionalImageKeys: rest.slice(0, additionalCount),
      detailImageKeys: rest.slice(additionalCount),
    })
    return { productId, saleStatus: product.saleStatus, updatedAt: nowLocal() }
  })
}

/** PATCH /sellers/me/products/{productId}/status — ON_SALE/SUSPENDED만, 현재 상태는 안 본다. */
export function mockChangeSaleStatus(
  productId: string,
  { saleStatus }: SaleStatusChangeRequest,
): Promise<ApiResponse<SaleStatusChangeResponse>> {
  return respond(() => {
    if (saleStatus !== 'ON_SALE' && saleStatus !== 'SUSPENDED') {
      throw invalid('판매중과 판매중지만 지정할 수 있습니다.')
    }
    const product = findProduct(productId)
    product.saleStatus = saleStatus
    syncSaleStatusWithStock(product)
    return { productId, saleStatus: product.saleStatus, updatedAt: nowLocal() }
  })
}

/** PATCH /sellers/me/products/{productId}/options/{combinationId} — 재고 증감과 판매 여부. */
export function mockChangeOptionCombination(
  productId: string,
  combinationId: number,
  { stockDelta, isActive }: OptionCombinationChangeRequest,
): Promise<ApiResponse<OptionCombinationChangeResponse>> {
  return respond(() => {
    if (stockDelta == null && isActive == null) throw invalid('재고 증감과 판매 여부 중 하나는 보내야 합니다.')
    if (stockDelta != null && (!isInt(stockDelta) || stockDelta === 0 || Math.abs(stockDelta) > STOCK_DELTA_LIMIT)) {
      throw invalid('재고 증감은 0이 아닌 ±1000000 이내여야 합니다.')
    }
    const product = findProduct(productId)
    const combination = product.combinations.find(c => c.optionCombinationId === combinationId)
    if (!combination) throw notFound()

    const before = combination.stockQuantity
    if (stockDelta != null) combination.stockQuantity = Math.min(Math.max(before + stockDelta, 0), STOCK_MAX)
    if (isActive != null) combination.isActive = isActive
    // BE는 커밋 후 @Async 리스너가 자동 품절/복귀한다(OptionStockEventListener). 응답 직후 목록을 다시
    // 불러와도 아직 반영 전일 수 있게 목업도 응답 뒤로 미룬다.
    setTimeout(() => syncSaleStatusWithStock(product), SALE_STATUS_SYNC_DELAY_MS)
    return {
      combinationId,
      stockQuantity: combination.stockQuantity,
      appliedStockDelta: combination.stockQuantity - before,
      isActive: combination.isActive,
      updatedAt: nowLocal(),
    }
  })
}

// 상품 삭제는 보존하지 않고 지웠다 — BE에 DELETE가 없고 판매 중지가 노출 제어를 담당하므로 생길 계획이 없다.
// 임시저장 목업도 지웠다 — BE에 `/sellers/me/product-drafts`가 생겨 화면이 실서버로 나가고, 테스트는
// MSW 핸들러(testing/msw/server.ts의 SELLER_PRODUCT_DRAFTS_URL 구역)가 받는다.

/**
 * 목업 BE의 단건 조회 — 화면은 더 이상 쓰지 않는다(실 `GET /sellers/me/products/{productId}`로 교체).
 * 이 목업 BE의 PUT 왕복 테스트가 저장 결과를 읽는 창구라 남겨 둔다.
 */
export function mockFetchProductDetail(productId: string): Promise<ApiResponse<MockProductFields>> {
  return respond(() => {
    const p = findProduct(productId)
    return structuredClone({
      productId: p.productId,
      categoryId: p.categoryId,
      productName: p.productName,
      description: p.description,
      regularPrice: p.regularPrice,
      discountPrice: p.discountPrice,
      discountStartAt: p.discountStartAt,
      discountEndAt: p.discountEndAt,
      thumbnailImageKey: p.thumbnailImageKey,
      additionalImageKeys: p.additionalImageKeys,
      detailImageKeys: p.detailImageKeys,
    })
  })
}

resetProductsMock()
