import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter, createMemoryHistory } from '@tanstack/react-router'
import { HttpResponse, http } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { routeTree } from '../../../routeTree.gen'
import {
  ADMIN_MEMBERS_URL,
  CURRENT_ADMIN_USER_ID,
  currentAdminMember,
  makeAdminMemberWire,
  seedAdminMembers,
  server,
} from '@/testing/msw/server'

function renderAt(path: string) {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
  })
  // 에러 분기를 즉시 보려면 재시도를 끈다(main.tsx는 retry 1).
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

const 정상회원 = makeAdminMemberWire({ userId: 1001, nickname: '코코맘', reportCount: 1 })
const 제한회원 = makeAdminMemberWire({
  userId: 1002,
  publicId: '01HZXK0000000000000000002',
  nickname: '먼지아빠',
  storedStatus: 'RESTRICTED',
  reportCount: 3,
  warningCount: 2,
  joinedAt: '2026-04-11T09:00:00',
})

const drawer = async () => within(await screen.findByRole('dialog', { name: '회원 상세' }))

/** 드로어의 결정 라디오는 자체 <label>이라 라벨 글자를 누른다(DS Radio의 input은 sr-only다). */
async function choose(label: string) {
  const open = await drawer()
  await userEvent.setup().click(open.getByText(label))
}

