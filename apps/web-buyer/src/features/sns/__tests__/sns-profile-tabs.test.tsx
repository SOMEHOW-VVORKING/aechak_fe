import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createMemoryHistory, createRouter } from '@tanstack/react-router'
import { HttpResponse, http } from 'msw'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { setAccessToken } from '@aechak/api'
import { logout, resetAuth } from '@/shared/auth'
import {
  SNS_BLOCKER,
  SNS_COCO,
  SNS_ME,
  SNS_MONG,
  SNS_MUTUAL,
  SNS_NEIGHBORS,
  SNS_POST_COCO,
  SNS_POST_MINE,
  SNS_POST_NO_CAPTION,
  SNS_POST_TORI,
  SNS_POST_VIDEO,
  SNS_SPAM,
  SNS_TORI,
  SNS_USER_POSTS_URL,
  currentSns,
  seedSns,
  server,
  snsAct,
  snsPost,
  snsRelation,
} from '@/testing/msw/server'
import { setListEndInView } from '@/testing/intersection'
import { routeTree } from '../../../routeTree.gen'

// staleTime: 앱과 같은 값이면 화면을 다시 열어도 캐시만 쓴다. 캐시를 직접 고치는 처리(칸 빼기, 지우기)를 확인할 때 쓴다.
function renderAt(path: string, staleTime = 0) {
  const router = createRouter({ routeTree, history: createMemoryHistory({ initialEntries: [path] }) })
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, retryDelay: 0, staleTime } } })
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return router
}

function asGuest() {
  logout()
  seedSns({ viewer: null })
}

const COCO_VIDEO = '01JR00000000000000000000V1'
const COCO_TEXT = '01JR00000000000000000000T1'

/** 코코집사의 사진 2장(기본), 영상, 텍스트 게시물과 리포스트 둘(영상, 몽이아빠 글 순서로 리포스트) */
function seedCocoPosts() {
  seedSns({
    posts: [
      ...currentSns().posts,
      snsPost(COCO_VIDEO, SNS_COCO, {
        video: {
          url: 'https://cdn.aechak.com/sns/posts/videos/coco.mp4',
          thumbnailUrl: 'https://cdn.aechak.com/sns/posts/images/coco-thumb.jpg',
          durationMs: 30000,
        },
      }),
      snsPost(COCO_TEXT, SNS_COCO, { caption: '오늘은 사진 없이 글만 남겨요' }),
    ],
    reposts: [snsAct(SNS_COCO, SNS_POST_VIDEO), snsAct(SNS_COCO, SNS_POST_NO_CAPTION)],
  })
}

const postTabs = () => within(screen.getByRole('tablist', { name: '게시물 목록' }))
/** 지금 탭의 칸 이름(본문 앞부분이나 종류와 장수) */
function cellsIn() {
  const list = screen.queryByRole('list', { name: '게시물' })
  return list ? within(list).getAllByRole('button').map(cell => cell.getAttribute('aria-label')) : []
}

let tabRequests: URL[] = []

beforeEach(() => {
  resetAuth()
  setAccessToken('test-token')
  tabRequests = []
  server.events.on('request:start', ({ request }) => {
    if (request.method === 'GET' && /\/sns\/(users\/[^/]+\/(posts|videos|reposts)|me\/saves)$/.test(new URL(request.url).pathname)) {
      tabRequests.push(new URL(request.url))
    }
  })
})

afterEach(() => {
  server.events.removeAllListeners()
})

