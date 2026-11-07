import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { adminBase, apiBase, errorBody } from './base'
import { auditLogHandlers } from './audit-log.handlers'
import { noticeHandlers } from './notices.handlers'
import { inquiryHandlers } from './inquiries.handlers'
import { claimHandlers } from './claims.handlers'
import { reviewHandlers } from './reviews.handlers'
import { reportHandlers } from './reports.handlers'
import { sellerHandlers } from './sellers.handlers'

// vitest 공용 MSW 서버(test-setup.ts가 수명주기를 관리) — web-seller의 src/testing/msw 관례를
// web-admin에 이식했다. 모듈 모킹 대신 네트워크 레벨에서 가로채 실제 HTTP 경로(URL·봉투·에러
// 계약·상태 가드 우선순위)까지 테스트가 고정한다.
//
// 호스트를 둘로 나눠 둔 이유: 어드민 콘솔은 심사 업무를 admin 모듈에서 받고 인증·refresh는
// api 모듈에서 받는다. 두 호스트를 한 base로 합치면 요청이 엉뚱한 모듈로 나가도 MSW가 똑같이
// 받아 주어, 실제 배포에서만 드러나는 호스트 오배치를 테스트가 놓친다. 두 상수는 test-setup.ts의
// configureApiHosts 인자와 같은 값이어야 한다(admin 로컬 포트는 seller와 겹치지 않는 8082).
export { ADMIN_ORIGIN, API_ORIGIN } from './base'
export {
  ADMIN_REPORTS_URL,
  ADMIN_REPORT_DECISION_URL,
  ADMIN_REPORT_DETAIL_URL,
  currentAdminReport,
  lastAdminReportSanction,
  makeAdminReportWire,
  seedAdminReports,
  type AdminReportWire,
} from './reports.handlers'
export {
  ADMIN_SELLERS_URL,
  ADMIN_SELLER_DETAIL_URL,
  ADMIN_SELLER_MEMO_URL,
  ADMIN_SELLER_RELEASE_URL,
  ADMIN_SELLER_SUSPEND_URL,
  SANCTION_HISTORY_LIMIT,
  currentAdminSeller,
  lastAdminSellerWrite,
  makeAdminSellerWire,
  seedAdminSellers,
  type AdminSellerWire,
  type SellerSanctionHistoryWire,
} from './sellers.handlers'
export {
  ADMIN_AUDIT_LOGS_URL,
  makeAdminAuditLogWire,
  seedAdminAuditLogs,
  type AdminAuditLogWire,
} from './audit-log.handlers'
export {
  ADMIN_NOTICES_URL,
  ADMIN_NOTICE_DETAIL_URL,
  ADMIN_NOTICE_PUBLISH_URL,
  ADMIN_NOTICE_UNPUBLISH_URL,
  currentAdminNotice,
  makeAdminNoticeWire,
  seedAdminNotices,
  type AdminNoticeWire,
} from './notices.handlers'
export {
  ADMIN_CLAIMS_URL,
  ADMIN_CLAIM_DETAIL_URL,
  ADMIN_CLAIM_INTERVENE_URL,
  ADMIN_CLAIM_REASONS_URL,
  currentAdminClaim,
  makeAdminClaimWire,
  seedAdminClaims,
  type AdminClaimWire,
} from './claims.handlers'
export {
  ADMIN_INQUIRIES_URL,
  ADMIN_INQUIRY_ANSWER_URL,
  ADMIN_INQUIRY_DETAIL_URL,
  ADMIN_INQUIRY_STATUS_URL,
  currentAdminInquiry,
  makeAdminInquiryWire,
  seedAdminInquiries,
  type AdminInquiryWire,
} from './inquiries.handlers'
export {
  ADMIN_REVIEWS_URL,
  ADMIN_REVIEW_BLIND_URL,
  ADMIN_REVIEW_DETAIL_URL,
  ADMIN_REVIEW_UNBLIND_URL,
  currentAdminReview,
  makeAdminReviewWire,
  seedAdminReviews,
  type AdminReviewWire,
} from './reviews.handlers'

export const ADMIN_ROSTER_URL = `${adminBase}/admin/admins`
export const ADMIN_ROSTER_MEMBER_URL = `${ADMIN_ROSTER_URL}/:userId`
export const ADMIN_APPLICATIONS_URL = `${adminBase}/admin/seller-applications`
export const ADMIN_APPLICATION_DETAIL_URL = `${adminBase}/admin/seller-applications/:applicationId`
export const ADMIN_APPLICATION_APPROVE_URL = `${ADMIN_APPLICATION_DETAIL_URL}/approve`
export const ADMIN_APPLICATION_REJECT_URL = `${ADMIN_APPLICATION_DETAIL_URL}/reject`
export const ADMIN_PRODUCT_INSPECTIONS_URL = `${adminBase}/admin/product-inspections`
export const ADMIN_MEMBERS_URL = `${adminBase}/admin/members`
export const ADMIN_MEMBER_DETAIL_URL = `${ADMIN_MEMBERS_URL}/:userId`
export const ADMIN_MEMBER_SANCTION_URL = `${ADMIN_MEMBER_DETAIL_URL}/sanctions`
export const ADMIN_MEMBER_RELEASE_URL = `${ADMIN_MEMBER_SANCTION_URL}/release`
export const ADMIN_MEMBER_PROFILE_RESET_URL = `${ADMIN_MEMBER_DETAIL_URL}/profile/reset`
export const ADMIN_ORDERS_URL = `${adminBase}/admin/orders`
export const ADMIN_ORDER_METRICS_URL = `${ADMIN_ORDERS_URL}/metrics`
export const ADMIN_ORDER_DETAIL_URL = `${ADMIN_ORDERS_URL}/:orderId`
export const ADMIN_ORDER_NUDGE_URL = `${ADMIN_ORDER_DETAIL_URL}/dispatch-nudges`
export const WEB_REFRESH_URL = `${apiBase}/auth/web/refresh`
// 기본 핸들러를 두지 않는다 — 로그아웃을 부르는지/안 부르는지가 테스트의 단언이라,
// 조용히 204를 주는 기본값이 있으면 "취소했는데 호출했다"는 회귀가 통과한다.
export const WEB_LOGOUT_URL = `${apiBase}/auth/web/logout`

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

