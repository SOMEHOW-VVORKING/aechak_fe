import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { API_PATH_PREFIX } from '@aechak/api'
import { PRODUCT_IMAGE_TYPES } from '@/features/products/products.contract'
import { MOCK_CATEGORY_TREE } from '@/features/products/products.mock'

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
export const SELLER_COURIERS_URL = `${sellerBase}/sellers/couriers`
export const SELLER_ORDERS_URL = `${sellerBase}/sellers/me/orders`
export const PRESIGNED_URL = `${apiBase}/files/presigned-url`
export const CATEGORIES_URL = `${apiBase}/categories`
export const WEB_REFRESH_URL = `${apiBase}/auth/web/refresh`

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
  // 카테고리 트리 — api 호스트다(셀러 모듈에는 이 컨트롤러가 없다). 목업 임시저장 시드와 id가 같아야
  // 프리필이 맞으므로 products.mock의 트리를 그대로 쓴다.
  http.get(CATEGORIES_URL, () => HttpResponse.json({ data: MOCK_CATEGORY_TREE })),
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

export const handlers = [
  ...sellerApplicationHandlers,
  ...sellerProductHandlers,
  ...courierHandlers,
  ...sellerOrderHandlers,
]
export const server = setupServer(...handlers)
