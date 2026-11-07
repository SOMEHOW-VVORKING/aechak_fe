import { http, HttpResponse } from 'msw'
import { adminBase, clampSize, decodeCursorPayload, encodeCursorPayload, errorBody } from './base'

// `GET /admin/audit-logs` 하나의 서버 흉내. 감사 로그는 조회뿐이라 쓰기 핸들러가 없다.
//
// **스펙에 없는 것을 흉내로 못박지 않는다.** springdoc 출력에는 이 경로의 errorCode도, 커서 거절
// 계약도, size 범위도, `keyword`가 무엇을 매칭하는지도 적혀 있지 않다. 그래서 더블은 ① 깨진 커서를
// 전역 90001(잘못된 요청)로 끊고 ② 검색 범위를 자유 문자열 셋으로만 좁히며, 두 선택을 화면이
// 계약으로 읽지 않게 했다 — 화면은 errorCode를 보지 않고 status로만 문구를 가르고, 검색
// placeholder도 범위를 주장하지 않는다.
export const ADMIN_AUDIT_LOGS_URL = `${adminBase}/admin/audit-logs`

export type WireAuditAction =
  | 'SELLER_APPLICATION_APPROVED'
  | 'SELLER_APPLICATION_REJECTED'
  | 'SELLER_SUSPENDED'
  | 'SELLER_SUSPENSION_RELEASED'
  | 'SELLER_MEMO_UPDATED'
  | 'ADMIN_PROMOTED'
  | 'ADMIN_DEMOTED'
  | 'PRODUCT_INSPECTION_APPROVED'
  | 'PRODUCT_INSPECTION_REJECTED'
  | 'PRODUCT_SALE_SUSPENDED'
  | 'PRODUCT_SALE_RESUMED'
  | 'CLAIM_INTERVENED'
  | 'MEMBER_SANCTIONED'
  | 'MEMBER_SANCTION_RELEASED'
  | 'MEMBER_PROFILE_RESET'
  | 'INQUIRY_ANSWERED'
  | 'REVIEW_BLINDED'
  | 'REVIEW_UNBLINDED'
  | 'REVIEW_DELETED'
  | 'ORDER_DISPATCH_NUDGED'
  | 'NOTICE_UPDATED'
  | 'NOTICE_PUBLISHED'
  | 'NOTICE_UNPUBLISHED'
  | 'REPORT_DECIDED'

export type WireAuditTargetType =
  | 'SELLER_APPLICATION'
  | 'SELLER'
  | 'ADMIN_USER'
  | 'MEMBER'
  | 'PRODUCT'
  | 'CLAIM'
  | 'INQUIRY'
  | 'REVIEW'
  | 'ORDER'
  | 'NOTICE'
  | 'REPORT'

export type WireAuditResult = 'SUCCESS' | 'FAILURE'
export type WireAuditActorRole = 'GENERAL' | 'ADMIN'

export interface AdminAuditLogWire {
  id: string
  actedAt: string
  actorPublicId: string
  actorNickname: string | null
  actorRole: WireAuditActorRole
  action: WireAuditAction
  /** 서버가 만든 한글 라벨 — 화면 열이 이 값을 그대로 쓴다. */
  actionLabel: string
  targetType: WireAuditTargetType
  targetTypeLabel: string
  /** 종류마다 뜻이 다른 식별자. 서버는 접두 코드를 붙이지 않는다. */
  targetId: string
  targetLabel: string | null
  reason: string | null
  result: WireAuditResult
  httpStatus: number
  requestId: string
  clientIp: string | null
}

let logs: AdminAuditLogWire[] = []
/** 시드하지 않은 테스트(이탈 가드의 '다른 화면' 목적지 등)에서는 null이다 — 화면이 '기록 시작 시각을 받지 못했다'로 갈린다. */
let recordingSince: string | null = null

