// 어드민 실로그인. 진입이 둘이다 — 카카오 웹 로그인(서버 콜백 + /auth/web/refresh 부트스트랩)과
// 아이디·비밀번호(`POST /auth/login/password`, SCRUM-373). 비밀번호 채널은 카카오 계정이 없는
// 사람에게 계정을 넘겨야 해서 더했고 카카오를 대체하지 않는다.
// 세션 상태는 zustand가 아니라 공유 클라이언트(packages/api client.ts)의 메모리 access + refresh
// 쿠키가 들고 있다 — API 응답을 전역 스토어에 복제하지 않는다는 규약(AGENTS 1-4)과 같은 결이다.
export { LoginForm } from './components/LoginForm'
export { LogoutButton } from './components/LogoutButton'
export {
  WEB_LOGIN_PROVIDERS,
  bootstrapSession,
  endServerSession,
  loginErrorMessage,
  loginWithPassword,
  setupAuthExpiredRedirect,
  socialLoginRedirectUrl,
} from './auth.session'
export type { SocialProvider } from './auth.session'
export { useLogout, usePasswordLogin } from './auth.queries'
