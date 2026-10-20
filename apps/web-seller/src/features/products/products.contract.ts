// 셀러 상품 BE(origin/develop `boot/seller/.../product/**`)와 화면 사이의 순수 타입·매핑·규칙.
// 와이어 타입은 전부 생성물(@aechak/api)에서 가져오고 이 파일은 FE 쪽 이름만 붙인다 — OpenAPI 스펙이
// 바뀌면 생성물을 재생성하는 것만으로 여기서 타입 오류가 드러난다. 서버 enum은 이 feature 밖으로
// 새지 않게 여기 가둔다(store-settings.contract 관례).
// 날짜는 BE LocalDateTime(오프셋 없는 KST 벽시계, 예: 2026-08-11T10:00:00)이다. `+09:00`/`Z`를 붙이면
// 역직렬화가 400/90001로 실패하거나(오프셋) 9시간 밀린다(Z).
import type {
  CategoryResponse,
  GetSellerProductsParams,
  GetSellerProductsSort,
  GetSellerProductsStock,
  InspectionStatus,
  SaleStatus,
  SellerProductDetailData,
  SellerProductOptionCombinationInput,
  SellerProductOptionGroupInput,
  SellerProductRegisterRequest,
  SellerProductUpdateRequest,
} from '@aechak/api'

// 생성물 이름을 그대로 쓰되, 화면 코드가 읽기 쉬운 FE 이름을 붙인다.
export type WireSaleStatus = SaleStatus
export type WireInspectionStatus = InspectionStatus
export type CategoryNode = CategoryResponse

export type {
  /** 셀러가 직접 지정할 수 있는 판매 상태 — ON_SALE·SUSPENDED뿐이다. */
  SellerAssignableSaleStatus,
  IssuePresignedUrlRequest,
  PresignedUrlResponse,
  /** 목록 카드 한 행. */
  SellerProductSummary,
  /** 옵션 재고 조회의 한 조합. `optionCombinationId`는 내부 숫자 PK다. */
  SellerProductOptionCombination as SellerOptionCombination,
} from '@aechak/api'

// ─── POST /sellers/me/products ───────────────────────────────────────────────
// 옵션 불변식(전부 400/40005): 조합 0건 금지 · 그룹명 중복 금지 · 옵션값 이름은 그룹을 넘어서도 중복
// 금지 · 그룹에 없는 값 지목 금지 · 조합이 모든 그룹을 "적어도 하나씩" 덮어야 함(한 그룹에서 값을 둘
// 이상 골라도 통과한다 — ProductOptions.kt:59가 distinct().size만 본다) · 같은 값 집합의 조합 중복 금지.
// 등록에는 이미지 키 목록 안의 중복 검사가 없다(PUT에만 있다).

export type OptionGroupRequest = SellerProductOptionGroupInput
export type OptionCombinationRequest = SellerProductOptionCombinationInput
export type ProductRegisterRequest = SellerProductRegisterRequest
export type { SellerProductRegisterData as ProductRegisterResponse } from '@aechak/api'

// ─── PUT /sellers/me/products/{productId} ────────────────────────────────────
// 옵션/재고/판매 상태는 바꾸지 않는다. 이미지 키 목록은 통째로 교체(빠진 키는 삭제가 아니라 직전
// 버전으로 닫힘)이고, 한 목록 안 중복 키는 400/90001이다(목록을 넘나드는 중복은 허용).
// 함정: 소유 증명 집합이 대표 이미지 키 + 지금 열려 있는 이미지 행으로 한정된다 — 과거 수정으로 닫힌
// 키나 다른 상품의 정식 키를 실으면 `tmp/` 접두가 아니어서 403/100002다. 단건 조회가 현재 열려 있는
// 행만 내려주므로(아래) 그 응답을 그대로 되돌려 보내는 것은 안전하다.

export type ProductUpdateRequest = SellerProductUpdateRequest
export type { SellerProductUpdateData as ProductUpdateResponse } from '@aechak/api'

// ─── GET /sellers/me/products/{productId} ────────────────────────────────────
// 수정 폼 프리필. 이미지 키는 현재 열려 있는 행에서만, 종류별 sortOrder 오름차순으로 온다.
// 옵션은 응답에 없다 — PUT의 대상이 아니고 별도 옵션 조회가 담당한다.
// 자격 게이트가 목록·옵션 조회와 갈린다: 이 조회만 활성 셀러 조건이라 휴점·정지 셀러는 403/40004다
// (목록·옵션은 40006으로 휴점을 허용한다). 남의 상품·없는 상품은 모두 404/40000이다.
//
// **등록·수정 요청 DTO를 상속하지 않는다.** 모양이 비슷해도 세 군데가 다르다:
// ① `thumbnailImageKey`가 nullable이다(요청 DTO는 @NotBlank non-null) — 대표 이미지 행이 없는 상품을
//    도메인이 허용하고 서버가 500 대신 null을 보증한다. 수정 폼은 그때 재업로드를 받아야 한다.
// ② 요청에 없는 `saleStatus`·`inspectionStatus`가 더 실린다.
// ③ 요청의 이미지 목록은 optional/nullable이지만 응답은 항상 배열이다(빈 배열).

