import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter, createMemoryHistory } from '@tanstack/react-router'
import { beforeEach, describe, expect, it } from 'vitest'
import { routeTree } from '../../routeTree.gen'
import { makeAdminApplicationWire, seedAdminApplications } from '@/testing/msw/server'

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

/**
 * BE가 dev에 있어 꼬리표 없이 실연동으로 쓰는 항목.
 *
 * 2026-10-26 admin-api-dev 실측: `/admin/admins`(+`/{userId}`)와 `/admin/seller-applications`
 * 계열 넷이 전부다. 이 둘이 늘어나면 아래 두 배열 사이로 항목을 옮기고 `__root.tsx`에서
 * `tag`를 떼면 된다.
 */
const LIVE_LABELS = ['셀러 입점 심사', '관리자 관리'] as const

/** 서버가 없어 들어가도 안내만 보이는 항목 — nav에서는 "준비 중" 꼬리표로 드러난다. */
const PENDING_LABELS = [
  '대시보드',
  '셀러 관리',
  '일반 회원 관리',
  '상품 검수 관리',
  'AI 검수 큐',
  '신고 제재 관리',
  '서비스 문의 관리',
  '주문 배송 모니터링',
  '취소/반품/교환',
  '리뷰 관리',
  '채팅 CS 모니터링',
  '알림/공지 관리',
  '어드민 액션 로그',
] as const

/** 꼬리표 글자는 버튼 접근명 끝에 붙는다 — 어느 항목에 붙었는지까지 이름으로 확인할 수 있다. */
const pendingName = (label: string) => `${label} 준비 중`

// SCRUM-238(26e4b89)이 BE 없는 화면의 운영 진입을 막으면서 nav 항목까지 걷어내, 어드민 메뉴가
// 홈·입점 심사·관리자 관리 셋만 남았다. 규약 10의 목적은 "메뉴를 숨겨라"가 아니라 "운영자가
// 속지 않게 하라"이므로, 메뉴는 되살리고 BE 유무를 꼬리표로 가른다.
//
// 개수만 세는 단언은 항목이 뒤바뀌어도 통과하므로 **항목 이름**으로 확인한다.
describe('어드민 nav', () => {
  beforeEach(() => {
    // 심사 대기 0건 → 입점 심사 항목에 숫자 배지가 붙지 않는 상태가 기본값이다.
    seedAdminApplications()
  })

  it('[AC-ADMIN-NAV-001] 5그룹 15항목이 이름으로 모두 렌더된다', async () => {
    renderAt('/')

    for (const label of LIVE_LABELS) {
      expect(await screen.findByRole('button', { name: label })).toBeInTheDocument()
    }
    // 그룹 머리글 — 셸이 마운트된 뒤에 본다(라우터 마운트가 비동기라 먼저 보면 body가 비어 있다).
    for (const group of ['운영', '검수', '신고 / 문의', '주문 / 클레임', '운영 관리']) {
      expect(screen.getByText(group)).toBeInTheDocument()
    }
    for (const label of PENDING_LABELS) {
      expect(screen.getByRole('button', { name: pendingName(label) })).toBeInTheDocument()
    }
  })

  it('[AC-ADMIN-NAV-002] 꼬리표는 BE가 없는 항목에만 붙고 실연동 항목에는 붙지 않는다', async () => {
    renderAt('/')

    for (const label of LIVE_LABELS) {
      // 실연동 항목의 접근명은 라벨 그대로다 — 꼬리표가 붙으면 이름이 달라져 여기서 깨진다.
      expect(await screen.findByRole('button', { name: label })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: pendingName(label) })).not.toBeInTheDocument()
    }
    for (const label of PENDING_LABELS) {
      expect(screen.queryByRole('button', { name: label })).not.toBeInTheDocument()
    }
    // 꼬리표 자체는 준비 중 항목 수만큼 그려진다(숫자가 아니라 글자로 구별된다).
    expect(screen.getAllByText('준비 중')).toHaveLength(PENDING_LABELS.length)
  })

  it('[AC-ADMIN-NAV-003] 숫자 배지와 준비 중 꼬리표는 서로 다른 자리를 쓴다', async () => {
    seedAdminApplications([
      makeAdminApplicationWire({ applicationId: 11, status: 'SUBMITTED' }),
      makeAdminApplicationWire({ applicationId: 12, status: 'SUBMITTED' }),
    ])

    renderAt('/')

    // 입점 심사는 서버 대기 수를 숫자로 받는다(꼬리표 자리와 겹치지 않는다).
    expect(await screen.findByRole('button', { name: '셀러 입점 심사 2' })).toBeInTheDocument()
    // 준비 중 항목은 숫자 배지를 받지 않는다 — 상수 배지는 AGENTS.md가 금지한 장식 UI다.
    expect(screen.getByRole('button', { name: pendingName('상품 검수 관리') })).toBeInTheDocument()
  })

  it.each([
    ['/', '운영 지표 대시보드는 준비 중이에요'],
    ['/sellers', '셀러 관리는 준비 중이에요'],
    ['/members', '일반 회원 관리는 준비 중이에요'],
    ['/products/review', '상품 검수 관리는 준비 중이에요'],
    ['/products/ai-queue', 'AI 검수 큐는 준비 중이에요'],
    ['/reports', '신고 제재 관리는 준비 중이에요'],
    ['/inquiries', '서비스 문의 관리는 준비 중이에요'],
    ['/orders/monitoring', '주문 배송 모니터링은 준비 중이에요'],
    ['/claims', '취소/반품/교환 관리는 준비 중이에요'],
    ['/reviews', '리뷰 관리는 준비 중이에요'],
    ['/chat-monitoring', '채팅 CS 모니터링은 준비 중이에요'],
    ['/notices', '알림/공지 관리는 준비 중이에요'],
    ['/audit-log', '어드민 액션 로그는 준비 중이에요'],
  ])(
    '[AC-ADMIN-NAV-004] 꼬리표가 붙은 %s 는 404가 아니라 준비 중 안내를 보여준다',
    async (path, message) => {
      renderAt(path)

      expect(await screen.findByText(message)).toBeInTheDocument()
      // 안내만 보여준다 — 목업 표·저장 버튼이 함께 그려지면 운영자가 처리된 줄 안다.
      expect(screen.queryByRole('table')).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: '제출' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: '저장' })).not.toBeInTheDocument()
    },
  )

  it('[AC-ADMIN-NAV-005] 대시보드 안내는 열려 있는 화면으로 바로 보내준다', async () => {
    renderAt('/')

    const shortcut = await screen.findByRole('button', { name: '셀러 입점 심사로' })
    expect(shortcut).toBeInTheDocument()
  })
})
