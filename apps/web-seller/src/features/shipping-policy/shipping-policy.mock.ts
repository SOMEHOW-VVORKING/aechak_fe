import type { ShippingPolicy } from '@aechak/domain'

export const MOCK_SHIPPING_POLICY: ShippingPolicy = {
  sellerId: 'seller-1',
  defaultCourier: 'cj',
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
