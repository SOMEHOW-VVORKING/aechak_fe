import React from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { API_PATH_PREFIX, axiosInstance, setOnAuthExpired } from '@aechak/api'
import { applyCssVariables } from '@aechak/design-system/web'
import { routeTree } from './routeTree.gen'
import './index.css'

applyCssVariables()
// 서버 경로 접두(/api/v1)는 origin(env)과 분리된 서버 계약이다 — client.ts의 401 refresh가
// 상대경로(/auth/web/refresh)를 쓰므로 접두가 빠지면 refresh가 엉뚱한 경로로 나간다(web-buyer 관례).
axiosInstance.defaults.baseURL = `${import.meta.env['VITE_API_BASE_URL'] ?? 'http://localhost:8080'}${API_PATH_PREFIX}`

const router = createRouter({ routeTree })

// 세션 만료(401 → refresh 실패) 시 로그인 화면으로 보낸다. 동시 다발 401이 네비게이션을
// 중복 발화하지 않게 가드하고, 이미 로그인 플로우 안이면 손대지 않는다(web-buyer 관례).
let redirectingToLogin = false
setOnAuthExpired(() => {
  const path = router.state.location.pathname
  if (redirectingToLogin || path.startsWith('/login')) return
  redirectingToLogin = true
  void router.navigate({ to: '/login' }).finally(() => {
    redirectingToLogin = false
  })
})

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
