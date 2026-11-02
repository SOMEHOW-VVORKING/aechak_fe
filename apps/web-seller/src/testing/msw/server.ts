import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { API_PATH_PREFIX } from '@aechak/api'
import { PRODUCT_IMAGE_TYPES } from '@/features/products/products.contract'
import { MOCK_CATEGORY_TREE, leafIdOf } from '@/features/products/products.mock'

// vitest 공용 MSW 서버(test-setup.ts가 수명주기를 관리) — web-buyer의 src/testing/msw 관례를
// web-seller에 이식했다. 실제 HTTP 경로(URL·envelope·에러 계약)까지 검증하려고 모듈 모킹 대신
// 네트워크 레벨에서 가로챈다.
//
// 호스트를 둘로 나눠 둔 이유: 셀러센터는 인증·presigned를 api 모듈에서, 입점 신청·상품을
// seller 모듈에서 받는다. 두 호스트를 한 base로 합치면 요청이 엉뚱한 모듈로 나가도 MSW가
// 똑같이 받아 주어 실제 배포에서만 드러나는 호스트 오배치를 테스트가 놓친다. 두 상수는
// test-setup.ts의 configureApiHosts 인자와 같은 값이어야 한다.
export const API_ORIGIN = 'http://localhost:8080'
export const SELLER_ORIGIN = 'http://localhost:8081'
const apiBase = `${API_ORIGIN}${API_PATH_PREFIX}`
const sellerBase = `${SELLER_ORIGIN}${API_PATH_PREFIX}`

export const SELLER_APPLICATIONS_URL = `${sellerBase}/seller-applications`
export const SELLER_APPLICATIONS_SUBMIT_URL = `${sellerBase}/seller-applications/submit`
export const SELLER_PRODUCTS_URL = `${sellerBase}/sellers/me/products`
export const SELLER_PRODUCT_DRAFT_AUTOFILL_URL = `${sellerBase}/sellers/me/product-drafts/autofill`
export const SELLER_PRODUCT_DRAFTS_URL = `${sellerBase}/sellers/me/product-drafts`
export const SELLER_COURIERS_URL = `${sellerBase}/sellers/couriers`
export const SELLER_ORDERS_URL = `${sellerBase}/sellers/me/orders`
export const SELLER_SHIPPING_POLICY_URL = `${sellerBase}/sellers/me/shipping-policy`
export const SELLER_STORE_URL = `${sellerBase}/sellers/me/store`
export const SELLER_SETTLEMENTS_URL = `${sellerBase}/sellers/me/settlements`
export const SELLER_SETTLEMENT_MONTHS_URL = `${sellerBase}/sellers/me/settlements/months`
export const SELLER_DASHBOARD_SUMMARY_URL = `${sellerBase}/sellers/me/dashboard/summary`
export const SELLER_INQUIRIES_URL = `${sellerBase}/sellers/me/inquiries`
export const PRESIGNED_URL = `${apiBase}/files/presigned-url`
export const CATEGORIES_URL = `${apiBase}/categories`
export const WEB_REFRESH_URL = `${apiBase}/auth/web/refresh`
// 기본 핸들러를 두지 않는다 — 로그아웃을 부르는지/안 부르는지가 테스트의 단언이라,
// 조용히 204를 주는 기본값이 있으면 "취소했는데 호출했다"는 회귀가 통과한다.
export const WEB_LOGOUT_URL = `${apiBase}/auth/web/logout`

// BE ApplicationResponse 모양의 서버 상태. null = 신청 이력 없음(GET 404/10100).
export interface SellerApplicationWire {
  applicationId: number
  status: 'DRAFT' | 'SUBMITTED' | 'REVIEWING' | 'APPROVED' | 'REJECTED' | 'CANCELLED'
  businessType: 'PERSONAL_GENERAL' | 'SOLE_PROPRIETORSHIP' | 'CORPORATE'
  businessName: string | null
  businessRegNo: string | null
  corpRegNo: string | null
  representativeName: string | null
  telesalesNumber: string | null
  bankCode: string | null
  accountNumberMasked: string | null
  accountHolder: string | null
  appliedAt: string
  submittedAt: string | null
  decidedAt: string | null
  rejectionReason: string | null
  documents: { documentType: string; uploadedAt: string }[]
}

let application: SellerApplicationWire | null = null
let applicationSeq = 0
let presignedSeq = 0
/** 발급한 key → 그때 보낸 contentType. S3 PUT 스텁이 서명 조건을 재현하려고 읽는다. */
const presignedContentTypes = new Map<string, string>()

export function makeApplicationWire(
  overrides: Partial<SellerApplicationWire> = {},
): SellerApplicationWire {
  applicationSeq += 1
  return {
    applicationId: applicationSeq,
    status: 'DRAFT',
    businessType: 'PERSONAL_GENERAL',
    businessName: null,
    businessRegNo: null,
    corpRegNo: null,
    representativeName: null,
    telesalesNumber: null,
    bankCode: null,
    accountNumberMasked: null,
    accountHolder: null,
    appliedAt: '2026-08-13T09:00:00',
    submittedAt: null,
    decidedAt: null,
    rejectionReason: null,
    documents: [],
  ...overrides,
  }
}

/** 테스트마다 신청 상태를 세운다. 인자 없이 부르면 '신청 이력 없음'(GET 404/10100). */
export function seedSellerApplication(state: SellerApplicationWire | null = null): void {
  application = state ? { ...state, documents: state.documents.map(doc => ({ ...doc })) } : null
}

/** 핸들러가 반영한 현재 신청 상태 — 테스트가 저장 결과를 단언할 때 읽는다. */
export function currentSellerApplication(): SellerApplicationWire | null {
  return application
    ? { ...application, documents: application.documents.map(doc => ({ ...doc })) }
    : null
}

function maskAccount(accountNumber: string): string {
  if (accountNumber.length <= 4) return '*'.repeat(accountNumber.length)
  return `${'*'.repeat(accountNumber.length - 4)}${accountNumber.slice(-4)}`
}

