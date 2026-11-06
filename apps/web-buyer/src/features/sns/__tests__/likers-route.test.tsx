import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createMemoryHistory, createRouter } from '@tanstack/react-router'
import { HttpResponse, http } from 'msw'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { setAccessToken } from '@aechak/api'
import { logout, resetAuth } from '@/shared/auth'
import { petAge } from '@/shared/pet'
import {
  SNS_BLOCKER,
  SNS_COCO,
  SNS_FANS,
  SNS_ME,
  SNS_MONG,
  SNS_POST_COCO,
  SNS_POST_DELETED,
  SNS_POST_LIKERS_URL,
  SNS_POST_SPAM,
  SNS_SPAM,
  SNS_TORI,
  SNS_WITHDRAWN,
  currentSns,
  seedSns,
  server,
  snsLike,
  snsRelation,
} from '@/testing/msw/server'
import { routeTree } from '../../../routeTree.gen'

function renderAt(path: string) {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
  })
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, retryDelay: 0 } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return router
}

const likersPath = (publicId: string) => `/sns/posts/${publicId}/likers`
const rows = () => within(screen.getByRole('list')).getAllByRole('listitem')
const rowOf = (nickname: string) => screen.getByText(nickname, { exact: true }).closest('li')!

let likersRequests = 0

beforeEach(() => {
  resetAuth()
  setAccessToken('test-token')
  likersRequests = 0
  server.events.on('request:start', ({ request }) => {
    if (new URL(request.url).pathname.endsWith('/likers')) likersRequests += 1
  })
})

afterEach(() => {
  server.events.removeAllListeners()
})

