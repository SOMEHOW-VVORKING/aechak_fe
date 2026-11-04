import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createMemoryHistory, createRouter } from '@tanstack/react-router'
import { HttpResponse, http } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { logout, resetAuth } from '@/shared/auth'
import {
  SNS_BLOCKER,
  SNS_BLOCK_URL,
  SNS_COCO,
  SNS_ME,
  SNS_PROFILE_URL,
  SNS_MONG,
  SNS_MUTUAL,
  SNS_SPAM,
  SNS_TORI,
  WEB_REFRESH_URL,
  currentSns,
  seedSns,
  server,
  snsRelation,
} from '@/testing/msw/server'
import { setAccessToken } from '@aechak/api'
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

const stat = (label: string) => screen.getByText(label).previousElementSibling?.textContent

function asGuest() {
  logout()
  setAccessToken(null)
  seedSns({ viewer: null })
}

// 나를 차단한 사용자의 기본 프로필(A7): 기본 프로필 사진(닉네임 첫 글자)과 닉네임만 있고 수, 소개글, 펫, 탭,
// 팔로우와 공유 버튼은 없다.
async function expectBasicProfile(nickname: string) {
  const avatar = await screen.findByLabelText(nickname)
  expect(avatar).toHaveTextContent(nickname.charAt(0))
  expect(within(avatar).queryByRole('img')).not.toBeInTheDocument()
  expect(screen.queryByText('팔로워')).not.toBeInTheDocument()
  expect(screen.queryByText('게시물')).not.toBeInTheDocument()
  expect(screen.queryByRole('list', { name: '펫' })).not.toBeInTheDocument()
  expect(screen.queryByRole('tab')).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /팔로우|팔로잉|공유/ })).not.toBeInTheDocument()
  expect(screen.queryByText('볼 수 없는 계정이에요')).not.toBeInTheDocument()
}

// 로그인 사용자는 메모리 access 토큰이 있는 상태로 시작한다(SNS MSW는 Authorization 헤더로 보는 사람을 정한다).
beforeEach(() => {
  resetAuth()
  setAccessToken('test-token')
})

afterEach(() => {
  vi.useRealTimers()
})

