import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createMemoryHistory, createRouter } from '@tanstack/react-router'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it, onTestFinished } from 'vitest'
import { getAccessToken, setAccessToken } from '@aechak/api'
import { ADMIN_ORIGIN, WEB_REFRESH_URL, server } from '@/testing/msw/server'
import { routeTree } from '../../../routeTree.gen'

// 새로고침 직후 세션 복원(SCRUM-377). 메모리 access가 비어 있는 채로 화면이 뜨면 첫 `/admin/**`
// 요청이 토큰 없이 나가 401을 받고, 그 사이 대시보드가 실패 표기로 그려졌다.
function renderAt(path: string) {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
  })
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return router
}

function recordAdminRequests() {
  const seen: { path: string; auth: string | null }[] = []
  const record = ({ request }: { request: Request }) => {
    if (request.url.startsWith(ADMIN_ORIGIN)) {
      seen.push({ path: new URL(request.url).pathname, auth: request.headers.get('Authorization') })
    }
  }
  server.events.on('request:start', record)
  onTestFinished(() => server.events.removeListener('request:start', record))
  return seen
}

afterEach(() => setAccessToken(null))

describe('어드민 __root 세션 복원', () => {
  it('[AC-ADM-SESSION-001] 토큰이 없으면 화면보다 먼저 refresh해 첫 /admin 요청부터 토큰을 싣는다', async () => {
    let refreshCalls = 0
    server.use(
      http.post(WEB_REFRESH_URL, () => {
        refreshCalls += 1
        return HttpResponse.json({ data: { accessToken: 'restored', tokenType: 'Bearer', expiresIn: 1800 } })
      }),
    )
    const seen = recordAdminRequests()
    renderAt('/audit-log')

    expect(await screen.findByRole('heading', { name: '어드민 액션 로그' })).toBeInTheDocument()
    expect(refreshCalls).toBe(1)
    expect(getAccessToken()).toBe('restored')
    expect(seen.length).toBeGreaterThan(0)
    expect(seen.every(r => r.auth === 'Bearer restored')).toBe(true)
  })

  it('[AC-ADM-SESSION-002] 이미 토큰이 있으면 refresh를 다시 보내지 않는다', async () => {
    setAccessToken('in-memory')
    let refreshCalls = 0
    server.use(
      http.post(WEB_REFRESH_URL, () => {
        refreshCalls += 1
        return HttpResponse.json({ data: { accessToken: 'other', tokenType: 'Bearer', expiresIn: 1800 } })
      }),
    )
    renderAt('/audit-log')

    expect(await screen.findByRole('heading', { name: '어드민 액션 로그' })).toBeInTheDocument()
    expect(refreshCalls).toBe(0)
    expect(getAccessToken()).toBe('in-memory')
  })
})
