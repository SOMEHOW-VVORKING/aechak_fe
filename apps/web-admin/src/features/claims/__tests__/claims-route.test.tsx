import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter, createMemoryHistory } from '@tanstack/react-router'
import { HttpResponse, http } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { routeTree } from '../../../routeTree.gen'
import {
  ADMIN_CLAIMS_URL,
  ADMIN_CLAIM_DETAIL_URL,
  ADMIN_CLAIM_INTERVENE_URL,
  ADMIN_CLAIM_REASONS_URL,
  currentAdminClaim,
  makeAdminClaimWire,
  seedAdminClaims,
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

const 거부된반품 = makeAdminClaimWire({ claimPublicId: 'CLM-2041' })

const 취소클레임 = makeAdminClaimWire({
  claimPublicId: 'CLM-2038',
  orderPublicId: 'ORD-2038',
  claimType: 'CANCEL',
  reasonCode: 'DELIVERY_DELAY',
  reasonLabel: '발송 지연',
  reasonDetail: '이틀이 지났는데 아직 발송되지 않았어요.',
  status: 'CLAIM_REQUESTED',
  sellerApprovalStatus: 'REQUESTED',
  productNames: ['수제 오리목뼈 간식 500g'],
  returnShippingFee: null,
  refundAmount: 23_500,
  sellerName: '냥이상점',
  buyerNickname: '먼지아빠',
  requestedAt: '2026-10-26T09:30:00',
  resolvedAt: null,
  rejectionReason: null,
  sellerMemo: null,
  items: [
    {
      orderItemId: 9002,
      productName: '수제 오리목뼈 간식 500g',
      optionName: '500g',
      quantity: 1,
      unitPrice: 23_500,
      refundAmount: 23_500,
      itemStatus: 'ORDERED',
    },
  ],
})

/** 환불이 이미 집행된 건 — 개입으로 종결하면 돌려줄 돈이 남은 채 분쟁이 닫힌다(개입 불가). */
const 환불완료클레임 = makeAdminClaimWire({
  claimPublicId: 'CLM-2015',
  orderPublicId: 'ORD-2015',
  claimType: 'RETURN',
  status: 'APPROVED',
  refundStatus: 'DONE',
  sellerApprovalStatus: 'APPROVED',
  productNames: ['저알러지 건식사료 5kg'],
  buyerNickname: '라이카맘',
  requestedAt: '2026-10-21T08:44:00',
  approvedAt: '2026-10-21T10:00:00',
  resolvedAt: '2026-10-22T10:00:00',
})

const drawer = async () => within(await screen.findByRole('dialog', { name: '클레임 상세' }))

/** 판정 라디오는 caption 글자로 누른다 — 라벨은 상태 pill·개입 기록과 겹친다. */
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

describe('/claims', () => {
  beforeEach(() => {
    seedAdminClaims([거부된반품, 취소클레임, 환불완료클레임])
  })

  it('[AC-ADM-CLM-001] 목록은 기본으로 개입 가능한 건만 보여주고 네 축을 접은 상태를 적는다', async () => {
    renderAt('/claims')

    expect(await screen.findByRole('button', { name: 'CLM-2041' })).toBeInTheDocument()
    const table = within(screen.getByRole('table'))
    expect(table.getByText('셀러 거부')).toBeInTheDocument()
    expect(table.getByText('운영 개입 대상')).toBeInTheDocument()
    expect(table.getByText('139,000원')).toBeInTheDocument()
    // 환불이 집행된 건은 개입 대상이 아니라 기본 목록(openOnly)에서 빠진다.
    expect(table.queryByText('CLM-2015')).toBeNull()
    expect(screen.getByText('조건에 맞는 클레임 2건')).toBeInTheDocument()
  })

  it('[AC-ADM-CLM-002] 범위를 전체로 바꾸면 종결된 건까지 보이고 openOnly=false가 서버로 나간다', async () => {
    const requested: string[] = []
    server.events.on('request:start', ({ request }) => {
      const url = new URL(request.url)
      if (url.pathname.endsWith('/admin/claims')) {
        requested.push(url.searchParams.get('openOnly') ?? 'none')
      }
    })
    const user = userEvent.setup()
    renderAt('/claims')
    await screen.findByText('조건에 맞는 클레임 2건')

    await user.selectOptions(
      screen.getAllByRole('combobox')[0]!,
      screen.getByRole('option', { name: '종결까지 전체' }),
    )

    expect(await screen.findByText('조건에 맞는 클레임 3건')).toBeInTheDocument()
    // false를 빼면 서버가 상태 필터 유무로 범위를 정해 전체가 작업 목록으로 좁혀진다.
    expect(requested).toEqual(['true', 'false'])
  })

  it('[AC-ADM-CLM-003] 목록 조회가 403이면 빈 상태가 아니라 권한 문제를 드러낸다', async () => {
    server.use(
      http.get(ADMIN_CLAIMS_URL, () =>
        HttpResponse.json({ errorCode: 20011, message: '접근 권한이 없습니다.' }, { status: 403 }),
      ),
    )
    renderAt('/claims')

    expect(
      await screen.findByText(/어드민 권한이 없어 클레임 목록을 볼 수 없어요/),
    ).toBeInTheDocument()
    expect(screen.queryByText('조건에 맞는 클레임이 없어요.')).not.toBeInTheDocument()
  })

  it('[AC-ADM-CLM-004] 조회가 403으로 끊긴 뒤에는 낡은 행의 처리 버튼이 잠긴다', async () => {
    const user = userEvent.setup()
    const { queryClient } = renderAt('/claims')
    await user.click(await screen.findByRole('button', { name: 'CLM-2041' }))
    let open = await drawer()
    await user.selectOptions(
      open.getAllByRole('combobox')[0]!,
      open.getByRole('option', { name: '셀러가 기한 내 응답하지 않았어요' }),
    )
    expect((await drawer()).getByRole('button', { name: '제출' })).toBeEnabled()

    server.use(
      http.get(ADMIN_CLAIMS_URL, () =>
        HttpResponse.json({ errorCode: 20011, message: '접근 권한이 없습니다.' }, { status: 403 }),
      ),
    )
    await act(async () => {
      await queryClient.refetchQueries({ queryKey: ['admin-claims', 'list'] })
    })

    expect(screen.getByRole('button', { name: 'CLM-2041' })).toBeInTheDocument()
    open = await drawer()
    expect(open.getByRole('button', { name: '제출' })).toBeDisabled()
  })

  it('[AC-ADM-CLM-005] 상세는 구매자 주장과 셀러 처리를 따로 떼어 보여준다', async () => {
    const user = userEvent.setup()
    renderAt('/claims')

    await user.click(await screen.findByRole('button', { name: 'CLM-2041' }))

    const open = await drawer()
    expect(open.getByText('구매자 주장')).toBeInTheDocument()
    expect(open.getByText('박스를 열자마자 기둥이 갈라져 있었어요.')).toBeInTheDocument()
    expect(open.getByText('셀러 처리')).toBeInTheDocument()
    expect(open.getByText(/거부 사유: 출고 전 검수 사진에는 파손이 없었어요./)).toBeInTheDocument()
    expect(open.getByText(/셀러 메모: 택배사 과실로 보여요./)).toBeInTheDocument()
    expect(open.getByText('대상 품목 / 1건')).toBeInTheDocument()
  })

  it('[AC-ADM-CLM-025] 수령인·연락처는 평문으로 내려와도 화면이 가려서 보여준다', async () => {
    const user = userEvent.setup()
    renderAt('/claims')

    await user.click(await screen.findByRole('button', { name: 'CLM-2041' }))

    // 서버는 복호 평문('김보리'·'010-1234-5678')을 내린다 — 가리는 것은 화면 책임이다.
    const open = await drawer()
    expect(open.getByText('김*리')).toBeInTheDocument()
    expect(open.getByText('010-****-5678')).toBeInTheDocument()
    expect(open.queryByText('김보리')).toBeNull()
    expect(open.queryByText('010-1234-5678')).toBeNull()
  })

  it('[AC-ADM-CLM-006] 개입 사유 선택지는 판정별로 서버 카탈로그에서 온다', async () => {
    const user = userEvent.setup()
    renderAt('/claims')
    await user.click(await screen.findByRole('button', { name: 'CLM-2041' }))

    let open = await drawer()
    let reasonSelect = open.getAllByRole('combobox')[0]!
    expect(
      within(reasonSelect)
        .getAllByRole('option')
        .map(option => option.textContent),
    ).toEqual([
      '셀러가 기한 내 응답하지 않았어요',
      '셀러 처리가 운영 정책에 맞지 않아요',
      '구매자 주장에 근거가 있어요',
      '기타',
    ])

    await userEvent.setup().click(open.getByText('기본 반품비 부담은 구매자'))

    open = await drawer()
    reasonSelect = open.getAllByRole('combobox')[0]!
    // 판정이 바뀌면 선택지도 바뀐다 — 어긋난 짝을 보내면 서버가 400(50415)으로 거절한다.
    expect(
      within(reasonSelect)
        .getAllByRole('option')
        .map(option => option.textContent),
    ).toEqual(['셀러 주장에 근거가 있어요', '구매자 단순 변심으로 확인됐어요', '기타'])
  })

  it('[AC-ADM-CLM-007] 판정을 바꾸면 고른 사유가 비워져 어긋난 짝이 서버로 나가지 않는다', async () => {
    const user = userEvent.setup()
    renderAt('/claims')
    await user.click(await screen.findByRole('button', { name: 'CLM-2041' }))

    let open = await drawer()
    await user.selectOptions(
      open.getAllByRole('combobox')[0]!,
      open.getByRole('option', { name: '셀러가 기한 내 응답하지 않았어요' }),
    )
    expect((await drawer()).getByRole('button', { name: '제출' })).toBeEnabled()

    await chooseByCaption('기본 반품비 부담은 구매자')

    open = await drawer()
    expect(open.getAllByRole('combobox')[0]!).toHaveValue('')
    expect(open.getByRole('button', { name: '제출' })).toBeDisabled()
  })

  it('[AC-ADM-CLM-008] 기타 사유는 상세 내용을 적어야 제출할 수 있다', async () => {
    const user = userEvent.setup()
    renderAt('/claims')
    await user.click(await screen.findByRole('button', { name: 'CLM-2041' }))

    let open = await drawer()
    await user.selectOptions(
      open.getAllByRole('combobox')[0]!,
      open.getByRole('option', { name: '기타' }),
    )
    open = await drawer()
    expect(open.getByRole('button', { name: '제출' })).toBeDisabled()

    await user.type(open.getByPlaceholderText('양쪽에 전달할 판정 사유를 입력하세요.'), '양측 증빙 확인')
    expect((await drawer()).getByRole('button', { name: '제출' })).toBeEnabled()
  })

  it('[AC-ADM-CLM-009] 셀러 귀책 개입을 제출하면 상태가 뒤집히고 개입 기록이 남는다', async () => {
    const user = userEvent.setup()
    renderAt('/claims')
    await user.click(await screen.findByRole('button', { name: 'CLM-2041' }))

    const open = await drawer()
    await user.selectOptions(
      open.getAllByRole('combobox')[0]!,
      open.getByRole('option', { name: '셀러가 기한 내 응답하지 않았어요' }),
    )
    await user.type(open.getByPlaceholderText('내부 공유용 메모를 입력하세요.'), 'CS 티켓 2041')
    await user.click((await drawer()).getByRole('button', { name: '제출' }))
    const dialog = await screen.findByRole('dialog', { name: '셀러 귀책으로 종결할까요?' })
    // 개입은 환불을 집행하지 않는다 — 확인 Modal이 그 사실을 적어야 한다.
    expect(within(dialog).getByText('이 처리로 집행되지 않아요')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: '셀러 귀책 종결' }))

    await screen.findByText(/셀러 귀책 종결 처리했어요/)
    const after = currentAdminClaim('CLM-2041')
    expect(after?.status).toBe('ADMIN_OVERRIDDEN')
    expect(after?.intervention?.faultDecision).toBe('SELLER_FAULT')
    expect(after?.intervention?.reason).toBe('SELLER_UNRESPONSIVE')
    expect(after?.intervention?.internalMemo).toBe('CS 티켓 2041')
    expect(after?.intervention?.previousStatus).toBe('REJECTED')
    // 반품 클레임의 셀러 귀책은 부담 주체가 셀러로 정해진다(판정 기본값).
    expect(after?.returnCostBearer).toBe('SELLER')
    // 환불 축은 그대로다 — 개입이 돈을 건드리지 않는다.
    expect(after?.refundStatus).toBe('NONE')
  })

  it('[AC-ADM-CLM-010] 반품비 부담 주체를 고르면 그 값이 판정 기본값을 덮는다', async () => {
    const user = userEvent.setup()
    renderAt('/claims')
    await user.click(await screen.findByRole('button', { name: 'CLM-2041' }))

    let open = await drawer()
    await user.selectOptions(
      open.getAllByRole('combobox')[0]!,
      open.getByRole('option', { name: '구매자 주장에 근거가 있어요' }),
    )
    open = await drawer()
    // 사유 Select 다음이 부담 주체 Select다(상세 사유가 필요 없는 사유라 Textarea가 없다).
    const bearerSelect = open.getAllByRole('combobox')[1]!
    await user.selectOptions(bearerSelect, within(bearerSelect).getByRole('option', { name: '구매자 부담' }))
    await user.click((await drawer()).getByRole('button', { name: '제출' }))
    const dialog = await screen.findByRole('dialog', { name: '셀러 귀책으로 종결할까요?' })
    expect(within(dialog).getByText('구매자 부담')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: '셀러 귀책 종결' }))

    await screen.findByText(/셀러 귀책 종결 처리했어요/)
    expect(currentAdminClaim('CLM-2041')?.returnCostBearer).toBe('BUYER')
  })

  it('[AC-ADM-CLM-011] 취소 클레임에는 반품비 부담 입력을 두지 않는다 — 서버가 비우는 자리다', async () => {
    const user = userEvent.setup()
    renderAt('/claims')
    await user.click(await screen.findByRole('button', { name: 'CLM-2038' }))

    let open = await drawer()
    await user.selectOptions(
      open.getAllByRole('combobox')[0]!,
      open.getByRole('option', { name: '셀러 처리가 운영 정책에 맞지 않아요' }),
    )
    open = await drawer()
    // 사유 Select 하나뿐이어야 한다(부담 주체 Select가 없다).
    expect(open.getAllByRole('combobox')).toHaveLength(1)

    await user.click(open.getByRole('button', { name: '제출' }))
    const dialog = await screen.findByRole('dialog', { name: '셀러 귀책으로 종결할까요?' })
    expect(within(dialog).getByText('해당 없음')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: '셀러 귀책 종결' }))

    await screen.findByText(/셀러 귀책 종결 처리했어요/)
    expect(currentAdminClaim('CLM-2038')?.returnCostBearer).toBeNull()
  })

  it('[AC-ADM-CLM-012] 클레임 불가 판정에도 부담 입력이 없고 되돌릴 수 없다고 알린다', async () => {
    const user = userEvent.setup()
    renderAt('/claims')
    await user.click(await screen.findByRole('button', { name: 'CLM-2041' }))

    await chooseByCaption('요청 불성립으로 종결, 부담 주체 없음')
    let open = await drawer()
    await user.selectOptions(
      open.getAllByRole('combobox')[0]!,
      open.getByRole('option', { name: '구매자의 반복·악성 요청이에요' }),
    )
    open = await drawer()
    expect(open.getAllByRole('combobox')).toHaveLength(1)

    await user.click(open.getByRole('button', { name: '제출' }))
    const dialog = await screen.findByRole('dialog', { name: '클레임을 불가로 종결할까요?' })
    expect(within(dialog).getByText(/되돌릴 수 없어요/)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: '불가 종결' }))

    await screen.findByText(/불가 종결 처리했어요/)
    const after = currentAdminClaim('CLM-2041')
    expect(after?.intervention?.faultDecision).toBe('CLAIM_DISMISSED')
    expect(after?.returnCostBearer).toBeNull()
  })

  it('[AC-ADM-CLM-013] 개입할 수 없는 건은 그 사실을 알리고 제출이 막힌다', async () => {
    const user = userEvent.setup()
    renderAt('/claims')
    await user.selectOptions(
      (await screen.findAllByRole('combobox'))[0]!,
      screen.getByRole('option', { name: '종결까지 전체' }),
    )
    await user.click(await screen.findByRole('button', { name: 'CLM-2015' }))

    const open = await drawer()
    expect(open.getByText('지금 개입할 수 없는 클레임이에요')).toBeInTheDocument()
    expect(open.getByRole('button', { name: '제출' })).toBeDisabled()
  })

  it('[AC-ADM-CLM-014] 이미 개입한 건은 개입 기록을 보여주고 다시 제출할 수 없다', async () => {
    const user = userEvent.setup()
    renderAt('/claims')
    await user.click(await screen.findByRole('button', { name: 'CLM-2041' }))
    let open = await drawer()
    await user.selectOptions(
      open.getAllByRole('combobox')[0]!,
      open.getByRole('option', { name: '셀러가 기한 내 응답하지 않았어요' }),
    )
    await user.click((await drawer()).getByRole('button', { name: '제출' }))
    const dialog = await screen.findByRole('dialog', { name: '셀러 귀책으로 종결할까요?' })
    await user.click(within(dialog).getByRole('button', { name: '셀러 귀책 종결' }))
    await screen.findByText(/셀러 귀책 종결 처리했어요/)

    // 종결된 건은 기본 목록에서 빠지므로 범위를 넓혀 다시 연다.
    await user.selectOptions(
      screen.getAllByRole('combobox')[0]!,
      screen.getByRole('option', { name: '종결까지 전체' }),
    )
    await user.click(await screen.findByRole('button', { name: 'CLM-2041' }))

    open = await drawer()
    expect(open.getByText('운영자 개입 기록')).toBeInTheDocument()
    expect(open.getByText('셀러 귀책 / 셀러가 기한 내 응답하지 않았어요')).toBeInTheDocument()
    expect(open.getByText('지금 개입할 수 없는 클레임이에요')).toBeInTheDocument()
    expect(open.getByRole('button', { name: '제출' })).toBeDisabled()
  })

  it('[AC-ADM-CLM-015] 화면이 낡아 이미 개입된 건에 개입하면 409 문구가 뜨고 기록이 덮이지 않는다', async () => {
    const user = userEvent.setup()
    renderAt('/claims')
    await user.click(await screen.findByRole('button', { name: 'CLM-2041' }))
    const open = await drawer()
    await user.selectOptions(
      open.getAllByRole('combobox')[0]!,
      open.getByRole('option', { name: '셀러가 기한 내 응답하지 않았어요' }),
    )
    // 운영자가 사유를 고르는 동안 다른 운영자가 먼저 개입했다.
    seedAdminClaims([
      makeAdminClaimWire({
        ...거부된반품,
        status: 'ADMIN_OVERRIDDEN',
        intervention: {
          adminId: 2,
          faultDecision: 'BUYER_FAULT',
          claimAccepted: true,
          reason: 'BUYER_CHANGE_OF_MIND',
          reasonLabel: '구매자 단순 변심으로 확인됐어요',
          reasonDetail: null,
          returnCostBearer: 'BUYER',
          previousStatus: 'REJECTED',
          previousSellerApprovalStatus: 'REJECTED',
          previousResolvedAt: '2026-10-26T10:00:00',
          internalMemo: null,
          intervenedAt: '2026-10-29T10:00:00',
        },
      }),
    ])

    await user.click((await drawer()).getByRole('button', { name: '제출' }))
    const dialog = await screen.findByRole('dialog', { name: '셀러 귀책으로 종결할까요?' })
    await user.click(within(dialog).getByRole('button', { name: '셀러 귀책 종결' }))

    expect(await screen.findByText(/지금 개입할 수 없는 클레임이에요\. 이미 개입했거나/)).toBeInTheDocument()
    // 먼저 들어간 판정이 덮이지 않는다.
    expect(currentAdminClaim('CLM-2041')?.intervention?.faultDecision).toBe('BUYER_FAULT')
  })

  it('[AC-ADM-CLM-016] 요청이 떠 있는 동안 확인 Modal은 ESC·취소·스크림으로 닫히지 않는다', async () => {
    // 응답을 테스트가 붙잡고 있다가 놓는다 — 그 사이가 "요청이 떠 있는 동안"이다.
    let release: () => void = () => {}
    const gate = new Promise<void>(resolve => {
      release = resolve
    })
    server.use(
      http.post(ADMIN_CLAIM_INTERVENE_URL, async () => {
        await gate
        return HttpResponse.json({ errorCode: 90000, message: '서버 오류' }, { status: 500 })
      }),
    )
    const user = userEvent.setup()
    renderAt('/claims')
    await user.click(await screen.findByRole('button', { name: 'CLM-2041' }))
    const open = await drawer()
    await user.selectOptions(
      open.getAllByRole('combobox')[0]!,
      open.getByRole('option', { name: '셀러가 기한 내 응답하지 않았어요' }),
    )
    await user.click((await drawer()).getByRole('button', { name: '제출' }))
    const dialog = await screen.findByRole('dialog', { name: '셀러 귀책으로 종결할까요?' })
    await user.click(within(dialog).getByRole('button', { name: '셀러 귀책 종결' }))

    await vi.waitFor(() => expect(within(dialog).getByRole('button', { name: '' })).toBeDisabled())
    await user.keyboard('{Escape}')
    expect(screen.getByRole('dialog', { name: '셀러 귀책으로 종결할까요?' })).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: '취소' }))
    expect(screen.getByRole('dialog', { name: '셀러 귀책으로 종결할까요?' })).toBeInTheDocument()
    // 스크림은 접근 이름이 없다(aria-hidden) — 패널 바깥의 그 노드를 직접 누른다.
    const scrim = dialog.querySelector('[aria-hidden="true"]')
    if (!scrim) throw new Error('확인 Modal에 스크림이 없다')
    await user.click(scrim)
    expect(screen.getByRole('dialog', { name: '셀러 귀책으로 종결할까요?' })).toBeInTheDocument()

    release()
    expect(await screen.findByText(/요청을 처리하지 못했어요/)).toBeInTheDocument()
    // 실패한 요청은 분쟁을 종결시키지 않는다.
    expect(currentAdminClaim('CLM-2041')?.status).toBe('REJECTED')
  })

  it('[AC-ADM-CLM-027] 요청이 떠 있는 동안에는 다른 화면으로 나갈 수 없다', async () => {
    // 닫기 가드는 Drawer·Modal의 onClose만 막는다 — 라우트 이탈로 화면이 언마운트되면
    // react-query가 호출별 onSuccess/onError를 실행하지 않아(MutationObserver가 hasListeners로
    // 가둔다) 개입은 서버에 들어갔는데 운영자는 결과를 못 본 채 다른 화면에 있게 된다.
    let release: () => void = () => {}
    const gate = new Promise<void>(resolve => {
      release = resolve
    })
    server.use(
      http.post(ADMIN_CLAIM_INTERVENE_URL, async () => {
        await gate
        return HttpResponse.json({ errorCode: 90000, message: '서버 오류' }, { status: 500 })
      }),
    )
    const user = userEvent.setup()
    const { router } = renderAt('/claims')
    await user.click(await screen.findByRole('button', { name: 'CLM-2041' }))
    const open = await drawer()
    await user.selectOptions(
      open.getAllByRole('combobox')[0]!,
      open.getByRole('option', { name: '셀러가 기한 내 응답하지 않았어요' }),
    )
    await user.click((await drawer()).getByRole('button', { name: '제출' }))
    const dialog = await screen.findByRole('dialog', { name: '셀러 귀책으로 종결할까요?' })
    await user.click(within(dialog).getByRole('button', { name: '셀러 귀책 종결' }))
    await vi.waitFor(() => expect(within(dialog).getByRole('button', { name: '' })).toBeDisabled())

    // 막힌 이동의 약속은 다음 성공한 이동까지 매달려 있으므로(router commitLocation) await하지 않는다.
    await act(async () => {
      void router.navigate({ to: '/audit-log' })
      await Promise.resolve()
    })
    expect(router.state.location.pathname).toBe('/claims')
    expect(screen.getByRole('dialog', { name: '셀러 귀책으로 종결할까요?' })).toBeInTheDocument()

    release()
    expect(await screen.findByText(/요청을 처리하지 못했어요/)).toBeInTheDocument()

    // 처리가 끝나면 가드가 풀린다 — 운영자를 화면에 묶어 두지 않는다.
    await act(async () => {
      void router.navigate({ to: '/audit-log' })
      await Promise.resolve()
    })
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/audit-log'))
  })

  it('[AC-ADM-CLM-017] 확인 버튼을 두 번 눌러도 개입 요청은 한 번만 나간다', async () => {
    const interveneRequests = countRequests('POST', '/admin/claims/CLM-2041/intervention')
    const user = userEvent.setup()
    renderAt('/claims')
    await user.click(await screen.findByRole('button', { name: 'CLM-2041' }))
    const open = await drawer()
    await user.selectOptions(
      open.getAllByRole('combobox')[0]!,
      open.getByRole('option', { name: '셀러가 기한 내 응답하지 않았어요' }),
    )
    await user.click((await drawer()).getByRole('button', { name: '제출' }))
    const dialog = await screen.findByRole('dialog', { name: '셀러 귀책으로 종결할까요?' })

    await user.dblClick(within(dialog).getByRole('button', { name: '셀러 귀책 종결' }))

    await screen.findByText(/셀러 귀책 종결 처리했어요/)
    // 두 번 나가면 한쪽이 409(50414)가 되고 운영자는 실패 문구를 보게 된다.
    expect(interveneRequests).toHaveLength(1)
  })

  it('[AC-ADM-CLM-018] 사유 카탈로그를 못 받으면 제출할 수 없다고 알린다', async () => {
    server.use(
      http.get(ADMIN_CLAIM_REASONS_URL, () =>
        HttpResponse.json({ errorCode: 90000, message: '서버 오류' }, { status: 500 }),
      ),
    )
    const user = userEvent.setup()
    renderAt('/claims')
    await user.click(await screen.findByRole('button', { name: 'CLM-2041' }))

    const open = await drawer()
    expect(open.getByText(/개입 사유 선택지를 불러오지 못해 지금은 판정을 제출할 수 없어요/)).toBeInTheDocument()
    expect(open.getAllByRole('combobox')[0]!).toBeDisabled()
    expect(open.getByRole('button', { name: '제출' })).toBeDisabled()
  })

  it('[AC-ADM-CLM-019] 검색축을 바꾸면 검색어를 비우고 그 축만 서버로 보낸다', async () => {
    const requested: string[] = []
    server.events.on('request:start', ({ request }) => {
      const url = new URL(request.url)
      if (url.pathname.endsWith('/admin/claims')) {
        requested.push(
          [
            url.searchParams.get('orderPublicId') ?? '-',
            url.searchParams.get('sellerKeyword') ?? '-',
          ].join('|'),
        )
      }
    })
    const user = userEvent.setup()
    renderAt('/claims')
    await screen.findByText('조건에 맞는 클레임 2건')

    await user.type(screen.getByPlaceholderText('주문번호 전체를 입력'), 'ORD-2038')
    await screen.findByText('조건에 맞는 클레임 1건')

    await user.selectOptions(
      screen.getAllByRole('combobox')[3]!,
      screen.getByRole('option', { name: '셀러명' }),
    )
    await screen.findByText('조건에 맞는 클레임 2건')

    // 주문번호는 완전일치라 셀러명 검색어를 그대로 넘기면 0건이 된다 — 축을 바꾸면 비운다.
    expect(requested.at(-1)).toBe('-|-')
    expect(requested).toContain('ORD-2038|-')
  })
  it('[AC-ADM-CLM-020] 상세 재조회가 403으로 실패하면 낡은 상세로 종결할 수 없다', async () => {
    const interveneRequests = countRequests('POST', '/admin/claims/CLM-2041/intervention')
    const user = userEvent.setup()
    const { queryClient } = renderAt('/claims')
    await user.click(await screen.findByRole('button', { name: 'CLM-2041' }))
    let open = await drawer()
    await user.selectOptions(
      open.getAllByRole('combobox')[0]!,
      open.getByRole('option', { name: '셀러가 기한 내 응답하지 않았어요' }),
    )
    expect((await drawer()).getByRole('button', { name: '제출' })).toBeEnabled()

    // 목록은 멀쩡한데 상세만 권한이 끊긴다 — react-query는 캐시된 상세를 그대로 들고 있다.
    server.use(
      http.get(ADMIN_CLAIM_DETAIL_URL, () =>
        HttpResponse.json({ errorCode: 20011, message: '접근 권한이 없습니다.' }, { status: 403 }),
      ),
    )
    await act(async () => {
      await queryClient.refetchQueries({ queryKey: ['admin-claims', 'detail'] })
    })

    open = await drawer()
    expect(open.getByText(/어드민 권한이 없어 클레임 상세를 볼 수 없어요/)).toBeInTheDocument()
    expect(open.getByRole('button', { name: '제출' })).toBeDisabled()
    expect(interveneRequests).toEqual([])
  })

  it('[AC-ADM-CLM-021] 사유 카탈로그 재조회가 실패하면 고른 사유가 남아 있어도 제출이 막힌다', async () => {
    const interveneRequests = countRequests('POST', '/admin/claims/CLM-2041/intervention')
    const user = userEvent.setup()
    const { queryClient } = renderAt('/claims')
    await user.click(await screen.findByRole('button', { name: 'CLM-2041' }))
    let open = await drawer()
    await user.selectOptions(
      open.getAllByRole('combobox')[0]!,
      open.getByRole('option', { name: '셀러가 기한 내 응답하지 않았어요' }),
    )
    expect((await drawer()).getByRole('button', { name: '제출' })).toBeEnabled()

    // 카탈로그만 끊긴다 — 캐시된 선택지가 남아 있어 사유는 그대로 골라져 있다.
    server.use(
      http.get(ADMIN_CLAIM_REASONS_URL, () =>
        HttpResponse.json({ errorCode: 20011, message: '접근 권한이 없습니다.' }, { status: 403 }),
      ),
    )
    await act(async () => {
      await queryClient.refetchQueries({ queryKey: ['admin-claims', 'intervention-reasons'] })
    })

    open = await drawer()
    expect(open.getByText(/개입 사유를 불러올 수 없어요/)).toBeInTheDocument()
    expect(open.getByRole('button', { name: '제출' })).toBeDisabled()
    expect(interveneRequests).toEqual([])
  })

  it('[AC-ADM-CLM-022] 개입 뒤 무효화는 사유 카탈로그를 다시 받지 않는다', async () => {
    const catalogRequests = countRequests('GET', '/admin/claims/intervention-reasons')
    const user = userEvent.setup()
    renderAt('/claims')
    await user.click(await screen.findByRole('button', { name: 'CLM-2041' }))
    const open = await drawer()
    await user.selectOptions(
      open.getAllByRole('combobox')[0]!,
      open.getByRole('option', { name: '셀러가 기한 내 응답하지 않았어요' }),
    )
    await user.click((await drawer()).getByRole('button', { name: '제출' }))
    const dialog = await screen.findByRole('dialog', { name: '셀러 귀책으로 종결할까요?' })
    await user.click(within(dialog).getByRole('button', { name: '셀러 귀책 종결' }))
    await screen.findByText(/셀러 귀책 종결 처리했어요/)

    // 고정 어휘라 다시 받을 이유가 없고, 그 요청이 실패하면 다음 개입이 막힌다.
    expect(catalogRequests).toHaveLength(1)
  })

  it('[AC-ADM-CLM-023] 필터를 바꾼 뒤 새 첫 페이지가 오기 전에는 더 보기가 열려 있지 않다', async () => {
    seedAdminClaims(
      Array.from({ length: 21 }, (_, index) =>
        makeAdminClaimWire({
          claimPublicId: `CLM-3${String(index).padStart(3, '0')}`,
          orderPublicId: `ORD-3${String(index).padStart(3, '0')}`,
          requestedAt: `2026-10-01T09:${String(index).padStart(2, '0')}:00`,
        }),
      ),
    )
    // 새 조건의 첫 페이지 응답을 테스트가 붙잡는다 — 그 사이가 placeholder 구간이다.
    let release: () => void = () => {}
    const gate = new Promise<void>(resolve => {
      release = resolve
    })
    const user = userEvent.setup()
    renderAt('/claims')
    await screen.findByRole('button', { name: 'CLM-3000' })
    expect(screen.getByRole('button', { name: '더 보기' })).toBeInTheDocument()

    server.use(
      http.get(ADMIN_CLAIMS_URL, async () => {
        await gate
        return HttpResponse.json({
          data: { items: [], totalCount: 0, nextCursor: null, hasNext: false },
        })
      }),
    )
    await user.selectOptions(
      screen.getAllByRole('combobox')[2]!,
      screen.getByRole('option', { name: '교환' }),
    )

    expect(screen.getByRole('button', { name: 'CLM-3000' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '더 보기' })).toBeNull()

    release()
    expect(await screen.findByText('조건에 맞는 클레임 0건')).toBeInTheDocument()
  })
  it('[AC-ADM-CLM-024] 상세가 필요 없는 사유로 바꾸면 적어 둔 상세가 요청에 실리지 않는다', async () => {
    const user = userEvent.setup()
    renderAt('/claims')
    await user.click(await screen.findByRole('button', { name: 'CLM-2041' }))

    let open = await drawer()
    await user.selectOptions(
      open.getAllByRole('combobox')[0]!,
      open.getByRole('option', { name: '기타' }),
    )
    open = await drawer()
    await user.type(
      open.getByPlaceholderText('양쪽에 전달할 판정 사유를 입력하세요.'),
      '기타 사유로 적어 둔 문장',
    )

    // 같은 판정 안에서 상세가 필요 없는 사유로 바꾼다 — 입력란이 사라진다.
    await user.selectOptions(
      (await drawer()).getAllByRole('combobox')[0]!,
      (await drawer()).getByRole('option', { name: '셀러가 기한 내 응답하지 않았어요' }),
    )
    open = await drawer()
    expect(open.queryByPlaceholderText('양쪽에 전달할 판정 사유를 입력하세요.')).toBeNull()

    // 기타로 되돌아오면 입력란이 **비어 있어야** 한다 — 사유를 바꿀 때 상세를 비우는 쪽을
    // 이 단언이 고정한다(보내는 자리의 가드는 이 경로로는 도달할 수 없는 뒷받침이다).
    await user.selectOptions(
      open.getAllByRole('combobox')[0]!,
      open.getByRole('option', { name: '기타' }),
    )
    open = await drawer()
    expect(open.getByPlaceholderText('양쪽에 전달할 판정 사유를 입력하세요.')).toHaveValue('')

    await user.selectOptions(
      open.getAllByRole('combobox')[0]!,
      open.getByRole('option', { name: '셀러가 기한 내 응답하지 않았어요' }),
    )
    open = await drawer()

    await user.click(open.getByRole('button', { name: '제출' }))
    const dialog = await screen.findByRole('dialog', { name: '셀러 귀책으로 종결할까요?' })
    await user.click(within(dialog).getByRole('button', { name: '셀러 귀책 종결' }))

    await screen.findByText(/셀러 귀책 종결 처리했어요/)
    // 운영자가 보지 못한 문장이 개입 기록에 박히면 안 된다.
    expect(currentAdminClaim('CLM-2041')?.intervention?.reasonDetail).toBeNull()
  })
})