describe('/sns/users/$publicId 프로필 머리말', () => {
  it('[AC-SNS01-001] 비로그인으로 프로필을 열면 닉네임, 이미지, 소개글, 펫, 세 수가 보인다', async () => {
    asGuest()
    renderAt(`/sns/users/${SNS_COCO}`)

    expect(await screen.findByText('코코와 삽니다')).toBeInTheDocument()
    expect(screen.getAllByText('코코집사').length).toBeGreaterThan(0)
    expect(screen.getByRole('list', { name: '펫' })).toBeInTheDocument()
    expect(stat('게시물')).toBe('0')
    expect(stat('팔로워')).toBe('2')
    expect(stat('팔로잉')).toBe('1')
    // 메시지 버튼과 알림 버튼(R1-18)은 없다.
    expect(screen.queryByRole('button', { name: /메시지|알림/ })).not.toBeInTheDocument()
  })

  it('[AC-SNS01-002] 내 프로필에는 팔로우 버튼 대신 프로필 수정 진입과 저장됨 탭이 보인다', async () => {
    renderAt(`/sns/users/${SNS_ME}`)

    expect(await screen.findByRole('button', { name: '프로필 수정' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '팔로우' })).not.toBeInTheDocument()
    expect(screen.getByRole('tab', { name: '저장됨' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '더보기' })).not.toBeInTheDocument()
  })

  it('[AC-SNS01-002] 다른 사용자 프로필에는 저장됨 탭이 없고 탭 셋만 빈 상태로 보인다', async () => {
    renderAt(`/sns/users/${SNS_COCO}`)

    expect(await screen.findByRole('tab', { name: '그리드' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: '영상' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: '리포스트' })).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: '저장됨' })).not.toBeInTheDocument()
    expect(screen.getByText('아직 게시물이 없어요')).toBeInTheDocument()
  })

  it('[AC-SNS01-003] 펫이 여럿이면 대표 펫을 먼저 품종과 나이로 쓰고 생년월 없는 펫은 품종만 쓴다', async () => {
    vi.setSystemTime(new Date(2026, 6, 15))
    renderAt(`/sns/users/${SNS_COCO}`)

    const pets = within(await screen.findByRole('list', { name: '펫' })).getAllByRole('listitem')
    // 2021-03생은 고정한 오늘(2026년 7월) 기준 5살.
    expect(pets.map(p => p.textContent)).toEqual(['골든리트리버 / 5살', '말티즈'])
  })

  it('[AC-SNS01-004] 펫과 소개글이 없으면 두 줄이 보이지 않는다', async () => {
    renderAt(`/sns/users/${SNS_TORI}`)

    expect(await screen.findByText('팔로워')).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: '펫' })).not.toBeInTheDocument()
    expect(screen.queryByText('코코와 삽니다')).not.toBeInTheDocument()
  })

  it('[AC-SNS01-005] 팔로우 중인 사용자의 프로필에는 팔로잉 버튼이 보이고 메시지와 알림 아이콘 버튼은 없다', async () => {
    seedSns({ follows: [snsRelation(SNS_ME, SNS_COCO)] })
    renderAt(`/sns/users/${SNS_COCO}`)

    expect(await screen.findByRole('button', { name: '팔로잉' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /메시지|알림/ })).not.toBeInTheDocument()
  })

  it('[AC-SNS01-028] 정지 상태 사용자의 프로필도 평소처럼 보인다(서버가 200으로 주면 그대로 그린다)', async () => {
    renderAt(`/sns/users/${SNS_MONG}`)

    expect(await screen.findByRole('button', { name: '팔로우' })).toBeInTheDocument()
    expect(stat('팔로워')).toBe('1')
  })
})

