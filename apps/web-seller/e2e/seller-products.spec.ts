import { test, expect, type Page, type Route } from '@playwright/test'

// 셀러 상품 등록 → 목록 반영 → 판매 상태/재고 E2E (SCRUM-119/120).
// 상품 화면이 실 API로 전환돼 더 이상 메모리 목업이 아니므로, 실백엔드 없이 `page.route` 스텁으로
// 서버 계약을 재현한다. 페이지(5173) → seller API(8081)/api API(8080)가 교차 출처 +
// withCredentials라 fulfill 응답에 CORS 헤더(정확한 origin + Allow-Credentials)가 필요하고
// OPTIONS 프리플라이트도 받아 줘야 한다(seller-onboarding.spec의 CORS/fulfillJson을 그대로 쓴다).
//
// 삭제·임시저장·상품 수정 진입점은 BE에 대응이 없어 화면에서 막혔다 — 그 사실 자체를 AC-SPRD-E2E-003이
// 고정한다.

const ORIGIN = 'http://localhost:5173'
// 스텁 글롭에 origin까지 적는다 — `**/api/v1/...`은 호스트를 가르지 않아서 요청이 엉뚱한 모듈로
// 새도 같은 스텁이 받아 준다(그러면 E2E가 호스트 오배치를 영영 못 잡는다). 두 값은 main.tsx가
// 환경변수 없을 때 쓰는 기본값이고, E2E는 .env 없이 `pnpm dev`로 뜨므로 실제로 이 origin이 쓰인다.
const API_ORIGIN = 'http://localhost:8080'
const SELLER_ORIGIN = 'http://localhost:8081'
const CORS = {
  'Access-Control-Allow-Origin': ORIGIN,
  'Access-Control-Allow-Credentials': 'true',
}

function fulfillJson(route: Route, status: number, json: unknown) {
  if (route.request().method() === 'OPTIONS') {
    return route.fulfill({
      status: 204,
      headers: {
        ...CORS,
        'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE',
        // 헤더를 이름으로 적는다 — `*`는 프리플라이트가 묻는 헤더를 전부 덮어 버려서, 공유
        // 클라이언트가 Authorization을 붙이기 시작하는 순간의 CORS 회귀를 가려 준다.
        'Access-Control-Allow-Headers': 'Authorization,Content-Type',
      },
    })
  }
  return route.fulfill({ status, headers: CORS, json })
}

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
)

test.use({ viewport: { width: 1440, height: 900 } })

// PR 첨부용 캡처(test-results는 gitignore). dev 전용 Query Devtools 버튼이 찍히지 않게 숨긴다.
async function shot(page: Page, name: string) {
  await page.addStyleTag({
    content:
      '.tsqd-parent-container,.tsqd-open-btn-container,[aria-label*="query devtools" i],[aria-label*="Tanstack" i]{display:none!important}',
  })
  await page.screenshot({ path: `test-results/pr-c/${name}.png`, animations: 'disabled' })
}

/** refresh(200) — 세션 유지를 재현한다(401이 새면 화면이 /login으로 튕긴다). */
async function stubSession(page: Page) {
  await page.route(`${API_ORIGIN}/api/v1/auth/web/refresh`, route =>
    fulfillJson(route, 200, { data: { accessToken: 'e2e-token', tokenType: 'Bearer', expiresIn: 1800 } }),
  )
}

// 카테고리 트리는 api 모듈(8080)이 소유한다 — seller 모듈에는 이 컨트롤러가 없다. 등록 폼의 연쇄
// Select가 이 트리로 그려지므로 소분류(depth 3)까지 들어 있어야 한다.
const CATEGORY_TREE = [
  {
    categoryId: 2,
    name: '고양이',
    iconUrl: null,
    sortOrder: 0,
    children: [
      {
        categoryId: 209,
        name: '식기/급수기',
        iconUrl: null,
        sortOrder: 0,
        children: [
          { categoryId: 20901, name: '자동 급식기', iconUrl: null, sortOrder: 0, children: [] },
          { categoryId: 20902, name: '급수기', iconUrl: null, sortOrder: 1, children: [] },
        ],
      },
      {
        categoryId: 204,
        name: '위생/미용',
        iconUrl: null,
        sortOrder: 1,
        children: [{ categoryId: 20401, name: '모래', iconUrl: null, sortOrder: 0, children: [] }],
      },
    ],
  },
]

