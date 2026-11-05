import { http, HttpResponse } from 'msw'
import { adminBase, clampSize, errorBody } from './base'

// `/admin/products` 셋(목록·판매중지·재개)과 검토 큐의 승인·반려 둘을 흉내 내는 서버 상태.
// 상품 카탈로그 화면(SCRUM-363)의 조작은 **서버에서 두 곳으로 갈린다** — 가리는 일(반려)과
// 판매를 잠그는 일(중지)이 서로 다른 축이고 같은 상품 행에 함께 실린다. 그래서 두 경로의
// 상태를 한 모듈에서 들고, 승인이 막음을 풀지 않고 재개가 반려를 풀지 않는다는 성질을 여기서
// 지킨다(둘을 다른 모듈에 두면 그 독립성을 아무도 확인하지 않는다).
//
// 거절 분기를 서버와 같게 두는 것이 이 파일의 목적이다. 화면의 에러 문구가 errorCode로
// 갈라지므로(40500·40008·40009·40011), 더블이 코드를 뭉개면 "낡은 화면"과 "권한 없음"을 같은
// 문장으로 안내하는 회귀가 통과한다.

export const ADMIN_PRODUCTS_URL = `${adminBase}/admin/products`
export const ADMIN_PRODUCT_SUSPEND_URL = `${ADMIN_PRODUCTS_URL}/:productId/sale-suspensions`
export const ADMIN_PRODUCT_RESUME_URL = `${ADMIN_PRODUCT_SUSPEND_URL}/release`

/**
 * 검토 큐 경로. 큐 목록 핸들러는 `server.ts`에 있지만 **URL 상수는 여기서 소유한다** — 승인·반려가
 * 이 파일의 상품 상태를 바꾸므로 경로 문자열이 두 파일에 흩어지면 한쪽만 고쳐도 조용히 어긋난다.
 */
export const ADMIN_PRODUCT_INSPECTIONS_URL = `${adminBase}/admin/product-inspections`
export const ADMIN_PRODUCT_APPROVE_URL = `${ADMIN_PRODUCT_INSPECTIONS_URL}/:productId/approve`
export const ADMIN_PRODUCT_REJECT_URL = `${ADMIN_PRODUCT_INSPECTIONS_URL}/:productId/reject`

export type WireSaleStatus = 'ON_SALE' | 'OUT_OF_STOCK' | 'SUSPENDED' | 'ENDED'
export type WireProductInspectionStatus = 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED'

const SALE_STATUSES: WireSaleStatus[] = ['ON_SALE', 'OUT_OF_STOCK', 'SUSPENDED', 'ENDED']
const INSPECTION_STATUSES: WireProductInspectionStatus[] = [
  'DRAFT',
  'PENDING',
  'APPROVED',
  'REJECTED',
]

const REASON_MAX = 500
const SUSPENDED_AT = '2026-11-04T14:20:00'

/**
 * BE `AdminProductSummary` + 응답에 싣지 않는 서버 내부 상태. 내부 값을 함께 들고 있는 이유는
 * 거절·전이가 그 값에 달려 있기 때문이다 — 응답 모양만 흉내 내면 재개가 "막기 직전 상태로
 * 되돌린다"를 지키는지, 승인이 열린 검토 행 없이 409가 되는지를 테스트가 볼 수 없다.
 */
export interface AdminProductWire {
  /** 정렬 키. 서버 정렬은 상품 내부 id 내림차순(= 등록 역순) 고정이고 정렬 파라미터가 없다. */
  internalId: number
  productId: string
  productName: string
  sellerId: number
  /** 셀러 행이 없으면 null — products.seller_id는 FK 없는 값 참조다(조회 실패가 아니다). */
  storeName: string | null
  categoryName: string
  /** 응답에 없는 필터 축. `categoryId`는 그 노드와 하위 전부를 잡지만 더블은 노드 일치로 둔다. */
  categoryId: number
  regularPrice: number
  discountPrice: number | null
  saleStatus: WireSaleStatus
  inspectionStatus: WireProductInspectionStatus
  reportCount: number
  adminSaleSuspended: boolean
  adminSaleSuspendedAt: string | null
  adminSaleSuspendReason: string | null
  createdAt: string
  /** 재고 유무. 재개가 ON_SALE로 되돌릴지 OUT_OF_STOCK로 떨어뜨릴지를 가른다. */
  inStock: boolean
  /** 막기 직전 판매 상태. 막혀 있지 않으면 null이고 재개가 이 값을 되돌린다. */
  saleStatusBeforeSuspension: WireSaleStatus | null
  /** 관리자 확인을 기다리는 검토 행이 열려 있는지. 없으면 승인·반려가 409/40500이다. */
  openInspectionReview: boolean
}

let products: AdminProductWire[] = []

