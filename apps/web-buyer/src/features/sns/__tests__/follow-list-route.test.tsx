import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createMemoryHistory, createRouter } from '@tanstack/react-router'
import { HttpResponse, http } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { logout, resetAuth } from '@/shared/auth'
import {
  SNS_BLOCKER,
  SNS_CHOCO,
  SNS_COCO,
  SNS_FOLLOWERS_URL,
  SNS_FOLLOW_URL,
  SNS_PROFILE_URL,
  currentSns,
  SNS_ME,
  SNS_NEIGHBORS,
  SNS_MONG,
  SNS_MUTUAL,
  SNS_SPAM,
  SNS_TORI,
  seedSns,
  server,
  snsRelation,
} from '@/testing/msw/server'
import { setAccessToken } from '@aechak/api'
import { routeTree } from '../../../routeTree.gen'

// staleTime: 앱과 같은 값이면 목록을 다시 열어도 캐시만 쓴다. 닫힌 목록을 낡은 것으로 표시하는 처리를 확인할 때 쓴다.
function renderAt(path: string, staleTime = 0) {
  const router = createRouter({ routeTree, history: createMemoryHistory({ initialEntries: [path] }) })
  // retryDelay 0: SNS 목록은 5xx를 한 번 더 보내는데(retryTransient) 그 재시도를 1초 기다리지 않게 한다.
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, retryDelay: 0, staleTime } } })
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return router
}

const rows = () => within(screen.getByRole('list')).getAllByRole('listitem')
const row = (nickname: string) => rows().find(li => li.textContent?.includes(nickname))!

// 로그인 사용자는 메모리 access 토큰이 있는 상태로 시작한다(SNS MSW는 Authorization 헤더로 보는 사람을 정한다).
beforeEach(() => {
  resetAuth()
  setAccessToken('test-token')
})

