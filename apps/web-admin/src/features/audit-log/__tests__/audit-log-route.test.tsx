import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter, createMemoryHistory } from '@tanstack/react-router'
import { HttpResponse, http } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { routeTree } from '../../../routeTree.gen'
import {
  ADMIN_APPLICATIONS_URL,
  ADMIN_AUDIT_LOGS_URL,
  makeAdminAuditLogWire,
  seedAdminAuditLogs,
  server,
} from '@/testing/msw/server'

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
  return { queryClient, router }
}

/** 감사 기록을 모으기 시작한 시각 — 빈 목록 문구가 이 값을 말해야 한다. */
const RECORDING_SINCE = '2026-10-20T09:00:00'

const 입점승인 = makeAdminAuditLogWire({
  id: 'aud_90412',
  actedAt: '2026-10-26T20:31:08',
  actorNickname: '김운영',
  action: 'SELLER_APPLICATION_APPROVED',
  actionLabel: '셀러 입점 승인',
  targetType: 'SELLER_APPLICATION',
  targetTypeLabel: '입점 신청',
  targetId: '20412',
  targetLabel: '보리펫샵',
  result: 'SUCCESS',
  httpStatus: 200,
  clientIp: '10.42.8.104',
})

/** 내부 PK로 가리키는 대상인데 **이름이 남아 있지 않은** 행 — 종류+식별자로 읽혀야 한다. */
const 회원제재 = makeAdminAuditLogWire({
  id: 'aud_90377',
  actedAt: '2026-10-26T11:18:02',
  actorNickname: '박CS',
  action: 'MEMBER_SANCTIONED',
  actionLabel: '회원 이용 제한',
  targetType: 'MEMBER',
  targetTypeLabel: '회원',
  targetId: '19023',
  targetLabel: null,
  reason: '리뷰 욕설 반복',
  result: 'SUCCESS',
  httpStatus: 200,
})

/** 실패 행 — 사유 메모가 비어 있어도 왜 실패했는지가 상세에 남아야 한다. */
const 권한부여실패 = makeAdminAuditLogWire({
  id: 'aud_90351',
  actedAt: '2026-10-25T22:47:31',
  actorNickname: '김운영',
  action: 'ADMIN_PROMOTED',
  actionLabel: '관리자 권한 부여',
  targetType: 'ADMIN_USER',
  targetTypeLabel: '관리자',
  targetId: '7',
  targetLabel: '최신입',
  reason: null,
  result: 'FAILURE',
  httpStatus: 403,
  clientIp: null,
})

/** 공개 식별자(ULID)로 가리키는 대상 — 내부 PK와 같은 모양으로 읽히면 안 된다. */
const 클레임개입 = makeAdminAuditLogWire({
  id: 'aud_90288',
  actedAt: '2026-10-23T09:41:55',
  actorNickname: null,
  actorRole: 'GENERAL',
  action: 'CLAIM_INTERVENED',
  actionLabel: '클레임 개입',
  targetType: 'CLAIM',
  targetTypeLabel: '클레임',
  targetId: '01HZXC0000000000000000009',
  targetLabel: '파손 반품 분쟁',
  result: 'SUCCESS',
  httpStatus: 200,
})

const drawer = async () => within(await screen.findByRole('dialog', { name: '액션 로그 상세' }))

/** 목록 조회로 나간 쿼리 문자열을 모은다 — 필터가 **서버로** 나가는지는 이것으로만 말할 수 있다. */
function recordListQueries(): string[] {
  const queries: string[] = []
  server.events.on('request:start', ({ request }) => {
    const url = new URL(request.url)
    if (!url.pathname.endsWith('/admin/audit-logs')) return
    queries.push(
      [
        url.searchParams.get('targetType') ?? 'none',
        url.searchParams.get('action') ?? 'none',
        url.searchParams.get('result') ?? 'none',
        url.searchParams.get('keyword') ?? 'none',
        url.searchParams.get('cursor') ?? 'none',
      ].join('|'),
    )
  })
  return queries
}

const forbidden = () =>
  http.get(ADMIN_AUDIT_LOGS_URL, () =>
    HttpResponse.json({ errorCode: 20011, message: '접근 권한이 없습니다.' }, { status: 403 }),
  )

