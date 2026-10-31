import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createMemoryHistory, createRouter } from '@tanstack/react-router'
import { beforeEach, describe, expect, it } from 'vitest'
import { http, HttpResponse } from 'msw'
import { setAccessToken } from '@aechak/api'
import { logout, resetAuth } from '@/shared/auth'
import { resetRegistry } from '@/shared/catalog'
import {
  INQUIRY_OTHER_BUYER,
  PRODUCT_INQUIRIES_URL,
  INQUIRY_SECRET_PLACEHOLDER,
  REAL_PRODUCT_ID,
  currentProductInquiries,
  holdWithdraw,
  makeProductInquiryRow,
  productInquiryCallCounts,
  seedProductInquiries,
  server,
} from '@/testing/msw/server'
import { routeTree } from '../../../routeTree.gen'

function renderAt(path: string) {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
  })
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return router
}

/** 서버가 Authorization 헤더로 조회자를 가린다 — 로그인한 세션을 흉내 낸다. */
function signIn() {
  setAccessToken('test-access-token')
}

const myRow = makeProductInquiryRow({
  inquiryId: 'I0000000000000000000000001',
  productId: REAL_PRODUCT_ID,
  title: '배터리로도 쓸 수 있나요?',
  content: '정전이 걱정돼서요.',
})

const othersSecretRow = makeProductInquiryRow({
  inquiryId: 'I0000000000000000000000002',
  productId: REAL_PRODUCT_ID,
  authorUserId: INQUIRY_OTHER_BUYER,
  authorMasked: '다른집사**',
  secret: true,
  title: '주문번호 12345 환불 문의',
  content: '계좌번호는 110-123-456789 입니다.',
  status: 'ANSWERED',
  answer: { content: '확인 후 환불 처리했어요.', answeredAt: '2026-10-31T10:00:00' },
})

