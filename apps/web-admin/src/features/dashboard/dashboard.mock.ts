/**
 * 운영 대시보드에 **아직 집계 경로가 없는** 칸의 예시 데이터.
 *
 * admin 모듈에 `GET /admin/dashboard/summary` 같은 운영 지표 경로가 없어, 숫자를 숨기는 대신
 * 예시임을 화면에서 밝히고 모양을 보여준다(SCRUM-308).
 *
 * **2026-11-03(SCRUM-313)에 여섯 칸이 예시를 벗었다** — 오늘 거래액·검수 대기 상품·미처리 신고·
 * 답변 대기 문의·진행 중 클레임이 실 집계로 바뀌었고(셀러 입점 심사 대기 수는 그 전부터 실값),
 * 할 일 목록도 같은 집계를 다시 쓴다. 그래서 이 파일에는 **서버에 셀 방법이 없는 값만** 남는다.
 * 쓰던 자리를 지운 이유는 예시 숫자를 남겨 두면 같은 라벨이 화면에서 두 숫자를 가리키기 때문이다.
 *
 * 남은 칸이 실 집계로 바뀌는 조건.
 * - `todayOrderCount`: 오늘 **주문 건수**를 주는 경로가 없다. `GET /admin/orders`의 `totalCount`는
 *   **항상 null**이고(BE `AdminOrderListResponse` 주석: 전체 주문 건수를 매 페이지 세지 않는다)
 *   `GET /admin/orders/metrics`는 발송 대기·배송 중·지연·금액만 준다. 지표 응답에 건수가 생기거나
 *   목록이 `totalCount`를 싣기 시작하면 그 값으로 바꾼다.
 * - `settlementDueAmount`: admin 모듈에 정산 경로가 없다(셀러 호스트의 본인 정산만 있다).
 * - `weeklyGmv`·`todayNewMemberCount`·`todaySignedUpSellerCount`: 기간별 집계·가입 집계 경로가 없다.
 *   주문 지표를 날짜별로 7번 부르는 식으로 만들지 않는다 — 첫 화면에서 요청이 일곱 개 더 나간다.
 */
export interface AdminDashboardTodo {
  key: string
  label: string
  detail: string
  /**
   * 건수. **`null`이면 조회가 실패했거나 권한이 없다는 뜻이고 화면은 숫자 대신 줄표를 그린다** —
   * 0으로 그리면 운영자가 "할 일이 없다"로 읽는다.
   */
  count: number | null
  /**
   * 지어낸 숫자. 화면이 `예시` 표시를 달아 운영자가 실제 할 일로 읽고 그 화면에 들어가지 않게 한다.
   * 실연동 화면으로 보내는 줄에 이 표시가 없는 지어낸 숫자를 두면, 운영자가 들어간 화면에서
   * 숫자가 다른 것을 보게 된다.
   */
  sample: boolean
  /** 이동할 라우트 경로. nav에 있는 경로만 쓴다 — 없는 경로로 보내면 죽은 진입점이다. */
  to: string
}

export interface AdminDashboardSummary {
  todayOrderCount: number
  todayNewMemberCount: number
  todaySignedUpSellerCount: number
  settlementDueAmount: number
  /** 최근 7일 거래액(가장 왼쪽이 가장 오래된 날). */
  weeklyGmv: { label: string; value: number }[]
  /** 집계 경로가 없어 예시로 남은 할 일 줄. 실 집계를 쓰는 줄은 라우트가 앞에 붙인다. */
  todoItems: AdminDashboardTodo[]
}

export const adminDashboardSummaryMock: AdminDashboardSummary = {
  todayOrderCount: 142,
  todayNewMemberCount: 37,
  todaySignedUpSellerCount: 3,
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
      key: 'chat',
      label: '위험 신호 채팅방',
      detail: '외부 거래 유도나 욕설이 감지된 상담방',
      count: 2,
      sample: true,
      to: '/chat-monitoring',
    },
  ],
}