export function makeAdminAuditLogWire(
  overrides: Partial<AdminAuditLogWire> = {},
): AdminAuditLogWire {
  return {
    id: 'aud_90412',
    actedAt: '2026-10-26T20:31:08',
    actorPublicId: '01HZXA0000000000000000001',
    actorNickname: '김운영',
    actorRole: 'ADMIN',
    action: 'SELLER_APPLICATION_APPROVED',
    actionLabel: '셀러 입점 승인',
    targetType: 'SELLER_APPLICATION',
    targetTypeLabel: '입점 신청',
    targetId: '20412',
    targetLabel: '보리펫샵',
    reason: null,
    result: 'SUCCESS',
    httpStatus: 200,
    requestId: 'req_01JB7Q2M4C',
    clientIp: '10.42.8.117',
    ...overrides,
  }
}

export function seedAdminAuditLogs(
  rows: AdminAuditLogWire[] = [],
  since: string | null = null,
): void {
  logs = rows.map(row => ({ ...row }))
  recordingSince = since
}

const CURSOR_TAG = 'aud'

const encodeCursor = (lastId: string) => encodeCursorPayload(`${CURSOR_TAG}|${lastId}`)

function decodeCursor(raw: string): string | null {
  const decoded = decodeCursorPayload(raw)
  if (decoded == null) return null
  const parts = decoded.split('|')
  if (parts.length !== 2 || parts[0] !== CURSOR_TAG) return null
  return parts[1] || null
}

/**
 * 검색 매칭 집합.
 *
 * 서버가 무엇을 보는지 스펙에 설명이 없어 **자유 문자열 셋**(행위자 닉네임·대상 이름·사유 메모)만
 * 본다. 액션·종류는 전용 필터가 있으므로 검색까지 겹치면 어느 축이 걸렀는지 테스트가 말할 수 없다.
 */
const matchesKeyword = (row: AdminAuditLogWire, keyword: string): boolean =>
  [row.actorNickname, row.targetLabel, row.reason].some(value => value?.includes(keyword) === true)

export const auditLogHandlers = [
  http.get(ADMIN_AUDIT_LOGS_URL, ({ request }) => {
    const params = new URL(request.url).searchParams
    const targetType = params.get('targetType')
    const action = params.get('action')
    const result = params.get('result')
    const keyword = params.get('keyword')?.trim() || null
    const actorPublicId = params.get('actorPublicId')
    const size = clampSize(params.get('size'))

    const cursorParam = params.get('cursor')
    let afterId: string | null = null
    if (cursorParam != null) {
      afterId = decodeCursor(cursorParam)
      if (afterId == null) {
        return HttpResponse.json(errorBody(90001, '잘못된 요청입니다.'), { status: 400 })
      }
    }

    const matched = logs
      .filter(row => targetType == null || row.targetType === targetType)
      .filter(row => action == null || row.action === action)
      .filter(row => result == null || row.result === result)
      .filter(row => actorPublicId == null || row.actorPublicId === actorPublicId)
      .filter(row => keyword == null || matchesKeyword(row, keyword))
    // 최신순 — 같은 시각이면 id 내림차순으로 갈라 페이지 경계가 흔들리지 않게 한다.
    const sorted = [...matched].sort((a, b) =>
      a.actedAt === b.actedAt ? b.id.localeCompare(a.id) : b.actedAt.localeCompare(a.actedAt),
    )
    // 커서는 마지막으로 보낸 행의 id다(offset이 아니다) — 그 행이 걸러져 사라지면 이어 읽을 자리가
    // 없으므로 빈 페이지를 준다.
    const anchor = afterId == null ? 0 : sorted.findIndex(row => row.id === afterId) + 1
    const afterCursor = afterId != null && anchor === 0 ? [] : sorted.slice(anchor)
    const page = afterCursor.slice(0, size)
    const hasNext = afterCursor.length > size
    return HttpResponse.json({
      data: {
        items: page.map(row => ({ ...row })),
        totalCount: cursorParam == null ? matched.length : null,
        nextCursor: hasNext ? encodeCursor(page[page.length - 1]!.id) : null,
        hasNext,
        recordingSince,
      },
    })
  }),
]
