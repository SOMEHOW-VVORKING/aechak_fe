import { useMutation, useQuery } from '@tanstack/react-query'
import {
  axiosInstance,
  checkNickname,
  errorResponse,
  getTerms,
  setAccessToken,
  setNickname as putNickname,
  submitConsents,
  type TermItem,
  type UserMe,
} from '@aechak/api'

// 온보딩 2단계(약관 동의 → 닉네임 설정)를 실서버에 붙이는 얇은 어댑터.
// 활성 약관·필수 동의 불변식·닉네임 형식/중복/전이는 전부 서버 소유다. 생성된 react-query 훅이 아니라
// fetcher만 소비하고, 이 파일이 자체 useQuery/useMutation으로 감싼다(pet.queries.ts와 동일 이유).

export type SocialProvider = 'kakao'

/** 서버 웹 로그인(서버 콜백)이 열려 있는 provider — 로그인 수단은 카카오 하나다. */
export const WEB_LOGIN_PROVIDERS: ReadonlySet<SocialProvider> = new Set<SocialProvider>(['kakao'])

/**
 * 로그인 진입은 API 호출이 아니라 페이지 이동이다 — 서버가 provider 인가 화면으로 302시키고,
 * 완료되면 return(서버 화이트리스트와 정확 일치)으로 브라우저를 되돌려보낸다.
 */
export function socialLoginRedirectUrl(provider: SocialProvider, returnUrl: string): string {
  return `${axiosInstance.defaults.baseURL}/auth/login/${provider}/redirect?return=${encodeURIComponent(returnUrl)}`
}

interface WebTokenData {
  accessToken: string
  tokenType: string
  expiresIn: number
}

/**
 * 콜백 복귀 직후 access 수령(refresh-bootstrap) — 자격증명은 httpOnly 쿠키라 요청 body가 비어 있다.
 * access는 응답 body로만 오고 refresh는 다시 Set-Cookie로 회전된다.
 * 라우트 beforeLoad에서 호출한다 — 컴포넌트 이펙트에서 1회성으로 쏘면
 * StrictMode의 폐기되는 첫 마운트에 걸려 결과 통지가 유실될 수 있다.
 */
export async function bootstrapSession(): Promise<void> {
  const response = await axiosInstance.post<{ data: WebTokenData }>('/auth/web/refresh')
  setAccessToken(response.data.data.accessToken)
}

// ── 약관 ────────────────────────────────────────────────────────────────────

const TERMS_QUERY_KEY = ['onboarding', 'terms'] as const

// 서버 DTO를 화면이 소비하는 도메인 모양으로 옮긴다(필드는 동일하지만 화면을 @aechak/api에
// 직접 묶지 않으려고 한 겹 둔다). 화면은 termId·isRequired·title만 쓴다.
export interface OnboardingTerm {
  termId: number
  type: string
  isRequired: boolean
  version: string
  title: string
  body: string
  effectiveAt: string
}

export function toOnboardingTerm(res: TermItem): OnboardingTerm {
  return {
    termId: res.termId,
    type: res.type,
    isRequired: res.isRequired,
    version: res.version,
    title: res.title,
    body: res.body,
    effectiveAt: res.effectiveAt,
  }
}

export function useTerms() {
  const query = useQuery({
    queryKey: TERMS_QUERY_KEY,
    queryFn: ({ signal }) => getTerms(signal),
  })
  const terms = (query.data?.data ?? []).map(toOnboardingTerm)
  return {
    terms,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  }
}

// ── 동의 제출 ────────────────────────────────────────────────────────────────

export interface ConsentInput {
  termId: number
  isAgreed: boolean
}

interface MutateOptions<T = void> {
  onSuccess?: (result: T) => void
  onError?: (error: unknown) => void
}

export function useSubmitConsents() {
  const mutation = useMutation({
    mutationFn: (items: ConsentInput[]) => submitConsents({ items }),
  })
  return {
    isPending: mutation.isPending,
    mutate: (items: ConsentInput[], opts?: MutateOptions) =>
      mutation.mutate(items, { onSuccess: () => opts?.onSuccess?.(), onError: opts?.onError }),
  }
}

// ── 닉네임 ──────────────────────────────────────────────────────────────────

/** Input maxLength와 글자수 카운터(기획 4/12)용. 형식 규칙 자체는 서버가 판정한다(30002). */
export const NICKNAME_MAX_LENGTH = 12

// 중복 확인은 UX 보조일 뿐이다. 형식(NFC 정규화 후 완성형 한글·영문·숫자 2~12자)은 GET /users/nickname/check와
// PUT 양쪽이 30002로 거절하므로 클라이언트는 빈 값만 거르고 응답(가용 여부·30002)을 그대로 보여준다.
// 최종 판정은 PUT nickname의 30001이 한다.
export const useNicknameAvailability = (nickname: string) =>
  useQuery({
    queryKey: ['onboarding', 'nickname-availability', nickname],
    queryFn: ({ signal }) => checkNickname({ nickname }, signal),
    enabled: nickname !== '',
    select: response => response.data.available,
    staleTime: 0,
    retry: false,
  })

export function useSetNickname() {
  const mutation = useMutation({
    mutationFn: (nickname: string) => putNickname({ nickname }),
  })
  return {
    isPending: mutation.isPending,
    mutate: (nickname: string, opts?: MutateOptions<UserMe>) =>
      mutation.mutate(nickname, {
        onSuccess: response => opts?.onSuccess?.(response.data),
        onError: opts?.onError,
      }),
  }
}

// ── 에러 문구 ────────────────────────────────────────────────────────────────

// 온보딩 에러는 errorCode로 분기한다(같은 status에 여러 사유가 섞임). 네비게이션이 필요한
// 30300(약관)·30004(완료)는 화면이 errorCode를 보고 직접 이동하고, 인라인 문구는 이 헬퍼가 준다.
// 서버 message는 -습니다체라 그대로 쓰지 않는다.
export function onboardingErrorMessage(error: unknown): string {
  switch (errorResponse(error)?.data?.errorCode) {
    case 30001:
      return '이미 사용 중인 닉네임이에요'
    case 30002:
      return '2~12자의 한글, 영문, 숫자로 입력해 주세요'
    case 30004:
      return '이미 가입이 완료된 계정이에요'
    case 30300:
      return '필수 약관에 모두 동의해 주세요'
    case 30400:
      return '약관 정보가 변경되었어요. 다시 확인해 주세요'
    default:
      return '요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요'
  }
}
