import { describe, expect, it, vi } from 'vitest'
import type * as ReactQuery from '@tanstack/react-query'
import type * as AechakApi from '@aechak/api'

// main.tsx의 세션 만료 핸들러(setOnAuthExpired)를 직접 검증한다. 앱을 실제로 렌더하지 않도록
// createRoot는 no-op으로 두고, main이 만든 QueryClient와 등록한 만료 핸들러만 붙잡는다.
const captured = vi.hoisted(() => ({
  clients: [] as ReactQuery.QueryClient[],
  onExpired: null as (() => void) | null,
}))

vi.mock('react-dom/client', () => ({
  default: { createRoot: () => ({ render: () => {} }) },
}))

vi.mock('@tanstack/react-query', async importOriginal => {
  const actual = await importOriginal<typeof ReactQuery>()
  class CapturingQueryClient extends actual.QueryClient {
    constructor(...args: ConstructorParameters<typeof actual.QueryClient>) {
      super(...args)
      captured.clients.push(this)
    }
  }
  return { ...actual, QueryClient: CapturingQueryClient }
})

vi.mock('@aechak/api', async importOriginal => {
  const actual = await importOriginal<typeof AechakApi>()
  return {
    ...actual,
    setOnAuthExpired: (handler: (() => void) | null) => {
      captured.onExpired = handler
    },
  }
})

describe('세션 만료 정리(main.tsx)', () => {
  it('[AC-MY-REVIEW-009] 세션이 만료되면 계정 단위 쿼리 캐시(내 리뷰 등)를 비운다', async () => {
    document.body.innerHTML = '<div id="root"></div>'
    await import('../main')
    const queryClient = captured.clients[0]!
    queryClient.setQueryData(['reviews', 'mine', 'written'], { pages: [], pageParams: [] })
    queryClient.setQueryData(['reviews', 'mine', 'unreviewed'], { pages: [], pageParams: [] })

    captured.onExpired?.()

    expect(queryClient.getQueryData(['reviews', 'mine', 'written'])).toBeUndefined()
    expect(queryClient.getQueryData(['reviews', 'mine', 'unreviewed'])).toBeUndefined()
  })
})
