import type { Settlement } from '@aechak/domain'

export const MOCK_SETTLEMENTS: Settlement[] = [
  {
    orderId: '20260613-0182',
    settlementMonth: '2026-06',
    confirmedAt: '06.18',
    expectedPayoutDate: '06.25',
    productAmount: 64000,
    feeAmount: 11912,
    finalAmount: 59088,
    status: 'scheduled',
    shippingFee: 3000,
    couponBurden: 5000,
    platformFeeAmount: 5120,
    pgFeeAmount: 1792,
    refundDeduction: 0,
  },
  {
    orderId: '20260605-0140',
    settlementMonth: '2026-06',
    confirmedAt: '06.08',
    expectedPayoutDate: '06.10',
    productAmount: 32000,
    feeAmount: 5400,
    finalAmount: 26600,
    status: 'completed',
    shippingFee: 3000,
    couponBurden: 1944,
    platformFeeAmount: 2560,
    pgFeeAmount: 896,
    refundDeduction: 0,
  },
  {
    orderId: '20260616-0091',
    settlementMonth: '2026-06',
    productAmount: 59000,
    status: 'pending',
  },
  {
    orderId: '20260610-0044',
    settlementMonth: '2026-06',
    productAmount: 48000,
    status: 'held',
  },
  {
    orderId: '20260512-0055',
    settlementMonth: '2026-05',
    confirmedAt: '05.15',
    expectedPayoutDate: '05.17',
    productAmount: 45000,
    feeAmount: 4860,
    finalAmount: 40140,
    status: 'completed',
    shippingFee: 3000,
    couponBurden: 0,
    platformFeeAmount: 3600,
    pgFeeAmount: 1260,
    refundDeduction: 0,
  },
  {
    orderId: '20260520-0072',
    settlementMonth: '2026-05',
    productAmount: 27000,
    status: 'held',
  },
  {
    orderId: '20260410-0021',
    settlementMonth: '2026-04',
    confirmedAt: '04.13',
    expectedPayoutDate: '04.15',
    productAmount: 52000,
    feeAmount: 7616,
    finalAmount: 44384,
    status: 'completed',
    shippingFee: 3000,
    couponBurden: 2000,
    platformFeeAmount: 4160,
    pgFeeAmount: 1456,
    refundDeduction: 0,
  },
]

const DELAY_MS = 300

export function mockFetchSettlements(): Promise<Settlement[]> {
  return new Promise(resolve => {
    setTimeout(() => resolve(MOCK_SETTLEMENTS), DELAY_MS)
  })
}
