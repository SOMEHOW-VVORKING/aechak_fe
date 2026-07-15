import { useQuery } from '@tanstack/react-query'
import { axiosInstance, setAccessToken } from '@aechak/api'
import { mockCheckNicknameAvailable } from './onboarding.mock'

export type SocialProvider = 'kakao' | 'google' | 'apple'

/** 서버 웹 로그인(서버 콜백)이 열려 있는 provider — 구글·애플은 서버 미지원이라 버튼 비활성. */
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

export const NICKNAME_MIN_LENGTH = 2

export const useNicknameAvailability = (nickname: string) =>
  useQuery({
    queryKey: ['onboarding', 'nickname-availability', nickname],
    queryFn: () => mockCheckNicknameAvailable(nickname),
    enabled: nickname.length >= NICKNAME_MIN_LENGTH,
    staleTime: 0,
    retry: false,
  })