// ─── 일반 회원 관리 (admin 호스트 /admin/members) ──────────────────────────────
// BE AdminMemberService + User의 제재 전이 가드를 그대로 미러한다. 가드 순서가 계약의 일부라
// (자기 자신 → 존재 확인 → 관리자 → 종단 상태) FE 분기가 틀리면 이 스텁에서 드러난다.

export type WireMemberStatus =
  | 'PENDING_ONBOARDING'
  | 'ACTIVE'
  | 'RESTRICTED'
  | 'SUSPENDED'
  | 'BANNED'
  | 'WITHDRAWN'

export type WireSanctionAction = 'RESTRICT' | 'SUSPEND' | 'BAN' | 'FORCE_WITHDRAW' | 'RELEASE'
export type WireSanctionReason = 'ABUSIVE_REVIEW' | 'CHAT_DISPUTE' | 'FALSE_REPORT' | 'OTHER'

export interface MemberSanctionWire {
  sanctionId: number
  action: WireSanctionAction
  reasonCode: WireSanctionReason | null
  reasonDetail: string | null
  effectiveUntil: string | null
  memo: string | null
  actedByAdminId: number
  actedAt: string
}

/** 상세 응답 모양의 서버 상태. 목록 행은 member를 그대로 투영한다. */
export interface AdminMemberWire {
  userId: number
  publicId: string
  nickname: string | null
  /** 저장값. 유효 상태(status)는 핸들러가 sanctionUntil로 계산한다 — 서버와 같은 규칙이다. */
  storedStatus: WireMemberStatus
  sanctionUntil: string | null
  warningCount: number
  reportCount: number
  joinedAt: string
  role: 'ADMIN' | 'GENERAL'
  profileImageUrl: string | null
  bio: string | null
  sanctions: MemberSanctionWire[]
}

let members: AdminMemberWire[] = []
let sanctionIdSeq = 0

export function makeAdminMemberWire(overrides: Partial<AdminMemberWire> = {}): AdminMemberWire {
  return {
    userId: 1001,
    publicId: '01HZXK0000000000000000001',
    nickname: '코코맘',
    storedStatus: 'ACTIVE',
    sanctionUntil: null,
    warningCount: 0,
    reportCount: 0,
    joinedAt: '2026-05-02T09:00:00',
    role: 'GENERAL',
    profileImageUrl: null,
    bio: null,
    sanctions: [],
    ...overrides,
  }
}

const cloneMember = (row: AdminMemberWire): AdminMemberWire => ({
  ...row,
  sanctions: row.sanctions.map(entry => ({ ...entry })),
})

export function seedAdminMembers(rows: AdminMemberWire[] = []): void {
  members = rows.map(cloneMember)
  sanctionIdSeq = 0
}

/** 핸들러가 반영한 현재 회원 상태 — 테스트가 제재·해제 결과를 읽는다. */
export function currentAdminMember(userId: number): AdminMemberWire | null {
  const found = members.find(row => row.userId === userId)
  return found ? cloneMember(found) : null
}

/** 유효 상태 — 기간이 지난 임시 정지는 ACTIVE로 내려간다(BE UserStatus.effective와 같은 규칙). */
function effectiveStatus(row: AdminMemberWire): WireMemberStatus {
  if (row.storedStatus !== 'SUSPENDED' || row.sanctionUntil == null) return row.storedStatus
  return new Date(row.sanctionUntil).getTime() <= Date.now() ? 'ACTIVE' : 'SUSPENDED'
}

function memberSummaryOf(row: AdminMemberWire) {
  return {
    userId: row.userId,
    publicId: row.publicId,
    nickname: row.nickname,
    status: effectiveStatus(row),
    storedStatus: row.storedStatus,
    sanctionUntil: row.sanctionUntil,
    warningCount: row.warningCount,
    reportCount: row.reportCount,
    joinedAt: row.joinedAt,
  }
}

const STATUS_FILTERS: Record<string, WireMemberStatus[]> = {
  ALL: [],
  NORMAL: ['ACTIVE', 'PENDING_ONBOARDING'],
  RESTRICTED: ['RESTRICTED'],
  SUSPENDED: ['SUSPENDED'],
  BANNED: ['BANNED'],
  WITHDRAWN: ['WITHDRAWN'],
}

/** 커서는 서버와 같은 모양(base64url "m:필터:마지막id")이다 — FE가 값을 들여다보지 않는지도 함께 고정된다. */
const encodeCursor = (filter: string, lastUserId: number) =>
  btoa(`m:${filter}:${lastUserId}`).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