/** 수정 폼 프리필 — BE SellerProductDetailResponse 1:1. */
export type SellerProductDetail = SellerProductDetailData

// ─── PATCH /sellers/me/products/{productId}/status ──────────────────────────
// BE가 받는 값은 ON_SALE/SUSPENDED뿐이다(나머지는 400/90001). 현재 상태는 검사하지 않고, ON_SALE인데
// 판매 가능한 재고가 없으면 같은 요청 안에서 동기로 파생돼 응답이 바로 OUT_OF_STOCK이다.

/**
 * 목업이 서버 역할을 할 때 받는 느슨한 모양 — 지정 불가 값(OUT_OF_STOCK·ENDED)도 받아 400/90001로
 * 거절하는 BE 동작을 재현한다. 화면이 실제로 보내는 요청 타입은 생성물
 * `SellerProductSaleStatusChangeRequest`(= `SellerAssignableSaleStatus`)다.
 */
export interface SaleStatusChangeRequest {
  saleStatus: WireSaleStatus
}

export type { SellerProductSaleStatusChangeData as SaleStatusChangeResponse } from '@aechak/api'

// ─── PATCH /sellers/me/products/{productId}/options/{combinationId} ─────────
// 둘 중 하나는 필수. stockDelta는 0 금지, |delta| ≤ 1,000,000. 재고는 [0, Int.MAX]로 잘리고 실제 반영량이
// appliedStockDelta로 온다(요청과 다를 수 있다). 응답에 판매 상태는 없다 — 자동 품절/복귀는 BE가 커밋
// 뒤 비동기(@Async AFTER_COMMIT)로 하므로 응답만으로는 알 수 없고 목록을 다시 조회해야 한다.

export const STOCK_DELTA_LIMIT = 1_000_000
/** BE 재고는 Kotlin Int(int unsigned 컬럼). 넘으면 Jackson 역직렬화가 400/90001로 거절한다. */
export const STOCK_MAX = 2_147_483_647

export type {
  SellerOptionCombinationChangeRequest as OptionCombinationChangeRequest,
  SellerOptionCombinationChangeData as OptionCombinationChangeResponse,
} from '@aechak/api'

// ─── GET /sellers/me/products/{productId}/options ───────────────────────────
// 비활성 조합을 포함하고 재고를 마스킹 없이 준다. 여섯 EP 가운데 이것만 남의 상품에 403/40007이다.

export type { SellerProductOptionsData as SellerProductOptionsResponse } from '@aechak/api'

// ─── GET /sellers/me/products ───────────────────────────────────────────────
// 커서가 아니라 오프셋 페이지네이션(page·size)이다. 배열 파라미터(saleStatus·inspectionStatus)는 공유
// 클라이언트가 반복 파라미터(`?k=A&k=B`)로 직렬화한다.
// 빈 값은 "미입력"이 아니라 형식 오류다 — `?stock=`·`?createdFrom=`도 400/90001이므로 값이 없는
// 파라미터는 키째 빼서 보내야 한다(정규화는 products.queries의 `normalizeSearchParams`가 한다).

export type SellerProductSearchParams = GetSellerProductsParams
export type SellerProductSort = GetSellerProductsSort
export type SellerProductStockFilter = GetSellerProductsStock
export type { SellerProductListData as SellerProductListResponse } from '@aechak/api'

export const KEYWORD_MAX = 100
export const DEFAULT_PAGE_SIZE = 20

// ─── POST /files/presigned-url (api 호스트) ──────────────────────────────────
// purpose=PRODUCT는 png/jpeg/webp만(그 외 400/100000). 받은 url에 같은 Content-Type으로 PUT(10분 유효)하고
// key(`tmp/{userId}/products/{ULID}.{ext}`)를 등록/수정 본문에 싣는다. 서버 크기 제한은 없다.
// 등록/수정은 tmp 키를 `products/{같은 파일명}`으로 복사한다(같은 tmp 키 → 같은 저장 키). tmp/는 S3 수명주기로
// 1일 뒤 지워지므로, 하루 지난 tmp 키를 보내면 404/100001이다. 임시저장(BE 없음)이 tmp 키를 들고 있는 것도
// 같은 제약을 받는다 — 임시저장 API를 정할 때 이미지 키 보존 방식을 함께 정한다.

export const PRODUCT_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp']

// ─── BE 엔드포인트 없음(목업 전용) ─────────────────────────────────────────────
// 임시저장은 BE에 아직 없다. products.mock.ts의 같은 이름 구역과 짝이다.

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

