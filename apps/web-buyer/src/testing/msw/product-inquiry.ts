import { http, HttpResponse } from 'msw'
import {
  axiosInstance,
  type MyProductInquiryItem,
  type ProductInquiryCategory,
  type ProductInquiryItem,
  type ProductInquiryStatus,
} from '@aechak/api'

// 상품 문의(SCRUM-312 BE / SCRUM-340 FE) 상태형 MSW. 등록·철회가 메모리 행을 실제로 바꾸므로
// 테스트는 토스트가 아니라 `currentProductInquiries()`로 서버 상태를 단언할 수 있다.
//
// **비밀글 가리기를 서버와 같은 규칙으로 흉내 낸다**(BE `ProductInquiryItemResult.from`):
// readable = 공개글이거나 내가 작성자거나 내가 그 상품 셀러. 가려지면 제목·본문이 자리표시
// 문자열로, 답변이 null로 바뀌고 **행은 남는다**. 여기서 가리지 않으면 화면이 마스킹을
// 존중하는지 테스트가 확인할 수 없다.

const base = axiosInstance.defaults.baseURL ?? ''
export const PRODUCT_INQUIRIES_URL = `${base}/products/:productId/inquiries`
export const PRODUCT_INQUIRY_URL = `${base}/product-inquiries/:inquiryId`
export const MY_PRODUCT_INQUIRIES_URL = `${base}/users/me/product-inquiries`

/** BE `ProductInquiry.SECRET_PLACEHOLDER`. */
export const INQUIRY_SECRET_PLACEHOLDER = '비밀글입니다.'

/** 기본 조회자(나). 행의 `authorUserId`가 이 값이면 내 문의다. */
export const INQUIRY_VIEWER = 'u-me'
/** 다른 구매자 — 남의 비밀글을 만들 때 쓴다. */
export const INQUIRY_OTHER_BUYER = 'u-other'
/** 상품 셀러. 구매자 앱 조회자는 셀러가 아니므로 비밀글 판정에서 제외된다. */
export const INQUIRY_SELLER = 'u-seller'

export interface ProductInquiryRow {
  inquiryId: string
  productId: string
  productName: string
  authorUserId: string
  sellerId: string
  authorMasked: string
  category: ProductInquiryCategory
  title: string
  content: string
  secret: boolean
  status: ProductInquiryStatus
  askedAt: string
  answerDueAt: string
  overdue: boolean
  answer: { content: string; answeredAt: string } | null
}

let rows: ProductInquiryRow[] = []
let viewer = INQUIRY_VIEWER
let counts = { list: 0, ask: 0, withdraw: 0, mine: 0 }

export function makeProductInquiryRow(
  overrides: Partial<ProductInquiryRow> & { inquiryId: string },
): ProductInquiryRow {
  return {
    productId: 'P01JPRODUCT0000000000000001',
    productName: '고양이 자동 급식기 5L',
    authorUserId: INQUIRY_VIEWER,
    sellerId: INQUIRY_SELLER,
    authorMasked: '집사**',
    category: 'PRODUCT',
    title: '배터리로도 쓸 수 있나요?',
    content: '정전이 걱정돼서요.',
    secret: false,
    status: 'RECEIVED',
    askedAt: '2026-10-30T09:14:00',
    answerDueAt: '2026-11-03T23:59:59',
    overdue: false,
    answer: null,
    ...overrides,
  }
}

/** 테스트 사이 상태가 이어지지 않게 비운다(test-setup의 afterEach가 부른다). */
export function seedProductInquiries(
  seed: ProductInquiryRow[] = [],
  options: { viewer?: string } = {},
): void {
  rows = seed.map(row => ({ ...row }))
  viewer = options.viewer ?? INQUIRY_VIEWER
  counts = { list: 0, ask: 0, withdraw: 0, mine: 0 }
  heldWithdraw = null
}

/** 핸들러가 반영한 서버 상태. 단언은 토스트가 아니라 이걸 본다. */
export function currentProductInquiries(): ProductInquiryRow[] {
  return rows.map(row => ({ ...row }))
}

/** 경로별 요청 수 — "비회원은 목록을 아예 부르지 않는다"를 단언할 때 쓴다. */
export function productInquiryCallCounts(): { list: number; ask: number; withdraw: number; mine: number } {
  return { ...counts }
}

/**
 * DELETE 요청을 붙잡아 두는 게이트. 요청이 떠 있는 동안의 화면(확인창이 ESC로 닫히는지)을
 * 보려는 테스트가 켜고, 반환된 함수로 푼다.
 */
let heldWithdraw: Promise<void> | null = null
export function holdWithdraw(): () => void {
  let release = () => {}
  heldWithdraw = new Promise<void>(resolve => {
    release = resolve
  })
  return () => {
    heldWithdraw = null
    release()
  }
}

/** 상품 상세 목록이 보는 범위 — 철회한 문의는 빠진다(BE `LIVE_STATUSES`). */
const isLive = (row: ProductInquiryRow) => row.status !== 'WITHDRAWN'

