import { http, HttpResponse } from 'msw'
import { axiosInstance } from '@aechak/api'

// 구매자 공지(SCRUM-332) MSW. BE `boot/api/.../notice/NoticeController` +
// `application/.../notice/read`의 조회 조건을 그대로 옮긴다. api 호스트 경로다(`/notices`).
//
// 고정하려는 계약 넷 —
//  (1) 게시된 공지만, 대상이 ALL이거나 BUYER인 것만 내려온다(초안·내린 공지는 목록에 아예 없다),
//  (2) 정렬은 (고정 여부, 게시 시각, id) 내림차순 고정이라 중요 공지가 늘 앞에 온다,
//  (3) `totalCount`는 첫 페이지에만 실리고 cursor를 보낸 페이지에서는 null이다,
//  (4) 목록 행에 `content`가 없다 — 전문은 상세 경로로만 온다.
//
// **읽음 여부·발송 필드를 흉내에도 두지 않는다.** 더블이 그 자리를 만들면 화면이 "안 읽음" 배지나
// 발송 표기를 그려도 테스트가 통과한다 — 열람 기록 테이블도 발송 경로도 플랫폼에 없다.

const base = axiosInstance.defaults.baseURL ?? ''
export const NOTICES_URL = `${base}/notices`
export const NOTICE_DETAIL_URL = `${base}/notices/:noticeId`

export type WireNoticeCategory = 'SERVICE' | 'MAINTENANCE' | 'POLICY' | 'EVENT' | 'SETTLEMENT'

const CATEGORIES: WireNoticeCategory[] = [
  'SERVICE',
  'MAINTENANCE',
  'POLICY',
  'EVENT',
  'SETTLEMENT',
]

/** 서버가 평탄화한 뒤 자르는 미리보기 길이(코드 포인트 기준). */
const PREVIEW_MAX = 100

export interface NoticeRow {
  noticeId: string
  title: string
  content: string
  category: WireNoticeCategory
  pinned: boolean
  /** 오프셋 없는 LocalDateTime(KST 벽시계). 조회 조건이 게시 시각 있는 행만 골라 **비지 않는다**. */
  publishedAt: string
}

export function makeNoticeRow(overrides: Partial<NoticeRow> = {}): NoticeRow {
  return {
    noticeId: '01HZBN0000000000000000001',
    title: '11월 1일부터 교환/반품 접수 방법이 바뀌어요',
    content: '주문 상세에서 바로 접수할 수 있도록 바뀌어요.',
    category: 'POLICY',
    pinned: false,
    publishedAt: '2026-10-26T10:00:00',
    ...overrides,
  }
}

const DEFAULT_NOTICES: NoticeRow[] = [
  makeNoticeRow({
    noticeId: '01HZBN0000000000000000001',
    title: '11월 1일부터 교환/반품 접수 방법이 바뀌어요',
    content:
      '주문 상세에서 바로 접수할 수 있도록 바뀌어요.\n10월 31일까지 접수된 건은 기존 방식대로 처리돼요.',
    category: 'POLICY',
    pinned: true,
    publishedAt: '2026-10-26T10:00:00',
  }),
  makeNoticeRow({
    noticeId: '01HZBN0000000000000000002',
    title: '10월 29일 새벽 정기 점검 안내',
    content: '정기 점검 동안 주문과 결제가 잠시 중단돼요.',
    category: 'MAINTENANCE',
    pinned: false,
    publishedAt: '2026-10-25T17:30:00',
  }),
  makeNoticeRow({
    noticeId: '01HZBN0000000000000000003',
    title: '첫 구매 적립금 이벤트를 시작해요',
    content: '첫 주문을 마치면 적립금 3,000원을 드려요.',
    category: 'EVENT',
    pinned: false,
    publishedAt: '2026-10-23T14:20:00',
  }),
]

interface NoticeWireError {
  status: number
  errorCode: number
  message: string
}

let notices: NoticeRow[] = []
let listQueries: string[] = []
let listError: NoticeWireError | null = null

export function seedNotices(rows: NoticeRow[] = DEFAULT_NOTICES): void {
  notices = rows.map(row => ({ ...row }))
  listQueries = []
  listError = null
}
seedNotices()

/** 목록 핸들러가 받은 쿼리스트링 전부 — 빈 값 제거와 커서 전달을 단언할 때 쓴다. */
export function noticesQueries(): string[] {
  return [...listQueries]
}

export function lastNoticesQuery(): string | null {
  return listQueries.at(-1) ?? null
}

/** 목록 조회를 실패시킨다 — 화면이 사유를 빈 목록으로 흘리지 않는지 보려고 둔다. */
export function failNoticesList(error: NoticeWireError): void {
  listError = error
}

const errorBody = (errorCode: number, message: string) => ({ errorCode, message })

/** 목록 행에는 전문이 없다 — 서버가 줄바꿈·연속 공백을 한 칸으로 평탄화한 뒤 앞 100자만 싣는다. */
const summaryOf = (row: NoticeRow) => {
  const flattened = row.content.replace(/\s+/g, ' ').trim()
  const chars = [...flattened]
  return {
    noticeId: row.noticeId,
    title: row.title,
    category: row.category,
    pinned: row.pinned,
    contentPreview:
      chars.length > PREVIEW_MAX ? `${chars.slice(0, PREVIEW_MAX).join('')}…` : flattened,
    publishedAt: row.publishedAt,
  }
}