const sellerApplicationHandlers = [
  http.get(SELLER_APPLICATIONS_URL, () => {
    if (application == null) {
      return HttpResponse.json(
        { errorCode: 10100, message: '입점 신청을 찾을 수 없습니다.' },
        { status: 404 },
      )
    }
    return HttpResponse.json({ data: application })
  }),
  // 임시저장 — 전체 덮어쓰기(폼) + 부분 upsert(서류). REJECTED면 자동 reopen(BE 계약).
  http.post(SELLER_APPLICATIONS_URL, async ({ request }) => {
    const body = (await request.json()) as {
      businessType: SellerApplicationWire['businessType']
      businessName?: string | null
      businessRegNo?: string | null
      corpRegNo?: string | null
      representativeName?: string | null
      telesalesNumber?: string | null
      bankCode?: string | null
      accountNumber?: string | null
      accountHolder?: string | null
      documents?: { documentType: string; tmpKey: string }[]
    }
    if (application && application.status !== 'DRAFT' && application.status !== 'REJECTED') {
      return HttpResponse.json(
        { errorCode: 10101, message: '현재 신청 상태에서 허용되지 않는 전이입니다.' },
        { status: 409 },
      )
    }
    const existing = application ?? makeApplicationWire()
    const mergedDocuments = [...existing.documents]
    for (const item of body.documents ?? []) {
      const index = mergedDocuments.findIndex(doc => doc.documentType === item.documentType)
      const row = { documentType: item.documentType, uploadedAt: '2026-08-13T10:00:00' }
      if (index >= 0) mergedDocuments[index] = row
      else mergedDocuments.push(row)
    }
    application = {
      ...existing,
      status: 'DRAFT',
      businessType: body.businessType,
      businessName: body.businessName ?? null,
      businessRegNo: body.businessRegNo ?? null,
      corpRegNo: body.corpRegNo ?? null,
      representativeName: body.representativeName ?? null,
      telesalesNumber: body.telesalesNumber ?? null,
      bankCode: body.bankCode ?? null,
      accountNumberMasked: body.accountNumber ? maskAccount(body.accountNumber) : null,
      accountHolder: body.accountHolder ?? null,
      documents: mergedDocuments,
    }
    return HttpResponse.json({ data: application })
  }),
  http.post(SELLER_APPLICATIONS_SUBMIT_URL, () => {
    if (application == null) {
      return HttpResponse.json(
        { errorCode: 10100, message: '입점 신청을 찾을 수 없습니다.' },
        { status: 404 },
      )
    }
    if (application.status !== 'DRAFT') {
      return HttpResponse.json(
        { errorCode: 10101, message: '현재 신청 상태에서 허용되지 않는 전이입니다.' },
        { status: 409 },
      )
    }
    // requireSubmittable 미러(공통 필수 정보만) — message 형식은 BE 그대로 격식체다.
    const missingFields = (
      [
        ['대표자명', application.representativeName],
        ['은행 코드', application.bankCode],
        ['계좌번호', application.accountNumberMasked],
        ['예금주', application.accountHolder],
      ] as const
    )
      .filter(([, value]) => !value)
      .map(([label]) => label)
    if (missingFields.length > 0) {
      return HttpResponse.json(
        { errorCode: 10105, message: `필수 정보가 누락됐습니다: ${missingFields.join(', ')}` },
        { status: 400 },
      )
    }
    application = { ...application, status: 'SUBMITTED', submittedAt: '2026-08-13T11:00:00' }
    return new HttpResponse(null, { status: 204 })
  }),
  // presigned 발급 + S3 PUT(절대 URL이라 baseURL 밖 — 따로 가로챈다). 용도별 prefix가 서버 계약이고
  // 등록/수정의 승격 검증(`tmp/{userId}/products/` 아니면 400/100003)이 그 접두를 본다 — 여기서
  // purpose를 무시하면 FE가 용도를 틀리게 보내도 테스트가 통과한다.
  http.post(PRESIGNED_URL, async ({ request }) => {
    const body = (await request.json()) as { purpose: string; contentType: string }
    // FileService: 용도별 허용 형식이 아니면 발급 단계에서 거절한다. FE는 이미지 형식을 미리 보지
    // 않고 이 응답 문구로 안내하므로(ProductEditor.uploadPending), 여기서 무엇이든 발급해 주면
    // 그 경로가 아무 테스트에도 걸리지 않는다.
    if (body.purpose === 'PRODUCT' && !PRODUCT_IMAGE_TYPES.includes(body.contentType)) {
      return HttpResponse.json(
        { errorCode: 100000, message: '지원하지 않는 파일 형식입니다.' },
        { status: 400 },
      )
    }
    const prefix = body.purpose === 'PRODUCT' ? 'products' : 'sellers/documents'
    presignedSeq += 1
    const key = `tmp/1/${prefix}/fixture-${presignedSeq}.${body.contentType.split('/')[1]}`
    presignedContentTypes.set(key, body.contentType)
    return HttpResponse.json({ data: { url: `https://fake-s3.local/${key}`, key } })
  }),
  // S3가 presigned 서명으로 거절하는 두 조건을 스텁에서 재현한다 — 무엇을 보내도 200을 주면
  // products.upload/store-settings.upload의 핵심 주장("Authorization을 얹지 않는다 / Content-Type은
  // 발급 때 보낸 값과 같다")이 아무 테스트에도 걸리지 않는다. 업로드를 axios 인스턴스로 바꿔
  // bearer가 붙거나 Content-Type이 어긋나면 여기서 403으로 터진다.
  http.put('https://fake-s3.local/*', ({ request }) => {
    if (request.headers.get('Authorization')) {
      return HttpResponse.json(
        { message: 'presigned URL에 Authorization 헤더를 얹으면 서명 검증이 깨진다' },
        { status: 403 },
      )
    }
    const key = new URL(request.url).pathname.replace(/^\//, '')
    const issued = presignedContentTypes.get(key)
    if (issued !== undefined && request.headers.get('Content-Type') !== issued) {
      return HttpResponse.json(
        { message: `Content-Type이 발급값과 다르다(발급 ${issued})` },
        { status: 403 },
      )
    }
    return new HttpResponse(null, { status: 200 })
  }),
  // 401 시나리오에서 refresh가 성공으로 새면 에러 테스트가 조용히 통과한다 — 기본은 401 고정
  // (web-buyer msw 관례).
  http.post(WEB_REFRESH_URL, () =>
    HttpResponse.json({ errorCode: 20004, message: '인증이 필요합니다.' }, { status: 401 }),
  ),
]


// ─── 셀러 상품 (seller 호스트 /sellers/me/products) ───────────────────────────
// 목록은 "FE가 무엇을 보냈는가"를 기록하고 시드한 페이지를 돌려준다 — 필터링은 BE 소관이고 FE의
// 책임은 파라미터를 정확히 보내는 것이라, 테스트는 lastSellerProductsQuery()로 쿼리 문자열을 단언한다.
// 쓰기는 상태를 바꿔 목록/옵션 재조회에 반영한다(등록 → 목록 맨 앞, 재고 → 총재고·판매 상태).

export interface SellerProductSummaryWire {
  productId: string
  name: string
  thumbnailImageKey: string | null
  categoryName: string
  regularPrice: number
  discountPrice: number | null
  discountRate: number | null
  saleStatus: 'ON_SALE' | 'OUT_OF_STOCK' | 'SUSPENDED' | 'ENDED'
  inspectionStatus: 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED'
  totalStock: number
  createdAt: string
}

export interface SellerOptionCombinationWire {
  optionCombinationId: number
  name: string
  additionalPrice: number
  stockQuantity: number
  isActive: boolean
}

/**
 * 단건 조회(GET /sellers/me/products/{productId}) 응답 모양. 목록 응답과 겹치는 필드가 있어도 별도로
 * 들고 있는다 — 목록에 없는 값(categoryId·description·할인 기간·추가/상세 이미지 키)이 프리필의 본질이고,
 * `thumbnailImageKey`는 서버가 null을 낼 수 있다.
 */
export interface SellerProductDetailWire {
  productId: string
  categoryId: number
  productName: string
  description: string | null
  regularPrice: number
  discountPrice: number | null
  discountStartAt: string | null
  discountEndAt: string | null
  thumbnailImageKey: string | null
  additionalImageKeys: string[]
  detailImageKeys: string[]
  saleStatus: SellerProductSummaryWire['saleStatus']
  inspectionStatus: SellerProductSummaryWire['inspectionStatus']
}

let sellerProducts: SellerProductSummaryWire[] = []
let sellerProductOptions = new Map<string, SellerOptionCombinationWire[]>()
let sellerProductDetails = new Map<string, SellerProductDetailWire>()
let lastProductsQuery: string | null = null
let lastRegisterBody: unknown = null
let lastProductUpdateBody: unknown = null
let productIdSeq = 0
let combinationIdSeq = 0

export function makeSellerProductWire(
  overrides: Partial<SellerProductSummaryWire> = {},
): SellerProductSummaryWire {
  productIdSeq += 1
  return {
    productId: `01JMSWPRODUCT${String(productIdSeq).padStart(13, '0')}`,
    name: `목업 상품 ${productIdSeq}`,
    thumbnailImageKey: null,
    categoryName: '자동 급식기',
    regularPrice: 30000,
    discountPrice: null,
    discountRate: null,
    saleStatus: 'ON_SALE',
    inspectionStatus: 'APPROVED',
    totalStock: 10,
    createdAt: '2026-10-07T10:00:00',
    ...overrides,
  }
}

export function makeSellerOptionCombinationWire(
  overrides: Partial<SellerOptionCombinationWire> = {},
): SellerOptionCombinationWire {
  combinationIdSeq += 1
  return {
    optionCombinationId: combinationIdSeq,
    name: '기본',
    additionalPrice: 0,
    stockQuantity: 10,
    isActive: true,
    ...overrides,
  }
}

/** 목록 행에서 단건 조회 응답을 파생한다 — 목록에 없는 값은 비워 두고 테스트가 `detail`로 덮는다. */
function defaultDetailWire(product: SellerProductSummaryWire): SellerProductDetailWire {
  return {
    productId: product.productId,
    categoryId: 1,
    productName: product.name,
    description: null,
    regularPrice: product.regularPrice,
    discountPrice: product.discountPrice,
    discountStartAt: null,
    discountEndAt: null,
    thumbnailImageKey: product.thumbnailImageKey,
    additionalImageKeys: [],
    detailImageKeys: [],
    saleStatus: product.saleStatus,
    inspectionStatus: product.inspectionStatus,
  }
}

/**
 * 테스트마다 상품 목록과 옵션 조합을 세운다. `options`를 주지 않은 상품은 총재고와 같은 재고를 가진
 * `기본` 조합 하나로 채운다(옵션 없이 등록한 상품의 BE 응답 모양). `detail`을 주면 단건 조회 응답의
 * 그 필드만 덮는다(목록에 없는 categoryId·description·할인 기간·이미지 키들).
 */
export function seedSellerProducts(
  rows: {
    product: SellerProductSummaryWire
    options?: SellerOptionCombinationWire[]
    detail?: Partial<SellerProductDetailWire>
  }[] = [],
): void {
  sellerProducts = rows.map(row => ({ ...row.product }))
  sellerProductOptions = new Map(
    rows.map(row => [
      row.product.productId,
      (row.options ?? [makeSellerOptionCombinationWire({ stockQuantity: row.product.totalStock })]).map(c => ({
        ...c,
      })),
    ]),
  )
  sellerProductDetails = new Map(
    rows.map(row => [
      row.product.productId,
      { ...defaultDetailWire(row.product), ...row.detail },
    ]),
  )
  lastProductsQuery = null
  lastRegisterBody = null
  lastProductUpdateBody = null
}

/** PUT 핸들러가 받은 마지막 요청 본문 — 조회 응답을 그대로 되돌려 보내는지 단언할 때 쓴다. */
export function lastSellerProductUpdateBody(): unknown {
  return lastProductUpdateBody
}

/** 목록 핸들러가 받은 마지막 쿼리 문자열(`?` 제외). 빈 값 제거·반복 파라미터 단언에 쓴다. */
export function lastSellerProductsQuery(): string | null {
  return lastProductsQuery
}

/** 등록 핸들러가 받은 마지막 요청 본문 — 이미지 키·옵션 모양을 단언할 때 쓴다. */
export function lastSellerProductRegisterBody(): unknown {
  return lastRegisterBody
}

/** 핸들러가 반영한 현재 목록 — 테스트가 쓰기 결과를 읽을 때 쓴다. */
export function currentSellerProducts(): SellerProductSummaryWire[] {
  return sellerProducts.map(p => ({ ...p }))
}

// ─── AI 초안(POST /sellers/me/product-drafts/autofill) ─────────────────────────
// BE는 AI 실패도 200 + state로 돌려주고 쿨다운만 429/40402다 — 세 경우를 시나리오로 가른다.
export type ProductDraftAutofillScenario = 'ok' | 'unavailable' | 'cooldown'
let autofillScenario: ProductDraftAutofillScenario = 'ok'
let lastAutofillBody: unknown = null

/** OK 시나리오가 돌려주는 초안 — 카테고리는 MSW 카테고리 트리의 소분류 id다. */
export const AUTOFILL_DRAFT_WIRE = {
  categoryId: leafIdOf('고양이 > 식기/급수기 > 자동 급식기'),
  description: '정해진 시간에 사료를 내보내는 자동 급식기예요. 외출이 잦은 집에 알맞아요.',
  optionGroups: [{ name: '용량', values: ['3L', '5L'] }],
  optionCombinations: [
    { optionValues: ['3L'], additionalPrice: 0, stockQuantity: null },
    { optionValues: ['5L'], additionalPrice: 5000, stockQuantity: null },
  ],
}
export const AUTOFILL_SELLER_NOTICE = '가격과 재고는 직접 입력해 주세요.'

export function seedProductDraftAutofill(scenario: ProductDraftAutofillScenario = 'ok'): void {
  autofillScenario = scenario
  lastAutofillBody = null
}

/** 초안 핸들러가 받은 마지막 요청 본문 — 잠근 값(lockedFields)이 실리는지 단언할 때 쓴다. */
export function lastProductDraftAutofillBody(): unknown {
  return lastAutofillBody
}

const badRequest = (message: string) =>
  HttpResponse.json({ errorCode: 90001, message }, { status: 400 })

const errorAt = (status: number, errorCode: number, message: string) =>
  HttpResponse.json({ errorCode, message }, { status })

// Product.validatePricing / ProductOptions.of 미러. FE는 가격 범위와 그룹을 넘는 옵션값 중복을 미리
// 보지 않고 이 응답 문구로 안내하므로(SCRUM-234의 중복 검증 제거), 그 경로는 이 스텁이 지킨다.
const MIN_REGULAR_PRICE = 100
const MAX_REGULAR_PRICE = 100_000_000

interface ProductWriteBody {
  productName: string
  regularPrice: number
  discountPrice?: number | null
  discountStartAt?: string | null
  discountEndAt?: string | null
  optionGroups?: { name: string; values: string[] }[] | null
  optionCombinations: { optionValues: string[]; additionalPrice: number; stockQuantity: number }[]
}

function priceViolation(body: ProductWriteBody): ReturnType<typeof errorAt> | null {
  const price = () => errorAt(400, 40001, '상품 가격이 올바르지 않습니다.')
  const period = () => errorAt(400, 40002, '할인 기간이 올바르지 않습니다.')
  const { regularPrice, discountPrice, discountStartAt, discountEndAt } = body
  if (regularPrice < MIN_REGULAR_PRICE || regularPrice > MAX_REGULAR_PRICE) return price()
  if (discountPrice != null && (discountPrice < 0 || discountPrice > regularPrice)) return price()
  if (discountPrice != null && !discountStartAt) return period()
  if (discountPrice == null && (discountStartAt || discountEndAt)) return period()
  if (discountStartAt && discountEndAt && discountStartAt > discountEndAt) return period()
  return null
}

function optionViolation(body: ProductWriteBody): ReturnType<typeof errorAt> | null {
  const fail = (message: string) => errorAt(400, 40005, message)
  const groups = body.optionGroups ?? []
  const combinations = body.optionCombinations
  if (combinations.length === 0) return fail('옵션 조합이 비어 있습니다.')
  if (new Set(groups.map(g => g.name)).size !== groups.length) return fail('옵션 그룹명이 중복됩니다.')
  const allValues = groups.flatMap(g => g.values)
  if (new Set(allValues).size !== allValues.length) return fail('옵션값이 중복됩니다.')
  const groupOf = new Map(groups.flatMap((g, i) => g.values.map(v => [v, i] as const)))
  for (const c of combinations) {
    if (c.optionValues.some(v => !groupOf.has(v))) return fail('존재하지 않는 옵션값입니다.')
    if (new Set(c.optionValues.map(v => groupOf.get(v))).size !== groups.length) {
      return fail('조합이 모든 옵션 그룹을 포함하지 않습니다.')
    }
  }
  const signatures = combinations.map(c => [...c.optionValues].sort().join('\u0000'))
  if (new Set(signatures).size !== signatures.length) return fail('옵션 조합이 중복됩니다.')
  return null
}

const productNotFound = () =>
  HttpResponse.json({ errorCode: 40000, message: '상품을 찾을 수 없습니다.' }, { status: 404 })

const activeStock = (productId: string) =>
  (sellerProductOptions.get(productId) ?? []).reduce(
    (sum, c) => sum + (c.isActive ? c.stockQuantity : 0),
    0,
  )

/**
 * Product.applyStockDerivedStatus — ON_SALE + 재고 없음 → OUT_OF_STOCK, OUT_OF_STOCK + 재고 있음 →
 * ON_SALE. SUSPENDED·ENDED는 유지한다. BE는 상태 변경(동기)과 재고 변경(커밋 뒤 비동기) 두 곳에서
 * 이것을 돌린다 — 핸들러는 테스트가 지연에 의존하지 않게 둘 다 즉시 반영한다.
 */
function applyStockDerivedStatus(product: SellerProductSummaryWire): void {
  const stock = activeStock(product.productId)
  product.totalStock = stock
  if (product.saleStatus === 'ON_SALE' && stock === 0) product.saleStatus = 'OUT_OF_STOCK'
  else if (product.saleStatus === 'OUT_OF_STOCK' && stock > 0) product.saleStatus = 'ON_SALE'
}

const sellerProductHandlers = [
  http.get(SELLER_PRODUCTS_URL, ({ request }) => {
    lastProductsQuery = new URL(request.url).search.replace(/^\?/, '')
    const params = new URL(request.url).searchParams
    // 빈 값은 BE가 미입력이 아니라 형식 오류로 거절한다 — 정규화가 새면 테스트가 여기서 터진다.
    // BE가 실제로 거절하는 것은 stock·createdFrom·createdTo·saleStatus·inspectionStatus·sort이고
    // keyword·category는 빈 값을 미입력으로 접는다. 이 스텁은 일부러 더 엄격하게 전부 거절한다 —
    // FE는 어차피 빈 값을 키째 빼므로(캐시 키 통일) 그 규칙이 새는 순간을 여기서 잡는다.
    for (const [key, value] of params.entries()) {
      if (value === '') return badRequest(`${key}: 지원하지 않는 값입니다.`)
    }
    const size = Number(params.get('size') ?? 20)
    const page = Number(params.get('page') ?? 0)
    const totalCount = sellerProducts.length
    const totalPages = Math.ceil(totalCount / size)
    return HttpResponse.json({
      data: {
        products: sellerProducts.slice(page * size, (page + 1) * size),
        totalCount,
        page,
        size,
        totalPages,
        hasNext: page + 1 < totalPages,
      },
    })
  }),
  // 등록 — 201. 재고와 무관하게 ON_SALE/APPROVED/versionNo 1이고, 목록 맨 앞에 꽂힌다(latest = id desc).
  http.post(SELLER_PRODUCTS_URL, async ({ request }) => {
    const body = (await request.json()) as ProductWriteBody
    lastRegisterBody = body
    // 거절은 상태를 바꾸기 전에 — 테스트가 "폼에 남고 목록은 그대로"를 단언한다.
    const rejected = priceViolation(body) ?? optionViolation(body)
    if (rejected) return rejected
    const product = makeSellerProductWire({
      name: body.productName,
      regularPrice: body.regularPrice,
      discountPrice: body.discountPrice ?? null,
      saleStatus: 'ON_SALE',
      inspectionStatus: 'APPROVED',
      totalStock: body.optionCombinations.reduce((sum, c) => sum + c.stockQuantity, 0),
    })
    sellerProducts = [product, ...sellerProducts]
    sellerProductOptions.set(
      product.productId,
      body.optionCombinations.map(c =>
        makeSellerOptionCombinationWire({
          // ProductService: 요청 순서대로 ` / `로 잇고, 빈 이름은 `기본`.
          name: c.optionValues.join(' / ') || '기본',
          additionalPrice: c.additionalPrice,
          stockQuantity: c.stockQuantity,
        }),
      ),
    )
    return HttpResponse.json(
      {
        data: {
          productId: product.productId,
          saleStatus: product.saleStatus,
          inspectionStatus: product.inspectionStatus,
          versionNo: 1,
          createdAt: product.createdAt,
        },
      },
      { status: 201 },
    )
  }),
  // 단건 조회 — 수정 폼 프리필. 없는 상품과 남의 상품을 같은 404/40000으로 가린다.
  // 자격 게이트(403/40004)는 목록·옵션(40006)과 갈리므로 테스트가 server.use로 따로 덮는다.
  http.get(`${SELLER_PRODUCTS_URL}/:productId`, ({ params }) => {
    const detail = sellerProductDetails.get(params['productId'] as string)
    if (!detail) return productNotFound()
    return HttpResponse.json({ data: { ...detail } })
  }),
  http.get(`${SELLER_PRODUCTS_URL}/:productId/options`, ({ params }) => {
    const combinations = sellerProductOptions.get(params['productId'] as string)
    if (!combinations) {
      return HttpResponse.json(
        { errorCode: 40007, message: '조회할 수 없는 상품입니다.' },
        { status: 403 },
      )
    }
    return HttpResponse.json({ data: { optionCombinations: combinations } })
  }),
  // 판매 상태 변경 — ON_SALE/SUSPENDED만 받고, 재고 파생 전이가 같은 요청 안에서 동기로 얹힌다.
  http.patch(`${SELLER_PRODUCTS_URL}/:productId/status`, async ({ params, request }) => {
    const product = sellerProducts.find(p => p.productId === params['productId'])
    if (!product) return productNotFound()
    const { saleStatus } = (await request.json()) as { saleStatus: string }
    if (saleStatus !== 'ON_SALE' && saleStatus !== 'SUSPENDED') {
      return badRequest('판매중과 판매중지만 지정할 수 있습니다.')
    }
    product.saleStatus = saleStatus
    applyStockDerivedStatus(product)
    return HttpResponse.json({
      data: { productId: product.productId, saleStatus: product.saleStatus, updatedAt: '2026-10-07T11:00:00' },
    })
  }),
  http.put(`${SELLER_PRODUCTS_URL}/:productId`, async ({ params, request }) => {
    const product = sellerProducts.find(p => p.productId === params['productId'])
    if (!product) return productNotFound()
    const body = (await request.json()) as {
      categoryId: number
      productName: string
      description?: string | null
      regularPrice: number
      discountPrice?: number | null
      discountStartAt?: string | null
      discountEndAt?: string | null
      thumbnailImageKey: string
      additionalImageKeys?: string[] | null
      detailImageKeys?: string[] | null
    }
    lastProductUpdateBody = body
    product.name = body.productName
    product.regularPrice = body.regularPrice
    product.discountPrice = body.discountPrice ?? null
    product.thumbnailImageKey = body.thumbnailImageKey
    // 이미지 목록은 통째로 교체다 — 다음 프리필이 저장 결과를 그대로 보여야 왕복이 성립한다.
    const detail = sellerProductDetails.get(product.productId)
    if (detail) {
      sellerProductDetails.set(product.productId, {
        ...detail,
        categoryId: body.categoryId,
        productName: body.productName,
        description: body.description ?? null,
        regularPrice: body.regularPrice,
        discountPrice: body.discountPrice ?? null,
        discountStartAt: body.discountStartAt ?? null,
        discountEndAt: body.discountEndAt ?? null,
        thumbnailImageKey: body.thumbnailImageKey,
        additionalImageKeys: body.additionalImageKeys ?? [],
        detailImageKeys: body.detailImageKeys ?? [],
      })
    }
    return HttpResponse.json({
      data: { productId: product.productId, saleStatus: product.saleStatus, updatedAt: '2026-10-07T11:00:00' },
    })
  }),
  // 옵션 재고·판매 여부 변경 — 결과 재고를 0 이상으로 자르고 실제 반영량만 돌려준다.
  http.patch(`${SELLER_PRODUCTS_URL}/:productId/options/:combinationId`, async ({ params, request }) => {
    const productId = params['productId'] as string
    const product = sellerProducts.find(p => p.productId === productId)
    const combinations = sellerProductOptions.get(productId)
    if (!product || !combinations) return productNotFound()
    const combination = combinations.find(
      c => c.optionCombinationId === Number(params['combinationId']),
    )
    if (!combination) return productNotFound()
    const body = (await request.json()) as { stockDelta?: number | null; isActive?: boolean | null }
    if (body.stockDelta == null && body.isActive == null) {
      return badRequest('재고 증감과 판매 여부 중 하나는 보내야 합니다.')
    }
    if (body.stockDelta != null && (body.stockDelta === 0 || Math.abs(body.stockDelta) > 1_000_000)) {
      return badRequest('재고 증감은 0이 아닌 ±1000000 이내여야 합니다.')
    }
    const before = combination.stockQuantity
    if (body.stockDelta != null) combination.stockQuantity = Math.max(before + body.stockDelta, 0)
    if (body.isActive != null) combination.isActive = body.isActive
    applyStockDerivedStatus(product)
    return HttpResponse.json({
      data: {
        combinationId: combination.optionCombinationId,
        stockQuantity: combination.stockQuantity,
        appliedStockDelta: combination.stockQuantity - before,
        isActive: combination.isActive,
        updatedAt: '2026-10-07T11:00:00',
      },
    })
  }),
  // AI 초안 — 저장하지 않는다. 상품명이 비면 BE가 AI보다 먼저 400/90001로 거른다.
  http.post(SELLER_PRODUCT_DRAFT_AUTOFILL_URL, async ({ request }) => {
    const body = (await request.json()) as { productName?: string }
    lastAutofillBody = body
    if (!body.productName?.trim()) return badRequest('상품명을 입력해 주세요.')
    if (autofillScenario === 'cooldown') {
      return HttpResponse.json(
        { errorCode: 40402, message: '잠시 후 다시 시도해 주세요.' },
        { status: 429 },
      )
    }
    if (autofillScenario === 'unavailable') {
      return HttpResponse.json({
        data: {
          state: 'UNAVAILABLE',
          draft: { categoryId: null, description: null, optionGroups: [], optionCombinations: [] },
          fieldStatus: {},
          basis: {},
          sellerNotice: null,
        },
      })
    }
    return HttpResponse.json({
      data: {
        state: 'OK',
        draft: AUTOFILL_DRAFT_WIRE,
        fieldStatus: {
          categoryId: 'FILLED',
          description: 'FILLED',
          optionGroups: 'FILLED',
          regularPrice: 'EMPTY_NOT_ATTEMPTED',
        },
        basis: { description: 'NAME' },
        sellerNotice: AUTOFILL_SELLER_NOTICE,
      },
    })
  }),
  // 카테고리 트리 — api 호스트다(셀러 모듈에는 이 컨트롤러가 없다). 초안 프리필이 categoryId로
  // 소분류를 되살리므로 테스트 시드와 id가 같아야 한다 — products.mock의 트리를 그대로 쓴다.
  http.get(CATEGORIES_URL, () => HttpResponse.json({ data: MOCK_CATEGORY_TREE })),
]

// ─── 셀러 상품 임시저장 (seller 호스트 /sellers/me/product-drafts) ────────────
// BE SellerProductDraftController/ProductDraftService를 비춘다 — 저장은 upsert가 아니라 POST(생성)와
// PUT(통째 덮어쓰기)로 갈리고, 생성만 보관 상한 10건을 본다(422/40401). 없는 초안·남의 초안은 전부
// 404/40400이다. payload(이미지 키 목록·옵션)는 서버가 해석하지 않고 받은 모양 그대로 돌려준다.

export interface SellerProductDraftWire {
  draftId: string
  savedAt: string
  categoryId: number | null
  productName: string | null
  description: string | null
  regularPrice: number | null
  discountPrice: number | null
  discountStartAt: string | null
  discountEndAt: string | null
  thumbnailImageKey: string | null
  additionalImageKeys: string[]
  detailImageKeys: string[]
  optionGroups: { name?: string | null; values: string[] }[]
  optionCombinations: { optionValues: string[]; additionalPrice?: number | null; stockQuantity?: number | null }[]
}

/** BE MAX_PRODUCT_DRAFTS. 생성만 이 상한을 본다. */
export const MAX_PRODUCT_DRAFTS = 10

let productDrafts: SellerProductDraftWire[] = []
let draftIdSeq = 0
let draftSavedAtSeq = 0

export function makeSellerProductDraftWire(
  overrides: Partial<SellerProductDraftWire> = {},
): SellerProductDraftWire {
  draftIdSeq += 1
  return {
    draftId: `01JMSWDRAFT${String(draftIdSeq).padStart(15, '0')}`,
    savedAt: '2026-10-05T09:30:00',
    categoryId: null,
    productName: null,
    description: null,
    regularPrice: null,
    discountPrice: null,
    discountStartAt: null,
    discountEndAt: null,
    thumbnailImageKey: null,
    additionalImageKeys: [],
    detailImageKeys: [],
    optionGroups: [],
    optionCombinations: [],
    ...overrides,
  }
}

/** 최근 저장순(BE findAllLive)으로 세운다 — 준 순서가 그대로 목록 순서다. */
export function seedSellerProductDrafts(rows: SellerProductDraftWire[] = []): void {
  productDrafts = rows.map(row => ({ ...row }))
  draftSavedAtSeq = 0
}

/** 핸들러가 반영한 현재 초안 목록 — 테스트가 저장·삭제 결과를 읽는 창구다. */
export function currentSellerProductDrafts(): SellerProductDraftWire[] {
  return productDrafts.map(row => ({ ...row }))
}

const draftNotFound = () =>
  HttpResponse.json({ errorCode: 40400, message: '임시저장한 상품을 찾을 수 없습니다.' }, { status: 404 })

interface ProductDraftSaveBody {
  categoryId?: number | null
  productName?: string | null
  description?: string | null
  regularPrice?: number | null
  discountPrice?: number | null
  discountStartAt?: string | null
  discountEndAt?: string | null
  thumbnailImageKey?: string | null
  additionalImageKeys?: string[] | null
  detailImageKeys?: string[] | null
  optionGroups?: SellerProductDraftWire['optionGroups'] | null
  optionCombinations?: SellerProductDraftWire['optionCombinations'] | null
}

/** 저장 때마다 시각이 움직여야 "방금 저장"이 참이다 — 초 단위로 하나씩 올린다. */
const nextSavedAt = () => {
  draftSavedAtSeq += 1
  return `2026-10-20T10:${String(draftSavedAtSeq).padStart(2, '0')}:00`
}

/** 보내지 않은 필드는 "유지"가 아니라 "비움"이다(BE ProductDraft.overwrite). */
function draftFrom(draftId: string, body: ProductDraftSaveBody, savedAt: string): SellerProductDraftWire {
  return {
    draftId,
    savedAt,
    categoryId: body.categoryId ?? null,
    productName: body.productName ?? null,
    description: body.description ?? null,
    regularPrice: body.regularPrice ?? null,
    discountPrice: body.discountPrice ?? null,
    discountStartAt: body.discountStartAt ?? null,
    discountEndAt: body.discountEndAt ?? null,
    thumbnailImageKey: body.thumbnailImageKey ?? null,
    additionalImageKeys: body.additionalImageKeys ?? [],
    detailImageKeys: body.detailImageKeys ?? [],
    optionGroups: body.optionGroups ?? [],
    optionCombinations: body.optionCombinations ?? [],
  }
}

const productDraftHandlers = [
  http.get(SELLER_PRODUCT_DRAFTS_URL, () =>
    HttpResponse.json({
      data: {
        items: productDrafts.map(d => ({
          draftId: d.draftId,
          productName: d.productName,
          savedAt: d.savedAt,
        })),
        totalCount: productDrafts.length,
      },
    }),
  ),
  // 생성 — 201. 상한을 넘기면 422/40401이고 목록은 그대로다.
  http.post(SELLER_PRODUCT_DRAFTS_URL, async ({ request }) => {
    if (productDrafts.length >= MAX_PRODUCT_DRAFTS) {
      return errorAt(422, 40401, '임시저장은 최대 10개까지 보관할 수 있습니다.')
    }
    const body = (await request.json()) as ProductDraftSaveBody
    draftIdSeq += 1
    const created = draftFrom(
      `01JMSWDRAFT${String(draftIdSeq).padStart(15, '0')}`,
      body,
      nextSavedAt(),
    )
    productDrafts = [created, ...productDrafts]
    return HttpResponse.json(
      { data: { draftId: created.draftId, savedAt: created.savedAt } },
      { status: 201 },
    )
  }),
  http.get(`${SELLER_PRODUCT_DRAFTS_URL}/:draftId`, ({ params }) => {
    const draft = productDrafts.find(d => d.draftId === params['draftId'])
    if (!draft) return draftNotFound()
    return HttpResponse.json({ data: { ...draft } })
  }),
  // 덮어쓰기 — 상한을 보지 않는다. 저장순이 바뀌므로 목록 맨 앞으로 올라온다.
  http.put(`${SELLER_PRODUCT_DRAFTS_URL}/:draftId`, async ({ params, request }) => {
    const draftId = params['draftId'] as string
    if (!productDrafts.some(d => d.draftId === draftId)) return draftNotFound()
    const body = (await request.json()) as ProductDraftSaveBody
    const saved = draftFrom(draftId, body, nextSavedAt())
    productDrafts = [saved, ...productDrafts.filter(d => d.draftId !== draftId)]
    return HttpResponse.json({ data: { draftId, savedAt: saved.savedAt } })
  }),
  http.delete(`${SELLER_PRODUCT_DRAFTS_URL}/:draftId`, ({ params }) => {
    const draftId = params['draftId'] as string
    if (!productDrafts.some(d => d.draftId === draftId)) return draftNotFound()
    productDrafts = productDrafts.filter(d => d.draftId !== draftId)
    return new HttpResponse(null, { status: 204 })
  }),
]

// ─── 택배사 마스터 (seller 호스트 /sellers/couriers) ──────────────────────────
// BE 시드 그대로의 대문자 코드와 서버 정렬(courierName 오름차순 → courierCode 오름차순)을 재현한다.
// FE가 코드를 소문자로 바꾸거나 자체 정렬을 끼우는 회귀를 테스트가 이 순서로 잡는다.

export interface CourierWire {
  courierCode: string
  courierName: string
  trackingFormatPattern: string | null
}

/** V27 시드와 같은 5종. 정렬은 BE 쿼리와 같은 한국어 이름 오름차순이다. */
export const DEFAULT_COURIERS: CourierWire[] = [
  { courierCode: 'CJ', courierName: 'CJ대한통운', trackingFormatPattern: '^\\d{10,12}$' },
  { courierCode: 'LOGEN', courierName: '로젠택배', trackingFormatPattern: null },
  { courierCode: 'LOTTE', courierName: '롯데택배', trackingFormatPattern: null },
  { courierCode: 'POST', courierName: '우체국택배', trackingFormatPattern: '^\\d{13}$' },
  { courierCode: 'HANJIN', courierName: '한진택배', trackingFormatPattern: null },
]

let couriers: CourierWire[] = DEFAULT_COURIERS

/** 인자 없이 부르면 기본 5종으로 되돌린다. */
export function seedCouriers(rows: CourierWire[] = DEFAULT_COURIERS): void {
  couriers = rows.map(row => ({ ...row }))
}

const courierHandlers = [
  http.get(SELLER_COURIERS_URL, () =>
    HttpResponse.json({ data: { items: couriers.map(row => ({ ...row })) } }),
  ),
]

// ─── 셀러 주문 (seller 호스트 /sellers/me/orders) ─────────────────────────────
// 목록은 "FE가 무엇을 보냈는가"를 기록하고 시드한 주문을 세그먼트로만 걸러 돌려준다 — 키워드·날짜
// 필터링은 BE 소관이고 FE의 책임은 파라미터를 정확히 보내는 것이라, 테스트는
// lastSellerOrdersQuery()로 쿼리 문자열을 단언한다. 세그먼트만 실제로 거른다: 한 세그먼트가 상태
// 여러 개를 묶는다는 사실(awaiting-dispatch = PREPARING·DISPATCH_PENDING)이 FE 라벨의 근거라
// 그 매핑이 어긋나면 테스트가 잡아야 한다.
//
// 쓰기는 be SellerOrderService의 전이 규칙을 그대로 비춘다 — 거절 코드(50004·50005·50302·50301)가
// 화면 문구의 근거이고, 상태를 바꿔 목록·상세 재조회에 반영한다.

export interface SellerOrderShipmentWire {
  courierCode: string
  courierName: string
  trackingNumber: string
  dispatchedAt: string | null
  deliveredAt: string | null
  lastTrackingStatus: string | null
}

export interface SellerOrderClaimWire {
  claimId: string
  claimType: 'CANCEL' | 'RETURN' | 'EXCHANGE'
  status:
    | 'CLAIM_REQUESTED'
    | 'COLLECTING'
    | 'APPROVED'
    | 'REJECTED'
    | 'ADMIN_OVERRIDDEN'
    | 'REFUND_FAILED'
    | 'WITHDRAWN'
}

export interface SellerOrderLineWire {
  orderItemId: number
  productId: string
  productName: string
  thumbnailUrl: string | null
  optionName: string
  quantity: number
  unitPrice: number
  discountAllocatedAmount: number
  itemStatus: 'ORDERED' | 'CANCELLED' | 'RETURN_REQUESTED' | 'RETURNED' | 'EXCHANGE_REQUESTED'
}

/** be OrderStatus 8종 그대로. PENDING_PAYMENT는 목록 응답에 나오지 않지만 타입에서 빼지 않는다. */
export type OrderStatusWire =
  | 'PENDING_PAYMENT'
  | 'PAID'
  | 'PREPARING'
  | 'DISPATCH_PENDING'
  | 'SHIPPING'
  | 'DELIVERED'
  | 'PURCHASE_CONFIRMED'
  | 'CANCELLED'

export interface SellerOrderWire {
  orderId: string
  orderGroupId: string
  status: OrderStatusWire
  orderedAt: string
  buyerNickname: string
  recipientName: string
  contactNumber: string
  zipCode: string
  baseAddress: string
  detailAddress: string | null
  deliveryMemo: string | null
  itemCount: number
  totalProductAmount: number
  sellerShippingFee: number
  allocatedCouponDiscount: number
  payableAmount: number
  purchaseConfirmDueAt: string | null
  shipment: SellerOrderShipmentWire | null
  activeClaim: SellerOrderClaimWire | null
}

/** be SellerOrderStatusFilter 미러 — all은 PENDING_PAYMENT를 뺀 전부다. */
const SEGMENT_STATUSES: Record<string, OrderStatusWire[]> = {
  all: ['PAID', 'PREPARING', 'DISPATCH_PENDING', 'SHIPPING', 'DELIVERED', 'PURCHASE_CONFIRMED', 'CANCELLED'],
  new: ['PAID'],
  'awaiting-dispatch': ['PREPARING', 'DISPATCH_PENDING'],
  shipping: ['SHIPPING'],
  delivered: ['DELIVERED', 'PURCHASE_CONFIRMED'],
  cancelled: ['CANCELLED'],
}

let sellerOrders: SellerOrderWire[] = []
let sellerOrderLines = new Map<string, SellerOrderLineWire[]>()
let lastOrdersQuery: string | null = null
let lastShipmentBody: unknown = null
let orderSeq = 0
let orderItemSeq = 0
let shipmentIdSeq = 0

export function makeSellerOrderWire(overrides: Partial<SellerOrderWire> = {}): SellerOrderWire {
  orderSeq += 1
  return {
    orderId: `01JMSWORDER${String(orderSeq).padStart(15, '0')}`,
    orderGroupId: `01JMSWGROUP${String(orderSeq).padStart(15, '0')}`,
    status: 'PAID',
    orderedAt: '2026-10-24T10:00:00',
    buyerNickname: `구매자${orderSeq}`,
    recipientName: '김보호',
    contactNumber: '01012345678',
    zipCode: '06236',
    baseAddress: '서울 강남구 테헤란로 1',
    detailAddress: '101동 1001호',
    deliveryMemo: null,
    itemCount: 1,
    totalProductAmount: 30000,
    sellerShippingFee: 3000,
    allocatedCouponDiscount: 0,
    payableAmount: 33000,
    purchaseConfirmDueAt: null,
    shipment: null,
    activeClaim: null,
    ...overrides,
  }
}

export function makeSellerOrderLineWire(overrides: Partial<SellerOrderLineWire> = {}): SellerOrderLineWire {
  orderItemSeq += 1
  return {
    orderItemId: orderItemSeq,
    productId: `01JMSWPRODUCT${String(orderItemSeq).padStart(13, '0')}`,
    productName: `목업 상품 ${orderItemSeq}`,
    thumbnailUrl: null,
    optionName: '기본',
    quantity: 1,
    unitPrice: 30000,
    discountAllocatedAmount: 0,
    itemStatus: 'ORDERED',
    ...overrides,
  }
}

/** 테스트마다 주문과 품목 라인을 세운다. `items`를 주지 않은 주문은 기본 라인 하나로 채운다. */
export function seedSellerOrders(
  rows: { order: SellerOrderWire; items?: SellerOrderLineWire[] }[] = [],
): void {
  sellerOrders = rows.map(row => ({ ...row.order }))
  sellerOrderLines = new Map(
    rows.map(row => [row.order.orderId, (row.items ?? [makeSellerOrderLineWire()]).map(item => ({ ...item }))]),
  )
  lastOrdersQuery = null
  lastShipmentBody = null
}

/** 목록 핸들러가 받은 마지막 쿼리 문자열(`?` 제외). 빈 값 제거·세그먼트 어휘 단언에 쓴다. */
export function lastSellerOrdersQuery(): string | null {
  return lastOrdersQuery
}

/** 송장 등록 핸들러가 받은 마지막 요청 본문 — courierCode를 그대로 보내는지 단언할 때 쓴다. */
export function lastShipmentRegisterBody(): unknown {
  return lastShipmentBody
}

/** 핸들러가 반영한 현재 주문 목록 — 테스트가 전이 결과를 읽을 때 쓴다. */
export function currentSellerOrders(): SellerOrderWire[] {
  return sellerOrders.map(order => ({ ...order }))
}

const orderNotFound = () =>
  HttpResponse.json({ errorCode: 50000, message: '주문을 찾을 수 없습니다.' }, { status: 404 })

const conflict = (errorCode: number, message: string) =>
  HttpResponse.json({ errorCode, message }, { status: 409 })

const sellerOrderHandlers = [
  http.get(SELLER_ORDERS_URL, ({ request }) => {
    const url = new URL(request.url)
    lastOrdersQuery = url.search.replace(/^\?/, '')
    const params = url.searchParams
    // 빈 값은 BE가 미입력이 아니라 형식 오류로 거절하는 자리가 있다(`?status=`·`?orderedFrom=`) —
    // 정규화가 새면 테스트가 여기서 터진다. 스텁은 일부러 전부 거절한다(FE는 어차피 키째 뺀다).
    for (const [key, value] of params.entries()) {
      if (value === '') return badRequest(`${key}: 지원하지 않는 값입니다.`)
    }
    const segment = params.get('status') ?? 'all'
    const statuses = SEGMENT_STATUSES[segment]
    if (!statuses) return badRequest('status: 지원하지 않는 값입니다.')
    const matched = sellerOrders.filter(order => statuses.includes(order.status))
    const size = Number(params.get('size') ?? 20)
    const page = Number(params.get('page') ?? 0)
    const totalCount = matched.length
    const totalPages = Math.ceil(totalCount / size)
    return HttpResponse.json({
      data: {
        orders: matched.slice(page * size, (page + 1) * size),
        totalCount,
        page,
        size,
        totalPages,
        hasNext: page + 1 < totalPages,
      },
    })
  }),
  // 상세 — 주문 단위 필드는 목록 행과 같고 items가 더 붙는다. 남의 주문도 같은 404로 가린다.
  http.get(`${SELLER_ORDERS_URL}/:orderPublicId`, ({ params }) => {
    const orderId = params['orderPublicId'] as string
    const order = sellerOrders.find(row => row.orderId === orderId)
    if (!order) return orderNotFound()
    return HttpResponse.json({ data: { ...order, items: sellerOrderLines.get(orderId) ?? [] } })
  }),
  // 발주 확인 — PAID만 받는다(그 밖은 409/50004). 204.
  http.post(`${SELLER_ORDERS_URL}/:orderPublicId/accept`, ({ params }) => {
    const order = sellerOrders.find(row => row.orderId === params['orderPublicId'])
    if (!order) return orderNotFound()
    if (order.status !== 'PAID') {
      return conflict(50004, '결제완료 상태의 주문만 발주 확인할 수 있습니다.')
    }
    order.status = 'PREPARING'
    return new HttpResponse(null, { status: 204 })
  }),
  // 송장 등록 — 최초 한 번뿐이다(재등록 409/50302). PREPARING에서 불러도 2단 전이해 SHIPPING이 된다.
  http.post(`${SELLER_ORDERS_URL}/:orderPublicId/shipment`, async ({ params, request }) => {
    const order = sellerOrders.find(row => row.orderId === params['orderPublicId'])
    if (!order) return orderNotFound()
    const body = (await request.json()) as { courierCode: string; trackingNumber: string }
    lastShipmentBody = body
    if (order.shipment != null) {
      return conflict(50302, '이미 송장이 등록되어 있습니다.')
    }
    if (order.status !== 'PREPARING' && order.status !== 'DISPATCH_PENDING') {
      return conflict(50005, '발송 대기 상태의 주문만 발송 처리할 수 있습니다.')
    }
    // 택배사 코드는 정확 일치다 — 화면이 대소문자를 바꾸면 여기서 404/50303으로 터진다.
    const courier = couriers.find(row => row.courierCode === body.courierCode)
    if (!courier) {
      return HttpResponse.json(
        { errorCode: 50303, message: '택배사를 찾을 수 없습니다.' },
        { status: 404 },
      )
    }
    if (courier.trackingFormatPattern && !new RegExp(courier.trackingFormatPattern).test(body.trackingNumber)) {
      return errorAt(400, 50304, '송장번호 형식이 올바르지 않습니다.')
    }
    shipmentIdSeq += 1
    const dispatchedAt = '2026-10-24T14:00:00'
    order.status = 'SHIPPING'
    order.shipment = {
      courierCode: courier.courierCode,
      courierName: courier.courierName,
      trackingNumber: body.trackingNumber,
      dispatchedAt,
      deliveredAt: null,
      lastTrackingStatus: null,
    }
    return HttpResponse.json(
      { data: { shipmentId: shipmentIdSeq, dispatchedAt, orderStatus: order.status } },
      { status: 201 },
    )
  }),
  // 배송 완료 — be `OrderDeliveryService.complete`의 거절 순서를 그대로 비춘다. 50002가 아니다:
  // 최초 배송 행이 없으면 404/50300이고, 이미 배송완료거나 조건부 UPDATE(SHIPPING→DELIVERED)가
  // 실패하면 **둘 다** 409/50301이다. 스텁이 상태만 보고 50002를 주면 화면 문구의 근거가 서버와
  // 갈라져, 틀린 문구를 테스트가 통과시킨다. 성공은 204.
  http.post(`${SELLER_ORDERS_URL}/:orderPublicId/delivery-complete`, ({ params }) => {
    const order = sellerOrders.find(row => row.orderId === params['orderPublicId'])
    if (!order) return orderNotFound()
    if (!order.shipment) {
      return errorAt(404, 50300, '배송 정보를 찾을 수 없습니다.')
    }
    if (order.shipment.deliveredAt != null || order.status !== 'SHIPPING') {
      return conflict(50301, '이미 배송완료 처리된 배송입니다.')
    }
    const deliveredAt = '2026-10-25T09:00:00'
    order.status = 'DELIVERED'
    order.purchaseConfirmDueAt = '2026-11-01T09:00:00'
    order.shipment = { ...order.shipment, deliveredAt }
    return new HttpResponse(null, { status: 204 })
  }),
]

// ─── 셀러 클레임 (seller 호스트 /sellers/me/claims) ──────────────────────────
// BE SellerClaimController 8경로의 스텁. 상태 전이와 실패 계약을 도메인(Claim.kt·
// ClaimCollectionService.kt)과 같은 판정으로 재현한다 — FE가 "지금 할 수 있는 처리"를 행과 이력에서
// 어떻게 가르는지가 이 전이에 달려 있다.
//
// 응답에 **collectionStartedAt을 싣지 않는다**(BE SellerClaimSummaryResponse에 그 필드가 없다).
// 스텁은 내부 상태로만 들고 상세 이력의 COLLECTION_STARTED로만 드러낸다 — FE가 목록 행에서 회수
// 단계를 단정하는 회귀를 이 모양이 잡는다.

export const SELLER_CLAIMS_URL = `${sellerBase}/sellers/me/claims`

type ClaimTypeWire = 'CANCEL' | 'RETURN' | 'EXCHANGE'
type ClaimStatusWire =
  | 'CLAIM_REQUESTED'
  | 'COLLECTING'
  | 'APPROVED'
  | 'REJECTED'
  | 'ADMIN_OVERRIDDEN'
  | 'REFUND_FAILED'
  | 'WITHDRAWN'
type RefundStatusWire = 'NONE' | 'REQUESTED' | 'DONE' | 'REFUND_FAILED'
type PendingStageWire =
  | 'DECISION_PENDING'
  | 'COLLECTION_INVOICE_PENDING'
  | 'COLLECTION_COMPLETION_PENDING'
  | 'RESHIP_PENDING'

export interface ClaimWire {
  claimPublicId: string
  orderPublicId: string
  claimType: ClaimTypeWire
  reasonCode: string | null
  /** SCRUM-273(PR #150) 머지 전에는 **키 자체가 없다** — undefined면 직렬화에서 뺀다. */
  reasonLabel?: string | null
  reasonDetail: string | null
  status: ClaimStatusWire
  refundStatus: RefundStatusWire | null
  sellerApprovalStatus: 'REQUESTED' | 'APPROVED' | 'REJECTED' | null
  settlementStatus: 'PENDING' | 'SETTLED' | null
  returnCostBearer: 'BUYER' | 'SELLER' | null
  returnShippingFee: number | null
  dispatched: boolean
  refundAmount: number
  productNames: string[]
  itemCount: number
  rejectionReason: string | null
  sellerMemo: string | null
  requestedAt: string | null
  autoApproveDueAt: string | null
  approvedAt: string | null
  resolvedAt: string | null
  /** 응답에 없는 내부 상태. 회수 단계 판정과 이력 조립에만 쓴다. */
  collectionStartedAt: string | null
  /** 상세 전용 — 주문·품목(목록 응답에는 없다). */
  order: ClaimOrderWire
  items: ClaimItemWire[]
}

export interface ClaimOrderWire {
  orderStatus: 'PAID' | 'PREPARING' | 'DISPATCH_PENDING' | 'SHIPPING' | 'DELIVERED'
  orderedAt: string
  sellerShippingFee: number
  recipientName: string
  contactNumber: string
  zipCode: string
  baseAddress: string
  detailAddress: string | null
  deliveryMemo: string | null
}

export interface ClaimItemWire {
  orderItemId: number
  productName: string
  optionName: string
  quantity: number
  unitPrice: number
  refundAmount: number
  itemStatus: 'ORDERED' | 'CANCELLED' | 'RETURN_REQUESTED' | 'RETURNED' | 'EXCHANGE_REQUESTED'
}

const claimOrder = (overrides: Partial<ClaimOrderWire> = {}): ClaimOrderWire => ({
  orderStatus: 'DELIVERED',
  orderedAt: '2026-10-20T10:00:00',
  sellerShippingFee: 3000,
  recipientName: '김집사',
  contactNumber: '010-1234-5678',
  zipCode: '06236',
  baseAddress: '서울 강남구 테헤란로 1',
  detailAddress: '101동 1001호',
  deliveryMemo: '문 앞에 놓아 주세요',
  ...overrides,
})

/**
 * 기본 시드 4건 — 셀러가 할 일이 서로 다른 단계에 하나씩 놓인다.
 * `reasonLabel`은 고정 어휘 전환 전 상태를 재현하려고 **일부러 비운다**(claim-2만 실어 둔다).
 */
export const DEFAULT_CLAIMS: ClaimWire[] = [
  {
    claimPublicId: 'claim-cancel-1',
    orderPublicId: '01JC0RDER0000000000000001',
    claimType: 'CANCEL',
    reasonCode: 'CHANGE_OF_MIND',
    reasonDetail: '색상을 잘못 골랐어요',
    status: 'CLAIM_REQUESTED',
    refundStatus: 'NONE',
    sellerApprovalStatus: 'REQUESTED',
    settlementStatus: 'PENDING',
    returnCostBearer: null,
    returnShippingFee: null,
    dispatched: false,
    refundAmount: 25000,
    productNames: ['동결건조 간식 100g'],
    itemCount: 1,
    rejectionReason: null,
    sellerMemo: null,
    requestedAt: '2026-10-24T10:00:00',
    autoApproveDueAt: '2026-10-26T10:00:00',
    approvedAt: null,
    resolvedAt: null,
    collectionStartedAt: null,
    order: claimOrder({ orderStatus: 'PREPARING', deliveryMemo: null }),
    items: [
      {
        orderItemId: 11,
        productName: '동결건조 간식 100g',
        optionName: '기본',
        quantity: 1,
        unitPrice: 25000,
        refundAmount: 25000,
        itemStatus: 'ORDERED',
      },
    ],
  },
  {
    claimPublicId: 'claim-return-1',
    orderPublicId: '01JC0RDER0000000000000002',
    claimType: 'RETURN',
    reasonCode: 'DEFECTIVE',
    reasonLabel: '상품이 파손되었거나 불량이에요',
    reasonDetail: '포장을 열자마자 급식기 뚜껑이 깨져 있었어요',
    status: 'CLAIM_REQUESTED',
    refundStatus: 'NONE',
    sellerApprovalStatus: 'REQUESTED',
    settlementStatus: 'PENDING',
    returnCostBearer: null,
    returnShippingFee: 3000,
    dispatched: true,
    refundAmount: 59000,
    productNames: ['자동 급식기 5L'],
    itemCount: 1,
    rejectionReason: null,
    sellerMemo: '불량 사진 확인됨',
    requestedAt: '2026-10-23T15:20:00',
    autoApproveDueAt: '2026-10-25T15:20:00',
    approvedAt: null,
    resolvedAt: null,
    collectionStartedAt: null,
    order: claimOrder(),
    items: [
      {
        orderItemId: 21,
        productName: '자동 급식기 5L',
        optionName: '화이트 / 5L',
        quantity: 1,
        unitPrice: 59000,
        refundAmount: 59000,
        itemStatus: 'RETURN_REQUESTED',
      },
    ],
  },
  {
    claimPublicId: 'claim-return-2',
    orderPublicId: '01JC0RDER0000000000000003',
    claimType: 'RETURN',
    reasonCode: 'CHANGE_OF_MIND',
    reasonDetail: null,
    status: 'COLLECTING',
    refundStatus: 'NONE',
    sellerApprovalStatus: 'APPROVED',
    settlementStatus: 'PENDING',
    returnCostBearer: 'BUYER',
    returnShippingFee: 3000,
    dispatched: true,
    refundAmount: 18000,
    productNames: ['캣닢 장난감 세트'],
    itemCount: 1,
    rejectionReason: null,
    sellerMemo: null,
    requestedAt: '2026-10-22T09:00:00',
    autoApproveDueAt: '2026-10-24T09:00:00',
    approvedAt: '2026-10-22T11:00:00',
    resolvedAt: null,
    // 회수 송장이 등록된 건 — 다음 할 일은 회수 완료 처리다.
    collectionStartedAt: '2026-10-22T12:00:00',
    order: claimOrder({ detailAddress: null }),
    items: [
      {
        orderItemId: 31,
        productName: '캣닢 장난감 세트',
        optionName: '기본',
        quantity: 2,
        unitPrice: 9000,
        refundAmount: 18000,
        itemStatus: 'RETURN_REQUESTED',
      },
    ],
  },
  {
    claimPublicId: 'claim-exchange-1',
    orderPublicId: '01JC0RDER0000000000000004',
    claimType: 'EXCHANGE',
    reasonCode: 'WRONG_ITEM',
    reasonDetail: '주문과 다른 색이 왔어요',
    status: 'APPROVED',
    refundStatus: 'NONE',
    sellerApprovalStatus: 'APPROVED',
    settlementStatus: 'PENDING',
    returnCostBearer: 'SELLER',
    returnShippingFee: 3000,
    dispatched: true,
    // **교환에도 0이 아닌 환불액이 실린다.** 요청 시점 계산기(ClaimAmountCalculator)가 유형을 보지
    // 않고 claim_items.refund_amount를 채우고 조회가 그 합을 그대로 내리기 때문이다 — 집행만 교환을
    // 건너뛴다. 0으로 두면 "환불 없음"으로 접는 화면과 품목 금액이 어긋나도 테스트가 알아채지 못한다.
    refundAmount: 120000,
    productNames: ['캣타워 그레이'],
    itemCount: 1,
    rejectionReason: null,
    sellerMemo: null,
    requestedAt: '2026-10-21T17:45:00',
    autoApproveDueAt: '2026-10-23T17:45:00',
    approvedAt: '2026-10-21T18:00:00',
    resolvedAt: null,
    collectionStartedAt: '2026-10-21T19:00:00',
    order: claimOrder(),
    items: [
      {
        orderItemId: 41,
        productName: '캣타워 그레이',
        optionName: '그레이',
        quantity: 1,
        unitPrice: 120000,
        refundAmount: 120000,
        itemStatus: 'EXCHANGE_REQUESTED',
      },
    ],
  },
]

let claims: ClaimWire[] = DEFAULT_CLAIMS.map(row => ({ ...row }))
let lastClaimsQuery: string | null = null

/**
 * 처리 경로별 수신 요청 수. **"보내지 않는다"는 단언에 필요하다** — 결과 상태만 보면 요청이 나가서
 * 서버가 거절한 경우와 애초에 나가지 않은 경우가 구별되지 않는다(둘 다 상태가 그대로다). 그래서
 * 선검증이 막았다는 것은 0회로, 더블클릭이 한 번만 나갔다는 것은 1회로 단언한다.
 */
export type ClaimMutationPath = 'approve' | 'reject' | 'memo' | 'collection' | 'collection-complete' | 'reship'
const claimRequestCounts = new Map<ClaimMutationPath, number>()

const countClaimRequest = (path: ClaimMutationPath): void => {
  claimRequestCounts.set(path, (claimRequestCounts.get(path) ?? 0) + 1)
}

/** 인자 없이 부르면 기본 4건으로 되돌린다. */
export function seedClaims(rows: ClaimWire[] = DEFAULT_CLAIMS): void {
  claims = rows.map(row => ({ ...row, items: row.items.map(item => ({ ...item })) }))
  lastClaimsQuery = null
  claimRequestCounts.clear()
}

/** 목록 핸들러가 받은 마지막 쿼리스트링 — 반복 파라미터·빈 값 제거를 단언할 때 쓴다. */
export function lastSellerClaimsQuery(): string | null {
  return lastClaimsQuery
}

/** 해당 처리 경로가 받은 요청 수(seedClaims가 0으로 되돌린다). */
export function claimRequestCount(path: ClaimMutationPath): number {
  return claimRequestCounts.get(path) ?? 0
}

/** 핸들러가 반영한 현재 목록 — 테스트가 처리 결과를 읽을 때 쓴다. */
export function currentClaims(): ClaimWire[] {
  return claims.map(row => ({ ...row }))
}

/**
 * 한 건만 서버 쪽에서 바꾼다 — "화면이 보고 있는 동안 다른 작업자가 먼저 처리했다"를 만드는 데 쓴다.
 * `seedClaims`와 달리 요청 수를 지우지 않으므로, 그 상황에서도 요청 횟수를 그대로 단언할 수 있다.
 */
export function updateClaimRow(claimPublicId: string, patch: Partial<ClaimWire>): void {
  claims = claims.map(row => (row.claimPublicId === claimPublicId ? { ...row, ...patch } : row))
}

const SUMMARY_OMITTED = ['collectionStartedAt', 'order', 'items'] as const

const claimSummary = (row: ClaimWire) => {
  const rest: Record<string, unknown> = { ...row }
  // 응답에 없는 필드는 싣지 않는다(목록 행에는 회수 시작 시각도 주문·품목도 없다).
  for (const key of SUMMARY_OMITTED) delete rest[key]
  // reasonLabel이 undefined면 키째 뺀다(고정 어휘 전환 전 응답).
  if (rest['reasonLabel'] === undefined) delete rest['reasonLabel']
  return rest
}

/** SellerClaimDetailResult.historyOf 미러 — 시각 오름차순, 같은 시각은 사건 선언 순서. */
const HISTORY_ORDER = [
  'REQUESTED',
  'COLLECTION_STARTED',
  'APPROVED',
  'CLAWBACK_DEPOSITED',
  'REJECTED',
  'WITHDRAWN',
  'ADMIN_OVERRIDDEN',
  'REFUNDED',
  'RESOLVED',
] as const

function claimHistory(row: ClaimWire): { event: string; occurredAt: string }[] {
  const resolvedEvent =
    row.refundStatus === 'DONE'
      ? 'REFUNDED'
      : row.status === 'REJECTED'
        ? 'REJECTED'
        : row.status === 'WITHDRAWN'
          ? 'WITHDRAWN'
          : row.status === 'ADMIN_OVERRIDDEN'
            ? 'ADMIN_OVERRIDDEN'
            : 'RESOLVED'
  const entries: { event: string; occurredAt: string }[] = []
  if (row.requestedAt) entries.push({ event: 'REQUESTED', occurredAt: row.requestedAt })
  if (row.collectionStartedAt) {
    entries.push({ event: 'COLLECTION_STARTED', occurredAt: row.collectionStartedAt })
  }
  if (row.approvedAt) entries.push({ event: 'APPROVED', occurredAt: row.approvedAt })
  if (row.resolvedAt) entries.push({ event: resolvedEvent, occurredAt: row.resolvedAt })
  return entries.sort(
    (a, b) =>
      a.occurredAt.localeCompare(b.occurredAt) ||
      HISTORY_ORDER.indexOf(a.event as (typeof HISTORY_ORDER)[number]) -
        HISTORY_ORDER.indexOf(b.event as (typeof HISTORY_ORDER)[number]),
  )
}

/** SellerClaimQueryAdapter.pendingStage 미러. */
function inPendingStage(row: ClaimWire, stage: PendingStageWire): boolean {
  switch (stage) {
    case 'DECISION_PENDING':
      return row.status === 'CLAIM_REQUESTED'
    case 'COLLECTION_INVOICE_PENDING':
      return row.status === 'COLLECTING' && row.collectionStartedAt == null
    case 'COLLECTION_COMPLETION_PENDING':
      return row.status === 'COLLECTING' && row.collectionStartedAt != null
    case 'RESHIP_PENDING':
      return (
        row.status === 'APPROVED' &&
        row.claimType === 'EXCHANGE' &&
        row.collectionStartedAt != null &&
        row.resolvedAt == null
      )
  }
}

const claimNotFound = () =>
  errorAt(404, 50400, '클레임을 찾을 수 없습니다.')

/**
 * ClaimStatus.canTransitionTo 미러. 셀러 판단 축(sellerApprovalStatus)만 보고 통과시키면 안 된다 —
 * 도메인은 requireSellerDecisionPending 다음에 transitionTo로 **상태 축도** 검사한다. 두 축이
 * 갈라지는 자리가 실제로 있다: 구매자 철회(withdrawByBuyer)는 status만 WITHDRAWN으로 바꾸고
 * sellerApprovalStatus는 REQUESTED로 남겨 둔다. 그 건에 승인·거부를 보내면 BE는 409/50402인데
 * 판단 축만 보는 스텁은 성공시켜, 화면이 상태 축을 보지 않게 되는 회귀를 통과시킨다.
 */
const CLAIM_TRANSITIONS: Record<ClaimStatusWire, ClaimStatusWire[]> = {
  CLAIM_REQUESTED: ['APPROVED', 'REJECTED', 'COLLECTING', 'WITHDRAWN', 'ADMIN_OVERRIDDEN'],
  COLLECTING: ['APPROVED', 'REJECTED', 'ADMIN_OVERRIDDEN'],
  APPROVED: ['REFUND_FAILED', 'ADMIN_OVERRIDDEN'],
  REFUND_FAILED: ['APPROVED', 'ADMIN_OVERRIDDEN'],
  REJECTED: [],
  WITHDRAWN: [],
  ADMIN_OVERRIDDEN: [],
}

const canTransition = (from: ClaimStatusWire, to: ClaimStatusWire): boolean =>
  CLAIM_TRANSITIONS[from].includes(to)

const invalidTransition = () =>
  errorAt(409, 50402, '허용되지 않은 클레임 상태 전이입니다.')

const CLAIM_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

const claimHandlers = [
  http.get(SELLER_CLAIMS_URL, ({ request }) => {
    const url = new URL(request.url)
    lastClaimsQuery = url.search
    // 값이 빈 파라미터와 `k[]=` 직렬화는 BE가 400으로 거절한다 — 스텁도 같이 거절해 회귀를 잡는다.
    for (const [key, value] of url.searchParams.entries()) {
      if (key.endsWith('[]')) return badRequest(`${key}: 지원하지 않는 값입니다.`)
      if (value === '') return badRequest(`${key}: 지원하지 않는 값입니다.`)
    }
    const types = url.searchParams.getAll('claimType') as ClaimTypeWire[]
    const statuses = url.searchParams.getAll('status') as ClaimStatusWire[]
    const refundStatuses = url.searchParams.getAll('refundStatus') as RefundStatusWire[]
    const stages = url.searchParams.getAll('pendingStage') as PendingStageWire[]
    const from = url.searchParams.get('requestedFrom')
    const to = url.searchParams.get('requestedTo')
    if ((from && !CLAIM_DATE_PATTERN.test(from)) || (to && !CLAIM_DATE_PATTERN.test(to))) {
      return badRequest('requestedFrom: 날짜 형식이 올바르지 않습니다. (YYYY-MM-DD)')
    }
    if (from && to && from > to) return badRequest('요청일 시작일은 종료일보다 늦을 수 없습니다.')
    const page = Number(url.searchParams.get('page') ?? '0')
    const size = Number(url.searchParams.get('size') ?? '20')

    // 유형 축을 뺀 나머지 필터 — counts가 이 집합을 센다(BE countByClaimType과 같은 기준).
    const withoutType = claims.filter(row => {
      if (statuses.length > 0 && !statuses.includes(row.status)) return false
      if (refundStatuses.length > 0 && (row.refundStatus == null || !refundStatuses.includes(row.refundStatus))) {
        return false
      }
      if (stages.length > 0 && !stages.some(stage => inPendingStage(row, stage))) return false
      if (from && (row.requestedAt == null || row.requestedAt.slice(0, 10) < from)) return false
      if (to && (row.requestedAt == null || row.requestedAt.slice(0, 10) > to)) return false
      return true
    })
    const filtered = withoutType.filter(row => types.length === 0 || types.includes(row.claimType))
    const pageRows = filtered.slice(page * size, page * size + size)

    return HttpResponse.json({
      data: {
        claims: pageRows.map(claimSummary),
        totalCount: filtered.length,
        counts: {
          CANCEL: withoutType.filter(row => row.claimType === 'CANCEL').length,
          RETURN: withoutType.filter(row => row.claimType === 'RETURN').length,
          EXCHANGE: withoutType.filter(row => row.claimType === 'EXCHANGE').length,
        },
        page,
        size,
        totalPages: Math.ceil(filtered.length / size),
        hasNext: (page + 1) * size < filtered.length,
      },
    })
  }),

  http.get(`${SELLER_CLAIMS_URL}/:claimPublicId`, ({ params }) => {
    const row = claims.find(claim => claim.claimPublicId === params['claimPublicId'])
    if (!row) return claimNotFound()
    return HttpResponse.json({
      data: {
        claim: claimSummary(row),
        order: { orderPublicId: row.orderPublicId, ...row.order },
        items: row.items.map(item => ({ ...item })),
        history: claimHistory(row),
      },
    })
  }),

  http.patch(`${SELLER_CLAIMS_URL}/:claimPublicId/memo`, async ({ params, request }) => {
    countClaimRequest('memo')
    const row = claims.find(claim => claim.claimPublicId === params['claimPublicId'])
    if (!row) return claimNotFound()
    const body = (await request.json()) as { sellerMemo?: string | null }
    const memo = body.sellerMemo?.trim() ?? ''
    if (memo.length > 500) return badRequest('sellerMemo는 최대 500자입니다.')
    row.sellerMemo = memo === '' ? null : memo
    return new HttpResponse(null, { status: 204 })
  }),

  http.post(`${SELLER_CLAIMS_URL}/:claimPublicId/approve`, async ({ params, request }) => {
    countClaimRequest('approve')
    const row = claims.find(claim => claim.claimPublicId === params['claimPublicId'])
    if (!row) return claimNotFound()
    const body = (await request.json()) as { returnCostBearer?: 'BUYER' | 'SELLER' | null }
    // Claim.requireSellerDecisionPending — 상태가 아니라 셀러 판단 축이 가른다.
    if (row.sellerApprovalStatus !== 'REQUESTED') {
      return errorAt(409, 50408, '이미 처리된 클레임입니다.')
    }
    // 그 다음 transitionTo가 상태 축을 본다(철회된 건은 여기서 걸린다).
    const next: ClaimStatusWire = row.claimType === 'CANCEL' ? 'APPROVED' : 'COLLECTING'
    if (!canTransition(row.status, next)) return invalidTransition()
    row.sellerApprovalStatus = 'APPROVED'
    row.approvedAt = '2026-10-25T09:00:00'
    row.status = next
    // 취소는 부담 주체를 저장하지 않는다(도메인이 건너뛴다).
    if (row.claimType !== 'CANCEL') row.returnCostBearer = body.returnCostBearer ?? null
    return new HttpResponse(null, { status: 204 })
  }),

  http.post(`${SELLER_CLAIMS_URL}/:claimPublicId/reject`, async ({ params, request }) => {
    countClaimRequest('reject')
    const row = claims.find(claim => claim.claimPublicId === params['claimPublicId'])
    if (!row) return claimNotFound()
    const body = (await request.json()) as { rejectionReason?: string }
    const reason = body.rejectionReason?.trim() ?? ''
    // 도메인 순서 그대로 — 공백 사유를 판단 축·상태 축보다 먼저 거절한다(Claim.rejectBySeller).
    if (reason === '') return errorAt(400, 50405, '거부 사유를 입력해 주세요.')
    if (row.sellerApprovalStatus !== 'REQUESTED') {
      return errorAt(409, 50408, '이미 처리된 클레임입니다.')
    }
    if (!canTransition(row.status, 'REJECTED')) return invalidTransition()
    row.sellerApprovalStatus = 'REJECTED'
    row.status = 'REJECTED'
    row.rejectionReason = reason
    row.resolvedAt = '2026-10-25T09:00:00'
    return new HttpResponse(null, { status: 204 })
  }),

  // 송장번호 형식은 검사하지 않는다 — BE ClaimCollectionService도 CourierMaster.validateTrackingNumber를
  // 부르지 않는다(그 호출은 최초 발송 경로에만 있다). 스텁이 서버보다 엄격하면 FE 선검증이 깨져도
  // 테스트가 400을 받아 상태가 그대로이므로 "막혔다"는 단언이 그대로 통과한다 — 그 선검증은 요청 수
  // (claimRequestCount)로 단언한다.
  http.post(`${SELLER_CLAIMS_URL}/:claimPublicId/collection`, async ({ params, request }) => {
    countClaimRequest('collection')
    const row = claims.find(claim => claim.claimPublicId === params['claimPublicId'])
    if (!row) return claimNotFound()
    const body = (await request.json()) as { courierCode?: string; trackingNumber?: string }
    if (row.claimType === 'CANCEL' || row.status !== 'COLLECTING') {
      return errorAt(409, 50409, '회수를 진행할 수 없는 클레임 상태입니다.')
    }
    if (row.collectionStartedAt != null) {
      return errorAt(409, 50302, '이미 송장이 등록되어 있습니다.')
    }
    const courier = couriers.find(c => c.courierCode === body.courierCode)
    if (!courier) return errorAt(404, 50303, '택배사를 찾을 수 없습니다.')
    row.collectionStartedAt = '2026-10-25T09:00:00'
    return new HttpResponse(null, { status: 204 })
  }),

  http.post(`${SELLER_CLAIMS_URL}/:claimPublicId/collection/complete`, ({ params }) => {
    countClaimRequest('collection-complete')
    const row = claims.find(claim => claim.claimPublicId === params['claimPublicId'])
    if (!row) return claimNotFound()
    if (row.status !== 'COLLECTING' || row.collectionStartedAt == null) {
      return errorAt(409, 50409, '회수를 진행할 수 없는 클레임 상태입니다.')
    }
    row.status = 'APPROVED'
    if (row.claimType === 'RETURN') {
      row.items = row.items.map(item => ({ ...item, itemStatus: 'RETURNED' as const }))
    }
    return new HttpResponse(null, { status: 204 })
  }),

  http.post(`${SELLER_CLAIMS_URL}/:claimPublicId/reship`, async ({ params, request }) => {
    countClaimRequest('reship')
    const row = claims.find(claim => claim.claimPublicId === params['claimPublicId'])
    if (!row) return claimNotFound()
    const body = (await request.json()) as { courierCode?: string; trackingNumber?: string }
    // Claim.isReshippable 미러.
    const reshippable =
      row.claimType === 'EXCHANGE' &&
      row.status === 'APPROVED' &&
      row.collectionStartedAt != null &&
      row.resolvedAt == null
    if (!reshippable) return errorAt(409, 50411, '회수가 끝난 교환 클레임만 재발송할 수 있습니다.')
    const courier = couriers.find(c => c.courierCode === body.courierCode)
    if (!courier) return errorAt(404, 50303, '택배사를 찾을 수 없습니다.')
    row.resolvedAt = '2026-10-25T09:00:00'
    return HttpResponse.json(
      {
        data: {
          shipmentType: 'EXCHANGE_RESHIP',
          courierCode: courier.courierCode,
          courierName: courier.courierName,
          trackingNumber: body.trackingNumber ?? '',
          dispatchedAt: '2026-10-25T09:00:00',
        },
      },
      { status: 201 },
    )
  }),
]

// ─── 배송 정책 (seller 호스트 /sellers/me/shipping-policy) ────────────────────
// BE ShippingPolicyResponse/UpdateRequest 모양 그대로. 서버 쪽 두 규칙을 재현한다.
// 1. 저장한 적 없는 셀러도 404가 아니라 컬럼 기본값을 받는다(0원·2영업일·반품지 동일).
// 2. PUT은 전체 덮어쓰기이고 204(바디 없음)이며, returnSameAsOrigin=true면 반품지 3필드를
//    저장하지 않고 null로 떨어뜨린다 — 화면이 저장 직후 그 소거를 반영하는지 테스트가 본다.

export interface ShippingPolicyWire {
  defaultCourierCode: string | null
  baseShippingFee: number
  freeShippingThreshold: number | null
  originZipCode: string | null
  originRoadAddress: string | null
  originDetailAddress: string | null
  returnSameAsOrigin: boolean
  returnZipCode: string | null
  returnRoadAddress: string | null
  returnDetailAddress: string | null
  jejuExtraFee: number
  remoteAreaExtraFee: number
  returnFee: number
  exchangeFee: number
  avgDispatchDays: number
  shippingPolicyText: string | null
}

/** V32 컬럼 기본값 — 배송 정책을 한 번도 저장하지 않은 셀러가 보는 값. */
export const DEFAULT_SHIPPING_POLICY: ShippingPolicyWire = {
  defaultCourierCode: null,
  baseShippingFee: 0,
  freeShippingThreshold: null,
  originZipCode: null,
  originRoadAddress: null,
  originDetailAddress: null,
  returnSameAsOrigin: true,
  returnZipCode: null,
  returnRoadAddress: null,
  returnDetailAddress: null,
  jejuExtraFee: 0,
  remoteAreaExtraFee: 0,
  returnFee: 0,
  exchangeFee: 0,
  avgDispatchDays: 2,
  shippingPolicyText: null,
}

let shippingPolicy: ShippingPolicyWire = { ...DEFAULT_SHIPPING_POLICY }

export function makeShippingPolicyWire(
  overrides: Partial<ShippingPolicyWire> = {},
): ShippingPolicyWire {
  return { ...DEFAULT_SHIPPING_POLICY, ...overrides }
}

/** 인자 없이 부르면 컬럼 기본값으로 되돌린다. */
export function seedShippingPolicy(state: ShippingPolicyWire = DEFAULT_SHIPPING_POLICY): void {
  shippingPolicy = { ...state }
}

/** 핸들러가 저장한 현재 정책 — 테스트가 PUT 본문 반영을 단언할 때 읽는다. */
export function currentShippingPolicy(): ShippingPolicyWire {
  return { ...shippingPolicy }
}

const shippingPolicyHandlers = [
  http.get(SELLER_SHIPPING_POLICY_URL, () => HttpResponse.json({ data: { ...shippingPolicy } })),
  http.put(SELLER_SHIPPING_POLICY_URL, async ({ request }) => {
    const body = (await request.json()) as ShippingPolicyUpdateBody
    const fees = [
      body.baseShippingFee,
      body.jejuExtraFee,
      body.remoteAreaExtraFee,
      body.returnFee,
      body.exchangeFee,
    ]
    // 금액 필드는 서버가 Long이라 소수가 섞이면 도메인 검증까지 가지 못하고 역직렬화에서
    // 400/90001("요청 본문을 읽을 수 없습니다.")로 떨어진다 — 10005와 다른 경로다.
    const amounts = [...fees, ...(body.freeShippingThreshold == null ? [] : [body.freeShippingThreshold])]
    if (amounts.some(amount => !Number.isInteger(amount))) {
      return errorAt(400, 90001, '요청 본문을 읽을 수 없습니다.')
    }
    // Seller.validateShippingPolicy 미러 — 음수·상한·자기모순·발송일 범위는 전부 10005다.
    if (fees.some(fee => fee < 0 || fee > 1_000_000)) return invalidShippingPolicy()
    if (body.freeShippingThreshold != null) {
      if (body.freeShippingThreshold < 0 || body.freeShippingThreshold > 100_000_000) {
        return invalidShippingPolicy()
      }
      if (body.freeShippingThreshold < body.baseShippingFee) return invalidShippingPolicy()
    }
    if (body.avgDispatchDays < 1 || body.avgDispatchDays > 7) return invalidShippingPolicy()
    // 셀러 게이트가 택배사 검증보다 앞서지만 여기서는 셀러가 늘 활성이라 택배사만 본다.
    if (body.defaultCourierCode != null && !couriers.some(c => c.courierCode === body.defaultCourierCode)) {
      return errorAt(404, 50303, '택배사를 찾을 수 없습니다.')
    }
    const sameAsOrigin = body.returnSameAsOrigin
    shippingPolicy = {
      defaultCourierCode: body.defaultCourierCode ?? null,
      baseShippingFee: body.baseShippingFee,
      freeShippingThreshold: body.freeShippingThreshold ?? null,
      originZipCode: body.originZipCode ?? null,
      originRoadAddress: body.originRoadAddress ?? null,
      originDetailAddress: body.originDetailAddress ?? null,
      returnSameAsOrigin: sameAsOrigin,
      returnZipCode: sameAsOrigin ? null : (body.returnZipCode ?? null),
      returnRoadAddress: sameAsOrigin ? null : (body.returnRoadAddress ?? null),
      returnDetailAddress: sameAsOrigin ? null : (body.returnDetailAddress ?? null),
      jejuExtraFee: body.jejuExtraFee,
      remoteAreaExtraFee: body.remoteAreaExtraFee,
      returnFee: body.returnFee,
      exchangeFee: body.exchangeFee,
      avgDispatchDays: body.avgDispatchDays,
      shippingPolicyText: body.shippingPolicyText ?? null,
    }
    return new HttpResponse(null, { status: 204 })
  }),
]

type ShippingPolicyUpdateBody = Partial<Omit<ShippingPolicyWire, 'returnSameAsOrigin'>> &
  Pick<
    ShippingPolicyWire,
    | 'baseShippingFee'
    | 'returnSameAsOrigin'
    | 'jejuExtraFee'
    | 'remoteAreaExtraFee'
    | 'returnFee'
    | 'exchangeFee'
    | 'avgDispatchDays'
  >

const invalidShippingPolicy = () =>
  errorAt(400, 10005, '배송 정책 값이 올바르지 않습니다.')


// ─── 정산 조회 (seller 호스트 /sellers/me/settlements) ────────────────────────
// BE SellerSettlement* 응답 모양 그대로. 서버가 주문 단위로 접는 규칙까지 재현한다.
// 1. 품목이 여럿이면 한 행으로 접히고 금액은 품목 합이다(Settlement.netAmount의 합).
// 2. 한 주문 안에서 상태가 갈리면 보류 > 대기 > 예정 > 완료 순으로 센 쪽이 이긴다.
// 3. 상태 필터를 걸어도 금액은 쪼개지 않는다 — 주문 전체 합을 그대로 준다.
// 4. 요율은 정산 행에 박힌 스냅샷이라 행마다 다를 수 있다(화면이 하드코딩하지 않는지 본다).

export type SettlementStatusWire = 'pending' | 'scheduled' | 'completed' | 'held'

export interface SettlementItemWire {
  orderItemId: number
  productName: string | null
  quantity: number | null
  grossAmount: number
  shippingFee: number
  commission: number
  pgFee: number
  sellerCouponBurden: number
  refundDeduction: number
  status: SettlementStatusWire
}

export interface SettlementOrderWire {
  orderId: string
  settlementMonth: string
  confirmedAt: string | null
  expectedPayoutDate: string
  platformFeeRate: number
  pgFeeRate: number
  items: SettlementItemWire[]
}

/** 품목 지급 예정액 = 상품금액 + 배송비 - 수수료 둘 - 쿠폰 부담 - 환불 차감(Settlement.create 미러). */
const netAmountOf = (item: SettlementItemWire): number =>
  item.grossAmount +
  item.shippingFee -
  item.commission -
  item.pgFee -
  item.sellerCouponBurden -
  item.refundDeduction

/** 서버의 상태 접기 — 보류가 가장 세고 그다음은 덜 진행된 쪽이다. */
const STATUS_SEVERITY: Record<SettlementStatusWire, number> = {
  held: 3,
  pending: 2,
  scheduled: 1,
  completed: 0,
}

const foldStatus = (items: SettlementItemWire[]): SettlementStatusWire =>
  items.reduce<SettlementStatusWire>(
    (worst, item) => (STATUS_SEVERITY[item.status] > STATUS_SEVERITY[worst] ? item.status : worst),
    'completed',
  )

const sum = (items: SettlementItemWire[], pick: (item: SettlementItemWire) => number) =>
  items.reduce((total, item) => total + pick(item), 0)

export function makeSettlementItemWire(
  overrides: Partial<SettlementItemWire> = {},
): SettlementItemWire {
  return {
    orderItemId: 1,
    productName: '고양이 자동 급식기 5L',
    quantity: 1,
    grossAmount: 64_000,
    shippingFee: 3_000,
    commission: 5_120,
    pgFee: 1_792,
    sellerCouponBurden: 0,
    refundDeduction: 0,
    status: 'pending',
    ...overrides,
  }
}

export function makeSettlementOrderWire(
  overrides: Partial<SettlementOrderWire> = {},
): SettlementOrderWire {
  return {
    orderId: '01JZ0RDER0000000000000001',
    settlementMonth: '2026-06',
    confirmedAt: '2026-06-18T10:00:00',
    expectedPayoutDate: '2026-06-23',
    platformFeeRate: 0.08,
    pgFeeRate: 0.028,
    items: [makeSettlementItemWire()],
    ...overrides,
  }
}

let settlementOrders: SettlementOrderWire[] = []

/** 인자 없이 부르면 정산 행이 없는 셀러(빈 목록·빈 월 목록)가 된다. */
export function seedSettlements(orders: SettlementOrderWire[] = []): void {
  settlementOrders = orders.map(order => ({ ...order, items: order.items.map(item => ({ ...item })) }))
}

const summaryOfOrder = (order: SettlementOrderWire) => ({
  orderId: order.orderId,
  settlementMonth: order.settlementMonth,
  confirmedAt: order.confirmedAt,
  expectedPayoutDate: order.expectedPayoutDate,
  productAmount: sum(order.items, item => item.grossAmount),
  feeAmount: sum(order.items, item => item.commission + item.pgFee),
  finalAmount: sum(order.items, netAmountOf),
  status: foldStatus(order.items),
})

const settlementHandlers = [
  // 월 목록이 목록보다 먼저 와야 한다 — `/months`가 `/{orderPublicId}`에 먹히지 않게.
  http.get(SELLER_SETTLEMENT_MONTHS_URL, () =>
    HttpResponse.json({
      data: {
        months: [...new Set(settlementOrders.map(order => order.settlementMonth))].sort().reverse(),
      },
    }),
  ),
  http.get(SELLER_SETTLEMENTS_URL, ({ request }) => {
    const query = new URL(request.url).searchParams
    const month = query.get('month')
    const status = query.get('status')
    const page = Number(query.get('page') ?? '0')
    const size = Number(query.get('size') ?? '20')
    // 빈 값 파라미터는 미입력이 아니라 형식 오류다(BE 계약) — FE가 키째 빼는지 이 분기가 본다.
    if (month !== null && !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      return badRequest('month는 YYYY-MM 형식이어야 합니다.')
    }
    if (status !== null && !['pending', 'scheduled', 'completed', 'held'].includes(status)) {
      return badRequest('status: 정산 대기, 정산 예정, 정산 완료, 정산 보류만 지원합니다.')
    }
    if (!Number.isInteger(size) || size < 1 || size > 100) return badRequest('size는 1~100 사이여야 합니다.')
    if (!Number.isInteger(page) || page < 0) return badRequest('page는 0 이상이어야 합니다.')

    const matched = settlementOrders
      .filter(order => month === null || order.settlementMonth === month)
      .filter(order => status === null || foldStatus(order.items) === status)
      // 확정일 최신순. 확정 전(null)은 뒤로.
      .sort((a, b) => (b.confirmedAt ?? '').localeCompare(a.confirmedAt ?? ''))
    const totalCount = matched.length
    const totalPages = Math.ceil(totalCount / size)
    const start = page * size
    return HttpResponse.json({
      data: {
        settlements: matched.slice(start, start + size).map(summaryOfOrder),
        totalCount,
        page,
        size,
        totalPages,
        hasNext: start + size < totalCount,
      },
    })
  }),
  http.get(`${SELLER_SETTLEMENTS_URL}/:orderPublicId`, ({ params }) => {
    const order = settlementOrders.find(row => row.orderId === params['orderPublicId'])
    if (!order) return errorAt(404, 70002, '정산 내역을 찾을 수 없습니다.')
    return HttpResponse.json({
      data: {
        ...summaryOfOrder(order),
        shippingFee: sum(order.items, item => item.shippingFee),
        couponBurden: sum(order.items, item => item.sellerCouponBurden),
        platformFeeAmount: sum(order.items, item => item.commission),
        pgFeeAmount: sum(order.items, item => item.pgFee),
        refundDeduction: sum(order.items, item => item.refundDeduction),
        platformFeeRate: order.platformFeeRate,
        pgFeeRate: order.pgFeeRate,
        items: order.items.map(item => ({
          orderItemId: item.orderItemId,
          productName: item.productName,
          quantity: item.quantity,
          grossAmount: item.grossAmount,
          shippingFee: item.shippingFee,
          commission: item.commission,
          pgFee: item.pgFee,
          sellerCouponBurden: item.sellerCouponBurden,
          refundDeduction: item.refundDeduction,
          netAmount: netAmountOf(item),
        })),
      },
    })
  }),
]

// ─── 셀러 대시보드 집계 (seller 호스트 /sellers/me/dashboard/summary) ────────
// 지표 10종·정산 3금액·상품 상태 4건수를 한 번에 내린다. `previousValue`는 "직전 기간 말의 잔량"이
// 아니라 "직전 구간에 발생했고 지금도 그 단계인 건수"이고, period=all이면 비교할 구간이 없어 null이다.
// supported=false는 값이 아니라 "집계 불가"다(unansweredInquiries).

export interface DashboardMetricWire {
  value: number
  previousValue: number | null
  supported: boolean
}

// 응답 `metrics`의 필드 이름. 생성물 타입을 끌어오지 않고 손으로 적는다 — 모킹이 생성물을 따라가면
// "스펙과 다른 응답"을 표현할 수 없고, 서버 계약이 바뀔 때 테스트가 함께 조용히 바뀐다.
type DashboardMetricKeyWire =
  | 'newOrders'
  | 'awaitingShipment'
  | 'shippingDelayed'
  | 'cancelRequests'
  | 'returnRequests'
  | 'exchangeRequests'
  | 'collectionInvoicePending'
  | 'collectionCompletionPending'
  | 'reshipPending'
  | 'unansweredInquiries'

export interface DashboardSummaryWire {
  /** 10종 전부 — 서버가 필수로 내리는 필드이므로 fixture도 빠뜨릴 수 없다(Record가 컴파일에서 막는다). */
  metrics: Record<DashboardMetricKeyWire, DashboardMetricWire>
  settlement: { totalAmount: number; pendingAmount: number; onHoldAmount: number }
  productStatuses: {
    awaitingInspection: number
    rejected: number
    suspended: number
    soldOut: number
  }
}

/**
 * 기본 응답. 지표마다 값을 다르게 둬서 화면이 키를 뒤섞어 꽂으면 테스트가 잡는다.
 * `previousValue`는 기간이 있을 때만 의미가 있으므로 period=all이면 핸들러가 null로 바꿔 내린다.
 *
 * `metrics`만 **얕은 병합이 아니라 키 단위로 덮는다** — 지표 하나만 바꾸려고 `{ metrics: { … } }`를
 * 넘겼을 때 나머지 아홉이 사라지면, 핸들러가 그 구멍을 메우며 "서버가 안 내려준 필드"를 정상 0건으로
 * 위장하게 된다(실제 응답에서 키가 빠지면 화면은 예외로 깨진다 — 모킹이 서버보다 관대해지는 자리).
 */
export function makeDashboardSummaryWire(
  overrides: Partial<Omit<DashboardSummaryWire, 'metrics'>> & {
    /** 지표는 바꿀 것만 적는다 — 적지 않은 지표는 기본값으로 남아 응답이 늘 10종 전부다. */
    metrics?: Partial<Record<DashboardMetricKeyWire, DashboardMetricWire>>
  } = {},
): DashboardSummaryWire {
  const base: DashboardSummaryWire = {
    metrics: {
      newOrders: { value: 7, previousValue: 2, supported: true },
      awaitingShipment: { value: 6, previousValue: 1, supported: true },
      shippingDelayed: { value: 2, previousValue: 0, supported: true },
      cancelRequests: { value: 5, previousValue: 3, supported: true },
      returnRequests: { value: 4, previousValue: 1, supported: true },
      exchangeRequests: { value: 3, previousValue: 1, supported: true },
      collectionInvoicePending: { value: 9, previousValue: 4, supported: true },
      collectionCompletionPending: { value: 8, previousValue: 2, supported: true },
      reshipPending: { value: 11, previousValue: 5, supported: true },
      unansweredInquiries: { value: 0, previousValue: null, supported: false },
    },
    settlement: { totalAmount: 360_000, pendingAmount: 312_000, onHoldAmount: 48_000 },
    productStatuses: { awaitingInspection: 2, rejected: 1, suspended: 1, soldOut: 3 },
  }
  return { ...base, ...overrides, metrics: { ...base.metrics, ...overrides.metrics } }
}

let dashboardSummary: DashboardSummaryWire = makeDashboardSummaryWire()
let dashboardError: { status: number; errorCode: number; message: string } | null = null
let lastDashboardPeriod: string | null | undefined
let dashboardRequestCount = 0

/** 인자 없이 부르면 기본 응답으로 되돌린다. */
export function seedDashboardSummary(
  state: DashboardSummaryWire = makeDashboardSummaryWire(),
): void {
  dashboardSummary = state
  dashboardError = null
}

/** 집계 조회를 실패로 세운다(자격 게이트 403/10003이나 5xx). */
export function seedDashboardSummaryError(
  error: { status: number; errorCode: number; message: string } = {
    status: 500,
    errorCode: 90000,
    message: '서버 오류가 발생했습니다.',
  },
): void {
  dashboardError = error
}

/** 마지막 요청에 실린 period — undefined면 파라미터 자체를 보내지 않았다는 뜻이다. */
export function lastDashboardSummaryPeriod(): string | null | undefined {
  return lastDashboardPeriod
}

/**
 * 집계 GET이 실제로 몇 번 나갔는지. 재시도 정책을 숫자로 확인하는 용도다 — 자격 거절(4xx)은
 * 다시 보내도 같은 답이라 한 번이어야 하고, 5xx만 한 번 더 나가야 한다.
 */
export function dashboardSummaryRequestCount(): number {
  return dashboardRequestCount
}

export function resetDashboardSummaryProbe(): void {
  lastDashboardPeriod = undefined
  dashboardRequestCount = 0
}

const DASHBOARD_PERIODS = ['all', '7d', '30d', '90d']

const dashboardHandlers = [
  http.get(SELLER_DASHBOARD_SUMMARY_URL, ({ request }) => {
    const period = new URL(request.url).searchParams.get('period')
    lastDashboardPeriod = period
    dashboardRequestCount += 1
    if (period != null && !DASHBOARD_PERIODS.includes(period)) {
      return badRequest('period: 지원하지 않는 값입니다.')
    }
    if (dashboardError) {
      return HttpResponse.json(
        { errorCode: dashboardError.errorCode, message: dashboardError.message },
        { status: dashboardError.status },
      )
    }
    // 전체 기간에는 비교할 직전 구간이 없다 — 0이 아니라 null이어야 화면이 두 경우를 가른다.
    // 세운 응답은 그 밖으로는 손대지 않는다(없는 키를 메우면 모킹이 서버보다 관대해진다).
    const isAll = period == null || period === 'all'
    const metrics = Object.fromEntries(
      Object.entries(dashboardSummary.metrics).map(([key, metric]) => [
        key,
        { ...metric, previousValue: isAll ? null : metric.previousValue },
      ]),
    )
    return HttpResponse.json({ data: { ...dashboardSummary, metrics } })
  }),
]


// ─── 상품 문의(SCRUM-316) ────────────────────────────────────────────────────
// BE SellerInquirySummaryResponse 모양. 지표와 overdue는 **서버가 센 값**이므로 이 스텁도 행에서
// 다시 계산하지 않고 심어 둔 값을 그대로 돌려준다 — 화면이 날짜를 빼서 세는 회귀를 잡으려면
// 스텁과 화면이 같은 계약을 지켜야 한다.
export interface InquiryWire {
  inquiryId: string
  productId: string
  productName: string
  category: 'PRODUCT' | 'DELIVERY' | 'CLAIM' | 'ETC'
  title: string
  content: string
  authorMasked: string
  secret: boolean
  status: 'RECEIVED' | 'ANSWERED'
  askedAt: string
  answerDueAt: string
  overdue: boolean
  answer: { content: string; answeredAt: string } | null
}

let inquirySeq = 1
let inquiries: InquiryWire[] = []
let lastInquiriesQuery: string | null = null
let inquiryAnswerRequestCount = 0

export function makeInquiryWire(overrides: Partial<InquiryWire> = {}): InquiryWire {
  const inquiryId = overrides.inquiryId ?? `01INQUIRY${String(inquirySeq++).padStart(17, '0')}`
  return {
    inquiryId,
    productId: '01PRODUCTPUBLICID000000001',
    productName: '자동 급식기 5L',
    category: 'PRODUCT',
    title: '소형견도 쓸 수 있는 크기인가요?',
    content: '입구 높이가 너무 높지 않을까 걱정돼요. 몇 cm인지 알 수 있을까요?',
    authorMasked: '김**',
    secret: false,
    status: 'RECEIVED',
    askedAt: '2026-10-26T09:14:00',
    answerDueAt: '2026-10-28T23:59:59',
    overdue: false,
    answer: null,
    ...overrides,
  }
}

export const DEFAULT_INQUIRIES: InquiryWire[] = [
  makeInquiryWire({ inquiryId: '01INQUIRYA0000000000000001' }),
  makeInquiryWire({
    inquiryId: '01INQUIRYB0000000000000002',
    category: 'DELIVERY',
    title: '제주도 추가 배송비가 따로 붙나요?',
    content: '제주시로 받으려는데 결제 화면에 추가 배송비가 안 보여서 확인 부탁드려요.',
    productName: '원목 캣타워 3단',
    productId: '01PRODUCTPUBLICID000000002',
    authorMasked: '이**',
    askedAt: '2026-10-20T21:38:00',
    answerDueAt: '2026-10-22T23:59:59',
    overdue: true,
  }),
  makeInquiryWire({
    inquiryId: '01INQUIRYC0000000000000003',
    title: '동결건조 간식 유통기한이 언제까지인가요?',
    content: '지금 발송되는 물건의 유통기한을 알고 싶어요.',
    productName: '동결건조 간식 100g',
    productId: '01PRODUCTPUBLICID000000003',
    authorMasked: '최**',
    secret: true,
    status: 'ANSWERED',
    askedAt: '2026-10-24T11:27:00',
    answerDueAt: '2026-10-27T23:59:59',
    answer: { content: '2027년 4월 30일까지예요.', answeredAt: '2026-10-24T13:05:00' },
  }),
]

export function seedInquiries(rows: InquiryWire[] = DEFAULT_INQUIRIES): void {
  inquiries = rows.map(row => ({ ...row }))
  lastInquiriesQuery = null
  inquiryAnswerRequestCount = 0
}

/** 목록 핸들러가 받은 마지막 쿼리스트링 — 빈 값 제거를 단언할 때 쓴다. */
export function lastSellerInquiriesQuery(): string | null {
  return lastInquiriesQuery
}

/** 답변 경로가 받은 요청 수(seedInquiries가 0으로 되돌린다). */
export function inquiryAnswerCount(): number {
  return inquiryAnswerRequestCount
}

/** 핸들러가 반영한 현재 목록 — 테스트가 답변 결과를 읽을 때 쓴다. */
export function currentInquiries(): InquiryWire[] {
  return inquiries.map(row => ({ ...row }))
}

/**
 * 심어 둔 문의 한 행을 서버 쪽에서 고친다(claims의 `updateClaimRow`와 같은 쓰임) —
 * 재조회 사이에 서버 값이 바뀐 상황을 만들 때 쓴다.
 */
export function updateInquiryRow(inquiryId: string, patch: Partial<InquiryWire>): void {
  inquiries = inquiries.map(row => (row.inquiryId === inquiryId ? { ...row, ...patch } : row))
}

/** 지표는 필터를 무시하고 전체 범위를 센다 — 화면이 탭을 눌러도 흔들리지 않아야 한다. */
function inquiryMetrics() {
  const pending = inquiries.filter(row => row.status === 'RECEIVED').length
  return {
    pending,
    overdue: inquiries.filter(row => row.status === 'RECEIVED' && row.overdue).length,
    total: inquiries.length,
  }
}

const inquiryHandlers = [
  http.get(SELLER_INQUIRIES_URL, ({ request }) => {
    const url = new URL(request.url)
    lastInquiriesQuery = url.search.replace(/^\?/, '')
    const params = url.searchParams
    // 빈 값은 BE가 미입력이 아니라 형식 오류로 거절한다 — 정규화가 새면 테스트가 여기서 터진다.
    for (const [key, value] of params.entries()) {
      if (value === '') return badRequest(`${key}: 지원하지 않는 값입니다.`)
    }
    const status = params.get('status')
    const category = params.get('category')
    const keyword = params.get('keyword')
    const filtered = inquiries.filter(row => {
      if (status != null && row.status !== status) return false
      if (category != null && row.category !== category) return false
      if (keyword != null) {
        const needle = keyword.toLowerCase()
        if (
          !row.title.toLowerCase().includes(needle) &&
          !row.productName.toLowerCase().includes(needle)
        ) {
          return false
        }
      }
      return true
    })
    const size = Number(params.get('size') ?? 20)
    const page = Number(params.get('page') ?? 0)
    const totalCount = filtered.length
    const totalPages = Math.ceil(totalCount / size)
    return HttpResponse.json({
      data: {
        inquiries: filtered.slice(page * size, (page + 1) * size),
        metrics: inquiryMetrics(),
        totalCount,
        page,
        size,
        totalPages,
        hasNext: page + 1 < totalPages,
      },
    })
  }),
  // 답변 — 201. 문의당 한 번만 받는다(두 번째는 409/120109).
  http.post(`${SELLER_INQUIRIES_URL}/:inquiryId/answer`, async ({ params, request }) => {
    inquiryAnswerRequestCount += 1
    const row = inquiries.find(item => item.inquiryId === params['inquiryId'])
    if (!row) return errorAt(404, 120100, '상품 문의를 찾을 수 없습니다.')
    if (row.answer != null) return errorAt(409, 120109, '이미 답변이 등록된 문의입니다.')
    const { content } = (await request.json()) as { content: string }
    if (content.trim() === '') return errorAt(400, 120105, '답변 내용은 필수입니다.')
    const answeredAt = '2026-10-27T15:00:00'
    row.answer = { content: content.trim(), answeredAt }
    row.status = 'ANSWERED'
    row.overdue = false
    return HttpResponse.json(
      { data: { inquiryId: row.inquiryId, status: row.status, answeredAt } },
      { status: 201 },
    )
  }),
]

// ─── 셀러 리뷰 관리·답글(SCRUM-315) ─────────────────────────────────────────────
// BE SellerReviewController 미러. 고정하려는 계약 넷 —
//  (1) summary/totalCount는 첫 페이지에만 실리고 뒤 페이지는 null이다,
//  (2) summary는 별점·답글 필터를 반영하지 않는다(분포 막대는 상품 범위 전체),
//  (3) 답글은 리뷰당 하나라 이미 있으면 POST가 409/110201이고 덮어쓰지 않는다,
//  (4) 남의 상품 리뷰는 403이 아니라 404/110000이다.

export const SELLER_REVIEWS_URL = `${sellerBase}/sellers/me/reviews`

export interface ReviewReplyWire {
  replyId: number
  reviewId: number
  content: string
  repliedAt: string
  updatedAt: string
}

export interface SellerReviewWire {
  reviewId: number
  productId: string
  productName: string
  rating: 1 | 2 | 3 | 4 | 5
  content: string
  optionName: string
  authorNickname: string
  createdAt: string
  images: { imageUrl: string; sortOrder: number }[]
  reply: ReviewReplyWire | null
}

const DEFAULT_SELLER_REVIEWS: SellerReviewWire[] = [
  {
    reviewId: 1180,
    productId: '01JSELLERPRODUCT0000000001',
    productName: '자동 급식기 5L',
    rating: 5,
    content: '출근이 늦어지는 날에도 정해진 시간에 밥이 나와서 마음이 놓여요.',
    optionName: '화이트',
    authorNickname: '코코',
    createdAt: '2026-10-26T10:00:00',
    images: [
      { imageUrl: 'https://cdn.example.com/reviews/1180-0.jpg', sortOrder: 0 },
      { imageUrl: 'https://cdn.example.com/reviews/1180-1.jpg', sortOrder: 1 },
    ],
    reply: null,
  },
  {
    reviewId: 1176,
    productId: '01JSELLERPRODUCT0000000002',
    productName: '원목 캣타워 3단',
    rating: 4,
    content: '조립은 혼자서 30분쯤 걸렸어요.',
    optionName: '기본',
    authorNickname: '초코',
    createdAt: '2026-10-25T09:00:00',
    images: [],
    reply: null,
  },
  {
    reviewId: 1171,
    productId: '01JSELLERPRODUCT0000000001',
    productName: '자동 급식기 5L',
    rating: 2,
    content: '사이즈표보다 작게 나왔어요.',
    optionName: '블랙',
    authorNickname: '모카',
    createdAt: '2026-10-24T08:00:00',
    images: [],
    reply: {
      replyId: 9001,
      reviewId: 1171,
      content: '사이즈표를 실측값으로 다시 올렸어요.',
      repliedAt: '2026-10-24T12:00:00',
      updatedAt: '2026-10-24T12:00:00',
    },
  },
]

let sellerReviews: SellerReviewWire[] = []
let reviewsQueries: string[] = []
let nextReplyId = 9100
let reviewsListError: { status: number; errorCode: number; message: string } | null = null

export function seedSellerReviews(rows: SellerReviewWire[] = DEFAULT_SELLER_REVIEWS): void {
  sellerReviews = rows.map(row => ({
    ...row,
    images: [...row.images],
    reply: row.reply && { ...row.reply },
  }))
  reviewsQueries = []
  nextReplyId = 9100
  reviewsListError = null
}

/**
 * 목록 핸들러가 받은 쿼리스트링 전부 — 빈 값 제거와 커서 전달을 단언할 때 쓴다.
 * 화면은 목록(size=20)과 답글 없는 건수(size=1)로 같은 경로를 두 번 부르므로 "마지막 하나"로는
 * 목록 쿼리를 집을 수 없다.
 */
export function sellerReviewsQueries(): string[] {
  return [...reviewsQueries]
}

/** 목록 조회(size=20) 중 마지막 쿼리스트링. 건수 집계 호출(size=1)은 제외한다. */
export function lastSellerReviewsListQuery(): string | null {
  const listQueries = reviewsQueries.filter(
    query => !query.includes('size=1&') && !query.endsWith('size=1'),
  )
  return listQueries.at(-1) ?? null
}

/** 핸들러가 반영한 현재 목록 — 테스트가 답글 결과를 읽을 때 쓴다. */
export function currentSellerReviews(): SellerReviewWire[] {
  return sellerReviews.map(row => ({ ...row }))
}

/** 목록 조회를 실패시킨다(실 API에만 있는 403·500 경로 검증용). */
export function failSellerReviewsList(error: {
  status: number
  errorCode: number
  message: string
}): void {
  reviewsListError = error
}

const REVIEW_PAGE_CURSOR_PREFIX = 'cursor-'

const reviewsHandlers = [
  http.get(SELLER_REVIEWS_URL, ({ request }) => {
    const url = new URL(request.url)
    reviewsQueries.push(url.search)
    // 값이 빈 파라미터는 BE가 미입력이 아니라 형식 오류로 거절한다 — 스텁도 같이 거절해 회귀를 잡는다.
    for (const [key, value] of url.searchParams.entries()) {
      if (value === '') return errorAt(400, 90001, `${key}: 지원하지 않는 값입니다.`)
    }
    if (reviewsListError) {
      return errorAt(reviewsListError.status, reviewsListError.errorCode, reviewsListError.message)
    }

    const productId = url.searchParams.get('productId')
    const rating = url.searchParams.get('rating')
    const hasReply = url.searchParams.get('hasReply')
    const cursor = url.searchParams.get('cursor')
    const size = Number(url.searchParams.get('size') ?? '20')

    // 상품 범위만 반영한 집합 — summary가 이 집합을 센다(별점·답글 필터를 보지 않는다).
    const inScope = sellerReviews.filter(row => productId == null || row.productId === productId)
    const filtered = inScope.filter(row => {
      if (rating != null && row.rating !== Number(rating)) return false
      if (hasReply === 'true' && row.reply == null) return false
      if (hasReply === 'false' && row.reply != null) return false
      return true
    })

    const offset = cursor == null ? 0 : Number(cursor.slice(REVIEW_PAGE_CURSOR_PREFIX.length))
    if (Number.isNaN(offset)) return errorAt(400, 90002, '유효하지 않은 커서입니다.')
    const pageRows = filtered.slice(offset, offset + size)
    const nextOffset = offset + pageRows.length
    const hasNext = nextOffset < filtered.length

    const distribution: Record<string, number> = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 }
    for (const row of inScope)
      distribution[String(row.rating)] = (distribution[String(row.rating)] ?? 0) + 1
    const ratingSum = inScope.reduce((sum, row) => sum + row.rating, 0)

    return HttpResponse.json({
      data: {
        // 첫 페이지에만 싣는다 — 뒤 페이지에서 null이 오는 것이 계약이다.
        summary:
          cursor == null
            ? {
                reviewCount: inScope.length,
                averageRating:
                  inScope.length === 0
                    ? null
                    : Math.round((ratingSum / inScope.length) * 100) / 100,
                ratingDistribution: distribution,
              }
            : null,
        reviews: pageRows,
        totalCount: cursor == null ? filtered.length : null,
        nextCursor: hasNext ? `${REVIEW_PAGE_CURSOR_PREFIX}${nextOffset}` : null,
        hasNext,
      },
    })
  }),

  http.post(`${SELLER_REVIEWS_URL}/:reviewId/reply`, async ({ params, request }) => {
    const row = sellerReviews.find(review => review.reviewId === Number(params['reviewId']))
    // 남의 상품 리뷰·없는 리뷰·비노출 리뷰가 모두 같은 404다(403을 주지 않는다).
    if (!row) return errorAt(404, 110000, '리뷰를 찾을 수 없습니다.')
    if (row.reply) return errorAt(409, 110201, '이미 답글을 등록한 리뷰입니다.')
    const { content } = (await request.json()) as { content: string }
    const trimmed = content.trim()
    if (trimmed === '' || trimmed.length > 500)
      return errorAt(400, 90001, '답글은 1~500자여야 합니다.')
    const now = '2026-10-27T13:00:00'
    row.reply = {
      replyId: nextReplyId++,
      reviewId: row.reviewId,
      content: trimmed,
      repliedAt: now,
      updatedAt: now,
    }
    return HttpResponse.json({ data: row.reply }, { status: 201 })
  }),

  http.put(`${SELLER_REVIEWS_URL}/:reviewId/reply`, async ({ params, request }) => {
    const row = sellerReviews.find(review => review.reviewId === Number(params['reviewId']))
    if (!row) return errorAt(404, 110000, '리뷰를 찾을 수 없습니다.')
    if (!row.reply) return errorAt(404, 110200, '답글을 찾을 수 없습니다.')
    const { content } = (await request.json()) as { content: string }
    const trimmed = content.trim()
    if (trimmed === '' || trimmed.length > 500)
      return errorAt(400, 90001, '답글은 1~500자여야 합니다.')
    row.reply = { ...row.reply, content: trimmed, updatedAt: '2026-10-27T14:00:00' }
    return HttpResponse.json({ data: row.reply })
  }),

  http.delete(`${SELLER_REVIEWS_URL}/:reviewId/reply`, ({ params }) => {
    const row = sellerReviews.find(review => review.reviewId === Number(params['reviewId']))
    if (!row) return errorAt(404, 110000, '리뷰를 찾을 수 없습니다.')
    if (!row.reply) return errorAt(404, 110200, '답글을 찾을 수 없습니다.')
    row.reply = null
    return new HttpResponse(null, { status: 204 })
  }),
]

