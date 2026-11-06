import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createMemoryHistory, createRouter } from '@tanstack/react-router'
import { HttpResponse, http } from 'msw'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { setAccessToken } from '@aechak/api'
import { resetAccount } from '@/shared/account'
import { resetAuth } from '@/shared/auth'
import {
  SNS_COCO,
  SNS_FOLLOW_URL,
  SNS_ME,
  SNS_MONG,
  SNS_PROFILE_URL,
  WEB_REFRESH_URL,
  currentSns,
  seedConsentsSubmitted,
  seedTerms,
  seedSns,
  server,
  snsRelation,
} from '@/testing/msw/server'
import { routeTree } from '../../../routeTree.gen'

function renderAt(path: string) {
  const router = createRouter({ routeTree, history: createMemoryHistory({ initialEntries: [path] }) })
  // retryDelay 0: SNS 프로필 조회는 5xx를 한 번 더 보내는데(retryTransient) 그 재시도를 1초 기다리지 않게 한다.
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, retryDelay: 0 } } })
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return router
}

const stat = (label: string) => screen.getByText(label).previousElementSibling?.textContent

// 공유 링크로 처음 들어온 비로그인 사용자에서 시작한다. 로그인 플래그는 기본값(true)이지만 메모리 토큰도
// refresh 쿠키도 없어(MSW 기본 401) 라우트가 세션 복원에 실패하고 비로그인으로 이어 간다.
// 로그인 / 회원가입까지 누른 뒤에는 로그인 화면이 페이지 전체를 이동하므로 화면을 내리고(cleanup)
// 쿠키가 생긴 상태(refresh 200)로 /login/complete를 새로 연다.
async function startAsGuest(publicId: string, press: (user: ReturnType<typeof userEvent.setup>) => Promise<void>) {
  const user = userEvent.setup()
  const router = renderAt(`/sns/users/${publicId}`)
  await press(user)
  await user.click(await screen.findByRole('button', { name: '로그인 / 회원가입' }))
  await waitFor(() => expect(router.state.location.pathname).toBe('/onboarding/login'))
  cleanup()
  return user
}

function completeLogin(viewerSeed: Parameters<typeof seedSns>[0] = {}, status = 'ACTIVE') {
  server.use(
    http.post(WEB_REFRESH_URL, () =>
      HttpResponse.json({ data: { accessToken: 'access', tokenType: 'Bearer', expiresIn: 900 } }),
    ),
  )
  seedSns({ viewer: SNS_ME, ...viewerSeed })
  return renderAt(`/login/complete?status=${status}&isNew=${status === 'PENDING_ONBOARDING'}`)
}

const pressFollow = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(await screen.findByRole('button', { name: '팔로우' }))
}

let followPosts = 0

beforeEach(() => {
  resetAuth()
  followPosts = 0
  server.events.on('request:start', ({ request }) => {
    if (request.method === 'POST' && /\/sns\/users\/[^/]+\/follow$/.test(request.url)) followPosts += 1
  })
})

afterEach(() => {
  server.events.removeAllListeners()
  setAccessToken(null)
})

