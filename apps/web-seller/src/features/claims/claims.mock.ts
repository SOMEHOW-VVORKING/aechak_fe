import type { Claim } from '@aechak/domain'

export const MOCK_CLAIMS: Claim[] = [
  {
    id: 'claim-1',
    orderId: '20260616-0090',
    sellerId: 'seller-1',
    type: 'cancel',
    productName: '동결건조 간식 100g',
    reason: '단순 변심 / 배송 전',
    responsibleParty: 'buyer',
    shippingFeeNote: '배송비 없음 (미발송)',
    amount: 25000,
    status: 'pending',
    createdAt: '2026-06-16T10:00:00.000Z',
  },
  {
    id: 'claim-2',
    orderId: '20260616-0091',
    sellerId: 'seller-1',
    type: 'cancel',
    productName: '상품 3종 (다른 셀러 포함)',
    reason: '부분 취소 / 배송 전',
    responsibleParty: 'buyer',
    shippingFeeNote: '내 상품 2건 처리 대상',
    amount: 53000,
    status: 'pending',
    memo: '내 상점(냥이상점) 2건만 취소. 급식기는 유지.',
    createdAt: '2026-06-16T09:30:00.000Z',
  },
  {
    id: 'claim-3',
    orderId: '20260612-0055',
    sellerId: 'seller-1',
    type: 'cancel',
    productName: '캣닢 장난감 세트',
    reason: '단순 변심 / 배송 전',
    responsibleParty: 'buyer',
    shippingFeeNote: '배송비 없음 (미발송)',
    amount: 9900,
    status: 'approved',
    createdAt: '2026-06-12T11:00:00.000Z',
  },
  {
    id: 'claim-4',
    orderId: '20260614-0203',
    sellerId: 'seller-1',
    type: 'return',
    productName: '자동 급식기 5L',
    reason: '제품 불량 / 배송 후',
    responsibleParty: 'seller',
    shippingFeeNote: '반품비 셀러 부담',
    amount: 59000,
    status: 'collecting',
    memo: '불량 사진 확인됨. 재고 검수 후 환불.',
    createdAt: '2026-06-14T15:20:00.000Z',
  },
  {
    id: 'claim-5',
    orderId: '20260613-0177',
    sellerId: 'seller-1',
    type: 'exchange',
    productName: '캣타워 그레이',
    reason: '옵션 변경',
    responsibleParty: 'buyer',
    shippingFeeNote: '교환비 구매자 부담 8,000원',
    amount: 8000,
    status: 'pending',
    createdAt: '2026-06-13T17:45:00.000Z',
  },
]

const DELAY_MS = 300

export function mockFetchClaims(): Promise<Claim[]> {
  return new Promise(resolve => {
    setTimeout(() => resolve(MOCK_CLAIMS), DELAY_MS)
  })
}

function findClaim(id: string): Claim | undefined {
  return MOCK_CLAIMS.find(c => c.id === id)
}

export function mockApproveClaim(claimId: string): Promise<void> {
  return new Promise(resolve => {
    setTimeout(() => {
      const claim = findClaim(claimId)
      if (claim) claim.status = claim.type === 'return' ? 'collecting' : 'approved'
      resolve()
    }, DELAY_MS)
  })
}

export function mockRejectClaim(claimId: string): Promise<void> {
  return new Promise(resolve => {
    setTimeout(() => {
      const claim = findClaim(claimId)
      if (claim) claim.status = 'rejected'
      resolve()
    }, DELAY_MS)
  })
}

export function mockConfirmRefund(claimId: string): Promise<void> {
  return new Promise(resolve => {
    setTimeout(() => {
      const claim = findClaim(claimId)
      if (claim) claim.status = 'refunded'
      resolve()
    }, DELAY_MS)
  })
}

export function mockUpdateClaimMemo(claimId: string, memo: string): Promise<void> {
  return new Promise(resolve => {
    setTimeout(() => {
      const claim = findClaim(claimId)
      if (claim) claim.memo = memo
      resolve()
    }, DELAY_MS)
  })
}