describe('/sns/users/$publicId/follows 목록', () => {
  it('[AC-SNS01-014] 목록 행에서 팔로우하면 그 행 버튼만 팔로잉으로 바뀌고 목록에 머문다', async () => {
    const user = userEvent.setup()
    const router = renderAt(`/sns/users/${SNS_COCO}/follows`)

    await screen.findByText('몽이아빠')
    await user.click(screen.getByRole('button', { name: '몽이아빠 팔로우' }))

    expect(await screen.findByRole('button', { name: '몽이아빠 팔로잉' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '초코맘 팔로우' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe(`/sns/users/${SNS_COCO}/follows`)
  })

  it('[AC-SNS01-014] 닫아 둔 내 팔로잉 목록은 프로필에서 팔로우하고 돌아오면 다시 읽어 새로 팔로우한 사람이 나온다', async () => {
    const user = userEvent.setup()
    const router = renderAt(`/sns/users/${SNS_ME}/follows?tab=followings`, 60_000)
    expect(await screen.findByText('아직 팔로우한 사람이 없어요')).toBeInTheDocument()

    await act(() => router.navigate({ to: '/sns/users/$publicId', params: { publicId: SNS_COCO } }))
    await user.click(await screen.findByRole('button', { name: '팔로우' }))
    expect(await screen.findByRole('button', { name: '팔로잉' })).toBeInTheDocument()

    await act(() =>
      router.navigate({ to: '/sns/users/$publicId/follows', params: { publicId: SNS_ME }, search: { tab: 'followings' } }),
    )
    expect(await screen.findByRole('button', { name: '코코집사 팔로잉' })).toBeInTheDocument()
  })

  it('[AC-SNS01-026] 행 팔로우 응답이 실패로 왔지만 서버는 반영했으면 목록을 다시 읽어 버튼을 맞추고 실패 안내를 띄운다', async () => {
    server.use(
      http.post(SNS_FOLLOW_URL, () => {
        // 서버는 팔로우를 반영했는데 응답이 실패로 돌아온 경우(게이트웨이 오류 등)
        const now = currentSns()
        seedSns({ ...now, follows: [...now.follows, snsRelation(SNS_ME, SNS_MONG)] })
        return HttpResponse.json({ errorCode: 90000, message: '' }, { status: 502 })
      }),
    )
    const user = userEvent.setup()
    renderAt(`/sns/users/${SNS_COCO}/follows`)

    await user.click(await screen.findByRole('button', { name: '몽이아빠 팔로우' }))

    expect(await screen.findByText('요청을 처리하지 못했어요. 다시 시도해 주세요')).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: '몽이아빠 팔로잉' })).toBeInTheDocument()
  })

  it('[AC-SNS01-026] 행 팔로우가 실패하고 목록 재조회까지 실패해도 불러온 행은 그대로이고 실패 안내가 뜬다', async () => {
    const user = userEvent.setup()
    renderAt(`/sns/users/${SNS_COCO}/follows`)
    await screen.findByText('몽이아빠')

    let listCalls = 0
    server.use(
      http.post(SNS_FOLLOW_URL, () => HttpResponse.json({ errorCode: 90000, message: '' }, { status: 500 })),
      http.get(SNS_FOLLOWERS_URL, () => {
        listCalls += 1
        return HttpResponse.json({ errorCode: 90000, message: '' }, { status: 500 })
      }),
    )
    await user.click(screen.getByRole('button', { name: '몽이아빠 팔로우' }))

    expect(await screen.findByText('요청을 처리하지 못했어요. 다시 시도해 주세요')).toBeInTheDocument()
    // 재조회와 그 재시도(5xx 1회)가 모두 실패한 뒤에도 행이 남는다.
    await waitFor(() => expect(listCalls).toBe(2))
    await waitFor(() => expect(screen.getByRole('button', { name: '몽이아빠 팔로우' })).toBeEnabled())
    expect(screen.getByText('초코맘')).toBeInTheDocument()
    expect(screen.queryByText('목록을 불러오지 못했어요')).not.toBeInTheDocument()
  })

  it('[AC-SNS01-026] 한 행의 팔로우 요청 중에는 다른 행 버튼을 잠근다', async () => {
    let release: () => void = () => {}
    server.use(
      http.post(SNS_FOLLOW_URL, async () => {
        await new Promise<void>(resolve => (release = resolve))
        return new HttpResponse(null, { status: 201 })
      }),
    )
    const user = userEvent.setup()
    renderAt(`/sns/users/${SNS_COCO}/follows`)

    await user.click(await screen.findByRole('button', { name: '몽이아빠 팔로우' }))
    await waitFor(() => expect(screen.getByRole('button', { name: '초코맘 팔로우' })).toBeDisabled())
    release()
    await waitFor(() => expect(screen.getByRole('button', { name: '초코맘 팔로우' })).toBeEnabled())
  })

  it('[AC-SNS01-026] 목록 다시 읽기가 실패하면 받아 둔 행과 켜진 팔로우 버튼 위에 실패 안내를 두고 다시 시도하면 안내가 사라진다', async () => {
    const user = userEvent.setup()
    renderAt(`/sns/users/${SNS_COCO}/follows`)
    await screen.findByText('몽이아빠')

    server.use(http.get(SNS_FOLLOWERS_URL, () => HttpResponse.json({ errorCode: 90000, message: '' }, { status: 500 })))
    act(() => {
      window.dispatchEvent(new Event('visibilitychange'))
    })
    expect(await screen.findByText(/목록을 다시 불러오지 못했어요/)).toBeInTheDocument()
    expect(rows()).toHaveLength(2)
    expect(screen.getByRole('button', { name: '몽이아빠 팔로우' })).toBeEnabled()

    server.resetHandlers()
    await user.click(screen.getByRole('button', { name: '다시 시도' }))
    await waitFor(() => expect(screen.queryByText(/목록을 다시 불러오지 못했어요/)).not.toBeInTheDocument())
    expect(rows()).toHaveLength(2)
  })

  it('[AC-SNS01-015] 행을 누르면 그 사용자 프로필로 가고 본인 행은 내 프로필로 가며 본인 행에는 팔로우 버튼이 없다', async () => {
    seedSns({ follows: [snsRelation(SNS_MONG, SNS_COCO), snsRelation(SNS_ME, SNS_COCO)] })
    const user = userEvent.setup()
    const router = renderAt(`/sns/users/${SNS_COCO}/follows`)

    await screen.findByText('보리언니')
    expect(within(row('보리언니')).queryByRole('button', { name: /팔로우|팔로잉/ })).not.toBeInTheDocument()

    await user.click(within(row('보리언니')).getByText('보리언니'))
    await waitFor(() => expect(router.state.location.pathname).toBe('/sns/me'))

    router.history.back()
    await user.click(await screen.findByText('몽이아빠'))
    await waitFor(() => expect(router.state.location.pathname).toBe(`/sns/users/${SNS_MONG}`))
  })

  it('[AC-SNS01-016] 펫이 둘 이상인 사용자 행에 품종 외 N 형식이 보이고 펫이 없으면 펫 줄이 없다', async () => {
    renderAt(`/sns/users/${SNS_COCO}/follows`)

    expect(await screen.findByText('골든리트리버 외 1')).toBeInTheDocument()
    expect(within(row('몽이아빠')).getByText('골든리트리버 외 1')).toBeInTheDocument()
    expect(row('초코맘').textContent).not.toMatch(/외 \d|리트리버|푸들/)
  })

  it('[AC-SNS01-017] 팔로워가 없으면 빈 목록 안내를 보여준다', async () => {
    renderAt(`/sns/users/${SNS_TORI}/follows`)

    expect(await screen.findByText('아직 팔로워가 없어요')).toBeInTheDocument()
  })

  it('[AC-SNS01-017] 닉네임 검색 결과가 없으면 빈 목록 안내를 보여주고 검색어는 디바운스해 보낸다', async () => {
    const nicknames: (string | null)[] = []
    server.events.on('request:start', ({ request }) => {
      if (request.url.includes('/followers')) nicknames.push(new URL(request.url).searchParams.get('nickname'))
    })
    const user = userEvent.setup()
    renderAt(`/sns/users/${SNS_COCO}/follows`)
    await screen.findByText('몽이아빠')

    await user.type(screen.getByRole('searchbox', { name: '닉네임 검색' }), '없는%_이름')
    expect(await screen.findByText('검색 결과가 없어요')).toBeInTheDocument()
    // 첫 페이지(검색어 없음) + 입력을 마친 뒤 한 번. 글자 종류로 막지 않고 그대로 보낸다.
    expect(nicknames).toEqual([null, '없는%_이름'])
    server.events.removeAllListeners()
  })

  it('[AC-SNS01-018] 차단 관계 사용자는 목록에서 빠지고 탭 수는 그대로이며 뮤트한 사용자는 보인다', async () => {
    seedSns({
      follows: [snsRelation(SNS_SPAM, SNS_COCO), snsRelation(SNS_TORI, SNS_COCO), snsRelation(SNS_CHOCO, SNS_COCO)],
      blocks: [snsRelation(SNS_ME, SNS_SPAM)],
      mutes: [snsRelation(SNS_ME, SNS_TORI)],
    })
    renderAt(`/sns/users/${SNS_COCO}/follows`)

    expect(await screen.findByText('토리네')).toBeInTheDocument()
    expect(screen.getByText('초코맘')).toBeInTheDocument()
    expect(screen.queryByText('광고계정01')).not.toBeInTheDocument()
    expect(await screen.findByRole('tab', { name: /팔로워\s*3/ })).toBeInTheDocument()
  })

  it('[AC-SNS01-018] 팔로잉 탭으로 바꾸면 팔로잉 목록과 수를 보여준다', async () => {
    const user = userEvent.setup()
    const router = renderAt(`/sns/users/${SNS_COCO}/follows`)

    await user.click(await screen.findByRole('tab', { name: /팔로잉/ }))
    expect(await screen.findByText('몽이아빠')).toBeInTheDocument()
    expect(screen.queryByText('초코맘')).not.toBeInTheDocument()
    expect(router.state.location.search).toEqual({ tab: 'followings' })
    expect(screen.getByRole('tab', { name: /팔로잉\s*1/ })).toHaveAttribute('aria-selected', 'true')
  })

  it('[AC-SNS01-019] 나를 차단한 사용자의 목록은 볼 수 없는 계정 안내를 보여준다', async () => {
    renderAt(`/sns/users/${SNS_BLOCKER}/follows`)

    expect(await screen.findByText('볼 수 없는 계정이에요')).toBeInTheDocument()
  })

  it('[AC-SNS01-019] 서로 차단한 사용자의 목록은 목록 응답 전에도 차단한 계정 안내 없이 볼 수 없는 계정 안내를 보여준다', async () => {
    // 목록 응답을 붙잡아 프로필(200, blockingMe와 blockedByMe가 true)만 온 상태를 본다. 풀면 기본 핸들러가 404 130000을 준다.
    let release = () => {}
    const held = new Promise<void>(resolve => {
      release = () => resolve()
    })
    server.use(
      http.get(SNS_FOLLOWERS_URL, async () => {
        await held
      }),
    )
    renderAt(`/sns/users/${SNS_MUTUAL}/follows`)

    expect(await screen.findByText('볼 수 없는 계정이에요')).toBeInTheDocument()
    expect(screen.queryByText('차단한 계정이에요')).not.toBeInTheDocument()
    release()
  })

  it('[AC-SNS01-019] 내가 차단한 사용자의 목록은 차단한 계정 안내를 보여준다', async () => {
    renderAt(`/sns/users/${SNS_SPAM}/follows?tab=followings`)

    expect(await screen.findByText('차단한 계정이에요')).toBeInTheDocument()
  })

  it('[AC-SNS01-019] 목록을 연 뒤 주인이 나를 차단하면 다시 불러올 때 볼 수 없는 계정 안내로 바뀐다', async () => {
    const user = userEvent.setup()
    renderAt(`/sns/users/${SNS_COCO}/follows`)
    await screen.findByText('몽이아빠')

    const now = currentSns()
    seedSns({ ...now, blocks: [...now.blocks, snsRelation(SNS_COCO, SNS_ME)] })
    // 검색어를 바꾸면 첫 페이지부터 다시 부른다.
    await user.type(screen.getByRole('searchbox', { name: '닉네임 검색' }), '몽')

    expect(await screen.findByText('볼 수 없는 계정이에요')).toBeInTheDocument()
  })

  it('[AC-SNS01-017] 20명을 넘으면 더보기로 다음 페이지를 붙인다(커서는 목록과 검색어에 묶인다)', async () => {
    seedSns({ follows: SNS_NEIGHBORS.map(id => snsRelation(id, SNS_COCO)) })
    const user = userEvent.setup()
    renderAt(`/sns/users/${SNS_COCO}/follows`)

    await screen.findByText('이웃25')
    expect(rows()).toHaveLength(20)
    await user.click(screen.getByRole('button', { name: '더보기' }))
    await screen.findByText('이웃1')
    expect(rows()).toHaveLength(25)
    expect(screen.getByRole('tab', { name: /팔로워\s*25/ })).toBeInTheDocument()
  })

  it('[AC-SNS01-017] 다음 페이지가 실패하면 받은 행을 두고 더보기 위에 실패 안내를 두며 더보기로 다시 부른다', async () => {
    seedSns({ follows: SNS_NEIGHBORS.map(id => snsRelation(id, SNS_COCO)) })
    server.use(
      http.get(SNS_FOLLOWERS_URL, ({ request }) =>
        new URL(request.url).searchParams.has('cursor')
          ? HttpResponse.json({ errorCode: 90000, message: '' }, { status: 500 })
          : undefined,
      ),
    )
    const user = userEvent.setup()
    renderAt(`/sns/users/${SNS_COCO}/follows`)
    await screen.findByText('이웃25')

    await user.click(screen.getByRole('button', { name: '더보기' }))
    expect(await screen.findByText('다음 목록을 불러오지 못했어요')).toBeInTheDocument()
    expect(rows()).toHaveLength(20)

    server.resetHandlers()
    await user.click(screen.getByRole('button', { name: '더보기' }))
    await screen.findByText('이웃1')
    expect(screen.queryByText('다음 목록을 불러오지 못했어요')).not.toBeInTheDocument()
  })
})