/**
 * 필수값 누락만 본다 — CRQ-PRD-02(첫 누락 필드로 스크롤 + 안내 말풍선)에 필요한 최소치다. 가격 범위, 할인 기간,
 * 옵션 중복, 숫자 상한 같은 규칙은 BE가 errorCode로 거절하고 productErrorMessage가 문구를 맡는다.
 * 숫자/날짜 칸은 입력 단계에서 digitsOnly/yyyy-mm-dd로 정규화돼 공백이 못 들어오므로 `''`만 본다.
 * `withOptions=false`는 수정 화면 — PUT이 옵션/재고를 받지 않아 검증하지 않는다.
 */
export function validateProductForm(v: ProductFormValues, withOptions = true): ProductFormErrors {
  const errors: ProductFormErrors = {}
  if (isBlank(v.productName)) errors['productName'] = '상품명을 입력해 주세요'
  if (v.categoryIds[2] == null) errors['categoryId'] = '소분류까지 선택해 주세요'
  if (v.regularPrice === '') errors['regularPrice'] = '정가를 입력해 주세요'
  if (v.discountEnabled) {
    if (v.discountPrice === '') errors['discountPrice'] = '할인가를 입력해 주세요'
    if (v.discountStartDate === '') errors['discountStartDate'] = '할인 시작일을 선택해 주세요'
  }
  if (v.thumbnail.length !== 1) errors['thumbnail'] = '대표 썸네일을 1장 올려 주세요'
  if (!withOptions) return errors

  if (!v.optionEnabled) {
    if (v.defaultStock === '') errors['defaultStock'] = '재고를 입력해 주세요'
  } else {
    v.optionGroups.forEach((group, i) => {
      if (isBlank(group.name)) errors[`optionGroup-${i}-name`] = '옵션명을 입력해 주세요'
      if (group.values.length === 0) errors[`optionGroup-${i}-values`] = '옵션값을 1개 이상 추가해 주세요'
    })
    v.combinations.forEach((row, j) => {
      if (row.additionalPrice === '') errors[`combination-${j}-additionalPrice`] = '추가 금액을 입력해 주세요'
      // 서버 규칙이 아니라 전송 손실 방지다. 2^53 이상은 Number()가 다른 값으로 바꿔 보내고 BE는 음수만 거절한다.
      else if (!Number.isSafeInteger(Number(row.additionalPrice))) {
        errors[`combination-${j}-additionalPrice`] = '추가 금액이 너무 커요'
      }
      if (row.stockQuantity === '') errors[`combination-${j}-stockQuantity`] = '재고를 입력해 주세요'
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

// 입력이 digitsOnly로 정규화돼 있어 빈 칸과 숫자만 구분하면 된다.
const parseDigits = (value: string): number | undefined => (value === '' ? undefined : Number(value))

/** 임시저장(목업 전용) — 필수 검증 없이 비운 칸만 뺀다. */
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
// 인증 계열은 공유 클라이언트가 먼저 전역 처리한다 — 401은 refresh 재시도 뒤에도 실패하면
// setOnAuthExpired가 로그인으로 보낸다(main.tsx가 등록하는 핸들러는 이것 하나다). 403/20006에서
// 공유 클라이언트는 onOnboardingRequired?.()를 부르지만 셀러센터는 온보딩 화면이 없어 그 핸들러를
// 등록하지 않으므로 아무 일도 일어나지 않는다 — 20006은 아래 문구가 유일한 안내다. 어느 쪽이든
// promise는 reject되어 화면까지 내려오므로 전역 이동이 일어나기 전/실패할 때 보일 문구를 채운다.
const ERROR_MESSAGE: Record<number, string> = {
  20004: '로그인이 필요해요. 다시 로그인해 주세요.',
  20005: '이용이 제한된 계정이에요. 고객센터에 문의해 주세요.',
  20006: '구매자 앱에서 온보딩(약관/닉네임)을 완료한 뒤 이용할 수 있어요.',
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
  90000: '서버에 문제가 생겼어요. 잠시 후 다시 시도해 주세요.',
  90001: '입력한 내용을 다시 확인해 주세요.',
  90003: '다른 곳에서 먼저 수정했어요. 새로고침 후 다시 시도해 주세요.',
  100000: 'JPG/PNG/WEBP 이미지만 올릴 수 있어요.',
  100001: '이미지를 다시 올려 주세요.',
  100002: '이미지를 다시 올려 주세요.',
  100003: '이미지를 다시 올려 주세요.',
}

// axios 타입을 안 끌어오려고 duck-typing(store-settings 관례). 에러 본문은 `{ errorCode, message }`.
export function productErrorMessage(error: unknown): string {
  const code = (error as { response?: { data?: { errorCode?: number } } }).response?.data?.errorCode
  return (code !== undefined && ERROR_MESSAGE[code]) || '요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.'
}
