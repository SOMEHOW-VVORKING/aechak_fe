import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter, createMemoryHistory } from '@tanstack/react-router'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { routeTree } from '../../../routeTree.gen'
import {
  ADMIN_ROSTER_URL,
  CURRENT_ADMIN_USER_ID,
  currentAdminRoster,
  makeAdminRosterWire,
  seedAdminRoster,
  server,
} from '@/testing/msw/server'

// 관리자 명부 실연동 — MSW가 admin 호스트(8082) /admin/admins 3종을 가로챈다. 모듈 모킹이 아니라
// 네트워크 레벨이라 URL·호스트·봉투·에러 계약과 **가드 순서**까지 함께 검증된다.
function renderAt(path: string) {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
  })
  // 에러 분기를 즉시 보려면 재시도를 끈다(main.tsx는 retry 1).
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return router
}

const rowOf = async (text: string) => (await screen.findByText(text)).closest('tr') as HTMLElement

const PARTNER = makeAdminRosterWire({ userId: 7, nickname: '김운영', joinedAt: '2026-10-05T09:00:00' })
/** 온보딩 전 계정은 nickname이 null이다 — 화면이 식별자로 쓸 수 없다. */
const NAMELESS = makeAdminRosterWire({ userId: 9, nickname: null, joinedAt: '2026-10-09T09:00:00' })
const GENERAL_ACTIVE = makeAdminRosterWire({
  userId: 45,
  nickname: '승격대상',
  role: 'GENERAL',
  status: 'ACTIVE',
})
const GENERAL_SUSPENDED = makeAdminRosterWire({
  userId: 46,
  nickname: '정지회원',
  role: 'GENERAL',
  status: 'SUSPENDED',
})

