import { beforeEach, describe, expect, it, vi } from 'vitest'
import { paymentCallCounts, seedPaymentState } from '../../../testing/msw/server'
import {
  buildOrderName,
  confirmPayment,
  isPaymentReviewRequired,
  paymentErrorMessage,
  paymentFailureMessage,
  startPayment,
  toGatewayMethod,
} from '../payment.queries'

// 포트원 SDK는 CDN 스크립트를 주입하므로 모듈째 모킹한다. prepare/complete는 MSW로 실제 HTTP까지 태운다.
const sdk = vi.hoisted(() => ({ requestPayment: vi.fn() }))
vi.mock('@portone/browser-sdk/v2', () => ({ requestPayment: sdk.requestPayment }))

// axios 에러 모양(isAxiosError 플래그 + response)만 흉내 낸 최소 객체.
const err = (status: number, data?: { errorCode?: number; message?: string }) => ({
  isAxiosError: true,
  response: { status, data },
})

const sdkOk = (paymentId: string) => ({ transactionType: 'PAYMENT', txId: 'tx-1', paymentId })

const NO_DELAY = [0, 0, 0] as const

describe('결제수단·주문명 매핑', () => {
  it('[AC-PAYMENT-SDK-001] 화면 결제수단을 서버 enum으로 바꾼다', () => {
    expect(toGatewayMethod('card')).toBe('CARD')
    expect(toGatewayMethod('kakaopay')).toBe('KAKAO_PAY')
    expect(toGatewayMethod('tosspay')).toBe('TOSS_PAY')
  })

  it('[AC-PAYMENT-SDK-002] 주문명은 대표상품명 외 N건, 한 줄이면 상품명 그대로다', () => {
    expect(buildOrderName('자동 급식기 5L', 3)).toBe('자동 급식기 5L 외 2건')
    expect(buildOrderName('자동 급식기 5L', 1)).toBe('자동 급식기 5L')
  })
})

describe('startPayment', () => {
  beforeEach(() => {
    sdk.requestPayment.mockReset()
  })

  it('[AC-PAYMENT-SDK-003] prepare 응답을 포트원 요청으로 옮기고 결제창이 닫히면 launched다', async () => {
    seedPaymentState({ 'og-1': { finalPaymentAmount: 22000 } })
    sdk.requestPayment.mockResolvedValue(sdkOk('og-1'))

    const result = await startPayment({
      orderGroupId: 'og-1',
      method: 'kakaopay',
      orderName: '급식기 외 1건',
    })

    expect(result).toEqual({ outcome: 'launched' })
    expect(paymentCallCounts('og-1').prepare).toBe(1)
    expect(sdk.requestPayment).toHaveBeenCalledTimes(1)
    expect(sdk.requestPayment).toHaveBeenCalledWith({
      storeId: 'store-test',
      channelKey: 'channel-key-test',
      paymentId: 'og-1',
      orderName: '급식기 외 1건',
      totalAmount: 22000,
      currency: 'CURRENCY_KRW',
      payMethod: 'EASY_PAY',
      easyPay: { easyPayProvider: 'KAKAOPAY' },
      redirectUrl: `${window.location.origin}/payment/result?orderGroupId=og-1&method=kakaopay`,
    })
  })

  it('[AC-PAYMENT-SDK-004] 카드는 payMethod CARD로, 토스페이는 EASY_PAY+TOSSPAY로 연다', async () => {
    seedPaymentState({ 'og-card': {}, 'og-toss': {} })
    sdk.requestPayment.mockResolvedValue(undefined)

    await startPayment({ orderGroupId: 'og-card', method: 'card' })
    await startPayment({ orderGroupId: 'og-toss', method: 'tosspay' })

    expect(sdk.requestPayment.mock.calls[0]?.[0]).toMatchObject({ payMethod: 'CARD' })
    expect(sdk.requestPayment.mock.calls[0]?.[0]).not.toHaveProperty('easyPay')
    expect(sdk.requestPayment.mock.calls[1]?.[0]).toMatchObject({
      payMethod: 'EASY_PAY',
      easyPay: { easyPayProvider: 'TOSSPAY' },
    })
  })

  it('[AC-PAYMENT-SDK-005] prepare가 거절되면 결제창을 열지 않고 사유 코드와 문구를 돌려준다', async () => {
    seedPaymentState({ 'og-1': { prepare: { error: { status: 409, errorCode: 60009 } } } })

    const result = await startPayment({ orderGroupId: 'og-1', method: 'kakaopay' })

    expect(result).toEqual({
      outcome: 'failed',
      stage: 'prepare',
      errorCode: 60009,
      message: '결제 가능 시간이 지났어요. 장바구니에서 다시 주문해 주세요',
    })
    expect(sdk.requestPayment).not.toHaveBeenCalled()
  })

  it('[AC-PAYMENT-SDK-006] 결제창 응답의 code는 취소/실패로 가르고, SDK 예외는 실패다', async () => {
    seedPaymentState({ 'og-1': {} })
    sdk.requestPayment.mockResolvedValueOnce({
      ...sdkOk('og-1'),
      code: 'FAILURE_TYPE_PG',
      message: '사용자가 결제를 취소하셨습니다',
    })
    expect(await startPayment({ orderGroupId: 'og-1', method: 'card' })).toEqual({
      outcome: 'cancelled',
      message: '사용자가 결제를 취소하셨습니다',
    })

    sdk.requestPayment.mockResolvedValueOnce({
      ...sdkOk('og-1'),
      code: 'FAILURE_TYPE_PG',
      message: '한도 초과',
    })
    expect(await startPayment({ orderGroupId: 'og-1', method: 'card' })).toEqual({
      outcome: 'failed',
      stage: 'sdk',
      message: '한도 초과',
    })

    sdk.requestPayment.mockRejectedValueOnce(new Error('[PortOne] Failed to load window.PortOne'))
    expect(await startPayment({ orderGroupId: 'og-1', method: 'card' })).toMatchObject({
      outcome: 'failed',
      stage: 'sdk',
    })
  })

  it('[AC-PAYMENT-SDK-007] 같은 그룹을 동시에 두 번 시작해도 prepare·결제창은 한 번만 연다', async () => {
    seedPaymentState({ 'og-1': {} })
    sdk.requestPayment.mockResolvedValue(sdkOk('og-1'))

    const [a, b] = await Promise.all([
      startPayment({ orderGroupId: 'og-1', method: 'kakaopay' }),
      startPayment({ orderGroupId: 'og-1', method: 'kakaopay' }),
    ])

    expect(a).toEqual({ outcome: 'launched' })
    expect(b).toEqual({ outcome: 'launched' })
    expect(paymentCallCounts('og-1').prepare).toBe(1)
    expect(sdk.requestPayment).toHaveBeenCalledTimes(1)
  })
})