describe('/sns/users/$publicId/follows 비로그인', () => {
  it('[AC-SNS01-029] 비로그인으로 팔로워 수를 누르면 로그인 안내 시트가 열리고 목록으로 가지 않는다', async () => {
    logout()
    setAccessToken(null)
    seedSns({ viewer: null })
    const user = userEvent.setup()
    const router = renderAt(`/sns/users/${SNS_COCO}`)

    await user.click(await screen.findByRole('button', { name: /팔로워/ }))
    expect(await screen.findByText(/팔로워\/팔로잉 목록은 로그인한 회원만 볼 수 있어요/)).toBeInTheDocument()
    expect(router.state.location.pathname).toBe(`/sns/users/${SNS_COCO}`)
  })

  it('[AC-SNS01-029] 비로그인으로 목록 경로에 바로 들어오면 로그인 안내 시트를 열고 목록 쿼리를 보내지 않는다', async () => {
    logout()
    setAccessToken(null)
    seedSns({ viewer: null })
    const listRequests: string[] = []
    server.events.on('request:start', ({ request }) => {
      if (/\/follow(er|ing)s/.test(request.url)) listRequests.push(request.url)
    })
    renderAt(`/sns/users/${SNS_COCO}/follows`)

    expect(await screen.findByText(/팔로워\/팔로잉 목록은 로그인한 회원만 볼 수 있어요/)).toBeInTheDocument()
    expect(listRequests).toEqual([])
    server.events.removeAllListeners()
  })
})

describe('/sns/users/$publicId/follows 탭 수', () => {
  it('탭 수는 프로필 머리말처럼 천 단위를 쉼표로 나눈다', async () => {
    server.use(
      http.get(SNS_PROFILE_URL, () =>
        HttpResponse.json({
          data: {
            publicId: SNS_COCO,
            nickname: '코코집사',
            profileImageUrl: null,
            bio: null,
            pets: [],
            postCount: 0,
            followerCount: 128000,
            followingCount: 1234,
            isMe: false,
            following: false,
            blockedByMe: false,
            mutedByMe: false,
            blockingMe: false,
          },
        }),
      ),
    )
    renderAt(`/sns/users/${SNS_COCO}/follows`)

    expect(await screen.findByRole('tab', { name: /팔로워\s*128,000/ })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /팔로잉\s*1,234/ })).toBeInTheDocument()
  })
})