function decodeCursor(raw: string): { filter: string; lastUserId: number } | null {
  try {
    const parts = atob(raw.replace(/-/g, '+').replace(/_/g, '/')).split(':')
    if (parts.length !== 3 || parts[0] !== 'm') return null
    const lastUserId = Number(parts[2])
    return Number.isFinite(lastUserId) ? { filter: parts[1]!, lastUserId } : null
  } catch {
    return null
  }
}

const memberHandlers = [
  http.get(ADMIN_MEMBERS_URL, ({ request }) => {
    const params = new URL(request.url).searchParams
    const rawFilter = params.get('status')
    // 알 수 없는 상태 필터는 400이 아니라 ALL로 본다(BE MemberStatusFilter.from).
    const filter = rawFilter != null && rawFilter in STATUS_FILTERS ? rawFilter : 'ALL'
    const cursorParam = params.get('cursor')
    let lastUserId: number | null = null
    if (cursorParam != null) {
      const decoded = decodeCursor(cursorParam)
      // 필터를 바꾼 채 보낸 옛 커서와 망가진 커서는 같은 400/90002다.
      if (!decoded || decoded.filter !== filter) {
        return HttpResponse.json(errorBody(90002, '유효하지 않은 커서입니다.'), { status: 400 })
      }
      lastUserId = decoded.lastUserId
    }
    const sizeParam = params.get('size')
    const size =
      sizeParam == null ? 20 : Math.min(100, Math.max(1, Math.trunc(Number(sizeParam)) || 1))
    const keyword = params.get('keyword')
    const joinedFrom = params.get('joinedFrom')
    const joinedTo = params.get('joinedTo')
    const statuses = STATUS_FILTERS[filter] ?? []

    // 관리자 계정은 이 목록에 없다(명부 경로가 따로 있다).
    const matched = members
      .filter(row => row.role === 'GENERAL')
      .filter(row => statuses.length === 0 || statuses.includes(row.storedStatus))
      .filter(row => {
        if (keyword == null) return true
        return (row.nickname ?? '').includes(keyword) || String(row.userId) === keyword
      })
      .filter(row => (joinedFrom == null ? true : row.joinedAt.slice(0, 10) >= joinedFrom))
      // 상한은 포함이다 — 서버가 다음 날 0시 미만으로 변환한다.
      .filter(row => (joinedTo == null ? true : row.joinedAt.slice(0, 10) <= joinedTo))

    const sorted = [...matched].sort((a, b) => b.userId - a.userId)
    const afterCursor = lastUserId == null ? sorted : sorted.filter(row => row.userId < lastUserId!)
    const page = afterCursor.slice(0, size)
    const hasNext = afterCursor.length > size
    return HttpResponse.json({
      data: {
        items: page.map(memberSummaryOf),
        totalCount: matched.length,
        nextCursor: hasNext ? encodeCursor(filter, page[page.length - 1]!.userId) : null,
        hasNext,
      },
    })
  }),

  http.get(ADMIN_MEMBER_DETAIL_URL, ({ params }) => {
    const row = members.find(item => item.userId === Number(params['userId']))
    // 없는 계정과 관리자 계정이 같은 404다.
    if (!row || row.role === 'ADMIN') {
      return HttpResponse.json(errorBody(30000, '사용자를 찾을 수 없습니다.'), { status: 404 })
    }
    return HttpResponse.json({
      data: {
        member: memberSummaryOf(row),
        profileImageUrl: row.profileImageUrl,
        bio: row.bio,
        sanctions: [...row.sanctions].sort((a, b) => b.sanctionId - a.sanctionId),
      },
    })
  }),

  http.post(ADMIN_MEMBER_SANCTION_URL, async ({ params, request }) => {
    const body = (await request.json().catch(() => null)) as {
      action?: WireSanctionAction
      reasonCode?: WireSanctionReason
      reasonDetail?: string
      durationDays?: number
      memo?: string
    } | null
    const action = body?.action
    const reasonCode = body?.reasonCode
    // @Valid가 먼저다 — action·reasonCode 누락과 RELEASE 전송은 모두 90001이다.
    if (action == null || reasonCode == null) {
      return HttpResponse.json(errorBody(90001, '잘못된 요청입니다.'), { status: 400 })
    }
    if (action === 'RELEASE') {
      return HttpResponse.json(errorBody(90001, '잘못된 요청입니다.'), { status: 400 })
    }
    if ((body?.memo ?? '').length > 300 || (body?.reasonDetail ?? '').length > 500) {
      return HttpResponse.json(errorBody(90001, '잘못된 요청입니다.'), { status: 400 })
    }
    const guard = guardSanctionTarget(Number(params['userId']))
    if (isRejection(guard)) return guard
    const row = guard
    // 입력 검증(기간·상세 사유)이 상태 전이보다 먼저다 — BE가 이력 행을 먼저 만든다.
    if (action === 'SUSPEND' && body?.durationDays == null) {
      return HttpResponse.json(errorBody(30801, '임시 정지는 제재 기간이 필요합니다.'), { status: 400 })
    }
    if (action !== 'SUSPEND' && body?.durationDays != null) {
      return HttpResponse.json(
        errorBody(30802, '임시 정지가 아닌 제재에는 기간을 지정할 수 없습니다.'),
        { status: 400 },
      )
    }
    if (reasonCode === 'OTHER' && (body?.reasonDetail ?? '').trim() === '') {
      return HttpResponse.json(
        errorBody(30800, '기타 사유 제재는 상세 사유가 필요합니다.'),
        { status: 400 },
      )
    }
    const terminal = terminalStateError(row)
    if (terminal) return terminal
    // 온보딩 전 계정은 돌아올 상태를 잃어 되돌아오는 제재를 받지 못한다(BE 30023).
    if (row.storedStatus === 'PENDING_ONBOARDING' && (action === 'RESTRICT' || action === 'SUSPEND')) {
      return HttpResponse.json(
        errorBody(
          30023,
          '가입을 마치지 않은 계정에는 이용 제한·임시 정지를 걸 수 없습니다. 영구 정지나 탈퇴 처리를 사용해 주세요.',
        ),
        { status: 409 },
      )
    }

    const effectiveUntil =
      action === 'SUSPEND'
        ? new Date(Date.now() + body!.durationDays! * 86_400_000).toISOString().slice(0, 19)
        : null
    if (action === 'RESTRICT') {
      row.storedStatus = 'RESTRICTED'
      row.sanctionUntil = null
    } else if (action === 'SUSPEND') {
      row.storedStatus = 'SUSPENDED'
      row.sanctionUntil = effectiveUntil
    } else if (action === 'BAN') {
      row.storedStatus = 'BANNED'
      row.sanctionUntil = null
    } else {
      row.storedStatus = 'WITHDRAWN'
      row.sanctionUntil = null
      // 탈퇴 처리는 닉네임 점유를 푼다(영구 정지는 유지한다).
      row.nickname = null
      row.profileImageUrl = null
      row.bio = null
    }
    sanctionIdSeq += 1
    row.sanctions.push({
      sanctionId: sanctionIdSeq,
      action,
      reasonCode,
      reasonDetail: body?.reasonDetail?.trim() || null,
      effectiveUntil,
      memo: body?.memo?.trim() || null,
      actedByAdminId: CURRENT_ADMIN_USER_ID,
      actedAt: '2026-10-27T09:00:00',
    })
    return new HttpResponse(null, { status: 204 })
  }),

  // 프로필 초기화 — 관리자 계정은 조회처럼 404, 프로필이 없는 계정(온보딩 전, 탈퇴)은 30024다.
  http.post(ADMIN_MEMBER_PROFILE_RESET_URL, ({ params }) => {
    const row = members.find(item => item.userId === Number(params['userId']))
    if (!row || row.role === 'ADMIN') {
      return HttpResponse.json(errorBody(30000, '사용자를 찾을 수 없습니다.'), { status: 404 })
    }
    if (row.storedStatus === 'PENDING_ONBOARDING' || row.storedStatus === 'WITHDRAWN') {
      return HttpResponse.json(
        errorBody(30024, '프로필이 없는 계정은 프로필을 초기화할 수 없습니다.'),
        { status: 409 },
      )
    }
    row.profileImageUrl = null
    row.bio = null
    return new HttpResponse(null, { status: 204 })
  }),

  http.post(ADMIN_MEMBER_RELEASE_URL, async ({ params, request }) => {
    const body = (await request.json().catch(() => null)) as {
      reasonDetail?: string
      memo?: string
    } | null
    const guard = guardSanctionTarget(Number(params['userId']))
    if (isRejection(guard)) return guard
    const row = guard
    // 해제할 제재가 없으면 30019다 — 영구 정지·탈퇴도 여기에 든다(둘은 해제 불가).
    if (row.storedStatus !== 'RESTRICTED' && row.storedStatus !== 'SUSPENDED') {
      return HttpResponse.json(errorBody(30019, '해제할 제재가 없습니다.'), { status: 409 })
    }
    row.storedStatus = 'ACTIVE'
    row.sanctionUntil = null
    sanctionIdSeq += 1
    row.sanctions.push({
      sanctionId: sanctionIdSeq,
      action: 'RELEASE',
      reasonCode: null,
      reasonDetail: body?.reasonDetail?.trim() || null,
      effectiveUntil: null,
      memo: body?.memo?.trim() || null,
      actedByAdminId: CURRENT_ADMIN_USER_ID,
      actedAt: '2026-10-27T09:00:00',
    })
    return new HttpResponse(null, { status: 204 })
  }),
]