describe('프로필 게시물 탭', () => {
  it('[AC-SNS03-036] 그리드는 모든 원글, 영상 탭은 영상만, 리포스트 탭은 최근 리포스트순이고 칸에 여러 장, 재생, 본문 앞부분이 나온다', async () => {
    seedCocoPosts()
    const user = userEvent.setup()
    renderAt(`/sns/users/${SNS_COCO}`)

    await waitFor(() => expect(cellsIn()).toEqual(['오늘은 사진 없이 글만 남겨요', '영상 게시물', '사진 2장 게시물']))
    const photo = screen.getByRole('button', { name: '사진 2장 게시물' })
    expect(within(photo).getByRole('presentation')).toHaveAttribute('src', 'https://cdn.aechak.com/sns/posts/images/coco-1.jpg')
    expect(screen.getByRole('button', { name: '오늘은 사진 없이 글만 남겨요' })).toHaveTextContent('오늘은 사진 없이 글만 남겨요')

    await user.click(postTabs().getByRole('tab', { name: '영상' }))
    await waitFor(() => expect(cellsIn()).toEqual(['영상 게시물']))

    await user.click(postTabs().getByRole('tab', { name: '리포스트' }))
    await waitFor(() => expect(cellsIn()).toEqual(['사진 게시물', '영상 게시물']))
  })

  it('프로필은 아이콘 탭과 하단 탭바를 그리고 하단 탭바는 SNS가 선택돼 있다(SNS-01 F5)', async () => {
    renderAt(`/sns/users/${SNS_COCO}`)
    const tabs = await screen.findByRole('tablist', { name: '게시물 목록' })
    expect(within(tabs).getByRole('tab', { name: '그리드' })).toHaveTextContent('')
    expect(screen.getByRole('tab', { name: 'SNS' })).toHaveAttribute('aria-selected', 'true')
  })

  it('[AC-SNS03-038] 비로그인도 탭을 보고 칸을 누르면 상세가 열리며 돌아오면 보던 탭이 남아 있다', async () => {
    asGuest()
    seedCocoPosts()
    seedSns({ ...currentSns(), viewer: null })
    const user = userEvent.setup()
    const router = renderAt(`/sns/users/${SNS_COCO}`)

    await user.click(await screen.findByRole('tab', { name: '영상' }))
    expect(router.state.location.search).toEqual({ tab: 'video' })
    await user.click(await screen.findByRole('button', { name: '영상 게시물' }))
    await waitFor(() => expect(router.state.location.pathname).toBe(`/sns/posts/${COCO_VIDEO}`))
    expect(router.state.location.search).toEqual({ author: SNS_COCO })

    act(() => router.history.back())
    await waitFor(() => expect(router.state.location.pathname).toBe(`/sns/users/${SNS_COCO}`))
    expect(await screen.findByRole('tab', { name: '영상' })).toHaveAttribute('aria-selected', 'true')
    await waitFor(() => expect(cellsIn()).toEqual(['영상 게시물']))
  })

  it.each([
    ['그리드', '아직 게시물이 없어요'],
    ['영상', '아직 영상이 없어요'],
    ['리포스트', '아직 리포스트가 없어요'],
  ])('[AC-SNS03-041] 글이 없는 %s 탭은 빈 상태 안내다', async (tab, empty) => {
    const user = userEvent.setup()
    renderAt(`/sns/users/${SNS_NEIGHBORS[0]}`)
    await user.click(await screen.findByRole('tab', { name: tab }))
    expect(await screen.findByText(empty)).toBeInTheDocument()
  })

  it('[AC-SNS03-010] 첫 로딩은 스켈레톤 칸이고 끝까지 내리면 더 부르지 않는다', async () => {
    seedSns({
      posts: [
        ...currentSns().posts,
        ...Array.from({ length: 25 }, (_, i) =>
          snsPost(`01JR${String(i + 1).padStart(22, '0')}`, SNS_NEIGHBORS[0]!, { caption: `이웃 글 ${i + 1}` }),
        ),
      ],
    })
    renderAt(`/sns/users/${SNS_NEIGHBORS[0]}`)

    expect(await screen.findByRole('status', { name: '게시물을 불러오는 중' })).toBeInTheDocument()
    await waitFor(() => expect(cellsIn()).toHaveLength(20))
    expect(cellsIn()[0]).toBe('이웃 글 25')

    setListEndInView(true)
    await waitFor(() => expect(cellsIn()).toHaveLength(25))
    expect(cellsIn().at(-1)).toBe('이웃 글 1')
    expect(tabRequests).toHaveLength(2)
    expect(tabRequests[1]!.searchParams.get('cursor')).toMatch(/^gp\|/)
  })
})

