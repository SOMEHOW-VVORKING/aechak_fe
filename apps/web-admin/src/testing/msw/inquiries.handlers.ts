import { http, HttpResponse } from 'msw'
import { adminBase, clampSize, decodeCursorPayload, encodeCursorPayload, errorBody } from './base'

// `/admin/inquiries` 넷(목록·상세·답변·상태 전이)의 서버 흉내. BE
// `boot/admin/.../inquiry/AdminInquiryController` + `domain/.../inquiry/Inquiry.kt`의 계약을
// 그대로 옮긴다 — 전이 규칙과 에러 코드를 FE가 아니라 여기서 고정해야, 화면이 고를 수 있게 둔
// 결정이 서버에서 거절되는 어긋남을 테스트가 잡는다.

export const ADMIN_INQUIRIES_URL = `${adminBase}/admin/inquiries`
export const ADMIN_INQUIRY_DETAIL_URL = `${ADMIN_INQUIRIES_URL}/:inquiryId`
export const ADMIN_INQUIRY_ANSWER_URL = `${ADMIN_INQUIRY_DETAIL_URL}/answer`
export const ADMIN_INQUIRY_STATUS_URL = `${ADMIN_INQUIRY_DETAIL_URL}/status`

export type WireInquiryStatus = 'RECEIVED' | 'IN_PROGRESS' | 'DONE' | 'ON_HOLD'
export type WireInquiryType =
  | 'ACCOUNT'
  | 'ORDER_PAYMENT'
  | 'DELIVERY_CLAIM'
  | 'SELLER_PRODUCT'
  | 'SERVICE_ETC'

/** 답변 없이 옮길 수 있는 상태 — BE Inquiry.MANUAL_TRANSITION_TARGETS와 같은 집합이다. */
const MANUAL_TARGETS: WireInquiryStatus[] = ['IN_PROGRESS', 'ON_HOLD']

const PREVIOUS_LIMIT = 5
const PREVIEW_LENGTH = 100
const ANSWER_MAX = 1000

/** 상세 응답 모양의 서버 상태. 목록 행은 여기서 투영해 만든다. */
export interface AdminInquiryWire {
  inquiryId: number
  inquiryType: WireInquiryType
  status: WireInquiryStatus
  content: string
  replyEmail: string
  receivedAt: string
  answer: string | null
  answeredByAdminId: number | null
  assignedAdminId: number | null
  resolvedAt: string | null
  author: { userId: number; nickname: string; withdrawn: boolean }
}

let inquiries: AdminInquiryWire[] = []

/** 답변·전이가 기록하는 운영자 id. 화면은 값을 읽지 않지만 응답 모양에는 들어 있다. */
const ACTING_ADMIN_ID = 1

export function makeAdminInquiryWire(
  overrides: Partial<AdminInquiryWire> = {},
): AdminInquiryWire {
  return {
    inquiryId: 8812,
    inquiryType: 'ORDER_PAYMENT',
    status: 'RECEIVED',
    content: '카드 승인 문자는 받았는데 주문 목록에 아무것도 없어요.',
    replyEmail: 'coco@example.com',
    receivedAt: '2026-10-26T22:14:00',
    answer: null,
    answeredByAdminId: null,
    assignedAdminId: null,
    resolvedAt: null,
    author: { userId: 1001, nickname: '코코맘', withdrawn: false },
    ...overrides,
  }
}

const clone = (row: AdminInquiryWire): AdminInquiryWire => ({
  ...row,
  author: { ...row.author },
})

export function seedAdminInquiries(rows: AdminInquiryWire[] = []): void {
  inquiries = rows.map(clone)
}

/** 핸들러가 반영한 현재 문의 상태 — 테스트가 답변·전이의 부작용을 읽는다. */
export function currentAdminInquiry(inquiryId: number): AdminInquiryWire | null {
  const found = inquiries.find(row => row.inquiryId === inquiryId)
  return found ? clone(found) : null
}

