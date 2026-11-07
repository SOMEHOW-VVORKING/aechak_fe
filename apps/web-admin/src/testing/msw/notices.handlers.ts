import { http, HttpResponse } from 'msw'
import { adminBase, clampSize, decodeCursorPayload, encodeCursorPayload, errorBody } from './base'

// `/admin/notices` 여섯(목록·초안 생성·상세·수정·게시·내림)의 서버 흉내. BE
// `boot/admin/.../notice/AdminNoticeController` + `domain/.../notice/Notice.kt`의 전이 규칙과
// errorCode를 그대로 옮긴다 — 전이를 화면이 아니라 핸들러가 고정해야, 화면이 고를 수 있게 둔
// 액션이 서버에서 거절되는 어긋남을 테스트가 잡는다(inquiries.handlers.ts 관례).
//
// 특히 **푸시 관련 필드를 흉내에도 두지 않는다.** 더블이 그 자리를 만들면 화면이 다시 '푸시 발송'을
// 그려도 테스트가 통과한다 — 서버에 발송 경로가 없다는 사실이 여기서부터 지켜져야 한다.

export const ADMIN_NOTICES_URL = `${adminBase}/admin/notices`
export const ADMIN_NOTICE_DETAIL_URL = `${ADMIN_NOTICES_URL}/:noticeId`
export const ADMIN_NOTICE_PUBLISH_URL = `${ADMIN_NOTICE_DETAIL_URL}/publish`
export const ADMIN_NOTICE_UNPUBLISH_URL = `${ADMIN_NOTICE_DETAIL_URL}/unpublish`

export type WireNoticeStatus = 'DRAFT' | 'PUBLISHED' | 'UNPUBLISHED'
export type WireNoticeAudience = 'ALL' | 'BUYER' | 'SELLER'
export type WireNoticeCategory = 'SERVICE' | 'MAINTENANCE' | 'POLICY' | 'EVENT' | 'SETTLEMENT'

const CATEGORIES: WireNoticeCategory[] = [
  'SERVICE',
  'MAINTENANCE',
  'POLICY',
  'EVENT',
  'SETTLEMENT',
]
const AUDIENCES: WireNoticeAudience[] = ['ALL', 'BUYER', 'SELLER']

const TITLE_MAX = 200
const CONTENT_MAX = 2000
const MEMO_MAX = 300
/** 쓰기가 반영하는 고정 시각 — 테스트가 게시 시각의 변화를 눈으로 확인할 수 있어야 한다. */
const NOW = '2026-11-03T09:00:00'

export interface AdminNoticeWire {
  noticeId: string
  title: string
  content: string
  category: WireNoticeCategory
  audience: WireNoticeAudience
  status: WireNoticeStatus
  pinned: boolean
  /** 한 번도 게시되지 않으면 null. 내려도 **지우지 않는다**(BE가 그렇게 한다). */
  publishedAt: string | null
  internalMemo: string | null
  createdAt: string
  updatedAt: string
}

let notices: AdminNoticeWire[] = []
let createdSequence = 0

export function makeAdminNoticeWire(overrides: Partial<AdminNoticeWire> = {}): AdminNoticeWire {
  return {
    noticeId: '01HZXN0000000000000000001',
    title: '10월 28일 새벽 결제 시스템 점검 안내',
    content: '10월 28일 02:00부터 04:00까지 결제 시스템 점검이 있어요.',
    category: 'MAINTENANCE',
    audience: 'ALL',
    status: 'DRAFT',
    pinned: true,
    publishedAt: null,
    internalMemo: 'PG사 점검 일정과 맞춰 둠.',
    createdAt: '2026-10-27T18:00:00',
    updatedAt: '2026-10-27T18:00:00',
    ...overrides,
  }
}

export function seedAdminNotices(rows: AdminNoticeWire[] = []): void {
  notices = rows.map(row => ({ ...row }))
  createdSequence = 0
}

/** 핸들러가 반영한 현재 공지 상태 — 테스트가 저장·게시·내림의 부작용을 읽는다. */
export function currentAdminNotice(noticeId: string): AdminNoticeWire | null {
  const found = notices.find(row => row.noticeId === noticeId)
  return found ? { ...found } : null
}

/** 목록 summary에는 content·internalMemo가 **없다** — 드로어가 상세를 따로 불러야 하는 이유다. */
const summaryOf = (row: AdminNoticeWire) => ({
  noticeId: row.noticeId,
  title: row.title,
  category: row.category,
  audience: row.audience,
  status: row.status,
  pinned: row.pinned,
  publishedAt: row.publishedAt,
  createdAt: row.createdAt,
})

