/**
 * 알림/공지 관리 예시 데이터.
 *
 * 공지·알림 발송 API가 admin 모듈에 없다. 알림 발송은 되돌릴 수 없는 액션이라 예시 화면이
 * **발송된 것처럼 보이는 것**이 특히 위험하다 — 그래서 상단 띠로 예시임을 밝히고 발송 버튼은
 * 서버로 아무것도 내보내지 않는다(확인 Modal은 그대로 둬 흐름을 볼 수 있게 한다).
 */
export type AdminNoticeCategory = 'service' | 'maintenance' | 'event' | 'policy'

export type AdminNoticeAudience = 'all' | 'buyer' | 'seller'

export type AdminNoticeStatus = 'draft' | 'scheduled' | 'published' | 'ended'

export interface AdminNotice {
  id: string
  title: string
  category: AdminNoticeCategory
  audience: AdminNoticeAudience
  status: AdminNoticeStatus
  /** 게시 예정 또는 게시된 시각. */
  publishAt: string
  pinned: boolean
  pushEnabled: boolean
  /** 푸시를 보냈다면 실제 도달 수. 미발송이면 null이다. */
  pushReach: number | null
  body: string
  internalMemo?: string
}

export const adminNoticesMock: AdminNotice[] = [
  {
    id: 'ntc_312',
    title: '10월 28일 새벽 결제 시스템 점검 안내',
    category: 'maintenance',
    audience: 'all',
    status: 'scheduled',
    publishAt: '10-27 18:00',
    pinned: true,
    pushEnabled: true,
    pushReach: null,
    body: '10월 28일 02:00부터 04:00까지 결제 시스템 점검이 있어요. 점검 중에는 주문과 결제가 일시 중단돼요.',
    internalMemo: 'PG사 점검 일정과 맞춰 둠 — 시간 바뀌면 다시 공지 필요.',
  },
  {
    id: 'ntc_308',
    title: '구매 확정 자동 처리 기준이 바뀌어요',
    category: 'policy',
    audience: 'all',
    status: 'published',
    publishAt: '10-24 10:00',
    pinned: true,
    pushEnabled: false,
    pushReach: null,
    body: '배송 완료 후 7일이 지나면 구매가 자동 확정돼요. 확정 전에 교환이나 반품을 신청해 주세요.',
  },
  {
    id: 'ntc_301',
    title: '첫 구매 적립금 3,000원 이벤트',
    category: 'event',
    audience: 'buyer',
    status: 'published',
    publishAt: '10-20 09:00',
    pinned: false,
    pushEnabled: true,
    pushReach: 18_420,
    body: '애착에서 처음 주문하면 적립금 3,000원을 드려요. 적립금은 1,000원부터 쓸 수 있어요.',
  },
  {
    id: 'ntc_295',
    title: '셀러 정산 주기 변경 안내',
    category: 'policy',
    audience: 'seller',
    status: 'published',
    publishAt: '10-15 14:00',
    pinned: false,
    pushEnabled: true,
    pushReach: 342,
    body: '정산은 매주 수요일에서 매주 화요일로 바뀌어요. 11월 첫 주부터 적용돼요.',
  },
  {
    id: 'ntc_288',
    title: '추석 연휴 배송 일정 안내',
    category: 'service',
    audience: 'all',
    status: 'ended',
    publishAt: '09-25 09:00',
    pinned: false,
    pushEnabled: false,
    pushReach: null,
    body: '연휴 기간에는 택배사 휴무로 배송이 지연될 수 있어요.',
  },
  {
    id: 'ntc_284',
    title: '리뷰 작성 가이드 초안',
    category: 'service',
    audience: 'buyer',
    status: 'draft',
    publishAt: '미정',
    pinned: false,
    pushEnabled: false,
    pushReach: null,
    body: '사진과 함께 쓴 리뷰가 다른 집사에게 가장 도움이 돼요. 광고나 외부 링크는 숨겨질 수 있어요.',
    internalMemo: '문구 확정 전 — 법무 확인 대기.',
  },
]
