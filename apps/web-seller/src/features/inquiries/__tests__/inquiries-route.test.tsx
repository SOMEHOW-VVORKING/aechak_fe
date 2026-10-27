import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter, createMemoryHistory } from '@tanstack/react-router'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  SELLER_INQUIRIES_URL,
  currentInquiries,
  inquiryAnswerCount,
  lastSellerInquiriesQuery,
  makeApplicationWire,
  seedInquiries,
  seedSellerApplication,
  server,
} from '../../../testing/msw/server'
import { routeTree } from '../../../routeTree.gen'

// 실 API 연동 — MSW가 seller 호스트(8081) /sellers/me/inquiries 두 경로를 가로챈다. 모듈 모킹이
// 아니라 네트워크 레벨이라 URL·호스트·envelope·에러 계약까지 함께 검증되고, test-setup의
// onUnhandledRequest:'error'가 핸들러 없는 요청을 곧바로 실패로 만든다.
function renderInquiries() {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/inquiries'] }),
  })
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return router
}

const rowOf = async (text: string) => (await screen.findByText(text)).closest('tr') as HTMLElement

/**
 * 지표 카드의 값. 라벨 글자('답변 대기')가 상태 pill·탭에도 나오므로 지표 영역 안으로 좁혀서
 * 읽는다 — 화면 전체에서 숫자를 세면 엉뚱한 자리의 글자가 걸려 지표가 틀려도 초록으로 지나간다.
 */
function metricValueOf(label: string): string {
  const region = screen.getByRole('region', { name: '문의 지표' })
  const card = within(region).getByText(label).parentElement as HTMLElement
  return within(card).getByText(/^(\d+건|—)$/).textContent ?? ''
}
const inquiryById = (id: string) => currentInquiries().find(row => row.inquiryId === id)!

beforeEach(() => {
  seedInquiries()
  seedSellerApplication(makeApplicationWire({ status: 'APPROVED' }))
})

