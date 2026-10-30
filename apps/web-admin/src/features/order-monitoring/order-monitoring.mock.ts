/**
 * 주문 배송 모니터링 예시 데이터.
 *
 * 주문·배송 조회는 seller 호스트(`/sellers/me/orders`, 셀러 본인 스코프)와 api 호스트
 * (`/orders/{orderId}`, 구매자 본인 스코프)에만 있다. 플랫폼 전체 주문을 보는 admin 경로는 없고,
 * web-admin은 `sellerOrigin`을 아예 설정하지 않아 셀러 경로를 부를 수도 없다(main.tsx).
 * 그래서 목록·타임라인이 전부 예시다.
 *
 * 타임라인 단계 상태는 DS `TimelineStep`과 같은 리터럴을 여기 한 번 더 둔다 — 예시 데이터 파일이
 * UI 패키지를 import하지 않게 하려는 것이고, 구조적으로 같아 그대로 넘어간다.
 */
export type AdminOrderStatus =
  | 'paid'
  | 'preparing'
  | 'shipping'
  | 'delivered'
  | 'confirmed'
  | 'claimed'

export interface AdminOrderStage {
  label: string
  sublabel?: string
  status: 'done' | 'active' | 'todo'
}

export interface AdminOrderMonitorRow {
  id: string
  orderedAt: string
  buyerMasked: string
  sellerName: string
  itemSummary: string
  amount: number
  status: AdminOrderStatus
  courier?: string
  trackingNumber?: string
  stages: AdminOrderStage[]
  /** 발송 기한 초과처럼 운영자가 먼저 봐야 하는 신호. 없으면 정상 흐름이다. */
  delayNote?: string
  nudgeMemo?: string
}

const stage = (
  label: string,
  status: AdminOrderStage['status'],
  sublabel?: string,
): AdminOrderStage => ({ label, status, sublabel })

export const adminOrderMonitorRowsMock: AdminOrderMonitorRow[] = [
  {
    id: 'ORD-26102600142',
    orderedAt: '10-26 21:31',
    buyerMasked: '코코맘',
    sellerName: '멍멍마켓',
    itemSummary: '프리미엄 관절 영양제 180정 (2개)',
    amount: 78_000,
    status: 'paid',
    stages: [
      stage('결제 완료', 'done', '10-26 21:31'),
      stage('상품 준비', 'active'),
      stage('배송 중', 'todo'),
      stage('배송 완료', 'todo'),
      stage('구매 확정', 'todo'),
    ],
  },
  {
    id: 'ORD-26102500138',
    orderedAt: '10-25 10:04',
    buyerMasked: '먼지아빠',
    sellerName: '냥이상점',
    itemSummary: '수제 오리목뼈 간식 500g (1개)',
    amount: 23_500,
    status: 'preparing',
    stages: [
      stage('결제 완료', 'done', '10-25 10:04'),
      stage('상품 준비', 'active', '발송 기한 10-27'),
      stage('배송 중', 'todo'),
      stage('배송 완료', 'todo'),
      stage('구매 확정', 'todo'),
    ],
    delayNote: '결제 후 48시간이 지났는데 송장이 등록되지 않았어요.',
  },
  {
    id: 'ORD-26102400121',
    orderedAt: '10-24 18:47',
    buyerMasked: '초코집사',
    sellerName: '멍멍마켓',
    itemSummary: '고양이 자동 급식기 5L (1개)',
    amount: 64_000,
    status: 'shipping',
    courier: 'CJ대한통운',
    trackingNumber: '6381-2049-1182',
    stages: [
      stage('결제 완료', 'done', '10-24 18:47'),
      stage('상품 준비', 'done', '10-25 09:12'),
      stage('배송 중', 'active', '10-25 14:30 / CJ대한통운'),
      stage('배송 완료', 'todo'),
      stage('구매 확정', 'todo'),
    ],
  },
  {
    id: 'ORD-26102300109',
    orderedAt: '10-23 09:15',
    buyerMasked: '라이카맘',
    sellerName: '보리펫샵',
    itemSummary: '저알러지 건식사료 5kg (1개)',
    amount: 52_900,
    status: 'delivered',
    courier: '한진택배',
    trackingNumber: '2210-7741-8890',
    stages: [
      stage('결제 완료', 'done', '10-23 09:15'),
      stage('상품 준비', 'done', '10-23 15:40'),
      stage('배송 중', 'done', '10-24 08:20 / 한진택배'),
      stage('배송 완료', 'active', '10-25 13:02'),
      stage('구매 확정', 'todo', '자동 확정 10-31'),
    ],
  },
  {
    id: 'ORD-26102200097',
    orderedAt: '10-22 13:28',
    buyerMasked: '보리네집',
    sellerName: '냥이상점',
    itemSummary: '원목 캣타워 대형 (1개)',
    amount: 139_000,
    status: 'claimed',
    courier: '롯데택배',
    trackingNumber: '4418-2201-7733',
    stages: [
      stage('결제 완료', 'done', '10-22 13:28'),
      stage('상품 준비', 'done', '10-22 18:02'),
      stage('배송 중', 'done', '10-23 09:11 / 롯데택배'),
      stage('배송 완료', 'done', '10-24 11:45'),
      stage('반품 접수', 'active', '10-25 20:10'),
    ],
    delayNote: '파손 반품이 접수됐고 셀러 회수 지시가 아직 없어요.',
  },
  {
    id: 'ORD-26102100088',
    orderedAt: '10-21 08:02',
    buyerMasked: '코코맘',
    sellerName: '보리펫샵',
    itemSummary: '펫 드라이룸 필터 (3개)',
    amount: 31_200,
    status: 'confirmed',
    courier: '우체국택배',
    trackingNumber: '1180-4420-5512',
    stages: [
      stage('결제 완료', 'done', '10-21 08:02'),
      stage('상품 준비', 'done', '10-21 13:30'),
      stage('배송 중', 'done', '10-22 07:50 / 우체국택배'),
      stage('배송 완료', 'done', '10-23 10:12'),
      stage('구매 확정', 'done', '10-24 10:12'),
    ],
  },
]