/** 목록 미리보기 — BE AdminInquirySummaryResult.preview와 같은 규칙(공백 평탄화 + 100자). */
function preview(content: string): string {
  const flattened = content.replace(/\s+/g, ' ').trim()
  return flattened.length <= PREVIEW_LENGTH ? flattened : `${flattened.slice(0, PREVIEW_LENGTH)}…`
}

function summaryOf(row: AdminInquiryWire) {
  return {
    inquiryId: row.inquiryId,
    inquiryType: row.inquiryType,
    status: row.status,
    author: { ...row.author },
    contentPreview: preview(row.content),
    assignedAdminId: row.assignedAdminId,
    answeredByAdminId: row.answeredByAdminId,
    receivedAt: row.receivedAt,
    resolvedAt: row.resolvedAt,
  }
}

function detailOf(row: AdminInquiryWire) {
  return {
    inquiryId: row.inquiryId,
    inquiryType: row.inquiryType,
    status: row.status,
    content: row.content,
    replyEmail: row.replyEmail,
    receivedAt: row.receivedAt,
    answer: row.answer,
    answeredByAdminId: row.answeredByAdminId,
    assignedAdminId: row.assignedAdminId,
    resolvedAt: row.resolvedAt,
    author: { ...row.author },
    // 기준은 "자기 행 제외"가 아니라 **접수 시점 이전**이다(BE previousInquiriesOf).
    previousInquiries: inquiries
      .filter(
        other =>
          other.author.userId === row.author.userId &&
          (other.receivedAt < row.receivedAt ||
            (other.receivedAt === row.receivedAt && other.inquiryId < row.inquiryId)),
      )
      .sort((a, b) => (a.receivedAt < b.receivedAt ? 1 : a.receivedAt > b.receivedAt ? -1 : b.inquiryId - a.inquiryId))
      .slice(0, PREVIOUS_LIMIT)
      .map(other => ({
        inquiryId: other.inquiryId,
        inquiryType: other.inquiryType,
        status: other.status,
        receivedAt: other.receivedAt,
      })),
  }
}

const CURSOR_TAG = 'ai'

const encodeCursor = (row: AdminInquiryWire) =>
  encodeCursorPayload(`${CURSOR_TAG}:${row.receivedAt}:${row.inquiryId}`)

function decodeCursor(raw: string): { receivedAt: string; inquiryId: number } | null {
  const decoded = decodeCursorPayload(raw)
  if (decoded == null) return null
  const parts = decoded.split(':')
  // receivedAt 자체가 ':'를 품으므로 앞 태그와 뒤 id만 떼어 낸다.
  if (parts.length < 3 || parts[0] !== CURSOR_TAG) return null
  const inquiryId = Number(parts[parts.length - 1])
  if (!Number.isFinite(inquiryId)) return null
  return { receivedAt: parts.slice(1, -1).join(':'), inquiryId }
}

function findForWrite(rawId: string | readonly string[] | undefined) {
  const inquiryId = Number(rawId)
  const row = inquiries.find(item => item.inquiryId === inquiryId)
  if (!row) {
    return HttpResponse.json(errorBody(120005, '문의를 찾을 수 없습니다.'), { status: 404 })
  }
  return row
}

const isRejection = (result: AdminInquiryWire | Response): result is Response =>
  result instanceof Response

