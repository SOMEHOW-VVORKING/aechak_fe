import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter, createMemoryHistory } from '@tanstack/react-router'
import { describe, it, expect } from 'vitest'
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

// admin 모듈에 셀러 계정 조회·제재 API가 없다(입점 심사와 별개) — 목업 목록·판매정지는 운영 진입을 막는다.
describe('/sellers', () => {
  it('[AC-SELLER-MGMT-003] 직접 진입하면 준비 중 안내만 보여주고 목업 셀러 목록·판매정지를 그리지 않는다', async () => {
    renderAt('/sellers')

    expect(await screen.findByText('셀러 관리는 준비 중이에요')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '냥이상점' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '판매정지' })).not.toBeInTheDocument()
  })

  it('[AC-SELLER-MGMT-004] SideNav의 셀러 관리 항목은 숨기지 않고 "준비 중" 꼬리표로 밝힌다', async () => {
    renderAt('/sellers')

    // 실연동 항목은 라벨 그대로, 서버가 없는 항목은 라벨 + 꼬리표가 접근명이 된다.
    expect(await screen.findByRole('button', { name: '셀러 입점 심사' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '셀러 관리 준비 중' })).toBeInTheDocument()
    // 꼬리표 없이 멀쩡한 항목처럼 보이면 운영자가 들어가 입력하고 저장한 줄 안다.
    expect(screen.queryByRole('button', { name: '셀러 관리' })).not.toBeInTheDocument()
    // 상수 배지(차단 이전의 7·12·9·15·6·3·2)는 되살리지 않는다 — 장식 UI다.
    expect(screen.queryByText('7')).not.toBeInTheDocument()
    expect(screen.queryByText('12')).not.toBeInTheDocument()
  })
})