/**
 * 제재·해제 공통 가드 — 자기 자신 → 존재 → 관리자 순서가 BE와 같다.
 * 대상 행을 돌려주거나 거절 응답을 돌려준다(둘 중 하나).
 */
function guardSanctionTarget(userId: number): AdminMemberWire | Response {
  if (userId === CURRENT_ADMIN_USER_ID) {
    return HttpResponse.json(errorBody(30020, '자신을 제재할 수 없습니다.'), { status: 403 })
  }
  const row = members.find(item => item.userId === userId)
  if (!row) {
    return HttpResponse.json(errorBody(30000, '사용자를 찾을 수 없습니다.'), { status: 404 })
  }
  if (row.role === 'ADMIN') {
    return HttpResponse.json(
      errorBody(30021, '관리자 계정은 제재할 수 없습니다. 먼저 강등해 주세요.'),
      { status: 409 },
    )
  }
  return row
}

const isRejection = (result: AdminMemberWire | Response): result is Response =>
  result instanceof Response

/** 종단 상태 — 탈퇴는 30003, 영구 정지는 30018이고 운영자가 할 일이 서로 다르다. */
function terminalStateError(row: AdminMemberWire): Response | null {
  if (row.storedStatus === 'WITHDRAWN') {
    return HttpResponse.json(errorBody(30003, '이미 탈퇴한 계정입니다.'), { status: 409 })
  }
  if (row.storedStatus === 'BANNED') {
    return HttpResponse.json(
      errorBody(30018, '영구 정지된 계정은 상태를 바꿀 수 없습니다.'),
      { status: 409 },
    )
  }
  return null
}