function toProductItem(row: ProductInquiryRow): ProductInquiryItem {
  const readable = !row.secret || viewer === row.authorUserId || viewer === row.sellerId
  return {
    inquiryId: row.inquiryId,
    category: row.category,
    title: readable ? row.title : INQUIRY_SECRET_PLACEHOLDER,
    content: readable ? row.content : INQUIRY_SECRET_PLACEHOLDER,
    authorMasked: row.authorMasked,
    askedAt: row.askedAt,
    secret: row.secret,
    readable,
    mine: viewer === row.authorUserId,
    status: row.status,
    answer: readable ? row.answer : null,
  }
}

function toMyItem(row: ProductInquiryRow): MyProductInquiryItem {
  // 본인 목록은 마스킹하지 않는다(BE `MyProductInquiryItemResult`).
  return {
    inquiryId: row.inquiryId,
    productId: row.productId,
    productName: row.productName,
    category: row.category,
    title: row.title,
    content: row.content,
    secret: row.secret,
    status: row.status,
    askedAt: row.askedAt,
    answerDueAt: row.answerDueAt,
    overdue: row.overdue,
    answer: row.answer,
  }
}

function page<T>(items: T[], url: URL) {
  const pageIndex = Number(url.searchParams.get('page') ?? '0')
  const size = Number(url.searchParams.get('size') ?? '20')
  const start = pageIndex * size
  return {
    data: {
      inquiries: items.slice(start, start + size),
      totalCount: items.length,
      page: pageIndex,
      size,
      totalPages: size > 0 ? Math.ceil(items.length / size) : 0,
      hasNext: start + size < items.length,
    },
  }
}

export const productInquiryHandlers = [
  // 목록 — 비로그인(Authorization 없음)은 401이다. 화면이 비회원에게 부르면 전역 리다이렉트로
  // 상세를 잃으므로, 계약을 그대로 두고 호출 수를 세어 "부르지 않았다"를 단언하게 한다.
  http.get(PRODUCT_INQUIRIES_URL, ({ request, params }) => {
    counts.list += 1
    if (!request.headers.get('Authorization')) {
      return HttpResponse.json({ errorCode: 20004, message: '인증이 필요합니다.' }, { status: 401 })
    }
    const productId = String(params['productId'])
    const live = rows.filter(row => row.productId === productId && isLive(row))
    return HttpResponse.json(page(live.map(toProductItem), new URL(request.url)))
  }),

  http.post(PRODUCT_INQUIRIES_URL, async ({ request, params }) => {
    counts.ask += 1
    const body = (await request.json()) as {
      category: ProductInquiryCategory
      title: string
      content: string
      secret?: boolean
    }
    const productId = String(params['productId'])
    if (body.title.trim() === '') {
      return HttpResponse.json(
        { errorCode: 120101, message: '문의 제목은 필수입니다.' },
        { status: 400 },
      )
    }
    const inquiryId = `I${String(rows.length + 1).padStart(25, '0')}`
    rows = [
      makeProductInquiryRow({
        inquiryId,
        productId,
        authorUserId: viewer,
        category: body.category,
        title: body.title,
        content: body.content,
        secret: body.secret === true,
      }),
      ...rows,
    ]
    return HttpResponse.json(
      { data: { inquiryId, status: 'RECEIVED', answerDueAt: '2026-11-03T23:59:59' } },
      { status: 201 },
    )
  }),

  http.delete(PRODUCT_INQUIRY_URL, async ({ params }) => {
    counts.withdraw += 1
    // 요청이 떠 있는 동안의 화면을 보려는 테스트가 게이트를 걸어 둔다.
    if (heldWithdraw) await heldWithdraw
    const inquiryId = String(params['inquiryId'])
    const row = rows.find(r => r.inquiryId === inquiryId)
    if (!row) {
      return HttpResponse.json(
        { errorCode: 120100, message: '상품 문의를 찾을 수 없습니다.' },
        { status: 404 },
      )
    }
    if (row.authorUserId !== viewer) {
      return HttpResponse.json(
        { errorCode: 120107, message: '본인이 등록한 문의만 철회할 수 있습니다.' },
        { status: 403 },
      )
    }
    if (row.status === 'ANSWERED') {
      return HttpResponse.json(
        { errorCode: 120111, message: '답변이 등록된 문의는 철회할 수 없습니다.' },
        { status: 409 },
      )
    }
    if (row.status === 'WITHDRAWN') {
      return HttpResponse.json(
        { errorCode: 120110, message: '이미 철회한 문의입니다.' },
        { status: 409 },
      )
    }
    row.status = 'WITHDRAWN'
    return new HttpResponse(null, { status: 204 })
  }),

  http.get(MY_PRODUCT_INQUIRIES_URL, ({ request }) => {
    counts.mine += 1
    // 내 문의는 철회한 것까지 전부 내려온다(status 파라미터를 보내지 않을 때).
    const url = new URL(request.url)
    const status = url.searchParams.get('status')
    const mine = rows.filter(
      row => row.authorUserId === viewer && (status == null || row.status === status),
    )
    return HttpResponse.json(page(mine.map(toMyItem), url))
  }),
]