describe('/sns/users/$publicId 팔로우', () => {
  it('[AC-SNS01-008] 팔로우하면 팔로잉으로 바뀌고 팔로워 수가 1 늘고 다시 누르면 언팔로우된다', async () => {
    const user = userEvent.setup()
    renderAt(`/sns/users/${SNS_COCO}`)

    await user.click(await screen.findByRole('button', { name: '팔로우' }))
    expect(await screen.findByRole('button', { name: '팔로잉' })).toBeInTheDocument()
    expect(stat('팔로워')).toBe('3')

    await user.click(screen.getByRole('button', { name: '팔로잉' }))
    expect(await screen.findByRole('button', { name: '팔로우' })).toBeInTheDocument()
    expect(stat('팔로워')).toBe('2')
  })

  it('[AC-SNS01-009] 이미 팔로우한 사용자를 다시 팔로우해도 오류 없이 수가 한 번 팔로우한 것과 같다', async () => {
    const user = userEvent.setup()
    renderAt(`/sns/users/${SNS_COCO}`)
    expect(await screen.findByRole('button', { name: '팔로우' })).toBeInTheDocument()

    // 다른 기기에서 이미 팔로우했는데 화면은 팔로우인 상태 → 켜기를 다시 보내도 201이고 수는 늘지 않는다.
    seedSns({ follows: [...currentSns().follows, snsRelation(SNS_ME, SNS_COCO)] })
    await user.click(screen.getByRole('button', { name: '팔로우' }))
    expect(await screen.findByRole('button', { name: '팔로잉' })).toBeInTheDocument()
    expect(stat('팔로워')).toBe('3')
    expect(currentSns().follows.filter(r => r.from === SNS_ME && r.to === SNS_COCO)).toHaveLength(1)
    expect(screen.queryByText(/처리하지 못했어요/)).not.toBeInTheDocument()
  })

  it('[AC-SNS01-009] 팔로우하지 않은 사용자를 언팔로우해도 오류 없이 수가 그대로다', async () => {
    seedSns({ follows: [snsRelation(SNS_ME, SNS_COCO), snsRelation(SNS_MONG, SNS_COCO)] })
    const user = userEvent.setup()
    renderAt(`/sns/users/${SNS_COCO}`)
    expect(await screen.findByRole('button', { name: '팔로잉' })).toBeInTheDocument()

    // 다른 기기에서 이미 언팔로우했는데 화면은 팔로잉인 상태 → 끄기를 두 번 보내도 204
    seedSns({ follows: [snsRelation(SNS_MONG, SNS_COCO)] })
    await user.click(screen.getByRole('button', { name: '팔로잉' }))
    expect(await screen.findByRole('button', { name: '팔로우' })).toBeInTheDocument()
    expect(stat('팔로워')).toBe('1')
    expect(screen.queryByText(/처리하지 못했어요/)).not.toBeInTheDocument()
  })

  it('[AC-SNS01-010] 비로그인으로 팔로우를 누르면 로그인 안내 시트가 열리고 요청을 보내지 않는다', async () => {
    asGuest()
    const user = userEvent.setup()
    renderAt(`/sns/users/${SNS_COCO}`)

    let posts = 0
    server.events.on('request:start', ({ request }) => {
      if (request.method === 'POST' && request.url.endsWith(`/sns/users/${SNS_COCO}/follow`)) posts += 1
    })
    await user.click(await screen.findByRole('button', { name: '팔로우' }))
    expect(await screen.findByText(/팔로우는 로그인한 회원만 이용할 수 있어요/)).toBeInTheDocument()
    expect(posts).toBe(0)
    server.events.removeAllListeners()
  })

  it('[AC-SNS01-029] 비로그인으로 차단을 누르면 로그인 안내 시트가 열리고 공유는 로그인 없이 된다', async () => {
    asGuest()
    const user = userEvent.setup()
    renderAt(`/sns/users/${SNS_COCO}`)

    await user.click(await screen.findByRole('button', { name: '공유' }))
    // user-event가 클립보드를 흉내 낸다. 로그인 시트 없이 링크가 복사된다.
    expect(await screen.findByText('프로필 링크를 복사했어요')).toBeInTheDocument()
    expect(await navigator.clipboard.readText()).toBe(`${window.location.origin}/sns/users/${SNS_COCO}`)
    expect(screen.queryByText('로그인이 필요해요')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '더보기' }))
    await user.click(await screen.findByRole('button', { name: '차단하기' }))
    expect(await screen.findByText(/차단은 로그인한 회원만 이용할 수 있어요/)).toBeInTheDocument()
    expect(screen.queryByText('차단할까요?')).not.toBeInTheDocument()
  })
})

