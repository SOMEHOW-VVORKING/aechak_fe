import { axiosInstance, getApiBaseURL, setAccessToken } from '@aechak/api'

// 카카오 웹 로그인(서버 콜백) 어댑터 — web-buyer onboarding.queries의 세션 파트를 이식했다.
// 로그인 진입은 API 호출이 아니라 페이지 이동이다: 서버가 provider 인가 화면으로 302시키고,
// 완료되면 return(서버 화이트리스트와 정확 일치 — local은 http://localhost:5173/login/complete
// 등재됨)으로 브라우저를 되돌려보낸다. access는 쿼리로 오지 않으므로 복귀 라우트가
// bootstrapSession(refresh)으로 수령한다.

export type SocialProvider = 'kakao' | 'google' | 'apple'

/** 서버 웹 로그인(서버 콜백)이 열려 있는 provider — 구글·애플은 서버 미지원이라 버튼 비활성. */
export const WEB_LOGIN_PROVIDERS: ReadonlySet<SocialProvider> = new Set<SocialProvider>(['kakao'])

export function socialLoginRedirectUrl(provider: SocialProvider, returnUrl: string): string {
  // 웹 로그인 리다이렉트는 api 모듈만 노출한다(seller 모듈에는 /auth/* 가 없다) — 기본 호스트가
  // 아니라 api 호스트를 명시해 기능 호스트 설정이 바뀌어도 로그인 진입이 흔들리지 않게 한다.
  return `${getApiBaseURL()}/auth/login/${provider}/redirect?return=${encodeURIComponent(returnUrl)}`
}

interface WebTokenData {
  accessToken: string
  tokenType: string
  expiresIn: number
}

/**
 * 콜백 복귀 직후 access 수령(refresh-bootstrap) — 자격증명은 httpOnly 쿠키라 요청 body가 비어 있다.
 * 라우트 beforeLoad에서 호출한다(StrictMode 이중 마운트에 안전 — web-buyer /login/complete 관례).
 */
export async function bootstrapSession(): Promise<void> {
  const response = await axiosInstance.post<{ data: WebTokenData }>('/auth/web/refresh')
  setAccessToken(response.data.data.accessToken)
}

// 로그인 실패 복귀(?error=)의 인라인 문구. 20006은 판매자 센터에 온보딩 화면이 없어서
// 구매자 앱에서 온보딩을 마쳐야 한다는 안내로 특정한다.
export function loginErrorMessage(errorCode: number): string {
  if (errorCode === 20006) return '구매자 앱에서 온보딩(약관/닉네임)을 완료한 뒤 이용할 수 있어요.'
  return '로그인에 실패했어요. 다시 시도해 주세요.'
}