async function stubCategories(page: Page) {
  await page.route(`${API_ORIGIN}/api/v1/categories*`, route =>
    fulfillJson(route, 200, { data: CATEGORY_TREE }),
  )
}

// presigned 발급(api 모듈) → 발급받은 url에 PUT. 실제 S3 대신 같은 출처의 가짜 경로로 돌려 CORS를
// 한 겹 줄인다(서명 검증은 서버 몫이라 E2E에서 재현할 것이 없다).
async function stubUpload(page: Page) {
  let seq = 0
  const issuedContentTypes = new Map<string, string>()
  await page.route(`${API_ORIGIN}/api/v1/files/presigned-url`, route => {
    if (route.request().method() === 'OPTIONS') return fulfillJson(route, 204, null)
    seq += 1
    const key = `tmp/1/products/e2e-${seq}.png`
    const body = (route.request().postDataJSON() ?? {}) as { contentType?: string }
    if (body.contentType) issuedContentTypes.set(key, body.contentType)
    return fulfillJson(route, 200, { data: { url: `${ORIGIN}/__fake-s3/${key}`, key } })
  })
  // S3가 서명으로 거절하는 두 조건을 재현한다(MSW 쪽 PUT 스텁과 같은 기준) — 무엇을 보내도 200이면
  // "Authorization을 얹지 않는다 / Content-Type은 발급값과 같다"는 업로드 모듈의 계약이 검증되지 않는다.
  await page.route(`${ORIGIN}/__fake-s3/**`, route => {
    const headers = route.request().headers() // 키는 소문자다
    const key = new URL(route.request().url()).pathname.replace('/__fake-s3/', '')
    const issued = issuedContentTypes.get(key)
    const sent = (headers['content-type'] ?? '').split(';')[0]!.trim().toLowerCase()
    if (headers['authorization'] || (issued !== undefined && sent !== issued.toLowerCase())) {
      return route.fulfill({ status: 403, body: '' })
    }
    return route.fulfill({ status: 200, body: '' })
  })
}

