import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter, createMemoryHistory } from '@tanstack/react-router'
import { HttpResponse, http } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { routeTree } from '../../../routeTree.gen'
import {
  ADMIN_REVIEWS_URL,
  ADMIN_REVIEW_DETAIL_URL,
  currentAdminReview,
  makeAdminReviewWire,
  seedAdminReviews,
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

const 노출리뷰 = makeAdminReviewWire({
  reviewId: 51204,
  content: '사료 바꾸고 애가 아팠어요.',
  rating: 1,
  images: [{ imageUrl: 'https://cdn.example.com/a.jpg', sortOrder: 0 }],
  reports: [
    {
      reportId: 11,
      reporterId: 2001,
      reasonCode: 'ABUSE',
      reasonText: '욕설이 섞여 있어요',
      status: 'PENDING',
      reportedAt: '2026-10-25T22:00:00',
    },
  ],
})

const 블라인드리뷰 = makeAdminReviewWire({
  reviewId: 51188,
  productName: '프리미엄 관절 영양제 180정',
  productPublicId: '01HZXP0000000000000000002',
  content: '같은 제품을 더 싸게 파는 곳 주소를 남겨 둘게요.',
  rating: 5,
  reviewStatus: 'BLOCKED',
  blindActor: 'AI',
  blindReasonCode: 'PROFANITY',
  blindedAt: '2026-10-24T11:10:00',
  createdAt: '2026-10-24T11:08:00',
})

const 삭제리뷰 = makeAdminReviewWire({
  reviewId: 51060,
  productName: '원목 캣타워 대형',
  productPublicId: '01HZXP0000000000000000003',
  content: '광고성 문구만 반복된 리뷰였어요.',
  reviewStatus: 'DELETED',
  blindActor: 'ADMIN',
  blindReasonCode: 'AD_SPAM',
  deletedAt: '2026-10-22T10:00:00',
  deletedByAdminId: 1,
  createdAt: '2026-10-21T15:02:00',
})

const drawer = async () => within(await screen.findByRole('dialog', { name: '리뷰 상세' }))

/**
 * 결정 라디오는 caption 글자로 누른다 — `DecisionRadioGroup`의 행 전체가 클릭 영역이고,
 * 라벨 글자('블라인드')는 상태 pill·다른 결정 라벨과 겹쳐 무엇을 눌렀는지 말할 수 없다.
 */
async function chooseByCaption(caption: string) {
  const open = await drawer()
  await userEvent.setup().click(open.getByText(caption))
}

function countRequests(method: string, pathSuffix: string): string[] {
  const seen: string[] = []
  server.events.on('request:start', ({ request }) => {
    const url = new URL(request.url)
    if (request.method === method && url.pathname.endsWith(pathSuffix)) seen.push(url.pathname)
  })
  return seen
}

describe('/reviews', () => {
  beforeEach(() => {
    seedAdminReviews([노출리뷰, 블라인드리뷰, 삭제리뷰])
  })

  it('[AC-ADM-RVW-001] 목록은 블라인드·삭제된 리뷰까지 보여주고 사유를 함께 적는다', async () => {
    renderAt('/reviews')

    expect(await screen.findByRole('button', { name: /사료 바꾸고 애가 아팠어요/ })).toBeInTheDocument()
    const table = within(screen.getByRole('table'))
    // 구매자 조회와 달리 가려진 리뷰도 나온다 — 되돌릴 수 있어야 하는 쪽이다.
    expect(table.getByText('블라인드')).toBeInTheDocument()
    expect(table.getByText('삭제')).toBeInTheDocument()
    expect(table.getByText('금칙어 자동 판정')).toBeInTheDocument()
    expect(table.getByText('1건')).toBeInTheDocument()
    expect(screen.getByText('조건에 맞는 리뷰 3건')).toBeInTheDocument()
  })

  it('[AC-ADM-RVW-002] 목록 조회가 403이면 빈 상태가 아니라 권한 문제를 드러낸다', async () => {
    server.use(
      http.get(ADMIN_REVIEWS_URL, () =>
        HttpResponse.json({ errorCode: 20011, message: '접근 권한이 없습니다.' }, { status: 403 }),
      ),
    )
    renderAt('/reviews')

    expect(await screen.findByText(/어드민 권한이 없어 리뷰 목록을 볼 수 없어요/)).toBeInTheDocument()
    expect(screen.queryByText('조건에 맞는 리뷰가 없어요.')).not.toBeInTheDocument()
  })

  it('[AC-ADM-RVW-003] 조회가 403으로 끊긴 뒤에는 낡은 행의 처리 버튼이 잠긴다', async () => {
    const user = userEvent.setup()
    const { queryClient } = renderAt('/reviews')
    await user.click(await screen.findByRole('button', { name: /사료 바꾸고 애가 아팠어요/ }))
    let open = await drawer()
    await user.selectOptions(
      open.getAllByRole('combobox')[0]!,
      open.getByRole('option', { name: '욕설/비방' }),
    )
    expect((await drawer()).getByRole('button', { name: '제출' })).toBeEnabled()

    server.use(
      http.get(ADMIN_REVIEWS_URL, () =>
        HttpResponse.json({ errorCode: 20011, message: '접근 권한이 없습니다.' }, { status: 403 }),
      ),
    )
    await act(async () => {
      await queryClient.refetchQueries({ queryKey: ['admin-reviews', 'list'] })
    })

    // 행은 남지만(마지막으로 본 내용은 정보다) 되돌릴 수 없는 삭제·블라인드는 막는다.
    expect(screen.getByRole('button', { name: /사료 바꾸고 애가 아팠어요/ })).toBeInTheDocument()
    open = await drawer()
    expect(open.getByRole('button', { name: '제출' })).toBeDisabled()
  })

  it('[AC-ADM-RVW-004] 상세는 원문·사진·신고 이력과 처리 이력을 보여준다', async () => {
    const user = userEvent.setup()
    renderAt('/reviews')

    await user.click(await screen.findByRole('button', { name: /사료 바꾸고 애가 아팠어요/ }))

    const open = await drawer()
    expect(open.getByText('첨부 사진 / 1장')).toBeInTheDocument()
    expect(open.getByAltText('리뷰 사진 1')).toHaveAttribute('src', 'https://cdn.example.com/a.jpg')
    expect(open.getByText('신고 이력 / 1건')).toBeInTheDocument()
    expect(open.getByText('욕설/비방 / 욕설이 섞여 있어요')).toBeInTheDocument()
    expect(open.getByText('처리 이력 / 0건')).toBeInTheDocument()
    expect(open.getByText('처리 이력이 없어요.')).toBeInTheDocument()
  })

  it('[AC-ADM-RVW-005] 마스킹된 리뷰는 원문과 구매자에게 보이는 문장을 함께 보여준다', async () => {
    seedAdminReviews([
      makeAdminReviewWire({
        ...노출리뷰,
        reviewStatus: 'MASKED',
        displayContent: '일부 표현이 가려진 리뷰입니다.',
      }),
    ])
    const user = userEvent.setup()
    renderAt('/reviews')

    await user.click(await screen.findByRole('button', { name: /사료 바꾸고 애가 아팠어요/ }))

    const open = await drawer()
    expect(open.getByText('구매자에게 보이는 문장')).toBeInTheDocument()
    expect(open.getByText('일부 표현이 가려진 리뷰입니다.')).toBeInTheDocument()
    expect(open.getByText('사료 바꾸고 애가 아팠어요.')).toBeInTheDocument()
  })

  it('[AC-ADM-RVW-006] 블라인드는 사유를 골라야 제출할 수 있고, 제출하면 서버 상태와 사유가 남는다', async () => {
    const user = userEvent.setup()
    renderAt('/reviews')
    await user.click(await screen.findByRole('button', { name: /사료 바꾸고 애가 아팠어요/ }))

    // 사유가 비면 제출이 잠긴다 — 서버의 400(90001)을 화면에서 먼저 막는다.
    expect((await drawer()).getByRole('button', { name: '제출' })).toBeDisabled()

    const open = await drawer()
    await user.selectOptions(
      open.getAllByRole('combobox')[0]!,
      open.getByRole('option', { name: '욕설/비방' }),
    )
    await user.type(open.getByPlaceholderText('운영 기록으로 남길 메모를 입력하세요.'), '신고 4건 확인')
    await user.click((await drawer()).getByRole('button', { name: '제출' }))
    const confirm = within(await screen.findByRole('dialog', { name: '리뷰를 블라인드할까요?' }))
    await user.click(confirm.getByRole('button', { name: '블라인드' }))

    await screen.findByText('블라인드 처리했어요.')
    const after = currentAdminReview(51204)
    expect(after?.reviewStatus).toBe('BLOCKED')
    expect(after?.blindActor).toBe('ADMIN')
    expect(after?.blindReasonCode).toBe('ABUSE')
    expect(after?.blindReasonText).toBe('신고 4건 확인')
  })

  it('[AC-ADM-RVW-007] 운영자 선택지에 금칙어 자동 판정은 없다 — 자동 처리만 쓰는 값이다', async () => {
    const user = userEvent.setup()
    renderAt('/reviews')
    await user.click(await screen.findByRole('button', { name: /사료 바꾸고 애가 아팠어요/ }))

    const open = await drawer()
    const reasonSelect = open.getAllByRole('combobox')[0]!
    expect(within(reasonSelect).queryByRole('option', { name: '금칙어 자동 판정' })).toBeNull()
    // 개수만 세면 다른 값이 빠지고 PROFANITY가 들어와도 통과한다 — 선택지 전체를 이름으로 고정한다.
    expect(
      within(reasonSelect)
        .getAllByRole('option')
        .map(option => option.textContent),
    ).toEqual(['욕설/비방', '외부 거래 유도', '광고/스팸', '개인정보 노출', '상품과 무관', '기타'])
  })

  it('[AC-ADM-RVW-008] 이미 블라인드된 리뷰는 블라인드를 다시 고를 수 없고 해제가 기본값이다', async () => {
    const user = userEvent.setup()
    renderAt('/reviews')
    await user.click(await screen.findByRole('button', { name: /더 싸게 파는 곳 주소/ }))

    const open = await drawer()
    expect(open.getByText('이미 블라인드된 리뷰예요')).toBeInTheDocument()
    const radios = open.getAllByRole('radio')
    // 블라인드·해제·삭제 순. 블라인드는 누르면 반드시 409(110020)다.
    expect(radios[0]).toBeDisabled()
    expect(radios[1]).toBeEnabled()
    expect(radios[1]).toBeChecked()
    // 해제는 사유를 받지 않는다 — 입력 자체가 없어야 한다(동작 안 하는 입력 금지).
    expect(open.queryByPlaceholderText('운영 기록으로 남길 메모를 입력하세요.')).toBeNull()
  })

  it('[AC-ADM-RVW-009] 블라인드 해제는 사유 없이 제출되고 노출로 되돌아간다', async () => {
    const user = userEvent.setup()
    renderAt('/reviews')
    await user.click(await screen.findByRole('button', { name: /더 싸게 파는 곳 주소/ }))

    await user.click((await drawer()).getByRole('button', { name: '제출' }))
    const confirm = within(await screen.findByRole('dialog', { name: '블라인드를 해제할까요?' }))
    await user.click(confirm.getByRole('button', { name: '블라인드 해제' }))

    await screen.findByText('블라인드 해제 처리했어요.')
    const after = currentAdminReview(51188)
    expect(after?.reviewStatus).toBe('PUBLIC')
    expect(after?.blindActor).toBeNull()
    expect(after?.blindReasonCode).toBeNull()
  })

  it('[AC-ADM-RVW-010] 마스킹 대체 본문이 있던 리뷰의 해제는 노출이 아니라 마스킹으로 돌아간다', async () => {
    seedAdminReviews([
      makeAdminReviewWire({
        ...블라인드리뷰,
        displayContent: '일부 표현이 가려진 리뷰입니다.',
      }),
    ])
    const user = userEvent.setup()
    renderAt('/reviews')
    await user.click(await screen.findByRole('button', { name: /더 싸게 파는 곳 주소/ }))

    await user.click((await drawer()).getByRole('button', { name: '제출' }))
    const confirm = within(await screen.findByRole('dialog', { name: '블라인드를 해제할까요?' }))
    await user.click(confirm.getByRole('button', { name: '블라인드 해제' }))

    await screen.findByText('블라인드 해제 처리했어요.')
    expect(currentAdminReview(51188)?.reviewStatus).toBe('MASKED')
  })

  it('[AC-ADM-RVW-011] 삭제는 되돌릴 수 없다고 알리고 제출하면 서버에 삭제 기록이 남는다', async () => {
    const user = userEvent.setup()
    renderAt('/reviews')
    await user.click(await screen.findByRole('button', { name: /사료 바꾸고 애가 아팠어요/ }))

    await chooseByCaption('되돌릴 수 없음')
    const open = await drawer()
    await user.selectOptions(
      open.getAllByRole('combobox')[0]!,
      open.getByRole('option', { name: '광고/스팸' }),
    )
    await user.click((await drawer()).getByRole('button', { name: '제출' }))
    const dialog = await screen.findByRole('dialog', { name: '리뷰를 삭제할까요?' })
    expect(within(dialog).getByText(/삭제된 리뷰는 되돌릴 수 없어요/)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: '삭제' }))

    await screen.findByText('삭제 처리했어요.')
    const after = currentAdminReview(51204)
    expect(after?.reviewStatus).toBe('DELETED')
    expect(after?.deletedAt).not.toBeNull()
    expect(after?.deletedByAdminId).not.toBeNull()
    expect(after?.blindReasonCode).toBe('AD_SPAM')
    // 삭제는 블라인드 시각을 비운다 — 삭제 시각은 deletedAt이다.
    expect(after?.blindedAt).toBeNull()
  })

  it('[AC-ADM-RVW-012] 삭제된 리뷰는 아무 결정도 고를 수 없고 제출도 막힌다', async () => {
    const user = userEvent.setup()
    renderAt('/reviews')
    await user.click(await screen.findByRole('button', { name: /광고성 문구만 반복된/ }))

    const open = await drawer()
    expect(open.getByText(/삭제는 되돌릴 수 없어서 블라인드도 해제도 할 수 없어요/)).toBeInTheDocument()
    for (const radio of open.getAllByRole('radio')) expect(radio).toBeDisabled()
    expect(open.getByRole('button', { name: '제출' })).toBeDisabled()
  })

  it('[AC-ADM-RVW-013] 화면이 낡아 이미 블라인드된 리뷰를 블라인드하면 409 문구가 뜨고 상태가 그대로다', async () => {
    const user = userEvent.setup()
    renderAt('/reviews')
    await user.click(await screen.findByRole('button', { name: /사료 바꾸고 애가 아팠어요/ }))
    const open = await drawer()
    await user.selectOptions(
      open.getAllByRole('combobox')[0]!,
      open.getByRole('option', { name: '욕설/비방' }),
    )
    // 운영자가 사유를 고르는 동안 다른 운영자가 먼저 블라인드했다.
    seedAdminReviews([
      makeAdminReviewWire({ ...노출리뷰, reviewStatus: 'BLOCKED', blindActor: 'ADMIN', blindReasonCode: 'PRIVACY' }),
    ])

    await user.click((await drawer()).getByRole('button', { name: '제출' }))
    const confirm = within(await screen.findByRole('dialog', { name: '리뷰를 블라인드할까요?' }))
    await user.click(confirm.getByRole('button', { name: '블라인드' }))

    // 드로어의 결정 caption에도 같은 말이 있어 토스트 전문으로 찾는다.
    expect(
      await screen.findByText('이미 블라인드된 리뷰예요. 목록을 다시 불러왔어요.'),
    ).toBeInTheDocument()
    // 먼저 들어간 사유가 덮이지 않는다.
    expect(currentAdminReview(51204)?.blindReasonCode).toBe('PRIVACY')
  })

  it('[AC-ADM-RVW-014] 요청이 떠 있는 동안 삭제 확인 Modal은 ESC·취소·스크림으로 닫히지 않는다', async () => {
    // 응답을 테스트가 붙잡고 있다가 놓는다 — 그 사이가 "요청이 떠 있는 동안"이다.
    let release: () => void = () => {}
    const gate = new Promise<void>(resolve => {
      release = resolve
    })
    server.use(
      http.delete(ADMIN_REVIEW_DETAIL_URL, async () => {
        await gate
        return HttpResponse.json({ errorCode: 90000, message: '서버 오류' }, { status: 500 })
      }),
    )
    const user = userEvent.setup()
    renderAt('/reviews')
    await user.click(await screen.findByRole('button', { name: /사료 바꾸고 애가 아팠어요/ }))
    await chooseByCaption('되돌릴 수 없음')
    const open = await drawer()
    await user.selectOptions(
      open.getAllByRole('combobox')[0]!,
      open.getByRole('option', { name: '광고/스팸' }),
    )
    await user.click((await drawer()).getByRole('button', { name: '제출' }))
    const dialog = await screen.findByRole('dialog', { name: '리뷰를 삭제할까요?' })
    await user.click(within(dialog).getByRole('button', { name: '삭제' }))

    await vi.waitFor(() => expect(within(dialog).getByRole('button', { name: '' })).toBeDisabled())
    await user.keyboard('{Escape}')
    expect(screen.getByRole('dialog', { name: '리뷰를 삭제할까요?' })).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: '취소' }))
    expect(screen.getByRole('dialog', { name: '리뷰를 삭제할까요?' })).toBeInTheDocument()
    // 스크림은 접근 이름이 없다(aria-hidden) — 패널 바깥의 그 노드를 직접 누른다.
    const scrim = dialog.querySelector('[aria-hidden="true"]')
    if (!scrim) throw new Error('확인 Modal에 스크림이 없다')
    await user.click(scrim)
    expect(screen.getByRole('dialog', { name: '리뷰를 삭제할까요?' })).toBeInTheDocument()

    release()
    expect(await screen.findByText(/요청을 처리하지 못했어요/)).toBeInTheDocument()
    // 실패한 요청은 상태를 바꾸지 않는다.
    expect(currentAdminReview(51204)?.reviewStatus).toBe('PUBLIC')
  })

  it('[AC-ADM-RVW-021] 요청이 떠 있는 동안에는 다른 화면으로 나갈 수 없다', async () => {
    // 닫기 가드는 Drawer·Modal의 onClose만 막는다 — 라우트 이탈로 화면이 언마운트되면
    // react-query가 호출별 onSuccess/onError를 실행하지 않아(MutationObserver가 hasListeners로
    // 가둔다) 삭제는 서버에 들어갔는데 운영자는 결과를 못 본 채 다른 화면에 있게 된다.
    let release: () => void = () => {}
    const gate = new Promise<void>(resolve => {
      release = resolve
    })
    server.use(
      http.delete(ADMIN_REVIEW_DETAIL_URL, async () => {
        await gate
        return HttpResponse.json({ errorCode: 90000, message: '서버 오류' }, { status: 500 })
      }),
    )
    const user = userEvent.setup()
    const { router } = renderAt('/reviews')
    await user.click(await screen.findByRole('button', { name: /사료 바꾸고 애가 아팠어요/ }))
    await chooseByCaption('되돌릴 수 없음')
    const open = await drawer()
    await user.selectOptions(
      open.getAllByRole('combobox')[0]!,
      open.getByRole('option', { name: '광고/스팸' }),
    )
    await user.click((await drawer()).getByRole('button', { name: '제출' }))
    const dialog = await screen.findByRole('dialog', { name: '리뷰를 삭제할까요?' })
    await user.click(within(dialog).getByRole('button', { name: '삭제' }))
    await vi.waitFor(() => expect(within(dialog).getByRole('button', { name: '' })).toBeDisabled())

    // 막힌 이동의 약속은 끝내 resolve되지 않으므로(router commitLocation) await하지 않는다.
    await act(async () => {
      void router.navigate({ to: '/audit-log' })
      await Promise.resolve()
    })
    expect(router.state.location.pathname).toBe('/reviews')
    expect(screen.getByRole('dialog', { name: '리뷰를 삭제할까요?' })).toBeInTheDocument()

    release()
    expect(await screen.findByText(/요청을 처리하지 못했어요/)).toBeInTheDocument()

    // 처리가 끝나면 가드가 풀린다 — 운영자를 화면에 묶어 두지 않는다.
    await act(async () => {
      void router.navigate({ to: '/audit-log' })
      await Promise.resolve()
    })
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/audit-log'))
  })

  it('[AC-ADM-RVW-015] 삭제 확인을 두 번 눌러도 요청은 한 번만 나간다', async () => {
    const deleteRequests = countRequests('DELETE', '/admin/reviews/51204')
    const user = userEvent.setup()
    renderAt('/reviews')
    await user.click(await screen.findByRole('button', { name: /사료 바꾸고 애가 아팠어요/ }))
    await chooseByCaption('되돌릴 수 없음')
    const open = await drawer()
    await user.selectOptions(
      open.getAllByRole('combobox')[0]!,
      open.getByRole('option', { name: '광고/스팸' }),
    )
    await user.click((await drawer()).getByRole('button', { name: '제출' }))
    const dialog = await screen.findByRole('dialog', { name: '리뷰를 삭제할까요?' })

    await user.dblClick(within(dialog).getByRole('button', { name: '삭제' }))

    await screen.findByText('삭제 처리했어요.')
    expect(deleteRequests).toHaveLength(1)
  })

  it('[AC-ADM-RVW-016] 별점·신고 필터는 서버로 나가고 필터를 바꾸면 옛 커서를 보내지 않는다', async () => {
    const requested: string[] = []
    server.events.on('request:start', ({ request }) => {
      const url = new URL(request.url)
      if (url.pathname.endsWith('/admin/reviews')) {
        requested.push(
          [
            url.searchParams.get('rating') ?? 'none',
            url.searchParams.get('reported') ?? 'none',
            url.searchParams.get('cursor') ?? 'none',
          ].join('|'),
        )
      }
    })
    const user = userEvent.setup()
    renderAt('/reviews')
    await screen.findByText('조건에 맞는 리뷰 3건')

    await user.selectOptions(
      screen.getAllByRole('combobox')[1]!,
      screen.getByRole('option', { name: '1점' }),
    )
    await screen.findByText('조건에 맞는 리뷰 2건')
    await user.selectOptions(
      screen.getAllByRole('combobox')[2]!,
      screen.getByRole('option', { name: '신고 접수만' }),
    )
    await screen.findByText('조건에 맞는 리뷰 1건')

    // 서버는 정확한 별점 하나만 받고, reported는 true일 때만 키가 붙는다.
    expect(requested).toEqual(['none|none|none', '1|none|none', '1|true|none'])
  })

  it('[AC-ADM-RVW-017] 더 보기는 커서로 다음 페이지를 이어 받고 필터를 바꾸면 닫힌다', async () => {
    seedAdminReviews(
      Array.from({ length: 21 }, (_, index) =>
        makeAdminReviewWire({
          reviewId: 60000 + index,
          content: `리뷰 본문 ${index}`,
          rating: index === 0 ? 2 : 5,
        }),
      ),
    )
    const user = userEvent.setup()
    renderAt('/reviews')

    // reviewId 내림차순이라 첫 페이지는 60020부터다.
    expect(await screen.findByRole('button', { name: '리뷰 본문 20' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '리뷰 본문 0' })).toBeNull()

    await user.click(screen.getByRole('button', { name: '더 보기' }))
    expect(await screen.findByRole('button', { name: '리뷰 본문 0' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '더 보기' })).toBeNull()

    // 필터를 바꾸면 커서 사슬이 새로 시작되므로 더 보기가 다시 열리지 않는다(1건뿐이다).
    await user.selectOptions(
      screen.getAllByRole('combobox')[1]!,
      screen.getByRole('option', { name: '2점' }),
    )
    await screen.findByText('조건에 맞는 리뷰 1건')
    expect(screen.queryByRole('button', { name: '더 보기' })).toBeNull()
  })
  it('[AC-ADM-RVW-018] 상세 재조회가 403으로 실패하면 낡은 상세로 삭제할 수 없다', async () => {
    const deleteRequests = countRequests('DELETE', '/admin/reviews/51204')
    const user = userEvent.setup()
    const { queryClient } = renderAt('/reviews')
    await user.click(await screen.findByRole('button', { name: /사료 바꾸고 애가 아팠어요/ }))
    let open = await drawer()
    await chooseByCaption('되돌릴 수 없음')
    await user.selectOptions(
      (await drawer()).getAllByRole('combobox')[0]!,
      (await drawer()).getByRole('option', { name: '광고/스팸' }),
    )
    expect((await drawer()).getByRole('button', { name: '제출' })).toBeEnabled()

    // 목록은 멀쩡한데 상세만 권한이 끊긴다 — react-query는 캐시된 상세를 그대로 들고 있다.
    server.use(
      http.get(ADMIN_REVIEW_DETAIL_URL, () =>
        HttpResponse.json({ errorCode: 20011, message: '접근 권한이 없습니다.' }, { status: 403 }),
      ),
    )
    await act(async () => {
      await queryClient.refetchQueries({ queryKey: ['admin-reviews', 'detail'] })
    })

    open = await drawer()
    expect(open.getByText(/어드민 권한이 없어 리뷰 상세를 볼 수 없어요/)).toBeInTheDocument()
    expect(open.getByRole('button', { name: '제출' })).toBeDisabled()
    expect(deleteRequests).toEqual([])
  })

  it('[AC-ADM-RVW-019] 필터를 바꾼 뒤 새 첫 페이지가 오기 전에는 더 보기가 열려 있지 않다', async () => {
    seedAdminReviews(
      Array.from({ length: 21 }, (_, index) =>
        makeAdminReviewWire({ reviewId: 60000 + index, content: `리뷰 본문 ${index}` }),
      ),
    )
    // 새 조건의 첫 페이지 응답을 테스트가 붙잡는다 — 그 사이가 placeholder 구간이다.
    let release: () => void = () => {}
    const gate = new Promise<void>(resolve => {
      release = resolve
    })
    const user = userEvent.setup()
    renderAt('/reviews')
    await screen.findByRole('button', { name: '리뷰 본문 20' })
    expect(screen.getByRole('button', { name: '더 보기' })).toBeInTheDocument()

    server.use(
      http.get(ADMIN_REVIEWS_URL, async () => {
        await gate
        return HttpResponse.json({
          data: { items: [], totalCount: 0, nextCursor: null, hasNext: false },
        })
      }),
    )
    await user.selectOptions(
      screen.getAllByRole('combobox')[1]!,
      screen.getByRole('option', { name: '3점' }),
    )

    // 이전 조건의 행이 그대로 보이는 placeholder 구간인데도 더 보기는 닫혀 있어야 한다 —
    // 열어 두면 그 버튼이 옛 커서를 요구하고, 리뷰 커서는 필터 지문이 달라 400(90002)으로 끊긴다.
    expect(screen.getByRole('button', { name: '리뷰 본문 20' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '더 보기' })).toBeNull()

    release()
    expect(await screen.findByText('조건에 맞는 리뷰 0건')).toBeInTheDocument()
  })

  it('[AC-ADM-RVW-020] 한글 검색어로 두 쪽 이상을 받아도 커서가 깨지지 않고 검색어가 실리지 않는다', async () => {
    seedAdminReviews(
      Array.from({ length: 21 }, (_, index) =>
        makeAdminReviewWire({ reviewId: 70000 + index, content: `사료 후기 ${index}` }),
      ),
    )
    const cursors: string[] = []
    server.events.on('request:start', ({ request }) => {
      const url = new URL(request.url)
      if (!url.pathname.endsWith('/admin/reviews')) return
      const cursor = url.searchParams.get('cursor')
      if (cursor != null) cursors.push(cursor)
    })
    const user = userEvent.setup()
    renderAt('/reviews')
    await screen.findByText('조건에 맞는 리뷰 21건')
    await user.type(screen.getByPlaceholderText('리뷰 내용 / 상품 검색'), '사료')

    // 첫 쪽이 오는 것만으로는 부족하다 — 다음 커서를 **만드는** 자리에서 터졌다.
    expect(await screen.findByRole('button', { name: '사료 후기 20' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '더 보기' }))
    expect(await screen.findByRole('button', { name: '사료 후기 0' })).toBeInTheDocument()

    // 커서는 지문만 싣는다 — 서버(AdminReviewCursorCodec)가 검색어 원문을 싣지 않는다.
    // UTF-8로 되돌려 본다 — atob 결과를 그대로 보면 한글이 바이트로 흩어져 어떤 문자열도 걸리지 않는다.
    expect(cursors).toHaveLength(1)
    const latin1 = atob(cursors[0]!.replace(/-/g, '+').replace(/_/g, '/'))
    const payload = new TextDecoder().decode(Uint8Array.from(latin1, c => c.charCodeAt(0)))
    expect(payload).not.toContain('사료')
  })
})
