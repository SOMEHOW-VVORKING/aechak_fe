// 어드민 실로그인(카카오 웹 로그인 + /auth/web/refresh 부트스트랩). BE에 이메일/비밀번호 로그인
// (`POST /auth/login`)이 없어 그 폼과 호출은 제거됐고, 세션 상태는 zustand가 아니라 공유 클라이언트
// (packages/api client.ts)의 메모리 access + refresh 쿠키가 들고 있다 — API 응답을 전역 스토어에
// 복제하지 않는다는 규약(AGENTS 1-4)과 같은 결이다.
export { LoginForm } from './components/LoginForm'
export { LogoutButton } from './components/LogoutButton'
export {
  WEB_LOGIN_PROVIDERS,
  bootstrapSession,
  endServerSession,
  loginErrorMessage,
  setupAuthExpiredRedirect,
  socialLoginRedirectUrl,
} from './auth.session'
export type { SocialProvider } from './auth.session'
export { useLogout } from './auth.queries'
