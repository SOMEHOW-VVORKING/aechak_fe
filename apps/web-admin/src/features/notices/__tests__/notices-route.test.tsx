import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter, createMemoryHistory } from '@tanstack/react-router'
import { HttpResponse, http } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { routeTree } from '../../../routeTree.gen'
import {
  ADMIN_NOTICES_URL,
  ADMIN_NOTICE_DETAIL_URL,
  ADMIN_NOTICE_PUBLISH_URL,
  currentAdminNotice,
  makeAdminNoticeWire,
  seedAdminApplications,
  seedAdminNotices,
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

const 점검초안 = makeAdminNoticeWire({
  noticeId: '01HZXN0000000000000000312',
  title: '10월 28일 새벽 결제 시스템 점검 안내',
  content: '10월 28일 02:00부터 04:00까지 결제 시스템 점검이 있어요.',
  category: 'MAINTENANCE',
  audience: 'ALL',
  status: 'DRAFT',
  pinned: true,
  publishedAt: null,
  internalMemo: 'PG사 점검 일정과 맞춰 둠.',
  createdAt: '2026-10-27T18:00:00',
  updatedAt: '2026-10-27T18:00:00',
})

const 정책공지 = makeAdminNoticeWire({
  noticeId: '01HZXN0000000000000000308',
  title: '구매 확정 자동 처리 기준이 바뀌어요',
  content: '배송 완료 후 7일이 지나면 구매가 자동 확정돼요.',
  category: 'POLICY',
  audience: 'ALL',
  status: 'PUBLISHED',
  pinned: false,
  publishedAt: '2026-10-24T10:00:00',
  internalMemo: null,
  createdAt: '2026-10-24T09:30:00',
  updatedAt: '2026-10-24T10:00:00',
})

/**
 * 목 시절 화면이 그릴 수 없던 행 — 상태 `UNPUBLISHED`와 분류 `SETTLEMENT`를 한 행에 담았다.
 *
 * 둘 다 옛 메타 Record에 없던 값이고, 값이 빠지면 `StatusMetaPill`의 구조분해가 TypeError를 내
 * **목록 전체가 사라진다**(정산 공지 한 건이 화면을 날린다).
 */
const 정산내림 = makeAdminNoticeWire({
  noticeId: '01HZXN0000000000000000295',
  title: '셀러 정산 주기 변경 안내',
  content: '정산은 매주 수요일에서 매주 화요일로 바뀌어요.',
  category: 'SETTLEMENT',
  audience: 'SELLER',
  status: 'UNPUBLISHED',
  pinned: false,
  publishedAt: '2026-10-15T14:00:00',
  internalMemo: '재공지 전 법무 확인 대기.',
  createdAt: '2026-10-15T13:00:00',
  updatedAt: '2026-10-16T09:00:00',
})

const 이벤트공지 = makeAdminNoticeWire({
  noticeId: '01HZXN0000000000000000301',
  title: '첫 구매 적립금 3,000원 이벤트',
  content: '애착에서 처음 주문하면 적립금 3,000원을 드려요.',
  category: 'EVENT',
  audience: 'BUYER',
  status: 'PUBLISHED',
  pinned: false,
  publishedAt: '2026-10-20T09:00:00',
  internalMemo: null,
  createdAt: '2026-10-20T08:00:00',
  updatedAt: '2026-10-20T09:00:00',
})

const table = () => within(screen.getByRole('table'))
const bodyRowCount = () => table().getAllByRole('row').length - 1
const drawer = async (name: '공지 상세' | '새 공지') =>
  within(await screen.findByRole('dialog', { name }))

/** DetailField는 `<label for>`가 아니라 `<span>`으로 이름을 주므로 DOM 순서로 집는다. */
function formFields(scope: ReturnType<typeof within>) {
  const boxes = scope.getAllByRole('textbox')
  return { title: boxes[0]!, content: boxes[1]!, memo: boxes[2]! }
}

/**
 * FilterBar와 드로어의 `<select>`는 접근성 이름이 없다(앞의 FilterSelect/DetailField가 맥락을 준다)
 * — 그 안에 있는 옵션 이름으로 집는다. 못 찾으면 던져서 `!`로 눌러 두지 않는다.
 */
function selectWithOption(optionName: string): HTMLElement {
  const found = screen
    .getAllByRole('combobox')
    .find(element => within(element).queryByRole('option', { name: optionName }))
  if (!found) throw new Error(`"${optionName}" 옵션을 가진 select를 찾지 못했다`)
  return found
}

const chooseOption = (select: HTMLElement, optionName: string) =>
  userEvent.setup().selectOptions(select, within(select).getByRole('option', { name: optionName }))

/** 목록 조회로 나간 쿼리 — 필터가 **서버로** 나가는지는 이것으로만 말할 수 있다. */
function recordListQueries(): string[] {
  const queries: string[] = []
  server.events.on('request:start', ({ request }) => {
    const url = new URL(request.url)
    if (request.method !== 'GET' || !url.pathname.endsWith('/admin/notices')) return
    queries.push(
      [
        url.searchParams.get('status') ?? 'none',
        url.searchParams.get('audience') ?? 'none',
        url.searchParams.get('keyword') ?? 'none',
        url.searchParams.get('cursor') == null ? 'none' : 'cursor',
      ].join('|'),
    )
  })
  return queries
}

/** 공지 경로로 나간 요청 — 메서드와 경로만 남겨 순서를 단언한다. */
function recordNoticeRequests(): string[] {
  const entries: string[] = []
  server.events.on('request:start', ({ request }) => {
    const url = new URL(request.url)
    if (!url.pathname.includes('/admin/notices')) return
    entries.push(`${request.method} ${url.pathname.replace('/api/v1', '')}`)
  })
  return entries
}

const writesOnly = (entries: readonly string[]) =>
  entries.filter(entry => !entry.startsWith('GET '))

describe('/notices', () => {
  beforeEach(() => {
    // 셸이 nav 배지를 채우려 심사 대기 수를 조회한다 — 핸들러가 없으면 MSW가 테스트를 깨뜨린다.
    seedAdminApplications()
    seedAdminNotices([점검초안, 정책공지, 이벤트공지, 정산내림])
  })

  it('[AC-ADMIN-NOTICE-001] 상태와 검색어가 서버 쿼리로 나가고 미선택 축은 키째 빠진다', async () => {
    const queries = recordListQueries()
    const user = userEvent.setup()
    renderAt('/notices')
    expect(await screen.findByText(점검초안.title)).toBeInTheDocument()

    // 메모리 필터가 남아 있으면 불러온 쪽 안에서만 걸러지고 운영자는 걸러진 전체를 봤다고 읽는다.
    await chooseOption(selectWithOption('게시 상태 전체'), '게시 중')
    await waitFor(() => expect(bodyRowCount()).toBe(2))

    await user.type(screen.getByRole('searchbox'), '  적립금  ')
    await waitFor(() => expect(bodyRowCount()).toBe(1))
    expect(screen.getByText(이벤트공지.title)).toBeInTheDocument()

    // 미선택 축은 아예 보내지 않는다 — 빈 값을 보내면 서버가 형식 오류로 거절하는 자리가 있다.
    expect(queries[0]).toBe('none|none|none|none')
    expect(queries.at(-1)).toBe('PUBLISHED|none|적립금|none')
  })

  /**
   * 대상 축은 `'all'`이 **실제 값**인 유일한 축이다.
   *
   * 다른 어드민 화면의 `'all'` 센티넬 관례를 그대로 쓰면 "전체 대상"을 골라도 미선택으로 읽혀
   * `audience`가 서버로 나가지 않고, 운영자는 전체 목록을 보면서 걸러진 것으로 읽는다
   * (2026-10-27 실측). 예시 화면 시절의 AC-ADMIN-MOCK-007을 이 단언이 대체한다.
   */
  it('[AC-ADMIN-NOTICE-001] 전체 대상을 고르면 audience=ALL이 실제로 실린다', async () => {
    const queries = recordListQueries()
    renderAt('/notices')
    expect(await screen.findByText(점검초안.title)).toBeInTheDocument()
    expect(bodyRowCount()).toBe(4)

    await chooseOption(selectWithOption('대상 전체'), '전체 대상')
    // '전체 대상'(전체 회원에게 가는 공지)과 '대상 전체'(필터 미선택)는 다른 것이다.
    await waitFor(() => expect(bodyRowCount()).toBe(2))
    expect(queries.at(-1)).toBe('none|ALL|none|none')

    await chooseOption(selectWithOption('대상 전체'), '셀러 대상')
    await waitFor(() => expect(bodyRowCount()).toBe(1))
    expect(screen.getByText(정산내림.title)).toBeInTheDocument()
    expect(queries.at(-1)).toBe('none|SELLER|none|none')

    await chooseOption(selectWithOption('대상 전체'), '대상 전체')
    await waitFor(() => expect(bodyRowCount()).toBe(4))
    expect(queries.at(-1)).toBe('none|none|none|none')
  })

  /**
   * 목록 summary에는 `content`·`internalMemo`가 없다.
   *
   * 행 값으로 편집 폼을 열면 본문이 빈 폼이 뜨고, 그대로 저장하면 **빈 내용으로 PUT**이 나가 공지
   * 본문이 지워지거나 400이다. 그래서 상세가 도착하기 전에는 폼도 저장 버튼도 없어야 한다.
   */
  it('[AC-ADMIN-NOTICE-002] 드로어는 상세를 따로 조회하고, 도착 전에는 저장·게시가 없다', async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>(resolve => {
      release = resolve
    })
    server.use(
      http.get(ADMIN_NOTICE_DETAIL_URL, async () => {
        await gate
        return HttpResponse.json({ data: { ...점검초안 } })
      }),
    )
    const requests = recordNoticeRequests()
    const user = userEvent.setup()
    renderAt('/notices')

    await user.click(await screen.findByRole('button', { name: 점검초안.title }))

    const panel = await drawer('공지 상세')
    expect(panel.getByText('공지 내용을 불러오고 있어요.')).toBeInTheDocument()
    expect(panel.queryByRole('button', { name: '저장' })).toBeNull()
    expect(panel.queryByRole('button', { name: '게시하기' })).toBeNull()

    release()

    // 본문·메모는 목록이 주지 않는 값이라, 보인다는 것 자체가 상세를 따로 받았다는 증거다.
    expect(await panel.findByDisplayValue(점검초안.content)).toBeInTheDocument()
    expect(panel.getByDisplayValue(점검초안.internalMemo!)).toBeInTheDocument()
    expect(requests).toContain(`GET /admin/notices/${점검초안.noticeId}`)
  })

  it('[AC-ADMIN-NOTICE-003] 저장은 PUT 한 건이고 상태를 바꾸지 않는다', async () => {
    const requests = recordNoticeRequests()
    const user = userEvent.setup()
    renderAt('/notices')

    await user.click(await screen.findByRole('button', { name: 점검초안.title }))
    const panel = await drawer('공지 상세')
    const fields = formFields(panel)
    await user.clear(fields.title)
    await user.type(fields.title, '점검 시간이 바뀌었어요')
    await user.click(panel.getByRole('button', { name: '저장' }))

    expect(await screen.findByText('공지 내용을 저장했어요.')).toBeInTheDocument()
    expect(writesOnly(requests)).toEqual([`PUT /admin/notices/${점검초안.noticeId}`])
    const saved = currentAdminNotice(점검초안.noticeId)
    expect(saved?.title).toBe('점검 시간이 바뀌었어요')
    // PUT은 상태를 건드리지 않는다 — "고치기만 하고 게시는 미루기"가 가능해야 한다.
    expect(saved?.status).toBe('DRAFT')
    expect(saved?.publishedAt).toBeNull()
  })

  it('[AC-ADMIN-NOTICE-003] 게시는 PUT → publish 순서로 두 번 나간다', async () => {
    const requests = recordNoticeRequests()
    const user = userEvent.setup()
    renderAt('/notices')

    await user.click(await screen.findByRole('button', { name: 점검초안.title }))
    const panel = await drawer('공지 상세')
    await user.click(panel.getByRole('button', { name: '게시하기' }))
    const confirm = await screen.findByRole('dialog', { name: '공지를 게시할까요?' })
    await user.click(within(confirm).getByRole('button', { name: '게시하기' }))

    expect(await screen.findByText('공지를 저장하고 게시했어요.')).toBeInTheDocument()
    // 전이만 보내면 화면에 보이던 편집 내용이 조용히 버려진 채로 공지가 게시된다.
    expect(writesOnly(requests)).toEqual([
      `PUT /admin/notices/${점검초안.noticeId}`,
      `POST /admin/notices/${점검초안.noticeId}/publish`,
    ])
    expect(currentAdminNotice(점검초안.noticeId)?.status).toBe('PUBLISHED')
  })

  /**
   * PUT은 들어갔고 publish가 실패한 구간.
   *
   * 토스트가 하나뿐이면 운영자는 저장도 안 됐다고 읽고 같은 내용을 다시 쓴다 — 어느 쪽이 들어갔는지를
   * 한 문장으로 말해야 한다.
   */
  it('[AC-ADMIN-NOTICE-003] PUT 성공 뒤 게시가 실패하면 저장은 됐다고 알린다', async () => {
    server.use(
      http.post(ADMIN_NOTICE_PUBLISH_URL, () =>
        HttpResponse.json({ errorCode: 90000, message: '서버 오류입니다.' }, { status: 500 }),
      ),
    )
    const user = userEvent.setup()
    renderAt('/notices')

    await user.click(await screen.findByRole('button', { name: 점검초안.title }))
    const panel = await drawer('공지 상세')
    const fields = formFields(panel)
    await user.clear(fields.content)
    await user.type(fields.content, '점검이 한 시간 늦춰졌어요.')
    await user.click(panel.getByRole('button', { name: '게시하기' }))
    const confirm = await screen.findByRole('dialog', { name: '공지를 게시할까요?' })
    await user.click(within(confirm).getByRole('button', { name: '게시하기' }))

    expect(
      await screen.findByText(/내용은 저장됐고 게시는 안 됐어요\./),
    ).toBeInTheDocument()
    expect(currentAdminNotice(점검초안.noticeId)?.content).toBe('점검이 한 시간 늦춰졌어요.')
    expect(currentAdminNotice(점검초안.noticeId)?.status).toBe('DRAFT')
  })

  it('[AC-ADMIN-NOTICE-004] 게시 중 행에는 게시하기가 없고 내리기가 있다', async () => {
    const user = userEvent.setup()
    renderAt('/notices')

    await user.click(await screen.findByRole('button', { name: 정책공지.title }))
    const panel = await drawer('공지 상세')
    await panel.findByDisplayValue(정책공지.content)

    // 재게시는 409(150006)라 버튼을 남기면 운영자가 못 쓰는 버튼을 누른다.
    expect(panel.queryByRole('button', { name: '게시하기' })).toBeNull()
    expect(panel.getByRole('button', { name: '내리기' })).toBeInTheDocument()
  })

  it('[AC-ADMIN-NOTICE-004] 내림 행에는 게시하기가 돌아온다', async () => {
    const user = userEvent.setup()
    renderAt('/notices')

    await user.click(await screen.findByRole('button', { name: 정산내림.title }))
    const panel = await drawer('공지 상세')
    await panel.findByDisplayValue(정산내림.content)

    expect(panel.getByRole('button', { name: '게시하기' })).toBeInTheDocument()
    expect(panel.queryByRole('button', { name: '내리기' })).toBeNull()
  })

  it('[AC-ADMIN-NOTICE-004] 내리기는 unpublish를 보내고 게시 시각을 지우지 않는다', async () => {
    const requests = recordNoticeRequests()
    const user = userEvent.setup()
    renderAt('/notices')

    await user.click(await screen.findByRole('button', { name: 정책공지.title }))
    const panel = await drawer('공지 상세')
    await panel.findByDisplayValue(정책공지.content)
    await user.click(panel.getByRole('button', { name: '내리기' }))
    const confirm = await screen.findByRole('dialog', { name: '공지를 내릴까요?' })
    await user.click(within(confirm).getByRole('button', { name: '내리기' }))

    expect(await screen.findByText('공지를 저장하고 내렸어요.')).toBeInTheDocument()
    expect(writesOnly(requests)).toEqual([
      `PUT /admin/notices/${정책공지.noticeId}`,
      `POST /admin/notices/${정책공지.noticeId}/unpublish`,
    ])
    const after = currentAdminNotice(정책공지.noticeId)
    expect(after?.status).toBe('UNPUBLISHED')
    // 언제 노출됐는지는 사실로 남는다 — 서버가 publishedAt을 지우지 않는다.
    expect(after?.publishedAt).toBe(정책공지.publishedAt)
  })

  /**
   * 409 둘은 **운영자가 할 일이 다르다**.
   *
   * 150006(이미 게시됨)은 화면이 낡았다는 뜻이고 150007(게시 중이 아님)은 내릴 대상이 아니라는
   * 뜻이다. 한 문구로 묶으면 둘 다 "게시하지 못했어요"가 되어 왜 막혔는지 알 수 없다.
   * 두 경우 모두 다른 운영자가 먼저 손댄 상태를 화면이 모르는 구간이라, 실패 뒤에 목록을 다시 받는다.
   */
  it('[AC-ADMIN-NOTICE-005] 이미 게시된 공지에 게시를 보내면 150006 문구가 뜨고 목록을 다시 받는다', async () => {
    const user = userEvent.setup()
    renderAt('/notices')

    await user.click(await screen.findByRole('button', { name: 점검초안.title }))
    const panel = await drawer('공지 상세')
    await panel.findByDisplayValue(점검초안.content)

    // 다른 운영자가 먼저 게시한 상태 — 화면은 아직 초안으로 알고 있다.
    seedAdminNotices([{ ...점검초안, status: 'PUBLISHED', publishedAt: '2026-11-02T10:00:00' }])
    const requests = recordNoticeRequests()
    await user.click(panel.getByRole('button', { name: '게시하기' }))
    const confirm = await screen.findByRole('dialog', { name: '공지를 게시할까요?' })
    await user.click(within(confirm).getByRole('button', { name: '게시하기' }))

    expect(
      await screen.findByText(
        '내용은 저장됐고 게시는 안 됐어요. 이미 게시된 공지예요. 목록을 다시 불러왔어요.',
      ),
    ).toBeInTheDocument()
    // 실패해도 무효화한다 — 두 409는 "화면이 낡았다"는 신호라 그 자리에서 다시 받아야 한다.
    // 저장 쪽 무효화에 기대지 않으려고 **publish 요청 이후**에 목록 조회가 또 나갔는지를 본다.
    await waitFor(() => {
      const publishedAt = requests.findIndex(entry => entry.endsWith('/publish'))
      expect(requests.slice(publishedAt + 1)).toContain('GET /admin/notices')
    })
  })

  it('[AC-ADMIN-NOTICE-005] 게시 중이 아닌 공지에 내림을 보내면 150007 문구가 뜬다', async () => {
    const user = userEvent.setup()
    renderAt('/notices')

    await user.click(await screen.findByRole('button', { name: 정책공지.title }))
    const panel = await drawer('공지 상세')
    await panel.findByDisplayValue(정책공지.content)

    // 다른 운영자가 먼저 내린 상태.
    seedAdminNotices([{ ...정책공지, status: 'UNPUBLISHED' }])
    await user.click(panel.getByRole('button', { name: '내리기' }))
    const confirm = await screen.findByRole('dialog', { name: '공지를 내릴까요?' })
    await user.click(within(confirm).getByRole('button', { name: '내리기' }))

    expect(
      await screen.findByText(
        '내용은 저장됐고 내림은 안 됐어요. 게시 중이 아니어서 내릴 수 없어요. 목록을 다시 불러왔어요.',
      ),
    ).toBeInTheDocument()
  })

  /**
   * 서버 열거를 전부 덮지 않으면 **한 행이 목록 전체를 날린다.**
   *
   * `StatusMetaPill`이 `{ meta: { label, variant, icon } }`로 구조분해하므로 메타 Record에서 값이
   * 빠지면 그 셀의 render가 TypeError를 던지고 표가 통째로 사라진다. 목 시절 어휘에는
   * `UNPUBLISHED`도 `SETTLEMENT`도 없었다.
   */
  it('[AC-ADMIN-NOTICE-006] 게시 중단·정산 행이 섞여 와도 표가 그려진다', async () => {
    renderAt('/notices')

    expect(await screen.findByText(정산내림.title)).toBeInTheDocument()
    expect(bodyRowCount()).toBe(4)
    expect(table().getByText('게시 중단')).toBeInTheDocument()
    expect(table().getByText('정산')).toBeInTheDocument()
    // 서버에 없는 상태를 고를 수 있게 두면 영구히 0건인 필터가 된다(예약 게시·종료는 서버에 없다).
    const statusSelect = selectWithOption('게시 상태 전체')
    expect(within(statusSelect).getAllByRole('option')).toHaveLength(4)
    expect(within(statusSelect).queryByRole('option', { name: '게시 예약' })).toBeNull()
    expect(within(statusSelect).queryByRole('option', { name: '종료' })).toBeNull()
  })

  it('[AC-ADMIN-NOTICE-006] 초안 행은 게시 시각 대신 등록 시각을 말한다', async () => {
    renderAt('/notices')

    expect(await screen.findByText(점검초안.title)).toBeInTheDocument()
    // 서버 정렬이 createdAt 내림차순 고정이라, 게시 시각만 그리면 초안 행이 빈 칸이 되고 눈에 보이는
    // 순서와 그리는 값이 서로 다른 축이 된다.
    expect(table().getByText('10-27 18:00')).toBeInTheDocument()
    expect(table().getAllByText('등록')).toHaveLength(1)
    expect(table().getByText('10-24 10:00')).toBeInTheDocument()
  })

  /**
   * 서버는 알림을 보내지 않는다(발송 어댑터가 플랫폼에 없다).
   *
   * 목 시절 화면에는 발송 토글·'푸시 포함' 부제·'푸시 도달' 컬럼·'푸시 발송' pill·'푸시는 한 번
   * 나가면 회수할 수 없어요' Modal이 있었다. 그 문구가 실데이터 위에 남으면 운영자는 공지가 알림으로
   * 도착한 줄 알고 다른 고지 수단을 쓰지 않는다 — 문구 되돌림을 잡는 유일한 방패다.
   */
  it('[AC-ADMIN-NOTICE-007] 목록과 드로어 어디에도 푸시·도달 글자가 없다', async () => {
    const user = userEvent.setup()
    renderAt('/notices')

    await user.click(await screen.findByRole('button', { name: 점검초안.title }))
    const panel = await drawer('공지 상세')
    await panel.findByDisplayValue(점검초안.content)
    await user.click(panel.getByRole('button', { name: '게시하기' }))
    await screen.findByRole('dialog', { name: '공지를 게시할까요?' })

    expect(document.body).not.toHaveTextContent('푸시')
    expect(document.body).not.toHaveTextContent('도달')
    expect(document.body).not.toHaveTextContent('회수')
    // 예시 데이터 띠도 걷혔다 — 실데이터 위에 남으면 거꾸로 운영자를 속인다.
    expect(screen.queryByText('예시 데이터예요')).toBeNull()
  })

  it('[AC-ADMIN-NOTICE-008] 더 보기가 nextCursor로 다음 쪽을 붙이고, 필터를 바꾸면 옛 커서를 보내지 않는다', async () => {
    seedAdminNotices(
      Array.from({ length: 21 }, (_, index) =>
        makeAdminNoticeWire({
          noticeId: `01HZXN60000000000000000${String(index).padStart(2, '0')}`,
          title: `공지 ${index}`,
          status: 'DRAFT',
          publishedAt: null,
          createdAt: `2026-10-${String(index + 1).padStart(2, '0')}T09:00:00`,
        }),
      ),
    )
    const queries = recordListQueries()
    const user = userEvent.setup()
    renderAt('/notices')

    // createdAt 내림차순이라 첫 쪽은 늦은 날짜부터다 — 21번째(`공지 0`)는 둘째 쪽에만 있다.
    expect(await screen.findByText('공지 20')).toBeInTheDocument()
    expect(screen.queryByText('공지 0')).toBeNull()

    await user.click(screen.getByRole('button', { name: '더 보기' }))

    expect(await screen.findByText('공지 0')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '더 보기' })).toBeNull()
    expect(queries.at(-1)).toBe('none|none|none|cursor')

    await chooseOption(selectWithOption('게시 상태 전체'), '게시 중')

    // 서버 커서에 필터 조건이 실리지 않아 **서버가 끊어 주지 않는다** — 옛 앵커에서 이어 읽은 섞인
    // 목록이 그대로 그려지므로, 커서 사슬을 새로 시작하는 FE가 유일한 방어선이다.
    await waitFor(() => expect(queries.at(-1)).toBe('PUBLISHED|none|none|none'))
  })

  /**
   * 초안 생성 입구.
   *
   * 분류는 생성·수정 둘 다의 필수 필드(@NotNull)인데 목 시절 화면에는 입력이 아예 없었다 — 그래서
   * 초안을 만들 수도, 분류를 바꿀 수도 없었다. 고르기 전에는 저장이 잠겨 400을 서버까지 보내지 않는다.
   */
  it('[AC-ADMIN-NOTICE-009] 새 공지는 분류를 고른 뒤에야 저장되고 초안으로 만들어진다', async () => {
    const requests = recordNoticeRequests()
    const user = userEvent.setup()
    renderAt('/notices')
    await screen.findByText(점검초안.title)

    await user.click(screen.getByRole('button', { name: '새 공지' }))
    const panel = await drawer('새 공지')
    const fields = formFields(panel)
    await user.type(fields.title, '11월 정기 점검 안내')
    await user.type(fields.content, '11월 5일 02:00부터 03:00까지 점검이 있어요.')

    // 분류를 고르기 전에는 잠겨 있다 — 서버 필수 필드라 보내도 400이다.
    expect(panel.getByRole('button', { name: '저장' })).toBeDisabled()
    // 생성 모드에는 게시 버튼이 없다(없는 공지를 게시할 수 없다).
    expect(panel.queryByRole('button', { name: '게시하기' })).toBeNull()

    await chooseOption(selectWithOption('정산'), '점검')
    await user.click(panel.getByRole('button', { name: '저장' }))

    expect(await screen.findByText('공지 초안을 만들었어요.')).toBeInTheDocument()
    expect(writesOnly(requests)).toEqual(['POST /admin/notices'])
    expect(await screen.findByText('11월 정기 점검 안내')).toBeInTheDocument()
  })

  it('[AC-ADMIN-NOTICE-009] 목록 조회가 403이면 빈 표가 아니라 권한 문제를 드러낸다', async () => {
    server.use(
      http.get(ADMIN_NOTICES_URL, () =>
        HttpResponse.json({ errorCode: 20011, message: '접근 권한이 없습니다.' }, { status: 403 }),
      ),
    )
    renderAt('/notices')

    expect(
      await screen.findByText(/어드민 권한이 없어 공지를 볼 수 없어요/),
    ).toBeInTheDocument()
    // "공지 없음"과 "못 불러옴"이 구분되지 않으면 운영자는 공지가 지워진 줄 안다.
    expect(screen.getByText('목록을 불러오지 못했어요.')).toBeInTheDocument()
  })
})
