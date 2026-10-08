import { useQuery } from '@tanstack/react-query'
import { errorResponse, getPointBalance } from '@aechak/api'

// 적립금 잔액(GET /users/me/points) 조회 어댑터. 잔액은 서버가 소유하는 단일 정수(원 단위, ≥0)라
// 도메인 타입 없이 number로 다룬다. 내역·적립/차감 EP는 없다 — 이 계층은 잔액 조회만 한다.
//
// 생성된 react-query 훅이 아니라 fetcher만 소비한다(pet.queries.ts와 동일 이유 — packages/api와 앱의
// react-query 선언 범위가 달라 훅/옵션 타입이 패키지 경계를 넘으면 버전 표류 시 깨진다).

export const POINTS_QUERY_KEY = ['points', 'balance'] as const

// PENDING(온보딩 미완료) 계정이 ACTIVE 전용 경로를 부르면 서버가 403으로 내려주는 코드.
const ONBOARDING_REQUIRED = 20006

// 로딩·조회 실패 시 balance는 undefined다. 소비 측이 각자의 폴백을 고른다(허브는 '—', 주문서는 0).
export function usePointBalance() {
  const query = useQuery({
    queryKey: POINTS_QUERY_KEY,
    queryFn: ({ signal }) => getPointBalance(signal),
  })
  return {
    balance: query.data?.data.balance,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  }
}

// 에러 문구는 HTTP status로 고르고, 같은 status에 여러 사유가 있으면 errorCode까지 본다.
// 서버 message는 -습니다체라 그대로 쓰지 않는다.
export function pointsErrorMessage(error: unknown): string {
  const res = errorResponse(error)
  switch (res?.status) {
    // 403은 온보딩 미완료(20006)와 일반 접근 불가가 섞여 있어 errorCode까지 봐야 오안내를 막는다.
    // 20006 자체는 packages/api `client.ts` 응답 인터셉터의 setOnOnboardingRequired가 전역으로
    // 온보딩 화면(web-buyer `main.tsx`가 붙인 /onboarding/terms 이동)으로 보낸다. 그래도 promise는
    // 그대로 reject되므로 이동 전 프레임에 쓸 문구가 여기 필요하다.
    case 403:
      return res.data?.errorCode === ONBOARDING_REQUIRED
        ? '온보딩을 먼저 완료해야 적립금을 확인할 수 있어요'
        : '적립금을 확인할 권한이 없어요'
    case 404:
      return '적립금 정보를 찾을 수 없어요'
    default:
      return '적립금을 불러오지 못했어요. 잠시 후 다시 시도해주세요'
  }
}
