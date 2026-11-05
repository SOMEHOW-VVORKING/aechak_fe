import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createMemoryHistory, createRouter } from '@tanstack/react-router'
import { HttpResponse, delay, http } from 'msw'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { setAccessToken } from '@aechak/api'
import { logout, peekPendingAction, resetAuth } from '@/shared/auth'
import {
  SNS_COCO,
  SNS_ME,
  SNS_MONG,
  SNS_POST_COCO,
  SNS_POST_MINE,
  SNS_REPOST_URL,
  SNS_SAVE_URL,
  WEB_REFRESH_URL,
  currentSns,
  seedSns,
  server,
  snsAct,
  snsRelation,
} from '@/testing/msw/server'
import { routeTree } from '../../../routeTree.gen'

function renderAt(path: string) {
  const router = createRouter({ routeTree, history: createMemoryHistory({ initialEntries: [path] }) })
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, retryDelay: 0 } } })
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

const postPath = (publicId: string) => `/sns/posts/${publicId}`
const EXPLORE = '/sns/feed?tab=explore'

const cardOf = (nickname: string) =>
  screen.getAllByRole('button', { name: `${nickname}님의 게시물 보기` })[0]!.closest('article')!
const repostIn = (scope: HTMLElement) => within(scope).getByRole('button', { name: /^리포스트/ })
const saveIn = (scope: HTMLElement) => within(scope).getByRole('button', { name: '저장' })
// 리포스트 수는 버튼 안 이름 뒤의 숫자다.
const repostCount = (scope: HTMLElement) => within(scope).getByText('리포스트').nextElementSibling?.textContent

const reposted = (user: string, post: string) => currentSns().reposts.some(r => r.user === user && r.post === post)
const saved = (user: string, post: string) => currentSns().saves.some(r => r.user === user && r.post === post)

let reactionRequests: string[] = []
let reactionResponses = 0

beforeEach(() => {
  resetAuth()
  setAccessToken('test-token')
  reactionRequests = []
  reactionResponses = 0
  server.events.on('request:start', ({ request }) => {
    if (/\/(repost|save)$/.test(request.url)) reactionRequests.push(`${request.method} ${new URL(request.url).pathname}`)
  })
  server.events.on('response:mocked', ({ request }) => {
    if (/\/(repost|save)$/.test(request.url)) reactionResponses += 1
  })
})

afterEach(() => {
  server.events.removeAllListeners()
})