describe('confirmPayment', () => {
  it('[AC-PAYMENT-CONFIRM-001] IN_PROGRESS는 backoff로 재확인해 PAID를 받는다', async () => {
    seedPaymentState({
      'og-1': { completeSequence: ['IN_PROGRESS', 'PAID'], finalPaymentAmount: 500 },
    })

    const result = await confirmPayment('og-1', { retryDelaysMs: NO_DELAY })

    expect(result.status).toBe('PAID')
    expect(result.finalPaymentAmount).toBe(500)
    expect(paymentCallCounts('og-1').complete).toBe(2)
  })

  it('[AC-PAYMENT-CONFIRM-002] 재확인 3회 뒤에도 IN_PROGRESS면 그 상태를 그대로 돌려준다', async () => {
    seedPaymentState({ 'og-1': { completeSequence: ['IN_PROGRESS'] } })

    const result = await confirmPayment('og-1', { retryDelaysMs: NO_DELAY })

    expect(result.status).toBe('IN_PROGRESS')
    expect(paymentCallCounts('og-1').complete).toBe(4)
  })

  it('[AC-PAYMENT-CONFIRM-003] 502(60005)는 일시 오류로 보고 재확인하지만 60010은 즉시 던진다', async () => {
    seedPaymentState({
      'og-a': { completeSequence: [{ error: { status: 502, errorCode: 60005 } }, 'PAID'] },
      'og-b': { completeSequence: [{ error: { status: 409, errorCode: 60010 } }] },
    })

    expect((await confirmPayment('og-a', { retryDelaysMs: NO_DELAY })).status).toBe('PAID')
    expect(paymentCallCounts('og-a').complete).toBe(2)

    await expect(confirmPayment('og-b', { retryDelaysMs: NO_DELAY })).rejects.toSatisfy(
      isPaymentReviewRequired,
    )
    expect(paymentCallCounts('og-b').complete).toBe(1)
  })

  it('[AC-PAYMENT-CONFIRM-004] 동시에 두 번 물으면 한 요청을 공유하고, 끝난 뒤에는 다시 묻는다', async () => {
    seedPaymentState({ 'og-1': {} })

    const [a, b] = await Promise.all([confirmPayment('og-1'), confirmPayment('og-1')])
    expect(a).toBe(b)
    expect(paymentCallCounts('og-1').complete).toBe(1)

    await confirmPayment('og-1')
    expect(paymentCallCounts('og-1').complete).toBe(2)
  })
})

describe('결제 에러 문구', () => {
  it('[AC-PAYMENT-ERR-001] 서버 errorCode를 해요체 안내로 바꾸고, 미상은 기본 문구다', () => {
    expect(paymentErrorMessage(err(502, { errorCode: 60005 }))).toContain(
      '결제사와 통신하지 못했어요',
    )
    expect(paymentErrorMessage(err(409, { errorCode: 60006 }))).toBe(
      '이미 결제가 완료된 주문이에요',
    )
    expect(paymentErrorMessage(err(404, { errorCode: 60008 }))).toBe('주문 정보를 찾을 수 없어요')
    expect(
      paymentErrorMessage(err(409, { errorCode: 60012, message: '만료로 취소된 주문입니다.' })),
    ).toBe('시간이 지나 취소된 주문이에요. 결제됐다면 환불 처리돼요')
    expect(paymentErrorMessage(new Error('network'))).toBe(
      '결제를 진행하지 못했어요. 잠시 후 다시 시도해 주세요',
    )
  })

  it('[AC-PAYMENT-ERR-002] 60010/60011/60012만 고객센터 확인 대상이다', () => {
    expect(isPaymentReviewRequired(err(409, { errorCode: 60010 }))).toBe(true)
    expect(isPaymentReviewRequired(err(409, { errorCode: 60011 }))).toBe(true)
    expect(isPaymentReviewRequired(err(409, { errorCode: 60012 }))).toBe(true)
    expect(isPaymentReviewRequired(err(502, { errorCode: 60005 }))).toBe(false)
    expect(isPaymentReviewRequired(new Error('network'))).toBe(false)
  })

  it('[AC-PAYMENT-ERR-003] PG 실패 코드는 안내 문구로, 모르는 코드는 기본 문구로 바꾼다', () => {
    expect(paymentFailureMessage('PG_DECLINED')).toContain('승인을 거절했어요')
    expect(paymentFailureMessage(null)).toBe('결제를 완료하지 못했어요. 다시 시도해 주세요')
  })
})