// BE StoreSettingsResponse 모양의 서버 상태(GET·PUT /sellers/me/store).
export interface StoreWire {
  sellerId: number
  status: 'ACTIVE' | 'PAUSED' | 'SUSPENDED' | 'WITHDRAWN' | 'WITHDRAWAL_REQUESTED'
  storeName: string
  brandIntro: string | null
  profileImageUrl: string | null
  profileImageKey: string | null
  bannerImageUrl: string | null
  bannerImageKey: string | null
  zipCode: string | null
  roadAddress: string | null
  detailAddress: string | null
  confirmedOrderCount: number
  telesalesNoticeStatus: 'NOT_REQUIRED' | 'REQUIRED' | 'NOTIFIED' | 'REGISTERED'
}

export interface StoreSettingsWire {
  isSeller: boolean
  applicationStatus: SellerApplicationWire['status'] | null
  store: StoreWire | null
}

export const DEFAULT_STORE: StoreWire = {
  sellerId: 7,
  status: 'ACTIVE',
  storeName: '애착상회',
  brandIntro: null,
  profileImageUrl: null,
  profileImageKey: null,
  bannerImageUrl: null,
  bannerImageKey: null,
  zipCode: null,
  roadAddress: null,
  detailAddress: null,
  confirmedOrderCount: 0,
  telesalesNoticeStatus: 'NOT_REQUIRED',
}

