import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createMemoryHistory, createRouter } from '@tanstack/react-router'
import { HttpResponse, http } from 'msw'
import { describe, expect, it } from 'vitest'
import {
  SNS_BLOCKER,
  SNS_ME,
  SNS_MONG,
  SNS_MUTE_URL,
  SNS_SPAM,
  currentSns,
  seedSns,
  server,
  snsRelation,
} from '@/testing/msw/server'
import { routeTree } from '../../../routeTree.gen'

function renderAt(path: string) {
  const router = createRouter({ routeTree, history: createMemoryHistory({ initialEntries: [path] }) })
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return router
}

const rows = () => within(screen.getByRole('list')).getAllByRole('listitem')

describe('/mypage/sns-relations 차단/뮤트 관리', () => {
  it('[AC-SNS01-022] 차단 목록은 최근순으로 차단일을 보여주고 탭 수는 첫 페이지 totalCount다', async () => {
    seedSns({
      blocks: [snsRelation(SNS_ME, SNS_SPAM, '2026-06-09T10:00:00'), snsRelation(SNS_ME, SNS_MONG, '2026-06-12T10:00:00')],
    })
    renderAt('/mypage/sns-relations')

    await screen.findByText('몽이아빠')
    expect(rows().map(li => within(li).getByText(/^차단 \//).textContent)).toEqual([
      '차단 / 6월 12일',
      '차단 / 6월 9일',
    ])
    expect(screen.getByRole('tab', { name: /차단\s*2/ })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /뮤트\s*1/ })).toBeInTheDocument()
  })

  it('[AC-SNS01-022] 차단 해제는 확인 모달을 거치고 해제하면 행이 빠지고 탭 수가 1 준다', async () => {
    seedSns({ blocks: [snsRelation(SNS_ME, SNS_SPAM), snsRelation(SNS_ME, SNS_MONG)] })
    const user = userEvent.setup()
    renderAt('/mypage/sns-relations')

    await screen.findByText('광고계정01')
    await user.click(within(rows()[1]!).getByRole('button', { name: '차단 해제' }))
    expect(await screen.findByText('차단을 해제할까요?')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '해제' }))

    await waitFor(() => expect(screen.queryByText('광고계정01')).not.toBeInTheDocument())
    expect(screen.getByRole('tab', { name: /차단\s*1/ })).toBeInTheDocument()
    expect(await screen.findByText('차단을 해제했어요')).toBeInTheDocument()
  })

  it('[AC-SNS01-022] 뮤트 해제 모달에서 취소하면 아무것도 바뀌지 않는다', async () => {
    const user = userEvent.setup()
    renderAt('/mypage/sns-relations')

    await user.click(await screen.findByRole('tab', { name: /뮤트/ }))
    expect(await screen.findByText('뮤트 / 게시물 비노출')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '뮤트 해제' }))
    expect(await screen.findByText('뮤트를 해제할까요?')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '취소' }))

    expect(screen.queryByText('뮤트를 해제할까요?')).not.toBeInTheDocument()
    expect(screen.getByText('토리네')).toBeInTheDocument()
    expect(currentSns().mutes).toHaveLength(1)
  })

  it('[AC-SNS01-022] 행을 눌러도 프로필로 이동하지 않는다(H2)', async () => {
    const user = userEvent.setup()
    const router = renderAt('/mypage/sns-relations')

    await user.click(await screen.findByText('광고계정01'))
    expect(router.state.location.pathname).toBe('/mypage/sns-relations')
  })

  it('[AC-SNS01-024] 서로 차단한 상태에서 한쪽만 해제하면 목록에서 빠지지만 상대 프로필은 계속 볼 수 없다', async () => {
    seedSns({ blocks: [snsRelation(SNS_BLOCKER, SNS_ME), snsRelation(SNS_ME, SNS_BLOCKER)] })
    const user = userEvent.setup()
    const router = renderAt('/mypage/sns-relations')

    await user.click(await screen.findByRole('button', { name: '차단 해제' }))
    await user.click(await screen.findByRole('button', { name: '해제' }))
    expect(await screen.findByText('차단한 계정이 없어요')).toBeInTheDocument()

    await router.navigate({ to: '/sns/users/$publicId', params: { publicId: SNS_BLOCKER } })
    expect(await screen.findByText('볼 수 없는 계정이에요')).toBeInTheDocument()
  })

  it('[AC-SNS01-026] 뮤트 해제 요청이 실패하면 목록과 수가 그대로이고 실패 안내가 뜬다', async () => {
    server.use(http.delete(SNS_MUTE_URL, () => HttpResponse.json({ errorCode: 90000, message: '' }, { status: 500 })))
    const user = userEvent.setup()
    renderAt('/mypage/sns-relations')

    await user.click(await screen.findByRole('tab', { name: /뮤트/ }))
    await user.click(await screen.findByRole('button', { name: '뮤트 해제' }))
    await user.click(await screen.findByRole('button', { name: '해제' }))

    expect(await screen.findByText('요청을 처리하지 못했어요. 다시 시도해 주세요')).toBeInTheDocument()
    expect(screen.getByText('토리네')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /뮤트\s*1/ })).toBeInTheDocument()
    // 다시 보낼 수 있다.
    expect(screen.getByRole('button', { name: '뮤트 해제' })).toBeEnabled()
  })

  it('[AC-SNS01-027] 차단 목록과 뮤트 목록이 비어 있으면 빈 목록 안내를 보여준다', async () => {
    seedSns({ blocks: [], mutes: [] })
    const user = userEvent.setup()
    renderAt('/mypage/sns-relations')

    expect(await screen.findByText('차단한 계정이 없어요')).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: /뮤트/ }))
    expect(await screen.findByText('뮤트한 계정이 없어요')).toBeInTheDocument()
  })
})
