import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter, createMemoryHistory } from '@tanstack/react-router'
import { describe, it, expect, beforeEach } from 'vitest'
import { HttpResponse, http } from 'msw'
import { seedAccount, server, USER_ME_URL } from '@/testing/msw/server'
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

// 마이 허브 프로필 카드는 GET /users/me(useMe)로 렌더한다. 인증 배지는 서버 isPhoneVerified 기준.
describe('/mypage 프로필 요약 카드 실서버 연동', () => {
  beforeEach(() => {
    seedAccount()
  })

  it('[AC-MYPAGE-HUB-001] 프로필 카드가 서버 값(닉네임·이메일·미인증 배지)을 렌더한다', async () => {
    seedAccount({
      nickname: '코코집사',
      email: 'coco****@aechak.co.kr',
      isPhoneVerified: false,
    })
    renderAt('/mypage')

    expect(await screen.findByText('코코집사')).toBeInTheDocument()
    expect(screen.getByText('coco****@aechak.co.kr')).toBeInTheDocument()
    // 미인증: 프로필 카드 배지 + '본인 인증' 메뉴 행 pill 두 곳.
    expect(screen.getAllByText('미인증')).toHaveLength(2)
    expect(screen.queryByText('인증완료')).not.toBeInTheDocument()
  })

  it('[AC-MYPAGE-HUB-002] 인증 완료면 카드 중복 배지는 없고 메뉴 행에 인증완료만 남는다', async () => {
    seedAccount({ nickname: '코코집사', isPhoneVerified: true })
    renderAt('/mypage')

    // 프로필 카드(닉네임)가 뜬 뒤 = useMe 로드 완료. 메뉴 행 pill은 서버 isPhoneVerified 기준으로 갱신된다.
    expect(await screen.findByText('코코집사')).toBeInTheDocument()
    expect(screen.getByText('본인 인증')).toBeInTheDocument()
    expect(screen.getByText('인증완료')).toBeInTheDocument()
    expect(screen.queryByText('미인증')).not.toBeInTheDocument()
  })

  it('[AC-MYPAGE-HUB-003] 내 정보 조회 실패 시 재시도 EmptyState를 보여준다', async () => {
    server.use(http.get(USER_ME_URL, () => HttpResponse.json({ message: 'oops' }, { status: 500 })))
    renderAt('/mypage')

    expect(await screen.findByText('프로필을 불러오지 못했어요')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeInTheDocument()
  })

  it('[AC-MYPAGE-HUB-004] PENDING(온보딩 미완료) 유저는 온보딩 약관 화면으로 보낸다', async () => {
    // GET /users/me는 PENDING도 200(화이트리스트)이라 프로필 계열이 전부 null로 온다.
    // 퇴화된 카드를 보여주지 말고 온보딩 약관 화면으로 리다이렉트해야 한다.
    seedAccount({
      status: 'PENDING_ONBOARDING',
      nickname: null,
      email: null,
      bio: null,
      profileImageKey: null,
      profileImageUrl: null,
    })
    renderAt('/mypage')

    expect(await screen.findByText('약관에 동의해 주세요')).toBeInTheDocument()
  })
})