describe('/sns/users/$publicId 차단과 뮤트', () => {
  it('[AC-SNS01-020] 차단은 확인 모달을 거치고 차단 뒤 차단한 계정 안내와 차단 해제 버튼만 보인다', async () => {
    seedSns({ follows: [snsRelation(SNS_ME, SNS_COCO), snsRelation(SNS_COCO, SNS_ME)] })
    const user = userEvent.setup()
    renderAt(`/sns/users/${SNS_COCO}`)

    await user.click(await screen.findByRole('button', { name: '더보기' }))
    await user.click(await screen.findByRole('button', { name: '차단하기' }))
    expect(await screen.findByText('차단할까요?')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '차단' }))

    expect(await screen.findByText('차단한 계정이에요')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '차단 해제' })).toBeInTheDocument()
    expect(screen.queryByText('팔로워')).not.toBeInTheDocument()
    expect(screen.queryByText('코코와 삽니다')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /팔로우|팔로잉|더보기|공유/ })).not.toBeInTheDocument()
    // 서로 팔로우하던 사이였어도 두 방향 팔로우가 지워진다.
    expect(currentSns().follows.filter(r => [r.from, r.to].includes(SNS_COCO) && [r.from, r.to].includes(SNS_ME))).toEqual([])
  })

  it('[AC-SNS01-023] 차단 해제 뒤 프로필 버튼은 팔로우다(팔로우가 되살아나지 않는다)', async () => {
    // 차단할 때 팔로우가 지워진 상태를 재현한다.
    seedSns({ blocks: [snsRelation(SNS_ME, SNS_SPAM)], follows: [] })
    const user = userEvent.setup()
    renderAt(`/sns/users/${SNS_SPAM}`)

    await user.click(await screen.findByRole('button', { name: '차단 해제' }))
    expect(await screen.findByText('차단을 해제할까요?')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '해제' }))

    expect(await screen.findByRole('button', { name: '팔로우' })).toBeInTheDocument()
    expect(await screen.findByText('차단을 해제했어요')).toBeInTheDocument()
  })

  it('[AC-SNS01-021] 탈퇴했거나 없는 사용자의 프로필 링크는 볼 수 없는 계정 안내를 보여준다', async () => {
    renderAt('/sns/users/01JZZZZZZZZZZZZZZZZZZZZZZZ')

    expect(await screen.findByText('볼 수 없는 계정이에요')).toBeInTheDocument()
    expect(screen.getByText('계정이 없거나 지금은 볼 수 없어요.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /팔로우|더보기/ })).not.toBeInTheDocument()
  })

  // 앱 기본(main.tsx)처럼 재시도를 켠 QueryClient로 SNS 조회의 재시도 판정만 본다(retryDelay 0으로 바로 재시도).
  it.each([
    ['404 130000', 404, 130000, 1],
    ['500', 500, 90000, 2],
  ])('[AC-SNS01-021] 프로필 조회가 %s면 4xx는 다시 보내지 않고 5xx만 한 번 더 보낸다', async (_, status, errorCode, expected) => {
    let calls = 0
    server.use(
      http.get(SNS_PROFILE_URL, () => {
        calls += 1
        return HttpResponse.json({ errorCode, message: '' }, { status })
      }),
    )
    renderAt(
      `/sns/users/${SNS_COCO}`,
      new QueryClient({ defaultOptions: { queries: { retry: 3, retryDelay: 0 } } }),
    )

    expect(await screen.findByText(status === 404 ? '볼 수 없는 계정이에요' : '프로필을 불러오지 못했어요')).toBeInTheDocument()
    // 오류 화면은 재시도를 모두 마친 뒤에 뜨므로 이 시점의 호출 수가 최종 값이다.
    expect(calls).toBe(expected)
  })

  it('[AC-SNS01-025] 뮤트한 사용자의 프로필에 뮤트 상태가 보이고 확인 모달을 거쳐 해제한다', async () => {
    const user = userEvent.setup()
    renderAt(`/sns/users/${SNS_TORI}`)

    expect(await screen.findByText('뮤트한 계정이에요')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '뮤트 해제' }))
    expect(await screen.findByText('뮤트를 해제할까요?')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '해제' }))

    await waitFor(() => expect(screen.queryByText('뮤트한 계정이에요')).not.toBeInTheDocument())
    expect(currentSns().mutes).toEqual([])
  })

  it('[AC-SNS01-025] 더보기에서 뮤트하면 뮤트 상태 표시가 생긴다', async () => {
    const user = userEvent.setup()
    renderAt(`/sns/users/${SNS_COCO}`)

    await user.click(await screen.findByRole('button', { name: '더보기' }))
    await user.click(await screen.findByRole('button', { name: '뮤트하기' }))
    expect(await screen.findByText('뮤트한 계정이에요')).toBeInTheDocument()
  })

  it('[AC-SNS01-026] 차단 요청이 실패하면 화면과 수가 요청 전 그대로이고 실패 안내가 뜨며 다시 보낼 수 있다', async () => {
    let calls = 0
    server.use(
      http.post(SNS_BLOCK_URL, () => {
        calls += 1
        return HttpResponse.json({ errorCode: 90000, message: '' }, { status: 500 })
      }),
    )
    const user = userEvent.setup()
    renderAt(`/sns/users/${SNS_COCO}`)

    await user.click(await screen.findByRole('button', { name: '더보기' }))
    await user.click(await screen.findByRole('button', { name: '차단하기' }))
    await user.click(await screen.findByRole('button', { name: '차단' }))

    expect(await screen.findByText('요청을 처리하지 못했어요. 다시 시도해 주세요')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '팔로우' })).toBeInTheDocument()
    expect(stat('팔로워')).toBe('2')

    await user.click(screen.getByRole('button', { name: '더보기' }))
    await user.click(await screen.findByRole('button', { name: '차단하기' }))
    await user.click(await screen.findByRole('button', { name: '차단' }))
    await waitFor(() => expect(calls).toBe(2))
  })
})

