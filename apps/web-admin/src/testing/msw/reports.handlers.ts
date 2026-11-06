import { http, HttpResponse } from 'msw'
import { adminBase, clampSize, decodeCursorPayload, encodeCursorPayload, errorBody } from './base'

// `/admin/reports` 셋(목록·상세·처리)의 서버 흉내. BE `AdminReportController` + 응용 계층의
// 거절 계약을 그대로 옮긴다 — 처리 가능 조합을 화면이 아니라 핸들러가 고정해야, 화면이 고를 수
// 있게 둔 결정이 서버에서 거절되는 어긋남을 테스트가 잡는다(notices.handlers.ts 관례).
//
// **발송 관련 필드를 흉내에도 두지 않는다.** `noticeToOwner`는 결정 기록에 저장되고 상세로
// 되돌아오는 값일 뿐이고, 더블이 '발송됨' 같은 자리를 만들면 화면이 다시 "안내를 보냅니다"로
// 적어도 테스트가 통과한다 — 플랫폼에 발송 경로가 없다는 사실이 여기서부터 지켜져야 한다.

export const ADMIN_REPORTS_URL = `${adminBase}/admin/reports`
export const ADMIN_REPORT_DETAIL_URL = `${ADMIN_REPORTS_URL}/:targetType/:reportId`
export const ADMIN_REPORT_DECISION_URL = `${ADMIN_REPORT_DETAIL_URL}/decision`

export type WireReportTargetType = 'PRODUCT' | 'REVIEW' | 'USER' | 'SNS_POST'
export type WireReportStatus = 'RECEIVED' | 'DISMISSED' | 'SANCTIONED'
export type WireReportReason =
  | 'ABUSE'
  | 'FALSE_AD'
  | 'FRAUD'
  | 'ILLEGAL'
  | 'INAPPROPRIATE'
  | 'INFO_ERROR'
  | 'OTHER'
  | 'SPAM'
export type WireReportDecision = 'DISMISS' | 'HIDE_TARGET' | 'SANCTION_ACCOUNT'
export type WireReportDecisionReason =
  | 'FALSE_AD'
  | 'ABUSE'
  | 'EXTERNAL_TRADE'
  | 'ILLEGAL'
  | 'FALSE_REPORT'
  | 'NOT_CONFIRMED'
export type WireSanctionAction = 'RESTRICT' | 'SUSPEND' | 'BAN' | 'FORCE_WITHDRAW' | 'RELEASE'
export type WireSanctionReason = 'ABUSIVE_REVIEW' | 'CHAT_DISPUTE' | 'FALSE_REPORT' | 'OTHER'

/** 제재와 함께 보낼 수 없는 처리 사유 — "대상에게 위반이 없었다"는 판정이다. */
const NO_VIOLATION_REASONS: WireReportDecisionReason[] = ['FALSE_REPORT', 'NOT_CONFIRMED']

/** 쓰기가 반영하는 고정 시각 — 테스트가 처리 시각의 변화를 눈으로 확인할 수 있어야 한다. */
const NOW = '2026-11-03T09:00:00'

export interface AdminReportHistoryWire {
  reportId: number
  reasonCode: WireReportReason
  reasonText: string | null
  reportedAt: string
  status: WireReportStatus
}

export interface AdminReportDecisionWire {
  decision: WireReportDecision
  reasonCode: WireReportDecisionReason
  reasonDetail: string | null
  noticeToOwner: string | null
  internalMemo: string | null
  targetOwnerUserId: number
  actedByAdminId: number
  decidedAt: string
}

export interface AdminReportWire {
  targetType: WireReportTargetType
  reportId: number
  targetKey: string
  targetName: string | null
  targetOwnerUserId: number
  targetOwnerNickname: string | null
  reasonCode: WireReportReason
  reportCount: number
  reportedAt: string
  status: WireReportStatus
  /** 상세에만 있는 셋. 목록 summary는 이것들을 주지 않는다. */
  reporterId: number
  reasonText: string | null
  history: AdminReportHistoryWire[]
  decisionRecord: AdminReportDecisionWire | null
}