export function makeAdminProductWire(
  overrides: Partial<AdminProductWire> = {},
): AdminProductWire {
  return {
    internalId: 9001,
    productId: '01JCATALOGPRODUCT000000001',
    productName: '동결건조 닭가슴살 100g',
    sellerId: 4101,
    storeName: '냥이상점',
    categoryName: '간식',
    categoryId: 31,
    regularPrice: 18000,
    discountPrice: null,
    saleStatus: 'ON_SALE',
    inspectionStatus: 'APPROVED',
    reportCount: 0,
    adminSaleSuspended: false,
    adminSaleSuspendedAt: null,
    adminSaleSuspendReason: null,
    createdAt: '2026-10-28T11:05:00',
    inStock: true,
    saleStatusBeforeSuspension: null,
    openInspectionReview: false,
    ...overrides,
  }
}

export function seedAdminProducts(rows: AdminProductWire[] = []): void {
  products = rows.map(row => ({ ...row }))
}

/** 핸들러가 반영한 현재 상품 상태 — 테스트가 중지·재개·승인·반려의 부작용을 읽는다. */
export function currentAdminProduct(productId: string): AdminProductWire | null {
  const found = products.find(row => row.productId === productId)
  return found ? { ...found } : null
}

/** 응답에 싣는 필드만 투영한다 — 내부 상태가 새어 나가면 화면이 없는 값에 기댈 수 있다. */
function summaryOf(row: AdminProductWire) {
  return {
    productId: row.productId,
    productName: row.productName,
    sellerId: row.sellerId,
    storeName: row.storeName,
    categoryName: row.categoryName,
    regularPrice: row.regularPrice,
    discountPrice: row.discountPrice,
    saleStatus: row.saleStatus,
    inspectionStatus: row.inspectionStatus,
    reportCount: row.reportCount,
    adminSaleSuspended: row.adminSaleSuspended,
    adminSaleSuspendedAt: row.adminSaleSuspendedAt,
    adminSaleSuspendReason: row.adminSaleSuspendReason,
    createdAt: row.createdAt,
  }
}

/**
 * 상태 필터 해석. 서버는 **대소문자를 무시하고 알 수 없는 값은 400이 아니라 조건 없음**으로 본다 —
 * 필터 오타가 빈 목록이 아니라 전수 조회로 조용히 번지는 모양이라, 더블이 400으로 끊으면 화면이
 * 서버 enum 이름을 보내는지 아닌지가 테스트에서 가려진다(그 단언은 쿼리 문자열로 따로 본다).
 */
function enumFilter<T extends string>(raw: string | null, allowed: T[]): T | null {
  if (raw == null) return null
  const upper = raw.toUpperCase() as T
  return allowed.includes(upper) ? upper : null
}

