import { requestPayment, type PaymentRequest } from '@portone/browser-sdk/v2'
import type { PaymentMethod as GatewayMethod, PreparePaymentResponse } from '@aechak/api'

// 포트원 v2 브라우저 SDK 어댑터. npm 패키지의 `/v2` 엔트리는 첫 requestPayment 호출 때
// https://cdn.portone.io/v2/browser-sdk.js 스크립트를 주입해 window.PortOne을 기다린다
// (이미 window.PortOne이 있으면 주입 없이 그 객체를 쓴다 — E2E 스텁이 이 성질을 이용한다).

export type LaunchPaymentResult =
  | { outcome: 'launched' }
  | { outcome: 'cancelled'; message?: string }
  | { outcome: 'failed'; message: string }

export interface LaunchPaymentInput {
  prepared: PreparePaymentResponse
  method: GatewayMethod
  orderName: string
  redirectUrl: string
}

const EASY_PAY_PROVIDER: Record<Exclude<GatewayMethod, 'CARD'>, 'KAKAOPAY' | 'TOSSPAY'> = {
  KAKAO_PAY: 'KAKAOPAY',
  TOSS_PAY: 'TOSSPAY',
}

export function toPortOneRequest(input: LaunchPaymentInput): PaymentRequest {
  const { prepared, method, orderName, redirectUrl } = input
  const base = {
    storeId: prepared.storeId,
    channelKey: prepared.channelKey,
    paymentId: prepared.paymentId,
    orderName,
    totalAmount: prepared.targetAmount,
    currency: 'CURRENCY_KRW' as const,
    redirectUrl,
  }
  if (method === 'CARD') return { ...base, payMethod: 'CARD' }
  return { ...base, payMethod: 'EASY_PAY', easyPay: { easyPayProvider: EASY_PAY_PROVIDER[method] } }
}

const CANCEL_PATTERN = /취소|cancel/i

// 포트원 응답은 성공이면 code가 없고, 실패·취소면 code가 들어온다(사용자 취소도 별도 코드 없이
// code+message로 온다). 리다이렉트 방식 PG는 응답 없이 페이지가 떠나므로 undefined도 launched.
export async function launchPortOnePayment(
  input: LaunchPaymentInput,
): Promise<LaunchPaymentResult> {
  try {
    const response = await requestPayment(toPortOneRequest(input))
    if (!response || response.code == null) return { outcome: 'launched' }
    const message = response.message ?? response.pgMessage ?? undefined
    if (CANCEL_PATTERN.test(`${response.code} ${message ?? ''} ${response.pgCode ?? ''}`)) {
      return { outcome: 'cancelled', message }
    }
    return { outcome: 'failed', message: message ?? '결제창에서 결제를 완료하지 못했어요' }
  } catch (error) {
    const message = error instanceof Error && error.message ? error.message : undefined
    if (message && CANCEL_PATTERN.test(message)) return { outcome: 'cancelled', message }
    return { outcome: 'failed', message: '결제창을 열지 못했어요. 잠시 후 다시 시도해 주세요' }
  }
}