let reports: AdminReportWire[] = []
/** 제재 요청이 실제로 어떤 모양으로 들어왔는지 테스트가 읽는다(필수·금지 판정의 증거). */
let lastSanction: {
  action: WireSanctionAction
  reasonCode: WireSanctionReason
  reasonDetail?: string
  durationDays?: number
} | null = null

const rowKey = (targetType: string, reportId: number | string) => `${targetType}/${reportId}`

export function makeAdminReportWire(overrides: Partial<AdminReportWire> = {}): AdminReportWire {
  return {
    targetType: 'PRODUCT',
    reportId: 31,
    targetKey: '01HZXP0000000000000000031',
    targetName: '프리미엄 관절 영양제 180정',
    targetOwnerUserId: 2041,
    targetOwnerNickname: '멍멍마켓',
    reasonCode: 'FALSE_AD',
    reportCount: 7,
    reportedAt: '2026-10-26T09:12:00',
    status: 'RECEIVED',
    reporterId: 5102,
    reasonText: '임상으로 입증됐다고 적혀 있는데 근거 자료가 상세페이지에 없어요.',
    history: [
      {
        reportId: 31,
        reasonCode: 'FALSE_AD',
        reasonText: '근거 자료가 없어요.',
        reportedAt: '2026-10-26T09:12:00',
        status: 'RECEIVED',
      },
    ],
    decisionRecord: null,
    ...overrides,
  }
}

export function seedAdminReports(rows: AdminReportWire[] = []): void {
  reports = rows.map(row => ({ ...row }))
  lastSanction = null
}

/** 핸들러가 반영한 현재 신고 상태 — 테스트가 처리의 부작용을 읽는다. */
export function currentAdminReport(
  targetType: WireReportTargetType,
  reportId: number,
): AdminReportWire | null {
  const found = reports.find(
    row => row.targetType === targetType && row.reportId === reportId,
  )
  return found ? { ...found } : null
}

export const lastAdminReportSanction = () => (lastSanction ? { ...lastSanction } : null)

/** 목록 summary에는 `reporterId`·`reasonText`·`history`·`decision`이 **없다**. */
const summaryOf = (row: AdminReportWire) => ({
  targetType: row.targetType,
  reportId: row.reportId,
  targetKey: row.targetKey,
  targetName: row.targetName,
  targetOwnerUserId: row.targetOwnerUserId,
  targetOwnerNickname: row.targetOwnerNickname,
  reasonCode: row.reasonCode,
  reportCount: row.reportCount,
  reportedAt: row.reportedAt,
  status: row.status,
  decision: row.decisionRecord?.decision ?? null,
  decisionReasonCode: row.decisionRecord?.reasonCode ?? null,
  decidedAt: row.decisionRecord?.decidedAt ?? null,
})

const detailOf = (row: AdminReportWire) => ({
  report: summaryOf(row),
  reporterId: row.reporterId,
  reasonText: row.reasonText,
  history: row.history.map(entry => ({ ...entry })),
  decision: row.decisionRecord == null ? null : { ...row.decisionRecord },
})

const CURSOR_TAG = 'rpt'

/**
 * 커서에 **필터 지문을 싣는다.**
 *
 * 서버가 조건을 바꾼 채 보낸 옛 커서를 400(90002)으로 끊으므로 더블도 그렇게 끊어야 한다 —
 * 조용히 받아 주면 FE가 필터를 쿼리 키에서 빼도 테스트가 통과하고, 운영에서만 400으로 목록이
 * 멈춘다(공지 경로와 반대 방향의 함정이다).
 */
const encodeCursor = (fingerprint: string, lastKey: string) =>
  encodeCursorPayload(`${CURSOR_TAG}|${fingerprint}|${lastKey}`)

function decodeCursor(raw: string): { fingerprint: string; lastKey: string } | null {
  const decoded = decodeCursorPayload(raw)
  if (decoded == null) return null
  const parts = decoded.split('|')
  if (parts.length !== 4 || parts[0] !== CURSOR_TAG) return null
  return { fingerprint: `${parts[1]}|${parts[2]}`, lastKey: parts[3] ?? '' }
}

