import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { API_PATH_PREFIX } from '@aechak/api'

// vitest 공용 MSW 서버(test-setup.ts가 수명주기를 관리) — web-seller의 src/testing/msw 관례를
// web-admin에 이식했다. 모듈 모킹 대신 네트워크 레벨에서 가로채 실제 HTTP 경로(URL·봉투·에러
// 계약·상태 가드 우선순위)까지 테스트가 고정한다.
//
// 호스트를 둘로 나눠 둔 이유: 어드민 콘솔은 심사 업무를 admin 모듈에서 받고 인증·refresh는
// api 모듈에서 받는다. 두 호스트를 한 base로 합치면 요청이 엉뚱한 모듈로 나가도 MSW가 똑같이
// 받아 주어, 실제 배포에서만 드러나는 호스트 오배치를 테스트가 놓친다. 두 상수는 test-setup.ts의
// configureApiHosts 인자와 같은 값이어야 한다(admin 로컬 포트는 seller와 겹치지 않는 8082).
export const API_ORIGIN = 'http://localhost:8080'
export const ADMIN_ORIGIN = 'http://localhost:8082'
const apiBase = `${API_ORIGIN}${API_PATH_PREFIX}`
const adminBase = `${ADMIN_ORIGIN}${API_PATH_PREFIX}`

export const ADMIN_ROSTER_URL = `${adminBase}/admin/admins`
export const ADMIN_ROSTER_MEMBER_URL = `${ADMIN_ROSTER_URL}/:userId`
export const ADMIN_APPLICATIONS_URL = `${adminBase}/admin/seller-applications`
export const ADMIN_APPLICATION_DETAIL_URL = `${adminBase}/admin/seller-applications/:applicationId`
export const ADMIN_APPLICATION_APPROVE_URL = `${ADMIN_APPLICATION_DETAIL_URL}/approve`
export const ADMIN_APPLICATION_REJECT_URL = `${ADMIN_APPLICATION_DETAIL_URL}/reject`
export const WEB_REFRESH_URL = `${apiBase}/auth/web/refresh`

type WireStatus = 'DRAFT' | 'SUBMITTED' | 'REVIEWING' | 'APPROVED' | 'REJECTED' | 'CANCELLED'
type WireBusinessType = 'PERSONAL_GENERAL' | 'SOLE_PROPRIETORSHIP' | 'CORPORATE'

const WIRE_STATUSES: WireStatus[] = [
  'DRAFT',
  'SUBMITTED',
  'REVIEWING',
  'APPROVED',
  'REJECTED',
  'CANCELLED',
]

/** 승인·반려가 가능한 상태 — BE SellerApplication.requireDecidable()과 같은 집합이다. */
const DECIDABLE: WireStatus[] = ['SUBMITTED', 'REVIEWING']

/** BE AdminApplicationDetailResponse 모양의 서버 상태. 목록 행은 여기서 투영해 만든다. */
export interface AdminApplicationWire {
  applicationId: number
  status: WireStatus
  businessType: WireBusinessType
  businessName: string | null
  businessRegNo: string | null
  corpRegNo: string | null
  representativeName: string | null
  telesalesNumber: string | null
  bankCode: string | null
  accountNumber: string | null
  accountHolder: string | null
  appliedAt: string
  submittedAt: string | null
  decidedAt: string | null
  rejectionReason: string | null
  documents: { documentType: string; uploadedAt: string }[]
  reviews: { decision: 'APPROVED' | 'REJECTED'; rejectionReason: string | null; reviewedAt: string }[]
  previousApplications: { applicationId: number; status: WireStatus; decidedAt: string | null }[]
}

let applications: AdminApplicationWire[] = []

// presigned GET은 유효기간 5분이라 상세를 다시 조회할 때마다 새 URL이 나온다. 발급 횟수를 URL에
// 심어 두면 "서류 열기가 캐시된 URL을 재사용하지 않는다"를 테스트가 단언할 수 있다.
let downloadUrlIssueSeq = 0

