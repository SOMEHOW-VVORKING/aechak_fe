import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createMemoryHistory, createRouter } from '@tanstack/react-router'
import { HttpResponse, http } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setAccessToken } from '@aechak/api'
import { logout, resetAuth } from '@/shared/auth'
import {
  SNS_COCO,
  SNS_ME,
  SNS_POST_BLOCKER,
  SNS_POST_COCO,
  SNS_POST_DELETED,
  SNS_POST_MINE,
  SNS_POST_NO_CAPTION,
  SNS_POST_SPAM,
  SNS_POST_TORI,
  SNS_POST_VIDEO,
  SNS_BLOCK_URL,
  SNS_POST_URL,
  SNS_SPAM,
  WEB_REFRESH_URL,
  currentSns,
  seedSns,
  server,
  snsPost,
} from '@/testing/msw/server'
import { routeTree } from '../../../routeTree.gen'

function renderAt(
  path: string,
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } }),
) {
  const router = createRouter({ routeTree, history: createMemoryHistory({ initialEntries: [path] }) })
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

// 수는 아이콘 옆 숫자이고 이름은 화면 읽기 프로그램용 글자다.
const count = (label: string) => screen.getByText(label).nextElementSibling?.textContent

let followPosts = 0

beforeEach(() => {
  resetAuth()
  setAccessToken('test-token')
  followPosts = 0
  server.events.on('request:start', ({ request }) => {
    if (request.method === 'POST' && /\/sns\/users\/[^/]+\/follow$/.test(request.url)) followPosts += 1
  })
})

afterEach(() => {
  server.events.removeAllListeners()
  vi.useRealTimers()
})

describe('/sns/posts/$publicId 게시물 영역', () => {
  it('[AC-SNS02-004] 텍스트 게시물은 미디어 자리 없이 캡션과 게시 시각을 보여준다', async () => {
    renderAt(postPath(SNS_POST_MINE))

    expect(await screen.findByText('산책 코스 추천받아요')).toBeInTheDocument()
    expect(screen.queryByRole('img', { name: /사진/ })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('영상')).not.toBeInTheDocument()
    expect(screen.getByText('2026.10.21 오후 6:00')).toBeInTheDocument()
    expect(screen.queryByText('수정됨')).not.toBeInTheDocument()
  })

  it('[AC-SNS02-009] 사진은 작성자가 정한 순서대로 나온다', async () => {
    renderAt(postPath(SNS_POST_COCO))

    const photos = await screen.findAllByRole('img', { name: /^사진/ })
    expect(photos.map(img => img.getAttribute('alt'))).toEqual(['사진 1/2', '사진 2/2'])
    expect(photos[0]).toHaveAttribute('src', 'https://cdn.aechak.com/sns/posts/images/coco-1.jpg')
    expect(within(screen.getByRole('list', { name: '해시태그' })).getAllByRole('listitem').map(li => li.textContent)).toEqual([
      '#산책',
      '#골든리트리버',
    ])
  })

  it('[AC-SNS02-016] 캡션 없는 사진 게시물은 캡션 자리 없이 미디어와 해시태그만 보인다', async () => {
    renderAt(postPath(SNS_POST_NO_CAPTION))

    expect(await screen.findByRole('img', { name: '사진 1/1' })).toBeInTheDocument()
    expect(screen.getByRole('list', { name: '해시태그' })).toHaveTextContent('#산책')
    const article = screen.getByRole('article')
    expect(article.querySelectorAll('p.whitespace-pre-line')).toHaveLength(0)
  })

  it('영상 게시물은 썸네일을 포스터로 쓰는 재생기를 보여준다', async () => {
    renderAt(postPath(SNS_POST_VIDEO))

    const video = await screen.findByLabelText('영상')
    expect(video).toHaveAttribute('src', 'https://cdn.aechak.com/sns/posts/videos/choco.mp4')
    expect(video).toHaveAttribute('poster', 'https://cdn.aechak.com/sns/posts/images/choco-thumb.jpg')
  })

  it('[AC-SNS02-017] 펫 태그는 게시일 기준 나이이고 생년월이 없으면 품종만, 펫이 없으면 자리를 비운다', async () => {
    // 오늘이 몇 년이 지나도 게시일(2026-10-22) 기준 나이다. 2021-03생은 5살.
    vi.setSystemTime(new Date(2031, 0, 1))
    const breedOnly = '01JF9W3Q6R8T2V4X7Z9B1C3D7A'
    const noPet = '01JF9W3Q6R8T2V4X7Z9B1C3D7B'
    seedSns({
      posts: [
        ...currentSns().posts,
        snsPost(breedOnly, SNS_COCO, { caption: '말티즈', pet: { breedLabel: '말티즈', birthYearMonth: null } }),
        snsPost(noPet, SNS_COCO, { caption: '펫 없음', pet: null }),
      ],
    })
    renderAt(postPath(SNS_POST_COCO))
    expect(await screen.findByText('골든리트리버 / 5살')).toBeInTheDocument()
    cleanup()

    renderAt(postPath(breedOnly))
    expect(await screen.findByText('말티즈', { selector: 'span' })).toBeInTheDocument()
    expect(screen.queryByText(/살$/)).not.toBeInTheDocument()
    cleanup()

    renderAt(postPath(noPet))
    expect(await screen.findByText('펫 없음')).toBeInTheDocument()
    expect(screen.queryByText(/골든리트리버|말티즈 \//)).not.toBeInTheDocument()
  })

  it('[AC-SNS02-018][AC-SNS03-020] 좋아요, 댓글, 리포스트 수가 보이고 저장 수는 작성자에게도 보이지 않는다', async () => {
    renderAt(postPath(SNS_POST_MINE))

    expect(await screen.findByText('리포스트')).toBeInTheDocument()
    expect([count('좋아요'), count('댓글'), count('리포스트')]).toEqual(['0', '0', '0'])
    // 저장 버튼은 아이콘만 그린다.
    expect(screen.getByRole('button', { name: '저장' }).textContent).toBe('')
    // 좋아요와 댓글 버튼은 SNS-04가 붙인다(G-C2).
    expect(screen.queryByRole('button', { name: /좋아요|댓글/ })).not.toBeInTheDocument()
  })

  it('[AC-SNS02-024] 수정한 게시물에는 수정됨 표시가 붙는다', async () => {
    seedSns({ posts: currentSns().posts.map(p => (p.publicId === SNS_POST_COCO ? { ...p, edited: true } : p)) })
    renderAt(postPath(SNS_POST_COCO))

    expect(await screen.findByText('수정됨')).toBeInTheDocument()
  })
})

describe('/sns/posts/$publicId 볼 수 없는 게시물', () => {
  it.each([
    ['작성자가 지운 게시물', SNS_POST_DELETED],
    ['없는 게시물', '01JF9W3Q6R8T2V4X7Z9B1C3ZZZ'],
    ['나를 차단한 작성자', SNS_POST_BLOCKER],
  ])('[AC-SNS02-019] %s는 삭제된 게시물 안내다', async (_, publicId) => {
    renderAt(postPath(publicId))

    expect(await screen.findByText('삭제된 게시물이에요')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '더보기' })).not.toBeInTheDocument()
  })

  it('[AC-SNS02-020] 공유 링크로 연 차단한 작성자의 게시물은 차단 관리 이동만 보여준다', async () => {
    const user = userEvent.setup()
    const router = renderAt(postPath(SNS_POST_SPAM))

    expect(await screen.findByText('차단한 계정의 게시물이에요')).toBeInTheDocument()
    expect(screen.queryByText('광고 게시물')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '프로필 보기' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '차단 관리' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/mypage/sns-relations'))
  })

  it('[AC-SNS02-020] 작성자를 알고 들어오면 프로필 이동도 보여준다', async () => {
    const user = userEvent.setup()
    const router = renderAt(`${postPath(SNS_POST_SPAM)}?author=${SNS_SPAM}`)

    await user.click(await screen.findByRole('button', { name: '프로필 보기' }))
    await waitFor(() => expect(router.state.location.pathname).toBe(`/sns/users/${SNS_SPAM}`))
  })

  it('조회가 5xx로 실패하면 한 번 더 보낸 뒤 다시 시도를 보여준다', async () => {
    let down = true
    let calls = 0
    server.use(
      http.get(`*/sns/posts/${SNS_POST_COCO}`, () => {
        if (!down) return undefined
        calls += 1
        return new HttpResponse(null, { status: 500 })
      }),
    )
    const user = userEvent.setup()
    // 앱 기본처럼 재시도를 켠 QueryClient로 상세 조회의 재시도 판정만 본다(retryDelay 0으로 바로 재시도).
    renderAt(postPath(SNS_POST_COCO), new QueryClient({ defaultOptions: { queries: { retry: 3, retryDelay: 0 } } }))

    const retry = await screen.findByRole('button', { name: '다시 시도' })
    expect(calls).toBe(2)
    down = false
    await user.click(retry)
    expect(await screen.findByText('오늘 코코랑 한강 산책')).toBeInTheDocument()
  })
})

describe('/sns/posts/$publicId 팔로우, 더보기, 공유', () => {
  it('내 게시물은 팔로우 버튼이 없고 다른 사람 게시물은 팔로우를 켜고 끈다', async () => {
    const user = userEvent.setup()
    renderAt(postPath(SNS_POST_MINE))
    expect(await screen.findByText('산책 코스 추천받아요')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '팔로우' })).not.toBeInTheDocument()
    cleanup()

    renderAt(postPath(SNS_POST_COCO))
    await user.click(await screen.findByRole('button', { name: '팔로우' }))
    expect(await screen.findByRole('button', { name: '팔로잉' })).toBeInTheDocument()
    expect(currentSns().follows.some(r => r.from === SNS_ME && r.to === SNS_COCO)).toBe(true)

    await user.click(screen.getByRole('button', { name: '팔로잉' }))
    expect(await screen.findByRole('button', { name: '팔로우' })).toBeInTheDocument()
  })

  it('[AC-SNS02-026] 다른 사람 게시물 더보기에는 링크 복사, 뮤트, 차단이 있고 수정, 삭제, 신고가 없다', async () => {
    const user = userEvent.setup()
    renderAt(postPath(SNS_POST_COCO))

    await user.click(await screen.findByRole('button', { name: '더보기' }))
    const sheet = await screen.findByRole('dialog')
    expect(within(sheet).getAllByRole('button').map(b => b.textContent)).toEqual(['링크 복사', '뮤트하기', '차단하기'])
  })

  it('[AC-SNS02-029] 링크 복사를 누르면 상세 주소를 복사하고 토스트를 보여준다', async () => {
    const user = userEvent.setup()
    renderAt(postPath(SNS_POST_COCO))

    await user.click(await screen.findByRole('button', { name: '더보기' }))
    await user.click(await screen.findByRole('button', { name: '링크 복사' }))
    expect(await screen.findByText('링크를 복사했어요')).toBeInTheDocument()
    expect(await navigator.clipboard.readText()).toBe(`${window.location.origin}/sns/posts/${SNS_POST_COCO}`)
  })

  it('[AC-SNS02-021] 뮤트한 작성자의 게시물은 내용과 뮤트 상태가 함께 보이고 더보기가 뮤트 해제다', async () => {
    const user = userEvent.setup()
    renderAt(postPath(SNS_POST_TORI))

    expect(await screen.findByText('토리 생일')).toBeInTheDocument()
    expect(screen.getByText('뮤트한 계정의 게시물이에요')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '더보기' }))
    await user.click(await screen.findByRole('button', { name: '뮤트 해제' }))
    await user.click(await screen.findByRole('button', { name: '해제' }))
    await waitFor(() => expect(screen.queryByText('뮤트한 계정의 게시물이에요')).not.toBeInTheDocument())
  })

  it('[AC-SNS02-021] 상세에서 뮤트하면 뮤트 상태 표시가 나오고 더보기가 뮤트 해제로 바뀐다', async () => {
    const user = userEvent.setup()
    renderAt(postPath(SNS_POST_COCO))

    await user.click(await screen.findByRole('button', { name: '더보기' }))
    await user.click(await screen.findByRole('button', { name: '뮤트하기' }))
    expect(await screen.findByText('뮤트한 계정의 게시물이에요')).toBeInTheDocument()
    expect(await screen.findByText('뮤트했어요')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '더보기' }))
    expect(await screen.findByRole('button', { name: '뮤트 해제' })).toBeInTheDocument()
  })

  it('[AC-SNS02-022] 상세에서 차단하면 확인을 거쳐 상세를 닫고 이전 화면으로 돌아간다', async () => {
    const user = userEvent.setup()
    const router = renderAt(postPath(SNS_POST_COCO))

    await user.click(await screen.findByRole('button', { name: '더보기' }))
    await user.click(await screen.findByRole('button', { name: '차단하기' }))
    expect(currentSns().blocks.some(r => r.from === SNS_ME && r.to === SNS_COCO)).toBe(false)
    await user.click(await screen.findByRole('button', { name: '차단' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/sns'))
    expect(currentSns().blocks.some(r => r.from === SNS_ME && r.to === SNS_COCO)).toBe(true)
  })

  it('차단한 뒤 같은 게시물을 다시 열면 남은 캐시 대신 차단한 계정 안내를 보여준다', async () => {
    const user = userEvent.setup()
    // 앱과 같은 staleTime이면 다시 열어도 캐시만 쓴다. 차단 뒤에는 서버에 다시 물어야 한다.
    const router = renderAt(
      postPath(SNS_POST_COCO),
      new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 60_000 } } }),
    )

    await user.click(await screen.findByRole('button', { name: '더보기' }))
    await user.click(await screen.findByRole('button', { name: '차단하기' }))
    await user.click(await screen.findByRole('button', { name: '차단' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/sns'))

    await router.navigate({ to: '/sns/posts/$publicId', params: { publicId: SNS_POST_COCO } })
    expect(await screen.findByText('차단한 계정의 게시물이에요')).toBeInTheDocument()
  })

  it('차단 요청 중에는 확인 Modal을 닫을 수 없고 응답이 오면 이전 화면으로 돌아간다', async () => {
    let release = () => {}
    const held = new Promise<void>(resolve => {
      release = resolve
    })
    server.use(
      http.post(SNS_BLOCK_URL, async () => {
        await held
        return new HttpResponse(null, { status: 201 })
      }),
    )
    const user = userEvent.setup()
    const router = renderAt(postPath(SNS_POST_COCO))

    await user.click(await screen.findByRole('button', { name: '더보기' }))
    await user.click(await screen.findByRole('button', { name: '차단하기' }))
    await user.click(await screen.findByRole('button', { name: '차단' }))
    await user.click(screen.getByRole('button', { name: '취소' }))
    expect(screen.getByText('차단할까요?')).toBeInTheDocument()

    release()
    await waitFor(() => expect(router.state.location.pathname).toBe('/sns'))
  })

  it('다시 조회가 실패하면 마지막 내용을 남기고 팔로우, 뮤트, 차단을 잠근다', async () => {
    let down = false
    server.use(
      http.get(SNS_POST_URL, () => (down ? new HttpResponse(null, { status: 500 }) : undefined)),
    )
    const user = userEvent.setup()
    // 상세 조회는 5xx를 한 번 더 보낸다. 그 재시도를 기다리지 않게 retryDelay만 0으로 둔다.
    renderAt(postPath(SNS_POST_COCO), new QueryClient({ defaultOptions: { queries: { retry: false, retryDelay: 0 } } }))

    await user.click(await screen.findByRole('button', { name: '팔로우' }))
    down = true
    // 팔로우 뒤 상세를 다시 읽는다. 그 조회가 실패하면 안내가 나오고 마지막 내용은 남는다.
    await user.click(await screen.findByRole('button', { name: '팔로잉' }))
    expect(await screen.findByText(/게시물을 다시 불러오지 못했어요/)).toBeInTheDocument()
    expect(screen.getByText('오늘 코코랑 한강 산책')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /팔로우|팔로잉/ })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: '더보기' }))
    const sheet = await screen.findByRole('dialog')
    expect(within(sheet).getAllByRole('button').map(b => b.textContent)).toEqual(['링크 복사'])
    await user.click(within(sheet).getByRole('button', { name: '링크 복사' }))

    down = false
    await user.click(screen.getByRole('button', { name: '다시 시도' }))
    await waitFor(() => expect(screen.queryByText(/게시물을 다시 불러오지 못했어요/)).not.toBeInTheDocument())
    expect(screen.getByRole('button', { name: '팔로우' })).toBeEnabled()
  })
})

