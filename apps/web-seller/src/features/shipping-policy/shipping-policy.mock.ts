import type { ShippingPolicy } from '@aechak/domain'

// defaultCourier는 서버 courier_masters의 PK를 그대로 담는다 — 대문자다(소문자는 404/50303).
export const MOCK_SHIPPING_POLICY: ShippingPolicy = {
  sellerId: 'seller-1',
  defaultCourier: 'CJ',
  baseFee: 3000,
  freeShippingThreshold: 30000,
  originAddress: '서울 마포구 와우산로 00, 물류 1센터',
  returnAddress: '서울 마포구 와우산로 00, 물류 1센터',
  sameAsOrigin: true,
  jejuExtraFee: 3000,
  remoteAreaExtraFee: 5000,
  returnFee: 4000,
  exchangeFee: 8000,
  avgDispatchDays: 1,
}

const DELAY_MS = 300

export function mockFetchShippingPolicy(): Promise<ShippingPolicy> {
  return new Promise(resolve => {
    setTimeout(() => resolve({ ...MOCK_SHIPPING_POLICY }), DELAY_MS)
  })
}

export function mockUpdateShippingPolicy(policy: ShippingPolicy): Promise<ShippingPolicy> {
  return new Promise(resolve => {
    setTimeout(() => {
      Object.assign(MOCK_SHIPPING_POLICY, policy)
      resolve({ ...MOCK_SHIPPING_POLICY })
    }, DELAY_MS)
  })
}