describe('차단과 뮤트 관계의 프로필 탭', () => {
  it.each([
    ['내가 차단한 사용자', SNS_SPAM, '차단한 계정이에요'],
    ['나를 차단한 사용자', SNS_BLOCKER, '차단러'],
    ['서로 차단한 사용자', SNS_MUTUAL, '맞차단러'],
  ])('[AC-SNS03-039] %s의 프로필은 어느 탭도 없고 탭 요청을 보내지 않는다', async (_, publicId, text) => {
    renderAt(`/sns/users/${publicId}`)
    expect((await screen.findAllByText(text)).length).toBeGreaterThan(0)
    expect(screen.queryByRole('tablist', { name: '게시물 목록' })).not.toBeInTheDocument()
    expect(tabRequests).toEqual([])
  })

  it('[AC-SNS03-040] 뮤트한 사용자의 프로필은 뮤트 표시와 함께 글을 보여주고 다른 사람 리포스트 탭에서는 그 사용자의 글이 빠진다', async () => {
    seedSns({ reposts: [snsAct(SNS_COCO, SNS_POST_TORI), snsAct(SNS_COCO, SNS_POST_VIDEO)] })
    const user = userEvent.setup()
    renderAt(`/sns/users/${SNS_TORI}`)
    expect(await screen.findByText('뮤트한 계정이에요')).toBeInTheDocument()
    await waitFor(() => expect(cellsIn()).toEqual(['사진 게시물']))
    await user.click(postTabs().getByRole('tab', { name: '리포스트' }))
    expect(await screen.findByText('아직 리포스트가 없어요')).toBeInTheDocument()
  })

  it('뮤트하면 받아 둔 프로필 탭을 지워 다른 사람 리포스트 탭을 다시 읽는다', async () => {
    seedSns({ reposts: [snsAct(SNS_COCO, SNS_POST_NO_CAPTION), snsAct(SNS_COCO, SNS_POST_VIDEO)] })
    const user = userEvent.setup()
    const router = renderAt(`/sns/users/${SNS_COCO}?tab=repost`, 60_000)
    await waitFor(() => expect(cellsIn()).toEqual(['영상 게시물', '사진 게시물']))

    await act(() => router.navigate({ to: '/sns/users/$publicId', params: { publicId: SNS_MONG } }))
    await user.click(await screen.findByRole('button', { name: '더보기' }))
    await user.click(await screen.findByText('뮤트하기'))
    expect(await screen.findByText('뮤트했어요')).toBeInTheDocument()

    await act(() => router.navigate({ to: '/sns/users/$publicId', params: { publicId: SNS_COCO }, search: { tab: 'repost' } }))
    await waitFor(() => expect(cellsIn()).toEqual(['영상 게시물']))
  })
})

describe('프로필 탭 목록 실패', () => {
  function seedManyCocoPosts() {
    seedSns({
      posts: [
        ...currentSns().posts,
        ...Array.from({ length: 25 }, (_, i) =>
          snsPost(`01JR${String(i + 1).padStart(22, '0')}`, SNS_COCO, { caption: `코코 글 ${i + 1}` }),
        ),
      ],
    })
  }

  it('[AC-SNS03-014] 첫 조회 실패는 네트워크 오류 안내와 다시 시도다', async () => {
    let fail = true
    server.use(
      http.get(SNS_USER_POSTS_URL, () => (fail ? HttpResponse.json({ errorCode: 90000, message: '' }, { status: 500 }) : undefined)),
    )
    const user = userEvent.setup()
    renderAt(`/sns/users/${SNS_COCO}`)
    expect(await screen.findByText('네트워크에 연결할 수 없어요')).toBeInTheDocument()

    fail = false
    await user.click(screen.getByRole('button', { name: '다시 시도' }))
    await waitFor(() => expect(cellsIn()).toEqual(['사진 2장 게시물']))
  })

  it('다음 페이지가 403 130001이면 프로필을 다시 읽어 차단한 계정 안내로 바꾼다', async () => {
    seedManyCocoPosts()
    renderAt(`/sns/users/${SNS_COCO}`)
    await waitFor(() => expect(cellsIn()).toHaveLength(20))

    seedSns({ ...currentSns(), blocks: [...currentSns().blocks, snsRelation(SNS_ME, SNS_COCO)] })
    setListEndInView(true)
    expect(await screen.findByText('차단한 계정이에요')).toBeInTheDocument()
    expect(screen.queryByRole('tablist', { name: '게시물 목록' })).not.toBeInTheDocument()
  })

  it('다음 페이지가 404 130000이면 프로필을 다시 읽어 같은 응답의 안내(나를 차단한 사용자의 기본 프로필)로 바꾼다', async () => {
    seedManyCocoPosts()
    renderAt(`/sns/users/${SNS_COCO}`)
    await waitFor(() => expect(cellsIn()).toHaveLength(20))

    seedSns({ ...currentSns(), blocks: [...currentSns().blocks, snsRelation(SNS_COCO, SNS_ME)] })
    setListEndInView(true)
    await waitFor(() => expect(screen.queryByRole('tablist', { name: '게시물 목록' })).not.toBeInTheDocument())
    expect(screen.getAllByText('코코집사').length).toBeGreaterThan(0)
    expect(screen.queryByText('팔로워')).not.toBeInTheDocument()
  })

  it('다음 페이지가 400 90002면 그 탭을 첫 페이지부터 다시 연다', async () => {
    seedManyCocoPosts()
    // 커서가 한 번 만료된다.
    let expire = false
    server.use(
      http.get(SNS_USER_POSTS_URL, ({ request }) => {
        if (!expire || !new URL(request.url).searchParams.has('cursor')) return undefined
        expire = false
        return HttpResponse.json({ errorCode: 90002, message: '' }, { status: 400 })
      }),
    )
    renderAt(`/sns/users/${SNS_COCO}`)
    await waitFor(() => expect(cellsIn()).toHaveLength(20))

    expire = true
    setListEndInView(true)
    await waitFor(() => expect(cellsIn()).toHaveLength(26))
    expect(tabRequests.map(url => url.searchParams.has('cursor'))).toEqual([false, true, false, true])
  })
})