const detailOf = (row: NoticeRow) => ({
  noticeId: row.noticeId,
  title: row.title,
  content: row.content,
  category: row.category,
  pinned: row.pinned,
  publishedAt: row.publishedAt,
})

const CURSOR_TAG = 'nr'

/**
 * 커서 base64url 인코딩 — 서버와 같은 모양으로 만들어 FE가 값을 들여다보지 않는지도 고정한다.
 * `btoa`는 latin1 밖 코드포인트에 던지므로 UTF-8 바이트를 거친다(서버는
 * `Base64.getUrlEncoder().encodeToString(payload.getBytes(UTF_8))`).
 */
function encodeCursor(row: NoticeRow): string {
  const payload = `${CURSOR_TAG}|${row.pinned ? '1' : '0'}|${row.publishedAt}|${row.noticeId}`
  const bytes = new TextEncoder().encode(payload)
  let latin1 = ''
  for (const byte of bytes) latin1 += String.fromCharCode(byte)
  return btoa(latin1).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * 커서에 **분류 지문을 싣지 않는다.**
 *
 * 서버 코덱이 담는 것은 tag·pinned·publishedAt·noticeId 넷뿐이라, 분류를 바꾼 채 옛 커서를 보내도
 * **거부하지 않는다**. 더블이 지문을 넣어 400으로 끊으면 FE가 옛 커서를 보내도 서버 덕에 테스트가
 * 통과해, 섞인 목록을 막는 유일한 방어선인 쿼리 키를 떼도 안 깨진다.
 */
function decodeCursor(raw: string): string | null {
  try {
    const latin1 = atob(raw.replace(/-/g, '+').replace(/_/g, '/'))
    const bytes = Uint8Array.from(latin1, char => char.charCodeAt(0))
    // fatal — UTF-8이 아닌 바이트열을 U+FFFD로 덮어 되살리면 깨진 커서가 조용히 통과한다.
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    const parts = decoded.split('|')
    if (parts.length !== 4 || parts[0] !== CURSOR_TAG) return null
    return parts[3] || null
  } catch {
    return null
  }
}

/** size는 1~100으로 절삭된다(범위를 벗어나도 400이 아니다). */
function clampSize(raw: string | null): number {
  if (raw == null) return 20
  const parsed = Math.trunc(Number(raw))
  if (!Number.isFinite(parsed) || parsed === 0) return 1
  return Math.min(100, Math.max(1, parsed))
}

export const noticeHandlers = [
  http.get(NOTICES_URL, ({ request }) => {
    const url = new URL(request.url)
    listQueries.push(url.search)
    // 값이 빈 파라미터는 BE가 미입력이 아니라 enum 바인딩 오류로 거절한다 — 스텁도 같이 거절한다.
    for (const [key, value] of url.searchParams.entries()) {
      if (value === '') {
        return HttpResponse.json(errorBody(90001, `${key}: 지원하지 않는 값입니다.`), {
          status: 400,
        })
      }
    }
    if (listError) {
      return HttpResponse.json(errorBody(listError.errorCode, listError.message), {
        status: listError.status,
      })
    }

    const category = url.searchParams.get('category')
    if (category != null && !CATEGORIES.includes(category as WireNoticeCategory)) {
      return HttpResponse.json(errorBody(90001, '지원하지 않는 값입니다.'), { status: 400 })
    }
    const size = clampSize(url.searchParams.get('size'))

    const cursorParam = url.searchParams.get('cursor')
    let afterId: string | null = null
    if (cursorParam != null) {
      afterId = decodeCursor(cursorParam)
      if (afterId == null) {
        return HttpResponse.json(errorBody(90002, '유효하지 않은 커서입니다.'), { status: 400 })
      }
    }

    const matched = notices.filter(row => category == null || row.category === category)
    // (고정 여부, 게시 시각, id) 내림차순 고정 — 중요 공지가 늘 앞에 온다.
    const sorted = [...matched].sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
      if (a.publishedAt !== b.publishedAt) return b.publishedAt.localeCompare(a.publishedAt)
      return b.noticeId.localeCompare(a.noticeId)
    })
    const anchor = afterId == null ? 0 : sorted.findIndex(row => row.noticeId === afterId) + 1
    const afterCursor = afterId != null && anchor === 0 ? [] : sorted.slice(anchor)
    const page = afterCursor.slice(0, size)
    const hasNext = afterCursor.length > size
    const last = page.at(-1)
    return HttpResponse.json({
      data: {
        items: page.map(summaryOf),
        // 첫 페이지만 채워진다 — 커서를 보낸 페이지는 null이다.
        totalCount: cursorParam == null ? matched.length : null,
        nextCursor: hasNext && last ? encodeCursor(last) : null,
        hasNext,
      },
    })
  }),

  http.get(NOTICE_DETAIL_URL, ({ params }) => {
    const raw = params['noticeId']
    const noticeId = Array.isArray(raw) ? raw[0] : raw
    const found = notices.find(row => row.noticeId === noticeId)
    // 초안·내린 공지·구매자 대상이 아닌 공지를 **모두 같은 404**로 끊는다 — 코드를 가르면 존재가 샌다.
    if (!found) {
      return HttpResponse.json(errorBody(150000, '공지를 찾을 수 없습니다.'), { status: 404 })
    }
    return HttpResponse.json({ data: detailOf(found) })
  }),
]