describe('/sns/posts/$publicId 비로그인', () => {
  it('[AC-SNS02-015] 비로그인으로 링크를 열면 상세가 보이고 팔로우, 뮤트, 차단은 요청 없이 로그인 안내 시트를 연다', async () => {
    asGuest()
    const user = userEvent.setup()
    renderAt(postPath(SNS_POST_COCO))

    expect(await screen.findByText('오늘 코코랑 한강 산책')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '팔로우' }))
    expect(await screen.findByText(/팔로우는 로그인한 회원만 이용할 수 있어요/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '둘러보기 계속하기' }))

    for (const [item, copy] of [
      ['뮤트하기', /뮤트는 로그인한 회원만/],
      ['차단하기', /차단은 로그인한 회원만/],
    ] as const) {
      await user.click(screen.getByRole('button', { name: '더보기' }))
      await user.click(await screen.findByRole('button', { name: item }))
      expect(await screen.findByText(copy)).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: '둘러보기 계속하기' }))
    }
    expect(followPosts).toBe(0)
    expect(currentSns().mutes.filter(r => r.to === SNS_COCO)).toHaveLength(0)
  })

  it('[AC-SNS02-015] 공유와 링크 복사는 로그인 없이 된다', async () => {
    asGuest()
    const user = userEvent.setup()
    renderAt(postPath(SNS_POST_COCO))

    await user.click(await screen.findByRole('button', { name: '공유' }))
    // jsdom에는 기기 공유 시트(navigator.share)가 없어 링크 복사로 대신한다.
    expect(await screen.findByText('링크를 복사했어요')).toBeInTheDocument()
    expect(await navigator.clipboard.readText()).toBe(`${window.location.origin}/sns/posts/${SNS_POST_COCO}`)
    expect(screen.queryByText('로그인이 필요해요')).not.toBeInTheDocument()
  })

  it('공유 시트가 있으면 상세 주소로 연다', async () => {
    const shareSpy = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'share', { value: shareSpy, configurable: true })
    try {
      const user = userEvent.setup()
      renderAt(postPath(SNS_POST_COCO))
      await user.click(await screen.findByRole('button', { name: '공유' }))
      expect(shareSpy).toHaveBeenCalledWith({ url: `${window.location.origin}/sns/posts/${SNS_POST_COCO}` })
    } finally {
      Reflect.deleteProperty(navigator, 'share')
    }
  })
})