describe('/sns/posts/$publicId/likers', () => {
  it('[AC-SNS04-008] 100명을 넘으면 상단에 전체 수와 최근 100명이 나오고 최근 100명까지 볼 수 있다는 안내가 나온다', async () => {
    seedSns({ likes: SNS_FANS.map(fan => snsLike(fan, SNS_POST_COCO)) })
    renderAt(likersPath(SNS_POST_COCO))

    expect(await screen.findByText('최근 좋아요 100명까지 볼 수 있어요')).toBeInTheDocument()
    expect(screen.getByText('101')).toBeInTheDocument()
    expect(rows()).toHaveLength(100)
    // 최근에 누른 사람이 먼저다.
    expect(within(rows()[0]!).getByText('팬101')).toBeInTheDocument()
  })

  it('[AC-SNS04-009][AC-SNS04-010] 차단 관계인 사용자는 빠지고 뮤트한 사용자는 나오며 상단 수는 그대로이고 보여준 인원을 안내한다', async () => {
    seedSns({
      likes: [
        snsLike(SNS_TORI, SNS_POST_COCO),
        snsLike(SNS_SPAM, SNS_POST_COCO),
        snsLike(SNS_BLOCKER, SNS_POST_COCO),
        snsLike(SNS_WITHDRAWN, SNS_POST_COCO),
        snsLike(SNS_MONG, SNS_POST_COCO),
      ],
    })
    renderAt(likersPath(SNS_POST_COCO))

    expect(await screen.findByText('좋아요한 2명을 표시했어요')).toBeInTheDocument()
    expect(screen.getByText('5')).toBeInTheDocument()
    expect(rows()).toHaveLength(2)
    expect(rows()[0]).toHaveTextContent('몽이아빠')
    expect(rows()[1]).toHaveTextContent('토리네')
  })

  it('[AC-SNS04-011] 닉네임 검색은 받은 목록 안에서 찾고 맞는 사람이 없으면 검색 결과 없음이 나온다', async () => {
    seedSns({ likes: [snsLike(SNS_MONG, SNS_POST_COCO), snsLike(SNS_COCO, SNS_POST_COCO)] })
    const user = userEvent.setup()
    renderAt(likersPath(SNS_POST_COCO))
    await screen.findByText('좋아요한 2명을 표시했어요')

    await user.type(screen.getByRole('searchbox', { name: '닉네임 검색' }), '몽이')
    expect(rows()).toHaveLength(1)
    expect(screen.getByText('몽이아빠')).toBeInTheDocument()

    await user.type(screen.getByRole('searchbox', { name: '닉네임 검색' }), '없는')
    expect(screen.getByText('검색 결과가 없어요')).toBeInTheDocument()
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
    // 서버 검색은 없다.
    expect(likersRequests).toBe(1)
  })

  it('[AC-SNS04-012] 내 행에는 나 표시만 있고 팔로우 버튼이 없으며 행을 누르면 그 사용자의 프로필로, 내 행은 내 프로필로 간다', async () => {
    seedSns({ likes: [snsLike(SNS_ME, SNS_POST_COCO), snsLike(SNS_COCO, SNS_POST_COCO)] })
    const user = userEvent.setup()
    const router = renderAt(likersPath(SNS_POST_COCO))
    await screen.findByText('좋아요한 2명을 표시했어요')

    const mine = rowOf('보리언니')
    expect(within(mine).getByText('나')).toBeInTheDocument()
    expect(within(mine).queryByRole('button', { name: /팔로우|팔로잉/ })).not.toBeInTheDocument()

    await user.click(within(rowOf('코코집사')).getByText('코코집사'))
    await waitFor(() => expect(router.state.location.pathname).toBe(`/sns/users/${SNS_COCO}`))
    router.history.back()
    await user.click(
      within(await screen.findByText('보리언니').then(el => el.closest('li')!)).getByText(
        '보리언니',
      ),
    )
    await waitFor(() => expect(router.state.location.pathname).toBe('/sns/me'))
  })

  it('[AC-SNS04-012] 행에서 팔로우하면 그 행 버튼이 팔로잉으로 바뀐다', async () => {
    seedSns({ likes: [snsLike(SNS_MONG, SNS_POST_COCO)], follows: [snsRelation(SNS_ME, SNS_COCO)] })
    const user = userEvent.setup()
    renderAt(likersPath(SNS_POST_COCO))

    await user.click(await screen.findByRole('button', { name: '몽이아빠 팔로우' }))
    expect(await screen.findByRole('button', { name: '몽이아빠 팔로잉' })).toBeInTheDocument()
    expect(currentSns().follows.some(r => r.from === SNS_ME && r.to === SNS_MONG)).toBe(true)
    expect(likersRequests).toBe(1)
  })

  it('[AC-SNS04-013] 펫 태그는 지금 대표 펫 품종과 오늘 기준 나이이고 생년월이 없으면 품종만 나온다', async () => {
    server.use(
      http.get(SNS_POST_LIKERS_URL, () =>
        HttpResponse.json({
          data: {
            likeCount: 2,
            hasMore: false,
            items: [
              {
                publicId: SNS_COCO,
                nickname: '코코집사',
                profileImageUrl: null,
                pet: { breedLabel: '골든리트리버', birthYearMonth: '2021-03' },
                isMe: false,
                following: true,
              },
              {
                publicId: SNS_MONG,
                nickname: '몽이아빠',
                profileImageUrl: null,
                pet: { breedLabel: '말티즈', birthYearMonth: null },
                isMe: false,
                following: false,
              },
            ],
          },
        }),
      ),
    )
    renderAt(likersPath(SNS_POST_COCO))

    expect(await screen.findByText(`골든리트리버 / ${petAge(2021, 3)}살`)).toBeInTheDocument()
    expect(within(rowOf('몽이아빠')).getByText('말티즈')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '코코집사 팔로잉' })).toBeInTheDocument()
  })

  it('[AC-SNS04-014] 좋아요가 없으면 첫 좋아요를 권하는 빈 상태가 나온다', async () => {
    renderAt(likersPath(SNS_POST_COCO))

    expect(await screen.findByText('아직 좋아요가 없어요')).toBeInTheDocument()
    expect(screen.getByText('이 게시물에 가장 먼저 좋아요를 남겨보세요.')).toBeInTheDocument()
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
  })

  it('[AC-SNS04-014] 좋아요는 있지만 모두 차단 관계면 표시할 사람이 없다는 빈 상태가 나온다', async () => {
    seedSns({ likes: [snsLike(SNS_SPAM, SNS_POST_COCO), snsLike(SNS_BLOCKER, SNS_POST_COCO)] })
    renderAt(likersPath(SNS_POST_COCO))

    expect(await screen.findByText('표시할 사람이 없어요')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.queryByText(/명을 표시했어요/)).not.toBeInTheDocument()
  })

  it.each([
    ['지워진 게시물', SNS_POST_DELETED, '삭제된 게시물이에요'],
    ['내가 차단한 작성자의 게시물', SNS_POST_SPAM, '차단한 계정의 게시물이에요'],
  ])('[AC-SNS04-036] %s은 목록 자리에 안내가 나온다', async (_, publicId, title) => {
    renderAt(likersPath(publicId))
    expect(await screen.findByText(title)).toBeInTheDocument()
  })

  it('[AC-SNS04-007] 주소로 들어온 비로그인에게는 요청 없이 로그인 안내 시트가 열린다', async () => {
    logout()
    seedSns({ viewer: null })
    renderAt(likersPath(SNS_POST_COCO))

    expect(
      await screen.findByText(/좋아요한 사람 목록은 로그인한 회원만 볼 수 있어요/),
    ).toBeInTheDocument()
    expect(likersRequests).toBe(0)
  })
})