// ─── 주문 배송 모니터링 (admin 호스트 /admin/orders) ───────────────────────────
// BE AdminOrderMonitoringController + AdminOrderMonitoringService + AdminOrderDispatchNudgeService의
// 가드와 집계 기준을 미러한다. 기준이 계약의 일부라서(결제대기 제외, 지연 판정은 서버가 쥔다,
// 주문 금액만 취소를 뺀다, 독촉은 발송 전 상태 + 쿨다운) FE가 틀리면 이 스텁에서 드러난다.

export type WireOrderStatus =
  | 'PENDING_PAYMENT'
  | 'PAID'
  | 'PREPARING'
  | 'DISPATCH_PENDING'
  | 'SHIPPING'
  | 'DELIVERED'
  | 'PURCHASE_CONFIRMED'
  | 'CANCELLED'

export type WireOrderDelayReason = 'DISPATCH_OVERDUE' | 'DELIVERY_OVERDUE'

/** 송장이 아직 붙지 않은 구간 — BE `OrderStatus.isAwaitingDispatch()`와 같은 집합이다. */
const AWAITING_DISPATCH: WireOrderStatus[] = ['PAID', 'PREPARING', 'DISPATCH_PENDING']

/** 결제대기는 모니터링 대상이 아니다 — 결제 전에도 주문 테이블에 남는 행이다. */
const MONITORED: WireOrderStatus[] = [
  'PAID',
  'PREPARING',
  'DISPATCH_PENDING',
  'SHIPPING',
  'DELIVERED',
  'PURCHASE_CONFIRMED',
  'CANCELLED',
]

export interface AdminOrderNudgeWire {
  nudgeId: number
  adminUserId: number
  memo: string | null
  nudgedAt: string
}

/** 상세 응답 모양의 서버 상태. 목록 행은 주문 단위 필드만 투영한다. */
export interface AdminOrderWire {
  orderId: string
  status: WireOrderStatus
  orderedAt: string
  sellerId: number
  sellerName: string | null
  buyerNickname: string
  totalProductAmount: number
  sellerShippingFee: number
  allocatedCouponDiscount: number
  payableAmount: number
  purchaseConfirmDueAt: string | null
  /** 지연 판정은 서버가 쥔다 — 스텁도 날짜를 다시 세지 않고 이 값을 그대로 쓴다. */
  delayReason: WireOrderDelayReason | null
  shipment: {
    courierCode: string
    courierName: string
    trackingNumber: string
    dispatchedAt: string | null
    deliveredAt: string | null
    lastTrackingStatus: string | null
  } | null
  activeClaim: { claimId: string; claimType: string; status: string } | null
  orderGroupId: string
  items: {
    orderItemId: number
    productId: string
    productName: string
    optionName: string | null
    quantity: number
    unitPrice: number
    discountAllocatedAmount: number
    itemStatus: string
  }[]
  statusHistory: {
    fromStatus: WireOrderStatus | null
    toStatus: WireOrderStatus
    triggeredBy: string
    occurredAt: string
  }[]
  nudges: AdminOrderNudgeWire[]
}

let orders: AdminOrderWire[] = []
let nudgeIdSeq = 0

/** 쿨다운 안의 재독촉을 테스트가 만들 수 있게 '지금'을 스텁이 고정한다(BE 기본 6시간). */
export const NUDGE_NOW = '2026-10-30T12:00:00'

export function makeAdminOrderWire(overrides: Partial<AdminOrderWire> = {}): AdminOrderWire {
  return {
    orderId: '01HZXK0000000000000000O01',
    status: 'PAID',
    orderedAt: '2026-10-26T21:31:00',
    sellerId: 7,
    sellerName: '멍멍마켓',
    buyerNickname: '코코맘',
    totalProductAmount: 70_000,
    sellerShippingFee: 3_000,
    allocatedCouponDiscount: 0,
    payableAmount: 73_000,
    purchaseConfirmDueAt: null,
    delayReason: null,
    shipment: null,
    activeClaim: null,
    orderGroupId: '01HZXK0000000000000000G01',
    items: [
      {
        orderItemId: 1,
        productId: '01HZXK0000000000000000P01',
        productName: '프리미엄 관절 영양제 180정',
        optionName: '2개입',
        quantity: 2,
        unitPrice: 35_000,
        discountAllocatedAmount: 0,
        itemStatus: 'ORDERED',
      },
      {
        orderItemId: 2,
        productId: '01HZXK0000000000000000P02',
        productName: '치석 제거 덴탈껌 30개',
        optionName: null,
        quantity: 1,
        unitPrice: 12_000,
        discountAllocatedAmount: 0,
        itemStatus: 'ORDERED',
      },
    ],
    statusHistory: [
      { fromStatus: null, toStatus: 'PAID', triggeredBy: 'BUYER', occurredAt: '2026-10-26T21:31:00' },
    ],
    nudges: [],
    ...overrides,
  }
}

