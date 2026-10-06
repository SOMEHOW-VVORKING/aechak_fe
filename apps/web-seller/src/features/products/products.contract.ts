// 셀러 상품 BE(origin/develop `boot/seller/.../product/**`)의 요청/응답 DTO와 화면 사이의 순수 타입·매핑·규칙.
// 서버 enum(saleStatus 등)은 이 feature 밖으로 새지 않게 여기 가둔다(store-settings.contract 관례).
// 실연동 전이라 products.mock.ts가 같은 시그니처로 응답한다 — 실연동은 products.queries.ts의 호출만 바꾼다.
// 날짜는 BE LocalDateTime(오프셋 없는 KST 벽시계, 예: 2026-08-11T10:00:00)이다. `+09:00`/`Z`를 붙이면
// 역직렬화가 400/90001로 실패하거나(오프셋) 9시간 밀린다(Z).

export type WireSaleStatus = 'ON_SALE' | 'OUT_OF_STOCK' | 'SUSPENDED' | 'ENDED'
export type WireInspectionStatus = 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED'

// ─── POST /sellers/me/products (ProductRegisterRequest) ─────────────────────

export interface OptionGroupRequest {
  name: string
  values: string[]
}

export interface OptionCombinationRequest {
  optionValues: string[]
  additionalPrice: number
  stockQuantity: number
}

export interface ProductRegisterRequest {
  categoryId: number
  productName: string
  description: string | null
  regularPrice: number
  discountPrice: number | null
  discountStartAt: string | null
  discountEndAt: string | null
  thumbnailImageKey: string
  additionalImageKeys: string[]
  detailImageKeys: string[]
  /** 옵션 없는 상품은 null 또는 []. */
  optionGroups: OptionGroupRequest[] | null
  /** 필수. 옵션 없는 상품은 `[{ optionValues: [], additionalPrice: 0, stockQuantity }]` 한 행. */
  optionCombinations: OptionCombinationRequest[]
}

export interface ProductRegisterResponse {
  productId: string
  saleStatus: WireSaleStatus
  inspectionStatus: WireInspectionStatus
  versionNo: number
  createdAt: string
}

// ─── PUT /sellers/me/products/{productId} ────────────────────────────────────
// 옵션/재고/판매 상태는 바꾸지 않는다. 이미지 키 목록은 통째로 교체(빠진 키는 닫힘), 한 목록 안 중복은 90001.

export type ProductUpdateRequest = Omit<ProductRegisterRequest, 'optionGroups' | 'optionCombinations'>

export interface ProductUpdateResponse {
  productId: string
  saleStatus: WireSaleStatus
  updatedAt: string
}

// ─── PATCH /sellers/me/products/{productId}/status ──────────────────────────
// BE가 받는 값은 ON_SALE/SUSPENDED뿐이다(나머지는 400/90001). 현재 상태는 검사하지 않고, ON_SALE인데
// 판매 가능한 재고가 없으면 응답이 바로 OUT_OF_STOCK이다.

export interface SaleStatusChangeRequest {
  saleStatus: WireSaleStatus
}

export interface SaleStatusChangeResponse {
  productId: string
  saleStatus: WireSaleStatus
  updatedAt: string
}

// ─── PATCH /sellers/me/products/{productId}/options/{combinationId} ─────────
// 둘 중 하나는 필수. stockDelta는 0 금지, |delta| ≤ 1,000,000. 재고는 [0, Int.MAX]로 잘리고 실제 반영량이
// appliedStockDelta로 온다. 응답에 판매 상태는 없다 — 자동 품절/복귀는 BE가 커밋 후 비동기로 한다.

export const STOCK_DELTA_LIMIT = 1_000_000
/** BE 재고는 Kotlin Int(int unsigned 컬럼). 넘으면 Jackson 역직렬화가 400/90001로 거절한다. */
export const STOCK_MAX = 2_147_483_647

export interface OptionCombinationChangeRequest {
  stockDelta?: number
  isActive?: boolean
}

export interface OptionCombinationChangeResponse {
  combinationId: number
  stockQuantity: number
  appliedStockDelta: number
  isActive: boolean
  updatedAt: string
}

// ─── GET /sellers/me/products/{productId}/options ───────────────────────────