describe('상품 상세의 상품 문의 영역', () => {
  beforeEach(() => {
    resetAuth()
    resetRegistry()
  })

  it('[AC-PINQ-001] 등록된 문의가 목록에 보인다', async () => {
    signIn()
    seedProductInquiries([myRow])
    renderAt('/products/' + REAL_PRODUCT_ID)

    expect(await screen.findByText('배터리로도 쓸 수 있나요?')).toBeInTheDocument()
    expect(screen.getByText('정전이 걱정돼서요.')).toBeInTheDocument()
    // 머리말 건수는 서버 totalCount다.
    expect(screen.getByText('상품 문의 1')).toBeInTheDocument()
  })

  it('[AC-PINQ-002] 문의가 0건이면 빈 상태를 안내한다', async () => {
    signIn()
    seedProductInquiries([])
    renderAt('/products/' + REAL_PRODUCT_ID)

    expect(await screen.findByText('아직 등록된 문의가 없어요')).toBeInTheDocument()
  })

  it('[AC-PINQ-003] 남의 비밀글은 자리표시 문자열을 노출하지 않고 잠긴 행으로 보인다', async () => {
    signIn()
    seedProductInquiries([othersSecretRow])
    renderAt('/products/' + REAL_PRODUCT_ID)

    expect(await screen.findByText('작성자와 판매자만 볼 수 있는 문의예요')).toBeInTheDocument()
    // 서버가 제목·본문 자리에 넣어 내려주는 값이 화면에 그대로 나오면 안 된다.
    expect(screen.queryByText(INQUIRY_SECRET_PLACEHOLDER)).not.toBeInTheDocument()
    // 본문·답변도 가려진다(가려진 행에 답변이 실려 오는 서버는 없지만, 화면이 그걸 그리지 않는지 함께 본다).
    expect(screen.queryByText('계좌번호는 110-123-456789 입니다.')).not.toBeInTheDocument()
    expect(screen.queryByText('확인 후 환불 처리했어요.')).not.toBeInTheDocument()
    // 행은 남아 머리말 건수와 어긋나지 않는다.
    expect(screen.getByText('상품 문의 1')).toBeInTheDocument()
  })

  it('[AC-PINQ-004] 내 비밀글은 내가 읽을 수 있다', async () => {
    signIn()
    seedProductInquiries([
      makeProductInquiryRow({
        inquiryId: 'I0000000000000000000000003',
        productId: REAL_PRODUCT_ID,
        secret: true,
        title: '내 비밀 문의',
        content: '내 비밀 본문',
      }),
    ])
    renderAt('/products/' + REAL_PRODUCT_ID)

    expect(await screen.findByText('내 비밀 문의')).toBeInTheDocument()
    expect(screen.getByText('내 비밀 본문')).toBeInTheDocument()
    expect(screen.queryByText('작성자와 판매자만 볼 수 있는 문의예요')).not.toBeInTheDocument()
  })

  it('[AC-PINQ-005] 비회원에게는 목록을 요청하지 않고 로그인 안내만 보여준다', async () => {
    logout()
    seedProductInquiries([myRow])
    renderAt('/products/' + REAL_PRODUCT_ID)

    expect(await screen.findByText('상품 문의는 로그인하면 볼 수 있어요')).toBeInTheDocument()
    // 401이 나가면 전역 인터셉터가 상세를 로그인으로 밀어낸다 — 호출 자체가 0건이어야 한다.
    expect(productInquiryCallCounts().list).toBe(0)
    // 목록을 못 본 것을 "문의 없음"으로 위장하지 않는다.
    expect(screen.queryByText('아직 등록된 문의가 없어요')).not.toBeInTheDocument()
  })

  it('[AC-PINQ-008] 토큰 없이 들어온 비회원은 상세를 잃지 않고 로그인 안내를 받는다', async () => {
    // auth.store의 loggedIn 기본값이 true인 세션 mock이라, 새로고침·공유 링크로 들어온 진짜
    // 비회원도 로그인한 것처럼 읽힌다. 라우트가 세션을 먼저 복원하지 않으면 회원 전용 문의
    // 조회가 나가고 401 → refresh 실패 → 전역 리다이렉트로 보고 있던 상세를 잃는다.
    // (signIn을 부르지 않아 Authorization 헤더가 없고 기본 refresh 핸들러는 401이다)
    seedProductInquiries([myRow])
    renderAt('/products/' + REAL_PRODUCT_ID)

    // 상세 본문은 그대로 남는다.
    expect(await screen.findByText('리얼 프리미엄 자동 급식기')).toBeInTheDocument()
    expect(await screen.findByText('상품 문의는 로그인하면 볼 수 있어요')).toBeInTheDocument()
    expect(productInquiryCallCounts().list).toBe(0)
  })

  it('[AC-PINQ-007] 상품이 노출되지 않으면(404) 문의 0건으로 위장하지 않는다', async () => {
    signIn()
    seedProductInquiries([myRow])
    server.use(
      http.get(PRODUCT_INQUIRIES_URL, () =>
        HttpResponse.json({ errorCode: 40000, message: '상품을 찾을 수 없습니다.' }, { status: 404 }),
      ),
    )
    renderAt('/products/' + REAL_PRODUCT_ID)

    expect(await screen.findByText('지금은 이 상품의 문의를 볼 수 없어요')).toBeInTheDocument()
    expect(screen.queryByText('아직 등록된 문의가 없어요')).not.toBeInTheDocument()
    // 받지 못한 목록의 건수를 0으로 적지 않는다.
    expect(screen.queryByText('상품 문의 0')).not.toBeInTheDocument()
  })

  it('[AC-PINQ-006] 비회원이 문의하기를 누르면 등록 화면 대신 로그인 게이트가 뜬다', async () => {
    logout()
    seedProductInquiries([])
    const user = userEvent.setup()
    const router = renderAt('/products/' + REAL_PRODUCT_ID)
    await screen.findByText('상품 문의는 로그인하면 볼 수 있어요')

    await user.click(screen.getByRole('button', { name: '문의하기' }))

    expect(await screen.findByText('로그인이 필요해요')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/products/' + REAL_PRODUCT_ID)
  })
})

describe('/products/$productId/inquiries/new', () => {
  beforeEach(() => {
    resetAuth()
    resetRegistry()
    signIn()
  })

  it('[AC-PINQ-010] 유형과 제목, 내용을 채워 등록하면 서버에 문의가 생긴다', async () => {
    seedProductInquiries([])
    const user = userEvent.setup()
    const router = renderAt(`/products/${REAL_PRODUCT_ID}/inquiries/new`)
    await screen.findByText('판매자에게 물어보세요')

    await user.click(screen.getByText('배송'))
    await user.type(screen.getByLabelText('제목'), '언제 배송되나요?')
    await user.type(screen.getByLabelText('문의 내용'), '주말에도 보내주시나요')

    await user.click(screen.getByRole('button', { name: '문의 등록' }))

    await waitFor(() => expect(currentProductInquiries()).toHaveLength(1))
    const created = currentProductInquiries()[0]!
    expect(created.category).toBe('DELIVERY')
    expect(created.title).toBe('언제 배송되나요?')
    expect(created.content).toBe('주말에도 보내주시나요')
    expect(created.secret).toBe(false)
    // 등록 뒤에는 상세로 돌아간다.
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/products/' + REAL_PRODUCT_ID),
    )
  })

  it('[AC-PINQ-011] 비밀글 체크를 켜면 secret=true로 나간다', async () => {
    seedProductInquiries([])
    const user = userEvent.setup()
    renderAt(`/products/${REAL_PRODUCT_ID}/inquiries/new`)
    await screen.findByText('판매자에게 물어보세요')

    await user.click(screen.getByText('기타'))
    await user.type(screen.getByLabelText('제목'), '개인적인 질문')
    await user.type(screen.getByLabelText('문의 내용'), '연락처를 남깁니다')
    await user.click(screen.getByText('비밀글로 등록하기'))

    await user.click(screen.getByRole('button', { name: '문의 등록' }))

    await waitFor(() => expect(currentProductInquiries()).toHaveLength(1))
    expect(currentProductInquiries()[0]!.secret).toBe(true)
  })

  it('[AC-PINQ-012] 유형을 고르지 않으면 등록 버튼이 잠긴다', async () => {
    seedProductInquiries([])
    const user = userEvent.setup()
    renderAt(`/products/${REAL_PRODUCT_ID}/inquiries/new`)
    await screen.findByText('판매자에게 물어보세요')

    await user.type(screen.getByLabelText('제목'), '제목만 썼어요')
    await user.type(screen.getByLabelText('문의 내용'), '본문도 썼어요')

    expect(screen.getByRole('button', { name: '문의 등록' })).toBeDisabled()
    expect(productInquiryCallCounts().ask).toBe(0)
  })
})

