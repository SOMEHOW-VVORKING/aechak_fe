import { useQuery } from '@tanstack/react-query'
import { getPointBalance } from '@aechak/api'

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
    balance: query.data?.data?.balance,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  }
}

// 에러 문구는 HTTP status로 고르고, 같은 status에 여러 사유가 있으면 errorCode까지 본다.
// axios 타입을 안 끌어오려고 duck-typing.
export function pointsErrorMessage(error: unknown): string {
  const status = (error as { response?: { status?: number } })?.response?.status
  const data = (error as { response?: { data?: { message?: string; errorCode?: number } } })?.response
    ?.data
  const serverMessage = data?.message
  switch (status) {
    // 403은 온보딩 미완료(20006)와 일반 접근 불가가 섞여 있어 errorCode까지 봐야 오안내를 막는다.
    // TODO(후속 PR): 20006 전역 처리기는 아직 미배선이다. 온보딩 미완료 유저가 /mypage·/checkout에
    // 딥링크로 진입하면 잔액 조회가 20006으로 실패하지만 온보딩 화면으로 튕기지 않는다(허브 '—'·주문서 0).
    // client.ts에 setOnAuthExpired와 같은 전역 콜백을 붙이기 전까지는 여기서 안내 문구로만 신호한다.
    case 403:
      return data?.errorCode === ONBOARDING_REQUIRED
        ? '온보딩을 먼저 완료해야 적립금을 확인할 수 있어요'
        : (serverMessage ?? '적립금을 확인할 권한이 없어요')
    case 404:
      return '적립금 정보를 찾을 수 없어요'
    default:
      return serverMessage ?? '적립금을 불러오지 못했어요. 잠시 후 다시 시도해주세요'
  }
}