describe('리포스트와 저장 버튼', () => {
  it('[AC-SNS03-022] 상세에서 리포스트하면 버튼이 켜지고 수가 1 오르며 다시 누르면 꺼지고 수가 1 준다', async () => {
    const user = userEvent.setup()
    renderAt(postPath(SNS_POST_COCO))
    const article = await screen.findByRole('article')
    expect(repostIn(article)).toHaveAttribute('aria-pressed', 'false')
    expect(repostCount(article)).toBe('0')

    await user.click(repostIn(article))
    expect(repostIn(article)).toHaveAttribute('aria-pressed', 'true')
    expect(repostCount(article)).toBe('1')
    await waitFor(() => expect(reposted(SNS_ME, SNS_POST_COCO)).toBe(true))

    await user.click(repostIn(article))
    expect(repostIn(article)).toHaveAttribute('aria-pressed', 'false')
    expect(repostCount(article)).toBe('0')
    await waitFor(() => expect(reposted(SNS_ME, SNS_POST_COCO)).toBe(false))
  })

  it.each([
    ['리포스트', repostIn, reposted],
    ['저장', saveIn, saved],
  ] as const)('[AC-SNS03-024] %s 버튼을 빠르게 켜고 끄면 요청이 차례로 가서 서버에 남은 상태가 화면과 같다', async (_, button, stored) => {
    // 켜기가 끄기보다 늦게 도착하게 한다. 차례로 보내지 않으면 마지막에 도착한 켜기가 남는다.
    server.use(
      http.all(SNS_REPOST_URL, async ({ request }) => {
        await delay(request.method === 'POST' ? 40 : 5)
      }),
      http.all(SNS_SAVE_URL, async ({ request }) => {
        await delay(request.method === 'POST' ? 40 : 5)
      }),
    )
    const user = userEvent.setup()
    renderAt(EXPLORE)
    await screen.findAllByRole('button', { name: /님의 게시물 보기$/ })

    for (let i = 0; i < 4; i += 1) await user.click(button(cardOf('코코집사')))
    expect(button(cardOf('코코집사'))).toHaveAttribute('aria-pressed', 'false')

    await waitFor(() => expect(reactionResponses).toBe(4))
    expect(stored(SNS_ME, SNS_POST_COCO)).toBe(false)
    expect(button(cardOf('코코집사'))).toHaveAttribute('aria-pressed', 'false')
    expect(repostCount(cardOf('코코집사'))).toBe('0')
  })

  it.each([
    ['리포스트', SNS_REPOST_URL, repostIn],
    ['저장', SNS_SAVE_URL, saveIn],
  ] as const)('[AC-SNS03-025] %s 요청이 실패하면 버튼과 수가 되돌아가고 실패 토스트가 나온다', async (_, url, button) => {
    server.use(
      http.post(url, async () => {
        await delay(30)
        return HttpResponse.json({ errorCode: 90000, message: '' }, { status: 500 })
      }),
    )
    const user = userEvent.setup()
    renderAt(postPath(SNS_POST_COCO))
    const article = await screen.findByRole('article')

    await user.click(button(article))
    expect(button(article)).toHaveAttribute('aria-pressed', 'true')

    expect(await screen.findByText('요청을 처리하지 못했어요. 다시 시도해 주세요')).toBeInTheDocument()
    expect(button(article)).toHaveAttribute('aria-pressed', 'false')
    expect(repostCount(article)).toBe('0')
  })

  it('[AC-SNS03-025] 이어서 누른 요청 가운데 마지막 요청이 실패하면 앞 요청까지 반영된 서버 상태로 돌아간다', async () => {
    // 켜기(성공), 끄기(실패), 켜기(실패) 순서다. 서버에는 첫 켜기만 남는다.
    let posts = 0
    server.use(
      http.post(SNS_REPOST_URL, async () => {
        posts += 1
        await delay(30)
        if (posts > 1) return HttpResponse.json({ errorCode: 90000, message: '' }, { status: 500 })
      }),
      http.delete(SNS_REPOST_URL, () => HttpResponse.json({ errorCode: 90000, message: '' }, { status: 500 })),
    )
    const user = userEvent.setup()
    renderAt(EXPLORE)
    await screen.findAllByRole('button', { name: /님의 게시물 보기$/ })

    for (let i = 0; i < 3; i += 1) await user.click(repostIn(cardOf('코코집사')))
    await waitFor(() => expect(reactionResponses).toBe(3))
    expect(await screen.findByText('요청을 처리하지 못했어요. 다시 시도해 주세요')).toBeInTheDocument()
    expect(reposted(SNS_ME, SNS_POST_COCO)).toBe(true)
    expect(repostIn(cardOf('코코집사'))).toHaveAttribute('aria-pressed', 'true')
    expect(repostCount(cardOf('코코집사'))).toBe('1')
  })

  it('[AC-SNS03-022] 리포스트 요청 중에 지금 탭을 다시 눌러 반영 전 피드를 받아도 요청이 끝나면 카드가 켜지고 수가 1 오른다', async () => {
    server.use(
      http.post(SNS_REPOST_URL, async () => {
        await delay(200)
      }),
    )
    const user = userEvent.setup()
    renderAt(EXPLORE)
    await screen.findAllByRole('button', { name: /님의 게시물 보기$/ })

    await user.click(repostIn(cardOf('코코집사')))
    await user.click(screen.getByRole('tab', { name: '탐색' }))
    // 다시 읽은 피드는 서버가 리포스트를 반영하기 전 값이다.
    await waitFor(() => expect(repostIn(cardOf('코코집사'))).toHaveAttribute('aria-pressed', 'false'))
    expect(reactionResponses).toBe(0)

    await waitFor(() => expect(reactionResponses).toBe(1))
    await waitFor(() => expect(repostIn(cardOf('코코집사'))).toHaveAttribute('aria-pressed', 'true'))
    expect(repostCount(cardOf('코코집사'))).toBe('1')
    expect(reposted(SNS_ME, SNS_POST_COCO)).toBe(true)
  })

  it('[AC-SNS03-023] 내 글의 리포스트 버튼은 상세와 카드에서 잠기고 저장은 된다', async () => {
    const user = userEvent.setup()
    renderAt('/sns/feed')
    await screen.findAllByRole('button', { name: /님의 게시물 보기$/ })
    const card = cardOf('보리언니')
    expect(repostIn(card)).toBeDisabled()
    expect(saveIn(card)).toBeEnabled()
    cleanup()

    renderAt(postPath(SNS_POST_MINE))
    const article = await screen.findByRole('article')
    expect(repostIn(article)).toBeDisabled()
    expect(reactionRequests).toEqual([])

    // [AC-SNS03-031][AC-SNS03-032] 내 글도 저장되고 어떤 수도 바뀌지 않는다.
    await user.click(saveIn(article))
    expect(saveIn(article)).toHaveAttribute('aria-pressed', 'true')
    expect(repostCount(article)).toBe('0')
    await waitFor(() => expect(saved(SNS_ME, SNS_POST_MINE)).toBe(true))
    expect(reactionRequests).toEqual([`POST /api/v1/sns/posts/${SNS_POST_MINE}/save`])
  })

  it('[AC-SNS03-026] 리포스트 카드에서 리포스트하면 원글을 리포스트한다', async () => {
    seedSns({
      follows: [...currentSns().follows, snsRelation(SNS_ME, SNS_MONG)],
      reposts: [snsAct(SNS_MONG, SNS_POST_COCO)],
    })
    const user = userEvent.setup()
    renderAt('/sns/feed')
    expect(await screen.findByText('몽이아빠님이 리포스트했어요')).toBeInTheDocument()
    const card = cardOf('코코집사')
    expect(repostCount(card)).toBe('1')

    await user.click(repostIn(card))
    expect(repostCount(cardOf('코코집사'))).toBe('2')
    await waitFor(() => expect(reposted(SNS_ME, SNS_POST_COCO)).toBe(true))
  })
})