describe('/admins 관리자 명부 (SCRUM-252, 253)', () => {
  beforeEach(() => {
    seedAdminRoster([PARTNER, NAMELESS, GENERAL_ACTIVE, GENERAL_SUSPENDED])
  })

  it('[AC-ADM-ROSTER-001] 명부는 가입 순으로 오고 자기 행에 나 표시, 닉네임 null은 id로 대신한다', async () => {
    renderAt('/admins')

    // 서버 정렬(userId 오름차순)을 그대로 쓴다 — 요청자(1) → 김운영(7) → 이름 없는 계정(9).
    const rows = await waitFor(() => {
      const found = screen.getAllByRole('row')
      expect(found).toHaveLength(4) // 헤더 + 관리자 3명(일반 회원 2명은 명부에 없다)
      return found
    })
    expect(within(rows[1]!).getByText('나')).toBeInTheDocument()
    expect(rows[2]).toHaveTextContent('김운영')
    // nickname이 null이면 화면이 지어내지 않고 id를 보여 준다.
    expect(rows[3]).toHaveTextContent('이름 없는 계정 (9)')
    // 값이 users.created_at이므로 라벨은 '가입일'이다 — '승격일'로 적으면 가입 시각을 승격 시각으로 위장한다.
    expect(screen.getByRole('columnheader', { name: '가입일' })).toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: '승격일' })).not.toBeInTheDocument()
    expect(rows[2]).toHaveTextContent('2026.10.05')
    // totalCount는 관리자만 센다(일반 회원 2명은 들어가지 않는다).
    expect(screen.getByText('3', { selector: '.tabular-nums' })).toBeInTheDocument()
  })

  it('[AC-ADM-ROSTER-002] 승격 직후 재로그인이 필요하다는 안내가 화면에 고정돼 있다', async () => {
    renderAt('/admins')

    // role은 로그인 시점 JWT 스냅샷이다 — 이 문구는 계약의 일부라 성공 토스트와 별개로 늘 보인다.
    expect(await screen.findByText(/구매자 앱\(api\)에서 다시 로그인해야 관리자 권한이 반영돼요/)).toBeInTheDocument()
    expect(screen.getByText(/이미 발급된 토큰이 만료될 때까지 관리자로 통과해요/)).toBeInTheDocument()
  })

  it('[AC-ADM-ROSTER-003] 활성 일반 회원을 승격하면 명부에 추가되고 재로그인 안내가 다시 뜬다', async () => {
    const user = userEvent.setup()
    renderAt('/admins')
    await rowOf('김운영')

    await user.type(screen.getByLabelText('승격할 사용자 ID'), '45')
    await user.click(screen.getByRole('button', { name: '관리자로 승격' }))

    expect(
      await screen.findByText('관리자로 승격했어요. 그 계정은 다시 로그인해야 권한이 반영돼요.'),
    ).toBeInTheDocument()
    await screen.findByText('승격대상')
    expect(currentAdminRoster().find(row => row.userId === 45)?.role).toBe('ADMIN')
    // 성공하면 입력칸을 비워 같은 id를 두 번 보내지 않게 한다.
    expect(screen.getByLabelText('승격할 사용자 ID')).toHaveValue('')
  })

  it('[AC-ADM-ROSTER-004] 비활성 계정 승격은 409 errorCode 30017로 거절되고 사유를 보여준다', async () => {
    const user = userEvent.setup()
    renderAt('/admins')
    await rowOf('김운영')

    await user.type(screen.getByLabelText('승격할 사용자 ID'), '46')
    await user.click(screen.getByRole('button', { name: '관리자로 승격' }))

    // 계약 초안의 30015가 아니고 P0-4 보고 시점의 500도 아니다 — develop은 409/30017이다.
    expect(await screen.findByText('활성 상태인 계정만 관리자로 승격할 수 있어요.')).toBeInTheDocument()
    expect(currentAdminRoster().find(row => row.userId === 46)?.role).toBe('GENERAL')
  })

  it('[AC-ADM-ROSTER-005] 이미 관리자인 계정 승격은 409 errorCode 30012로 거절된다', async () => {
    const user = userEvent.setup()
    renderAt('/admins')
    await rowOf('김운영')

    await user.type(screen.getByLabelText('승격할 사용자 ID'), '7')
    await user.click(screen.getByRole('button', { name: '관리자로 승격' }))

    expect(await screen.findByText('이미 관리자인 계정이에요. 명부를 새로고침해 주세요.')).toBeInTheDocument()
  })

  it('[AC-ADM-ROSTER-006] 자기 자신 승격은 403 errorCode 30014로 거절된다', async () => {
    const user = userEvent.setup()
    renderAt('/admins')
    await rowOf('김운영')

    await user.type(screen.getByLabelText('승격할 사용자 ID'), String(CURRENT_ADMIN_USER_ID))
    await user.click(screen.getByRole('button', { name: '관리자로 승격' }))

    expect(
      await screen.findByText('자기 자신의 역할은 바꿀 수 없어요. 다른 관리자에게 요청해 주세요.'),
    ).toBeInTheDocument()
  })

  it('[AC-ADM-ROSTER-007] 숫자가 아닌 사용자 ID로는 승격 버튼이 눌리지 않는다', async () => {
    const user = userEvent.setup()
    renderAt('/admins')
    await rowOf('김운영')

    expect(screen.getByRole('button', { name: '관리자로 승격' })).toBeDisabled()
    await user.type(screen.getByLabelText('승격할 사용자 ID'), 'abc')
    expect(screen.getByRole('button', { name: '관리자로 승격' })).toBeDisabled()
    await user.clear(screen.getByLabelText('승격할 사용자 ID'))
    await user.type(screen.getByLabelText('승격할 사용자 ID'), '45')
    expect(screen.getByRole('button', { name: '관리자로 승격' })).toBeEnabled()
  })

  it('[AC-ADM-ROSTER-008] 강등은 확인 Modal을 거친 뒤 명부에서 빠진다', async () => {
    const user = userEvent.setup()
    renderAt('/admins')
    const row = await rowOf('김운영')

    await user.click(within(row).getByRole('button', { name: '김운영 관리자 권한 해제' }))
    const modal = await screen.findByRole('dialog')
    // 강등해도 이미 발급된 토큰은 만료까지 통과한다 — 즉시 차단으로 설명하지 않는다.
    expect(modal).toHaveTextContent('이미 발급된 토큰은 만료될 때까지 관리자로 통과해요.')
    await user.click(within(modal).getByRole('button', { name: '권한 해제' }))

    expect(await screen.findByText('관리자 권한을 해제했어요.')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText('김운영')).not.toBeInTheDocument())
    expect(currentAdminRoster().find(row2 => row2.userId === 7)?.role).toBe('GENERAL')
  })

  it('[AC-ADM-ROSTER-009] 자기 자신의 권한 해제 버튼은 비활성이다', async () => {
    renderAt('/admins')
    const row = await rowOf('현재 운영자')

    // 서버가 403/30014로 막는 요청이라 누를 수 있게 둘 이유가 없다.
    expect(within(row).getByRole('button', { name: '현재 운영자 관리자 권한 해제' })).toBeDisabled()
  })

  it('[AC-ADM-ROSTER-010] 마지막 관리자 강등은 409 errorCode 30013으로 막히고 사유를 보여준다', async () => {
    const user = userEvent.setup()
    // 자기 자신의 권한 해제 버튼은 비활성이라(403/30014) 화면에서 30013을 실제로 만들 수 없다 —
    // 서버가 그 판정을 하는 주체이므로 DELETE만 30013으로 떨어뜨리고 FE 분기를 본다.
    seedAdminRoster([PARTNER])
    server.use(
      http.delete(`${ADMIN_ROSTER_URL}/:userId`, () =>
        HttpResponse.json({ errorCode: 30013, message: '마지막 관리자는 강등할 수 없습니다.' }, { status: 409 }),
      ),
    )
    renderAt('/admins')
    const row = await rowOf('김운영')

    await user.click(within(row).getByRole('button', { name: '김운영 관리자 권한 해제' }))
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '권한 해제' }))

    expect(
      await screen.findByText('마지막 관리자는 강등할 수 없어요. 다른 관리자를 먼저 추가해 주세요.'),
    ).toBeInTheDocument()
    expect(screen.getByText('김운영')).toBeInTheDocument()
  })

  it('[AC-ADM-ROSTER-011] 권한 없는 계정(403 errorCode 20011)은 빈 명부가 아니라 사유를 보여준다', async () => {
    server.use(
      http.get(ADMIN_ROSTER_URL, () =>
        HttpResponse.json({ errorCode: 20011, message: '권한이 없습니다.' }, { status: 403 }),
      ),
    )
    renderAt('/admins')

    // 로그인 자체는 역할을 보지 않는다 — 일반 회원도 토큰을 받고 여기서 막힌다. "등록된 관리자가
    // 없어요"로 접으면 운영자가 명부가 비었다고 읽는다.
    expect(
      await screen.findByText('관리자 권한이 없는 계정이에요. 관리자 계정으로 다시 로그인해 주세요.'),
    ).toBeInTheDocument()
    expect(screen.getByText('관리자 명부를 불러오지 못했어요.')).toBeInTheDocument()
    expect(screen.queryByText('등록된 관리자가 없어요.')).not.toBeInTheDocument()
  })

  it('[AC-ADM-ROSTER-012] 권한 오류는 안내만 하지 않고 로그인 화면으로 갈 수단을 함께 준다', async () => {
    const user = userEvent.setup()
    server.use(
      http.get(ADMIN_ROSTER_URL, () =>
        HttpResponse.json({ errorCode: 20011, message: '권한이 없습니다.' }, { status: 403 }),
      ),
    )
    const router = renderAt('/admins')

    // 403은 401이 아니라 세션 만료 전역 이동(setOnAuthExpired)을 깨우지 않는다 — 버튼이 없으면
    // 운영자가 주소를 직접 쳐야 복구된다.
    await user.click(await screen.findByRole('button', { name: '로그인 화면으로' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
  })

  it('[AC-ADM-ROSTER-013] 2페이지 조회가 실패해도 이전 페이지로 돌아갈 수단이 남는다', async () => {
    const user = userEvent.setup()
    // 21명이면 2페이지가 생긴다(서버 size 20).
    seedAdminRoster(
      Array.from({ length: 20 }, (_, index) =>
        makeAdminRosterWire({
          userId: 100 + index,
          nickname: `관리자${index}`,
          joinedAt: '2026-10-05T09:00:00',
        }),
      ),
    )
    const router = renderAt('/admins')
    await screen.findByText('관리자0')
    expect(router.state.location.pathname).toBe('/admins')

    server.use(
      http.get(ADMIN_ROSTER_URL, () =>
        HttpResponse.json({ errorCode: 90000, message: '서버 오류' }, { status: 500 }),
      ),
    )
    await user.click(screen.getByRole('button', { name: '다음' }))

    // 실패하면 totalCount가 0으로 떨어져 totalPages도 1이 된다 — `totalPages > 1`로만 페이저를
    // 그리면 '이전' 버튼까지 사라져 빈 화면에 갇힌다.
    expect(await screen.findByText('관리자 명부를 불러오지 못했어요.')).toBeInTheDocument()
    const previous = screen.getByRole('button', { name: '이전' })
    expect(previous).toBeEnabled()
    expect(screen.getByRole('button', { name: '다음' })).toBeDisabled()

    server.resetHandlers()
    await user.click(previous)
    expect(await screen.findByText('관리자0')).toBeInTheDocument()
  })

  it('[AC-ADM-ROSTER-014] 권한 없는 계정(403/20011)에서는 승격 버튼이 눌리지 않는다', async () => {
    const user = userEvent.setup()
    server.use(
      http.get(ADMIN_ROSTER_URL, () =>
        HttpResponse.json({ errorCode: 20011, message: '권한이 없습니다.' }, { status: 403 }),
      ),
    )
    renderAt('/admins')
    await screen.findByText('관리자 권한이 없는 계정이에요. 관리자 계정으로 다시 로그인해 주세요.')

    await user.type(screen.getByLabelText('승격할 사용자 ID'), '45')

    // 명부가 막힌 이유 자체가 권한이라, 같은 토큰으로 나가는 승격도 서버가 반드시 거절한다 —
    // 누를 수 있게 둬서 실패를 보여 줄 이유가 없다(자기 자신 강등 버튼과 같은 판단).
    expect(screen.getByRole('button', { name: '관리자로 승격' })).toBeDisabled()
  })

  it('[AC-ADM-ROSTER-015] 일시 장애(5xx)로 명부가 비어도 승격은 막지 않는다', async () => {
    const user = userEvent.setup()
    server.use(
      http.get(ADMIN_ROSTER_URL, () =>
        HttpResponse.json({ errorCode: 90000, message: '서버 오류' }, { status: 500 }),
      ),
    )
    renderAt('/admins')
    await screen.findByText('관리자 명부를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.')

    await user.type(screen.getByLabelText('승격할 사용자 ID'), '45')

    // 재시도로 풀릴 수 있는 실패다 — 권한 오류와 같이 묶어 막으면 할 수 있는 일을 못 하게 된다.
    expect(screen.getByRole('button', { name: '관리자로 승격' })).toBeEnabled()
  })
})
