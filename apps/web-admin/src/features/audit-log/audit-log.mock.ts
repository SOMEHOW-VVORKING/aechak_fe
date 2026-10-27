/**
 * 어드민 액션 로그 예시 데이터.
 *
 * 로그 조회 API가 admin 모듈에 없다. 감사 로그는 **비어 있다**와 **조회가 안 된다**를 운영자가
 * 구별해야 하는 화면이라 빈 표를 그려 두면 특히 위험하다 — 그래서 예시 행을 그리고 상단 띠로
 * 예시임을 못박는다. 이 화면은 읽기 전용이라 쓰기 버튼 자체가 없다.
 */
export type AdminAuditResult = 'success' | 'failure'

export interface AdminAuditEntry {
  id: string
  actedAt: string
  adminName: string
  adminRole: string
  /** 수행한 액션의 사람이 읽는 이름. */
  action: string
  targetType: string
  targetName: string
  result: AdminAuditResult
  ip: string
  /** 요청 추적용 식별자 — 장애 조사 때 서버 로그와 맞춰 보는 값이다. */
  requestId: string
  detail: string
}

export const adminAuditEntriesMock: AdminAuditEntry[] = [
  {
    id: 'log_90412',
    actedAt: '10-26 20:31:08',
    adminName: '김운영',
    adminRole: '운영 매니저',
    action: '상담방 운영 개입',
    targetType: '채팅',
    targetName: 'ROOM-4712',
    result: 'success',
    ip: '10.42.8.117',
    requestId: 'req_01JB7Q2M4C',
    detail: '파손 반품 분쟁으로 운영자 참여. 클레임 CLM-2041과 연결했어요.',
  },
  {
    id: 'log_90388',
    actedAt: '10-26 14:02:44',
    adminName: '이심사',
    adminRole: '심사 담당',
    action: '셀러 입점 승인',
    targetType: '입점 신청',
    targetName: 'APP-20412 / 보리펫샵',
    result: 'success',
    ip: '10.42.8.104',
    requestId: 'req_01JB6YT8PA',
    detail: '사업자등록증·통장 사본 확인 완료. 판매 권한을 부여했어요.',
  },
  {
    id: 'log_90377',
    actedAt: '10-26 11:18:02',
    adminName: '박CS',
    adminRole: 'CS 담당',
    action: '회원 이용 제한',
    targetType: '회원',
    targetName: 'user_19023 / 먼지아빠',
    result: 'success',
    ip: '10.42.8.133',
    requestId: 'req_01JB6R0K5Z',
    detail: '리뷰 욕설 반복으로 14일 이용 제한을 적용했어요.',
  },
  {
    id: 'log_90351',
    actedAt: '10-25 22:47:31',
    adminName: '김운영',
    adminRole: '운영 매니저',
    action: '관리자 권한 부여',
    targetType: '관리자',
    targetName: 'admin_7 / 최신입',
    result: 'failure',
    ip: '10.42.8.117',
    requestId: 'req_01JB5W9H2Q',
    detail: '권한이 부족해 거절됐어요(403). 최고 관리자만 부여할 수 있어요.',
  },
  {
    id: 'log_90330',
    actedAt: '10-25 16:05:12',
    adminName: '이심사',
    adminRole: '심사 담당',
    action: '상품 판매 중지',
    targetType: '상품',
    targetName: 'PRD-88210 / 프리미엄 관절 영양제 180정',
    result: 'success',
    ip: '10.42.8.104',
    requestId: 'req_01JB5CF3NN',
    detail: '허위·과장 광고 신고 7건 확인. 셀러에게 수정 요청을 보냈어요.',
  },
  {
    id: 'log_90302',
    actedAt: '10-24 10:00:03',
    adminName: '시스템',
    adminRole: '자동화',
    action: '공지 게시',
    targetType: '공지',
    targetName: 'ntc_308 / 구매 확정 자동 처리 기준',
    result: 'success',
    ip: '-',
    requestId: 'req_01JB3T1D7M',
    detail: '예약 게시 시각에 자동 게시됐어요.',
  },
  {
    id: 'log_90288',
    actedAt: '10-23 09:41:55',
    adminName: '박CS',
    adminRole: 'CS 담당',
    action: '리뷰 블라인드 해제',
    targetType: '리뷰',
    targetName: 'rvw_50991',
    result: 'success',
    ip: '10.42.8.133',
    requestId: 'req_01JB2M8V4R',
    detail: 'AI 자동 블라인드를 재검토해 해제했어요. 오탐으로 기록했어요.',
  },
]