describe('리포스트와 저장 실패 안내', () => {
  it.each([
    ['[AC-SNS03-015][AC-SNS03-027]', '지우기 전에 불러온 카드의 리포스트는 삭제된 게시물 안내다', 'deleted', '삭제된 게시물이에요'],
    ['[AC-SNS03-015][AC-SNS03-028]', '그사이 나를 차단한 작성자의 글은 리포스트할 수 없고 삭제된 게시물 안내다', 'blocking', '삭제된 게시물이에요'],
    ['[AC-SNS03-015]', '그사이 차단한 작성자의 글은 차단한 계정 안내다', 'blocked', '차단한 계정이에요'],
  ] as const)('%s %s', async (_, __, change, message) => {
    const user = userEvent.setup()
    renderAt(EXPLORE)
    await screen.findAllByRole('button', { name: /님의 게시물 보기$/ })
    const sns = currentSns()
    seedSns(
      change === 'deleted'
        ? { ...sns, posts: sns.posts.map(p => (p.publicId === SNS_POST_COCO ? { ...p, deleted: true } : p)) }
        : {
            ...sns,
            blocks: [...sns.blocks, change === 'blocking' ? snsRelation(SNS_COCO, SNS_ME) : snsRelation(SNS_ME, SNS_COCO)],
          },
    )

    await user.click(repostIn(cardOf('코코집사')))
    expect(await screen.findByText(message)).toBeInTheDocument()
    expect(repostIn(cardOf('코코집사'))).toHaveAttribute('aria-pressed', 'false')
    expect(repostCount(cardOf('코코집사'))).toBe('0')
    expect(reposted(SNS_ME, SNS_POST_COCO)).toBe(false)
  })

  it('이용 제한 계정은 이용 제한 안내다(403 20013)', async () => {
    seedSns({ restricted: [SNS_ME] })
    const user = userEvent.setup()
    renderAt(postPath(SNS_POST_COCO))

    await user.click(saveIn(await screen.findByRole('article')))
    expect(await screen.findByText('이용이 제한된 계정이라 이 기능을 사용할 수 없어요')).toBeInTheDocument()
    expect(saveIn(screen.getByRole('article'))).toHaveAttribute('aria-pressed', 'false')
  })

  it('빈도 제한은 HTTP 429로 보고 develop의 90006(404 경로 없음)은 일반 실패 안내다', async () => {
    server.use(http.post(SNS_REPOST_URL, () => HttpResponse.json({ errorCode: 90006, message: '' }, { status: 429 })))
    const user = userEvent.setup()
    renderAt(postPath(SNS_POST_COCO))
    await user.click(repostIn(await screen.findByRole('article')))
    expect(await screen.findByText('잠시 후 다시 시도해 주세요')).toBeInTheDocument()
    cleanup()

    server.use(http.post(SNS_SAVE_URL, () => HttpResponse.json({ errorCode: 90006, message: '' }, { status: 404 })))
    renderAt(postPath(SNS_POST_COCO))
    await user.click(saveIn(await screen.findByRole('article')))
    expect(await screen.findByText('요청을 처리하지 못했어요. 다시 시도해 주세요')).toBeInTheDocument()
  })
})

