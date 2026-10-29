import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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

// admin 모듈에 회원 조회·제재 API가 없다. 2026-10-18에는 이 화면의 진입을 막았는데, 그러면
// 운영자가 기능의 모양조차 볼 수 없어 되돌렸다(SCRUM-308) — 예시 데이터로 열고 띠로 밝힌다.
// 13화면 공통 계약(띠·표·쓰기 차단)은 shared/__tests__/admin-mock-screens.test.tsx가 본다.
describe('/members', () => {
  it('[AC-MEMBER-002] 직접 진입하면 예시 회원 목록과 계정 상태가 보인다', async () => {
    renderAt('/members')

    expect(await screen.findByRole('button', { name: 'user_28471' })).toBeInTheDocument()
    // 필터 Select의 <option>에 같은 글자가 있어 전역에서 찾으면 목록이 비어도 통과한다 — 표 안으로 좁힌다.
    const table = within(screen.getByRole('table'))
    expect(table.getByText('코코맘')).toBeInTheDocument()
    // 상태 pill이 비면 어떤 제재가 걸린 회원인지 알 수 없다 — 목록의 쓸모가 상태에 있다.
    expect(table.getByText('이용 제한')).toBeInTheDocument()
  })

  it('[AC-MEMBER-004] 행을 누르면 상세 드로어가 열리고 제재 결정 옵션이 보인다', async () => {
    const user = userEvent.setup()
    renderAt('/members')

    await user.click(await screen.findByRole('button', { name: 'user_19023' }))

    const drawer = within(await screen.findByRole('dialog', { name: '회원 상세' }))
    // 결정 옵션이 없으면 드로어가 열려도 운영 흐름을 볼 수 없다(필터 <option>과 섞이지 않게 드로어 안에서 찾는다).
    for (const option of ['임시 정지', '영구 정지']) {
      expect(drawer.getByText(option)).toBeInTheDocument()
    }
    expect(drawer.getByRole('button', { name: '제출' })).toBeInTheDocument()
  })
})
