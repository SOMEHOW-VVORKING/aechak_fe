// BE에 이메일/비밀번호 로그인(`POST /auth/login`)이 없어 그 호출(useLogin)은 지웠다 — 어드민 실로그인은
// 카카오 웹 로그인 + ADMIN 역할 부여가 BE에 생긴 뒤 web-seller `routes/login/*`을 이식해 붙인다.
export { LoginForm } from './components/LoginForm'
export { useAuthStore } from './auth.store'