describe('/audit-log', () => {
  beforeEach(() => {
    seedAdminAuditLogs([입점승인, 회원제재, 권한부여실패, 클레임개입], RECORDING_SINCE)
  })

  it('[AC-ADM-AUD-001] 목록은 서버 라벨을 그대로 그리고 시각을 초 단위로 보여준다', async () => {
    renderAt('/audit-log')

    expect(
      await screen.findByRole('button', { name: '10-26 20:31:08' }),
    ).toBeInTheDocument()
    const table = within(screen.getByRole('table'))
    // 라벨을 FE 표로 덮어쓰면 서버가 새 enum을 더한 날 빈 칸이 되거나 틀린 한글이 찍힌다.
    expect(table.getByText('셀러 입점 승인')).toBeInTheDocument()
    expect(table.getByText('입점 신청')).toBeInTheDocument()
    expect(table.getByText('보리펫샵')).toBeInTheDocument()
    expect(table.getByText('클레임 개입')).toBeInTheDocument()
    // 초·나노가 0인 행도 초가 잘리지 않는다(Jackson이 `...T09:41:55`를 `...T09:41`로 줄이는 자리).
    expect(table.getByRole('button', { name: '10-23 09:41:55' })).toBeInTheDocument()
    expect(screen.getByText('조건에 맞는 로그 4건')).toBeInTheDocument()
  })

  it('[AC-ADM-AUD-002] 목록 조회가 403이면 빈 표가 아니라 권한 문제를 드러낸다', async () => {
    server.use(forbidden())
    renderAt('/audit-log')

    expect(
      await screen.findByText(/어드민 권한이 없어 액션 로그를 볼 수 없어요/),
    ).toBeInTheDocument()
    // 감사 화면에서 '권한 없음'이 '기록 없음'으로 보이면 그 자체가 운영 사고다.
    expect(screen.getByText('목록을 불러오지 못했어요.')).toBeInTheDocument()
    expect(screen.queryByText(/이전은 기록 자체가 없어요/)).not.toBeInTheDocument()
  })

  it('[AC-ADM-AUD-003] 목록이 비어도 기록 시작 시각이 화면에 남는다', async () => {
    seedAdminAuditLogs([], RECORDING_SINCE)
    renderAt('/audit-log')

    // '로그가 없다'와 '그 전은 기록이 없다'는 전혀 다른 사실이다 — 둘을 한 문장에 담는다.
    expect(
      await screen.findByText(
        '조건에 맞는 로그가 없어요. 10-20 09:00:00 이전은 기록 자체가 없어요.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByText('10-20 09:00:00 이후 기록')).toBeInTheDocument()
  })

  it('[AC-ADM-AUD-003] 기록 시작 시각을 받지 못하면 `null 이후`를 찍지 않는다', async () => {
    seedAdminAuditLogs([], null)
    renderAt('/audit-log')

    expect(
      await screen.findByText(
        '조건에 맞는 로그가 없어요. 기록 시작 시각을 받지 못해 그 전 기간은 알 수 없어요.',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByText(/null/)).not.toBeInTheDocument()
    expect(screen.queryByText(/이후 기록$/)).not.toBeInTheDocument()
  })

  it('[AC-ADM-AUD-004] 대상 종류·액션·결과·검색어가 서버 쿼리로 나가고 옛 커서를 함께 보내지 않는다', async () => {
    const queries = recordListQueries()
    const user = userEvent.setup()
    renderAt('/audit-log')
    await screen.findByText('조건에 맞는 로그 4건')

    await user.selectOptions(
      screen.getAllByRole('combobox')[0]!,
      screen.getByRole('option', { name: '회원' }),
    )
    await screen.findByText('조건에 맞는 로그 1건')
    await user.selectOptions(
      screen.getAllByRole('combobox')[1]!,
      screen.getByRole('option', { name: '회원 이용 제한' }),
    )
    await screen.findByText('조건에 맞는 로그 1건')
    await user.selectOptions(
      screen.getAllByRole('combobox')[2]!,
      screen.getByRole('option', { name: '실패' }),
    )
    // 메모리 필터가 남아 있으면 첫 페이지 안에서만 걸러지고 건수가 서버 값과 어긋난다.
    await screen.findByText('조건에 맞는 로그 0건')

    expect(queries).toEqual([
      'none|none|none|none|none',
      'MEMBER|none|none|none|none',
      'MEMBER|MEMBER_SANCTIONED|none|none|none',
      'MEMBER|MEMBER_SANCTIONED|FAILURE|none|none',
    ])
  })

  it('[AC-ADM-AUD-004] 검색어는 서버 keyword로 나가고 빈 값은 키째 빠진다', async () => {
    const queries = recordListQueries()
    const user = userEvent.setup()
    renderAt('/audit-log')
    await screen.findByText('조건에 맞는 로그 4건')

    await user.type(screen.getByRole('searchbox'), '보리')
    await screen.findByText('조건에 맞는 로그 1건')
    await user.clear(screen.getByRole('searchbox'))
    await screen.findByText('조건에 맞는 로그 4건')

    expect(queries.at(-2)).toBe('none|none|none|보리|none')
    expect(queries.at(-1)).toBe('none|none|none|none|none')
  })

  it('[AC-ADM-AUD-005] 더 보기는 nextCursor로 다음 페이지를 이어 받는다', async () => {
    seedAdminAuditLogs(
      Array.from({ length: 21 }, (_, index) =>
        makeAdminAuditLogWire({
          id: `aud_6${String(index).padStart(4, '0')}`,
          // 분까지 같고 초만 다른 값들 — 같은 분 안의 순서가 감사 조사에서 필요한 정보다.
          actedAt: `2026-10-26T10:00:${String(index).padStart(2, '0')}`,
          targetLabel: `대상 ${index}`,
        }),
      ),
      RECORDING_SINCE,
    )
    const user = userEvent.setup()
    renderAt('/audit-log')

    // 최신순이라 첫 페이지는 초가 큰 쪽부터다 — 21번째(`대상 0`)는 둘째 페이지에만 있다.
    expect(await screen.findByText('대상 20')).toBeInTheDocument()
    expect(screen.queryByText('대상 0')).toBeNull()

    await user.click(screen.getByRole('button', { name: '더 보기' }))

    // `더 보기`가 없으면 21번째 이후의 기록은 화면에 존재하지 않는 것이 되고, 감사 로그에서 그것은
    // "그 일이 없었다"로 읽힌다.
    expect(await screen.findByText('대상 0')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '더 보기' })).toBeNull()
  })

  it('[AC-ADM-AUD-005] 필터를 바꾼 뒤 새 첫 페이지가 오기 전에는 더 보기가 열려 있지 않다', async () => {
    seedAdminAuditLogs(
      Array.from({ length: 21 }, (_, index) =>
        makeAdminAuditLogWire({
          id: `aud_6${String(index).padStart(4, '0')}`,
          actedAt: `2026-10-26T10:00:${String(index).padStart(2, '0')}`,
          targetLabel: `대상 ${index}`,
        }),
      ),
      RECORDING_SINCE,
    )
    // 새 조건의 첫 페이지 응답을 테스트가 붙잡는다 — 그 사이가 placeholder 구간이다.
    let release: () => void = () => {}
    const gate = new Promise<void>(resolve => {
      release = resolve
    })
    const user = userEvent.setup()
    renderAt('/audit-log')
    await screen.findByText('대상 20')
    expect(screen.getByRole('button', { name: '더 보기' })).toBeInTheDocument()

    server.use(
      http.get(ADMIN_AUDIT_LOGS_URL, async () => {
        await gate
        return HttpResponse.json({
          data: {
            items: [],
            totalCount: 0,
            nextCursor: null,
            hasNext: false,
            recordingSince: RECORDING_SINCE,
          },
        })
      }),
    )
    await user.selectOptions(
      screen.getAllByRole('combobox')[0]!,
      screen.getByRole('option', { name: '회원' }),
    )

    // 이전 조건의 행이 그대로 보이는 구간인데도 더 보기는 닫혀 있어야 한다 — 열어 두면 그 버튼이
    // 옛 커서를 요구하고, 바뀐 조건에 그 앵커를 끼우면 엉뚱한 자리에서 이어 읽은 목록이 나온다.
    expect(screen.getByText('대상 20')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '더 보기' })).toBeNull()

    release()
    expect(await screen.findByText('조건에 맞는 로그 0건')).toBeInTheDocument()
  })

  it('[AC-ADM-AUD-006] 대상 종류 필터 옵션이 서버 열거 9값을 전부 덮는다', async () => {
    renderAt('/audit-log')
    await screen.findByText('조건에 맞는 로그 4건')

    // 옵션에서 빠진 종류는 운영자에게 "그 종류는 감사되지 않는다"로 읽힌다. 서버가 열거를 늘렸을 때
    // 재생성만으로 타입 오류가 나도록 표를 `satisfies Record<AuditTargetType, string>`로 적어 뒀다.
    const select = screen.getAllByRole('combobox')[0]!
    expect(
      within(select)
        .getAllByRole('option')
        .map(option => option.textContent),
    ).toEqual([
      '대상 종류 전체',
      '입점 신청',
      '관리자',
      '회원',
      '상품',
      '클레임',
      '문의',
      '리뷰',
      '주문',
      '공지',
    ])
    // 액션 18값도 같은 이유로 전부 있어야 한다(센티넬 하나를 더해 19개).
    expect(within(screen.getAllByRole('combobox')[1]!).getAllByRole('option')).toHaveLength(19)
  })

  it('[AC-ADM-AUD-007] 대상 식별자는 종류를 앞세워 보여주고 링크로 만들지 않는다', async () => {
    const user = userEvent.setup()
    renderAt('/audit-log')

    // 이름이 남아 있지 않은 행은 빈 칸이 아니라 종류+식별자로 읽힌다.
    expect(await screen.findByText('내부 번호 19023')).toBeInTheDocument()
    expect(within(screen.getByRole('table')).queryByRole('button', { name: /19023/ })).toBeNull()

    await user.click(screen.getByRole('button', { name: '10-23 09:41:55' }))
    const open = await drawer()
    // 회원 내부 PK와 클레임 ULID가 같은 종류의 값처럼 읽히면 운영자가 엉뚱한 곳에 붙여 넣는다.
    expect(open.getByText('공개 식별자 01HZXC0000000000000000009')).toBeInTheDocument()
    expect(open.queryByRole('link')).toBeNull()
    expect(open.queryByRole('button', { name: /01HZXC/ })).toBeNull()
  })

  it('[AC-ADM-AUD-008] 실패 행은 사유 메모가 비어도 왜 실패했는지를 상세에서 읽을 수 있다', async () => {
    const user = userEvent.setup()
    renderAt('/audit-log')

    await user.click(await screen.findByRole('button', { name: '10-25 22:47:31' }))

    const open = await drawer()
    // 목 시절에는 산문 `detail`이 이 역할을 했고 서버에는 그 산문이 없다 — httpStatus가 유일하다.
    expect(open.getByText('HTTP 403 / 실패')).toBeInTheDocument()
    expect(open.getByText('입력된 사유 메모가 없어요.')).toBeInTheDocument()
    // IP가 기록되지 않은 행은 빈 칸이 아니라 기록 없음으로 읽힌다.
    expect(open.getByText('기록 없음')).toBeInTheDocument()
    // 서버 actorRole은 GENERAL|ADMIN 둘뿐이다 — 목 시절의 직무 문구는 서버에 없는 조직 체계다.
    expect(open.getByText('김운영 / 관리자')).toBeInTheDocument()
    expect(screen.queryByText('운영 매니저')).not.toBeInTheDocument()
  })

  /**
   * 어드민 액션 로그는 **읽기 전용**이다 — 감사 기록을 운영자가 고칠 수 있으면 기록의 의미가 없다.
   * (`admin-mock-screens.test.tsx`의 AC-ADMIN-MOCK-006에서 실연동과 함께 이사 왔다.)
   *
   * 이름 목록으로만 없음을 단언하면 두 군데서 샌다: 상세 Drawer를 열지 않으면 그 안에 붙은 쓰기
   * 버튼을 못 보고, 목록에 없는 이름(`승인`·`내보내기` 등)으로 붙이면 그대로 통과한다. 그래서
   * **목록과 상세 각각에서 허용 목록 밖의 버튼이 하나도 없는지**를 본다.
   */
  it('[AC-ADM-AUD-009] 읽기 전용이라 쓰기 버튼이 없고 나가는 요청이 목록 조회뿐이다', async () => {
    seedAdminAuditLogs(
      Array.from({ length: 21 }, (_, index) =>
        makeAdminAuditLogWire({
          id: `aud_6${String(index).padStart(4, '0')}`,
          actedAt: `2026-10-26T10:00:${String(index).padStart(2, '0')}`,
        }),
      ),
      RECORDING_SINCE,
    )
    const requests: string[] = []
    server.events.on('request:start', ({ request }) =>
      requests.push(`${request.method} ${new URL(request.url).pathname}`),
    )
    const user = userEvent.setup()
    renderAt('/audit-log')

    expect(await screen.findByRole('heading', { name: '어드민 액션 로그' })).toBeInTheDocument()
    await screen.findByRole('button', { name: '더 보기' })

    // nav를 빼고 화면 본문만 본다. 허용되는 버튼은 행을 여는 시각 링크와 `더 보기`뿐이고, 이름
    // 목록으로 금지하는 대신 **허용 목록 밖이 없는지**를 보므로 어떤 이름으로 붙여도 걸린다.
    const main = screen.getByRole('main')
    const listButtons = within(main).getAllByRole('button')
    for (const button of listButtons) {
      expect(button).toHaveAccessibleName(/^(\d{2}-\d{2} \d{2}:\d{2}:\d{2}|더 보기)$/)
    }

    await user.click(listButtons[0]!)

    const open = await drawer()
    // 상세에 허용되는 조작은 닫기 하나다.
    expect(
      open
        .getAllByRole('button')
        .map(button => button.getAttribute('aria-label') ?? button.textContent),
    ).toEqual(['닫기'])

    // 읽기 전용 화면은 셸 배지 조회와 목록 조회 말고는 아무 요청도 만들지 않는다(둘이 나가는
    // 순서는 계약이 아니라 마운트 타이밍이라 정렬해 비교한다).
    expect([...new Set(requests)].sort()).toEqual(
      [
        `GET ${new URL(ADMIN_APPLICATIONS_URL).pathname}`,
        `GET ${new URL(ADMIN_AUDIT_LOGS_URL).pathname}`,
      ].sort(),
    )
  })
})
