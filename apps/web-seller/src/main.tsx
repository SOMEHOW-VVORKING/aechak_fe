import React from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { configureApiHosts, setOnAuthExpired } from '@aechak/api'
import { applyCssVariables } from '@aechak/design-system/web'
import { routeTree } from './routeTree.gen'
import './index.css'

applyCssVariables()
// 셀러센터는 두 호스트를 부른다 — 로그인·refresh·presigned 발급은 api 모듈(8080), 입점 신청과
// 상품은 seller 모듈(8081)이다. 경로 접두(/api/v1)는 origin과 분리된 서버 계약이라
// configureApiHosts가 붙이고, 요청별 호스트 선택도 그 안의 인터셉터가 경로 접두로 가른다.
configureApiHosts({
  apiOrigin: import.meta.env['VITE_API_BASE_URL'] ?? 'http://localhost:8080',
  sellerOrigin: import.meta.env['VITE_SELLER_API_BASE_URL'] ?? 'http://localhost:8081',
})

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
