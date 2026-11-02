import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter, createMemoryHistory } from '@tanstack/react-router'
import { HttpResponse, http } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { routeTree } from '../../../routeTree.gen'
import {
  ADMIN_INQUIRIES_URL,
  ADMIN_INQUIRY_ANSWER_URL,
  ADMIN_INQUIRY_DETAIL_URL,
  currentAdminInquiry,
  makeAdminInquiryWire,
  seedAdminInquiries,
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

const 접수문의 = makeAdminInquiryWire({
  inquiryId: 8812,
  content: '카드 승인 문자는 받았는데 주문 목록에 아무것도 없어요.',
  replyEmail: 'coco@example.com',
  receivedAt: '2026-10-26T22:14:00',
  status: 'RECEIVED',
  author: { userId: 1001, nickname: '코코맘', withdrawn: false },
})

const 확인중문의 = makeAdminInquiryWire({
  inquiryId: 8806,
  inquiryType: 'DELIVERY_CLAIM',
  content: '송장번호가 조회되지 않아요.',
  replyEmail: 'dust@example.com',
  receivedAt: '2026-10-26T15:02:00',
  status: 'IN_PROGRESS',
  assignedAdminId: 1,
  author: { userId: 1002, nickname: '먼지아빠', withdrawn: false },
})

const 완료문의 = makeAdminInquiryWire({
  inquiryId: 8771,
  inquiryType: 'ACCOUNT',
  content: '카카오 로그인이 안 돼요.',
  replyEmail: 'laika@example.com',
  receivedAt: '2026-10-24T11:20:00',
  status: 'DONE',
  answer: '카카오 계정 연결을 초기화했어요.',
  answeredByAdminId: 1,
  assignedAdminId: 1,
  resolvedAt: '2026-10-24T13:00:00',
  author: { userId: 1003, nickname: '라이카맘', withdrawn: false },
})

/** 화면이 `Date.now()`로 경과를 세므로 시계를 고정한다(접수 24시간 경계가 지연 표시를 가른다). */
const FIXED_NOW = new Date('2026-10-27T09:00:00').getTime()

const drawer = async () => within(await screen.findByRole('dialog', { name: '문의 상세' }))

/** 결정 라디오는 자체 <label>이라 라벨 글자를 누른다(DS Radio의 input은 sr-only다). */
async function choose(label: string) {
  const open = await drawer()
  await userEvent.setup().click(open.getByText(label))
}

function countRequests(method: string, pathSuffix: string): string[] {
  const seen: string[] = []
  server.events.on('request:start', ({ request }) => {
    const url = new URL(request.url)
    if (request.method === method && url.pathname.endsWith(pathSuffix)) seen.push(url.pathname)
  })
  return seen
}

describe('/inquiries', () => {
  beforeEach(() => {
    vi.spyOn(Date, 'now').mockReturnValue(FIXED_NOW)
    seedAdminInquiries([접수문의, 확인중문의, 완료문의])
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('[AC-ADM-INQ-001] 목록은 실서버 문의의 내용 앞머리·유형·경과·상태를 보여준다', async () => {
    renderAt('/inquiries')

    expect(
      await screen.findByRole('button', { name: /카드 승인 문자는 받았는데/ }),
    ).toBeInTheDocument()
    // 필터 <option>에 같은 글자가 있어 전역에서 찾으면 목록이 비어도 통과한다 — 표 안으로 좁힌다.
    const table = within(screen.getByRole('table'))
    expect(table.getByText('코코맘')).toBeInTheDocument()
    expect(table.getByText('답변 대기')).toBeInTheDocument()
    expect(table.getByText('배송/클레임')).toBeInTheDocument()
    // 접수 2026-10-26 22:14 → 고정 시각 10-27 09:00까지 10시간 46분이라 10시간이다.
    expect(table.getByText('10시간')).toBeInTheDocument()
    expect(screen.getByText('조건에 맞는 문의 3건')).toBeInTheDocument()
  })

  it('[AC-ADM-INQ-002] 접수 24시간이 지난 미답변 문의만 지연으로 센다', async () => {
    seedAdminInquiries([
      // 25시간 지난 미답변 — 지연이다.
      makeAdminInquiryWire({ inquiryId: 8700, content: '묵은 문의', receivedAt: '2026-10-26T08:00:00' }),
      // 69시간 지났지만 답변이 나갔다 — 지연이 아니다(운영자가 할 일이 없다).
      makeAdminInquiryWire({
        inquiryId: 8701,
        content: '오래전 완료 문의',
        receivedAt: '2026-10-24T11:20:00',
        status: 'DONE',
        answer: '처리했어요',
      }),
      // 11시간 지난 미답변 — 아직 지연이 아니다.
      makeAdminInquiryWire({ inquiryId: 8702, content: '최근 문의', receivedAt: '2026-10-26T22:14:00' }),
    ])
    renderAt('/inquiries')

    // 행이 도착한 뒤에 센다 — 표만 기다리면 로딩 상태의 빈 표로도 통과한다.
    expect(await screen.findByRole('button', { name: '묵은 문의' })).toBeInTheDocument()
    expect(screen.getByText(/24시간 초과/)).toHaveTextContent('24시간 초과 1건')
  })

  it('[AC-ADM-INQ-003] 목록 조회가 403이면 빈 상태가 아니라 권한 문제를 드러낸다', async () => {
    server.use(
      http.get(ADMIN_INQUIRIES_URL, () =>
        HttpResponse.json({ errorCode: 20011, message: '접근 권한이 없습니다.' }, { status: 403 }),
      ),
    )
    renderAt('/inquiries')

    expect(
      await screen.findByText(/어드민 권한이 없어 문의 목록을 볼 수 없어요/),
    ).toBeInTheDocument()
    expect(screen.queryByText('조건에 맞는 문의가 없어요.')).not.toBeInTheDocument()
  })

  it('[AC-ADM-INQ-004] 조회가 403으로 끊긴 뒤에는 낡은 행의 처리 버튼이 잠긴다', async () => {
    const user = userEvent.setup()
    const { queryClient } = renderAt('/inquiries')
    await user.click(await screen.findByRole('button', { name: /카드 승인 문자는 받았는데/ }))
    let open = await drawer()
    await user.type(open.getByPlaceholderText('문의자에게 전달할 답변을 입력하세요.'), '확인했어요')
    open = await drawer()
    expect(open.getByRole('button', { name: '제출' })).toBeEnabled()

    // 권한이 끊긴 뒤 재조회가 실패한다 — react-query는 직전 행을 그대로 들고 있다.
    server.use(
      http.get(ADMIN_INQUIRIES_URL, () =>
        HttpResponse.json({ errorCode: 20011, message: '접근 권한이 없습니다.' }, { status: 403 }),
      ),
    )
    await act(async () => {
      await queryClient.refetchQueries({ queryKey: ['admin-inquiries', 'list'] })
    })

    // 행은 남지만(마지막으로 본 내용은 정보다) 그 행으로 하는 처리는 막는다.
    expect(screen.getByRole('button', { name: /카드 승인 문자는 받았는데/ })).toBeInTheDocument()
    open = await drawer()
    expect(open.getByRole('button', { name: '제출' })).toBeDisabled()
  })

  it('[AC-ADM-INQ-005] 상세는 전문·답변 수신 이메일과 같은 작성자의 이전 문의를 보여준다', async () => {
    seedAdminInquiries([
      접수문의,
      makeAdminInquiryWire({
        inquiryId: 8700,
        inquiryType: 'DELIVERY_CLAIM',
        status: 'DONE',
        content: '배송이 지연돼요.',
        receivedAt: '2026-09-30T10:00:00',
        author: { userId: 1001, nickname: '코코맘', withdrawn: false },
      }),
    ])
    const user = userEvent.setup()
    renderAt('/inquiries')

    await user.click(await screen.findByRole('button', { name: /카드 승인 문자는 받았는데/ }))

    const open = await drawer()
    expect(open.getByText('coco@example.com')).toBeInTheDocument()
    expect(open.getByText('이전 문의 / 1건')).toBeInTheDocument()
    const history = within(open.getByRole('list'))
    expect(history.getByText('배송/클레임 / 답변 완료')).toBeInTheDocument()
    expect(history.getByText('2026-09-30')).toBeInTheDocument()
  })

  it('[AC-ADM-INQ-006] 답변을 등록하면 서버 문의가 완료로 바뀌고 답변이 남는다', async () => {
    const user = userEvent.setup()
    renderAt('/inquiries')
    await user.click(await screen.findByRole('button', { name: /카드 승인 문자는 받았는데/ }))

    const open = await drawer()
    await user.type(
      open.getByPlaceholderText('문의자에게 전달할 답변을 입력하세요.'),
      '결제는 정상 승인됐고 주문은 복구했어요.',
    )
    await user.click(open.getByRole('button', { name: '제출' }))
    const confirm = within(await screen.findByRole('dialog', { name: '답변을 등록할까요?' }))
    await user.click(confirm.getByRole('button', { name: '답변 등록' }))

    await screen.findByText('답변 등록 처리했어요.')
    const after = currentAdminInquiry(8812)
    expect(after?.status).toBe('DONE')
    expect(after?.answer).toBe('결제는 정상 승인됐고 주문은 복구했어요.')
    expect(after?.answeredByAdminId).not.toBeNull()
    expect(after?.resolvedAt).not.toBeNull()
  })

  it('[AC-ADM-INQ-007] 답변이 비어 있으면 제출할 수 없다 — 서버 400(120006)을 화면에서 먼저 막는다', async () => {
    const user = userEvent.setup()
    renderAt('/inquiries')
    await user.click(await screen.findByRole('button', { name: /카드 승인 문자는 받았는데/ }))

    const open = await drawer()
    expect(open.getByRole('button', { name: '제출' })).toBeDisabled()
    // 공백만 입력해도 여전히 잠겨 있어야 한다.
    await user.type(open.getByPlaceholderText('문의자에게 전달할 답변을 입력하세요.'), '   ')
    expect((await drawer()).getByRole('button', { name: '제출' })).toBeDisabled()
  })

  it('[AC-ADM-INQ-008] 상태 전이를 제출하면 담당 운영자와 상태가 서버에 남는다', async () => {
    const user = userEvent.setup()
    renderAt('/inquiries')
    await user.click(await screen.findByRole('button', { name: /카드 승인 문자는 받았는데/ }))

    await choose('보류')
    const open = await drawer()
    await user.click(open.getByRole('button', { name: '제출' }))
    const confirm = within(await screen.findByRole('dialog', { name: '보류로 옮길까요?' }))
    await user.click(confirm.getByRole('button', { name: '보류' }))

    await screen.findByText('보류 처리했어요.')
    const after = currentAdminInquiry(8812)
    expect(after?.status).toBe('ON_HOLD')
    expect(after?.assignedAdminId).not.toBeNull()
    // 상태 전이는 답변을 만들지 않는다.
    expect(after?.answer).toBeNull()
  })

  it('[AC-ADM-INQ-009] 지금과 같은 상태로의 전이는 고를 수 없다 — 누르면 반드시 409(120009)다', async () => {
    const user = userEvent.setup()
    renderAt('/inquiries')
    await user.click(await screen.findByRole('button', { name: /송장번호가 조회되지 않아요/ }))

    const open = await drawer()
    expect(open.getByText('지금 그 상태예요')).toBeInTheDocument()
    // 결정 셋은 답변 등록·확인 중·보류 순이고, 확인 중 문의에서는 가운데가 잠긴다.
    const radios = open.getAllByRole('radio')
    expect(radios[0]).toBeEnabled()
    expect(radios[1]).toBeDisabled()
    expect(radios[2]).toBeEnabled()
  })

  it('[AC-ADM-INQ-010] 답변이 끝난 문의는 아무 결정도 고를 수 없고 답변은 읽기로만 보인다', async () => {
    const user = userEvent.setup()
    renderAt('/inquiries')
    await user.click(await screen.findByRole('button', { name: /카카오 로그인이 안 돼요/ }))

    const open = await drawer()
    expect(open.getByText(/답변은 한 번만 등록되고 완료된 문의는 되돌리지 않아요/)).toBeInTheDocument()
    for (const radio of open.getAllByRole('radio')) expect(radio).toBeDisabled()
    expect(open.getByRole('button', { name: '제출' })).toBeDisabled()
    // 덮어쓰기를 서버가 받지 않으므로(409/120008) 입력창을 두지 않는다.
    expect(open.queryByPlaceholderText('문의자에게 전달할 답변을 입력하세요.')).toBeNull()
    expect(open.getByText('카카오 계정 연결을 초기화했어요.')).toBeInTheDocument()
  })

  it('[AC-ADM-INQ-011] 화면이 낡아 이미 답변된 문의에 답변하면 409 문구가 뜨고 답변이 덮이지 않는다', async () => {
    const user = userEvent.setup()
    renderAt('/inquiries')
    await user.click(await screen.findByRole('button', { name: /카드 승인 문자는 받았는데/ }))
    const open = await drawer()
    await user.type(open.getByPlaceholderText('문의자에게 전달할 답변을 입력하세요.'), '내 답변')
    // 운영자가 답변을 쓰는 동안 다른 운영자가 먼저 답변했다.
    seedAdminInquiries([
      makeAdminInquiryWire({ ...접수문의, status: 'DONE', answer: '먼저 나간 답변', answeredByAdminId: 2 }),
    ])

    await user.click((await drawer()).getByRole('button', { name: '제출' }))
    const confirm = within(await screen.findByRole('dialog', { name: '답변을 등록할까요?' }))
    await user.click(confirm.getByRole('button', { name: '답변 등록' }))

    expect(await screen.findByText(/이미 답변이 등록된 문의예요/)).toBeInTheDocument()
    expect(currentAdminInquiry(8812)?.answer).toBe('먼저 나간 답변')
  })

  it('[AC-ADM-INQ-012] 요청이 떠 있는 동안 확인 Modal은 ESC·취소·스크림으로 닫히지 않는다', async () => {
    // 응답을 테스트가 붙잡고 있다가 놓는다 — 그 사이가 "요청이 떠 있는 동안"이다.
    let release: () => void = () => {}
    const gate = new Promise<void>(resolve => {
      release = resolve
    })
    server.use(
      http.post(ADMIN_INQUIRY_ANSWER_URL, async () => {
        await gate
        return HttpResponse.json({ errorCode: 90000, message: '서버 오류' }, { status: 500 })
      }),
    )
    const user = userEvent.setup()
    renderAt('/inquiries')
    await user.click(await screen.findByRole('button', { name: /카드 승인 문자는 받았는데/ }))
    const open = await drawer()
    await user.type(open.getByPlaceholderText('문의자에게 전달할 답변을 입력하세요.'), '확인했어요')
    await user.click((await drawer()).getByRole('button', { name: '제출' }))
    const dialog = await screen.findByRole('dialog', { name: '답변을 등록할까요?' })
    await user.click(within(dialog).getByRole('button', { name: '답변 등록' }))

    // 요청이 떠 있다 — 확인 버튼은 잠기고 Modal은 어떤 닫기 제스처에도 버텨야 한다.
    await vi.waitFor(() => expect(within(dialog).getByRole('button', { name: '' })).toBeDisabled())
    await user.keyboard('{Escape}')
    expect(screen.getByRole('dialog', { name: '답변을 등록할까요?' })).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: '취소' }))
    expect(screen.getByRole('dialog', { name: '답변을 등록할까요?' })).toBeInTheDocument()
    // 스크림은 접근 이름이 없다(aria-hidden) — 패널 바깥의 그 노드를 직접 누른다.
    const scrim = dialog.querySelector('[aria-hidden="true"]')
    if (!scrim) throw new Error('확인 Modal에 스크림이 없다')
    await user.click(scrim)
    expect(screen.getByRole('dialog', { name: '답변을 등록할까요?' })).toBeInTheDocument()

    release()
    // 실패 응답이 와서야 Modal이 닫히고 실패 문구가 뜬다.
    expect(await screen.findByText(/요청을 처리하지 못했어요/)).toBeInTheDocument()
  })

  it('[AC-ADM-INQ-018] 요청이 떠 있는 동안에는 다른 화면으로 나갈 수 없다', async () => {
    // 닫기 가드는 Drawer·Modal의 onClose만 막는다 — 라우트 이탈로 화면이 언마운트되면
    // react-query가 호출별 onSuccess/onError를 실행하지 않아(MutationObserver가 hasListeners로
    // 가둔다) 답변은 서버에 들어갔는데 운영자는 결과를 못 본 채 다른 화면에 있게 된다.
    let release: () => void = () => {}
    const gate = new Promise<void>(resolve => {
      release = resolve
    })
    server.use(
      http.post(ADMIN_INQUIRY_ANSWER_URL, async () => {
        await gate
        return HttpResponse.json({ errorCode: 90000, message: '서버 오류' }, { status: 500 })
      }),
    )
    const user = userEvent.setup()
    const { router } = renderAt('/inquiries')
    await user.click(await screen.findByRole('button', { name: /카드 승인 문자는 받았는데/ }))
    const open = await drawer()
    await user.type(open.getByPlaceholderText('문의자에게 전달할 답변을 입력하세요.'), '확인했어요')
    await user.click((await drawer()).getByRole('button', { name: '제출' }))
    const dialog = await screen.findByRole('dialog', { name: '답변을 등록할까요?' })
    await user.click(within(dialog).getByRole('button', { name: '답변 등록' }))
    await vi.waitFor(() => expect(within(dialog).getByRole('button', { name: '' })).toBeDisabled())

    // 막힌 이동의 약속은 다음 성공한 이동까지 매달려 있으므로(router commitLocation) await하지 않는다.
    await act(async () => {
      void router.navigate({ to: '/audit-log' })
      await Promise.resolve()
    })
    expect(router.state.location.pathname).toBe('/inquiries')
    expect(screen.getByRole('dialog', { name: '답변을 등록할까요?' })).toBeInTheDocument()

    release()
    expect(await screen.findByText(/요청을 처리하지 못했어요/)).toBeInTheDocument()

    // 처리가 끝나면 가드가 풀린다 — 운영자를 화면에 묶어 두지 않는다.
    await act(async () => {
      void router.navigate({ to: '/audit-log' })
      await Promise.resolve()
    })
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/audit-log'))
  })

  it('[AC-ADM-INQ-013] 확인 버튼을 두 번 눌러도 답변 요청은 한 번만 나간다', async () => {
    const answerRequests = countRequests('POST', '/admin/inquiries/8812/answer')
    const user = userEvent.setup()
    renderAt('/inquiries')
    await user.click(await screen.findByRole('button', { name: /카드 승인 문자는 받았는데/ }))
    const open = await drawer()
    await user.type(open.getByPlaceholderText('문의자에게 전달할 답변을 입력하세요.'), '확인했어요')
    await user.click((await drawer()).getByRole('button', { name: '제출' }))
    const dialog = await screen.findByRole('dialog', { name: '답변을 등록할까요?' })
    const confirmButton = within(dialog).getByRole('button', { name: '답변 등록' })

    await user.dblClick(confirmButton)

    await screen.findByText('답변 등록 처리했어요.')
    expect(answerRequests).toHaveLength(1)
  })

  it('[AC-ADM-INQ-014] 필터를 바꾸면 옛 커서를 보내지 않고 더 보기도 그 사이 열리지 않는다', async () => {
    seedAdminInquiries(
      Array.from({ length: 21 }, (_, index) =>
        makeAdminInquiryWire({
          inquiryId: 9000 + index,
          content: `문의 본문 ${index}`,
          receivedAt: `2026-10-01T09:${String(index).padStart(2, '0')}:00`,
          status: index === 0 ? 'ON_HOLD' : 'RECEIVED',
        }),
      ),
    )
    const requested: string[] = []
    server.events.on('request:start', ({ request }) => {
      const url = new URL(request.url)
      if (url.pathname.endsWith('/admin/inquiries')) {
        requested.push(
          `${url.searchParams.get('status') ?? 'none'}|${url.searchParams.get('cursor') ?? 'none'}`,
        )
      }
    })
    const user = userEvent.setup()
    renderAt('/inquiries')
    await screen.findByText('조건에 맞는 문의 21건')
    expect(screen.getByRole('button', { name: '더 보기' })).toBeInTheDocument()

    await user.selectOptions(
      screen.getAllByRole('combobox')[0]!,
      screen.getByRole('option', { name: '보류' }),
    )

    await screen.findByText('조건에 맞는 문의 1건')
    // 필터를 바꾼 요청에 옛 커서가 붙으면 서버가 400(90002)으로 끊는다.
    expect(requested).toEqual(['none|none', 'ON_HOLD|none'])
    // 1건뿐인 결과에 이전 조건의 hasNext가 남아 더 보기가 열려 있으면 페이지를 건너뛴다.
    expect(screen.queryByRole('button', { name: '더 보기' })).toBeNull()
  })

  it('[AC-ADM-INQ-015] 더 보기는 커서로 다음 페이지를 이어 받는다', async () => {
    seedAdminInquiries(
      Array.from({ length: 21 }, (_, index) =>
        makeAdminInquiryWire({
          inquiryId: 9000 + index,
          content: `문의 본문 ${index}`,
          receivedAt: `2026-10-01T09:${String(index).padStart(2, '0')}:00`,
        }),
      ),
    )
    const user = userEvent.setup()
    renderAt('/inquiries')

    // 접수 오래된 순이라 첫 페이지는 0~19다.
    expect(await screen.findByRole('button', { name: '문의 본문 0' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '문의 본문 20' })).toBeNull()

    await user.click(screen.getByRole('button', { name: '더 보기' }))

    expect(await screen.findByRole('button', { name: '문의 본문 20' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '더 보기' })).toBeNull()
  })
  it('[AC-ADM-INQ-016] 상세 재조회가 403으로 실패하면 낡은 상세로 제출할 수 없다', async () => {
    const answerRequests = countRequests('POST', '/admin/inquiries/8812/answer')
    const user = userEvent.setup()
    const { queryClient } = renderAt('/inquiries')
    await user.click(await screen.findByRole('button', { name: /카드 승인 문자는 받았는데/ }))
    let open = await drawer()
    await user.type(open.getByPlaceholderText('문의자에게 전달할 답변을 입력하세요.'), '확인했어요')
    expect((await drawer()).getByRole('button', { name: '제출' })).toBeEnabled()

    // 목록은 멀쩡한데 상세만 권한이 끊긴다 — react-query는 캐시된 상세를 그대로 들고 있다.
    server.use(
      http.get(ADMIN_INQUIRY_DETAIL_URL, () =>
        HttpResponse.json({ errorCode: 20011, message: '접근 권한이 없습니다.' }, { status: 403 }),
      ),
    )
    await act(async () => {
      await queryClient.refetchQueries({ queryKey: ['admin-inquiries', 'detail'] })
    })

    open = await drawer()
    expect(open.getByText(/어드민 권한이 없어 문의 상세를 볼 수 없어요/)).toBeInTheDocument()
    // 오류 안내와 살아 있는 제출 버튼이 함께 있으면 낡은 값으로 전이를 지시하게 된다.
    expect(open.getByRole('button', { name: '제출' })).toBeDisabled()
    expect(answerRequests).toEqual([])
  })

  it('[AC-ADM-INQ-017] 필터를 바꾼 뒤 새 첫 페이지가 오기 전에는 더 보기가 열려 있지 않다', async () => {
    seedAdminInquiries(
      Array.from({ length: 21 }, (_, index) =>
        makeAdminInquiryWire({
          inquiryId: 9000 + index,
          content: `문의 본문 ${index}`,
          receivedAt: `2026-10-01T09:${String(index).padStart(2, '0')}:00`,
        }),
      ),
    )
    // 새 조건의 첫 페이지 응답을 테스트가 붙잡는다 — 그 사이가 placeholder 구간이다.
    let release: () => void = () => {}
    const gate = new Promise<void>(resolve => {
      release = resolve
    })
    const user = userEvent.setup()
    renderAt('/inquiries')
    await screen.findByRole('button', { name: '문의 본문 0' })
    expect(screen.getByRole('button', { name: '더 보기' })).toBeInTheDocument()

    server.use(
      http.get(ADMIN_INQUIRIES_URL, async () => {
        await gate
        return HttpResponse.json({
          data: { items: [], totalCount: 0, nextCursor: null, hasNext: false },
        })
      }),
    )
    await user.selectOptions(
      screen.getAllByRole('combobox')[0]!,
      screen.getByRole('option', { name: '보류' }),
    )

    // 이전 조건의 행이 그대로 보이는 placeholder 구간이다 — 그런데도 더 보기는 닫혀 있어야 한다.
    // 열어 두면 그 버튼이 이전 사슬의 커서를 요구해 새 조건의 첫 페이지를 건너뛴다.
    expect(screen.getByRole('button', { name: '문의 본문 0' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '더 보기' })).toBeNull()

    release()
    expect(await screen.findByText('조건에 맞는 문의 0건')).toBeInTheDocument()
  })
})