/** page는 음수를 0으로 보정한다 — size와 함께 거절하지 않고 자른다(상한을 넘겨도 400이 아니다). */
function pageFrom(raw: string | null): number {
  const parsed = Math.trunc(Number(raw ?? 0))
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

const notFound = () =>
  HttpResponse.json(errorBody(40000, '상품을 찾을 수 없습니다.'), { status: 404 })

const badRequest = (message: string) =>
  HttpResponse.json(errorBody(90001, message), { status: 400 })

function findProduct(rawId: string | readonly string[] | undefined): AdminProductWire | null {
  const productId = Array.isArray(rawId) ? rawId[0] : rawId
  return products.find(row => row.productId === productId) ?? null
}

const readReason = async (request: Request): Promise<{ reason?: string } | null> =>
  (await request.json().catch(() => null)) as { reason?: string } | null

/**
 * 필수 사유 검증 — 누락·공백뿐·500자 초과와 본문 파싱 실패가 **모두 같은 400/90001**이다.
 * 셀러에게 그대로 보이는 반려 사유와 운영 기록인 중지 사유가 상한과 거절 코드를 공유한다.
 */
function requiredReason(body: { reason?: string } | null): string | Response {
  const reason = body?.reason
  if (typeof reason !== 'string' || reason.trim() === '' || reason.length > REASON_MAX) {
    return badRequest('사유는 1자 이상 500자 이하여야 합니다.')
  }
  return reason.trim()
}

const isRejection = (value: string | Response): value is Response => value instanceof Response

const noOpenReview = () =>
  HttpResponse.json(errorBody(40500, '열린 검토 행이 없습니다.'), { status: 409 })

/**
 * 동시 조치 충돌(409/40011)은 **여기서 흉내 내지 않는다.** 두 운영자가 같은 상품을 같은 순간에
 * 누른 경합이라 상태로 유도할 자리가 없다 — 그 분기를 보는 테스트는 `server.use`로 한 번만
 * 깔아 쓴다(nav 테스트의 403과 같은 방식).
 */
export const productHandlers = [
  http.get(ADMIN_PRODUCTS_URL, ({ request }) => {
    const params = new URL(request.url).searchParams
    const page = pageFrom(params.get('page'))
    const size = clampSize(params.get('size'))
    const inspectionStatus = enumFilter(params.get('inspectionStatus'), INSPECTION_STATUSES)
    const saleStatus = enumFilter(params.get('saleStatus'), SALE_STATUSES)
    const categoryIdParam = params.get('categoryId')
    const categoryId = categoryIdParam == null ? null : Number(categoryIdParam)
    // 앞뒤 공백은 서버가 제거하고 공백뿐이면 조건 없음이다.
    const keyword = params.get('keyword')?.trim() || null

    const matched = products
      // 구매자 노출 조건을 하나도 걸지 않는다 — 반려·판매중지 상품도 전부 나온다.
      .filter(row => inspectionStatus == null || row.inspectionStatus === inspectionStatus)
      .filter(row => saleStatus == null || row.saleStatus === saleStatus)
      .filter(row => categoryId == null || row.categoryId === categoryId)
      // 상품명 **또는 셀러 상호명** 부분일치다(둘을 가르는 파라미터가 없다).
      .filter(
        row =>
          keyword == null ||
          row.productName.includes(keyword) ||
          (row.storeName?.includes(keyword) ?? false),
      )
    const sorted = [...matched].sort((a, b) => b.internalId - a.internalId)
    return HttpResponse.json({
      data: {
        items: sorted.slice(page * size, page * size + size).map(summaryOf),
        // 필터 기준 전체 행 수다 — 페이지 길이로 세는 호출부가 있으면 여기서 드러난다.
        totalCount: matched.length,
      },
    })
  }),

  http.post(ADMIN_PRODUCT_SUSPEND_URL, async ({ params, request }) => {
    const reason = requiredReason(await readReason(request))
    if (isRejection(reason)) return reason
    const row = findProduct(params['productId'])
    if (!row) return notFound()
    if (row.adminSaleSuspended) {
      // 거부된 시도는 **기존 사유·시각을 덮지 않는다** — 덮으면 분쟁에서 처음 막은 근거를 잃는다.
      return HttpResponse.json(errorBody(40008, '이미 판매중지된 상품입니다.'), { status: 409 })
    }
    row.saleStatusBeforeSuspension = row.saleStatus
    row.saleStatus = 'SUSPENDED'
    row.adminSaleSuspended = true
    row.adminSaleSuspendedAt = SUSPENDED_AT
    row.adminSaleSuspendReason = reason
    // 검수 상태는 건드리지 않는다 — 두 축은 독립이다.
    return new HttpResponse(null, { status: 204 })
  }),

  http.post(ADMIN_PRODUCT_RESUME_URL, async ({ params, request }) => {
    // 사유는 선택이고 **본문 자체를 생략해도 된다**. 공백뿐이면 적지 않은 것으로 본다.
    const body = await readReason(request)
    if ((body?.reason ?? '').length > REASON_MAX) {
      return badRequest('철회 근거는 500자 이하여야 합니다.')
    }
    const row = findProduct(params['productId'])
    if (!row) return notFound()
    if (!row.adminSaleSuspended) {
      return HttpResponse.json(errorBody(40009, '운영자가 막은 상품이 아닙니다.'), { status: 409 })
    }
    // 막기 직전 상태로 되돌린 뒤 재고와 동기화한다 — **재개가 곧 판매중은 아니다**. 셀러가
    // 스스로 내려 둔 상품은 SUSPENDED가 유지된다(운영자 조치를 푸는 것이지 셀러 의사를
    // 뒤집는 것이 아니다).
    const restored = row.saleStatusBeforeSuspension ?? 'ON_SALE'
    row.saleStatus = restored === 'ON_SALE' && !row.inStock ? 'OUT_OF_STOCK' : restored
    row.saleStatusBeforeSuspension = null
    row.adminSaleSuspended = false
    row.adminSaleSuspendedAt = null
    // 막음 표시가 지워지므로 사유를 적을 자리가 없다 — 철회 근거는 감사 로그에만 남는다.
    row.adminSaleSuspendReason = null
    return new HttpResponse(null, { status: 204 })
  }),

  /**
   * 열린 검토 행이 없으면 409/40500이다 — 셀러가 고친 내용이 먼저 AI를 통과해 행이 닫혔거나
   * 다른 관리자가 먼저 처리한 경우다. 카탈로그 목록 응답에는 그 행이 열려 있는지 알 방법이
   * 없으므로(판정 대기열은 큐다) 화면이 미리 잠글 수 없고, 이 거절이 유일한 신호다.
   */
  http.post(ADMIN_PRODUCT_APPROVE_URL, ({ params }) => {
    const row = findProduct(params['productId'])
    if (!row) return notFound()
    if (!row.openInspectionReview) return noOpenReview()
    row.inspectionStatus = 'APPROVED'
    row.openInspectionReview = false
    // 운영자 막음은 그대로 둔다 — 검수 승인이 이 조치를 풀지 않는다.
    return new HttpResponse(null, { status: 204 })
  }),

  http.post(ADMIN_PRODUCT_REJECT_URL, async ({ params, request }) => {
    const reason = requiredReason(await readReason(request))
    if (isRejection(reason)) return reason
    const row = findProduct(params['productId'])
    if (!row) return notFound()
    if (!row.openInspectionReview) return noOpenReview()
    row.inspectionStatus = 'REJECTED'
    row.openInspectionReview = false
    return new HttpResponse(null, { status: 204 })
  }),
]