// 공유 링크로 들어온 비로그인 사용자에서 시작해 로그인 / 회원가입까지 누른 뒤 화면을 내리고(로그인은 페이지 전체를
// 이동한다) refresh 쿠키가 생긴 상태로 /login/complete를 새로 연다(sns-login-resume.test.tsx와 같은 방식).
describe('/sns/posts/$publicId 로그인 뒤 다시 실행(A26)', () => {
  async function startAsGuest(publicId: string, press: (user: ReturnType<typeof userEvent.setup>) => Promise<void>) {
    resetAuth()
    setAccessToken(null)
    const user = userEvent.setup()
    const router = renderAt(postPath(publicId))
    await press(user)
    await user.click(await screen.findByRole('button', { name: '로그인 / 회원가입' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/onboarding/login'))
    cleanup()
    return user
  }

  function completeLogin(seed: Parameters<typeof seedSns>[0] = {}) {
    server.use(
      http.post(WEB_REFRESH_URL, () =>
        HttpResponse.json({ data: { accessToken: 'access', tokenType: 'Bearer', expiresIn: 900 } }),
      ),
    )
    seedSns({ viewer: SNS_ME, ...seed })
    return renderAt('/login/complete?status=ACTIVE&isNew=false')
  }

  const pressFollow = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(await screen.findByRole('button', { name: '팔로우' }))
  }

  it('[AC-SNS02-034] 비로그인으로 팔로우를 누르고 로그인하면 같은 상세로 돌아와 팔로우가 켜진다', async () => {
    seedSns({ viewer: null })
    await startAsGuest(SNS_POST_COCO, pressFollow)
    expect(followPosts).toBe(0)

    const router = completeLogin()

    await waitFor(() => expect(router.state.location.pathname).toBe(postPath(SNS_POST_COCO)))
    expect(await screen.findByRole('button', { name: '팔로잉' })).toBeInTheDocument()
    expect(followPosts).toBe(1)
    expect(sessionStorage.length).toBe(0)
  })

  it('[AC-SNS02-034] 그 작성자 본인 계정으로 로그인했으면 아무 요청도 보내지 않고 대기 행동을 버린다', async () => {
    seedSns({ viewer: null })
    await startAsGuest(SNS_POST_MINE, pressFollow)

    completeLogin()

    expect(await screen.findByText('산책 코스 추천받아요')).toBeInTheDocument()
    await waitFor(() => expect(sessionStorage.length).toBe(0))
    expect(followPosts).toBe(0)
  })

  it('로그인 사이에 게시물을 볼 수 없게 됐으면 실행하지 않고 안내만 남긴다', async () => {
    seedSns({ viewer: null })
    await startAsGuest(SNS_POST_COCO, pressFollow)

    completeLogin({ posts: currentSns().posts.map(p => (p.publicId === SNS_POST_COCO ? { ...p, deleted: true } : p)) })

    expect(await screen.findByText('삭제된 게시물이에요')).toBeInTheDocument()
    expect(followPosts).toBe(0)
    expect(sessionStorage.length).toBe(0)
  })

  it('차단은 다시 실행하지 않고 확인 Modal만 다시 연다', async () => {
    seedSns({ viewer: null })
    await startAsGuest(SNS_POST_COCO, async user => {
      await user.click(await screen.findByRole('button', { name: '더보기' }))
      await user.click(await screen.findByRole('button', { name: '차단하기' }))
    })

    completeLogin()

    expect(await screen.findByText('차단할까요?')).toBeInTheDocument()
    expect(currentSns().blocks.some(r => r.from === SNS_ME && r.to === SNS_COCO)).toBe(false)
  })

  it('[AC-SNS02-022] 로그인 뒤 다시 연 확인에서 차단하면 로그인 화면이 아니라 앱 안의 이전 화면으로 간다', async () => {
    seedSns({ viewer: null })
    const user = await startAsGuest(SNS_POST_COCO, async guest => {
      await guest.click(await screen.findByRole('button', { name: '더보기' }))
      await guest.click(await screen.findByRole('button', { name: '차단하기' }))
    })
    // 브라우저 히스토리에는 로그인 화면과 공급자 화면이 남아 있지만 /login/complete가 새 문서라 앱이 쌓은 항목은 없다.
    Object.defineProperty(window.history, 'length', { configurable: true, value: 4 })
    try {
      const router = completeLogin()
      await user.click(await screen.findByRole('button', { name: '차단' }))

      await waitFor(() => expect(router.state.location.pathname).toBe('/sns'))
      expect(currentSns().blocks.some(r => r.from === SNS_ME && r.to === SNS_COCO)).toBe(true)
    } finally {
      Reflect.deleteProperty(window.history, 'length')
    }
  })
})