export function makeAdminApplicationWire(
  overrides: Partial<AdminApplicationWire> = {},
): AdminApplicationWire {
  return {
    applicationId: 1,
    status: 'SUBMITTED',
    businessType: 'SOLE_PROPRIETORSHIP',
    businessName: '펫프렌즈상사',
    businessRegNo: '1234567890',
    corpRegNo: null,
    representativeName: '김민수',
    telesalesNumber: '2026-서울강남-0001',
    bankCode: '004',
    accountNumber: '110123456789',
    accountHolder: '김민수',
    appliedAt: '2026-06-18T09:00:00',
    submittedAt: '2026-06-18T10:00:00',
    decidedAt: null,
    rejectionReason: null,
    documents: [
      { documentType: 'BUSINESS_REGISTRATION', uploadedAt: '2026-06-18T09:30:00' },
      { documentType: 'TELESALES_REPORT', uploadedAt: '2026-06-18T09:31:00' },
      { documentType: 'BANKBOOK_COPY', uploadedAt: '2026-06-18T09:32:00' },
      { documentType: 'ID_CARD', uploadedAt: '2026-06-18T09:33:00' },
    ],
    reviews: [],
    previousApplications: [],
    ...overrides,
  }
}

const clone = (row: AdminApplicationWire): AdminApplicationWire => ({
  ...row,
  documents: row.documents.map(doc => ({ ...doc })),
  reviews: row.reviews.map(review => ({ ...review })),
  previousApplications: row.previousApplications.map(previous => ({ ...previous })),
})

/** 테스트마다 서버의 신청 목록을 세운다. 인자 없이 부르면 빈 목록(items: [], totalCount: 0). */
export function seedAdminApplications(rows: AdminApplicationWire[] = []): void {
  applications = rows.map(clone)
  downloadUrlIssueSeq = 0
}

/** 핸들러가 반영한 현재 신청 상태 — 테스트가 승인·반려 결과를 단언할 때 읽는다. */
export function currentAdminApplication(applicationId: number): AdminApplicationWire | null {
  const found = applications.find(row => row.applicationId === applicationId)
  return found ? clone(found) : null
}

const errorBody = (errorCode: number, message: string) => ({ errorCode, message })

function summaryOf(row: AdminApplicationWire) {
  // 목록 행에는 6필드뿐이다 — 사업자등록번호도 전화번호도 없다(BE AdminApplicationSummaryResponse).
  return {
    applicationId: row.applicationId,
    status: row.status,
    businessType: row.businessType,
    businessName: row.businessName,
    representativeName: row.representativeName,
    submittedAt: row.submittedAt,
  }
}

function detailOf(row: AdminApplicationWire) {
  downloadUrlIssueSeq += 1
  const issue = downloadUrlIssueSeq
  return {
    ...clone(row),
    // rejectionReason은 status가 REJECTED가 아니면 DB에 값이 남아 있어도 null로 내려간다.
    rejectionReason: row.status === 'REJECTED' ? row.rejectionReason : null,
    documents: row.documents.map(doc => ({
      ...doc,
      downloadUrl: `https://files.local/${doc.documentType}?issue=${issue}`,
    })),
  }
}

// 정렬은 서버가 소유한다 — submittedAt DESC, id DESC이고 submittedAt이 null인 건은 뒤로 밀린다.
function compareRows(a: AdminApplicationWire, b: AdminApplicationWire): number {
  if (a.submittedAt !== b.submittedAt) {
    if (a.submittedAt == null) return 1
    if (b.submittedAt == null) return -1
    return a.submittedAt < b.submittedAt ? 1 : -1
  }
  return b.applicationId - a.applicationId
}