interface SanctionBody {
  action?: unknown
  reasonCode?: unknown
  reasonDetail?: unknown
  durationDays?: unknown
}

interface DecideBody {
  decision?: unknown
  reasonCode?: unknown
  reasonDetail?: unknown
  noticeToOwner?: unknown
  internalMemo?: unknown
  sanction?: SanctionBody | null
}

const asText = (value: unknown) => (typeof value === 'string' && value.trim() !== '' ? value : null)

/**
 * 결정과 제재 입력의 조합 판정.
 *
 * 140003(제재 필수)과 140004(제재 금지)를 어느 쪽에 붙였는지는 **스펙에서 확인하지 못했다** —
 * 화면이 두 코드를 한 문구로 다루므로 서버의 배정이 반대여도 화면 동작은 같다. 조합 자체가
 * 거절된다는 사실이 이 더블이 고정하려는 것이다.
 */
function validateDecide(row: AdminReportWire, body: DecideBody | null) {
  const decision = body?.decision
  const reasonCode = body?.reasonCode
  if (typeof decision !== 'string' || typeof reasonCode !== 'string') {
    return HttpResponse.json(errorBody(90001, '잘못된 요청입니다.'), { status: 400 })
  }
  if (row.status !== 'RECEIVED') {
    return HttpResponse.json(errorBody(140001, '이미 처리된 신고입니다.'), { status: 409 })
  }
  // 리뷰와 SNS 게시물만 숨길 수 있다 — 사용자는 숨길 콘텐츠가 아니고 상품은 노출을 되돌릴 수단이 없다.
  if (decision === 'HIDE_TARGET' && row.targetType !== 'REVIEW' && row.targetType !== 'SNS_POST') {
    return HttpResponse.json(errorBody(140002, '비공개 전환할 수 없는 대상입니다.'), {
      status: 400,
    })
  }
  const sanction = body?.sanction ?? null
  if (decision === 'SANCTION_ACCOUNT' && sanction == null) {
    return HttpResponse.json(errorBody(140003, '제재 내용이 필요합니다.'), { status: 400 })
  }
  if (decision !== 'SANCTION_ACCOUNT' && sanction != null) {
    return HttpResponse.json(errorBody(140004, '제재를 함께 보낼 수 없습니다.'), { status: 400 })
  }
  if (
    decision === 'SANCTION_ACCOUNT' &&
    NO_VIOLATION_REASONS.includes(reasonCode as WireReportDecisionReason)
  ) {
    return HttpResponse.json(errorBody(140004, '제재를 함께 보낼 수 없습니다.'), { status: 400 })
  }
  if (sanction != null) {
    // 제재 어휘·판정은 회원 제재 경로에 위임된다 — RELEASE는 해제 경로가 만드는 값이다.
    if (sanction.action === 'RELEASE') {
      return HttpResponse.json(errorBody(90001, '잘못된 요청입니다.'), { status: 400 })
    }
    if (sanction.reasonCode === 'OTHER' && asText(sanction.reasonDetail) == null) {
      return HttpResponse.json(errorBody(30800, '상세 사유가 필요합니다.'), { status: 400 })
    }
    if (sanction.action === 'SUSPEND' && sanction.durationDays == null) {
      return HttpResponse.json(errorBody(30801, '제재 기간이 필요합니다.'), { status: 400 })
    }
    if (sanction.action !== 'SUSPEND' && sanction.durationDays != null) {
      return HttpResponse.json(errorBody(30802, '제재 기간을 지정할 수 없습니다.'), {
        status: 400,
      })
    }
  }
  return null
}