interface ProductRow {
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

interface CombinationRow {
  optionCombinationId: number
  name: string
  additionalPrice: number
  stockQuantity: number
  isActive: boolean
}

/** 단건 조회 응답 — 목록에 없는 값(카테고리·설명·할인 기간·추가/상세 이미지 키)이 프리필의 본질이다. */
interface DetailRow {
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
  saleStatus: ProductRow['saleStatus']
  inspectionStatus: ProductRow['inspectionStatus']
}

const detailOf = (product: ProductRow, overrides: Partial<DetailRow> = {}): DetailRow => ({
  productId: product.productId,
  categoryId: 20901,
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
  ...overrides,
})

const row = (overrides: Partial<ProductRow> & Pick<ProductRow, 'productId' | 'name'>): ProductRow => ({
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
})

const SEED_ROWS: ProductRow[] = [
  row({
    productId: '01JE2EFEEDER00000000000001',
    name: '고양이 자동 급식기 스마트 5L',
    regularPrice: 64000,
    totalStock: 128,
  }),
  row({
    productId: '01JE2EHARNESS0000000000002',
    name: '산책 하네스 세트',
    categoryName: '하네스',
    regularPrice: 25000,
    saleStatus: 'SUSPENDED',
    totalStock: 10,
  }),
  row({
    productId: '01JE2ESNACK000000000000003',
    name: '유기농 동결건조 간식 닭가슴살',
    categoryName: '동결건조 간식',
    regularPrice: 15000,
    discountPrice: 12500,
    discountRate: 17,
    totalStock: 54,
  }),
]

/**
 * 셀러 상품 6종(쓰는 것은 5종)을 상태 있게 스텁한다. 목록 쿼리는 그대로 기록해 두어 "빈 값 파라미터가
 * 빠졌는지"와 "배열이 반복 파라미터인지"를 테스트가 직접 단언한다.
 */
function stubSellerProducts(page: Page) {
  let products: ProductRow[] = SEED_ROWS.map(r => ({ ...r }))
  const options = new Map<string, CombinationRow[]>(
    SEED_ROWS.map(r => [
      r.productId,
      [{ optionCombinationId: 1, name: '기본', additionalPrice: 0, stockQuantity: r.totalStock, isActive: true }],
    ]),
  )
  const details = new Map<string, DetailRow>(
    SEED_ROWS.map(r => [
      r.productId,
      detailOf(
        r,
        // 급식기 한 건만 "목록에 없는 값"을 전부 채워 둔다 — 프리필 왕복을 그 상품으로 검증한다.
        r.productId === '01JE2EFEEDER00000000000001'
          ? {
              description: '5L 대용량 자동 급식기',
              discountPrice: 59000,
              discountStartAt: '2026-10-01T15:30:00',
              discountEndAt: '2026-10-31T18:00:00',
              thumbnailImageKey: 'products/E2E-THUMB.png',
              additionalImageKeys: ['products/E2E-ADD1.png'],
              detailImageKeys: ['products/E2E-DETAIL1.png'],
            }
          : {},
      ),
    ]),
  )
  const queries: string[] = []
  const updateBodies: unknown[] = []
  let idSeq = 0
  let combinationSeq = 100

  const activeStock = (productId: string) =>
    (options.get(productId) ?? []).reduce((sum, c) => sum + (c.isActive ? c.stockQuantity : 0), 0)

  // Product.applyStockDerivedStatus — ON_SALE + 재고 없음 → OUT_OF_STOCK, 그 반대도 성립.
  // SUSPENDED/ENDED는 유지한다.
  const derive = (product: ProductRow) => {
    product.totalStock = activeStock(product.productId)
    if (product.saleStatus === 'ON_SALE' && product.totalStock === 0) product.saleStatus = 'OUT_OF_STOCK'
    else if (product.saleStatus === 'OUT_OF_STOCK' && product.totalStock > 0) product.saleStatus = 'ON_SALE'
  }

  const route = page.route(`${SELLER_ORIGIN}/api/v1/sellers/me/products**`, async r => {
    const request = r.request()
    if (request.method() === 'OPTIONS') return fulfillJson(r, 204, null)
    const url = new URL(request.url())
    const segments = url.pathname.replace('/api/v1/sellers/me/products', '').split('/').filter(Boolean)

    // GET 목록 / POST 등록
    if (segments.length === 0) {
      if (request.method() === 'POST') {
        const body = request.postDataJSON() as {
          categoryId: number
          productName: string
          regularPrice: number
          discountPrice?: number | null
          optionCombinations: { optionValues: string[]; additionalPrice: number; stockQuantity: number }[]
        }
        idSeq += 1
        const created = row({
          productId: `01JE2ENEW${String(idSeq).padStart(17, '0')}`,
          name: body.productName,
          regularPrice: body.regularPrice,
          discountPrice: body.discountPrice ?? null,
          totalStock: body.optionCombinations.reduce((sum, c) => sum + c.stockQuantity, 0),
        })
        products = [created, ...products]
        details.set(created.productId, detailOf(created, { categoryId: body.categoryId }))
        options.set(
          created.productId,
          body.optionCombinations.map(c => ({
            optionCombinationId: ++combinationSeq,
            name: c.optionValues.join(' / ') || '기본',
            additionalPrice: c.additionalPrice,
            stockQuantity: c.stockQuantity,
            isActive: true,
          })),
        )
        return fulfillJson(r, 201, {
          data: {
            productId: created.productId,
            saleStatus: 'ON_SALE',
            inspectionStatus: 'APPROVED',
            versionNo: 1,
            createdAt: created.createdAt,
          },
        })
      }
      queries.push(url.search.replace(/^\?/, ''))
      const params = url.searchParams
      // 값이 빈 파라미터는 BE가 미입력이 아니라 형식 오류(400/90001)로 거절한다.
      for (const [key, value] of params.entries()) {
        if (value === '') return fulfillJson(r, 400, { errorCode: 90001, message: `${key}: 지원하지 않는 값입니다.` })
      }
      const keyword = params.get('keyword')?.toLowerCase()
      const saleStatus = params.getAll('saleStatus')
      const stock = params.get('stock')
      const createdFrom = params.get('createdFrom')
      const createdTo = params.get('createdTo')
      const matched = products.filter(p => {
        if (keyword && !p.name.toLowerCase().includes(keyword)) return false
        if (saleStatus.length > 0 && !saleStatus.includes(p.saleStatus)) return false
        // BE는 "재고가 남은 활성 조합의 존재 여부"로 가른다.
        if (stock === 'in_stock' && p.totalStock === 0) return false
        if (stock === 'sold_out' && p.totalStock > 0) return false
        const createdDate = p.createdAt.slice(0, 10)
        if (createdFrom && createdDate < createdFrom) return false
        if (createdTo && createdDate > createdTo) return false
        return true
      })
      const size = Number(params.get('size') ?? 20)
      const page_ = Number(params.get('page') ?? 0)
      const totalPages = Math.ceil(matched.length / size)
      return fulfillJson(r, 200, {
        data: {
          products: matched.slice(page_ * size, (page_ + 1) * size),
          totalCount: matched.length,
          page: page_,
          size,
          totalPages,
          hasNext: page_ + 1 < totalPages,
        },
      })
    }

    const product = products.find(p => p.productId === segments[0])
    if (!product) return fulfillJson(r, 404, { errorCode: 40000, message: '상품을 찾을 수 없습니다.' })

    // GET 단건(수정 폼 프리필) / PUT 수정 — 이미지 키는 현재 열려 있는 행만 내려주므로 응답을
    // 그대로 되돌려 보내는 왕복이 성립한다.
    if (segments.length === 1) {
      const detail = details.get(product.productId)
      if (!detail) return fulfillJson(r, 404, { errorCode: 40000, message: '상품을 찾을 수 없습니다.' })
      if (request.method() === 'GET') return fulfillJson(r, 200, { data: detail })
      const body = request.postDataJSON() as Partial<DetailRow> & {
        categoryId: number
        productName: string
        regularPrice: number
        thumbnailImageKey: string
      }
      updateBodies.push(body)
      const next: DetailRow = {
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
      }
      details.set(product.productId, next)
      product.name = next.productName
      product.regularPrice = next.regularPrice
      product.discountPrice = next.discountPrice
      product.discountRate =
        next.discountPrice == null
          ? null
          : Math.round(((next.regularPrice - next.discountPrice) * 100) / next.regularPrice)
      return fulfillJson(r, 200, {
        data: { productId: product.productId, saleStatus: product.saleStatus, updatedAt: '2026-10-07T11:00:00' },
      })
    }

    // PATCH 판매 상태 — 재고 파생 전이가 같은 요청 안에서 동기로 얹힌다.
    if (segments[1] === 'status') {
      const { saleStatus } = request.postDataJSON() as { saleStatus: 'ON_SALE' | 'SUSPENDED' }
      product.saleStatus = saleStatus
      derive(product)
      return fulfillJson(r, 200, {
        data: { productId: product.productId, saleStatus: product.saleStatus, updatedAt: '2026-10-07T11:00:00' },
      })
    }

    if (segments[1] === 'options') {
      const combinations = options.get(product.productId) ?? []
      // GET 옵션 조회
      if (segments.length === 2) return fulfillJson(r, 200, { data: { optionCombinations: combinations } })
      // PATCH 재고·판매 여부 — 결과 재고를 0 이상으로 자르고 실제 반영량만 돌려준다.
      const combination = combinations.find(c => c.optionCombinationId === Number(segments[2]))
      if (!combination) return fulfillJson(r, 404, { errorCode: 40000, message: '상품을 찾을 수 없습니다.' })
      const body = request.postDataJSON() as { stockDelta?: number; isActive?: boolean }
      const before = combination.stockQuantity
      if (body.stockDelta != null) combination.stockQuantity = Math.max(before + body.stockDelta, 0)
      if (body.isActive != null) combination.isActive = body.isActive
      derive(product)
      return fulfillJson(r, 200, {
        data: {
          combinationId: combination.optionCombinationId,
          stockQuantity: combination.stockQuantity,
          appliedStockDelta: combination.stockQuantity - before,
          isActive: combination.isActive,
          updatedAt: '2026-10-07T11:00:00',
        },
      })
    }

    return fulfillJson(r, 404, { errorCode: 40000, message: '상품을 찾을 수 없습니다.' })
  })

  return { ready: route, queries, updateBodies }
}

/**
 * 배송 정책 요약 + 택배사 마스터 — 상품 등록/수정 폼의 배송 정책 칸이 둘 다 부른다(SCRUM-293).
 * 스텁이 없으면 그 칸이 "불러오지 못했어요"로 떨어지고, 더 나쁘게는 요청이 엉뚱한 호스트로
 * 새도 아무도 모른다. 두 경로 모두 seller 모듈이라 글롭에 seller origin을 적는다.
 */
async function stubShippingPolicy(page: Page) {
  await page.route(`${SELLER_ORIGIN}/api/v1/sellers/couriers`, route =>
    fulfillJson(route, 200, {
      data: {
        items: [
          { courierCode: 'CJ', courierName: 'CJ대한통운', trackingFormatPattern: '^\\d{10,12}$' },
          { courierCode: 'LOTTE', courierName: '롯데택배', trackingFormatPattern: null },
        ],
      },
    }),
  )
  await page.route(`${SELLER_ORIGIN}/api/v1/sellers/me/shipping-policy`, route =>
    fulfillJson(route, 200, {
      data: {
        defaultCourierCode: 'CJ',
        baseShippingFee: 3000,
        freeShippingThreshold: 30000,
        originZipCode: '04035',
        originRoadAddress: '서울 마포구 와우산로 00',
        originDetailAddress: '물류 1센터',
        returnSameAsOrigin: true,
        returnZipCode: null,
        returnRoadAddress: null,
        returnDetailAddress: null,
        jejuExtraFee: 3000,
        remoteAreaExtraFee: 5000,
        returnFee: 4000,
        exchangeFee: 8000,
        avgDispatchDays: 1,
        shippingPolicyText: null,
      },
    }),
  )
}

async function stubAll(page: Page) {
  await stubSession(page)
  await stubCategories(page)
  await stubUpload(page)
  await stubShippingPolicy(page)
  const products = stubSellerProducts(page)
  await products.ready
  return products
}

async function openNewProductForm(page: Page) {
  await page.goto('/products')
  await page.getByRole('button', { name: '상품 등록' }).click()
  await expect(page.getByRole('heading', { name: '상품 등록' })).toBeVisible()
  // 배송 정책 칸은 셀러 단위 정책을 읽어 요약만 보여 준다(상품 본문에 싣지 않는다).
  await expect(
    page.getByText('CJ대한통운 / 기본 배송비 3,000원 / 30,000원 이상 무료배송'),
  ).toBeVisible()
}

test('[AC-SPRD-E2E-001] 상품 등록 → 목록 맨 앞 판매중 → 재고 0으로 자동 품절 → 판매 중지', async ({ page }) => {
  await stubAll(page)
  const name = 'E2E 원목 스크래쳐'
  await openNewProductForm(page)

  // 빈 폼 제출 — 첫 누락 필드(상품명)로 스크롤/포커스 + 안내 말풍선(CRQ-PRD-02).
  await page.getByRole('button', { name: '등록하기' }).click()
  await expect(page.getByRole('tooltip')).toHaveText('상품명을 입력해 주세요')
  const nameInput = page.getByLabel('상품명')
  await expect(nameInput).toBeFocused()
  await expect(nameInput).toBeInViewport()
  await shot(page, '03-form-required-tooltip')

  await nameInput.fill(name)
  await page.getByLabel('대분류').selectOption({ label: '고양이' })
  await page.getByLabel('중분류').selectOption({ label: '식기/급수기' })
  await page.getByLabel('소분류').selectOption({ label: '자동 급식기' })
  await page.getByLabel('정가').fill('30000')
  await page
    .getByRole('group', { name: '대표 썸네일' })
    .locator('input[type=file]')
    .setInputFiles({ name: 'a.png', mimeType: 'image/png', buffer: PNG_1X1 })
  await page.getByLabel('재고', { exact: true }).fill('10')
  await page.getByRole('button', { name: '등록하기' }).click()

  // 완료 알림은 state로 옮기고 saved 파라미터는 바로 지운다.
  await expect(page).toHaveURL(/\/products$/)
  await expect(page.getByText('상품을 등록했어요.')).toBeVisible()
  const created = page.getByRole('row').filter({ hasText: name })
  await expect(page.getByRole('row').nth(1)).toContainText(name)
  await expect(created.getByText('판매중', { exact: true })).toBeVisible()
  await shot(page, '01-list-after-register')

  // 옵션 없는 상품의 기본 조합 재고를 0으로(증감 -10) → 자동 품절(CRQ-PRD-06).
  await created.getByRole('button', { name: `${name} 재고 10개 수정` }).click()
  const drawer = page.getByRole('dialog', { name: '옵션별 재고' })
  await drawer.getByLabel('기본 재고', { exact: true }).fill('0')
  await drawer.getByRole('button', { name: '기본 재고 저장' }).click()
  await expect(page.getByText('재고를 저장했어요.')).toBeVisible()
  await expect(created.getByText('품절', { exact: true })).toBeVisible()
  await shot(page, '02-inventory-drawer')
  await page.keyboard.press('Escape')

  // 판매 토글 끄기 → 확인 Modal → 판매 중지.
  await created.getByRole('switch', { name: `${name} 판매` }).click()
  const suspend = page.getByRole('dialog', { name: '판매를 중지할까요?' })
  await expect(suspend).toBeVisible()
  await shot(page, '06-suspend-confirm-modal')
  await suspend.getByRole('button', { name: '판매 중지' }).click()
  await expect(created.getByText('판매 중지', { exact: true })).toBeVisible()
})

test('[AC-SPRD-E2E-002] 목록 필터는 빈 값 없이 나가고 판매 상태는 반복 파라미터로 거른다', async ({ page }) => {
  const { queries } = await stubAll(page)
  await page.goto('/products')
  await expect(page.getByRole('row')).toHaveCount(4) // 헤더 + 시드 3건

  await page.getByRole('combobox', { name: '판매 상태' }).selectOption({ label: '판매 중지' })
  await expect(page.getByRole('row')).toHaveCount(2)
  await expect(page.getByRole('row').nth(1)).toContainText('산책 하네스 세트')

  await page.getByPlaceholder('상품명 검색').fill('없는상품명')
  await expect(page.getByText('조건에 맞는 상품이 없어요.')).toBeVisible()
  await shot(page, '05-list-filter-empty')

  await page.getByRole('button', { name: '초기화' }).click()
  await expect(page.getByRole('row')).toHaveCount(4)

  // 재고('전체'를 빈 문자열로 들고 있는 Select)와 등록일(빈 날짜)도 같은 함정이다.
  await page.getByRole('combobox', { name: '재고' }).selectOption({ label: '품절' })
  await expect(page.getByText('조건에 맞는 상품이 없어요.')).toBeVisible() // 시드는 전부 재고가 있다
  await page.getByRole('combobox', { name: '재고' }).selectOption({ label: '재고 있음' })
  await expect(page.getByRole('row')).toHaveCount(4)
  await page.getByLabel('등록일 종료').fill('2026-10-06')
  await expect(page.getByText('조건에 맞는 상품이 없어요.')).toBeVisible() // 시드는 10-07 등록
  // 시작일 > 종료일은 BE가 400/90001로 거절한다 — 시작일 입력의 max가 종료일로 묶인다.
  await expect(page.getByLabel('등록일 시작')).toHaveAttribute('max', '2026-10-06')

  // 첫 조회는 비어 있는 키워드/카테고리/상태/재고/등록일 키가 아예 없어야 한다. BE가 빈 값을
  // 400/90001로 거절하는 것은 `stock`·`createdFrom`·`createdTo`·`saleStatus`·`inspectionStatus`·
  // `sort`이고 `keyword`·`category`는 빈 값을 미입력으로 접는다 — FE는 캐시 키를 하나로 모으려고
  // 여섯뿐 아니라 전부 키째 뺀다.
  const first = new URLSearchParams(queries[0])
  expect(first.has('keyword')).toBe(false)
  expect(first.has('category')).toBe(false)
  expect(first.has('saleStatus')).toBe(false)
  expect(first.has('inspectionStatus')).toBe(false)
  expect(first.has('stock')).toBe(false)
  expect(first.has('createdFrom')).toBe(false)
  expect(first.has('createdTo')).toBe(false)
  expect(first.get('sort')).toBe('latest')
  expect(first.get('page')).toBe('0')
  // 어느 조회에도 값 없는 파라미터와 `k[]=` 배열 표기가 섞이지 않는다.
  for (const query of queries) {
    expect(query).not.toMatch(/(^|&)[^=&]+=(&|$)/)
    expect(query).not.toContain('%5B%5D')
  }
  expect(queries.some(q => new URLSearchParams(q).getAll('saleStatus').includes('SUSPENDED'))).toBe(true)
  expect(queries.some(q => new URLSearchParams(q).get('stock') === 'sold_out')).toBe(true)
  expect(queries.some(q => new URLSearchParams(q).get('createdTo') === '2026-10-06')).toBe(true)
})

test('[AC-SPRD-E2E-003] BE 미지원 기능(삭제·임시저장)은 진입점이 없다', async ({ page }) => {
  await stubAll(page)
  await page.goto('/products')
  await expect(page.getByRole('row')).toHaveCount(4)

  await expect(page.getByRole('button', { name: '삭제', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /임시저장/ })).toHaveCount(0)
  await expect(page.getByText(/옵션 구성과 상품 삭제는 아직 바꿀 수 없어요/)).toBeVisible()
})

test('[AC-SPRD-E2E-005] 목록 수정 → 단건 조회 프리필 → 저장이 저장 키와 할인 시각을 그대로 되돌려 보낸다', async ({
  page,
}) => {
  const { updateBodies } = await stubAll(page)
  await page.goto('/products')
  const feeder = page.getByRole('row').filter({ hasText: '고양이 자동 급식기 스마트 5L' })

  await feeder.getByRole('button', { name: '고양이 자동 급식기 스마트 5L 수정' }).click()
  await expect(page).toHaveURL(/\/products\/01JE2EFEEDER00000000000001\/edit$/)

  // 목록 응답에 없는 값까지 단건 조회로 복원된다.
  await expect(page.getByLabel('상품명')).toHaveValue('고양이 자동 급식기 스마트 5L')
  await expect(page.getByLabel('소분류')).toHaveValue('20901')
  await expect(page.getByLabel('상세 설명')).toHaveValue('5L 대용량 자동 급식기')
  await expect(page.getByLabel('할인가')).toHaveValue('59000')
  await expect(page.getByLabel('할인 시작일')).toHaveValue('2026-10-01')
  await shot(page, '08-edit-prefilled')

  await page.getByLabel('상품명').fill('고양이 자동 급식기 스마트 5L v2')
  await page.getByRole('button', { name: '수정 완료' }).click()

  await expect(page).toHaveURL(/\/products$/)
  await expect(page.getByText('상품을 수정했어요.')).toBeVisible()
  await expect(page.getByRole('row').filter({ hasText: '고양이 자동 급식기 스마트 5L v2' })).toBeVisible()

  // 저장 키를 그대로 되돌려 보내야 한다 — 빠뜨리면 그 이미지가 직전 버전으로 닫히고, 닫힌 과거 키를
  // 섞으면 403/100002다. 날짜를 안 건드렸으므로 할인 시각(15:30)도 보존돼야 한다.
  expect(updateBodies).toHaveLength(1)
  expect(updateBodies[0]).toMatchObject({
    categoryId: 20901,
    productName: '고양이 자동 급식기 스마트 5L v2',
    description: '5L 대용량 자동 급식기',
    discountPrice: 59000,
    discountStartAt: '2026-10-01T15:30:00',
    discountEndAt: '2026-10-31T18:00:00',
    thumbnailImageKey: 'products/E2E-THUMB.png',
    additionalImageKeys: ['products/E2E-ADD1.png'],
    detailImageKeys: ['products/E2E-DETAIL1.png'],
  })
})

test('[AC-SPRD-E2E-006] 없는 상품의 수정 주소는 폼 대신 찾을 수 없다는 안내로 끝난다', async ({ page }) => {
  await stubAll(page)

  await page.goto('/products/01JE2ENOPE0000000000000000/edit')

  await expect(page.getByText('상품을 찾을 수 없어요')).toBeVisible()
  await expect(page.getByLabel('상품명')).toHaveCount(0)
  await shot(page, '09-edit-not-found')
  await page.getByRole('button', { name: '목록으로' }).click()
  await expect(page).toHaveURL(/\/products$/)
})

test('[AC-SPRD-E2E-004] 옵션 그룹 두 개를 만들면 조합 매트릭스가 곱집합으로 생긴다', async ({ page }) => {
  await stubAll(page)
  await openNewProductForm(page)

  await page.getByRole('switch', { name: '옵션 사용' }).click()
  const groups = [
    { name: '색상', values: ['화이트', '블랙'] },
    { name: '용량', values: ['3L', '5L'] },
  ]
  for (const [i, group] of groups.entries()) {
    if (i > 0) await page.getByRole('button', { name: '옵션 추가' }).click()
    await page.getByLabel(`옵션명 ${i + 1}`).fill(group.name)
    for (const value of group.values) {
      await page.getByLabel(`옵션값 ${i + 1} 입력`).fill(value)
      await page.getByLabel(`옵션값 ${i + 1} 입력`).press('Enter')
    }
  }

  await expect(page.getByText('조합 옵션 / 4개 조합')).toBeVisible()
  await page.getByLabel('화이트 / 5L 추가 금액').fill('3000')
  await page.getByLabel('화이트 / 5L 재고').fill('12')
  await page.getByLabel('화이트 / 5L 재고').scrollIntoViewIfNeeded()
  await shot(page, '04-option-combination-matrix')
})
