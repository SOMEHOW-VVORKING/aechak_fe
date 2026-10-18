import { useCallback, useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { PaymentMethod } from '@aechak/domain'
import {
  completePayment,
  errorResponse,
  preparePayment,
  type CompletePaymentResponse,
  type PaymentMethod as GatewayMethod,
} from '@aechak/api'
import { launchPortOnePayment } from './portone'

// 결제(prepare → 포트원 SDK → complete) 어댑터. 생성된 react-query 훅이 아니라 fetcher만 소비하고
// 서버 enum·에러코드는 이 파일 안에 가둔다. 주문서는 startPayment만, 결제 결과 화면은
// useCompletePayment만 쓴다.

const GATEWAY_METHOD: Record<PaymentMethod, GatewayMethod> = {
  card: 'CARD',
  kakaopay: 'KAKAO_PAY',
  tosspay: 'TOSS_PAY',
}

export function toGatewayMethod(method: PaymentMethod): GatewayMethod {
  return GATEWAY_METHOD[method]
}

// 결제창에 보이는 주문명 — "대표상품명 외 N건". 라인이 하나면 상품명 그대로.
export function buildOrderName(representativeName: string, lineCount: number): string {
  const rest = Math.max(0, lineCount - 1)
  return rest > 0 ? `${representativeName} 외 ${rest}건` : representativeName
}

const DEFAULT_ORDER_NAME = '애착 주문'

// BE PaymentErrorCode(60005~60012) — 고객센터 확인이 필요한 셋은 통신 재시도와 분리한다.
export const PAYMENT_REVIEW_REQUIRED_CODES = [60010, 60011, 60012] as const
// prepare가 거절한 사유 중 결과 화면이 분기하는 둘 — 이미 결제됨(complete가 PAID를 멱등 재반환)·만료(재시도 불가).
export const PAYMENT_ALREADY_PAID_CODE = 60006
export const PAYMENT_EXPIRED_CODE = 60009

export function paymentErrorCode(error: unknown): number | undefined {
  return errorResponse(error)?.data?.errorCode
}

export function isPaymentReviewRequired(error: unknown): boolean {
  const code = paymentErrorCode(error)
  return code != null && (PAYMENT_REVIEW_REQUIRED_CODES as readonly number[]).includes(code)
}

// 서버 message는 -습니다체라 그대로 쓰지 않는다.
export function paymentErrorMessage(error: unknown): string {
  const res = errorResponse(error)
  switch (res?.data?.errorCode) {
    case 60005:
      return '결제사와 통신하지 못했어요. 잠시 후 다시 시도해 주세요'
    case 60006:
      return '이미 결제가 완료된 주문이에요'
    case 60007:
      return '결제 금액이 올바르지 않아요. 장바구니에서 다시 주문해 주세요'
    case 60008:
      return '주문 정보를 찾을 수 없어요'
    case 60009:
      return '결제 가능 시간이 지났어요. 장바구니에서 다시 주문해 주세요'
    case 60010:
      return '결제 금액이 주문 금액과 달라요. 고객센터로 문의해 주세요'
    case 60011:
      return '확인이 필요한 결제 상태예요. 고객센터로 문의해 주세요'
    case 60012:
      return '시간이 지나 취소된 주문이에요. 결제됐다면 환불 처리돼요'
    case 90001:
      return '결제 요청이 올바르지 않아요'
    default:
      break
  }
  switch (res?.status) {
    case 403:
      return '결제할 권한이 없어요'
    case 404:
      return '주문 정보를 찾을 수 없어요'
    default:
      return '결제를 진행하지 못했어요. 잠시 후 다시 시도해 주세요'
  }
}

// PG 실패 코드(complete FAILED의 failureCode) 안내 문구.
export function paymentFailureMessage(failureCode: string | null | undefined): string {
  switch (failureCode) {
    case 'PG_DECLINED':
      return '결제사가 승인을 거절했어요. 다른 결제수단으로 다시 시도해 주세요'
    default:
      return '결제를 완료하지 못했어요. 다시 시도해 주세요'
  }
}

export type StartPaymentResult =
  | { outcome: 'launched' }
  | { outcome: 'cancelled'; message?: string }
  | { outcome: 'failed'; stage: 'prepare' | 'sdk'; errorCode?: number; message: string }

export interface StartPaymentInput {
  orderGroupId: string
  method: PaymentMethod
  /** 결제창 주문명(buildOrderName). 없으면 기본 주문명. */
  orderName?: string
}

export function paymentResultUrl(orderGroupId: string, method: PaymentMethod): string {
  const params = new URLSearchParams({ orderGroupId, method })
  return `${window.location.origin}/payment/result?${params.toString()}`
}

// 그룹별 진행 중 결제창 Promise — 같은 그룹을 연타해도 prepare·SDK는 한 번만 연다.
const launching = new Map<string, Promise<StartPaymentResult>>()

// prepare(사전등록) → 포트원 결제창. 'launched'면 결제창이 정상 종료(또는 리다이렉트)된 것이고
// 실제 성공 여부는 결과 화면의 complete가 서버에 묻는다.
export function startPayment(input: StartPaymentInput): Promise<StartPaymentResult> {
  const existing = launching.get(input.orderGroupId)
  if (existing) return existing
  const promise = runStartPayment(input).finally(() => {
    if (launching.get(input.orderGroupId) === promise) launching.delete(input.orderGroupId)
  })
  launching.set(input.orderGroupId, promise)
  return promise
}

async function runStartPayment(input: StartPaymentInput): Promise<StartPaymentResult> {
  const { orderGroupId, method } = input
  const gatewayMethod = toGatewayMethod(method)
  const prepared = await preparePayment(orderGroupId, { method: gatewayMethod }).then(
    envelope => envelope.data,
    (error: unknown) => ({
      outcome: 'failed' as const,
      stage: 'prepare' as const,
      errorCode: paymentErrorCode(error),
      message: paymentErrorMessage(error),
    }),
  )
  if ('outcome' in prepared) return prepared
  const result = await launchPortOnePayment({
    prepared,
    method: gatewayMethod,
    orderName: input.orderName ?? DEFAULT_ORDER_NAME,
    redirectUrl: paymentResultUrl(orderGroupId, method),
  })
  return result.outcome === 'failed' ? { ...result, stage: 'sdk' } : result
}

// IN_PROGRESS·네트워크 오류·502(60005)는 이 간격으로 최대 3회 재확인한다.
export const COMPLETE_RETRY_DELAYS_MS = [1000, 2000, 4000] as const

const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

function isTransientCompleteError(error: unknown): boolean {
  const res = errorResponse(error)
  if (!res) return true
  return res.status === 502 || res.data?.errorCode === 60005
}

async function runComplete(
  orderGroupId: string,
  delays: readonly number[],
): Promise<CompletePaymentResponse> {
  for (let attempt = 0; ; attempt += 1) {
    const delay = delays[attempt]
    try {
      const result = (await completePayment(orderGroupId)).data
      if (result.status !== 'IN_PROGRESS' || delay == null) return result
    } catch (error) {
      if (!isTransientCompleteError(error) || delay == null) throw error
    }
    await wait(delay)
  }
}

// 그룹별 진행 중 complete Promise. StrictMode 이중 마운트·동시 재진입이 한 요청을 공유하고,
// 끝나면 지워져 새로고침·재진입·'다시 확인'은 다시 서버에 묻는다(BE가 PAID에 멱등).
const confirming = new Map<string, Promise<CompletePaymentResponse>>()

export function confirmPayment(
  orderGroupId: string,
  options: { retryDelaysMs?: readonly number[] } = {},
): Promise<CompletePaymentResponse> {
  const existing = confirming.get(orderGroupId)
  if (existing) return existing
  const promise = runComplete(
    orderGroupId,
    options.retryDelaysMs ?? COMPLETE_RETRY_DELAYS_MS,
  ).finally(() => {
    if (confirming.get(orderGroupId) === promise) confirming.delete(orderGroupId)
  })
  confirming.set(orderGroupId, promise)
  return promise
}

export type PaymentConfirmation =
  | { phase: 'checking' }
  | { phase: 'paid'; result: CompletePaymentResponse }
  | { phase: 'failed'; result: CompletePaymentResponse }
  | { phase: 'in-progress'; result: CompletePaymentResponse }
  | { phase: 'review-required'; errorCode: number; message: string }
  | { phase: 'error'; message: string }

function toConfirmation(result: CompletePaymentResponse): PaymentConfirmation {
  switch (result.status) {
    case 'PAID':
      return { phase: 'paid', result }
    case 'IN_PROGRESS':
      return { phase: 'in-progress', result }
    default:
      return { phase: 'failed', result }
  }
}

// 결제 성공 시 서버가 바꾼 장바구니·주문 목록·적립금 캐시를 다시 읽게 한다.
export const PAID_INVALIDATE_KEYS = [['cart'], ['order-groups'], ['points']] as const

// 결과 화면 훅. 마운트마다 complete를 묻고(confirmPayment가 동시 중복만 합친다) 결과를
// 화면 단계로 내려준다. recheck()는 '다시 확인'·재시도 후 재확인에 쓴다.
export function useCompletePayment(orderGroupId: string) {
  const queryClient = useQueryClient()
  const [confirmation, setConfirmation] = useState<PaymentConfirmation>({ phase: 'checking' })

  const recheck = useCallback(async () => {
    setConfirmation({ phase: 'checking' })
    try {
      const result = await confirmPayment(orderGroupId)
      if (result.status === 'PAID') {
        await Promise.all(
          PAID_INVALIDATE_KEYS.map(queryKey => queryClient.invalidateQueries({ queryKey })),
        )
      }
      setConfirmation(toConfirmation(result))
    } catch (error) {
      const code = paymentErrorCode(error)
      setConfirmation(
        isPaymentReviewRequired(error) && code != null
          ? { phase: 'review-required', errorCode: code, message: paymentErrorMessage(error) }
          : { phase: 'error', message: paymentErrorMessage(error) },
      )
    }
  }, [orderGroupId, queryClient])

  useEffect(() => {
    void recheck()
  }, [recheck])

  return { confirmation, recheck }
}
