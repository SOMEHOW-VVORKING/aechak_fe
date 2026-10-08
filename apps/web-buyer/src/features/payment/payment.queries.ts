import { useMutation } from '@tanstack/react-query'
import type { PaymentMethod } from '@aechak/domain'
import { processPayment, type PaymentResult } from './payment.mock'

// 결제 처리 mutation. 결과 화면 진입 시 한 번 mutate하고, isPending 동안 진행 스피너를,
// 이후 data.ok에 따라 완료/실패 프레임을 보여준다(processPayment는 reject하지 않고 ok=false로 실패).
export function useProcessPayment() {
  return useMutation<
    PaymentResult,
    Error,
    { amount: number; method: PaymentMethod; orderNo: string }
  >({
    mutationFn: processPayment,
  })
}