const detailOf = (row: AdminNoticeWire) => ({ ...row })

const CURSOR_TAG = 'ntc'

const encodeCursor = (lastId: string) => encodeCursorPayload(`${CURSOR_TAG}|${lastId}`)

/**
 * 커서에 **필터 지문을 싣지 않는다.**
 *
 * 서버 `AdminNoticeCursorCodec`가 마지막 행만 담고 필터 조건을 싣지 않아, 조건이 바뀐 채 옛 커서를
 * 보내도 **거부하지 않는다**(리뷰 경로와 다르다). 더블이 지문을 넣어 400으로 끊으면 FE가 옛 커서를
 * 보내도 테스트가 서버 덕에 통과해, 섞인 목록을 막는 유일한 방어선인 쿼리 키를 떼도 안 깨진다.
 */
function decodeCursor(raw: string): string | null {
  const decoded = decodeCursorPayload(raw)
  if (decoded == null) return null
  const parts = decoded.split('|')
  if (parts.length !== 2 || parts[0] !== CURSOR_TAG) return null
  return parts[1] || null
}

interface SaveBody {
  title?: unknown
  content?: unknown
  category?: unknown
  audience?: unknown
  pinned?: unknown
  internalMemo?: unknown
}

/** BE @Valid + 애그리거트 검증. 필수 누락과 길이 초과가 다른 errorCode다. */
function validateSaveBody(body: SaveBody | null) {
  const title = typeof body?.title === 'string' ? body.title : ''
  const content = typeof body?.content === 'string' ? body.content : ''
  const memo = typeof body?.internalMemo === 'string' ? body.internalMemo : ''
  if (title.trim() === '') {
    return HttpResponse.json(errorBody(150001, '공지 제목은 필수입니다.'), { status: 400 })
  }
  if (title.length > TITLE_MAX) {
    return HttpResponse.json(errorBody(150002, '공지 제목은 200자 이하여야 합니다.'), {
      status: 400,
    })
  }
  if (content.trim() === '') {
    return HttpResponse.json(errorBody(150003, '공지 내용은 필수입니다.'), { status: 400 })
  }
  if (content.length > CONTENT_MAX) {
    return HttpResponse.json(errorBody(150004, '공지 내용은 2000자 이하여야 합니다.'), {
      status: 400,
    })
  }
  if (memo.length > MEMO_MAX) {
    return HttpResponse.json(errorBody(150005, '내부 메모는 300자 이하여야 합니다.'), {
      status: 400,
    })
  }
  if (!CATEGORIES.includes(body?.category as WireNoticeCategory)) {
    return HttpResponse.json(errorBody(90001, '잘못된 요청입니다.'), { status: 400 })
  }
  if (!AUDIENCES.includes(body?.audience as WireNoticeAudience)) {
    return HttpResponse.json(errorBody(90001, '잘못된 요청입니다.'), { status: 400 })
  }
  return null
}

function findForWrite(rawId: string | readonly string[] | undefined) {
  const noticeId = Array.isArray(rawId) ? rawId[0] : rawId
  const row = notices.find(item => item.noticeId === noticeId)
  if (!row) {
    return HttpResponse.json(errorBody(150000, '공지를 찾을 수 없습니다.'), { status: 404 })
  }
  return row
}

const isRejection = (result: AdminNoticeWire | Response): result is Response =>
  result instanceof Response