export interface SellerOptionCombination {
  optionCombinationId: number
  /** 옵션값을 요청 순서대로 ` / `로 이은 이름. 옵션 없는 상품은 `기본`. */
  name: string
  additionalPrice: number
  stockQuantity: number
  isActive: boolean
}

export interface SellerProductOptionsResponse {
  optionCombinations: SellerOptionCombination[]
}

// ─── GET /sellers/me/products (SellerProductSearchRequest) ──────────────────

export type SellerProductSort = 'latest' | 'price_asc' | 'price_desc'
export type SellerProductStockFilter = 'in_stock' | 'sold_out'

export interface SellerProductSearchParams {
  /** 상품명 부분 일치(대소문자 무시), 최대 100자. */
  keyword?: string
  /** 반복 파라미터(`?saleStatus=A&saleStatus=B`). */
  saleStatus?: WireSaleStatus[]
  inspectionStatus?: WireInspectionStatus[]
  /** 어느 깊이든 활성 카테고리 id. 하위 카테고리 상품까지 포함한다. */
  category?: number
  /** YYYY-MM-DD, 양 끝 포함. */
  createdFrom?: string
  createdTo?: string
  stock?: SellerProductStockFilter
  sort?: SellerProductSort
  page?: number
  /** 1~100, 기본 20. */
  size?: number
}

export const KEYWORD_MAX = 100
export const DEFAULT_PAGE_SIZE = 20

export interface SellerProductSummary {
  productId: string
  name: string
  /** 저장 키(`products/<ULID>.<ext>`)이지 URL이 아니다. */
  thumbnailImageKey: string | null
  /** 소분류 이름만. */
  categoryName: string
  regularPrice: number
  /** 지금 적용 중인 할인만. 시작 전/종료 후면 null. */
  discountPrice: number | null
  discountRate: number | null
  saleStatus: WireSaleStatus
  inspectionStatus: WireInspectionStatus
  /** 판매 켜진 조합의 재고 합. */
  totalStock: number
  createdAt: string
}

export interface SellerProductListResponse {
  products: SellerProductSummary[]
  totalCount: number
  page: number
  size: number
  totalPages: number
  hasNext: boolean
}

// ─── GET /categories (api 호스트 — 셀러 호스트에는 없다) ─────────────────────

export interface CategoryNode {
  categoryId: number
  name: string
  iconUrl: string | null
  sortOrder: number
  children: CategoryNode[]
}

// ─── POST /files/presigned-url (api 호스트) ──────────────────────────────────
// purpose=PRODUCT는 png/jpeg/webp만(그 외 400/100000). 받은 url에 같은 Content-Type으로 PUT(10분 유효)하고
// key(`tmp/{userId}/products/{ULID}.{ext}`)를 등록/수정 본문에 싣는다. 서버 크기 제한은 없다.
// 등록/수정은 tmp 키를 `products/{같은 파일명}`으로 복사한다(같은 tmp 키 → 같은 저장 키). tmp/는 S3 수명주기로
// 1일 뒤 지워지므로, 하루 지난 tmp 키를 보내면 404/100001이다. 임시저장(BE 없음)이 tmp 키를 들고 있는 것도
// 같은 제약을 받는다 — 임시저장 API를 정할 때 이미지 키 보존 방식을 함께 정한다.

export interface IssuePresignedUrlRequest {
  purpose: 'PRODUCT'
  contentType: string
}

export interface PresignedUrlResponse {
  url: string
  key: string
}

export const PRODUCT_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp']

// ─── BE 엔드포인트 없음(목업 전용) ─────────────────────────────────────────────
// 수정 폼 프리필용 단건 조회, 임시저장은 BE에 아직 없다. products.mock.ts의 같은 이름 구역과 짝이다.

/** 수정 폼 프리필. PUT 본문에 필요한 값만 담는다(이미지는 저장 키). */
export interface SellerProductDetail extends ProductUpdateRequest {
  productId: string
}

/** 임시저장은 미완성 조합도 담는다. 비운 칸만 빠진다. */
export type DraftOptionCombination = Pick<OptionCombinationRequest, 'optionValues'> &
  Partial<Omit<OptionCombinationRequest, 'optionValues'>>

export type ProductDraftRequest = Partial<Omit<ProductRegisterRequest, 'optionCombinations'>> & {
  optionCombinations?: DraftOptionCombination[]
}

export interface ProductDraftResponse {
  productId: string
  savedAt: string
}