const cloneOrder = (row: AdminOrderWire): AdminOrderWire => ({
  ...row,
  shipment: row.shipment ? { ...row.shipment } : null,
  activeClaim: row.activeClaim ? { ...row.activeClaim } : null,
  items: row.items.map(item => ({ ...item })),
  statusHistory: row.statusHistory.map(entry => ({ ...entry })),
  // 독촉 이력은 **서버가 돌려주는 순서로 쥔다** — id 내림차순
  // (`findAllByOrderIdOrderByIdDesc`). 시드가 어떤 순서로 주든 여기서 서버 순서로 눕히므로,
  // 핸들러가 "배열의 끝이 최신"에 기대면 그 자리에서 틀린 행을 고른다.
  nudges: [...row.nudges].sort((a, b) => b.nudgeId - a.nudgeId).map(entry => ({ ...entry })),
})

export function seedAdminOrders(rows: AdminOrderWire[] = []): void {
  orders = rows.map(cloneOrder)
  // 시드된 이력과 번호가 겹치면 "가장 큰 id가 최신"이 깨져 쿨다운 판정이 꼬인다.
  nudgeIdSeq = Math.max(0, ...orders.flatMap(row => row.nudges.map(entry => entry.nudgeId)))
}

/** 핸들러가 반영한 현재 주문 — 테스트가 독촉 기록을 읽는다. */
export function currentAdminOrder(orderId: string): AdminOrderWire | null {
  const found = orders.find(row => row.orderId === orderId)
  return found ? cloneOrder(found) : null
}

function orderSummaryOf(row: AdminOrderWire) {
  return {
    orderId: row.orderId,
    status: row.status,
    orderedAt: row.orderedAt,
    sellerId: row.sellerId,
    sellerName: row.sellerName,
    buyerNickname: row.buyerNickname,
    // 서버가 품목에서 **파생시키는** 두 값이다(`AdminOrderSummaryResult.of`:
    // `lines.firstOrNull()?.productName`, `lines.size`). 스텁이 따로 받게 두면 "대표 품목명은
    // 급식기인데 품목 전문에는 영양제만 있는" 응답을 테스트가 만들 수 있고, 서버는 그런 응답을
    // 보내지 못한다 — 목록 행과 상세가 어긋나는 FE 결함이 통과한다(교차검토로 드러난 자리).
    representativeItemName: row.items[0]?.productName ?? null,
    itemCount: row.items.length,
    // 금액은 파생시키지 않고 그대로 싣는다 — FE 가 금액을 계산하지 않는다는 단언(AC-006)이
    // 스텁의 산수와 겹치면 둘 다 틀렸을 때 서로를 가린다.
    totalProductAmount: row.totalProductAmount,
    sellerShippingFee: row.sellerShippingFee,
    allocatedCouponDiscount: row.allocatedCouponDiscount,
    payableAmount: row.payableAmount,
    purchaseConfirmDueAt: row.purchaseConfirmDueAt,
    // delayed는 delayReason != null과 같다 — 서버가 둘을 함께 내려 준다.
    delayed: row.delayReason != null,
    delayReason: row.delayReason,
    shipment: row.shipment,
    activeClaim: row.activeClaim,
  }
}

/** 커서는 서버와 같은 모양(base64url "ao:주문시각마이크로:주문행id")이다. */
const encodeOrderCursor = (index: number) =>
  btoa(`ao:${index + 1}:${index + 1}`).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

function decodeOrderCursor(raw: string): number | null {
  try {
    const parts = atob(raw.replace(/-/g, '+').replace(/_/g, '/')).split(':')
    if (parts.length !== 3 || parts[0] !== 'ao') return null
    const anchor = Number(parts[2])
    return Number.isFinite(anchor) && anchor > 0 ? anchor : null
  } catch {
    return null
  }
}

const hoursBetween = (from: string, to: string) =>
  (new Date(to).getTime() - new Date(from).getTime()) / 3_600_000

/**
 * BE `AdminOrderMonitoringQueryAdapter.keywordMatches` 와 같은 집합 — 주문번호·셀러 상호·
 * 상품명·옵션명이고 **구매자는 없다.** 닉네임이 user BC 테이블에 있어 그 쿼리가 조인하지 못한다.
 *
 * 스텁이 닉네임까지 찾아주면 "구매자로 검색된다"고 믿는 FE 가 테스트를 통과하고 실서버에서만
 * 0건이 된다 — 스텁이 FE 결함을 가리는 자리라 BE 와 똑같이 못 찾아야 한다(교차검토 지적).
 */
function matchesKeyword(row: AdminOrderWire, keyword: string): boolean {
  const needle = keyword.toLowerCase()
  const has = (value: string | null) => (value ?? '').toLowerCase().includes(needle)
  return (
    has(row.orderId) ||
    has(row.sellerName) ||
    row.items.some(item => has(item.productName) || has(item.optionName))
  )
}

