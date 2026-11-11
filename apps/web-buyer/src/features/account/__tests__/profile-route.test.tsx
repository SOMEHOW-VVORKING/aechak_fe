import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter, createMemoryHistory } from '@tanstack/react-router'
import { describe, it, expect, beforeEach } from 'vitest'
import { HttpResponse, http } from 'msw'
import { setAccessToken } from '@aechak/api'
import { resetAccount } from '@/shared/account'
import {
  currentAccount,
  seedAccount,
  seedTakenNicknames,
  server,
  USER_ME_URL,
  USER_PROFILE_URL,
} from '@/testing/msw/server'
import { routeTree } from '../../../routeTree.gen'

function renderAt(path: string) {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
  })
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

function fileInput(container: HTMLElement): HTMLInputElement {
  const input = container.querySelector<HTMLInputElement>('input[type="file"]')
  if (input == null) throw new Error('아바타 업로드 input을 찾지 못했다')
  return input
}

describe('/mypage/profile 실서버 연동', () => {
  beforeEach(() => {
    resetAccount()
    seedAccount()
  })

  it('[AC-PROFILE-011] 홈 버튼이 보이고 누르면 홈(\'/\')으로 간다', async () => {
    // 홈 가드는 access가 없으면 로그인으로 보낸다.
    setAccessToken('member-token')
    const user = userEvent.setup()
    renderAt('/mypage/profile')

    await screen.findByDisplayValue('코코집사')
    await user.click(screen.getByRole('button', { name: '홈으로 가기' }))
    expect(await screen.findByText('이런 상품은 어때요?')).toBeInTheDocument()
  })

  it('[AC-PROFILE-003] 초기값이 서버 내 정보(닉네임·자기소개)로 프리필된다', async () => {
    seedAccount({ nickname: '초코집사', bio: '반가워요' })
    renderAt('/mypage/profile')

    expect(await screen.findByDisplayValue('초코집사')).toBeInTheDocument()
    expect(screen.getByDisplayValue('반가워요')).toBeInTheDocument()
  })

  it('[AC-PROFILE-004] 아바타를 안 바꾸고 저장하면 기존 profileImageKey를 그대로 되돌려 보낸다', async () => {
    seedAccount({
      nickname: '코코집사',
      bio: '옛 소개',
      profileImageKey: 'users/profile/seed.png',
      profileImageUrl: 'https://mock-cdn.local/users/profile/seed.png',
    })
    const user = userEvent.setup()
    renderAt('/mypage/profile')

    const bio = await screen.findByDisplayValue('옛 소개')
    await user.clear(bio)
    await user.type(bio, '새 소개')
    await user.click(screen.getByRole('button', { name: '저장' }))

    await waitFor(() => {
      const saved = currentAccount()
      expect(saved.bio).toBe('새 소개')
      // 핵심 계약: 이미지를 안 바꿨으면 기존 키가 그대로 유지돼야 한다.
      expect(saved.profileImageKey).toBe('users/profile/seed.png')
    })
  })

  it('[AC-PROFILE-005] 새 아바타를 고르면 저장 시 presigned 업로드로 받은 tmp 키를 보낸다', async () => {
    seedAccount({ nickname: '코코집사', profileImageKey: 'users/profile/seed.png' })
    const user = userEvent.setup()
    const { container } = renderAt('/mypage/profile')

    await screen.findByDisplayValue('코코집사')
    await user.upload(fileInput(container), new File(['x'], 'avatar.png', { type: 'image/png' }))
    await user.click(screen.getByRole('button', { name: '저장' }))

    await waitFor(() => {
      expect(currentAccount().profileImageKey).toBe('tmp/1/users/profile/fixture.png')
    })
  })

  it('[AC-PROFILE-006] 닉네임 중복 저장은 409/30001로 인라인 에러를 띄우고 폼을 유지한다', async () => {
    seedAccount({ nickname: '코코집사' })
    seedTakenNicknames(['멍멍집사'])
    const user = userEvent.setup()
    renderAt('/mypage/profile')

    const nick = await screen.findByDisplayValue('코코집사')
    await user.clear(nick)
    await user.type(nick, '멍멍집사')
    await user.click(screen.getByRole('button', { name: '저장' }))

    expect(await screen.findByText('이미 사용 중인 닉네임이에요')).toBeInTheDocument()
    // 폼은 그대로 남는다(입력값 보존).
    expect(screen.getByDisplayValue('멍멍집사')).toBeInTheDocument()
    // 서버는 닉네임을 바꾸지 않았다.
    expect(currentAccount().nickname).toBe('코코집사')
  })

  it('[AC-PROFILE-007] 닉네임 형식은 서버가 판정한다 — 400/30002를 인라인 해요체로 보여주고 폼을 유지한다', async () => {
    // 클라이언트 정규식은 없다(BE UserProfile.NICKNAME_PATTERN과 중복). BE INVALID_NICKNAME 모양 그대로 응답한다.
    seedAccount({ nickname: '코코집사' })
    server.use(
      http.put(USER_PROFILE_URL, () =>
        HttpResponse.json({ errorCode: 30002, message: '닉네임 형식이 올바르지 않습니다.' }, { status: 400 }),
      ),
    )
    const user = userEvent.setup()
    renderAt('/mypage/profile')

    const nick = await screen.findByDisplayValue('코코집사')
    await user.clear(nick)
    await user.type(nick, '가') // 2자 미만 → 서버가 거절
    const save = screen.getByRole('button', { name: '저장' })
    expect(save).toBeEnabled()
    await user.click(save)

    expect(await screen.findByText('닉네임은 완성형 한글/영문/숫자 2~12자로 입력해 주세요')).toBeInTheDocument()
    expect(screen.getByDisplayValue('가')).toBeInTheDocument()
    expect(currentAccount().nickname).toBe('코코집사')
  })

  it('[AC-PROFILE-008] 자기소개 150자 상한은 네이티브 maxLength로만 건다(서버 @Size와 중복 slice 없음)', async () => {
    seedAccount({ nickname: '코코집사', bio: '' })
    renderAt('/mypage/profile')

    const bio = await screen.findByLabelText('자기소개')
    expect(bio).toHaveAttribute('maxlength', '150')
  })

  it('[AC-PROFILE-009] 저장 성공 시 성공 토스트를 띄우고 서버에 반영된다', async () => {
    seedAccount({ nickname: '코코집사', bio: '옛 소개' })
    const user = userEvent.setup()
    renderAt('/mypage/profile')

    const bio = await screen.findByDisplayValue('옛 소개')
    await user.clear(bio)
    await user.type(bio, '갱신된 소개')
    await user.click(screen.getByRole('button', { name: '저장' }))

    expect(await screen.findByText('프로필을 저장했어요.')).toBeInTheDocument()
    await waitFor(() => expect(currentAccount().bio).toBe('갱신된 소개'))
  })

  it('[AC-PROFILE-010] 저장 성공 시 GET /users/me를 다시 조회해(invalidate) 허브 카드 값을 갱신한다', async () => {
    seedAccount({ nickname: '코코집사', bio: '옛 소개' })
    // GET /users/me 호출 횟수를 세어, 저장 성공 후 invalidate로 재조회가 일어나는지(허브 카드 갱신 계약) 단언한다.
    let getMeCount = 0
    server.use(
      http.get(USER_ME_URL, () => {
        getMeCount += 1
        return HttpResponse.json({ data: currentAccount() })
      }),
    )
    const user = userEvent.setup()
    renderAt('/mypage/profile')

    const bio = await screen.findByDisplayValue('옛 소개')
    await waitFor(() => expect(getMeCount).toBe(1)) // 초기 로드 1회
    await user.clear(bio)
    await user.type(bio, '갱신된 소개')
    await user.click(screen.getByRole('button', { name: '저장' }))

    // invalidateQueries가 제거되면 재조회가 없어 1회에 머물러 이 단언이 깨진다.
    await waitFor(() => expect(getMeCount).toBeGreaterThanOrEqual(2))
    expect(currentAccount().bio).toBe('갱신된 소개')
  })
})

// 휴대폰 본인 인증 표시는 서버(GET /users/me의 isPhoneVerified·마스킹 phoneNumber)가 진실 원본이다.
describe('/mypage/profile 휴대폰 필드 인증 배지(서버 기준)', () => {
  beforeEach(() => {
    resetAccount()
    seedAccount()
  })

  it('[AC-PROFILE-001] 인증 완료 시 서버 마스킹 번호만 남고 미인증/본인 인증하기 버튼이 없다', async () => {
    seedAccount({ phoneNumber: '010-****-5678', isPhoneVerified: true })
    renderAt('/mypage/profile')

    expect(await screen.findByText('010-****-5678')).toBeInTheDocument()
    expect(screen.queryByText('미인증')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '본인 인증하기' })).not.toBeInTheDocument()
  })

  it('[AC-PROFILE-002] 미인증이면 미인증 pill과 본인 인증하기 버튼이 유지된다', async () => {
    renderAt('/mypage/profile')

    expect(await screen.findByText('미인증')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '본인 인증하기' })).toBeInTheDocument()
  })
})