describe('내 프로필 탭과 캐시', () => {
  it('[AC-SNS03-022] 리포스트를 끄면 내 리포스트 탭에서 그 칸을 빼고 켜면 다음에 열 때 맨 위에 나온다', async () => {
    seedSns({ reposts: [snsAct(SNS_ME, SNS_POST_VIDEO), snsAct(SNS_ME, SNS_POST_COCO)] })
    const user = userEvent.setup()
    const router = renderAt('/sns/me?tab=repost', 60_000)
    await waitFor(() => expect(cellsIn()).toEqual(['사진 2장 게시물', '영상 게시물']))

    await user.click(screen.getByRole('button', { name: '사진 2장 게시물' }))
    await user.click(await screen.findByRole('button', { name: /^리포스트/, pressed: true }))
    await waitFor(() => expect(currentSns().reposts.some(r => r.post === SNS_POST_COCO)).toBe(false))
    act(() => router.history.back())
    await waitFor(() => expect(cellsIn()).toEqual(['영상 게시물']))

    await act(() => router.navigate({ to: '/sns/posts/$publicId', params: { publicId: SNS_POST_NO_CAPTION } }))
    await user.click(await screen.findByRole('button', { name: /^리포스트/, pressed: false }))
    await waitFor(() => expect(currentSns().reposts.some(r => r.post === SNS_POST_NO_CAPTION)).toBe(true))
    await act(() => router.navigate({ to: '/sns/me', search: { tab: 'repost' } }))
    await waitFor(() => expect(cellsIn()).toEqual(['사진 게시물', '영상 게시물']))
  })

  it('내 글을 지우면 받아 둔 그리드에서 그 칸을 뺀다', async () => {
    const user = userEvent.setup()
    renderAt('/sns/me', 60_000)
    await waitFor(() => expect(cellsIn()).toEqual(['사진 2장 게시물', '산책 코스 추천받아요']))

    await user.click(screen.getByRole('button', { name: '산책 코스 추천받아요' }))
    await user.click(await screen.findByRole('button', { name: '더보기' }))
    await user.click(await screen.findByRole('button', { name: '삭제' }))
    await user.click(within(await screen.findByRole('dialog', { name: '게시물을 삭제할까요?' })).getByRole('button', { name: '삭제' }))
    await waitFor(() => expect(cellsIn()).toEqual(['사진 2장 게시물']))
    expect(currentSns().posts.find(p => p.publicId === SNS_POST_MINE)?.deleted).toBe(true)
  })
})