export const inquiryHandlers = [
  http.get(ADMIN_INQUIRIES_URL, ({ request }) => {
    const params = new URL(request.url).searchParams
    const status = params.get('status')
    const inquiryType = params.get('inquiryType')
    const keyword = params.get('keyword')?.trim() || null
    const size = clampSize(params.get('size'))
    const cursorParam = params.get('cursor')
    let anchor: { receivedAt: string; inquiryId: number } | null = null
    if (cursorParam != null) {
      anchor = decodeCursor(cursorParam)
      if (!anchor) {
        return HttpResponse.json(errorBody(90002, '유효하지 않은 커서입니다.'), { status: 400 })
      }
    }

    const matched = inquiries
      .filter(row => status == null || row.status === status)
      .filter(row => inquiryType == null || row.inquiryType === inquiryType)
      // keyword는 문의 내용과 답변 수신 이메일을 함께 훑는다(제목 필드가 없다).
      .filter(row => keyword == null || row.content.includes(keyword) || row.replyEmail.includes(keyword))
    // 접수 오래된 순(created_at, id) 고정.
    const sorted = [...matched].sort((a, b) =>
      a.receivedAt < b.receivedAt ? -1 : a.receivedAt > b.receivedAt ? 1 : a.inquiryId - b.inquiryId,
    )
    const afterCursor =
      anchor == null
        ? sorted
        : sorted.filter(
            row =>
              row.receivedAt > anchor!.receivedAt ||
              (row.receivedAt === anchor!.receivedAt && row.inquiryId > anchor!.inquiryId),
          )
    const page = afterCursor.slice(0, size)
    const hasNext = afterCursor.length > size
    return HttpResponse.json({
      data: {
        items: page.map(summaryOf),
        // 총건수는 첫 페이지에서만 센다(BE AdminInquiryService.findPage).
        totalCount: cursorParam == null ? matched.length : null,
        nextCursor: hasNext ? encodeCursor(page[page.length - 1]!) : null,
        hasNext,
      },
    })
  }),

  http.get(ADMIN_INQUIRY_DETAIL_URL, ({ params }) => {
    const found = findForWrite(params['inquiryId'])
    if (isRejection(found)) return found
    return HttpResponse.json({ data: detailOf(found) })
  }),

  http.post(ADMIN_INQUIRY_ANSWER_URL, async ({ params, request }) => {
    const body = (await request.json().catch(() => null)) as { answer?: string } | null
    // @Valid가 먼저다 — 필드 누락은 90001이고 공백·길이는 애그리거트 코드다.
    if (body?.answer == null) {
      return HttpResponse.json(errorBody(90001, '잘못된 요청입니다.'), { status: 400 })
    }
    const found = findForWrite(params['inquiryId'])
    if (isRejection(found)) return found
    // 본문 형식을 상태보다 먼저 거절한다(BE Inquiry.registerAnswer 순서).
    if (body.answer.trim() === '') {
      return HttpResponse.json(errorBody(120006, '답변 내용은 필수입니다.'), { status: 400 })
    }
    if (body.answer.length > ANSWER_MAX) {
      return HttpResponse.json(errorBody(120007, '답변 내용은 1000자를 넘을 수 없습니다.'), {
        status: 400,
      })
    }
    if (found.status === 'DONE') {
      return HttpResponse.json(errorBody(120008, '이미 답변이 등록된 문의입니다.'), { status: 409 })
    }
    found.answer = body.answer
    found.answeredByAdminId = ACTING_ADMIN_ID
    found.assignedAdminId = ACTING_ADMIN_ID
    found.resolvedAt = '2026-10-30T09:00:00'
    found.status = 'DONE'
    return HttpResponse.json({ data: detailOf(found) })
  }),

  http.patch(ADMIN_INQUIRY_STATUS_URL, async ({ params, request }) => {
    const body = (await request.json().catch(() => null)) as { status?: WireInquiryStatus } | null
    if (body?.status == null) {
      return HttpResponse.json(errorBody(90001, '잘못된 요청입니다.'), { status: 400 })
    }
    const found = findForWrite(params['inquiryId'])
    if (isRejection(found)) return found
    // 같은 상태로의 전이도 거절한다 — 담당자만 바꿔치기하는 경로를 열지 않는다.
    if (
      !MANUAL_TARGETS.includes(body.status) ||
      found.status === 'DONE' ||
      found.status === body.status
    ) {
      return HttpResponse.json(
        errorBody(120009, '현재 상태에서 요청한 상태로 변경할 수 없습니다.'),
        { status: 409 },
      )
    }
    found.status = body.status
    found.assignedAdminId = ACTING_ADMIN_ID
    return HttpResponse.json({ data: detailOf(found) })
  }),
]