export const noticeHandlers = [
  http.get(ADMIN_NOTICES_URL, ({ request }) => {
    const params = new URL(request.url).searchParams
    const status = params.get('status')
    const audience = params.get('audience')
    const category = params.get('category')
    // 제목 부분일치만 본다 — 내용·메모까지 보면 어느 축이 걸렀는지 테스트가 말할 수 없다.
    const keyword = params.get('keyword')?.trim() || null
    const size = clampSize(params.get('size'))

    const cursorParam = params.get('cursor')
    let afterId: string | null = null
    if (cursorParam != null) {
      afterId = decodeCursor(cursorParam)
      if (afterId == null) {
        return HttpResponse.json(errorBody(90002, '유효하지 않은 커서입니다.'), { status: 400 })
      }
    }

    const matched = notices
      .filter(row => status == null || row.status === status)
      // audience=ALL은 '미선택'이 아니라 '대상이 ALL인 공지만'이다(서버가 등가 비교한다).
      .filter(row => audience == null || row.audience === audience)
      .filter(row => category == null || row.category === category)
      .filter(row => keyword == null || row.title.includes(keyword))
    // 정렬은 createdAt 내림차순 고정 — 같은 시각이면 id 내림차순으로 갈라 경계가 흔들리지 않게 한다.
    const sorted = [...matched].sort((a, b) =>
      a.createdAt === b.createdAt
        ? b.noticeId.localeCompare(a.noticeId)
        : b.createdAt.localeCompare(a.createdAt),
    )
    const anchor = afterId == null ? 0 : sorted.findIndex(row => row.noticeId === afterId) + 1
    const afterCursor = afterId != null && anchor === 0 ? [] : sorted.slice(anchor)
    const page = afterCursor.slice(0, size)
    const hasNext = afterCursor.length > size
    return HttpResponse.json({
      data: {
        items: page.map(summaryOf),
        // 첫 페이지만 채워진다 — 커서를 보낸 페이지는 null이다.
        totalCount: cursorParam == null ? matched.length : null,
        nextCursor: hasNext ? encodeCursor(page[page.length - 1]!.noticeId) : null,
        hasNext,
      },
    })
  }),

  http.post(ADMIN_NOTICES_URL, async ({ request }) => {
    const body = (await request.json().catch(() => null)) as SaveBody | null
    const invalid = validateSaveBody(body)
    if (invalid) return invalid
    createdSequence += 1
    const created: AdminNoticeWire = {
      noticeId: `01HZXN90000000000000000${String(createdSequence).padStart(2, '0')}`,
      title: (body!.title as string).trim(),
      content: (body!.content as string).trim(),
      category: body!.category as WireNoticeCategory,
      audience: body!.audience as WireNoticeAudience,
      // 생성만으로는 노출되지 않는다 — 게시는 별 경로다.
      status: 'DRAFT',
      pinned: body!.pinned === true,
      publishedAt: null,
      internalMemo:
        typeof body!.internalMemo === 'string' && body!.internalMemo.trim() !== ''
          ? body!.internalMemo.trim()
          : null,
      createdAt: NOW,
      updatedAt: NOW,
    }
    notices = [created, ...notices]
    // 컨트롤러가 HttpStatus.CREATED를 돌려준다(스펙 JSON의 200은 springdoc 기본값이다).
    return HttpResponse.json({ data: detailOf(created) }, { status: 201 })
  }),

  http.get(ADMIN_NOTICE_DETAIL_URL, ({ params }) => {
    const found = findForWrite(params['noticeId'])
    if (isRejection(found)) return found
    return HttpResponse.json({ data: detailOf(found) })
  }),

  http.put(ADMIN_NOTICE_DETAIL_URL, async ({ params, request }) => {
    const body = (await request.json().catch(() => null)) as SaveBody | null
    const invalid = validateSaveBody(body)
    if (invalid) return invalid
    const found = findForWrite(params['noticeId'])
    if (isRejection(found)) return found
    found.title = (body!.title as string).trim()
    found.content = (body!.content as string).trim()
    found.category = body!.category as WireNoticeCategory
    found.audience = body!.audience as WireNoticeAudience
    found.pinned = body!.pinned === true
    found.internalMemo =
      typeof body!.internalMemo === 'string' && body!.internalMemo.trim() !== ''
        ? body!.internalMemo.trim()
        : null
    found.updatedAt = NOW
    // **상태를 바꾸지 않는다.** 게시 중 공지를 수정해도 게시 중이고, 초안은 초안이다.
    return HttpResponse.json({ data: detailOf(found) })
  }),

  http.post(ADMIN_NOTICE_PUBLISH_URL, ({ params }) => {
    const found = findForWrite(params['noticeId'])
    if (isRejection(found)) return found
    // 멱등이 아니라 거절이다 — 재게시를 허용하면 publishedAt이 갱신돼 독자 목록 맨 위로 튄다.
    if (found.status === 'PUBLISHED') {
      return HttpResponse.json(errorBody(150006, '이미 게시된 공지입니다.'), { status: 409 })
    }
    found.status = 'PUBLISHED'
    found.publishedAt = NOW
    found.updatedAt = NOW
    return HttpResponse.json({ data: detailOf(found) })
  }),

  http.post(ADMIN_NOTICE_UNPUBLISH_URL, ({ params }) => {
    const found = findForWrite(params['noticeId'])
    if (isRejection(found)) return found
    if (found.status !== 'PUBLISHED') {
      return HttpResponse.json(errorBody(150007, '게시되지 않은 공지입니다.'), { status: 409 })
    }
    found.status = 'UNPUBLISHED'
    // publishedAt은 지우지 않는다 — 언제 노출됐는지는 사실로 남는다.
    found.updatedAt = NOW
    return HttpResponse.json({ data: detailOf(found) })
  }),
]