export const reportHandlers = [
  http.get(ADMIN_REPORTS_URL, ({ request }) => {
    const params = new URL(request.url).searchParams
    const targetType = params.get('targetType')
    const status = params.get('status')
    const size = clampSize(params.get('size'))
    const fingerprint = `${targetType ?? 'none'}|${status ?? 'none'}`

    const cursorParam = params.get('cursor')
    let afterKey: string | null = null
    if (cursorParam != null) {
      const decoded = decodeCursor(cursorParam)
      // 조건이 바뀐 채 옛 커서를 보내면 서버가 끊는다 — 지문이 어긋나도 같은 400이다.
      if (decoded == null || decoded.fingerprint !== fingerprint) {
        return HttpResponse.json(errorBody(90002, '유효하지 않은 커서입니다.'), { status: 400 })
      }
      afterKey = decoded.lastKey
    }

    const matched = reports
      .filter(row => targetType == null || row.targetType === targetType)
      .filter(row => status == null || row.status === status)
    // 접수 역순. 같은 시각이면 종류+번호 내림차순으로 갈라 경계가 흔들리지 않게 한다.
    const sorted = [...matched].sort((a, b) =>
      a.reportedAt === b.reportedAt
        ? rowKey(b.targetType, b.reportId).localeCompare(rowKey(a.targetType, a.reportId))
        : b.reportedAt.localeCompare(a.reportedAt),
    )
    const anchor =
      afterKey == null
        ? 0
        : sorted.findIndex(row => rowKey(row.targetType, row.reportId) === afterKey) + 1
    const afterCursor = afterKey != null && anchor === 0 ? [] : sorted.slice(anchor)
    const page = afterCursor.slice(0, size)
    const hasNext = afterCursor.length > size
    const last = page[page.length - 1]
    return HttpResponse.json({
      data: {
        items: page.map(summaryOf),
        totalCount: matched.length,
        nextCursor:
          hasNext && last ? encodeCursor(fingerprint, rowKey(last.targetType, last.reportId)) : null,
        hasNext,
      },
    })
  }),

  http.get(ADMIN_REPORT_DETAIL_URL, ({ params }) => {
    const found = findReport(params['targetType'], params['reportId'])
    if (found == null) {
      return HttpResponse.json(errorBody(140000, '신고를 찾을 수 없습니다.'), { status: 404 })
    }
    return HttpResponse.json({ data: detailOf(found) })
  }),

  http.post(ADMIN_REPORT_DECISION_URL, async ({ params, request }) => {
    const body = (await request.json().catch(() => null)) as DecideBody | null
    const found = findReport(params['targetType'], params['reportId'])
    if (found == null) {
      return HttpResponse.json(errorBody(140000, '신고를 찾을 수 없습니다.'), { status: 404 })
    }
    const invalid = validateDecide(found, body)
    if (invalid) return invalid

    const sanction = body?.sanction ?? null
    lastSanction =
      sanction == null
        ? null
        : {
            action: sanction.action as WireSanctionAction,
            reasonCode: sanction.reasonCode as WireSanctionReason,
            ...(typeof sanction.reasonDetail === 'string'
              ? { reasonDetail: sanction.reasonDetail }
              : {}),
            ...(typeof sanction.durationDays === 'number'
              ? { durationDays: sanction.durationDays }
              : {}),
          }
    const decision = body!.decision as WireReportDecision
    found.status = decision === 'DISMISS' ? 'DISMISSED' : 'SANCTIONED'
    // SNS 게시물의 비공개 전환과 계정 제재는 게시물을 운영자 삭제로 지운다. 지운 게시물의 캡션은 null이다.
    if (found.targetType === 'SNS_POST' && decision !== 'DISMISS') found.targetName = null
    found.decisionRecord = {
      decision,
      reasonCode: body!.reasonCode as WireReportDecisionReason,
      reasonDetail: asText(body!.reasonDetail),
      noticeToOwner: asText(body!.noticeToOwner),
      internalMemo: asText(body!.internalMemo),
      targetOwnerUserId: found.targetOwnerUserId,
      actedByAdminId: 9001,
      decidedAt: NOW,
    }
    // 성공은 204 No Content(본문 없음)다.
    return new HttpResponse(null, { status: 204 })
  }),
]

function findReport(
  rawType: string | readonly string[] | undefined,
  rawId: string | readonly string[] | undefined,
): AdminReportWire | null {
  const targetType = Array.isArray(rawType) ? rawType[0] : rawType
  const reportId = Number(Array.isArray(rawId) ? rawId[0] : rawId)
  if (!Number.isFinite(reportId)) return null
  return (
    reports.find(row => row.targetType === targetType && row.reportId === reportId) ?? null
  )
}
