import React from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { API_PATH_PREFIX, axiosInstance, setOnAuthExpired, setOnOnboardingRequired } from '@aechak/api'
import { applyCssVariables } from '@aechak/design-system/web'
import { logout } from '@/shared/auth'
import { onWishlistLogout } from '@/shared/catalog'
import { routeTree } from './routeTree.gen'
import './index.css'

applyCssVariables()
axiosInstance.defaults.baseURL = `${import.meta.env['VITE_API_BASE_URL'] ?? 'http://localhost:8080'}${API_PATH_PREFIX}`

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