const applicationHandlers = [
  http.get(ADMIN_APPLICATIONS_URL, ({ request }) => {
    const params = new URL(request.url).searchParams
    const status = params.get('status')
    if (status != null && !WIRE_STATUSES.includes(status as WireStatus)) {
      return HttpResponse.json(errorBody(90001, 'status: 잘못된 값입니다.'), { status: 400 })
    }
    // page 음수와 범위 밖 size는 서버가 보정하고 거절하지 않는다(BE `PageQuery.of`).
    // size는 기본값으로 되돌리는 것이 아니라 **1~100으로 절삭**한다 — `size=0`은 20이 아니라 1이다.
    const page = Math.max(0, Number(params.get('page') ?? 0) || 0)
    const sizeParam = params.get('size')
    const size =
      sizeParam == null ? 20 : Math.min(100, Math.max(1, Math.trunc(Number(sizeParam)) || 1))
    const matched = status == null ? applications : applications.filter(row => row.status === status)
    const sorted = [...matched].sort(compareRows)
    return HttpResponse.json({
      data: {
        items: sorted.slice(page * size, page * size + size).map(summaryOf),
        totalCount: matched.length,
      },
    })
  }),

  http.get(ADMIN_APPLICATION_DETAIL_URL, ({ params }) => {
    const row = applications.find(item => item.applicationId === Number(params['applicationId']))
    if (!row) {
      return HttpResponse.json(errorBody(10100, '입점 신청을 찾을 수 없습니다.'), { status: 404 })
    }
    return HttpResponse.json({ data: detailOf(row) })
  }),

  http.post(ADMIN_APPLICATION_APPROVE_URL, ({ params }) => {
    const row = applications.find(item => item.applicationId === Number(params['applicationId']))
    if (!row) {
      return HttpResponse.json(errorBody(10100, '입점 신청을 찾을 수 없습니다.'), { status: 404 })
    }
    if (!DECIDABLE.includes(row.status)) {
      return HttpResponse.json(
        errorBody(10101, '현재 신청 상태에서 허용되지 않는 전이입니다.'),
        { status: 409 },
      )
    }
    row.status = 'APPROVED'
    row.decidedAt = '2026-06-19T09:00:00'
    row.rejectionReason = null
    row.reviews.push({ decision: 'APPROVED', rejectionReason: null, reviewedAt: row.decidedAt })
    return new HttpResponse(null, { status: 204 })
  }),

  http.post(ADMIN_APPLICATION_REJECT_URL, async ({ params, request }) => {
    const body = (await request.json().catch(() => null)) as { reason?: string | null } | null
    const reason = body?.reason ?? ''
    // 검증 순서는 BE와 같아야 한다 — (1) @Valid 500자, (2) 404, (3) 상태 가드 409,
    // (4) 사유 공백 400. 상태 가드가 사유 검사보다 먼저라서 이미 결정된 신청에 빈 사유로
    // 반려하면 400/10102가 아니라 409/10101이다.
    if (reason.length > 500) {
      return HttpResponse.json(
        errorBody(90001, '반려 사유는 500자 이하여야 합니다.'),
        { status: 400 },
      )
    }
    const row = applications.find(item => item.applicationId === Number(params['applicationId']))
    if (!row) {
      return HttpResponse.json(errorBody(10100, '입점 신청을 찾을 수 없습니다.'), { status: 404 })
    }
    if (!DECIDABLE.includes(row.status)) {
      return HttpResponse.json(
        errorBody(10101, '현재 신청 상태에서 허용되지 않는 전이입니다.'),
        { status: 409 },
      )
    }
    if (reason.trim() === '') {
      return HttpResponse.json(errorBody(10102, '반려 사유는 필수입니다.'), { status: 400 })
    }
    row.status = 'REJECTED'
    row.decidedAt = '2026-06-19T09:00:00'
    row.rejectionReason = reason
    row.reviews.push({ decision: 'REJECTED', rejectionReason: reason, reviewedAt: row.decidedAt })
    return new HttpResponse(null, { status: 204 })
  }),

  // 401 시나리오에서 refresh가 성공으로 새면 에러 테스트가 조용히 통과한다 — 기본은 401 고정
  // (web-buyer·web-seller msw 관례). 어드민 모듈에는 /auth/*가 아예 없고 refresh는 늘 api
  // 호스트로 나가므로, 이 핸들러의 base가 apiBase인 것 자체가 호스트 분기의 회귀 감시다.
  http.post(WEB_REFRESH_URL, () =>
    HttpResponse.json(errorBody(20004, '인증이 필요합니다.'), { status: 401 }),
  ),
]

// ─── 관리자 명부 (admin 호스트 /admin/admins) ──────────────────────────────────
// BE AdminUserRoleService + User.promoteToAdmin의 가드 순서를 그대로 미러한다. 순서가 계약의
// 일부라서(자기 자신 판정이 존재 확인보다 먼저다) FE 분기가 틀리면 이 스텁에서 드러난다.

export type WireUserStatus = 'PENDING_ONBOARDING' | 'ACTIVE' | 'SUSPENDED' | 'WITHDRAWN'

/** 명부 응답 행 + 서버만 아는 값(role·요청자 여부 판정에 쓰는 status). */
export interface AdminRosterWire {
  userId: number
  nickname: string | null
  status: WireUserStatus
  joinedAt: string
  role: 'ADMIN' | 'GENERAL'
}

/** 요청자(JWT sub). `isSelf`는 BE가 응답 변환 단계에서 이 값과 비교해 만든다. */
export const CURRENT_ADMIN_USER_ID = 1

let roster: AdminRosterWire[] = []

export function makeAdminRosterWire(overrides: Partial<AdminRosterWire> = {}): AdminRosterWire {
  return {
    userId: 2,
    nickname: '운영자',
    status: 'ACTIVE',
    joinedAt: '2026-10-18T09:00:00',
    role: 'ADMIN',
    ...overrides,
  }
}

