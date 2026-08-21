import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getMe, updateProfile, type UpdateProfileRequest, type UserMe } from '@aechak/api'
import type { BuyerAccount } from '@aechak/domain'

// 마이 허브 프로필 카드·프로필 수정 화면을 실제 백엔드(GET /users/me · PUT /users/me/profile)에 붙이는 얇은 어댑터.
// 프로필 표시·수정 데이터의 단일 소스는 react-query 캐시다(목업 스토어 대신). 저장 성공 시 캐시 invalidate로 다시 읽는다.
//
// 생성된 react-query 훅이 아니라 fetcher만 소비한다. packages/api와 앱의 react-query 선언 범위가
// 달라 훅/옵션 타입이 패키지 경계를 넘으면 버전 표류 시 깨진다. 이 파일이 자체 useQuery/useMutation으로 감싼다.

export const ACCOUNT_QUERY_KEY = ['account', 'me'] as const

// 서버 에러코드(be-api-surface §에러코드 인덱스 — SCRUM-167 재배정 후).
const INVALID_NICKNAME = 30002
const DUPLICATE_NICKNAME = 30001
const CONCURRENT_MODIFICATION = 90003
const ONBOARDING_REQUIRED = 20006

// 서버 DTO(UserMe) → 도메인 타입(BuyerAccount) 매퍼. PENDING이면 프로필 계열이 전부 null이라
// 화면 친화 기본값(빈 문자열/미노출)으로 안전 변환한다. profileImageKey는 유지 회신용으로 그대로 보관한다.
// status는 문구로 버리지 않고 isPendingOnboarding으로 실어, 허브가 PENDING 유저를 온보딩으로 보낼 수 있게 한다.
export function toBuyerAccount(res: UserMe): BuyerAccount {
  return {
    nickname: res.nickname ?? '',
    bio: res.bio ?? '',
    email: res.email ?? '',
    phone: res.phoneNumber ?? '',
    avatarUrl: res.profileImageUrl ?? undefined,
    profileImageKey: res.profileImageKey ?? undefined,
    isPendingOnboarding: res.status === 'PENDING_ONBOARDING',
    verification: res.isPhoneVerified ? 'verified' : 'unverified',
  }
}

// 403/20006(ONBOARDING_REQUIRED) 여부. PENDING 유저가 ACTIVE 전용 경로(프로필 수정 PUT 등)를
// 부르면 온다 — 인라인 문구로 막다른 길을 만들지 말고 온보딩 약관 화면으로 보내야 한다.
export function isOnboardingRequired(error: unknown): boolean {
  const response = (error as { response?: { status?: number; data?: { errorCode?: number } } })
    ?.response
  return response?.status === 403 && response?.data?.errorCode === ONBOARDING_REQUIRED
}

/** 내 정보 조회. 프로필 카드·수정 화면의 초기값 소스. */
export function useMe() {
  const query = useQuery({
    queryKey: ACCOUNT_QUERY_KEY,
    queryFn: ({ signal }) => getMe(signal),
  })
  const account = query.data ? toBuyerAccount(query.data.data) : undefined
  return {
    account,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  }
}

interface MutateOptions {
  onSuccess?: () => void
  onError?: (error: unknown) => void
}

/**
 * 프로필 수정(전체 교체 PUT). 성공 시 내 정보를 다시 읽어 허브 카드까지 갱신한다.
 * invalidate promise를 반환해 refetch가 끝날 때까지 isPending을 유지한다(낙관적 업데이트 안 함).
 */
export function useUpdateProfile() {
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: (body: UpdateProfileRequest) => updateProfile(body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ACCOUNT_QUERY_KEY }),
  })
  return {
    isPending: mutation.isPending,
    mutate: (body: UpdateProfileRequest, opts?: MutateOptions) => mutation.mutate(body, opts),
  }
}

// 에러 문구는 HTTP status로 고르고, 같은 status에 여러 사유가 있으면 errorCode까지 본다.
// axios 타입을 안 끌어오려고 duck-typing.
export function accountErrorMessage(error: unknown): string {
  const status = (error as { response?: { status?: number } })?.response?.status
  const data = (error as { response?: { data?: { message?: string; errorCode?: number } } })?.response
    ?.data
  const serverMessage = data?.message
  switch (status) {
    case 400:
      return data?.errorCode === INVALID_NICKNAME
        ? '닉네임은 완성형 한글·영문·숫자 2~12자로 입력해 주세요'
        : (serverMessage ?? '입력한 정보를 다시 확인해주세요')
    case 403:
      return data?.errorCode === ONBOARDING_REQUIRED
        ? '온보딩을 먼저 완료해 주세요'
        : (serverMessage ?? '접근 권한이 없어요')
    case 409:
      if (data?.errorCode === DUPLICATE_NICKNAME) return '이미 사용 중인 닉네임이에요'
      if (data?.errorCode === CONCURRENT_MODIFICATION)
        return '다른 곳에서 먼저 수정했어요. 새로고침 후 다시 시도해주세요'
      return serverMessage ?? '요청을 처리하지 못했어요. 잠시 후 다시 시도해주세요'
    default:
      return serverMessage ?? '요청을 처리하지 못했어요. 잠시 후 다시 시도해주세요'
  }
}