describe('셀러 고객 문의 목록', () => {
  it('[AC-SELLER-INQUIRY-001] 서버 목록을 상품명·작성자·상태와 함께 보여준다', async () => {
    renderInquiries()

    const row = await rowOf('소형견도 쓸 수 있는 크기인가요?')
    expect(within(row).getByText('자동 급식기 5L')).toBeInTheDocument()
    expect(within(row).getByText('김**')).toBeInTheDocument()
    expect(within(row).getByText('답변 대기')).toBeInTheDocument()
    expect(within(row).getByText('2026-10-26')).toBeInTheDocument()
  })

  it('[AC-SELLER-INQUIRY-002] 지표 3종은 서버가 센 값을 그대로 쓴다', async () => {
    renderInquiries()
    await rowOf('소형견도 쓸 수 있는 크기인가요?')

    // 심어 둔 3건: 미답변 2(그중 기한 지남 1) + 답변 완료 1.
    // 라벨 글자는 지표 카드·상태 pill·탭에 모두 나오므로 카드를 라벨로 좁혀 값을 읽는다.
    expect(metricValueOf('답변 대기')).toBe('2건')
    expect(metricValueOf('답변 기한 지남')).toBe('1건')
    expect(metricValueOf('전체 문의')).toBe('3건')
  })

  it('[AC-SELLER-INQUIRY-002b] 탭을 눌러도 지표는 전체 범위를 유지한다', async () => {
    renderInquiries()
    await rowOf('소형견도 쓸 수 있는 크기인가요?')

    await userEvent.click(screen.getByRole('tab', { name: /답변 완료/ }))
    await waitFor(() =>
      expect(screen.queryByText('소형견도 쓸 수 있는 크기인가요?')).not.toBeInTheDocument(),
    )

    // 목록은 1건으로 줄었지만 지표는 그대로다(서버가 필터를 무시하고 센다).
    expect(metricValueOf('답변 대기')).toBe('2건')
    expect(metricValueOf('전체 문의')).toBe('3건')
  })

  it('[AC-SELLER-INQUIRY-003] 기한 지남은 서버 overdue만 보고 표시한다', async () => {
    // 기한이 지난 날짜인데 서버가 overdue=false로 준 행에는 표시가 붙지 않아야 한다 —
    // 화면이 날짜를 빼서 다시 세면 이 단언이 깨진다(지표와 기준이 갈리는 회귀 가드).
    seedInquiries([
      { ...inquiryById('01INQUIRYA0000000000000001'), overdue: false, answerDueAt: '2020-01-01T23:59:59' },
      { ...inquiryById('01INQUIRYB0000000000000002'), overdue: true },
    ])
    renderInquiries()

    const notOverdue = await rowOf('소형견도 쓸 수 있는 크기인가요?')
    expect(within(notOverdue).queryByText('답변 기한 지남')).toBeNull()
    const overdue = await rowOf('제주도 추가 배송비가 따로 붙나요?')
    expect(within(overdue).getByText('답변 기한 지남')).toBeInTheDocument()
  })

  it('[AC-SELLER-INQUIRY-004] 상태 탭과 유형 필터가 서버 파라미터로 나가고 빈 값은 보내지 않는다', async () => {
    renderInquiries()
    await rowOf('소형견도 쓸 수 있는 크기인가요?')

    // 첫 조회는 '전체' 탭 + 빈 유형 + 빈 검색어 — 그 셋이 키째 빠져 page만 남는다.
    expect(lastSellerInquiriesQuery()).toBe('page=0')

    await userEvent.click(screen.getByRole('tab', { name: /답변 완료/ }))
    await waitFor(() => expect(lastSellerInquiriesQuery()).toBe('status=ANSWERED&page=0'))
    // 답변 완료 탭에는 답변이 달린 한 건만 남는다.
    await waitFor(() =>
      expect(screen.queryByText('소형견도 쓸 수 있는 크기인가요?')).not.toBeInTheDocument(),
    )
    expect(screen.getByText('동결건조 간식 유통기한이 언제까지인가요?')).toBeInTheDocument()
  })

  it('[AC-SELLER-INQUIRY-005] 검색어는 상품명에도 걸린다', async () => {
    renderInquiries()
    await rowOf('소형견도 쓸 수 있는 크기인가요?')

    await userEvent.type(screen.getByLabelText('문의 검색'), '캣타워')

    await waitFor(() =>
      expect(screen.queryByText('소형견도 쓸 수 있는 크기인가요?')).not.toBeInTheDocument(),
    )
    expect(screen.getByText('제주도 추가 배송비가 따로 붙나요?')).toBeInTheDocument()
    expect(lastSellerInquiriesQuery()).toBe('keyword=%EC%BA%A3%ED%83%80%EC%9B%8C&page=0')
  })

  it('[AC-SELLER-INQUIRY-006] 목록 조회 실패는 빈 상태가 아니라 오류 안내로 드러난다', async () => {
    server.use(
      http.get(SELLER_INQUIRIES_URL, () =>
        HttpResponse.json(
          { errorCode: 120112, message: '활성 셀러만 문의를 읽고 답변할 수 있습니다.' },
          { status: 403 },
        ),
      ),
    )
    renderInquiries()

    expect(
      await screen.findByText('지금 계정 상태로는 답변을 보낼 수 없어요.'),
    ).toBeInTheDocument()
    expect(screen.getByText('목록을 불러오지 못했어요.')).toBeInTheDocument()
    // 불러오지 못한 동안 지표는 0건이 아니라 —다(0건은 사실 주장이다).
    expect(metricValueOf('답변 대기')).toBe('—')
    expect(metricValueOf('전체 문의')).toBe('—')
  })
})

