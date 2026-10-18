import { useEffect, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { CheckCircle2, Clock, Loader2, XCircle } from 'lucide-react'
import type { PaymentMethod } from '@aechak/domain'
import { Button, Card, MobileScreen } from '@aechak/design-system/web'
import { BackAppBar } from '@/shared/components/BackAppBar'
import { ResultHero } from '@/shared/components/ResultHero'
import { formatKRW } from '@/shared/formatKRW'
import { readOrderAttempt, resetOrderAttempt } from '@/shared/order'
import {
  PAYMENT_ALREADY_PAID_CODE,
  PAYMENT_EXPIRED_CODE,
  paymentFailureMessage,
  startPayment,
  useCompletePayment,
} from '@/shared/payment'

export interface PaymentResultScreenProps {
  orderGroupId: string
  /** 주문서에서 고른 결제수단 — 실패 후 '다시 시도'가 같은 수단으로 결제창을 다시 연다. */
  method?: PaymentMethod
}

// 결제 결과(b1-st-5). 진입·재진입·새로고침마다 서버 complete로 결제 상태를 확인한다 —
// SDK 응답이나 URL 값이 아니라 서버 응답만이 결제 성공의 기준이다.
export function PaymentResultScreen({ orderGroupId, method }: PaymentResultScreenProps) {
  const navigate = useNavigate()
  const { confirmation, recheck } = useCompletePayment(orderGroupId)
  // 결제가 끝난 주문그룹의 시도 기록은 지운다 — 남겨 두면 장바구니 배너·주문서 재진입 모드가 잘못 뜬다
  useEffect(() => {
    if (confirmation.phase === 'paid' && readOrderAttempt()?.orderGroupId === orderGroupId) {
      resetOrderAttempt()
    }
  }, [confirmation.phase, orderGroupId])
  const [retrying, setRetrying] = useState(false)
  const [retryNotice, setRetryNotice] = useState<string | null>(null)
  // 주문그룹이 만료(60009)되면 같은 그룹으로는 다시 결제할 수 없다 — 장바구니에서 새로 주문해야 한다.
  const [expired, setExpired] = useState(false)

  const goCart = () => navigate({ to: '/cart', replace: true })
  const goHome = () => navigate({ to: '/', replace: true })

  // 실패 후 재시도: prepare → 결제창 → 결제창이 닫히면 complete로 재확인(같은 수단).
  const retry = async () => {
    if (!method || retrying) return
    setRetrying(true)
    setRetryNotice(null)
    try {
      const launched = await startPayment({ orderGroupId, method })
      if (launched.outcome === 'launched') {
        await recheck()
        return
      }
      if (launched.outcome === 'failed' && launched.stage === 'prepare') {
        // 다른 탭·결제앱에서 이미 결제가 끝난 그룹 — 실패 안내 대신 complete를 다시 물어 완료 화면으로 간다.
        if (launched.errorCode === PAYMENT_ALREADY_PAID_CODE) {
          await recheck()
          return
        }
        if (launched.errorCode === PAYMENT_EXPIRED_CODE) setExpired(true)
      }
      setRetryNotice(
        launched.outcome === 'cancelled'
          ? '결제를 취소했어요. 다시 시도하거나 장바구니로 돌아갈 수 있어요'
          : launched.message,
      )
    } finally {
      setRetrying(false)
    }
  }

  if (confirmation.phase === 'checking') {
    return (
      <MobileScreen>
        <div className="flex h-full flex-col items-center justify-center gap-4 px-10 text-center">
          <Loader2 className="size-10 animate-spin text-brand" />
          <p className="text-heading font-bold text-text-primary">결제를 확인하고 있어요</p>
          <p className="text-body-sm text-text-tertiary">창을 닫지 말고 잠시만 기다려 주세요</p>
        </div>
      </MobileScreen>
    )
  }

  if (confirmation.phase === 'paid') {
    const { result } = confirmation
    // 완료 화면은 뒤로가기(←) 어포던스를 두지 않는다 — 이동은 아래 CTA로만(header 미지정).
    return (
      <MobileScreen>
        <div className="flex h-full flex-col px-6 pb-6 pt-4">
          <div className="flex flex-1 flex-col items-center justify-center gap-4">
            <ResultHero
              tone="success"
              icon={<CheckCircle2 className="size-10" />}
              title="결제가 완료되었어요"
            />
            <Card className="flex w-full flex-col gap-2 p-4">
              <div className="flex items-center justify-between gap-3 text-body-sm">
                <span className="shrink-0 text-text-tertiary">주문번호</span>
                <span className="break-all text-right tabular-nums text-text-primary">
                  {result.orderGroupId}
                </span>
              </div>
              {result.usedPoint > 0 && (
                <div className="flex items-center justify-between text-body-sm">
                  <span className="text-text-tertiary">적립금 사용</span>
                  <span className="tabular-nums text-text-primary">
                    -{formatKRW(result.usedPoint)}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between text-body-sm">
                <span className="text-text-tertiary">결제금액</span>
                <span className="text-price-sm font-semibold text-text-price">
                  {formatKRW(result.finalPaymentAmount)}
                </span>
              </div>
            </Card>
          </div>
          <div className="mt-6 flex gap-3">
            <Button variant="secondary" size="lg" className="flex-1" onClick={goHome}>
              홈으로
            </Button>
            <Button
              size="lg"
              className="flex-1"
              onClick={() => navigate({ to: '/orders', replace: true })}
            >
              주문 내역 보기
            </Button>
          </div>
        </div>
      </MobileScreen>
    )
  }

  if (confirmation.phase === 'in-progress') {
    return (
      <MobileScreen>
        <div className="flex h-full flex-col px-6 pb-6 pt-4">
          <div className="flex flex-1 flex-col items-center justify-center gap-4">
            <ResultHero
              tone="success"
              icon={<Clock className="size-10" />}
              title="결제를 확인하는 중이에요"
            >
              <p className="text-center text-body-sm text-text-tertiary">
                결제사 승인이 조금 더 걸리고 있어요. 잠시 후 다시 확인해 주세요
              </p>
            </ResultHero>
          </div>
          <div className="mt-6 flex gap-3">
            <Button variant="secondary" size="lg" className="flex-1" onClick={goHome}>
              홈으로
            </Button>
            <Button size="lg" className="flex-1" onClick={() => void recheck()}>
              다시 확인
            </Button>
          </div>
        </div>
      </MobileScreen>
    )
  }

  if (confirmation.phase === 'review-required') {
    // 금액 불일치·PG 상태 이상·만료 취소는 재시도로 풀리지 않는다 — 고객센터 안내만.
    return (
      <MobileScreen header={<BackAppBar onBack={goCart} title="결제 확인 필요" />}>
        <div className="flex h-full flex-col px-6 pb-6 pt-4">
          <div className="flex flex-1 flex-col items-center justify-center gap-4">
            <ResultHero
              tone="error"
              icon={<XCircle className="size-10" />}
              title="확인이 필요한 결제예요"
            >
              <p className="text-center text-body-sm text-text-tertiary">{confirmation.message}</p>
              <p className="text-center text-body-sm text-text-tertiary">주문번호 {orderGroupId}</p>
            </ResultHero>
          </div>
          <div className="mt-6 flex gap-3">
            <Button variant="secondary" size="lg" className="flex-1" onClick={goHome}>
              홈으로
            </Button>
            <Button
              size="lg"
              className="flex-1"
              onClick={() => navigate({ to: '/settings/inquiry', replace: true })}
            >
              고객센터 문의
            </Button>
          </div>
        </div>
      </MobileScreen>
    )
  }

  if (confirmation.phase === 'error') {
    return (
      <MobileScreen header={<BackAppBar onBack={goCart} title="결제 확인 실패" />}>
        <div className="flex h-full flex-col px-6 pb-6 pt-4">
          <div className="flex flex-1 flex-col items-center justify-center gap-4">
            <ResultHero
              tone="error"
              icon={<XCircle className="size-10" />}
              title="결제 결과를 확인하지 못했어요"
            >
              <p className="text-center text-body-sm text-text-tertiary">{confirmation.message}</p>
            </ResultHero>
          </div>
          <div className="mt-6 flex gap-3">
            <Button variant="secondary" size="lg" className="flex-1" onClick={goCart}>
              장바구니로
            </Button>
            <Button size="lg" className="flex-1" onClick={() => void recheck()}>
              다시 확인
            </Button>
          </div>
        </div>
      </MobileScreen>
    )
  }

  // FAILED / NOT_STARTED — 장바구니 라인은 서버가 PAID 때만 지우므로 그대로 남아 있다.
  const { result } = confirmation
  const reason =
    result.status === 'NOT_STARTED'
      ? '결제가 시작되지 않았어요. 다시 시도해 주세요'
      : paymentFailureMessage(result.failureCode)
  return (
    <MobileScreen header={<BackAppBar onBack={goCart} title="결제 실패" />}>
      <div className="flex h-full flex-col px-6 pb-6 pt-4">
        <div className="flex flex-1 flex-col items-center justify-center gap-4">
          <ResultHero tone="error" icon={<XCircle className="size-10" />} title="결제에 실패했어요">
            <p className="text-center text-body-sm text-text-tertiary">{retryNotice ?? reason}</p>
          </ResultHero>
        </div>
        <div className="mt-6 flex gap-3">
          <Button variant="secondary" size="lg" className="flex-1" onClick={goCart}>
            장바구니로
          </Button>
          {method && !expired && (
            <Button size="lg" className="flex-1" loading={retrying} onClick={() => void retry()}>
              다시 시도
            </Button>
          )}
        </div>
      </div>
    </MobileScreen>
  )
}
