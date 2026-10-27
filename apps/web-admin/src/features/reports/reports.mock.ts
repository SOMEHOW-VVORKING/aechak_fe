import type { HistoryEntry } from '@aechak/domain'

/**
 * 신고 제재 관리 예시 데이터.
 *
 * 신고 **접수**(구매자가 신고를 넣는 쪽)는 열린 BE PR #100(SCRUM-231)에 있고, 운영자가 접수 건을
 * 들여다보고 제재하는 `GET /admin/reports`·`POST /admin/reports/{id}/action`(SCRUM-241)은 아직
 * 없다. 그래서 목록·제재가 전부 예시다 — 화면 상단 띠로 밝히고 쓰기는 서버로 내보내지 않는다.
 *
 * 타입을 `@aechak/domain`이 아니라 여기 두는 이유: 맞출 와이어 계약이 아직 없다. SCRUM-241이
 * 배포되면 그 응답 모양으로 타입을 옮기고 `reports.queries.ts`의 queryFn만 fetcher로 바꾼다.
 */
export type AdminReportTargetType = 'product' | 'review' | 'sns-post' | 'chat' | 'member'

export type AdminReportStatus = 'received' | 'reviewing' | 'sanctioned' | 'dismissed'

export interface AdminReport {
  id: string
  targetType: AdminReportTargetType
  /** 신고 대상의 이름(상품명·게시물 제목·닉네임). */
  targetName: string
  /** 대상을 올린 사람(셀러 상호 또는 회원 닉네임). */
  targetOwner: string
  reason: string
  /** 같은 대상에 쌓인 신고 수. */
  reportCount: number
  receivedAt: string
  status: AdminReportStatus
  /** 가장 최근 신고의 상세 내용. */
  detail: string
  reportHistory: HistoryEntry[]
  processReason?: string
  sanctionNotice?: string
  internalMemo?: string
}

export const adminReportsMock: AdminReport[] = [
  {
    id: 'rpt_20481',
    targetType: 'product',
    targetName: '프리미엄 관절 영양제 180정',
    targetOwner: '멍멍마켓',
    reason: '허위·과장 광고',
    reportCount: 7,
    receivedAt: '10-26 09:12',
    status: 'received',
    detail:
      '수의사 처방 효과가 임상으로 입증됐다고 적혀 있는데 근거 자료가 상세페이지에 없어요. 같은 문구를 쓰는 다른 상품은 내려간 적이 있어요.',
    reportHistory: [
      { label: '허위·과장 광고 신고', date: '10-26' },
      { label: '허위·과장 광고 신고', date: '10-25' },
      { label: '상품 정보 오류 신고', date: '10-21' },
    ],
  },
  {
    id: 'rpt_20475',
    targetType: 'review',
    targetName: '사료 바꾸고 애가 아팠어요 (별 1개)',
    targetOwner: '초코집사',
    reason: '욕설·비방',
    reportCount: 4,
    receivedAt: '10-25 21:40',
    status: 'reviewing',
    detail: '리뷰 본문에 셀러 대표 이름과 함께 욕설이 적혀 있어요.',
    reportHistory: [
      { label: '욕설·비방 신고', date: '10-25' },
      { label: '욕설·비방 신고', date: '10-25' },
    ],
    internalMemo: '리뷰 작성자 직전 제재 이력 있음 — 회원 관리에서 함께 확인 필요.',
  },
  {
    id: 'rpt_20468',
    targetType: 'chat',
    targetName: '멍멍마켓 상담방 #4821',
    targetOwner: '멍멍마켓',
    reason: '외부 거래 유도',
    reportCount: 2,
    receivedAt: '10-25 14:05',
    status: 'received',
    detail: '셀러가 계좌번호를 보내며 플랫폼 밖 송금을 요청했다는 신고예요. 대화 캡처가 첨부됐어요.',
    reportHistory: [{ label: '외부 거래 유도 신고', date: '10-25' }],
  },
  {
    id: 'rpt_20450',
    targetType: 'sns-post',
    targetName: '우리 아이 간식 공동구매 모집',
    targetOwner: '라이카맘',
    reason: '불법·미취급 상품',
    reportCount: 3,
    receivedAt: '10-24 18:22',
    status: 'sanctioned',
    detail: '검역 절차를 거치지 않은 수입 간식을 개인 간 거래로 모집하고 있어요.',
    reportHistory: [
      { label: '불법·미취급 상품 신고', date: '10-24' },
      { label: '불법·미취급 상품 신고', date: '10-23' },
    ],
    processReason: '불법·미취급 상품 거래 유도',
    sanctionNotice: '게시물이 비공개로 전환됐고 7일 게시 제한이 적용돼요.',
  },
  {
    id: 'rpt_20433',
    targetType: 'member',
    targetName: '먼지아빠',
    targetOwner: '먼지아빠',
    reason: '허위 신고 반복',
    reportCount: 5,
    receivedAt: '10-23 11:48',
    status: 'reviewing',
    detail: '같은 셀러를 상대로 사유를 바꿔 가며 신고를 반복해 접수하고 있어요.',
    reportHistory: [
      { label: '허위 신고 신고', date: '10-23' },
      { label: '허위 신고 신고', date: '10-20' },
      { label: '허위 신고 신고', date: '10-18' },
    ],
  },
  {
    id: 'rpt_20410',
    targetType: 'product',
    targetName: '수제 오리목뼈 간식 500g',
    targetOwner: '냥이상점',
    reason: '상품 정보 오류',
    reportCount: 1,
    receivedAt: '10-22 08:30',
    status: 'dismissed',
    detail: '원산지가 다르게 적혀 있다는 신고였는데 셀러가 제출한 수입 신고서와 일치해요.',
    reportHistory: [{ label: '상품 정보 오류 신고', date: '10-22' }],
    processReason: '신고 내용 확인 불가',
    internalMemo: '수입 신고서 사본 확인 완료.',
  },
]
