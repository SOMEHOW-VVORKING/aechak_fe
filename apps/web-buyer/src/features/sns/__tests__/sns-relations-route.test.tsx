import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createMemoryHistory, createRouter } from '@tanstack/react-router'
import { HttpResponse, http } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  SNS_BLOCKER,
  SNS_ME,
  SNS_MONG,
  SNS_MUTE_URL,
  SNS_MY_BLOCKS_URL,
  SNS_MY_MUTES_URL,
  SNS_NEIGHBORS,
  SNS_SPAM,
  SNS_TORI,
  currentSns,
  seedSns,
  server,
  snsRelation,
} from '@/testing/msw/server'
import { setAccessToken } from '@aechak/api'
import { logout } from '@/shared/auth'
import { routeTree } from '../../../routeTree.gen'

function renderAt(path: string) {
  const router = createRouter({ routeTree, history: createMemoryHistory({ initialEntries: [path] }) })
  // retryDelay 0: SNS 목록은 5xx를 한 번 더 보내는데(retryTransient) 그 재시도를 1초 기다리지 않게 한다.
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, retryDelay: 0 } } })
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return router
}

// 로그인 사용자는 메모리 access 토큰이 있는 상태로 시작한다(SNS MSW는 Authorization 헤더로 보는 사람을 정한다).
beforeEach(() => {
  setAccessToken('test-token')
})

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
    expect(
      screen.getByText('차단한 계정과는 서로의 게시물을 볼 수 없고 서로 팔로우가 해제돼요.'),
    ).toBeInTheDocument()
  })

  it('[AC-SNS01-022] 차단 해제는 확인 모달을 거치고 해제하면 행이 빠지고 탭 수가 1 준다', async () => {
    seedSns({ blocks: [snsRelation(SNS_ME, SNS_SPAM), snsRelation(SNS_ME, SNS_MONG)] })
    const user = userEvent.setup()
    renderAt('/mypage/sns-relations')

    await screen.findByText('광고계정01')
    await user.click(screen.getByRole('button', { name: '광고계정01 차단 해제' }))
    expect(await screen.findByText('차단을 해제할까요?')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '해제' }))

    await waitFor(() => expect(screen.queryByText('광고계정01')).not.toBeInTheDocument())
    expect(screen.getByRole('tab', { name: /차단\s*1/ })).toBeInTheDocument()
    expect(await screen.findByText('차단을 해제했어요')).toBeInTheDocument()
  })

  it('[AC-SNS01-022] 뮤트 해제는 확인 모달을 거치고 해제하면 행이 빠지고 탭 수가 1 준다', async () => {
    seedSns({ mutes: [snsRelation(SNS_ME, SNS_TORI), snsRelation(SNS_ME, SNS_MONG)] })
    const user = userEvent.setup()
    renderAt('/mypage/sns-relations')

    await user.click(await screen.findByRole('tab', { name: /뮤트\s*2/ }))
    await user.click(await screen.findByRole('button', { name: '토리네 뮤트 해제' }))
    expect(await screen.findByText('뮤트를 해제할까요?')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '해제' }))

    await waitFor(() => expect(screen.queryByText('토리네')).not.toBeInTheDocument())
    expect(screen.getByText('몽이아빠')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /뮤트\s*1/ })).toBeInTheDocument()
    expect(await screen.findByText('뮤트를 해제했어요')).toBeInTheDocument()
    expect(currentSns().mutes.map(r => r.to)).toEqual([SNS_MONG])
  })

  it('[AC-SNS01-022] 20명을 넘으면 더보기로 다음 페이지를 붙이고 탭 수는 첫 페이지 totalCount를 그대로 쓴다', async () => {
    seedSns({ blocks: SNS_NEIGHBORS.map(id => snsRelation(SNS_ME, id)) })
    const user = userEvent.setup()
    renderAt('/mypage/sns-relations')

    await screen.findByText('이웃25')
    expect(rows()).toHaveLength(20)
    expect(screen.getByRole('tab', { name: /차단\s*25/ })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '더보기' }))
    await screen.findByText('이웃1')
    expect(rows()).toHaveLength(25)
    expect(screen.getByRole('tab', { name: /차단\s*25/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '더보기' })).not.toBeInTheDocument()
  })

  it('[AC-SNS01-022] 다음 페이지가 실패하면 받은 행을 두고 더보기 위에 실패 안내를 두며 더보기로 다시 부른다', async () => {
    seedSns({ blocks: SNS_NEIGHBORS.map(id => snsRelation(SNS_ME, id)) })
    server.use(
      http.get(SNS_MY_BLOCKS_URL, ({ request }) =>
        new URL(request.url).searchParams.has('cursor')
          ? HttpResponse.json({ errorCode: 90000, message: '' }, { status: 500 })
          : undefined,
      ),
    )
    const user = userEvent.setup()
    renderAt('/mypage/sns-relations')
    await screen.findByText('이웃25')

    await user.click(screen.getByRole('button', { name: '더보기' }))
    expect(await screen.findByText('다음 목록을 불러오지 못했어요')).toBeInTheDocument()
    expect(rows()).toHaveLength(20)

    server.resetHandlers()
    await user.click(screen.getByRole('button', { name: '더보기' }))
    await screen.findByText('이웃1')
    expect(screen.queryByText('다음 목록을 불러오지 못했어요')).not.toBeInTheDocument()
  })

  it('[AC-SNS01-026] 목록 다시 읽기가 실패하면 받아 둔 행과 켜진 해제 버튼 위에 실패 안내를 두고 다시 시도하면 안내가 사라진다', async () => {
    const user = userEvent.setup()
    renderAt('/mypage/sns-relations')
    await screen.findByText('광고계정01')

    server.use(http.get(SNS_MY_BLOCKS_URL, () => HttpResponse.json({ errorCode: 90000, message: '' }, { status: 500 })))
    act(() => {
      window.dispatchEvent(new Event('visibilitychange'))
    })
    expect(await screen.findByText(/목록을 다시 불러오지 못했어요/)).toBeInTheDocument()
    expect(screen.getByText('광고계정01')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '광고계정01 차단 해제' })).toBeEnabled()

    server.resetHandlers()
    await user.click(screen.getByRole('button', { name: '다시 시도' }))
    await waitFor(() => expect(screen.queryByText(/목록을 다시 불러오지 못했어요/)).not.toBeInTheDocument())
    expect(screen.getByText('광고계정01')).toBeInTheDocument()
  })

  it('[AC-SNS01-022] 뮤트 해제 모달에서 취소하면 아무것도 바뀌지 않는다', async () => {
    const user = userEvent.setup()
    renderAt('/mypage/sns-relations')

    await user.click(await screen.findByRole('tab', { name: /뮤트/ }))
    expect(await screen.findByText('뮤트 / 게시물 비노출')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '토리네 뮤트 해제' }))
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

  it('[AC-SNS01-024] 서로 차단한 상태에서 한쪽만 해제하면 목록에서 빠지지만 상대 프로필은 계속 기본 프로필이다', async () => {
    seedSns({ blocks: [snsRelation(SNS_BLOCKER, SNS_ME), snsRelation(SNS_ME, SNS_BLOCKER)] })
    const user = userEvent.setup()
    const router = renderAt('/mypage/sns-relations')

    await user.click(await screen.findByRole('button', { name: '차단러 차단 해제' }))
    await user.click(await screen.findByRole('button', { name: '해제' }))
    expect(await screen.findByText('차단한 계정이 없어요')).toBeInTheDocument()

    // 상대가 건 차단이 남아 있어 수와 팔로우 버튼 없이 기본 프로필 사진과 닉네임만 보인다(A7).
    await router.navigate({ to: '/sns/users/$publicId', params: { publicId: SNS_BLOCKER } })
    expect(await screen.findByLabelText('차단러')).toHaveTextContent('차')
    expect(screen.queryByText('팔로워')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /팔로우|차단 해제/ })).not.toBeInTheDocument()
  })

  it('[AC-SNS01-026] 뮤트 해제 요청이 실패하면 목록과 수가 그대로이고 실패 안내가 뜬다', async () => {
    server.use(http.delete(SNS_MUTE_URL, () => HttpResponse.json({ errorCode: 90000, message: '' }, { status: 500 })))
    const user = userEvent.setup()
    renderAt('/mypage/sns-relations')

    await user.click(await screen.findByRole('tab', { name: /뮤트/ }))
    await user.click(await screen.findByRole('button', { name: '토리네 뮤트 해제' }))
    await user.click(await screen.findByRole('button', { name: '해제' }))

    expect(await screen.findByText('요청을 처리하지 못했어요. 다시 시도해 주세요')).toBeInTheDocument()
    expect(screen.getByText('토리네')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /뮤트\s*1/ })).toBeInTheDocument()
    // 다시 보낼 수 있다.
    expect(screen.getByRole('button', { name: '토리네 뮤트 해제' })).toBeEnabled()
  })

  it('[AC-SNS01-026] 뮤트 해제 응답이 실패로 왔지만 서버는 반영했으면 목록을 다시 읽어 행을 뺀다', async () => {
    server.use(
      http.delete(SNS_MUTE_URL, () => {
        seedSns({ ...currentSns(), mutes: [] })
        return HttpResponse.json({ errorCode: 90000, message: '' }, { status: 502 })
      }),
    )
    const user = userEvent.setup()
    renderAt('/mypage/sns-relations')

    await user.click(await screen.findByRole('tab', { name: /뮤트/ }))
    await user.click(await screen.findByRole('button', { name: '토리네 뮤트 해제' }))
    await user.click(await screen.findByRole('button', { name: '해제' }))

    expect(await screen.findByText('요청을 처리하지 못했어요. 다시 시도해 주세요')).toBeInTheDocument()
    expect(await screen.findByText('뮤트한 계정이 없어요')).toBeInTheDocument()
  })

  it('[AC-SNS01-026] 뮤트 해제가 실패하고 목록 재조회까지 실패해도 불러온 행은 그대로이고 실패 안내가 뜬다', async () => {
    const user = userEvent.setup()
    renderAt('/mypage/sns-relations')
    await user.click(await screen.findByRole('tab', { name: /뮤트/ }))
    await screen.findByText('토리네')

    let listCalls = 0
    server.use(
      http.delete(SNS_MUTE_URL, () => HttpResponse.json({ errorCode: 90000, message: '' }, { status: 500 })),
      http.get(SNS_MY_MUTES_URL, () => {
        listCalls += 1
        return HttpResponse.json({ errorCode: 90000, message: '' }, { status: 500 })
      }),
    )
    await user.click(screen.getByRole('button', { name: '토리네 뮤트 해제' }))
    await user.click(await screen.findByRole('button', { name: '해제' }))

    expect(await screen.findByText('요청을 처리하지 못했어요. 다시 시도해 주세요')).toBeInTheDocument()
    await waitFor(() => expect(listCalls).toBe(2))
    expect(screen.getByText('토리네')).toBeInTheDocument()
    expect(screen.queryByText('목록을 불러오지 못했어요')).not.toBeInTheDocument()
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

describe('/mypage/sns-relations 비로그인', () => {
  it('비로그인이 주소로 바로 들어오면 요청 없이 로그인 안내 화면을 보여준다', async () => {
    logout()
    setAccessToken(null)
    seedSns({ viewer: null })
    const snsRequests: string[] = []
    server.events.on('request:start', ({ request }) => {
      if (new URL(request.url).pathname.includes('/sns/')) snsRequests.push(request.url)
    })
    try {
      const router = renderAt('/mypage/sns-relations')
      expect(await screen.findByText(/차단\/뮤트 관리는 로그인한 회원만 볼 수 있어요\./)).toBeInTheDocument()
      expect(screen.getByText('차단/뮤트 관리')).toBeInTheDocument()
      expect(router.state.location.pathname).toBe('/mypage/sns-relations')
      expect(snsRequests).toEqual([])
    } finally {
      server.events.removeAllListeners()
    }
  })
})

describe('/mypage/sns-relations 탭 수', () => {
  it('탭 수는 프로필 머리말처럼 천 단위를 쉼표로 나눈다', async () => {
    server.use(
      http.get(SNS_MY_BLOCKS_URL, () =>
        HttpResponse.json({ data: { items: [], totalCount: 12345, nextCursor: null, hasNext: false } }),
      ),
    )
    renderAt('/mypage/sns-relations')

    expect(await screen.findByRole('tab', { name: /차단\s*12,345/ })).toBeInTheDocument()
  })
})