/** 인자 없이 부르면 요청자 1명만 있는 명부가 된다(마지막 관리자 가드 시나리오의 기본값). */
export function seedAdminRoster(rows: AdminRosterWire[] = []): void {
  roster = [
    makeAdminRosterWire({
      userId: CURRENT_ADMIN_USER_ID,
      // 'ActorTag' 같은 짧은 라벨과 겹치지 않는 이름을 쓴다 — 화면의 자기 행 pill은 '나'다.
      nickname: '현재 운영자',
      joinedAt: '2026-10-01T09:00:00',
    }),
    ...rows.map(row => ({ ...row })),
  ]
}

/** 핸들러가 반영한 현재 명부 — 테스트가 승격·강등 결과를 읽는다. */
export function currentAdminRoster(): AdminRosterWire[] {
  return roster.map(row => ({ ...row }))
}

const rosterHandlers = [
  http.get(ADMIN_ROSTER_URL, ({ request }) => {
    const params = new URL(request.url).searchParams
    // page 음수와 범위 밖 size는 서버가 보정하고 거절하지 않는다(BE PageQuery.of).
    const page = Math.max(0, Number(params.get('page') ?? 0) || 0)
    const sizeParam = params.get('size')
    const size = sizeParam == null ? 20 : Math.min(100, Math.max(1, Math.trunc(Number(sizeParam)) || 1))
    // 정렬은 가입 순(userId 오름차순) 고정이다.
    const admins = roster.filter(row => row.role === 'ADMIN').sort((a, b) => a.userId - b.userId)
    return HttpResponse.json({
      data: {
        items: admins.slice(page * size, page * size + size).map(row => ({
          userId: row.userId,
          nickname: row.nickname,
          status: row.status,
          joinedAt: row.joinedAt,
          isSelf: row.userId === CURRENT_ADMIN_USER_ID,
        })),
        totalCount: admins.length,
      },
    })
  }),

  http.post(ADMIN_ROSTER_URL, async ({ request }) => {
    const body = (await request.json().catch(() => null)) as { userId?: number | null } | null
    const userId = body?.userId
    if (userId == null) {
      return HttpResponse.json(errorBody(90001, '승격할 사용자 id는 필수입니다.'), { status: 400 })
    }
    // BE 가드 순서: ① 자기 자신(존재 확인보다 먼저) ② 없는 계정 ③ 비활성 비관리자 ④ 이미 관리자.
    if (userId === CURRENT_ADMIN_USER_ID) {
      return HttpResponse.json(errorBody(30014, '자신의 역할은 변경할 수 없습니다.'), { status: 403 })
    }
    const target = roster.find(row => row.userId === userId)
    if (!target) {
      return HttpResponse.json(errorBody(30000, '사용자를 찾을 수 없습니다.'), { status: 404 })
    }
    // 이미 관리자면 상태를 보지 않고 30012다(rejectInactivePromotion이 먼저 return한다).
    if (target.role === 'ADMIN') {
      return HttpResponse.json(errorBody(30012, '이미 관리자인 계정입니다.'), { status: 409 })
    }
    if (target.status !== 'ACTIVE') {
      return HttpResponse.json(
        errorBody(30017, '활성 상태인 계정만 관리자로 승격할 수 있습니다.'),
        { status: 409 },
      )
    }
    target.role = 'ADMIN'
    return new HttpResponse(null, { status: 204 })
  }),

  http.delete(ADMIN_ROSTER_MEMBER_URL, ({ params }) => {
    const userId = Number(params['userId'])
    if (userId === CURRENT_ADMIN_USER_ID) {
      return HttpResponse.json(errorBody(30014, '자신의 역할은 변경할 수 없습니다.'), { status: 403 })
    }
    const target = roster.find(row => row.userId === userId)
    if (!target) {
      return HttpResponse.json(errorBody(30000, '사용자를 찾을 수 없습니다.'), { status: 404 })
    }
    const adminCount = roster.filter(row => row.role === 'ADMIN').length
    if (target.role === 'ADMIN' && adminCount <= 1) {
      return HttpResponse.json(errorBody(30013, '마지막 관리자는 강등할 수 없습니다.'), { status: 409 })
    }
    // 이미 일반 회원이면 멱등 no-op도 204다.
    target.role = 'GENERAL'
    return new HttpResponse(null, { status: 204 })
  }),
]

export const handlers = [...applicationHandlers, ...rosterHandlers]
export const server = setupServer(...handlers)