export type ProductDraft = ProductDraftRequest & ProductDraftResponse

export interface ProductDraftSummary {
  productId: string
  productName: string | null
  savedAt: string
}

// ─── 화면 매핑 ────────────────────────────────────────────────────────────────

export const SALE_STATUS_LABEL: Record<WireSaleStatus, string> = {
  ON_SALE: '판매중',
  OUT_OF_STOCK: '품절',
  SUSPENDED: '판매 중지',
  ENDED: '판매종료',
}

export const INSPECTION_STATUS_LABEL: Record<WireInspectionStatus, string> = {
  DRAFT: '작성 중',
  PENDING: '검수 대기',
  APPROVED: '검수 통과',
  REJECTED: '반려',
}

export function findCategoryPath(tree: CategoryNode[], categoryId: number): CategoryNode[] | null {
  for (const node of tree) {
    if (node.categoryId === categoryId) return [node]
    const rest = findCategoryPath(node.children, categoryId)
    if (rest) return [node, ...rest]
  }
  return null
}

// ─── 폼 ─────────────────────────────────────────────────────────────────────

export interface ImageSlot {
  id: string
  previewUrl: string
  /** 새 업로드는 tmp 키, 기존 이미지는 저장 키(`products/...`). 아직 안 올린 새 파일은 null. */
  imageKey: string | null
  /** 아직 업로드 안 된 새 파일. 프리필 슬롯은 null(objectURL 해제 대상 아님). */
  file: File | null
}

export interface CombinationRow {
  key: string
  optionValues: string[]
  additionalPrice: string
  stockQuantity: string
}

export interface ProductFormValues {
  productName: string
  description: string
  /** 대/중/소분류 — 연쇄 Select. 전송은 소분류만. */
  categoryIds: [number | null, number | null, number | null]
  regularPrice: string
  discountEnabled: boolean
  discountPrice: string
  discountStartDate: string // yyyy-mm-dd
  discountEndDate: string
  /** 프리필 원본 LocalDateTime. 날짜를 안 바꾸면 시각까지 그대로 돌려보낸다. */
  discountStartAtSource?: string | null
  discountEndAtSource?: string | null
  thumbnail: ImageSlot[]
  additionalImages: ImageSlot[]
  detailImages: ImageSlot[]
  optionEnabled: boolean
  optionGroups: OptionGroupRequest[]
  combinations: CombinationRow[]
  defaultStock: string
}

/** 삽입 순서 = 화면 순서(첫 키로 자동 스크롤). */
export type ProductFormErrors = Record<string, string>

export const MAX_ADDITIONAL_IMAGES = 9
export const MAX_DETAIL_IMAGES = 20
export const MIN_REGULAR_PRICE = 100
export const MAX_REGULAR_PRICE = 100_000_000

export function emptyProductForm(): ProductFormValues {
  return {
    productName: '',
    description: '',
    categoryIds: [null, null, null],
    regularPrice: '',
    discountEnabled: false,
    discountPrice: '',
    discountStartDate: '',
    discountEndDate: '',
    thumbnail: [],
    additionalImages: [],
    detailImages: [],
    optionEnabled: false,
    optionGroups: [],
    combinations: [],
    defaultStock: '',
  }
}

const COMBINATION_KEY_SEPARATOR = '\u001F'
const combinationKey = (values: string[]) => values.join(COMBINATION_KEY_SEPARATOR)

/**
 * 그룹 순서대로 곱집합을 만든다. 같은 키(옵션값 조합)였던 행은 추가금/재고를 유지한다.
 * 그룹이 없거나 값이 빈 그룹이 하나라도 있으면 [].
 */
export function buildCombinations(groups: OptionGroupRequest[], prev: CombinationRow[]): CombinationRow[] {
  if (groups.length === 0 || groups.some(g => g.values.length === 0)) return []
  const prevByKey = new Map(prev.map(row => [row.key, row]))
  const product = groups.reduce<string[][]>(
    (acc, group) => acc.flatMap(values => group.values.map(v => [...values, v])),
    [[]],
  )
  return product.map(optionValues => {
    const key = combinationKey(optionValues)
    return prevByKey.get(key) ?? { key, optionValues, additionalPrice: '0', stockQuantity: '' }
  })
}

