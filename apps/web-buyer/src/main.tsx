import React from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { bootstrapApiHosts, setOnAuthExpired, setOnOnboardingRequired } from '@aechak/api'
import { applyCssVariables } from '@aechak/design-system/web'
import { logout } from '@/shared/auth'
import { onWishlistLogout } from '@/shared/catalog'
import { resetReviews } from '@/shared/review'
import { resetCartSelection } from '@/shared/cart'
import { resetOrderAttempt } from '@/shared/order'
import { routeTree } from './routeTree.gen'
import './index.css'

applyCssVariables()
// 경로 접두(/api/v1)는 origin(env)과 분리된 서버 계약이라 configureApiHosts가 붙인다 —
// client.ts의 401 refresh가 상대경로(/auth/web/refresh)를 쓰므로 접두가 빠지면 엉뚱한 경로로 나간다.
// 구매자 앱은 api 모듈만 부르므로 기능 호스트(seller·admin)는 넘기지 않는다.
//
// 로컬 기본값은 **개발 빌드에서만** 쓴다. 운영 빌드에 변수가 주입되지 않으면 bootstrapApiHosts가
// 부팅을 멈추고 무엇이 비었는지 화면·콘솔에 밝힌다 — 이전에는 `?? 'http://localhost:8080'`으로
// 조용히 되돌아가 배포된 앱이 사용자 PC를 호출했다(SCRUM-272).
bootstrapApiHosts({
  app: 'web-buyer',
  isProd: import.meta.env.PROD,
  api: {
    name: 'VITE_API_BASE_URL',
    value: import.meta.env['VITE_API_BASE_URL'],
    devFallback: 'http://localhost:8080',
  },
})

const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60,
      retry: 1,
    },
  },
})

// 실 세션 만료(401 → refresh 실패)를 전역 한 곳에서 처리한다: 클라이언트 로그인 플래그를
// 내리고 로그인 화면으로 보낸다. 각 화면이 401을 인라인 에러로 떠안는 대신 여기서 튕긴다.
// 이미 로그인/온보딩 경로거나 이동 중이면 중복 이동하지 않는다(리다이렉트 루프 방지).
let redirectingToLogin = false
setOnAuthExpired(() => {
  const path = router.state.location.pathname
  if (redirectingToLogin || path.startsWith('/onboarding') || path.startsWith('/login')) return
  redirectingToLogin = true
  logout()
  onWishlistLogout(queryClient) // 세션 만료 시 찜 미러/진행중 동기화/쿼리 캐시를 원자적으로 정리
  resetReviews() // 내가 쓴 리뷰는 클라이언트 스토어라 쿼리 캐시 정리로는 안 지워진다(설정 로그아웃과 동일)
  resetCartSelection() // 장바구니 선택 해제 집합과 주문 시도(멱등키·주문그룹)는 계정 단위 — 다음 계정에 넘기지 않는다
  resetOrderAttempt()
  // 계정 단위 서버 캐시(내 리뷰/내 정보/적립금 등)도 설정 로그아웃과 같이 전부 비운다. 남겨 두면
  // 로그인 화면에서 뒤로 가거나 다른 계정으로 로그인했을 때 staleTime 안에서는 이전 계정 데이터가 보인다.
  queryClient.clear()
  void router.navigate({ to: '/onboarding/login' }).finally(() => {
    redirectingToLogin = false
  })
})

// PENDING(온보딩 미완) 계정이 화이트리스트 밖 경로를 부르면 서버가 403/20006을 준다 —
// 어느 화면에서 부딪히든 전역으로 온보딩 약관 화면으로 유도한다. 이미 온보딩 경로면 이동하지
// 않는다(리다이렉트 루프 방지 — 위 로그인 가드와 동일 결).
setOnOnboardingRequired(() => {
  const path = router.state.location.pathname
  if (path.startsWith('/onboarding')) return
  void router.navigate({ to: '/onboarding/terms' })
})

const rootEl = document.getElementById('root')
if (!rootEl) throw new Error('#root element not found')

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  </React.StrictMode>,
)