describe('/sns/users/$publicId 나를 차단한 사용자와 서로 차단한 사용자의 기본 프로필(R2-06)', () => {
  it('[AC-SNS01-021] 나를 차단한 사용자의 프로필은 기본 프로필 사진과 닉네임만 보여주고 더보기에는 차단하기만 있다', async () => {
    const user = userEvent.setup()
    renderAt(`/sns/users/${SNS_BLOCKER}`)

    await expectBasicProfile('차단러')
    expect(screen.queryByRole('button', { name: '차단 해제' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '더보기' }))
    expect(await screen.findByRole('button', { name: '차단하기' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /뮤트/ })).not.toBeInTheDocument()
  })

  it('[AC-SNS01-021] 프로필을 연 뒤 상대가 나를 차단해 팔로우가 404 130000이면 실패 안내 없이 기본 프로필로 바뀐다', async () => {
    const user = userEvent.setup()
    renderAt(`/sns/users/${SNS_COCO}`)
    const follow = await screen.findByRole('button', { name: '팔로우' })

    const now = currentSns()
    seedSns({ ...now, blocks: [...now.blocks, snsRelation(SNS_COCO, SNS_ME)] })
    await user.click(follow)

    // 처음 읽은 프로필은 이미지가 있는 보통 프로필이라 아바타가 첫 글자로 바뀌면 다시 읽은 기본 프로필이다.
    await waitFor(() => expect(screen.getByLabelText('코코집사')).toHaveTextContent('코'))
    // 볼 수 없는 계정이라는 실패 토스트도 없다.
    await expectBasicProfile('코코집사')
  })

  it('[AC-SNS01-021] 기본 프로필에서 차단하면 확인 모달을 거쳐 서로 차단한 화면으로 바뀐다', async () => {
    const user = userEvent.setup()
    renderAt(`/sns/users/${SNS_BLOCKER}`)

    await user.click(await screen.findByRole('button', { name: '더보기' }))
    await user.click(await screen.findByRole('button', { name: '차단하기' }))
    expect(await screen.findByText('차단할까요?')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '차단' }))

    expect(await screen.findByText('차단했어요')).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: '차단 해제' })).toBeInTheDocument()
    await expectBasicProfile('차단러')
    expect(screen.queryByRole('button', { name: '더보기' })).not.toBeInTheDocument()
    expect(currentSns().blocks.some(r => r.from === SNS_ME && r.to === SNS_BLOCKER)).toBe(true)
  })

  it('[AC-SNS01-030] 서로 차단한 사용자의 프로필은 기본 프로필 사진과 닉네임, 차단 해제 버튼만 보여준다', async () => {
    renderAt(`/sns/users/${SNS_MUTUAL}`)

    await expectBasicProfile('맞차단러')
    expect(screen.getByRole('button', { name: '차단 해제' })).toBeInTheDocument()
    // 이미지, 소개글, 펫이 있는 사용자여도 보이지 않고 내가 차단한 계정 안내 문구도 없다.
    expect(screen.queryByText('서로 차단한 사이')).not.toBeInTheDocument()
    expect(screen.queryByText('차단한 계정이에요')).not.toBeInTheDocument()
    // 더보기에 둘 신고 항목은 SNS-07에서 붙는다.
    expect(screen.queryByRole('button', { name: '더보기' })).not.toBeInTheDocument()
  })

  it('[AC-SNS01-024] 서로 차단한 사이에서 차단을 해제해도 상대의 차단이 남아 기본 프로필이 이어진다', async () => {
    const user = userEvent.setup()
    renderAt(`/sns/users/${SNS_MUTUAL}`)

    await user.click(await screen.findByRole('button', { name: '차단 해제' }))
    expect(await screen.findByText('차단을 해제할까요?')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '해제' }))

    expect(await screen.findByText('차단을 해제했어요')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('button', { name: '차단 해제' })).not.toBeInTheDocument())
    await expectBasicProfile('맞차단러')
    // 이제 나를 차단한 사용자의 기본 프로필이라 더보기에서 다시 차단할 수 있다.
    expect(screen.getByRole('button', { name: '더보기' })).toBeInTheDocument()
    expect(currentSns().blocks.some(r => r.from === SNS_ME && r.to === SNS_MUTUAL)).toBe(false)
  })
})

