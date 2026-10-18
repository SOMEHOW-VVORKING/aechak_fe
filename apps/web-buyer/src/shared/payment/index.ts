// 결제 공용 배럴. 주문서(startPayment)와 결제 결과 화면(useCompletePayment)이 feature 경계를 넘어
// 같은 어댑터를 쓰므로 shared에 둔다. 포트원 SDK 호출은 portone.ts 안에만 있다.
export {
  COMPLETE_RETRY_DELAYS_MS,
  PAID_INVALIDATE_KEYS,
  PAYMENT_ALREADY_PAID_CODE,
  PAYMENT_EXPIRED_CODE,
  PAYMENT_REVIEW_REQUIRED_CODES,
  buildOrderName,
  confirmPayment,
  isPaymentReviewRequired,
  paymentErrorCode,
  paymentErrorMessage,
  paymentFailureMessage,
  paymentResultUrl,
  startPayment,
  toGatewayMethod,
  useCompletePayment,
} from './payment.queries'
export type { PaymentConfirmation, StartPaymentInput, StartPaymentResult } from './payment.queries'
export { launchPortOnePayment, toPortOneRequest } from './portone'
export type { LaunchPaymentInput, LaunchPaymentResult } from './portone'