describe('/members', () => {
  beforeEach(() => {
    seedAdminMembers([정상회원, 제한회원])
  })

  it('[AC-MEMBER-001] 목록은 실서버 회원과 계정 상태·가입일을 보여준다', async () => {
    renderAt('/members')

    expect(await screen.findByRole('button', { name: '1002' })).toBeInTheDocument()
    // 필터 Select의 <option>에 같은 글자가 있어 전역에서 찾으면 목록이 비어도 통과한다 — 표 안으로 좁힌다.
    const table = within(screen.getByRole('table'))
    expect(table.getByText('먼지아빠')).toBeInTheDocument()
    expect(table.getByText('이용 제한')).toBeInTheDocument()
    expect(table.getByText('2026-04-11')).toBeInTheDocument()
    expect(screen.getByText('조건에 맞는 회원 2명')).toBeInTheDocument()
  })

  it('[AC-MEMBER-002] 목록 조회가 실패하면 빈 상태가 아니라 실패를 드러낸다', async () => {
    server.use(
      http.get(ADMIN_MEMBERS_URL, () =>
        HttpResponse.json({ errorCode: 20011, message: '접근 권한이 없습니다.' }, { status: 403 }),
      ),
    )
    renderAt('/members')

    expect(await screen.findByText(/어드민 권한이 없어 회원 목록을 볼 수 없어요/)).toBeInTheDocument()
    // "데이터 없음"으로 떨어지면 운영자가 권한 문제를 알 수 없다.
    expect(screen.queryByText('조건에 맞는 회원이 없어요.')).not.toBeInTheDocument()
  })

  it('[AC-MEMBER-003] 상세는 제재 이력과 사유·메모를 보여준다', async () => {
    seedAdminMembers([
      makeAdminMemberWire({
        ...제한회원,
        sanctions: [
          {
            sanctionId: 7,
            action: 'RESTRICT',
            reasonCode: 'ABUSIVE_REVIEW',
            reasonDetail: null,
            effectiveUntil: null,
            memo: 'CS 티켓 1024',
            actedByAdminId: CURRENT_ADMIN_USER_ID,
            actedAt: '2026-10-20T11:00:00',
          },
        ],
      }),
    ])
    const user = userEvent.setup()
    renderAt('/members')

    await user.click(await screen.findByRole('button', { name: '1002' }))

    const open = await drawer()
    // '이용 제한'은 상태 pill·이력 라벨·결정 라디오 셋에 다 있어 이력 목록 안으로 좁혀서 본다.
    const history = within(open.getByRole('list'))
    expect(open.getByText('제재 이력 / 1건')).toBeInTheDocument()
    expect(history.getByText('이용 제한')).toBeInTheDocument()
    expect(history.getByText(/리뷰 욕설\/비방 반복/)).toBeInTheDocument()
    expect(history.getByText(/CS 티켓 1024/)).toBeInTheDocument()
    expect(history.getByText('2026-10-20')).toBeInTheDocument()
  })

  it('[AC-MEMBER-004] 이용 제한을 제출하면 서버 상태가 바뀌고 이력이 남는다', async () => {
    const user = userEvent.setup()
    renderAt('/members')
    await user.click(await screen.findByRole('button', { name: '1001' }))

    await choose('이용 제한')
    const open = await drawer()
    await user.selectOptions(
      open.getByRole('combobox'),
      open.getByRole('option', { name: '허위 신고 반복' }),
    )
    await user.click(open.getByRole('button', { name: '제출' }))
    const confirm = within(await screen.findByRole('dialog', { name: '이용을 제한할까요?' }))
    await user.click(confirm.getByRole('button', { name: '이용 제한' }))

    await screen.findByText('이용 제한 처리했어요.')
    const after = currentAdminMember(1001)
    expect(after?.storedStatus).toBe('RESTRICTED')
    expect(after?.sanctions).toHaveLength(1)
    expect(after?.sanctions[0]?.reasonCode).toBe('FALSE_REPORT')
    // 이용 제한은 기간이 없는 제재다 — 기간을 함께 보내면 서버가 400(30802)으로 거절한다.
    expect(after?.sanctions[0]?.effectiveUntil).toBeNull()
  })

  it('[AC-MEMBER-005] 임시 정지는 기간을 고르지 않으면 제출할 수 없고, 고르면 만료 시각이 생긴다', async () => {
    const user = userEvent.setup()
    renderAt('/members')
    await user.click(await screen.findByRole('button', { name: '1001' }))

    await choose('임시 정지')
    let open = await drawer()
    // 드로어의 Select 둘(사유·기간)은 접근명이 없어 등장 순서로 가린다.
    const reasonSelect = open.getAllByRole('combobox')[0]!
    await user.selectOptions(
      reasonSelect,
      within(reasonSelect).getByRole('option', { name: '채팅 분쟁 반복' }),
    )
    // 기간이 비면 제출이 잠긴다 — 서버의 30801을 화면에서 먼저 막는다.
    open = await drawer()
    expect(open.getByRole('button', { name: '제출' })).toBeDisabled()

    const periodSelect = open.getAllByRole('combobox')[1]!
    await user.selectOptions(periodSelect, within(periodSelect).getByRole('option', { name: '7일' }))
    open = await drawer()
    await user.click(open.getByRole('button', { name: '제출' }))
    const confirm = within(await screen.findByRole('dialog', { name: '계정을 임시 정지할까요?' }))
    await user.click(confirm.getByRole('button', { name: '임시 정지' }))

    await screen.findByText('임시 정지 처리했어요.')
    const after = currentAdminMember(1001)
    expect(after?.storedStatus).toBe('SUSPENDED')
    expect(after?.sanctionUntil).not.toBeNull()
    expect(after?.sanctions[0]?.effectiveUntil).toBe(after?.sanctionUntil)
  })

  it('[AC-MEMBER-006] 기타 사유는 상세 사유를 적어야 제출할 수 있다', async () => {
    const user = userEvent.setup()
    renderAt('/members')
    await user.click(await screen.findByRole('button', { name: '1001' }))

    await choose('영구 정지')
    let open = await drawer()
    await user.selectOptions(
      open.getByRole('combobox'),
      open.getByRole('option', { name: '기타 (상세 사유 필수)' }),
    )
    open = await drawer()
    expect(open.getByRole('button', { name: '제출' })).toBeDisabled()

    await user.type(open.getByPlaceholderText('상세 사유를 입력하세요.'), '신고 누적 9건')
    open = await drawer()
    expect(open.getByRole('button', { name: '제출' })).toBeEnabled()
  })

  it('[AC-MEMBER-007] 제재 해제는 사유 선택 없이 제출되고 정상으로 돌아간다', async () => {
    const user = userEvent.setup()
    renderAt('/members')
    await user.click(await screen.findByRole('button', { name: '1002' }))

    await choose('정상')
    const open = await drawer()
    await user.type(open.getByPlaceholderText('해제 사유를 입력하세요.'), '오인 제재 확인')
    await user.click(open.getByRole('button', { name: '제출' }))
    const confirm = within(await screen.findByRole('dialog', { name: '정상 상태로 되돌릴까요?' }))
    await user.click(confirm.getByRole('button', { name: '정상 전환' }))

    await screen.findByText('정상 전환 처리했어요.')
    const after = currentAdminMember(1002)
    expect(after?.storedStatus).toBe('ACTIVE')
    const release = after?.sanctions.at(-1)
    expect(release?.action).toBe('RELEASE')
    // 해제는 제재 사유 어휘를 쓰지 않는다 — 상세 문장만 남는다.
    expect(release?.reasonCode).toBeNull()
    expect(release?.reasonDetail).toBe('오인 제재 확인')
  })

  it('[AC-MEMBER-008] 영구 정지된 계정은 어떤 결정도 고를 수 없고 제출도 막힌다', async () => {
    seedAdminMembers([makeAdminMemberWire({ ...제한회원, storedStatus: 'BANNED' })])
    const user = userEvent.setup()
    renderAt('/members')
    await user.click(await screen.findByRole('button', { name: '1002' }))

    const open = await drawer()
    expect(open.getByText(/추가 제재도 해제도 할 수 없어요/)).toBeInTheDocument()
    for (const radio of open.getAllByRole('radio')) expect(radio).toBeDisabled()
    expect(open.getByRole('button', { name: '제출' })).toBeDisabled()
  })

  it('[AC-MEMBER-008b] 화면이 낡아 영구 정지를 모른 채 제출하면 409 문구로 드러나고 상태가 그대로다', async () => {
    const user = userEvent.setup()
    renderAt('/members')
    await user.click(await screen.findByRole('button', { name: '1001' }))
    await choose('이용 제한')
    const open = await drawer()
    await user.selectOptions(
      open.getByRole('combobox'),
      open.getByRole('option', { name: '허위 신고 반복' }),
    )
    // 운영자가 사유를 고르는 동안 다른 운영자가 영구 정지했다 — 열린 화면은 그 사실을 모른다.
    seedAdminMembers([makeAdminMemberWire({ ...정상회원, storedStatus: 'BANNED' })])

    await user.click(open.getByRole('button', { name: '제출' }))
    const confirm = within(await screen.findByRole('dialog', { name: '이용을 제한할까요?' }))
    await user.click(confirm.getByRole('button', { name: '이용 제한' }))

    expect(await screen.findByText(/이미 영구 정지된 계정이라/)).toBeInTheDocument()
    expect(currentAdminMember(1001)?.storedStatus).toBe('BANNED')
    expect(currentAdminMember(1001)?.sanctions).toHaveLength(0)
  })

  it('[AC-MEMBER-008c] 제재가 없는 계정은 해제를 고를 수 없다 — 누르면 반드시 409가 된다', async () => {
    const user = userEvent.setup()
    renderAt('/members')
    await user.click(await screen.findByRole('button', { name: '1001' }))

    const open = await drawer()
    expect(open.getByText('해제할 제재가 없어요')).toBeInTheDocument()
    expect(open.getAllByRole('radio')[0]).toBeDisabled()
    expect(open.getByRole('button', { name: '제출' })).toBeDisabled()
  })

  it('[AC-MEMBER-008d] 온보딩 전 계정은 되돌아오는 제재를 고를 수 없고 종단 제재만 남는다', async () => {
    seedAdminMembers([makeAdminMemberWire({ ...정상회원, storedStatus: 'PENDING_ONBOARDING' })])
    const user = userEvent.setup()
    renderAt('/members')
    await user.click(await screen.findByRole('button', { name: '1001' }))

    const open = await drawer()
    const radios = open.getAllByRole('radio')
    // 정상(해제)·이용 제한·임시 정지는 막히고 영구 정지·탈퇴 처리만 열린다.
    expect(radios.slice(0, 3).every(radio => (radio as HTMLInputElement).disabled)).toBe(true)
    expect(radios.slice(3).every(radio => (radio as HTMLInputElement).disabled)).toBe(false)
    expect(open.getAllByText(/가입을 마치지 않은 계정에는 걸 수 없어요/)).toHaveLength(2)
  })

  it('[AC-MEMBER-009] 기간이 지난 임시 정지는 정상으로 보이고 기록은 임시 정지로 남는다', async () => {
    seedAdminMembers([
      makeAdminMemberWire({
        ...정상회원,
        storedStatus: 'SUSPENDED',
        sanctionUntil: '2026-01-01T00:00:00',
      }),
    ])
    const user = userEvent.setup()
    renderAt('/members')

    expect(await screen.findByRole('button', { name: '1001' })).toBeInTheDocument()
    // 필터 <option>에도 '정상'이 있어 표 안으로 좁힌다.
    const table = within(screen.getByRole('table'))
    expect(table.getByText('정상')).toBeInTheDocument()
    // 상태 필터는 저장값으로 고르므로, 목록이 '정상'으로 보이는 이유가 행에 남아야 한다.
    expect(table.getByText('임시 정지 기간 만료')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '1001' }))
    const open = await drawer()
    expect(open.getByText(/임시 정지 기간이 지나 이용이 다시 열렸어요/)).toBeInTheDocument()
  })

  it('[AC-MEMBER-010] 상태 필터는 서버로 나가고 커서 사슬이 필터마다 새로 시작된다', async () => {
    const requested: string[] = []
    server.events.on('request:start', ({ request }) => {
      const url = new URL(request.url)
      if (url.pathname.endsWith('/admin/members')) {
        requested.push(`${url.searchParams.get('status') ?? 'none'}|${url.searchParams.get('cursor') ?? 'none'}`)
      }
    })
    const user = userEvent.setup()
    renderAt('/members')
    await screen.findByRole('button', { name: '1002' })

    await user.selectOptions(
      screen.getAllByRole('combobox')[0]!,
      screen.getByRole('option', { name: '이용 제한' }),
    )

    await screen.findByText('조건에 맞는 회원 1명')
    // 첫 요청은 필터·커서 없이, 필터를 바꾼 요청은 status만 붙고 커서는 비어야 한다 —
    // 옛 커서를 함께 보내면 서버가 400(90002)으로 끊는다.
    expect(requested).toEqual(['none|none', 'RESTRICTED|none'])
  })

  it('[AC-MEMBER-011] 더 보기는 커서로 다음 페이지를 이어 받는다', async () => {
    // 기본 페이지 크기(20)를 넘겨 서버가 커서를 주게 한다 — size를 테스트용으로 바꾸면
    // 화면이 실제로 보내는 값과 달라져 커서 흐름을 검증하지 못한다.
    seedAdminMembers(
      Array.from({ length: 21 }, (_, index) =>
        makeAdminMemberWire({
          userId: 2000 + index,
          publicId: `01HZXK00000000000000${String(index).padStart(5, '0')}`,
          nickname: `회원${index}`,
        }),
      ),
    )
    const user = userEvent.setup()
    renderAt('/members')

    // 가입 역순(userId 내림차순)이라 첫 페이지는 2020부터 2001까지다.
    expect(await screen.findByRole('button', { name: '2020' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '2000' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '더 보기' }))

    expect(await screen.findByRole('button', { name: '2000' })).toBeInTheDocument()
    // 마지막 페이지에서는 더 보기가 사라진다.
    expect(screen.queryByRole('button', { name: '더 보기' })).not.toBeInTheDocument()
  })
})
