import { render, screen, within } from '@testing-library/react'
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

// admin 모듈에 셀러 계정 조회·제재 API가 없다(입점 심사와 별개). 2026-10-18에는 진입을 막았는데
// 운영자가 기능의 모양조차 볼 수 없어 되돌렸다(SCRUM-308) — 예시 데이터로 열고 띠로 밝힌다.
describe('/sellers', () => {
  it('[AC-SELLER-MGMT-003] 직접 진입하면 예시 셀러 목록과 영업 상태가 보인다', async () => {
    renderAt('/sellers')

    expect(await screen.findByRole('button', { name: '냥이상점' })).toBeInTheDocument()
    // 영업 상태가 없으면 제재 대상을 가릴 수 없다 — 이 화면의 쓸모가 상태에 있다.
    // 필터 Select의 <option>에 같은 글자가 있어 전역에서 찾으면 목록이 비어도 통과한다.
    // 영업중 셀러가 여럿이라 getAll로 받는다(개수는 목 데이터가 바뀌면 흔들리므로 세지 않는다).
    expect(within(screen.getByRole('table')).getAllByText('영업중').length).toBeGreaterThan(0)
  })

  it('[AC-SELLER-MGMT-004] SideNav의 셀러 관리 항목은 숨기지 않고 "준비 중" 꼬리표로 밝힌다', async () => {
    renderAt('/sellers')

    // 실연동 항목은 라벨 그대로, 서버가 없는 항목은 라벨 + 꼬리표가 접근명이 된다.
    expect(await screen.findByRole('button', { name: '셀러 입점 심사' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '셀러 관리 준비 중' })).toBeInTheDocument()
    // 꼬리표를 떼면 운영자가 들어가기 전에 예시 화면임을 알 수 없다(화면 안 띠는 들어간 뒤에 보인다).
    expect(screen.queryByRole('button', { name: '셀러 관리' })).not.toBeInTheDocument()
    // 상수 배지(차단 이전의 7·12·9·15·6·3·2)는 되살리지 않는다 — 장식 UI다.
    expect(screen.queryByText('7')).not.toBeInTheDocument()
    expect(screen.queryByText('12')).not.toBeInTheDocument()
  })
})
