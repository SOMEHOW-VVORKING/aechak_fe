/**
 * 운영 대시보드 예시 데이터.
 *
 * admin 모듈에 운영 지표 집계 API가 없다(컨트롤러는 관리자 명부·입점 심사뿐). 숫자를 숨기면
 * 운영자가 대시보드가 무엇을 보여줄 화면인지 알 수 없어, **예시임을 화면 상단 띠로 밝히고**
 * 모양을 보여준다(SCRUM-308).
 *
 * 타입을 `@aechak/domain`이 아니라 여기 두는 이유: 아직 대응하는 BE 계약이 없어 와이어 스키마에
 * 맞출 대상이 없다. `GET /admin/dashboard/summary`가 생기면 그 응답 모양으로 타입을 옮기고
 * `dashboard.queries.ts`의 queryFn만 fetcher로 갈아끼운다.
 *
 * **심사 대기 셀러 수는 여기 두지 않는다** — 그 값만 실 API가 있어서(`usePendingApplicationCount`)
 * 예시 숫자를 함께 띄우면 nav 배지의 실제 숫자와 어긋난다(화면이 서로 다른 말을 한다).
 */
export interface AdminDashboardTodo {
  key: string
  label: string
  detail: string
  count: number
  /** 이동할 라우트 경로. nav에 있는 경로만 쓴다 — 없는 경로로 보내면 죽은 진입점이다. */
  to: string
}

export interface AdminDashboardSummary {
  todayOrderCount: number
  todayGmv: number
  todayNewMemberCount: number
  todaySignedUpSellerCount: number
  productsAwaitingReview: number
  openReportCount: number
  unansweredInquiryCount: number
  openClaimCount: number
  settlementDueAmount: number
  /** 최근 7일 거래액(가장 왼쪽이 가장 오래된 날). */
  weeklyGmv: { label: string; value: number }[]
  todoItems: AdminDashboardTodo[]
}

export const adminDashboardSummaryMock: AdminDashboardSummary = {
  todayOrderCount: 142,
  todayGmv: 8_640_000,
  todayNewMemberCount: 37,
  todaySignedUpSellerCount: 3,
  productsAwaitingReview: 12,
  openReportCount: 5,
  unansweredInquiryCount: 9,
  openClaimCount: 6,
  settlementDueAmount: 23_480_000,
  weeklyGmv: [
    { label: '월', value: 6_120_000 },
    { label: '화', value: 7_030_000 },
    { label: '수', value: 5_880_000 },
    { label: '목', value: 9_410_000 },
    { label: '금', value: 11_260_000 },
    { label: '토', value: 10_070_000 },
    { label: '일', value: 8_640_000 },
  ],
  todoItems: [
    {
      key: 'product-review',
      label: '검수 대기 상품',
      detail: 'AI 1차 통과 후 운영자 확인을 기다리는 상품',
      count: 12,
      to: '/products/review',
    },
    {
      key: 'ai-queue',
      label: 'AI 자동 숨김 콘텐츠',
      detail: 'AI가 숨긴 뒤 운영자 재확인이 남은 건',
      count: 8,
      to: '/products/ai-queue',
    },
    {
      key: 'reports',
      label: '미처리 신고',
      detail: '접수 후 제재 판단이 남은 신고',
      count: 5,
      to: '/reports',
    },
    {
      key: 'inquiries',
      label: '미답변 문의',
      detail: '접수 24시간이 지난 문의 3건 포함',
      count: 9,
      to: '/inquiries',
    },
    {
      key: 'claims',
      label: '중재 요청 클레임',
      detail: '셀러와 구매자 주장이 갈려 운영 중재를 요청한 건',
      count: 6,
      to: '/claims',
    },
    {
      key: 'chat',
      label: '위험 신호 채팅방',
      detail: '외부 거래 유도·욕설이 감지된 상담방',
      count: 2,
      to: '/chat-monitoring',
    },
  ],
}