const orderHandlers = [
  http.get(ADMIN_ORDERS_URL, ({ request }) => {
    const params = new URL(request.url).searchParams
    const status = params.get('status')
    // 결제대기는 모니터링 대상이 아니라 400이다 — 서버가 선택지에서 빼라고 말하는 자리다.
    if (status === 'PENDING_PAYMENT') {
      return HttpResponse.json(
        errorBody(90001, 'status: 결제대기 주문은 조회 대상이 아닙니다.'),
        { status: 400 },
      )
    }
    if (status != null && !MONITORED.includes(status as WireOrderStatus)) {
      return HttpResponse.json(errorBody(90001, 'status: 잘못된 값입니다.'), { status: 400 })
    }
    const cursorParam = params.get('cursor')
    let anchor: number | null = null
    if (cursorParam != null) {
      anchor = decodeOrderCursor(cursorParam)
      if (anchor == null) {
        return HttpResponse.json(errorBody(90002, '유효하지 않은 커서입니다.'), { status: 400 })
      }
    }
    const sizeParam = params.get('size')
    // size 범위 밖은 서버가 @Range로 거절한다(회원 목록처럼 절삭하지 않는다).
    if (sizeParam != null) {
      const size = Number(sizeParam)
      if (!Number.isFinite(size) || size < 1 || size > 100) {
        return HttpResponse.json(errorBody(90001, 'size는 1~100 사이여야 합니다.'), { status: 400 })
      }
    }
    const size = sizeParam == null ? 20 : Number(sizeParam)
    const keyword = params.get('keyword')
    const delayedOnly = params.get('delayedOnly') === 'true'
    const sellerId = params.get('sellerId')

    const matched = orders
      .filter(row => MONITORED.includes(row.status))
      .filter(row => (status == null ? true : row.status === status))
      .filter(row => (sellerId == null ? true : row.sellerId === Number(sellerId)))
      .filter(row => (delayedOnly ? row.delayReason != null : true))
      .filter(row => (keyword == null ? true : matchesKeyword(row, keyword)))

    // 정렬은 서버가 소유한다 — orderedAt DESC, orderId DESC.
    const sorted = [...matched].sort((a, b) =>
      a.orderedAt === b.orderedAt
        ? b.orderId.localeCompare(a.orderId)
        : a.orderedAt < b.orderedAt
          ? 1
          : -1,
    )
    const afterCursor = anchor == null ? sorted : sorted.slice(anchor)
    const page = afterCursor.slice(0, size)
    const hasNext = afterCursor.length > size
    return HttpResponse.json({
      data: {
        items: page.map(orderSummaryOf),
        // 서버는 전체 건수를 세지 않는다 — 항상 null이다.
        totalCount: null,
        nextCursor: hasNext ? encodeOrderCursor((anchor ?? 0) + page.length - 1) : null,
        hasNext,
      },
    })
  }),

  http.get(ADMIN_ORDER_METRICS_URL, ({ request }) => {
    const params = new URL(request.url).searchParams
    // 날짜 축을 실제로 걸러 준다. 무시하면 FE가 `orderedFrom`/`orderedTo`를 안 보내도 테스트가
    // 통과하고, 대시보드의 `오늘 거래액`이 플랫폼 전체 누적 금액을 오늘로 그린다.
    // 서버는 `LocalDate`를 `[from 00:00, to+1일 00:00)` 반개구간으로 펴므로 날짜 문자열 비교로
    // 같은 경계가 된다(`orderedAt`이 `YYYY-MM-DDTHH:mm:ss`라 앞 10자가 날짜다).
    const from = params.get('orderedFrom')
    const to = params.get('orderedTo')
    const inRange = (row: AdminOrderWire) => {
      const day = row.orderedAt.slice(0, 10)
      return (from == null || day >= from) && (to == null || day <= to)
    }
    const monitored = orders.filter(row => MONITORED.includes(row.status)).filter(inRange)
    return HttpResponse.json({
      data: {
        awaitingDispatchCount: monitored.filter(row => AWAITING_DISPATCH.includes(row.status)).length,
        shippingCount: monitored.filter(row => row.status === 'SHIPPING').length,
        delayedCount: monitored.filter(row => row.delayReason != null).length,
        // 금액만 모수가 다르다 — 취소 주문이 빠진다(건수 카드 셋과 어긋나는 것이 정상이다).
        // 필드명은 서버와 같아야 한다 — 어긋나면 화면이 undefined 를 포맷하다 떨어진다.
        totalOrderAmount: monitored
          .filter(row => row.status !== 'CANCELLED')
          .reduce((sum, row) => sum + row.payableAmount, 0),
      },
    })
  }),

  http.get(ADMIN_ORDER_DETAIL_URL, ({ params }) => {
    const row = orders.find(item => item.orderId === String(params['orderId']))
    if (!row) {
      return HttpResponse.json(errorBody(50000, '주문을 찾을 수 없습니다.'), { status: 404 })
    }
    return HttpResponse.json({
      data: {
        order: orderSummaryOf(row),
        orderGroupId: row.orderGroupId,
        purchaseConfirmedAt: row.status === 'PURCHASE_CONFIRMED' ? row.orderedAt : null,
        confirmType: row.status === 'PURCHASE_CONFIRMED' ? 'MANUAL' : null,
        items: row.items,
        statusHistory: row.statusHistory,
        // 쥔 순서가 이미 서버 순서(id 내림차순)다.
        nudges: row.nudges,
      },
    })
  }),

  http.post(ADMIN_ORDER_NUDGE_URL, async ({ params, request }) => {
    const body = (await request.json().catch(() => null)) as { memo?: string } | null
    const memo = body?.memo ?? null
    // @Valid가 먼저다 — 300자 초과는 상태 가드보다 앞에서 400이다.
    if ((memo ?? '').length > 300) {
      return HttpResponse.json(
        errorBody(90001, '독촉 메모는 300자 이하여야 합니다.'),
        { status: 400 },
      )
    }
    const row = orders.find(item => item.orderId === String(params['orderId']))
    if (!row) {
      return HttpResponse.json(errorBody(50000, '주문을 찾을 수 없습니다.'), { status: 404 })
    }
    // BE 가드 순서: 발송 전 상태 → 쿨다운.
    if (!AWAITING_DISPATCH.includes(row.status)) {
      return HttpResponse.json(
        errorBody(50500, '발송 전 상태의 주문만 발송 독촉할 수 있습니다.'),
        { status: 409 },
      )
    }
    // BE `findLatestByOrderId` 는 id 최대 행이다 — 배열 순서에 기대지 않고 같은 뜻으로 고른다.
    const latest = row.nudges.reduce<AdminOrderNudgeWire | null>(
      (newest, entry) => (newest == null || entry.nudgeId > newest.nudgeId ? entry : newest),
      null,
    )
    if (latest && hoursBetween(latest.nudgedAt, NUDGE_NOW) < 6) {
      return HttpResponse.json(
        errorBody(50501, '직전 발송 독촉 이후 충분한 시간이 지나지 않았습니다.'),
        { status: 409 },
      )
    }
    nudgeIdSeq += 1
    // 공백만 들어온 메모는 서버가 null로 접는다.
    const normalized = memo?.trim() || null
    const created: AdminOrderNudgeWire = {
      nudgeId: nudgeIdSeq,
      adminUserId: CURRENT_ADMIN_USER_ID,
      memo: normalized,
      nudgedAt: NUDGE_NOW,
    }
    // id 내림차순을 유지한다 — 새 기록이 가장 큰 id다.
    row.nudges.unshift(created)
    return HttpResponse.json({ data: created }, { status: 201 })
  }),
]

