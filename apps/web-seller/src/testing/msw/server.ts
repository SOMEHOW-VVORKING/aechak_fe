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

export const handlers = [
  ...sellerApplicationHandlers,
  ...sellerProductHandlers,
  ...courierHandlers,
  ...claimHandlers,
]
export const server = setupServer(...handlers)
