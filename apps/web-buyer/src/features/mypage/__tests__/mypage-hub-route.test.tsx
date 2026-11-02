import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter, createMemoryHistory } from '@tanstack/react-router'
import { describe, it, expect, beforeEach } from 'vitest'
import { HttpResponse, http } from 'msw'
import { setAccessToken } from '@aechak/api'
import { logout } from '@/shared/auth'
import { POINTS_URL, seedAccount, seedPointBalance, server, USER_ME_URL } from '@/testing/msw/server'
import { routeTree } from '../../../routeTree.gen'

// 마이페이지는 회원 전용 화면이라 비회원에게는 로그인 안내가 뜬다 — 토큰이 세션의 정본이므로
// 이 화면들의 전제인 회원 세션을 토큰으로 세운다.
beforeEach(() => setAccessToken('member-token'))

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
describe('/mypage 비회원 게이트', () => {
  it('[AC-MYPAGE-GUEST-001] 비회원은 내 정보 대신 로그인 안내를 보고 서버를 부르지 않는다', async () => {
    // GET /users/me는 회원 전용이다. 허브를 그대로 열면 빈 프로필 카드와 401 리다이렉트만 남는다.
    let requested = 0
    server.use(
      http.get(USER_ME_URL, () => {
        requested += 1
        return HttpResponse.json({ data: {} })
      }),
    )
    logout()
    renderAt('/mypage')

    expect(await screen.findByText('로그인이 필요해요')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '로그인 / 회원가입' })).toBeInTheDocument()
    expect(requested).toBe(0)
  })
})

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

describe('/mypage 적립금 표시 행', () => {
  beforeEach(() => {
    // 앞 describe가 PENDING 계정을 시드한 채 남길 수 있어 ACTIVE 기본값으로 되돌린다(온보딩 리다이렉트 방지).
    seedAccount()
    seedPointBalance(0)
  })

  it('[AC-POINT-HUB-001] 서버 잔액을 원화로 표시한다', async () => {
    seedPointBalance(12345)
    renderAt('/mypage')

    expect(await screen.findByText('적립금')).toBeInTheDocument()
    expect(await screen.findByText('12,345원')).toBeInTheDocument()
  })

  it('[AC-POINT-HUB-002] 잔액 0도 0원으로 정상 표시한다', async () => {
    seedPointBalance(0)
    renderAt('/mypage')

    expect(await screen.findByText('적립금')).toBeInTheDocument()
    expect(await screen.findByText('0원')).toBeInTheDocument()
  })

  it('[AC-POINT-HUB-003] 조회 실패 시 허브는 정상 렌더되고 금액만 —로 표시한다', async () => {
    server.use(http.get(POINTS_URL, () => HttpResponse.error()))
    renderAt('/mypage')

    // 허브 전체는 살아 있다(메뉴 행 정상 렌더).
    expect(await screen.findByText('본인 인증')).toBeInTheDocument()
    expect(screen.getByText('적립금')).toBeInTheDocument()
    // 금액만 '—'로 강하한다.
    expect(await screen.findByText('—')).toBeInTheDocument()
  })
})

describe('/mypage SNS 진입 행 게이트', () => {
  it('[AC-SNS01-006] SNS BE가 배포되기 전(SNS_SERVER_AVAILABLE=false)에는 SNS 진입 행을 숨긴다', async () => {
    seedAccount({ nickname: '코코집사' })
    renderAt('/mypage')

    expect(await screen.findByText('코코집사')).toBeInTheDocument()
    expect(screen.getByText('주문 내역')).toBeInTheDocument()
    expect(screen.queryByText('내 SNS 프로필')).not.toBeInTheDocument()
    expect(screen.queryByText('차단/뮤트 관리')).not.toBeInTheDocument()
  })
})
