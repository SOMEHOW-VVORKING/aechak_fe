import type { HistoryEntry } from '@aechak/domain'

/**
 * 취소/반품/교환 중재 예시 데이터.
 *
 * 클레임 처리는 seller 호스트(`/sellers/me/claims`, 셀러가 자기 건을 처리)와 api 호스트
 * (`/orders/{orderPublicId}/claims`, 구매자가 자기 건을 요청)에만 있다. 운영자가 끼어들어
 * 중재하는 admin 경로는 없어 목록·중재 결정이 전부 예시다.
 *
 * 셀러 `Claim`·구매자 `BuyerOrderClaim`을 재사용하지 않는 이유: 운영 중재는 **귀책 판정과
 * 배송비 부담 주체**를 함께 다루고(양쪽 타입에 없는 축) 양쪽 주장을 나란히 들고 있어야 한다 —
 * 필드가 부족한 정도가 아니라 상태머신이 다르다(AGENTS.md 1-7의 병렬 타입 기준).
 */
export type AdminClaimType = 'cancel' | 'return' | 'exchange'

export type AdminClaimStatus =
  | 'requested'
  | 'seller-rejected'
  | 'arbitrating'
  | 'approved'
  | 'rejected'

export type AdminClaimParty = 'buyer' | 'seller' | 'undecided'

/**
 * 반품·교환 배송비를 누가 내는가. **귀책(`responsibleParty`)과 따로 들고 있다** — 귀책은
 * 셀러/구매자 둘뿐이지만 배송비는 플랫폼이 떠안는 결정(택배사 과실·운영 사과 등)이 있어,
 * 귀책에서 계산해 버리면 그 결정을 적을 자리가 없다.
 */
export type AdminClaimShippingBearer = 'buyer' | 'seller' | 'platform'

export interface AdminClaim {
  id: string
  orderId: string
  claimType: AdminClaimType
  productName: string
  sellerName: string
  buyerMasked: string
  reason: string
  requestedAt: string
  status: AdminClaimStatus
  responsibleParty: AdminClaimParty
  /** 중재에서 정한 배송비 부담 주체. 아직 정하지 않았으면 비운다. */
  shippingBearer?: AdminClaimShippingBearer
  refundAmount: number
  shippingFee: number
  buyerClaim: string
  sellerReply: string
  history: HistoryEntry[]
  arbitrationNote?: string
  internalMemo?: string
}

export const adminClaimsMock: AdminClaim[] = [
  {
    id: 'CLM-2041',
    orderId: 'ORD-26102200097',
    claimType: 'return',
    productName: '원목 캣타워 대형',
    sellerName: '냥이상점',
    buyerMasked: '보리네집',
    reason: '파손 배송',
    requestedAt: '10-25 20:10',
    status: 'arbitrating',
    responsibleParty: 'undecided',
    refundAmount: 139_000,
    shippingFee: 8_000,
    buyerClaim: '박스를 열자마자 기둥이 갈라져 있었어요. 개봉 영상이 있어요.',
    sellerReply: '출고 전 검수 사진에는 파손이 없었어요. 택배사 과실로 보여요.',
    history: [
      { label: '구매자 반품 요청', date: '10-25' },
      { label: '셀러 거부', date: '10-26' },
      { label: '운영 중재 요청', date: '10-26' },
    ],
  },
  {
    id: 'CLM-2038',
    orderId: 'ORD-26102500138',
    claimType: 'cancel',
    productName: '수제 오리목뼈 간식 500g',
    sellerName: '냥이상점',
    buyerMasked: '먼지아빠',
    reason: '발송 지연',
    requestedAt: '10-26 09:30',
    status: 'requested',
    responsibleParty: 'seller',
    shippingBearer: 'seller',
    refundAmount: 23_500,
    shippingFee: 0,
    buyerClaim: '결제한 지 이틀이 지났는데 아직 발송되지 않았어요. 취소하고 싶어요.',
    sellerReply: '원물 입고가 늦어져 발송이 밀렸어요. 취소에 동의해요.',
    history: [{ label: '구매자 취소 요청', date: '10-26' }],
  },
  {
    id: 'CLM-2030',
    orderId: 'ORD-26102400121',
    claimType: 'exchange',
    productName: '고양이 자동 급식기 5L',
    sellerName: '멍멍마켓',
    buyerMasked: '초코집사',
    reason: '다른 상품 배송',
    requestedAt: '10-25 11:15',
    status: 'approved',
    responsibleParty: 'seller',
    shippingBearer: 'seller',
    refundAmount: 0,
    shippingFee: 0,
    buyerClaim: '3L를 주문했는데 5L가 왔어요.',
    sellerReply: '출고 라벨이 바뀐 것을 확인했어요. 교환 회수 접수했어요.',
    history: [
      { label: '구매자 교환 요청', date: '10-25' },
      { label: '셀러 승인', date: '10-25' },
    ],
    arbitrationNote: '셀러 귀책으로 왕복 배송비 전액 셀러 부담.',
  },
  {
    id: 'CLM-2021',
    orderId: 'ORD-26102100088',
    claimType: 'return',
    productName: '펫 드라이룸 필터',
    sellerName: '보리펫샵',
    buyerMasked: '코코맘',
    reason: '단순 변심',
    requestedAt: '10-24 14:02',
    status: 'seller-rejected',
    responsibleParty: 'buyer',
    shippingBearer: 'buyer',
    refundAmount: 31_200,
    shippingFee: 5_000,
    buyerClaim: '필터 규격이 제 기기와 맞지 않아요.',
    sellerReply: '개봉 후 사용한 흔적이 있어 반품이 어려워요.',
    history: [
      { label: '구매자 반품 요청', date: '10-24' },
      { label: '셀러 거부', date: '10-25' },
    ],
    internalMemo: '사용 흔적 사진 수령함 — 구매자에게 추가 설명 요청 필요.',
  },
  {
    id: 'CLM-2015',
    orderId: 'ORD-26102000074',
    claimType: 'cancel',
    productName: '저알러지 건식사료 5kg',
    sellerName: '보리펫샵',
    buyerMasked: '라이카맘',
    reason: '중복 주문',
    requestedAt: '10-21 08:44',
    status: 'rejected',
    responsibleParty: 'buyer',
    shippingBearer: 'buyer',
    refundAmount: 0,
    shippingFee: 0,
    buyerClaim: '실수로 두 번 결제했어요.',
    sellerReply: '이미 발송돼 취소가 어려워요. 수취 후 반품으로 안내했어요.',
    history: [
      { label: '구매자 취소 요청', date: '10-21' },
      { label: '발송 완료로 취소 불가', date: '10-21' },
    ],
    arbitrationNote: '발송 후 요청이라 취소 불가 — 반품 절차로 안내.',
  },
]