describe('/mypage/product-inquiries', () => {
  beforeEach(() => {
    resetAuth()
    resetRegistry()
    signIn()
  })

  it('[AC-PINQ-020] 내 문의는 비밀글도 본문이 그대로 보인다', async () => {
    seedProductInquiries([
      makeProductInquiryRow({
        inquiryId: 'I0000000000000000000000004',
        secret: true,
        title: '내 비밀 문의',
        content: '내 비밀 본문',
      }),
    ])
    renderAt('/mypage/product-inquiries')

    expect(await screen.findByText('내 비밀 문의')).toBeInTheDocument()
    expect(screen.getByText('내 비밀 본문')).toBeInTheDocument()
    expect(screen.queryByText(INQUIRY_SECRET_PLACEHOLDER)).not.toBeInTheDocument()
  })

  it('[AC-PINQ-021] 등록한 문의가 없으면 빈 상태를 안내한다', async () => {
    seedProductInquiries([])
    renderAt('/mypage/product-inquiries')

    expect(await screen.findByText('아직 등록한 문의가 없어요')).toBeInTheDocument()
  })

  it('[AC-PINQ-022] 철회는 확인을 거친 뒤에만 서버 상태를 바꾼다', async () => {
    seedProductInquiries([myRow])
    const user = userEvent.setup()
    renderAt('/mypage/product-inquiries')
    await screen.findByText('배터리로도 쓸 수 있나요?')

    await user.click(screen.getByRole('button', { name: '철회하기' }))

    // 확인창이 뜬 동안에는 아직 아무것도 보내지 않는다.
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('문의를 철회할까요?')).toBeInTheDocument()
    expect(productInquiryCallCounts().withdraw).toBe(0)
    expect(currentProductInquiries()[0]!.status).toBe('RECEIVED')

    await user.click(within(dialog).getByRole('button', { name: '철회하기' }))

    await waitFor(() => expect(currentProductInquiries()[0]!.status).toBe('WITHDRAWN'))
  })

  it('[AC-PINQ-023] 확인창을 취소하면 철회 요청이 나가지 않는다', async () => {
    seedProductInquiries([myRow])
    const user = userEvent.setup()
    renderAt('/mypage/product-inquiries')
    await screen.findByText('배터리로도 쓸 수 있나요?')

    await user.click(screen.getByRole('button', { name: '철회하기' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: '취소' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(productInquiryCallCounts().withdraw).toBe(0)
    expect(currentProductInquiries()[0]!.status).toBe('RECEIVED')
  })

  it('[AC-PINQ-024] 철회 요청이 떠 있는 동안 ESC로 확인창이 닫히지 않는다', async () => {
    seedProductInquiries([myRow])
    const release = holdWithdraw()
    const user = userEvent.setup()
    renderAt('/mypage/product-inquiries')
    await screen.findByText('배터리로도 쓸 수 있나요?')

    await user.click(screen.getByRole('button', { name: '철회하기' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: '철회하기' }))
    await waitFor(() => expect(productInquiryCallCounts().withdraw).toBe(1))

    await user.keyboard('{Escape}')
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    // 스크림 클릭으로도 닫히지 않는다.
    const scrim = document.querySelector('[aria-hidden="true"].absolute.inset-0')
    expect(scrim).not.toBeNull()
    await user.click(scrim as Element)
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    release()
    await waitFor(() => expect(currentProductInquiries()[0]!.status).toBe('WITHDRAWN'))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('[AC-PINQ-025] 답변이 달린 문의에는 철회 버튼이 없다', async () => {
    seedProductInquiries([
      makeProductInquiryRow({
        inquiryId: 'I0000000000000000000000005',
        title: '답변 받은 문의',
        status: 'ANSWERED',
        answer: { content: '네 가능해요.', answeredAt: '2026-10-31T10:00:00' },
      }),
    ])
    renderAt('/mypage/product-inquiries')
    await screen.findByText('답변 받은 문의')

    expect(screen.getByText('네 가능해요.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '철회하기' })).not.toBeInTheDocument()
  })

  it('[AC-PINQ-026] 철회가 서버에 거절되면 사유를 안내하고 화면을 서버 상태로 맞춘다', async () => {
    // 목록을 받은 뒤 다른 경로로 답변이 달린 상태(답변 뒤 철회는 409 120111).
    seedProductInquiries([myRow])
    const user = userEvent.setup()
    renderAt('/mypage/product-inquiries')
    await screen.findByText('배터리로도 쓸 수 있나요?')
    expect(screen.getByText('답변 대기')).toBeInTheDocument()

    // 서버 쪽에서만 답변이 달린 상황을 만든다(화면은 아직 RECEIVED를 들고 있다).
    seedProductInquiries([
      {
        ...myRow,
        status: 'ANSWERED',
        answer: { content: '네 배터리로도 돼요.', answeredAt: '2026-10-31T10:00:00' },
      },
    ])

    await user.click(screen.getByRole('button', { name: '철회하기' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: '철회하기' }))

    expect(await screen.findByText('답변이 달린 문의는 철회할 수 없어요.')).toBeInTheDocument()
    expect(currentProductInquiries()[0]!.status).toBe('ANSWERED')

    // 거절은 "화면이 든 행이 낡았다"는 뜻이다 — 사유만 띄우고 '답변 대기'와 철회 버튼을 그대로
    // 두면 토스트가 사라진 뒤 서버와 반대되는 상태를 읽는다. 실패에도 목록을 다시 받는다.
    expect(await screen.findByText('답변 완료')).toBeInTheDocument()
    expect(screen.getByText('네 배터리로도 돼요.')).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: '철회하기' })).not.toBeInTheDocument(),
    )
  })
})
