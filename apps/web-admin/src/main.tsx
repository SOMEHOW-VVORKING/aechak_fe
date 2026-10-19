import React from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { bootstrapApiHosts } from '@aechak/api'
import { applyCssVariables } from '@aechak/design-system/web'
import { setupAuthExpiredRedirect } from '@/features/auth'
import { routeTree } from './routeTree.gen'
import './index.css'

applyCssVariables()
// 어드민 콘솔도 두 호스트를 부른다 — 로그인·refresh는 api 모듈(8080), 심사·명부 업무는 admin
// 모듈이다(어드민 모듈에는 `/auth/*`가 아예 없다). 접두(/api/v1)는 configureApiHosts가 붙인다.
// 로컬 admin 포트는 seller와 8081이 겹쳐 BE 쪽에서 8082로 옮겼다.
//
// 로컬 기본값은 개발 빌드에서만 쓴다. 운영 빌드에 변수가 주입되지 않으면 bootstrapApiHosts가
// 부팅을 멈추고 무엇이 비었는지 밝힌다 — 이전에는 조용히 localhost:8082로 되돌아가 배포된
// 어드민이 사용자 PC를 호출했다(SCRUM-272).
bootstrapApiHosts({
  app: 'web-admin',
  isProd: import.meta.env.PROD,
  api: {
    name: 'VITE_API_BASE_URL',
    value: import.meta.env['VITE_API_BASE_URL'],
    devFallback: 'http://localhost:8080',
  },
  admin: {
    name: 'VITE_ADMIN_API_BASE_URL',
    value: import.meta.env['VITE_ADMIN_API_BASE_URL'],
    devFallback: 'http://localhost:8082',
  },
})

const router = createRouter({ routeTree })

// 세션 만료(401 → refresh 실패) 시 로그인 화면으로 보낸다. 배선 자체는 features/auth가 들고 있어
// 테스트가 같은 함수를 부를 수 있다(등록을 빠뜨리면 명부가 그냥 비어 보이기만 한다).
setupAuthExpiredRedirect(router)

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