// ── 상품 검수 큐 ───────────────────────────────────────────────────────────────

type WireInspectionStatus = 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED' | 'SUPERSEDED'

/**
 * BE AdminProductInspectionSummary 모양. 목록만 받는다 — 상세·승인·반려는
 * `features/ai-review-queue/__tests__`가 각자 `server.use`로 깐다.
 */
export interface AdminProductInspectionWire {
  productId: string
  productName: string
  sellerName: string
  status: WireInspectionStatus
  latestJudgment: 'PASS' | 'FLAG' | 'UNJUDGED' | 'FAILED' | null
  blindedAt: string
  appealedAt: string | null
}

let productInspections: AdminProductInspectionWire[] = []

export function makeAdminProductInspectionWire(
  overrides: Partial<AdminProductInspectionWire> = {},
): AdminProductInspectionWire {
  return {
    productId: '01JQUEUEPRODUCT00000000001',
    productName: '연어 건사료 2kg',
    sellerName: '애착상회',
    status: 'PENDING_REVIEW',
    latestJudgment: 'FLAG',
    blindedAt: '2026-10-22T10:00:40',
    appealedAt: null,
    ...overrides,
  }
}

export function seedAdminProductInspections(rows: AdminProductInspectionWire[] = []): void {
  productInspections = rows.map(row => ({ ...row }))
}

/**
 * 오프셋 페이지 목록. **`totalCount`는 필터 기준 전체 수이고 페이지 길이와 다르다** — 1건만
 * 받아 건수를 읽는 호출부(대시보드)가 목록 길이로 세고 있으면 그 차이에서 드러난다.
 */
const inspectionHandlers = [
  http.get(ADMIN_PRODUCT_INSPECTIONS_URL, ({ request }) => {
    const params = new URL(request.url).searchParams
    const status = params.get('status')
    const appealed = params.get('appealed')
    const page = Number(params.get('page') ?? 0)
    const size = Number(params.get('size') ?? 20)
    const matched = productInspections
      .filter(row => status == null || row.status === status)
      // `appealed=false`는 보내지 않는 것이 FE 관례다 — 보내면 여기서도 이의 있는 것만 남는다.
      .filter(row => appealed !== 'true' || row.appealedAt != null)
    return HttpResponse.json({
      data: {
        items: matched.slice(page * size, page * size + size),
        totalCount: matched.length,
      },
    })
  }),
]

export const handlers = [
  ...applicationHandlers,
  ...rosterHandlers,
  ...memberHandlers,
  ...orderHandlers,
  // 검수 큐 핸들러도 시드 없이 빈 목록으로 답한다 — 대시보드(`/`)가 검수 대기 수를 조회하고,
  // 그 화면이 nav·예시 화면 테스트에서 열린다(핸들러가 없으면 onUnhandledRequest:'error').
  ...inspectionHandlers,
  ...inquiryHandlers,
  ...claimHandlers,
  ...reviewHandlers,
  // 감사 로그 핸들러는 시드 없이도 빈 목록으로 답한다 — `/audit-log`가 클레임·문의·리뷰 테스트에서
  // 이탈 가드의 '다른 화면' 목적지로 쓰이고, 핸들러가 없으면 onUnhandledRequest:'error'로 깨진다.
  ...auditLogHandlers,
  // 공지 핸들러도 시드 없이 빈 목록으로 답한다 — `/notices`가 nav 테스트에서 열린다.
  ...noticeHandlers,
  // 신고 핸들러도 같은 이유로 시드 없이 빈 목록으로 답한다 — `/reports`가 nav 테스트에서 열린다.
  ...reportHandlers,
  // 셀러 관리 핸들러도 시드 없이 빈 목록으로 답한다 — `/sellers`가 nav 테스트에서 열린다.
  ...sellerHandlers,
]
export const server = setupServer(...handlers)
