import type { StatusPillVariant } from '@aechak/design-system/web'

/**
 * 계정/보안 화면의 예시 데이터 단일 원본 — 화면 파일에 인라인하지 않는다(레포 관례).
 *
 * **BE가 생기면 갈아끼우는 방법**: seller 호스트에 계정 조회(`GET /sellers/me/account`), 비밀번호
 * 변경(`PUT /sellers/me/password`), 2단계 인증(`PUT /sellers/me/mfa`), 접속 기록
 * (`GET /sellers/me/login-history`), 담당자(`GET`·`POST /sellers/me/members`)가 열리면
 * `account.queries.ts`를 만들어 아래 상수 자리에 그 응답을 넣고, 각 폼의 저장을 해당 mutation에
 * 연결한 뒤 라우트에서 `SampleDataNotice`를 떼고 `isError` 경로를 더한다(AGENTS.md 규약 7).
 *
 * 실측(2026-10-26): seller 호스트의 계정 관련 경로는 `/sellers/me/store`와 입점 신청뿐이고 비밀번호
 * 변경·2단계 인증·접속 기록·담당자 초대 경로가 없다. 구매자 호스트의 `/users/me/*`는 구매자
 * 프로필이라 셀러 계정 보안과 다른 도메인이고 호스트도 다르다.
 */

export interface SampleAccount {
  /** 로그인 아이디 — 바꿀 수 없는 자리로 둔다. */
  loginEmail: string
  managerName: string
  managerPhone: string
  /** 알림/정산 메일을 받는 주소. 로그인 아이디와 다를 수 있다. */
  contactEmail: string
  lastPasswordChangedAt: string
  mfaEnabled: boolean
  joinedAt: string
}

export const SAMPLE_ACCOUNT: SampleAccount = {
  loginEmail: 'seller-demo@aechak.co.kr',
  managerName: '김운영',
  managerPhone: '010-1234-5678',
  contactEmail: 'cs@aechak-demo.co.kr',
  lastPasswordChangedAt: '2026-07-14',
  mfaEnabled: false,
  joinedAt: '2026-03-02',
}

export type LoginResult = 'SUCCESS' | 'FAILED'

export interface SampleLoginRecord {
  recordId: string
  at: string
  device: string
  ip: string
  location: string
  result: LoginResult
  /** 평소와 다른 기기/지역에서의 접속 — 운영자가 먼저 봐야 하는 행이다. */
  unfamiliar: boolean
}

export const LOGIN_RESULT_LABEL: Record<LoginResult, string> = {
  SUCCESS: '성공',
  FAILED: '실패',
}

export const LOGIN_RESULT_VARIANT: Record<LoginResult, StatusPillVariant> = {
  SUCCESS: 'success',
  FAILED: 'error',
}

export const SAMPLE_LOGIN_RECORDS: SampleLoginRecord[] = [
  {
    recordId: 'LGN-9041',
    at: '2026-10-27 08:52',
    device: 'Chrome 141 / macOS',
    ip: '211.54.12.88',
    location: '서울',
    result: 'SUCCESS',
    unfamiliar: false,
  },
  {
    recordId: 'LGN-9038',
    at: '2026-10-26 19:07',
    device: 'Chrome 141 / Windows 11',
    ip: '118.235.7.21',
    location: '성남',
    result: 'SUCCESS',
    unfamiliar: false,
  },
  {
    recordId: 'LGN-9033',
    at: '2026-10-26 03:41',
    device: 'Firefox 133 / Linux',
    ip: '45.133.1.207',
    location: '암스테르담',
    result: 'FAILED',
    unfamiliar: true,
  },
  {
    recordId: 'LGN-9030',
    at: '2026-10-25 11:18',
    device: 'Safari 19 / iPhone',
    ip: '172.226.44.9',
    location: '서울',
    result: 'SUCCESS',
    unfamiliar: false,
  },
  {
    recordId: 'LGN-9024',
    at: '2026-10-23 22:35',
    device: 'Chrome 140 / Android',
    ip: '203.226.18.133',
    location: '부산',
    result: 'SUCCESS',
    unfamiliar: true,
  },
]

export type MemberRole = 'OWNER' | 'ORDER' | 'CS'
export type MemberStatus = 'ACTIVE' | 'INVITED'

export interface SampleMember {
  memberId: string
  name: string
  email: string
  role: MemberRole
  status: MemberStatus
  lastActiveAt: string | null
}

export const MEMBER_ROLE_LABEL: Record<MemberRole, string> = {
  OWNER: '대표 운영자',
  ORDER: '주문/배송 담당',
  CS: '고객 응대 담당',
}

export const MEMBER_STATUS_LABEL: Record<MemberStatus, string> = {
  ACTIVE: '사용 중',
  INVITED: '초대 보냄',
}

export const MEMBER_STATUS_VARIANT: Record<MemberStatus, StatusPillVariant> = {
  ACTIVE: 'success',
  INVITED: 'info',
}

export const SAMPLE_MEMBERS: SampleMember[] = [
  {
    memberId: 'MBR-01',
    name: '김운영',
    email: 'seller-demo@aechak.co.kr',
    role: 'OWNER',
    status: 'ACTIVE',
    lastActiveAt: '2026-10-27 08:52',
  },
  {
    memberId: 'MBR-02',
    name: '이배송',
    email: 'ship@aechak-demo.co.kr',
    role: 'ORDER',
    status: 'ACTIVE',
    lastActiveAt: '2026-10-26 18:40',
  },
  {
    memberId: 'MBR-03',
    name: '박상담',
    email: 'cs2@aechak-demo.co.kr',
    role: 'CS',
    status: 'INVITED',
    lastActiveAt: null,
  },
]