/** BE ProductPricing.discountRateAt과 같은 반올림. */
export function discountRate(regular: number, discount: number): number {
  return Math.round(((regular - discount) * 100) / regular)
}

export function fieldDomId(key: string): string {
  return `product-field-${key}`
}

const toDate = (localDateTime: string | null | undefined) => localDateTime?.slice(0, 10) ?? ''

const prefilledSlot = (imageUrl: (key: string) => string) => (imageKey: string): ImageSlot => ({
  id: imageKey,
  previewUrl: imageUrl(imageKey),
  imageKey,
  file: null,
})

/** 수정 프리필 또는 임시저장으로 폼을 시드한다. 수정 프리필에는 옵션이 없다(옵션/재고는 수정 대상이 아님). */
export function toFormValues(
  src: SellerProductDetail | ProductDraft,
  tree: CategoryNode[],
  imageUrl: (key: string) => string,
): ProductFormValues {
  const path = src.categoryId != null ? findCategoryPath(tree, src.categoryId) : null
  const draft = src as ProductDraft
  const groups = draft.optionGroups ?? []
  const combinations = draft.optionCombinations ?? []
  const optionEnabled = groups.length > 0
  const defaultCombination = combinations.find(c => c.optionValues.length === 0)
  const sourceRows: CombinationRow[] = combinations.map(c => ({
    key: combinationKey(c.optionValues),
    optionValues: c.optionValues,
    additionalPrice: c.additionalPrice != null ? String(c.additionalPrice) : '0',
    stockQuantity: c.stockQuantity != null ? String(c.stockQuantity) : '',
  }))
  const slot = prefilledSlot(imageUrl)
  return {
    productName: src.productName ?? '',
    description: src.description ?? '',
    categoryIds: [
      path?.[0]?.categoryId ?? null,
      path?.[1]?.categoryId ?? null,
      path?.[2]?.categoryId ?? null,
    ],
    regularPrice: src.regularPrice != null ? String(src.regularPrice) : '',
    // 임시저장은 할인가 없이 기간만 남을 수 있다 — 하나라도 있으면 셀러가 켜 둔 할인으로 본다.
    discountEnabled: src.discountPrice != null || !!src.discountStartAt || !!src.discountEndAt,
    discountPrice: src.discountPrice != null ? String(src.discountPrice) : '',
    discountStartDate: toDate(src.discountStartAt),
    discountEndDate: toDate(src.discountEndAt),
    discountStartAtSource: src.discountStartAt ?? null,
    discountEndAtSource: src.discountEndAt ?? null,
    thumbnail: src.thumbnailImageKey ? [slot(src.thumbnailImageKey)] : [],
    additionalImages: (src.additionalImageKeys ?? []).map(slot),
    detailImages: (src.detailImageKeys ?? []).map(slot),
    optionEnabled,
    optionGroups: groups,
    // 임시저장은 아무 값도 없는 행을 빼고 저장하므로 그룹으로 다시 펼쳐 빠진 행을 채운다.
    combinations: optionEnabled ? buildCombinations(groups, sourceRows) : [],
    defaultStock: !optionEnabled && defaultCombination ? String(defaultCombination.stockQuantity) : '',
  }
}

const isBlank = (value: string) => value.trim() === ''