describe('로그인 뒤 다시 실행(A26)', () => {
  it('[AC-SNS01-011] 로그인을 마치면 원래 프로필로 돌아와 확인 없이 팔로우하고 버튼이 팔로잉으로 바뀐다', async () => {
    await startAsGuest(SNS_COCO, pressFollow)
    expect(followPosts).toBe(0)

    const router = completeLogin()

    await waitFor(() => expect(router.state.location.pathname).toBe(`/sns/users/${SNS_COCO}`))
    expect(await screen.findByRole('button', { name: '팔로잉' })).toBeInTheDocument()
    expect(followPosts).toBe(1)
    expect(stat('팔로워')).toBe('3')
    expect(sessionStorage.length).toBe(0)
  })

  it('[AC-SNS01-012] 로그인한 계정이 이미 팔로우 중이면 상태와 수가 그대로다', async () => {
    await startAsGuest(SNS_COCO, pressFollow)

    completeLogin({ follows: [snsRelation(SNS_MONG, SNS_COCO), snsRelation(SNS_ME, SNS_COCO)] })

    expect(await screen.findByRole('button', { name: '팔로잉' })).toBeInTheDocument()
    await waitFor(() => expect(followPosts).toBe(1))
    await waitFor(() => expect(stat('팔로워')).toBe('2'))
    expect(currentSns().follows.filter(r => r.to === SNS_COCO)).toHaveLength(2)
  })

  it('[AC-SNS01-013] 로그인 사이에 상대가 나를 차단했으면 팔로우하지 않고 기본 프로필을 보여준다', async () => {
    await startAsGuest(SNS_COCO, pressFollow)

    completeLogin({ blocks: [snsRelation(SNS_COCO, SNS_ME)] })

    // 기본 프로필 사진(닉네임 첫 글자)과 닉네임만 있고 팔로우 버튼과 수는 없다(A7).
    expect(await screen.findByLabelText('코코집사')).toHaveTextContent('코')
    expect(screen.queryByRole('button', { name: /팔로우|팔로잉/ })).not.toBeInTheDocument()
    expect(screen.queryByText('팔로워')).not.toBeInTheDocument()
    expect(followPosts).toBe(0)
    expect(sessionStorage.length).toBe(0)
  })

  it('[AC-SNS01-013] 로그인 사이에 상대가 나를 차단했어도 차단은 기본 프로필에서 확인 Modal을 다시 연다', async () => {
    await startAsGuest(SNS_COCO, async user => {
      await user.click(await screen.findByRole('button', { name: '더보기' }))
      await user.click(await screen.findByRole('button', { name: '차단하기' }))
    })

    completeLogin({ blocks: [snsRelation(SNS_COCO, SNS_ME)] })

    expect(await screen.findByText('차단할까요?')).toBeInTheDocument()
    expect(screen.getByLabelText('코코집사')).toHaveTextContent('코')
    expect(currentSns().blocks.some(r => r.from === SNS_ME && r.to === SNS_COCO)).toBe(false)
    expect(sessionStorage.length).toBe(0)
  })

  it('[AC-SNS01-013] 로그인 사이에 상대가 나를 차단했으면 뮤트는 시트를 다시 열지 않는다(기본 프로필에는 뮤트가 없다)', async () => {
    await startAsGuest(SNS_COCO, async user => {
      await user.click(await screen.findByRole('button', { name: '더보기' }))
      await user.click(await screen.findByRole('button', { name: '뮤트하기' }))
    })

    completeLogin({ blocks: [snsRelation(SNS_COCO, SNS_ME)] })

    expect(await screen.findByLabelText('코코집사')).toHaveTextContent('코')
    await waitFor(() => expect(sessionStorage.length).toBe(0))
    // 시트는 열린 뒤 한 번 더 렌더해야 보인다(BottomSheet mounted). 그 렌더를 기다린 뒤 닫혀 있는지 본다.
    await new Promise(resolve => setTimeout(resolve, 50))
    expect(screen.queryByRole('button', { name: '차단하기' })).not.toBeInTheDocument()
    expect(currentSns().mutes.some(r => r.from === SNS_ME && r.to === SNS_COCO)).toBe(false)
  })

  it('[AC-SNS01-013] 로그인 사이에 상대가 탈퇴했으면 팔로우하지 않고 볼 수 없는 계정 안내를 보여준다', async () => {
    await startAsGuest(SNS_COCO, pressFollow)
    server.use(http.get(SNS_PROFILE_URL, () => HttpResponse.json({ errorCode: 130000, message: '' }, { status: 404 })))

    completeLogin()

    expect(await screen.findByText('볼 수 없는 계정이에요')).toBeInTheDocument()
    expect(followPosts).toBe(0)
    expect(sessionStorage.length).toBe(0)
  })

  // 프로필은 200으로 열렸는데 그사이 상태가 바뀌어 다시 실행한 POST가 실패하는 경우. 서버 상태도 함께 바꿔
  // 실패 뒤 다시 읽은 프로필이 실제와 같게 한다.
  it('[AC-SNS01-013] 다시 실행한 팔로우가 404 130000이면 실패 안내 없이 프로필을 다시 읽어 나를 차단한 사용자의 기본 프로필을 보여준다', async () => {
    await startAsGuest(SNS_COCO, pressFollow)
    server.use(
      http.post(SNS_FOLLOW_URL, () => {
        const now = currentSns()
        seedSns({ ...now, blocks: [...now.blocks, snsRelation(SNS_COCO, SNS_ME)] })
        return HttpResponse.json({ errorCode: 130000, message: '' }, { status: 404 })
      }),
    )

    completeLogin()

    // 처음 읽은 프로필은 이미지가 있는 보통 프로필이라 아바타가 첫 글자로 바뀌면 다시 읽은 기본 프로필이다.
    await waitFor(() => expect(screen.getByLabelText('코코집사')).toHaveTextContent('코'))
    expect(followPosts).toBe(1)
    expect(screen.queryByRole('button', { name: /팔로우|팔로잉/ })).not.toBeInTheDocument()
    expect(screen.queryByText('볼 수 없는 계정이에요')).not.toBeInTheDocument()
    expect(sessionStorage.length).toBe(0)
  })

  it('[AC-SNS01-013] 다시 실행한 팔로우가 404 130000이고 다시 읽은 프로필도 404면 볼 수 없는 계정 안내만 보여준다', async () => {
    await startAsGuest(SNS_COCO, pressFollow)
    let withdrawn = false
    server.use(
      http.post(SNS_FOLLOW_URL, () => {
        withdrawn = true
        return HttpResponse.json({ errorCode: 130000, message: '' }, { status: 404 })
      }),
      // 팔로우를 보낸 뒤에 탈퇴가 반영된다. 그 전 프로필 조회는 기본 핸들러가 받는다.
      http.get(SNS_PROFILE_URL, () =>
        withdrawn ? HttpResponse.json({ errorCode: 130000, message: '' }, { status: 404 }) : undefined,
      ),
    )

    completeLogin()

    expect(await screen.findByText('계정이 없거나 지금은 볼 수 없어요.')).toBeInTheDocument()
    // 실패 안내 토스트 없이 화면 안내 하나만 있다.
    expect(screen.getAllByText('볼 수 없는 계정이에요')).toHaveLength(1)
    expect(followPosts).toBe(1)
    expect(sessionStorage.length).toBe(0)
  })

  it('[AC-SNS01-013] 다시 실행한 팔로우가 404 130000이고 프로필 재조회와 그 재시도까지 실패하면 실패 안내를 띄운다', async () => {
    await startAsGuest(SNS_COCO, pressFollow)
    let followed = false
    let refetches = 0
    server.use(
      http.post(SNS_FOLLOW_URL, () => {
        followed = true
        return HttpResponse.json({ errorCode: 130000, message: '' }, { status: 404 })
      }),
      // 팔로우를 보낸 뒤의 재조회만 실패한다. 그 전 프로필 조회는 기본 핸들러가 받는다.
      http.get(SNS_PROFILE_URL, () => {
        if (!followed) return undefined
        refetches += 1
        return HttpResponse.json({ errorCode: 90000, message: '' }, { status: 500 })
      }),
    )

    completeLogin()

    // 화면이 기본 프로필이나 볼 수 없는 계정 안내로 바뀌지 않아 이전 프로필이 남으므로 오류 토스트로 알린다.
    const notice = await screen.findByText('볼 수 없는 계정이에요')
    expect(notice.closest('[role="alert"]')).not.toBeNull()
    // 안내는 재조회와 그 재시도(5xx 1회)가 모두 실패한 뒤에 뜬다.
    expect(refetches).toBe(2)
    expect(screen.getByRole('button', { name: '팔로우' })).toBeInTheDocument()
    expect(followPosts).toBe(1)
    expect(sessionStorage.length).toBe(0)
  })

  it('[AC-SNS01-013] 다시 실행한 팔로우가 403 130001(그사이 내가 상대를 차단)이면 안내를 보여주고 팔로잉으로 바뀌지 않는다', async () => {
    await startAsGuest(SNS_COCO, pressFollow)
    server.use(
      http.post(SNS_FOLLOW_URL, () => {
        const now = currentSns()
        seedSns({ ...now, blocks: [...now.blocks, snsRelation(SNS_ME, SNS_COCO)] })
        return HttpResponse.json({ errorCode: 130001, message: '' }, { status: 403 })
      }),
    )

    completeLogin()

    expect((await screen.findAllByText('차단한 계정이에요')).length).toBeGreaterThan(0)
    expect(followPosts).toBe(1)
    expect(screen.queryByRole('button', { name: '팔로잉' })).not.toBeInTheDocument()
    expect(sessionStorage.length).toBe(0)
  })

  it('[AC-SNS01-011] 다시 실행한 팔로우가 400 130300(본인)이면 대기 행동을 버리고 내 프로필로 간다', async () => {
    await startAsGuest(SNS_COCO, pressFollow)
    server.use(
      http.post(SNS_FOLLOW_URL, () => HttpResponse.json({ errorCode: 130300, message: '' }, { status: 400 })),
    )

    const router = completeLogin()

    await waitFor(() => expect(router.state.location.pathname).toBe('/sns/me'))
    expect(sessionStorage.length).toBe(0)
  })

  it('[AC-SNS01-011] 신규 가입이면 /login/complete에서 실행하지 않고 온보딩(닉네임)을 마친 뒤 프로필로 돌아와 팔로우한다', async () => {
    seedTerms()
    const user = await startAsGuest(SNS_COCO, pressFollow)

    // 온보딩 전 계정은 SNS 요청이 403 20006이라 여기서 꺼내면 안 된다.
    const router = completeLogin({}, 'PENDING_ONBOARDING')
    await waitFor(() => expect(router.state.location.pathname).toBe('/onboarding/terms'))
    expect(followPosts).toBe(0)
    expect(sessionStorage.length).toBe(1)

    // 약관 동의를 마친 상태로 닉네임 단계에 들어간다(약관 화면 동작은 온보딩 테스트가 본다).
    seedConsentsSubmitted(true)
    await router.navigate({ to: '/onboarding/nickname' })
    await user.type(await screen.findByLabelText(/닉네임/), '초코집사')
    const submit = screen.getByRole('button', { name: '애착 시작하기' })
    await waitFor(() => expect(submit).toBeEnabled(), { timeout: 3000 })
    await user.click(submit)
    await user.click(await screen.findByRole('button', { name: '보던 화면으로 가기' }))

    await waitFor(() => expect(router.state.location.pathname).toBe(`/sns/users/${SNS_COCO}`))
    expect(await screen.findByRole('button', { name: '팔로잉' })).toBeInTheDocument()
    expect(followPosts).toBe(1)
    expect(sessionStorage.length).toBe(0)
    // 온보딩 완료가 계정 스토어에 남지 않게 시드로 되돌린다.
    resetAccount()
  })

  it('[AC-SNS01-011] 신규 가입 중 약관에서 뒤로 갔다가 다시 로그인해도 대기 행동이 남아 팔로우를 한 번만 실행한다', async () => {
    seedTerms()
    const user = await startAsGuest(SNS_COCO, pressFollow)

    const first = completeLogin({}, 'PENDING_ONBOARDING')
    await waitFor(() => expect(first.state.location.pathname).toBe('/onboarding/terms'))
    await user.click(await screen.findByRole('button', { name: '뒤로 가기' }))
    await waitFor(() => expect(first.state.location.pathname).toBe('/onboarding/login'))
    await screen.findByText('카카오로 시작하기')
    expect(sessionStorage.length).toBe(1)
    cleanup()

    // 다시 로그인한다(로그인 화면은 페이지 전체를 이동한다).
    const router = completeLogin({}, 'PENDING_ONBOARDING')
    await waitFor(() => expect(router.state.location.pathname).toBe('/onboarding/terms'))
    seedConsentsSubmitted(true)
    await router.navigate({ to: '/onboarding/nickname' })
    await user.type(await screen.findByLabelText(/닉네임/), '초코집사')
    const submit = screen.getByRole('button', { name: '애착 시작하기' })
    await waitFor(() => expect(submit).toBeEnabled(), { timeout: 3000 })
    await user.click(submit)
    await user.click(await screen.findByRole('button', { name: '보던 화면으로 가기' }))

    expect(await screen.findByRole('button', { name: '팔로잉' })).toBeInTheDocument()
    expect(followPosts).toBe(1)
    expect(sessionStorage.length).toBe(0)
    resetAccount()
  })

  it('[AC-SNS01-011] 로그인한 계정이 그 프로필 본인이면 다시 실행하지 않고 내 프로필로 간다', async () => {
    await startAsGuest(SNS_ME, pressFollow)

    const router = completeLogin()

    await waitFor(() => expect(router.state.location.pathname).toBe('/sns/me'))
    expect(await screen.findByRole('button', { name: '프로필 수정' })).toBeInTheDocument()
    expect(followPosts).toBe(0)
  })

  it('[AC-SNS01-011] 차단은 다시 실행하지 않고 확인 Modal만 다시 연다', async () => {
    await startAsGuest(SNS_COCO, async user => {
      await user.click(await screen.findByRole('button', { name: '더보기' }))
      await user.click(await screen.findByRole('button', { name: '차단하기' }))
    })

    completeLogin()

    expect(await screen.findByText('차단할까요?')).toBeInTheDocument()
    expect(currentSns().blocks.some(r => r.from === SNS_ME && r.to === SNS_COCO)).toBe(false)
  })

  it('[AC-SNS01-011] 로그인이 실패해 ?error=로 돌아오면 대기 행동을 버린다', async () => {
    await startAsGuest(SNS_COCO, pressFollow)
    expect(sessionStorage.length).toBe(1)

    const router = renderAt('/login/complete?error=20001')

    await waitFor(() => expect(router.state.location.pathname).toBe('/onboarding/login'))
    expect(sessionStorage.length).toBe(0)
  })

  it('[AC-SNS01-011] 로그인 화면에서 물러났다가 다른 길로 로그인하면 예전 대기 행동을 실행하지 않는다', async () => {
    await startAsGuest(SNS_COCO, pressFollow)
    expect(sessionStorage.length).toBe(1)

    // 찜 게이트, 세션 만료, 홈 가드처럼 대기 행동 없이 로그인 화면으로 들어온다.
    renderAt('/onboarding/login')
    await screen.findByText('카카오로 시작하기')
    expect(sessionStorage.length).toBe(0)
    cleanup()

    const router = completeLogin()
    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
    expect(followPosts).toBe(0)
  })

  it('[AC-SNS01-011] 대기 행동이 없으면 로그인 뒤 홈으로 간다', async () => {
    const router = completeLogin()

    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
  })
})
