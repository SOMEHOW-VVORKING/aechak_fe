import type { HistoryEntry } from '@aechak/domain'

/**
 * 리뷰 관리 예시 데이터.
 *
 * api 호스트의 `/reviews`는 구매자가 자기 리뷰를 쓰고 고치는 경로다 — 운영자가 전체 리뷰를
 * 조회하고 숨기는 admin 경로는 없어 목록·블라인드가 전부 예시다. `@aechak/domain`의 `Review`는
 * 구매자 화면용(상품 상세 노출)이라 신고 수·블라인드 주체 같은 운영 축이 없다.
 */
export type AdminReviewStatus = 'visible' | 'reported' | 'blinded' | 'deleted'

export interface AdminReview {
  id: string
  productName: string
  sellerName: string
  writerMasked: string
  rating: 1 | 2 | 3 | 4 | 5
  content: string
  photoCount: number
  createdAt: string
  reportCount: number
  status: AdminReviewStatus
  /** 블라인드가 걸린 주체. AI 1차 탐지와 운영자 수동 처리를 구별한다. */
  blindActor?: 'ai' | 'admin'
  blindReason?: string
  writerNotice?: string
  internalMemo?: string
  history: HistoryEntry[]
}

export const adminReviewsMock: AdminReview[] = [
  {
    id: 'rvw_51204',
    productName: '저알러지 건식사료 5kg',
    sellerName: '보리펫샵',
    writerMasked: '초코집사',
    rating: 1,
    content:
      '사료 바꾸고 애가 아팠어요. 대표 이름까지 적으며 욕을 섞어 쓴 문장이 뒤에 이어져요.',
    photoCount: 2,
    createdAt: '10-25 21:32',
    reportCount: 4,
    status: 'reported',
    history: [
      { label: '욕설/비방 신고', date: '10-25' },
      { label: '욕설/비방 신고', date: '10-25' },
    ],
  },
  {
    id: 'rvw_51188',
    productName: '프리미엄 관절 영양제 180정',
    sellerName: '멍멍마켓',
    writerMasked: '먼지아빠',
    rating: 5,
    content: '효과가 좋아요. 같은 제품을 더 싸게 파는 곳 주소를 댓글로 남겨 둘게요.',
    photoCount: 0,
    createdAt: '10-24 11:08',
    reportCount: 1,
    status: 'blinded',
    blindActor: 'ai',
    blindReason: '외부 거래 유도',
    history: [
      { label: 'AI 1차 탐지 — 외부 링크', date: '10-24' },
      { label: 'AI 자동 블라인드', date: '10-24' },
    ],
  },
  {
    id: 'rvw_51150',
    productName: '고양이 자동 급식기 5L',
    sellerName: '멍멍마켓',
    writerMasked: '코코맘',
    rating: 4,
    content: '급식량이 정확해요. 소음은 생각보다 조금 있어요.',
    photoCount: 3,
    createdAt: '10-23 09:44',
    reportCount: 0,
    status: 'visible',
    history: [],
  },
  {
    id: 'rvw_51102',
    productName: '수제 오리목뼈 간식 500g',
    sellerName: '냥이상점',
    writerMasked: '라이카맘',
    rating: 2,
    content: '포장이 터져서 왔어요. 사진 첨부했어요.',
    photoCount: 1,
    createdAt: '10-22 18:20',
    reportCount: 1,
    status: 'visible',
    history: [{ label: '셀러 이의 제기', date: '10-23' }],
    internalMemo: '셀러 이의 — 배송 중 파손이라 리뷰 삭제 요청. 상품 결함과 구분 필요.',
  },
  {
    id: 'rvw_51060',
    productName: '원목 캣타워 대형',
    sellerName: '냥이상점',
    writerMasked: '보리네집',
    rating: 1,
    content: '광고성 문구만 반복된 리뷰였어요.',
    photoCount: 0,
    createdAt: '10-21 15:02',
    reportCount: 3,
    status: 'deleted',
    blindActor: 'admin',
    blindReason: '광고/스팸',
    writerNotice: '광고성 리뷰로 판단되어 삭제됐어요. 반복되면 이용이 제한돼요.',
    history: [
      { label: '광고/스팸 신고', date: '10-21' },
      { label: '관리자 삭제', date: '10-22' },
    ],
  },
]