describe('셀러 문의 답변', () => {
  it('[AC-SELLER-INQUIRY-007] 답변을 보내면 서버에 저장되고 상태가 답변 완료로 바뀐다', async () => {
    renderInquiries()

    await userEvent.click(await rowOf('소형견도 쓸 수 있는 크기인가요?'))
    const drawer = await screen.findByRole('dialog')
    await userEvent.type(within(drawer).getByLabelText('답변'), '입구까지 높이는 12cm예요.')
    await userEvent.click(within(drawer).getByRole('button', { name: '답변 보내기' }))

    expect(await screen.findByText('답변을 보냈어요.')).toBeInTheDocument()
    expect(inquiryAnswerCount()).toBe(1)
    const stored = inquiryById('01INQUIRYA0000000000000001')
    expect(stored.answer?.content).toBe('입구까지 높이는 12cm예요.')
    expect(stored.status).toBe('ANSWERED')
    // 무효화로 돌아온 목록에 반영된다 — 같은 행의 상태 pill이 바뀐다.
    const row = await rowOf('소형견도 쓸 수 있는 크기인가요?')
    await waitFor(() => expect(within(row).getByText('답변 완료')).toBeInTheDocument())
  })

  it('[AC-SELLER-INQUIRY-008] 이미 답변한 문의는 입력칸 대신 보낸 답변을 보여주고 수정 버튼이 없다', async () => {
    renderInquiries()

    await userEvent.click(await rowOf('동결건조 간식 유통기한이 언제까지인가요?'))
    const drawer = await screen.findByRole('dialog')

    expect(within(drawer).getByText('2027년 4월 30일까지예요.')).toBeInTheDocument()
    expect(within(drawer).queryByLabelText('답변')).toBeNull()
    expect(within(drawer).queryByRole('button', { name: '답변 보내기' })).toBeNull()
    expect(within(drawer).queryByRole('button', { name: '답변 수정' })).toBeNull()
    expect(inquiryAnswerCount()).toBe(0)
  })

  it('[AC-SELLER-INQUIRY-009] 비밀글은 본문이 내려오고 비밀글 표시가 붙는다', async () => {
    renderInquiries()

    const row = await rowOf('동결건조 간식 유통기한이 언제까지인가요?')
    expect(within(row).getByText('비밀글')).toBeInTheDocument()

    await userEvent.click(row)
    const drawer = await screen.findByRole('dialog')
    expect(within(drawer).getByText('지금 발송되는 물건의 유통기한을 알고 싶어요.')).toBeInTheDocument()
  })

  it('[AC-SELLER-INQUIRY-010] 다른 작업자가 먼저 답했으면 Drawer가 닫히지 않고 그 자리에서 알린다', async () => {
    server.use(
      http.post(`${SELLER_INQUIRIES_URL}/:inquiryId/answer`, () =>
        HttpResponse.json(
          { errorCode: 120109, message: '이미 답변이 등록된 문의입니다.' },
          { status: 409 },
        ),
      ),
    )
    renderInquiries()

    await userEvent.click(await rowOf('소형견도 쓸 수 있는 크기인가요?'))
    const drawer = await screen.findByRole('dialog')
    await userEvent.type(within(drawer).getByLabelText('답변'), '늦었지만 답변이에요.')
    await userEvent.click(within(drawer).getByRole('button', { name: '답변 보내기' }))

    expect(
      await within(drawer).findByText('이미 답변한 문의예요. 목록을 새로 불러와 주세요.'),
    ).toBeInTheDocument()
    // 창은 열린 채로 남는다 — 적은 답변을 잃지 않는다.
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(inquiryById('01INQUIRYA0000000000000001').answer).toBeNull()
  })

  it('[AC-SELLER-INQUIRY-011] 빈 답변으로는 전송 버튼이 눌리지 않는다', async () => {
    renderInquiries()

    await userEvent.click(await rowOf('소형견도 쓸 수 있는 크기인가요?'))
    const drawer = await screen.findByRole('dialog')

    expect(within(drawer).getByRole('button', { name: '답변 보내기' })).toBeDisabled()
    await userEvent.type(within(drawer).getByLabelText('답변'), '   ')
    expect(within(drawer).getByRole('button', { name: '답변 보내기' })).toBeDisabled()
    expect(inquiryAnswerCount()).toBe(0)
  })
})