/** `withOptions=false`는 수정 화면 — PUT이 옵션/재고를 받지 않아 검증하지 않는다. */
export function validateProductForm(v: ProductFormValues, withOptions = true): ProductFormErrors {
  const errors: ProductFormErrors = {}
  if (isBlank(v.productName)) errors['productName'] = '상품명을 입력해 주세요'
  if (v.categoryIds[2] == null) errors['categoryId'] = '소분류까지 선택해 주세요'

  const regular = Number(v.regularPrice)
  const regularValid = !isBlank(v.regularPrice) && regular >= MIN_REGULAR_PRICE && regular <= MAX_REGULAR_PRICE
  if (isBlank(v.regularPrice)) errors['regularPrice'] = '정가를 입력해 주세요'
  else if (!regularValid) errors['regularPrice'] = '정가는 100원부터 1억 원까지 입력할 수 있어요'

  if (v.discountEnabled) {
    if (isBlank(v.discountPrice)) errors['discountPrice'] = '할인가를 입력해 주세요'
    else if (regularValid && Number(v.discountPrice) > regular)
      errors['discountPrice'] = '할인가는 정가보다 클 수 없어요'
    if (isBlank(v.discountStartDate)) errors['discountStartDate'] = '할인 시작일을 선택해 주세요'
    // yyyy-mm-dd는 문자열 비교가 곧 날짜 비교다.
    if (v.discountEndDate && v.discountStartDate && v.discountEndDate < v.discountStartDate)
      errors['discountEndDate'] = '종료일은 시작일보다 앞설 수 없어요'
  }

  if (v.thumbnail.length !== 1) errors['thumbnail'] = '대표 썸네일을 1장 올려 주세요'
  if (!withOptions) return errors

  const stockError = (value: string) =>
    isBlank(value) ? '재고를 입력해 주세요' : Number(value) > STOCK_MAX ? '재고가 너무 커요' : undefined
  if (!v.optionEnabled) {
    const message = stockError(v.defaultStock)
    if (message) errors['defaultStock'] = message
  } else {
    const seenNames = new Set<string>()
    v.optionGroups.forEach((group, i) => {
      const name = group.name.trim()
      if (!name) errors[`optionGroup-${i}-name`] = '옵션명을 입력해 주세요'
      else if (seenNames.has(name)) errors[`optionGroup-${i}-name`] = '같은 옵션명이 있어요'
      seenNames.add(name)
      if (group.values.length === 0) errors[`optionGroup-${i}-values`] = '옵션값을 1개 이상 추가해 주세요'
    })
    v.combinations.forEach((row, j) => {
      if (isBlank(row.additionalPrice)) errors[`combination-${j}-additionalPrice`] = '추가 금액을 입력해 주세요'
      // BE는 Long이지만 JS가 정확히 보낼 수 있는 정수는 2^53 미만까지다.
      else if (!Number.isSafeInteger(Number(row.additionalPrice))) {
        errors[`combination-${j}-additionalPrice`] = '추가 금액이 너무 커요'
      }
      const message = stockError(row.stockQuantity)
      if (message) errors[`combination-${j}-stockQuantity`] = message
    })
  }
  return errors
}

const startOfDay = (date: string) => `${date}T00:00:00`
const endOfDay = (date: string) => `${date}T23:59:59`
// 날짜 입력에는 시각이 없어 매번 다시 만들면 15:30에 시작하던 할인이 자정으로 당겨진다.
const keepTime = (date: string, source: string | null | undefined, fallback: (date: string) => string) =>
  source && toDate(source) === date ? source : fallback(date)
const imageKeys = (slots: ImageSlot[]) => slots.flatMap(slot => (slot.imageKey ? [slot.imageKey] : []))

/** 유효한 폼 + 모든 슬롯 업로드 완료(imageKey 보유) 상태에서만 호출한다. */
export function toUpdateRequest(v: ProductFormValues): ProductUpdateRequest {
  const description = v.description.trim()
  return {
    categoryId: v.categoryIds[2]!,
    productName: v.productName.trim(),
    description: description || null,
    regularPrice: Number(v.regularPrice),
    discountPrice: v.discountEnabled ? Number(v.discountPrice) : null,
    discountStartAt: v.discountEnabled ? keepTime(v.discountStartDate, v.discountStartAtSource, startOfDay) : null,
    discountEndAt:
      v.discountEnabled && v.discountEndDate ? keepTime(v.discountEndDate, v.discountEndAtSource, endOfDay) : null,
    thumbnailImageKey: v.thumbnail[0]!.imageKey!,
    // PUT은 한 목록 안 중복 키를 90001로 거절한다.
    additionalImageKeys: [...new Set(imageKeys(v.additionalImages))],
    detailImageKeys: [...new Set(imageKeys(v.detailImages))],
  }
}

export function toRegisterRequest(v: ProductFormValues): ProductRegisterRequest {
  return {
    ...toUpdateRequest(v),
    ...(v.optionEnabled
      ? {
          optionGroups: v.optionGroups.map(g => ({ name: g.name.trim(), values: g.values })),
          optionCombinations: v.combinations.map(row => ({
            optionValues: row.optionValues,
            additionalPrice: Number(row.additionalPrice),
            stockQuantity: Number(row.stockQuantity),
          })),
        }
      : {
          optionGroups: null,
          optionCombinations: [{ optionValues: [], additionalPrice: 0, stockQuantity: Number(v.defaultStock) }],
        }),
  }
}

