import { axiosInstance, getApiBaseURL, setAccessToken, setOnAuthExpired } from '@aechak/api'

// 카카오 웹 로그인(서버 콜백) 어댑터 — web-seller `features/auth/auth.session.ts`를 이식했다.
// 로그인 진입은 API 호출이 아니라 페이지 이동이다: 서버가 provider 인가 화면으로 302시키고, 완료되면
// return(서버 화이트리스트와 정확 일치 — local은 http://localhost:5174/login/complete가 등재돼 있다)으로
// 브라우저를 되돌려보낸다. access는 쿼리로 오지 않으므로 복귀 라우트가 bootstrapSession(refresh)으로 수령한다.
//
// 어드민만의 두 가지:
// ① `/auth/*`는 api 모듈(8080)에만 있다. 어드민 모듈(8082)에는 아예 없으므로 로그인·refresh는 늘 api
//    호스트로 나가고, 공유 클라이언트가 `/admin` 경로만 withCredentials=false로 가른다.
// ② 로그인 자체는 역할을 보지 않는다 — 일반 회원도 토큰을 받는다. ADMIN이 아니면 그 뒤의 모든
//    `/admin/**` 호출이 403 errorCode 20011이 되므로, "로그인은 됐지만 권한이 없다"를 화면이 구분해
//    보여 줘야 한다(features/admins의 에러 매핑).

export type SocialProvider = 'kakao' | 'google' | 'apple'

/** 서버 웹 로그인(서버 콜백)이 열려 있는 provider — 구글·애플은 서버 미지원이라 버튼 비활성. */
export const WEB_LOGIN_PROVIDERS: ReadonlySet<SocialProvider> = new Set<SocialProvider>(['kakao'])

export function socialLoginRedirectUrl(provider: SocialProvider, returnUrl: string): string {
  // 기본 호스트가 아니라 api 호스트를 명시한다 — 기능 호스트 설정이 바뀌어도 로그인 진입이 흔들리지 않게.
  return `${getApiBaseURL()}/auth/login/${provider}/redirect?return=${encodeURIComponent(returnUrl)}`
}

interface WebTokenData {
  accessToken: string
  tokenType: string
  expiresIn: number
}

/**
 * 콜백 복귀 직후 access 수령(refresh-bootstrap) — 자격증명은 httpOnly 쿠키라 요청 body가 비어 있다.
 * 라우트 beforeLoad에서 호출한다(네비게이션당 1회, StrictMode 이중 마운트에 안전).
 */
export async function bootstrapSession(): Promise<void> {
  const response = await axiosInstance.post<{ data: WebTokenData }>('/auth/web/refresh')
  setAccessToken(response.data.data.accessToken)
}

/**
 * 로그인 실패 복귀(`?error=`)의 인라인 문구.
 *
 * 20006(온보딩 미완)을 셀러센터처럼 "구매자 앱에서 온보딩을 마치라"고 안내하지 않는다 — 어드민은
 * 운영자 계정이고, 온보딩 미완 계정은 애초에 ADMIN으로 승격되지 않는다(승격이 409 errorCode 30017).
 */
export function loginErrorMessage(errorCode: number): string {
  if (errorCode === 20005) return '이용이 제한된 계정이에요. 다른 관리자에게 문의해 주세요.'
  if (errorCode === 20006) return '온보딩이 끝나지 않은 계정이에요. 관리자 계정으로 다시 로그인해 주세요.'
  return '로그인에 실패했어요. 다시 시도해 주세요.'
}

/** 전역 세션 만료 핸들러가 쓰는 라우터의 최소 모양 — 라우터 제네릭을 feature로 끌어오지 않는다. */
interface SessionRouter {
  state: { location: { pathname: string } }
  navigate: (options: { to: string }) => Promise<void>
}

/**
 * 세션 만료(401 → refresh 실패) 시 로그인 화면으로 보낸다. main.tsx가 부팅에서 한 번 호출한다.
 *
 * 등록하지 않으면 공유 클라이언트의 전역 콜백이 무동작이라, 운영자는 명부가 비어 보이기만 하고
 * 왜 안 되는지 알 수 없다. 어드민이 등록하는 전역 핸들러는 이것 하나다 — `setOnOnboardingRequired`는
 * 걸지 않는다(어드민에는 온보딩 화면도 개념도 없다). 403/20006을 "전역이 알아서 처리한다"고 전제한
 * 주석을 셀러센터·구매자 앱에서 복사해 오지 말 것.
 */
export function setupAuthExpiredRedirect(router: SessionRouter): void {
  // 동시 다발 401이 네비게이션을 중복 발화하지 않게 가드하고, 이미 로그인 플로우 안이면 손대지 않는다.
  let redirecting = false
  setOnAuthExpired(() => {
    const path = router.state.location.pathname
    if (redirecting || path.startsWith('/login')) return
    redirecting = true
    void router.navigate({ to: '/login' }).finally(() => {
      redirecting = false
    })
  })
}
