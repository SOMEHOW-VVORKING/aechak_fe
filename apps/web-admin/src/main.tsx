import React from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { configureApiHosts } from '@aechak/api'
import { applyCssVariables } from '@aechak/design-system/web'
import { routeTree } from './routeTree.gen'
import './index.css'

applyCssVariables()
// 어드민 콘솔도 두 호스트를 부른다 — 로그인·refresh는 api 모듈(8080), 심사 업무는 admin 모듈이다.
// 접두(/api/v1)가 빠져 있던 것을 여기서 함께 바로잡는다(빠지면 refresh가 엉뚱한 경로로 나간다).
// 로컬 admin 포트는 seller와 8081이 겹쳐 BE 쪽에서 8082로 옮기기로 했다.
configureApiHosts({
  apiOrigin: import.meta.env['VITE_API_BASE_URL'] ?? 'http://localhost:8080',
  adminOrigin: import.meta.env['VITE_ADMIN_API_BASE_URL'] ?? 'http://localhost:8082',
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
