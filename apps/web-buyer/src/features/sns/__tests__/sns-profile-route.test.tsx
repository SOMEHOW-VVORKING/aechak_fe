import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createMemoryHistory, createRouter } from '@tanstack/react-router'
import { HttpResponse, http } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { logout, resetAuth } from '@/shared/auth'
import {
  SNS_BLOCKER,
  SNS_BLOCK_URL,
  SNS_COCO,
  SNS_ME,
  SNS_MONG,
  SNS_SPAM,
  SNS_TORI,
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

const stat = (label: string) => screen.getByText(label).previousElementSibling?.textContent

function asGuest() {
  logout()
  seedSns({ viewer: null })
}

beforeEach(() => {
  resetAuth()
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
    renderAt(`/sns/users/${SNS_COCO}`)

    const pets = within(await screen.findByRole('list', { name: '펫' })).getAllByRole('listitem')
    // 2021-03생은 세션 고정 오늘(2026년 7월) 기준 5살.
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

  it('[AC-SNS01-009] 이미 팔로우한 상태에서 다시 팔로우해도 오류 없이 수가 그대로다', async () => {
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

    await user.click(await screen.findByRole('button', { name: '팔로우' }))
    expect(await screen.findByText(/팔로우는 로그인한 회원만 이용할 수 있어요/)).toBeInTheDocument()
    expect(currentSns().follows.some(r => r.to === SNS_COCO && r.from === SNS_ME)).toBe(false)
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

  it.each([
    ['나를 차단한 사용자', SNS_BLOCKER],
    ['탈퇴했거나 없는 사용자', '01JZZZZZZZZZZZZZZZZZZZZZZZ'],
  ])('[AC-SNS01-021] %s의 프로필 링크는 같은 볼 수 없는 계정 안내를 보여준다', async (_, publicId) => {
    renderAt(`/sns/users/${publicId}`)

    expect(await screen.findByText('볼 수 없는 계정이에요')).toBeInTheDocument()
    expect(screen.getByText('계정이 없거나 지금은 볼 수 없어요.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /팔로우|더보기/ })).not.toBeInTheDocument()
  })

  it('[AC-SNS01-021] 볼 수 없는 계정(404 130000)은 다시 보내지 않는다', async () => {
    let calls = 0
    server.events.on('request:start', ({ request }) => {
      if (request.url.endsWith(`/sns/users/${SNS_BLOCKER}`)) calls += 1
    })
    renderAt(`/sns/users/${SNS_BLOCKER}`)

    expect(await screen.findByText('볼 수 없는 계정이에요')).toBeInTheDocument()
    await new Promise(resolve => setTimeout(resolve, 50))
    expect(calls).toBe(1)
    server.events.removeAllListeners()
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