const DEFAULT_STORE_SETTINGS: StoreSettingsWire = {
  isSeller: true,
  applicationStatus: 'APPROVED',
  store: DEFAULT_STORE,
}

let storeSettings: StoreSettingsWire = { ...DEFAULT_STORE_SETTINGS, store: { ...DEFAULT_STORE } }

export function makeStoreWire(patch: Partial<StoreWire> = {}): StoreWire {
  return { ...DEFAULT_STORE, ...patch }
}

/** 인자 없이 부르면 승인된 활성 셀러 기본값으로 되돌린다. */
export function seedStoreSettings(state: StoreSettingsWire = DEFAULT_STORE_SETTINGS): void {
  storeSettings = { ...state, store: state.store ? { ...state.store } : null }
}

/** 핸들러가 저장한 현재 스토어 — 테스트가 PUT 본문 반영을 단언할 때 읽는다. */
export function currentStore(): StoreWire | null {
  return storeSettings.store ? { ...storeSettings.store } : null
}

interface StoreUpdateBody {
  storeName: string
  brandIntro?: string | null
  profileImageKey?: string | null
  bannerImageKey?: string | null
  zipCode?: string | null
  roadAddress?: string | null
  detailAddress?: string | null
}

const storeHandlers = [
  // 셀러가 아닌 계정도 200이다 — 한 화면이 입점 신청과 스토어 운영을 겸한다.
  http.get(SELLER_STORE_URL, () => HttpResponse.json({ data: { ...storeSettings } })),
  http.put(SELLER_STORE_URL, async ({ request }) => {
    const body = (await request.json()) as StoreUpdateBody
    const store = storeSettings.store
    // 자격 게이트가 본문 검증보다 앞선다(BE: 승격 전에 getActive).
    if (!store) return errorAt(403, 10004, '셀러로 등록되지 않은 계정입니다.')
    if (store.status !== 'ACTIVE') return errorAt(403, 10002, '활성 상태의 셀러만 이용할 수 있습니다.')
    // Bean Validation 미러 — 빈 상호와 길이 초과는 전부 90001이다(10006이 아니다).
    const tooLong =
      body.storeName.length > 100 ||
      (body.brandIntro?.length ?? 0) > 1000 ||
      (body.zipCode?.length ?? 0) > 10 ||
      (body.roadAddress?.length ?? 0) > 255 ||
      (body.detailAddress?.length ?? 0) > 255
    if (body.storeName.trim().length === 0 || tooLong) {
      return errorAt(400, 90001, '요청 본문이 올바르지 않습니다.')
    }
    storeSettings = {
      ...storeSettings,
      store: {
        ...store,
        storeName: body.storeName.trim(),
        brandIntro: body.brandIntro ?? null,
        profileImageKey: body.profileImageKey ?? null,
        bannerImageKey: body.bannerImageKey ?? null,
        zipCode: body.zipCode ?? null,
        roadAddress: body.roadAddress ?? null,
        detailAddress: body.detailAddress ?? null,
      },
    }
    return new HttpResponse(null, { status: 204 })
  }),
]

export const handlers = [
  ...sellerApplicationHandlers,
  ...sellerProductHandlers,
  ...productDraftHandlers,
  ...courierHandlers,
  ...sellerOrderHandlers,
  ...claimHandlers,
  ...shippingPolicyHandlers,
  ...storeHandlers,
  ...settlementHandlers,
  ...dashboardHandlers,
  ...inquiryHandlers,
  ...reviewsHandlers,
]
export const server = setupServer(...handlers)
