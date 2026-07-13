import { describe, it, expect } from 'vitest'
import type { BuyerOrder, Review } from '@aechak/domain'
import {
  buildPendingReviews,
  containsProhibitedWord,
  sortReviews,
  validateReview,
} from '../review.mock'

function review(overrides: Partial<Review>): Review {
  return {
    id: 'r',
    productId: 'p1',
    orderId: 'o1',
    author: '나',
    rating: 5,
    content: '좋아요',
    images: [],
    verifiedPurchase: true,
    createdAt: '2026.06.10',
    ...overrides,
  }
}

describe('review.mock 등록 검증', () => {
  it('[AC-REVIEW-001] 별점 미선택이면 등록 불가', () => {
    const v = validateReview(0, '충분히 긴 리뷰 내용이에요')
    expect(v.ok).toBe(false)
    expect(v.ok === false && v.reason).toBe('rating')
  })

  it('[AC-REVIEW-002] 최소 10자 미만이면 등록 불가', () => {
    expect(validateReview(5, '짧아요').ok).toBe(false)
    expect(validateReview(5, '충분히 긴 리뷰 내용이에요').ok).toBe(true)
  })

  it('[AC-REVIEW-003] 금칙어가 포함되면 등록 불가', () => {
    expect(containsProhibitedWord('직거래 하실 분 연락 주세요')).toBe(true)
    expect(containsProhibitedWord('배송도 빠르고 품질도 좋아요')).toBe(false)
    const v = validateReview(5, '카톡으로 연락 주시면 싸게 드려요')
    expect(v.ok === false && v.reason).toBe('prohibited')
  })
})

describe('review.mock 정렬/필터', () => {
  const reviews: Review[] = [
    review({ id: 'a', rating: 3, createdAt: '2026.06.05', images: [] }),
    review({ id: 'b', rating: 5, createdAt: '2026.06.10', images: ['img1'] }),
    review({ id: 'c', rating: 4, createdAt: '2026.06.08', images: [] }),
  ]

  it('[AC-REVIEW-004] 최신순은 작성일 내림차순', () => {
    expect(sortReviews(reviews, 'latest').map(r => r.id)).toEqual(['b', 'c', 'a'])
  })

  it('[AC-REVIEW-005] 별점높은순은 별점 내림차순', () => {
    expect(sortReviews(reviews, 'rating').map(r => r.id)).toEqual(['b', 'c', 'a'])
  })

  it('[AC-REVIEW-006] 포토리뷰만은 이미지가 있는 리뷰만 남긴다', () => {
    expect(sortReviews(reviews, 'photo').map(r => r.id)).toEqual(['b'])
  })
})

describe('review.mock 작성 대기 파생', () => {
  const orders: BuyerOrder[] = [
    {
      id: 'o-delivered',
      orderedAt: '2026.07.03',
      status: 'delivered',
      method: 'kakaopay',
      groups: [
        {
          sellerId: 's1',
          storeName: 'A',
          shippingFee: 0,
          items: [
            { productId: 'p1', name: '리드줄', option: '기본', quantity: 1, unitPrice: 24000 },
            { productId: 'p2', name: '노즈워크', option: '기본', quantity: 1, unitPrice: 18000 },
          ],
        },
      ],
      itemsTotal: 42000,
      shippingTotal: 0,
      couponDiscount: 0,
      pointsUsed: 0,
      paidAmount: 42000,
      pointsEarned: 420,
      deliveredAt: '2026.07.05',
    },
    {
      id: 'o-shipping',
      orderedAt: '2026.07.07',
      status: 'shipping',
      method: 'kakaopay',
      groups: [
        {
          sellerId: 's1',
          storeName: 'A',
          shippingFee: 0,
          items: [{ productId: 'p3', name: '츄르', option: '기본', quantity: 1, unitPrice: 13900 }],
        },
      ],
      itemsTotal: 13900,
      shippingTotal: 0,
      couponDiscount: 0,
      pointsUsed: 0,
      paidAmount: 13900,
      pointsEarned: 139,
    },
  ]

  it('[AC-REVIEW-007] 배송완료/구매확정 주문 상품만, 이미 쓴 리뷰는 제외한다', () => {
    // p1은 이미 리뷰함 → p2만 대기. 배송중(o-shipping)의 p3는 대기 대상 아님.
    const isReviewed = (orderId: string, productId: string) =>
      orderId === 'o-delivered' && productId === 'p1'
    const pending = buildPendingReviews(orders, isReviewed)
    expect(pending.map(p => p.productId)).toEqual(['p2'])
    expect(pending[0]?.since).toContain('배송완료')
  })

  it('[AC-REVIEW-008] 스냅샷에 썸네일이 없으면 상품 id로 카탈로그 실루엣을 채운다', () => {
    // 실제 카탈로그 상품(p-feeder-5l)을 담은 배송완료 주문 → 작성 대기 카드가 다른 화면과
    // 같은 실루엣 썸네일(data-URI)을 갖는다("빈 이미지" 아이콘으로 빠지지 않음).
    const catalogOrders: BuyerOrder[] = [
      {
        id: 'o-catalog',
        orderedAt: '2026.07.03',
        status: 'delivered',
        method: 'kakaopay',
        groups: [
          {
            sellerId: 'seller-냥이상점',
            storeName: '냥이상점',
            shippingFee: 0,
            items: [
              { productId: 'p-feeder-5l', name: '자동 급식기', option: '기본', quantity: 1, unitPrice: 64000 },
            ],
          },
        ],
        itemsTotal: 64000,
        shippingTotal: 0,
        couponDiscount: 0,
        pointsUsed: 0,
        paidAmount: 64000,
        pointsEarned: 640,
        deliveredAt: '2026.07.05',
      },
    ]
    const pending = buildPendingReviews(catalogOrders, () => false)
    expect(pending[0]?.thumbnailUrl).toContain('data:image/svg+xml')
  })
})
