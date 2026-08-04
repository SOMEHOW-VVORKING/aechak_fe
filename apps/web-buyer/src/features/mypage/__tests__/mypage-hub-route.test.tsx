import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter, createMemoryHistory } from '@tanstack/react-router'
import { describe, it, expect, beforeEach } from 'vitest'
import { http, HttpResponse } from 'msw'
import { resetAccount, verifyPhone } from '@/shared/account'
import { POINTS_URL, seedPointBalance, server } from '../../../testing/msw/server'
import { routeTree } from '../../../routeTree.gen'

function renderAt(path: string) {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
  })
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

describe('/mypage 프로필 요약 카드 인증 배지', () => {
  beforeEach(() => {
    resetAccount()
  })

  it('[AC-MYPAGE-HUB-001] 인증 완료 시 프로필 카드엔 본인인증 배지가 없고 메뉴 행엔 인증완료가 남는다', async () => {
    verifyPhone('010-1234-5678')
    renderAt('/mypage')

    // '본인 인증' 메뉴 행 진입점/인증완료 표시는 그대로 유지(단일 표시처).
    expect(await screen.findByText('본인 인증')).toBeInTheDocument()
    expect(screen.getByText('인증완료')).toBeInTheDocument()
    // 프로필 요약 카드의 중복 본인인증 배지는 제거됐다.
    expect(screen.queryByText('본인인증')).not.toBeInTheDocument()
  })

  it('[AC-MYPAGE-HUB-002] 미인증이면 프로필 카드·메뉴 행에 미인증 배지가 모두 남는다', async () => {
    renderAt('/mypage')

    // 프로필 카드 배지 + 메뉴 행 pill 두 곳 모두 미인증 유도 표시가 유지된다.
    expect(await screen.findByText('본인 인증')).toBeInTheDocument()
    expect(screen.getAllByText('미인증')).toHaveLength(2)
    expect(screen.queryByText('인증완료')).not.toBeInTheDocument()
  })
})

describe('/mypage 적립금 표시 행', () => {
  beforeEach(() => {
    resetAccount()
    seedPointBalance(0)
  })

  it('[AC-POINT-HUB-001] 서버 잔액을 원화로 표시한다', async () => {
    seedPointBalance(12345)
    renderAt('/mypage')

    expect(await screen.findByText('적립금')).toBeInTheDocument()
    expect(await screen.findByText('12,345원')).toBeInTheDocument()
  })

  it('[AC-POINT-HUB-002] 잔액 0도 0원으로 정상 표시한다', async () => {
    seedPointBalance(0)
    renderAt('/mypage')

    expect(await screen.findByText('적립금')).toBeInTheDocument()
    expect(await screen.findByText('0원')).toBeInTheDocument()
  })

  it('[AC-POINT-HUB-003] 조회 실패 시 허브는 정상 렌더되고 금액만 —로 표시한다', async () => {
    server.use(http.get(POINTS_URL, () => HttpResponse.error()))
    renderAt('/mypage')

    // 허브 전체는 살아 있다(메뉴 행 정상 렌더).
    expect(await screen.findByText('본인 인증')).toBeInTheDocument()
    expect(screen.getByText('적립금')).toBeInTheDocument()
    // 금액만 '—'로 강하한다.
    expect(await screen.findByText('—')).toBeInTheDocument()
  })
})