describe('비로그인 리포스트와 저장', () => {
  it('[AC-SNS03-021] 비로그인 카드는 수가 그대로 나오고 버튼이 꺼져 있으며 누르면 요청 없이 로그인 안내 시트가 열린다', async () => {
    asGuest()
    seedSns({ viewer: null, reposts: [snsAct(SNS_MONG, SNS_POST_COCO)] })
    const user = userEvent.setup()
    const router = renderAt('/sns/feed')
    await screen.findAllByRole('button', { name: /님의 게시물 보기$/ })
    const card = cardOf('코코집사')
    expect(repostCount(card)).toBe('1')
    expect(repostIn(card)).toHaveAttribute('aria-pressed', 'false')
    expect(saveIn(card)).toHaveAttribute('aria-pressed', 'false')

    await user.click(repostIn(card))
    expect(await screen.findByText(/리포스트는 로그인한 회원만 이용할 수 있어요/)).toBeInTheDocument()
    // 로그인 뒤 같은 탭으로 돌아오게 지금 탭(탐색)을 주소에 적는다.
    expect(router.state.location.search).toEqual({ tab: 'explore' })
    await user.click(screen.getByRole('button', { name: '둘러보기 계속하기' }))

    await user.click(saveIn(cardOf('코코집사')))
    expect(await screen.findByText(/저장은 로그인한 회원만 이용할 수 있어요/)).toBeInTheDocument()
    expect(reactionRequests).toEqual([])
  })

  // 로그인은 페이지 전체를 이동한다. 화면을 내리고 refresh 쿠키가 생긴 상태로 /login/complete를 새로 연다.
  async function loginAndReturn(guestRouter: ReturnType<typeof renderAt>, seed: Parameters<typeof seedSns>[0] = {}) {
    await userEvent.click(await screen.findByRole('button', { name: '로그인 / 회원가입' }))
    await waitFor(() => expect(guestRouter.state.location.pathname).toBe('/onboarding/login'))
    cleanup()
    server.use(
      http.post(WEB_REFRESH_URL, () =>
        HttpResponse.json({ data: { accessToken: 'access', tokenType: 'Bearer', expiresIn: 900 } }),
      ),
    )
    seedSns({ viewer: SNS_ME, ...seed })
    return renderAt('/login/complete?status=ACTIVE&isNew=false')
  }

  it('[AC-SNS03-047] 카드에서 저장을 누르고 로그인을 마치면 같은 탭으로 돌아와 확인 없이 한 번 저장된다', async () => {
    asGuest()
    const user = userEvent.setup()
    const guestRouter = renderAt('/sns/feed')
    await screen.findAllByRole('button', { name: /님의 게시물 보기$/ })
    await user.click(saveIn(cardOf('코코집사')))

    const router = await loginAndReturn(guestRouter)
    await waitFor(() => expect(router.state.location.pathname).toBe('/sns/feed'))
    expect(router.state.location.search).toEqual({ tab: 'explore' })
    await waitFor(() => expect(saveIn(cardOf('코코집사'))).toHaveAttribute('aria-pressed', 'true'))
    await waitFor(() => expect(saved(SNS_ME, SNS_POST_COCO)).toBe(true))
    expect(reactionRequests).toEqual([`POST /api/v1/sns/posts/${SNS_POST_COCO}/save`])
    expect(sessionStorage.length).toBe(0)
  })

  it('[AC-SNS03-047] 상세에서 리포스트를 누르고 로그인을 마치면 상세로 돌아와 확인 없이 한 번 리포스트된다', async () => {
    asGuest()
    const user = userEvent.setup()
    const guestRouter = renderAt(postPath(SNS_POST_COCO))
    await user.click(repostIn(await screen.findByRole('article')))

    const router = await loginAndReturn(guestRouter)
    await waitFor(() => expect(router.state.location.pathname).toBe(postPath(SNS_POST_COCO)))
    await waitFor(() => expect(repostIn(screen.getByRole('article'))).toHaveAttribute('aria-pressed', 'true'))
    expect(repostCount(screen.getByRole('article'))).toBe('1')
    await waitFor(() => expect(reposted(SNS_ME, SNS_POST_COCO)).toBe(true))
    expect(reactionRequests).toEqual([`POST /api/v1/sns/posts/${SNS_POST_COCO}/repost`])
  })

  it('[AC-SNS03-047] 그사이 지워진 글은 반영하지 않고 피드는 삭제된 게시물 안내, 상세는 삭제된 게시물 화면만 보여준다', async () => {
    const cocoDeleted = { posts: currentSns().posts.map(p => (p.publicId === SNS_POST_COCO ? { ...p, deleted: true } : p)) }
    asGuest()
    const user = userEvent.setup()
    const feedRouter = renderAt('/sns/feed')
    await screen.findAllByRole('button', { name: /님의 게시물 보기$/ })
    await user.click(repostIn(cardOf('코코집사')))
    await loginAndReturn(feedRouter, cocoDeleted)

    expect(await screen.findByText('삭제된 게시물이에요')).toBeInTheDocument()
    expect(reposted(SNS_ME, SNS_POST_COCO)).toBe(false)
    expect(sessionStorage.length).toBe(0)
    cleanup()

    asGuest()
    reactionRequests = []
    const detailRouter = renderAt(postPath(SNS_POST_COCO))
    await user.click(saveIn(await screen.findByRole('article')))
    await loginAndReturn(detailRouter, cocoDeleted)

    expect(await screen.findByText('게시물이 삭제되어 더 이상 볼 수 없어요.')).toBeInTheDocument()
    expect(reactionRequests).toEqual([])
    expect(sessionStorage.length).toBe(0)
  })

  it.each([
    ['리포스트', SNS_REPOST_URL, repostIn],
    ['저장', SNS_SAVE_URL, saveIn],
  ] as const)('[AC-SNS03-047] 이미 %s한 계정으로 로그인한 뒤 다시 켜기가 실패해도 켜진 상태와 수를 그대로 둔다', async (_, url, button) => {
    const already = { reposts: [snsAct(SNS_ME, SNS_POST_COCO)], saves: [snsAct(SNS_ME, SNS_POST_COCO)] }
    asGuest()
    seedSns({ viewer: null, ...already })
    const user = userEvent.setup()
    const guestRouter = renderAt('/sns/feed')
    await screen.findAllByRole('button', { name: /님의 게시물 보기$/ })
    await user.click(button(cardOf('코코집사')))
    server.use(http.post(url, () => HttpResponse.json({ errorCode: 90000, message: '' }, { status: 500 })))

    await loginAndReturn(guestRouter, already)
    expect(await screen.findByText('요청을 처리하지 못했어요. 다시 시도해 주세요')).toBeInTheDocument()
    expect(button(cardOf('코코집사'))).toHaveAttribute('aria-pressed', 'true')
    expect(repostCount(cardOf('코코집사'))).toBe('1')
  })

  it('[A9][A26] 인기 탭에서 팔로잉 탭을 누르고 로그인하면 돌아올 주소가 팔로잉 탭이다', async () => {
    asGuest()
    const user = userEvent.setup()
    const router = renderAt('/sns/feed?tab=popular')
    await screen.findByRole('tab', { name: '인기', selected: true })
    await user.click(screen.getByRole('tab', { name: '팔로잉' }))
    expect(await screen.findByText(/팔로잉 피드는 로그인한 회원만 볼 수 있어요/)).toBeInTheDocument()
    // 로그인 안내 시트 뒤의 피드는 보던 인기 탭 그대로다.
    expect(screen.getByRole('tab', { name: '인기' })).toHaveAttribute('aria-selected', 'true')
    expect(router.state.location.search).toEqual({ tab: 'popular' })

    await user.click(screen.getByRole('button', { name: '로그인 / 회원가입' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/onboarding/login'))
    expect(peekPendingAction()?.returnTo).toBe('/sns/feed?tab=following')
  })

  // 차단과 뮤트는 확인이 더 필요한 행동이라 로그인 뒤 확인 Modal이나 더보기 시트만 다시 연다(A26).
  it('[A26] 카드 더보기에서 차단을 누르고 로그인을 마치면 같은 탭으로 돌아와 그 작성자의 차단 확인이 다시 열린다', async () => {
    asGuest()
    const user = userEvent.setup()
    const guestRouter = renderAt('/sns/feed')
    await screen.findByRole('button', { name: '몽이아빠님의 게시물 보기' })
    await user.click(within(cardOf('몽이아빠')).getByRole('button', { name: '더보기' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '차단하기' }))

    const router = await loginAndReturn(guestRouter)
    const modal = await screen.findByRole('dialog', { name: '차단할까요?' })
    expect(router.state.location.search).toEqual({ tab: 'explore' })
    expect(within(modal).getByText(/^몽이아빠님과 서로의 게시물을/)).toBeInTheDocument()
    await user.click(within(modal).getByRole('button', { name: '차단' }))
    expect(await screen.findByText('차단했어요')).toBeInTheDocument()
    expect(currentSns().blocks.some(r => r.from === SNS_ME && r.to === SNS_MONG)).toBe(true)
    expect(sessionStorage.length).toBe(0)
  })

  it('[A26] 카드 더보기에서 뮤트를 누르고 로그인을 마치면 같은 탭으로 돌아와 그 글의 더보기 시트가 다시 열린다', async () => {
    asGuest()
    const user = userEvent.setup()
    const guestRouter = renderAt('/sns/feed')
    await screen.findByRole('button', { name: '몽이아빠님의 게시물 보기' })
    await user.click(within(cardOf('몽이아빠')).getByRole('button', { name: '더보기' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '뮤트하기' }))

    await loginAndReturn(guestRouter)
    const sheet = await screen.findByRole('dialog')
    expect(within(sheet).getAllByRole('button').map(b => b.textContent)).toEqual(['링크 복사', '뮤트하기', '차단하기'])
    await user.click(within(sheet).getByRole('button', { name: '뮤트하기' }))
    expect(await screen.findByText('뮤트했어요')).toBeInTheDocument()
    expect(currentSns().mutes.some(r => r.from === SNS_ME && r.to === SNS_MONG)).toBe(true)
    expect(sessionStorage.length).toBe(0)
  })
})