const parseDigits = (value: string): number | undefined => (/^\d+$/.test(value) ? Number(value) : undefined)

/** 임시저장(목업 전용) — 필수 검증 없이 비었거나 숫자가 아닌 필드는 뺀다. */
export function toDraftRequest(v: ProductFormValues): ProductDraftRequest {
  const body: ProductDraftRequest = {}
  if (!isBlank(v.productName)) body.productName = v.productName.trim()
  if (!isBlank(v.description)) body.description = v.description.trim()
  if (v.categoryIds[2] != null) body.categoryId = v.categoryIds[2]
  const regular = parseDigits(v.regularPrice)
  if (regular !== undefined) body.regularPrice = regular
  if (v.discountEnabled) {
    const discount = parseDigits(v.discountPrice)
    if (discount !== undefined) body.discountPrice = discount
    if (v.discountStartDate) body.discountStartAt = keepTime(v.discountStartDate, v.discountStartAtSource, startOfDay)
    if (v.discountEndDate) body.discountEndAt = keepTime(v.discountEndDate, v.discountEndAtSource, endOfDay)
  }
  const thumbnailKey = v.thumbnail[0]?.imageKey
  if (thumbnailKey) body.thumbnailImageKey = thumbnailKey
  if (v.additionalImages.length > 0) body.additionalImageKeys = imageKeys(v.additionalImages)
  if (v.detailImages.length > 0) body.detailImageKeys = imageKeys(v.detailImages)
  if (v.optionEnabled) {
    if (v.optionGroups.length > 0) body.optionGroups = v.optionGroups
    body.optionCombinations = v.combinations.flatMap(row => {
      const additionalPrice = parseDigits(row.additionalPrice)
      const stockQuantity = parseDigits(row.stockQuantity)
      if (additionalPrice === undefined && stockQuantity === undefined) return []
      return [
        {
          optionValues: row.optionValues,
          ...(additionalPrice !== undefined && { additionalPrice }),
          ...(stockQuantity !== undefined && { stockQuantity }),
        },
      ]
    })
  } else {
    const stockQuantity = parseDigits(v.defaultStock)
    if (stockQuantity !== undefined) body.optionCombinations = [{ optionValues: [], additionalPrice: 0, stockQuantity }]
  }
  return body
}

// BE errorCode → FE 문구. 서버 message는 -습니다 격식체라 띄우지 않는다(카피 규칙).
// 90002(INVALID_CURSOR)는 셀러 상품 API가 보내지 않는다.
const ERROR_MESSAGE: Record<number, string> = {
  40000: '상품을 찾을 수 없어요. 목록을 새로고침해 주세요.',
  40001: '가격을 확인해 주세요. 정가는 100원부터 1억 원까지, 할인가는 정가 이하로 입력할 수 있어요.',
  40002: '할인 기간을 확인해 주세요.',
  40003: '이미지 수를 확인해 주세요. 추가 썸네일은 9장, 상세 이미지는 20장까지 올릴 수 있어요.',
  40004: '판매 활동이 가능한 계정이 아니라 처리할 수 없어요.',
  40005: '옵션 구성을 확인해 주세요.',
  40006: '상품을 조회할 수 있는 계정이 아니에요.',
  40007: '내 상품이 아니라 조회할 수 없어요.',
  40100: '소분류까지 선택해 주세요.',
  40101: '선택한 카테고리를 쓸 수 없어요. 다시 선택해 주세요.',
  40200: '재고는 0 이상으로 입력해 주세요.',
  40201: '추가 금액은 0 이상으로 입력해 주세요.',
  90001: '입력한 내용을 다시 확인해 주세요.',
  90003: '다른 곳에서 먼저 수정했어요. 새로고침 후 다시 시도해 주세요.',
  100000: 'JPG/PNG/WEBP 이미지만 올릴 수 있어요.',
  100001: '이미지를 다시 올려 주세요.',
  100002: '이미지를 다시 올려 주세요.',
  100003: '이미지를 다시 올려 주세요.',
}

// axios 타입을 안 끌어오려고 duck-typing(store-settings 관례). 에러 본문은 `{ errorCode, message }`.
export function productErrorMessage(error: unknown): string {
  const code = (error as { response?: { data?: { errorCode?: number } } })?.response?.data?.errorCode
  return (code !== undefined && ERROR_MESSAGE[code]) || '요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.'
}
