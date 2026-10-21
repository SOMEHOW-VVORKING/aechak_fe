import { render, screen, waitFor, within } from '@testing-library/react'
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
  SNS_ME,
  SNS_MONG,
  SNS_SPAM,
  SNS_TORI,
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
const row = (nickname: string) => rows().find(li => li.textContent?.includes(nickname))!

beforeEach(() => {
  resetAuth()
})

describe('/sns/users/$publicId/follows 목록', () => {
  it('[AC-SNS01-014] 목록 행에서 팔로우하면 그 행 버튼만 팔로잉으로 바뀌고 목록에 머문다', async () => {
    const user = userEvent.setup()
    const router = renderAt(`/sns/users/${SNS_COCO}/follows`)

    await screen.findByText('몽이아빠')
    await user.click(within(row('몽이아빠')).getByRole('button', { name: '팔로우' }))

    expect(await within(row('몽이아빠')).findByRole('button', { name: '팔로잉' })).toBeInTheDocument()
    expect(within(row('초코맘')).getByRole('button', { name: '팔로우' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe(`/sns/users/${SNS_COCO}/follows`)
  })

  it('[AC-SNS01-015] 행을 누르면 그 사용자 프로필로 가고 본인 행은 내 프로필로 가며 본인 행에는 팔로우 버튼이 없다', async () => {
    seedSns({ follows: [snsRelation(SNS_MONG, SNS_COCO), snsRelation(SNS_ME, SNS_COCO)] })
    const user = userEvent.setup()
    const router = renderAt(`/sns/users/${SNS_COCO}/follows`)

    await screen.findByText('보리언니')
    expect(within(row('보리언니')).queryByRole('button', { name: /팔로우|팔로잉/ })).not.toBeInTheDocument()

    await user.click(within(row('보리언니')).getByRole('button', { name: /보리언니/ }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/sns/me'))

    router.history.back()
    await user.click(await screen.findByRole('button', { name: /몽이아빠/ }))
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

  it('[AC-SNS01-019] 내가 차단한 사용자의 목록은 차단한 계정 안내를 보여준다', async () => {
    renderAt(`/sns/users/${SNS_SPAM}/follows?tab=followings`)

    expect(await screen.findByText('차단한 계정이에요')).toBeInTheDocument()
  })

  it('[AC-SNS01-019] 목록을 연 뒤 주인이 나를 차단하면 다시 불러올 때 볼 수 없는 계정 안내로 바뀐다', async () => {
    server.use(
      http.get(SNS_FOLLOWERS_URL, () => HttpResponse.json({ errorCode: 130000, message: '' }, { status: 404 })),
    )
    renderAt(`/sns/users/${SNS_COCO}/follows`)

    expect(await screen.findByText('볼 수 없는 계정이에요')).toBeInTheDocument()
  })
})

describe('/sns/users/$publicId/follows 비로그인', () => {
  it('[AC-SNS01-029] 비로그인으로 팔로워 수를 누르면 로그인 안내 시트가 열리고 목록으로 가지 않는다', async () => {
    logout()
    seedSns({ viewer: null })
    const user = userEvent.setup()
    const router = renderAt(`/sns/users/${SNS_COCO}`)

    await user.click(await screen.findByRole('button', { name: /팔로워/ }))
    expect(await screen.findByText(/팔로워\/팔로잉 목록은 로그인한 회원만 볼 수 있어요/)).toBeInTheDocument()
    expect(router.state.location.pathname).toBe(`/sns/users/${SNS_COCO}`)
  })

  it('[AC-SNS01-029] 비로그인으로 목록 경로에 바로 들어오면 로그인 안내 시트를 열고 목록 쿼리를 보내지 않는다', async () => {
    logout()
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