describe('/sns/users/$publicId 새로고침, 공유 링크 진입(메모리 토큰 없음)', () => {
  beforeEach(() => {
    // 새로고침은 메모리 토큰만 날리고 세션 유무는 미지 상태로 남긴다 — setAccessToken(null)은
    // "세션이 끝났다"는 뜻이라 refresh 확인 자체를 건너뛴다.
    resetAuth()
  })

  it('[AC-SNS01-005] refresh 쿠키가 살아 있으면 세션을 먼저 복원해 관계 필드가 채워진 프로필을 보여준다', async () => {
    server.use(
      http.post(WEB_REFRESH_URL, () =>
        HttpResponse.json({ data: { accessToken: 'restored', tokenType: 'Bearer', expiresIn: 900 } }),
      ),
    )
    seedSns({ follows: [snsRelation(SNS_ME, SNS_COCO)], mutes: [snsRelation(SNS_ME, SNS_COCO)] })
    renderAt(`/sns/users/${SNS_COCO}`)

    expect(await screen.findByRole('button', { name: '팔로잉' })).toBeInTheDocument()
    expect(screen.getByText('뮤트한 계정이에요')).toBeInTheDocument()
  })

  it('[AC-SNS01-021] 세션을 복원하면 나를 차단한 사용자의 링크는 기본 프로필이다', async () => {
    server.use(
      http.post(WEB_REFRESH_URL, () =>
        HttpResponse.json({ data: { accessToken: 'restored', tokenType: 'Bearer', expiresIn: 900 } }),
      ),
    )
    renderAt(`/sns/users/${SNS_BLOCKER}`)

    // 비로그인으로 보면 수와 팔로우 버튼이 있는 프로필이다. 복원한 토큰으로 불러야 기본 프로필이 된다.
    await expectBasicProfile('차단러')
  })

  it('[AC-SNS01-010] refresh 쿠키가 없으면 비로그인으로 보여주고 팔로우를 누르면 요청 없이 로그인 안내 시트를 연다', async () => {
    let posts = 0
    server.events.on('request:start', ({ request }) => {
      if (request.method === 'POST' && request.url.includes('/sns/')) posts += 1
    })
    const user = userEvent.setup()
    const router = renderAt(`/sns/users/${SNS_COCO}`)

    await user.click(await screen.findByRole('button', { name: '팔로우' }))
    expect(await screen.findByText(/팔로우는 로그인한 회원만 이용할 수 있어요/)).toBeInTheDocument()
    expect(posts).toBe(0)
    expect(router.state.location.pathname).toBe(`/sns/users/${SNS_COCO}`)
    server.events.removeAllListeners()
  })

  it('[AC-SNS01-029] refresh 쿠키 없이 목록 경로로 들어오면 로그인 화면으로 보내지 않고 로그인 안내 시트를 연다', async () => {
    const router = renderAt(`/sns/users/${SNS_COCO}/follows`)

    expect(await screen.findByText(/팔로워\/팔로잉 목록은 로그인한 회원만 볼 수 있어요/)).toBeInTheDocument()
    expect(router.state.location.pathname).toBe(`/sns/users/${SNS_COCO}/follows`)
  })
})
